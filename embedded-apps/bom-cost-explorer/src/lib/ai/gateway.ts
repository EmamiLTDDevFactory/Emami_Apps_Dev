/**
 * Claude gateway (browser; the person's own key - lib/ai/config.ts). Two entry points:
 *   answerFromFacts  one JSON answer written only from FACTS; validated by the numbers rule; on failure ONE
 *                    regeneration with the list of errors; on a second failure the deterministic template (template=true)
 *   runToolLoop      the assistant's tool-use loop with streamed text, read-only tools, a tool-call limit and a timeout
 * Static system prompts and tool definitions carry cache_control (prompt caching). Every call goes through the rate
 * limit and is written to the local audit.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AI_MAX_TOOL_CALLS, AI_TIMEOUT_MS } from './config';
import { audit, checkRateLimit } from './guard';
import { errorsForModel, parseAnswer, validateAnswer, type AiAnswer } from './validate';
import type { Fact } from './facts';

export function makeClient(apiKey: string) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: AI_TIMEOUT_MS });
}

export interface FactsAnswer { answer: AiAnswer; template: boolean; validatorOk: boolean; attempts: number; usage: { input: number; output: number }; error?: string }

const textOf = (m: Anthropic.Message) => m.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n');

export async function answerFromFacts(o: {
  client: Anthropic; model: string; system: string; facts: Fact[]; task: string; template: () => AiAnswer;
  ignore?: string[]; feature: string; user: string; question: string; sapSystem: string; maxTokens?: number;
}): Promise<FactsAnswer> {
  const t0 = Date.now();
  const usage = { input: 0, output: 0 };
  const factsJson = JSON.stringify(o.facts.map(({ id, label, value, display, unit }) => ({ id, label, value, display, unit })));
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: [{ type: 'text', text: `FACTS:\n${factsJson}` }, { type: 'text', text: o.task }] }];
  let attempts = 0;
  let lastError = '';
  const finish = (r: FactsAnswer) => {
    audit({ ts: new Date().toISOString(), user: o.user, feature: o.feature, question: o.question, tools: [], inputTokens: usage.input, outputTokens: usage.output, validatorOk: r.validatorOk, templateUsed: r.template, ms: Date.now() - t0, model: o.model, system: o.sapSystem });
    return r;
  };
  try {
    for (attempts = 1; attempts <= 2; attempts++) {
      checkRateLimit();
      const msg = await o.client.messages.create({
        model: o.model,
        max_tokens: o.maxTokens ?? 4000,
        system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
        messages,
      });
      usage.input += msg.usage.input_tokens; usage.output += msg.usage.output_tokens;
      if (msg.stop_reason === 'refusal') break;
      const raw = textOf(msg);
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

/* ---------- tool-use loop (assistant) ---------- */

export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }
export type LoopEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; name: string; input: unknown }
  | { type: 'tool_end'; name: string; input: unknown; ms: number; error?: string };

export interface LoopResult { text: string; usage: { input: number; output: number }; tools: { name: string; input: unknown; ms: number }[]; stopped?: 'limit' | 'timeout' | 'refusal' }

export async function runToolLoop(o: {
  client: Anthropic; model: string; system: string[]; tools: ToolDef[]; history: Anthropic.MessageParam[];
  runTool: (name: string, input: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
  onEvent?: (e: LoopEvent) => void; maxToolCalls?: number; timeoutMs?: number; signal?: AbortSignal;
}): Promise<LoopResult> {
  const t0 = Date.now();
  const usage = { input: 0, output: 0 };
  const log: LoopResult['tools'] = [];
  const limit = o.maxToolCalls ?? AI_MAX_TOOL_CALLS;
  const timeout = o.timeoutMs ?? AI_TIMEOUT_MS;
  const tools = o.tools.map((t, i) => ({ ...t, eager_input_streaming: true, ...(i === o.tools.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}) }));
  const system = o.system.map((text, i) => ({ type: 'text' as const, text, ...(i === 0 ? { cache_control: { type: 'ephemeral' as const } } : {}) }));
  let calls = 0;
  for (;;) {
    if (Date.now() - t0 > timeout) return { text: '', usage, tools: log, stopped: 'timeout' };
    checkRateLimit();
    const stream = o.client.messages.stream({ model: o.model, max_tokens: 8000, thinking: { type: 'adaptive' }, system, tools: tools as unknown as Anthropic.Tool[], messages: o.history } as Anthropic.MessageStreamParams, { signal: o.signal });
    stream.on('text', (d) => o.onEvent?.({ type: 'text', delta: d }));
    const msg = await stream.finalMessage();
    usage.input += msg.usage.input_tokens; usage.output += msg.usage.output_tokens;
    o.history.push({ role: 'assistant', content: msg.content as Anthropic.ContentBlockParam[] });
    if (msg.stop_reason === 'refusal') return { text: '', usage, tools: log, stopped: 'refusal' };
    if (msg.stop_reason === 'max_tokens') return { text: textOf(msg), usage, tools: log };
    if (msg.stop_reason === 'pause_turn') continue;
    const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (msg.stop_reason !== 'tool_use' || !uses.length) return { text: textOf(msg), usage, tools: log };
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      calls++;
      if (calls > limit) {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify({ error: `Tool-call limit (${limit}) reached. Answer with what you have.` }), is_error: true });
        continue;
      }
      const s = Date.now();
      o.onEvent?.({ type: 'tool_start', name: u.name, input: u.input });
      let r: { content: string; isError?: boolean };
      try {
        r = await o.runTool(u.name, (u.input ?? {}) as Record<string, unknown>);
      } catch (e) {
        r = { content: JSON.stringify({ error: e instanceof Error ? e.message : 'Tool failed' }), isError: true };
      }
      log.push({ name: u.name, input: u.input, ms: Date.now() - s });
      o.onEvent?.({ type: 'tool_end', name: u.name, input: u.input, ms: Date.now() - s, ...(r.isError ? { error: r.content.slice(0, 300) } : {}) });
      results.push({ type: 'tool_result', tool_use_id: u.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    o.history.push({ role: 'user', content: results });
    if (calls > limit + 2) return { text: '', usage, tools: log, stopped: 'limit' };
  }
}

/** Friendly text for an API failure (bad key, rate limit, network). */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'The Claude API key was not accepted. Check it on the AI settings screen.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'This Claude API key is not allowed to use the model.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude is busy (rate limit). Wait a moment and try again.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Claude. Check the network and try again.';
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status ?? 'unknown'}).`;
  return e instanceof Error ? e.message : 'Something went wrong.';
}
