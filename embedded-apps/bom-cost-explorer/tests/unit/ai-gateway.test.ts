import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeClient, describeError, AiHttpError } from '@/lib/ai/gateway';
import { candidatesFor, cleanSuggestions } from '@/lib/ai/mapping';
import { rateOutlook } from '@/lib/ai/forecast';

afterEach(() => vi.unstubAllGlobals());
const sse = (chunks: string[]) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const x of chunks) c.enqueue(e.encode(x)); c.close(); } }), { status: 200 });

describe('Grok gateway (OpenAI compatible)', () => {
  it('chat: posts to {base}/chat/completions with the bearer key and reads content, tool calls and usage', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ choices: [{ message: { content: 'hi', tool_calls: [{ id: 'c1', function: { name: 'get_mis', arguments: '{"plants":["UN13"]}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 7, completion_tokens: 3 } }), { status: 200 }); });
    const r = await makeClient('xai-key', 'https://api.x.ai/v1/').chat({ model: 'grok-4', messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'get_mis', description: 'd', input_schema: { type: 'object' } }] });
    expect(calls[0].url).toBe('https://api.x.ai/v1/chat/completions');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer xai-key');
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.model).toBe('grok-4'); expect(sent.tools[0].function.name).toBe('get_mis'); expect(sent.stream).toBe(false);
    expect(r.content).toBe('hi'); expect(r.toolCalls).toEqual([{ id: 'c1', name: 'get_mis', arguments: '{"plants":["UN13"]}' }]); expect(r.usage).toEqual({ input: 7, output: 3 });
  });
  it('no key (server proxy): no Authorization header', async () => {
    let h: Record<string, string> = {};
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => { h = init.headers as Record<string, string>; return new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }); });
    await makeClient('', '/api/me/cockpit-ai').chat({ model: 'm', messages: [] });
    expect(h.Authorization).toBeUndefined();
  });
  it('stream: joins text deltas and tool-call fragments in order', async () => {
    vi.stubGlobal('fetch', async () => sse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"get_","arguments":"{\\"x\\""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"mis","arguments":":1}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":4,"completion_tokens":2}}\n\n', 'data: [DONE]\n\n',
    ]));
    const seen: string[] = [];
    const r = await makeClient('k').stream({ model: 'm', messages: [] }, (d) => seen.push(d));
    expect(seen.join('')).toBe('Hello'); expect(r.content).toBe('Hello');
    expect(r.toolCalls).toEqual([{ id: 'a', name: 'get_mis', arguments: '{"x":1}' }]); expect(r.finish).toBe('tool_calls'); expect(r.usage).toEqual({ input: 4, output: 2 });
  });
  it('errors become plain messages', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
    await expect(makeClient('k').chat({ model: 'm', messages: [] })).rejects.toBeInstanceOf(AiHttpError);
    expect(describeError(new AiHttpError(401, ''))).toContain('Grok API key was not accepted');
    expect(describeError(new AiHttpError(429, ''))).toContain('rate limit');
    expect(describeError(new TypeError('x'))).toContain('Could not reach Grok');
  });
});

describe('name mapping helper', () => {
  const names = ['Himani Navratna', 'BoroPlus', 'Zandu Balm', '7 Oil', 'Emami Fair & Handsome'];
  it('offers the closest workbook names and keeps only a suggestion that is one of them', () => {
    const c = candidatesFor('HIMANI NAVRATNA OIL', names);
    expect(c[0]).toBe('Himani Navratna');
    const items = [{ code: '1', text: 'HIMANI NAVRATNA OIL' }, { code: '2', text: 'UNKNOWN THING' }];
    const out = cleanSuggestions(items, new Map([['1', c], ['2', []]]), { mappings: [{ code: '1', suggestion: 'himani navratna', confidence: 'high', reason: 'same brand' }, { code: '2', suggestion: 'Invented Name', confidence: 'high', reason: 'x' }] });
    expect(out[0]).toMatchObject({ suggestion: 'Himani Navratna', confidence: 'high' });
    expect(out[1].suggestion).toBe('');
  });
});

describe('rate outlook', () => {
  const m = (month: string, rate: number) => ({ month, qty: 100, value: rate * 100, avg: rate });
  it('needs 3 months; otherwise says so', () => expect(rateOutlook([m('2026-01', 10), m('2026-02', 11)]).enough).toBe(false));
  it('a rising series gives a positive trend, an outlook above the 6-month average, capped at 10 %', () => {
    const o = rateOutlook(['01', '02', '03', '04', '05', '06', '07'].map((x, i) => m(`2026-${x}`, 100 + i * 5)));
    expect(o.slopePctPerMonth!).toBeGreaterThan(0);
    expect(o.outlook!).toBeGreaterThan(o.avg6!);
    expect(o.outlook!).toBeLessThanOrEqual(o.avg6! * 1.1 + 1e-9);
    expect(o.low!).toBeLessThan(o.outlook!); expect(o.high!).toBeGreaterThan(o.outlook!);
  });
  it('a flat series has no trend and no move', () => {
    const o = rateOutlook(['01', '02', '03', '04'].map((x) => m(`2026-${x}`, 50)));
    expect(o.slopePctPerMonth).toBeCloseTo(0, 6); expect(o.outlook).toBeCloseTo(50, 6);
  });
});
