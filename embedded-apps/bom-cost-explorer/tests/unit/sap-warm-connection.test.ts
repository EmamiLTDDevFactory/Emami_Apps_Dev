import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WARM_IDLE_MS, WARM_TIMEOUT_MS, noteGatewayAnswer, warmConnection } from '@/lib/sap/client';
import type { SapConfig } from '@/lib/sap/config';

const cfg = { baseUrl: 'https://gw/api/NWP/ZMM_BOM_COST_SRV', mock: false, client: '' } as unknown as SapConfig;
const hang = (_u: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));

describe('connection check before a costing call', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', {}); noteGatewayAnswer(0); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('one cheap read answers: nothing else is sent', async () => {
    const f = vi.fn(async (_u: string) => new Response('{}', { status: 200 }));
    await warmConnection(cfg, f as unknown as typeof fetch, undefined, () => 100_000);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toContain('ConfigItemSet?$top=1');
  });
  it('a stuck connection is cancelled after the limit and tried once more on a fresh one', async () => {
    let n = 0;
    const f = vi.fn((u: unknown, init?: RequestInit) => (++n === 1 ? hang(u, init) : Promise.resolve(new Response('{}', { status: 200 }))));
    const p = warmConnection(cfg, f as unknown as typeof fetch, undefined, () => 100_000);
    await vi.advanceTimersByTimeAsync(WARM_TIMEOUT_MS + 10);
    await p;
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('gives up after two stuck tries and never throws (the costing call then runs and reports its own error)', async () => {
    const f = vi.fn(hang);
    const p = warmConnection(cfg, f as unknown as typeof fetch, undefined, () => 100_000);
    await vi.advanceTimersByTimeAsync(2 * WARM_TIMEOUT_MS + 20);
    await expect(p).resolves.toBeUndefined();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('an error status still proves the connection works', async () => {
    const f = vi.fn(async () => new Response('x', { status: 404 }));
    await warmConnection(cfg, f as unknown as typeof fetch, undefined, () => 100_000);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('skipped when the gateway answered a moment ago, in node, and for the mock', async () => {
    const f = vi.fn(async () => new Response('{}'));
    noteGatewayAnswer(100_000 - (WARM_IDLE_MS - 1000));
    await warmConnection(cfg, f as unknown as typeof fetch, undefined, () => 100_000);
    vi.unstubAllGlobals();
    await warmConnection(cfg, f as unknown as typeof fetch, undefined, () => 1e9);
    vi.stubGlobal('window', {});
    await warmConnection({ ...cfg, mock: true } as SapConfig, f as unknown as typeof fetch, undefined, () => 1e9);
    expect(f).not.toHaveBeenCalled();
  });
  it('a cancelled run does not start the check', async () => {
    const f = vi.fn(async () => new Response('{}'));
    const c = new AbortController(); c.abort();
    await warmConnection(cfg, f as unknown as typeof fetch, c.signal, () => 100_000);
    expect(f).not.toHaveBeenCalled();
  });
});
