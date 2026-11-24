import { beforeEach, describe, expect, it } from 'vitest';
import type { AiClient, ChatResult } from '@/lib/ai/gateway';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { FactBook } from '@/lib/ai/facts';
import { VendorMask, checkRateLimit, resetRateLimit, RateLimitError } from '@/lib/ai/guard';
import { ROW_CAP, clearAiResults, runAiTool, type ToolContext } from '@/lib/ai/tools/registry';
import { ask, newConversation } from '@/lib/ai/assistant';
import { answerFromFacts } from '@/lib/ai/gateway';
import { AI_ENABLED } from '@/lib/ai/config';
import { api } from '@/lib/client/api';
import { defaultQuery } from '@/lib/query/schema';

beforeEach(() => { process.env.MOCK_SAP = 'true'; process.env.MOCK_SAP_DELAY_MS = '0'; resetSapConfig(); mockRequestLog.length = 0; clearAiResults(); resetRateLimit(); });
const set = (u: string) => u.split('?')[0].split('/').pop();
const ctx = (o: Partial<ToolContext> = {}): ToolContext => ({ book: new FactBook(), mask: new VendorMask(true), system: 'NGD', confirm: async () => true, current: null, sapRuns: 0, ...o });
const q = () => ({ ...defaultQuery('B'), materials: ['FG1001'], plants: ['1000'] });

/** Scripted mock model: each call returns the next message. */
function mockClient(script: Partial<ChatResult>[]): AiClient {
  const next = (): ChatResult => ({ content: '', toolCalls: [], finish: 'stop', usage: { input: 10, output: 5 }, ...script.shift() });
  return { chat: async () => next(), stream: async () => next() };
}
const text = (t: string): Partial<ChatResult> => ({ content: t });
const tool = (name: string, input: unknown): Partial<ChatResult> => ({ finish: 'tool_calls', toolCalls: [{ id: `t${Math.random()}`, name, arguments: JSON.stringify(input) }] });

describe('AI flag', () => {
  it('AI is off by default (no button, no request, no AI code loaded)', () => expect(AI_ENABLED).toBe(false));
});

describe('tools (mock SAP)', () => {
  it('run_costing asks for confirmation and runs exactly one CostLineSet call', async () => {
    let asked = 0;
    const c = ctx({ confirm: async () => { asked++; return true; } });
    const out = await runAiTool('run_costing', { matnr: ['FG1001'], werks: '1000' }, c);
    expect(asked).toBe(1);
    expect(mockRequestLog.map(set)).toEqual(['CostLineSet']);
    expect(out.result_id).toBeTruthy();
    expect((out.facts ?? []).length).toBeGreaterThan(0);
    for (const u of mockRequestLog) expect(u).not.toContain('+');
  });
  it('declined confirmation: nothing is run', async () => {
    const out = await runAiTool('run_costing', { matnr: ['FG1001'], werks: '1000' }, ctx({ confirm: async () => false }));
    expect(out.summary).toContain('declined');
    expect(mockRequestLog).toHaveLength(0);
  });
  it('an identical recent run is reused without asking again', async () => {
    let asked = 0;
    const c = ctx({ confirm: async () => { asked++; return true; } });
    await runAiTool('run_costing', { matnr: ['FG1001'], werks: '1000' }, c);
    await runAiTool('run_costing', { matnr: ['FG1001'], werks: '1000' }, c);
    expect(asked).toBe(1);
    expect(mockRequestLog.filter((u) => set(u) === 'CostLineSet')).toHaveLength(1);
  });
  it('the on-screen run is used as result "current" without a SAP call', async () => {
    const result = await api.cost(q());
    mockRequestLog.length = 0;
    const out = await runAiTool('get_result_summary', { result_id: 'current' }, ctx({ current: { query: q(), result } }));
    expect(mockRequestLog).toHaveLength(0);
    expect(out.summary).toContain('FG');
    expect(out.settings).toMatchObject({ system: 'NGD' });
  });
  it('at most 2 SAP runs per question', async () => {
    const c = ctx();
    await runAiTool('run_costing', { matnr: ['FG1001'], werks: '1000' }, c);
    await runAiTool('run_costing', { matnr: ['FG1002'], werks: '1000' }, c);
    const third = await runAiTool('run_costing', { matnr: ['FG2001'], werks: '1000' }, c);
    expect(third.summary).toContain('Limit');
  });
  it('rows are capped at 50 and every row value with a number is a fact id', async () => {
    const result = await api.cost({ ...defaultQuery('B'), plants: ['1000'] }); // plant run: many lines
    const out = await runAiTool('find_components', { result_id: 'current', filter: 'min_cost', value: '0' }, ctx({ current: { query: { ...defaultQuery('B'), plants: ['1000'] }, result } }));
    expect((out.rows ?? []).length).toBeLessThanOrEqual(ROW_CAP);
    for (const r of out.rows as { cost_per_pc: string }[]) expect(r.cost_per_pc).toMatch(/^\[F\d+\]$/);
  });
  it('run_scenario simulates in the browser (no SAP call) and returns facts', async () => {
    const result = await api.cost(q());
    mockRequestLog.length = 0;
    const out = await runAiTool('run_scenario', { result_id: 'current', rate_pct_by_source: { CONTRACT: 10 } }, ctx({ current: { query: q(), result } }));
    expect(mockRequestLog).toHaveLength(0);
    expect(out.summary).toContain('not an SAP figure');
    expect((out.facts ?? []).length).toBeGreaterThan(1);
  });
  it('explain_change against budget returns totals and effects as facts', async () => {
    const result = await api.cost({ ...q(), inclBudget: true, budgetYr: 2026 });
    const out = await runAiTool('explain_change', { current: 'current', baseline: 'budget' }, ctx({ current: { query: { ...q(), inclBudget: true, budgetYr: 2026 }, result } }));
    expect(out.totals).toBeTruthy();
  });
  it('invalid tool input is refused with the reason', async () => {
    await expect(runAiTool('run_costing', { werks: '1000' }, ctx())).rejects.toThrow(/matnr/);
  });
  it('vendor names are masked V1, V2 and stable', () => {
    const m = new VendorMask(true);
    expect([m.mask('Acme'), m.mask('Beta'), m.mask('Acme')]).toEqual(['V1', 'V2', 'V1']);
    expect(m.unmask('V1 and V2')).toBe('Acme and Beta');
  });
  it('rate limit per minute', () => {
    for (let i = 0; i < 3; i++) checkRateLimit(1000 + i, 3);
    expect(() => checkRateLimit(1004, 3)).toThrow(RateLimitError);
    expect(() => checkRateLimit(70000, 3)).not.toThrow();
  });
});

