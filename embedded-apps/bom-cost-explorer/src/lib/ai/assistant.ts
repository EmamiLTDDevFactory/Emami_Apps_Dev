/**
 * Ask-the-costing assistant: one question through the tool-use loop (lib/ai/gateway.ts) with the read-only tools
 * (lib/ai/tools/registry.ts). The final answer must be JSON whose every number cites a fact from the tool results
 * (numbers rule); one regeneration with the errors, then a deterministic template from the facts the tools returned.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_OUTPUT, ASSISTANT_SYSTEM } from './prompts/assistant';
import { runToolLoop, type LoopEvent } from './gateway';
import { parseAnswer, validateAnswer, errorsForModel, type AiAnswer } from './validate';
import { FactBook } from './facts';
import { VendorMask, audit } from './guard';
import { TOOL_DEFS, runAiTool, type ToolContext } from './tools/registry';
import type { CostQuery } from '../query/schema';
import type { CostResult } from '../client/api';

export interface Conversation { history: Anthropic.MessageParam[]; book: FactBook; mask: VendorMask }
export const newConversation = (): Conversation => ({ history: [], book: new FactBook(), mask: new VendorMask() });

export interface AskResult { answer: AiAnswer; template: boolean; validatorOk: boolean; tools: { name: string; input: unknown; ms: number }[]; usage: { input: number; output: number }; error?: string; newFactIds: string[] }

export async function ask(o: {
  client: Anthropic; model: string; conv: Conversation; question: string; system: string; user: string;
  current?: { query: CostQuery; result: CostResult } | null;
  confirm: ToolContext['confirm']; onEvent?: (e: LoopEvent) => void; signal?: AbortSignal;
}): Promise<AskResult> {
  const t0 = Date.now();
  const before = o.conv.book.size;
  const ctx: ToolContext = { book: o.conv.book, mask: o.conv.mask, system: o.system, confirm: o.confirm, current: o.current, sapRuns: 0 };
  const cur = o.current?.query;
  const context = `SAP system: ${o.system}. Today: ${new Date().toDateString()}.${cur ? ` On screen: result_id "current" = ${cur.mode === 'B' ? 'BOM costing' : cur.mode} of ${cur.materials.join(', ') || 'all FGs of the plant'} in plant ${cur.plants.join(', ')}, qty ${cur.explQty}, priority ${cur.prio.join(' > ')}, look-back ${cur.lookback} days, donor ${cur.donorPlant || 'none'}, freight ${cur.inclFrt ? (cur.stdFrt ? 'standard' : 'actual') : 'excluded'}.` : ' No costing result on screen.'}`;
  o.conv.history.push({ role: 'user', content: o.question });
  const tools: AskResult['tools'] = [];
  const usage = { input: 0, output: 0 };
  const runTool = async (name: string, input: Record<string, unknown>) => {
    const out = await runAiTool(name, input, ctx);
    return { content: JSON.stringify(out) };
  };
  const finish = (r: Omit<AskResult, 'tools' | 'usage' | 'newFactIds'>): AskResult => {
    const res = { ...r, tools, usage, newFactIds: o.conv.book.list().slice(before).map((f) => f.id) };
    audit({ ts: new Date().toISOString(), user: o.user, feature: 'assistant', question: o.question, tools: tools.map((t) => ({ name: t.name, input: t.input, ms: t.ms })), inputTokens: usage.input, outputTokens: usage.output, validatorOk: r.validatorOk, templateUsed: r.template, ms: Date.now() - t0, model: o.model, system: o.system });
    return res;
  };
  const template = (): AiAnswer => {
    const facts = o.conv.book.list().slice(before);
    if (!facts.length) return { paragraphs: [{ text: 'I could not get an answer from the tools for this question.', facts: [] }] };
    return { paragraphs: [{ text: 'Here is what the tools returned:', facts: [] }, ...facts.slice(0, 20).map((f) => ({ text: `${f.label}: ${f.display}${f.unit ? ` ${f.unit}` : ''} [${f.id}]`, facts: [f.id] }))] };
  };
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await runToolLoop({ client: o.client, model: o.model, system: [ASSISTANT_SYSTEM, ASSISTANT_OUTPUT, context], tools: TOOL_DEFS, history: o.conv.history, runTool, onEvent: o.onEvent, signal: o.signal });
      tools.push(...r.tools); usage.input += r.usage.input; usage.output += r.usage.output;
      if (r.stopped === 'refusal') return finish({ answer: { paragraphs: [{ text: 'I cannot help with that request.', facts: [] }] }, template: false, validatorOk: true });
      if (r.stopped) return finish({ answer: template(), template: true, validatorOk: false, error: r.stopped === 'timeout' ? 'The question took too long; showing what the tools returned.' : 'Too many tool calls; showing what the tools returned.' });
      const parsed = parseAnswer(r.text);
      if (parsed) {
        const v = validateAnswer(parsed, o.conv.book.list());
        if (v.ok) return finish({ answer: parsed, template: false, validatorOk: true });
        if (attempt === 1) { o.conv.history.push({ role: 'user', content: `Your answer broke the numbers rule:\n${errorsForModel(v.errors)}\nAnswer again as JSON. Every number must be a fact value from the tool results with its fact id.` }); continue; }
      } else if (attempt === 1) {
        // a clarifying question in plain text is fine when it has no numbers
        const plain = { paragraphs: [{ text: r.text, facts: [] }] };
        if (r.text.trim() && validateAnswer(plain, o.conv.book.list()).ok) return finish({ answer: plain, template: false, validatorOk: true });
        o.conv.history.push({ role: 'user', content: 'Answer again as the required JSON only.' });
        continue;
      }
    }
    return finish({ answer: template(), template: true, validatorOk: false, error: 'The AI answer did not pass the numbers check; showing what the tools returned.' });
  } catch (e) {
    const { describeError } = await import('./gateway');
    return finish({ answer: template(), template: true, validatorOk: false, error: describeError(e) });
  }
}
