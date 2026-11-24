/**
 * Groq gateway. The API is OpenAI compatible (POST {base}/chat/completions), called from the browser with the key typed in
 * the AI settings, or through the hub backend proxy (NEXT_PUBLIC_AI_BASE_URL) that holds the key on the server (lib/ai/config.ts).
 * Two entry points:
 *   answerFromFacts  one JSON answer written only from FACTS; validated by the numbers rule; on failure ONE regeneration with the
 *                    list of errors; on a second failure the deterministic template (template=true)
 *   runToolLoop      the assistant's tool loop with streamed text, READ-ONLY tools, a tool-call limit and a timeout
 * Every call goes through the rate limit and is written to the local audit. Nothing here can write to SAP: the model only ever
 * gets the read-only tools of lib/ai/tools/registry.ts (tests/unit/ai-readonly.test.ts keeps it that way).
 */
import { AI_BASE_URL, AI_MAX_TOOL_CALLS, AI_TIMEOUT_MS } from './config';
import { audit, checkRateLimit } from './guard';
import { errorsForModel, parseAnswer, validateAnswer, type AiAnswer } from './validate';
import type { Fact } from './facts';

export interface ToolCall { id: string; name: string; arguments: string }
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }

export interface ChatRequest { model: string; messages: ChatMessage[]; max_tokens?: number; temperature?: number; tools?: ToolDef[] }
export interface ChatResult { content: string; toolCalls: ToolCall[]; finish: string; usage: { input: number; output: number } }

export class AiHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface AiClient {
  chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult>;
  stream(req: ChatRequest, onText: (delta: string) => void, signal?: AbortSignal): Promise<ChatResult>;
}

const body = (r: ChatRequest, stream: boolean) => JSON.stringify({
  model: r.model, messages: r.messages, max_tokens: r.max_tokens ?? 4000, temperature: r.temperature ?? 0.2, stream,
  ...(r.tools?.length ? { tools: r.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })), tool_choice: 'auto' } : {}),
});

export function makeClient(apiKey: string, baseUrl: string = AI_BASE_URL, timeoutMs: number = AI_TIMEOUT_MS): AiClient {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers = (): Record<string, string> => ({ 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) });
  const guard = (signal?: AbortSignal) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    signal?.addEventListener('abort', () => c.abort(), { once: true });
    return { signal: c.signal, done: () => clearTimeout(t) };
  };
  const fail = async (r: Response) => {
    let msg = '';
    try { const j = await r.json(); msg = j?.error?.message ?? j?.error ?? j?.message ?? ''; } catch { /* not json */ }
    throw new AiHttpError(r.status, typeof msg === 'string' ? msg : JSON.stringify(msg));
  };
  return {
    async chat(req, signal) {
      const g = guard(signal);
      try {
        const r = await fetch(url, { method: 'POST', headers: headers(), body: body(req, false), signal: g.signal });
        if (!r.ok) await fail(r);
        const j = await r.json();
        const m = j?.choices?.[0]?.message ?? {};
        return {
          content: String(m.content ?? ''), finish: String(j?.choices?.[0]?.finish_reason ?? ''),
          toolCalls: (m.tool_calls ?? []).map((t: { id: string; function: { name: string; arguments: string } }) => ({ id: t.id, name: t.function?.name, arguments: t.function?.arguments ?? '{}' })),
          usage: { input: j?.usage?.prompt_tokens ?? 0, output: j?.usage?.completion_tokens ?? 0 },
        };
      } finally { g.done(); }
    },
    async stream(req, onText, signal) {
      const g = guard(signal);
      try {
        const r = await fetch(url, { method: 'POST', headers: headers(), body: body(req, true), signal: g.signal });
        if (!r.ok) await fail(r);
        if (!r.body) throw new AiHttpError(502, 'The AI service sent no stream.');
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '', content = '', finish = '';
        const calls = new Map<number, ToolCall>();
        const usage = { input: 0, output: 0 };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            let j: { choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } } };
            try { j = JSON.parse(data); } catch { continue; }
            const ch = j.choices?.[0];
            if (ch?.delta?.content) { content += ch.delta.content; onText(ch.delta.content); }
            for (const t of ch?.delta?.tool_calls ?? []) {
              const c = calls.get(t.index) ?? { id: '', name: '', arguments: '' };
              if (t.id) c.id = t.id;
              if (t.function?.name) c.name += t.function.name;
              if (t.function?.arguments) c.arguments += t.function.arguments;
              calls.set(t.index, c);
            }
            if (ch?.finish_reason) finish = ch.finish_reason;
            const u = j.usage ?? j.x_groq?.usage; // Groq sends the usage of a stream in x_groq of the last chunk
            if (u) { usage.input = u.prompt_tokens ?? usage.input; usage.output = u.completion_tokens ?? usage.output; }
          }
        }
        return { content, finish, toolCalls: [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c], i) => ({ ...c, id: c.id || `call_${i}` })), usage };
      } finally { g.done(); }
    },
  };
}

export interface FactsAnswer { answer: AiAnswer; template: boolean; validatorOk: boolean; attempts: number; usage: { input: number; output: number }; error?: string }