describe('assistant with a mock model', () => {
  const current = async () => ({ query: q(), result: await api.cost(q()) });
  it('valid JSON with fact ids passes the numbers rule', async () => {
    const conv = newConversation();
    const cur = await current();
    const client = mockClient([tool('get_result_summary', { result_id: 'current' }), text('{"paragraphs":[{"text":"Summary ready.","facts":[]}]}')]);
    const r = await ask({ client, model: 'm', conv, question: 'summary?', system: 'NGD', user: 'u', current: cur, confirm: async () => true });
    expect(r.template).toBe(false);
    expect(r.tools.map((t) => t.name)).toEqual(['get_result_summary']);
  });
  it('a number without a fact id twice -> template from the tool facts', async () => {
    const conv = newConversation();
    const client = mockClient([tool('get_result_summary', { result_id: 'current' }), text('{"paragraphs":[{"text":"It costs 99.99 INR."}]}'), text('{"paragraphs":[{"text":"Still 99.99 INR."}]}')]);
    const r = await ask({ client, model: 'm', conv, question: 'cost?', system: 'NGD', user: 'u', current: await current(), confirm: async () => true });
    expect(r.template).toBe(true);
    expect(r.answer.paragraphs[0].text).toContain('what the tools returned');
  });
  it('invalid JSON then valid JSON: regenerated once', async () => {
    const conv = newConversation();
    const client = mockClient([text('{not json with 12.5'), text('{"paragraphs":[{"text":"No numbers here.","facts":[]}]}')]);
    const r = await ask({ client, model: 'm', conv, question: 'hi', system: 'NGD', user: 'u', current: null, confirm: async () => true });
    expect(r.template).toBe(false);
  });
  it('tool-call limit stops the loop', async () => {
    const conv = newConversation();
    const script = Array.from({ length: 14 }, () => tool('search_plants', { text: '1' }));
    const r = await ask({ client: mockClient(script), model: 'm', conv, question: 'loop', system: 'NGD', user: 'u', current: null, confirm: async () => true });
    expect(r.template).toBe(true);
  });
  it('explainer: invalid answers twice -> deterministic template', async () => {
    const b = new FactBook(); b.add('x', '1.5', { unit: 'INR', source: 's' });
    const res = await answerFromFacts({ client: mockClient([text('{"paragraphs":[{"text":"2.5 INR"}]}'), text('nope')]), model: 'm', system: 's', facts: b.list(), task: 't', template: () => ({ paragraphs: [{ text: 'T', facts: [] }] }), feature: 'explain', user: 'u', question: 'q', sapSystem: 'NGD' });
    expect(res.template).toBe(true);
    expect(res.attempts).toBe(2);
  });
});