export async function answerFromFacts(o: {
  client: AiClient; model: string; system: string; facts: Fact[]; task: string; template: () => AiAnswer;
  ignore?: string[]; feature: string; user: string; question: string; sapSystem: string; maxTokens?: number;
}): Promise<FactsAnswer> {
  const t0 = Date.now();
  const usage = { input: 0, output: 0 };
  const factsJson = JSON.stringify(o.facts.map(({ id, label, value, display, unit }) => ({ id, label, value, display, unit })));
  const messages: ChatMessage[] = [{ role: 'system', content: o.system }, { role: 'user', content: `FACTS:\n${factsJson}\n\n${o.task}` }];
  let attempts = 0;
  let lastError = '';
  const finish = (r: FactsAnswer) => {
    audit({ ts: new Date().toISOString(), user: o.user, feature: o.feature, question: o.question, tools: [], inputTokens: usage.input, outputTokens: usage.output, validatorOk: r.validatorOk, templateUsed: r.template, ms: Date.now() - t0, sapSystem: o.sapSystem } as never);
    return r;
  };
  try {
    for (attempts = 1; attempts <= 2; attempts++) {
      checkRateLimit();
      const res = await o.client.chat({ model: o.model, max_tokens: o.maxTokens ?? 4000, messages });
      usage.input += res.usage.input; usage.output += res.usage.output;
      if (res.finish === 'content_filter') break;
      const raw = res.content;
      const parsed = parseAnswer(raw);
      if (parsed) {
        const v = validateAnswer(parsed, o.facts, o.ignore);
        if (v.ok) return finish({ answer: parsed, template: false, validatorOk: true, attempts, usage });
        lastError = errorsForModel(v.errors);
      } else {
        lastError = '- the answer was not the required JSON';
      }
      messages.push({ role: 'assistant', content: raw || '(empty)' });
      messages.push({ role: 'user', content: `Your answer broke the rules:\n${lastError}\nWrite it again. Every number must be exactly a fact's value or display and carry that fact's id. Return only the JSON.` });
    }
  } catch (e) {
    return finish({ answer: o.template(), template: true, validatorOk: false, attempts, usage, error: describeError(e) });
  }
  return finish({ answer: o.template(), template: true, validatorOk: false, attempts: attempts - 1, usage, error: lastError ? 'The AI answer did not pass the numbers check; showing the template.' : undefined });
}

/* ---------- tool loop (assistant) ---------- */

export type LoopEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; name: string; input: unknown }
  | { type: 'tool_end'; name: string; input: unknown; ms: number; error?: string };

export interface LoopResult { text: string; usage: { input: number; output: number }; tools: { name: string; input: unknown; ms: number }[]; stopped?: 'limit' | 'timeout' | 'refusal' }

const parseArgs = (s: string): Record<string, unknown> => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

export async function runToolLoop(o: {
  client: AiClient; model: string; system: string[]; tools: ToolDef[]; history: ChatMessage[];
  runTool: (name: string, input: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
  onEvent?: (e: LoopEvent) => void; maxToolCalls?: number; timeoutMs?: number; signal?: AbortSignal;
}): Promise<LoopResult> {
  const t0 = Date.now();
  const usage = { input: 0, output: 0 };
  const log: LoopResult['tools'] = [];
  const limit = o.maxToolCalls ?? AI_MAX_TOOL_CALLS;
  const timeout = o.timeoutMs ?? AI_TIMEOUT_MS;
  const sys: ChatMessage[] = o.system.map((content) => ({ role: 'system' as const, content }));
  let calls = 0;
  for (;;) {
    if (Date.now() - t0 > timeout) return { text: '', usage, tools: log, stopped: 'timeout' };
    checkRateLimit();
    const res = await o.client.stream({ model: o.model, max_tokens: 8000, messages: [...sys, ...o.history], tools: o.tools }, (d) => o.onEvent?.({ type: 'text', delta: d }), o.signal);
    usage.input += res.usage.input; usage.output += res.usage.output;
    o.history.push({ role: 'assistant', content: res.content || null, ...(res.toolCalls.length ? { tool_calls: res.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })) } : {}) });
    if (res.finish === 'content_filter') return { text: '', usage, tools: log, stopped: 'refusal' };
    if (!res.toolCalls.length) return { text: res.content, usage, tools: log };
    for (const u of res.toolCalls) {
      calls++;
      if (calls > limit) {
        o.history.push({ role: 'tool', tool_call_id: u.id, content: JSON.stringify({ error: `Tool-call limit (${limit}) reached. Answer with what you have.` }) });
        continue;
      }
      const input = parseArgs(u.arguments);
      const s = Date.now();
      o.onEvent?.({ type: 'tool_start', name: u.name, input });
      let r: { content: string; isError?: boolean };
      try {
        r = await o.runTool(u.name, input);
      } catch (e) {
        r = { content: JSON.stringify({ error: e instanceof Error ? e.message : 'Tool failed' }), isError: true };
      }
      log.push({ name: u.name, input, ms: Date.now() - s });
      o.onEvent?.({ type: 'tool_end', name: u.name, input, ms: Date.now() - s, ...(r.isError ? { error: r.content.slice(0, 300) } : {}) });
      o.history.push({ role: 'tool', tool_call_id: u.id, content: r.content });
    }
    if (calls > limit + 2) return { text: '', usage, tools: log, stopped: 'limit' };
  }
}

/** Friendly text for an API failure (bad key, rate limit, network). */
export function describeError(e: unknown): string {
  if (e instanceof AiHttpError) {
    if (e.status === 401) return 'The Groq API key was not accepted. Check it on the AI settings screen.';
    if (e.status === 403) return 'This Groq API key is not allowed to use the model.';
    if (e.status === 404) return 'The model name was not found. Check the models on the AI settings screen.';
    if (e.status === 429) return 'Groq is busy (rate limit). Wait a moment and try again.';
    return `Groq returned an error (${e.status}${e.message ? `: ${e.message.slice(0, 120)}` : ''}).`;
  }
  if (e instanceof DOMException && e.name === 'AbortError') return 'The AI request was cancelled or took too long.';
  if (e instanceof TypeError) return 'Could not reach Groq. Check the network (or the AI proxy address) and try again.';
  return e instanceof Error ? e.message : 'Something went wrong.';
}
