import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SapError } from '@/lib/sap/client';

const get = vi.fn();
vi.mock('@/lib/sap/client', async (orig) => ({ ...(await orig<typeof import('@/lib/sap/client')>()), sapGetCollection: (...a: unknown[]) => get(...a) }));
vi.mock('@/lib/rates/capability', () => ({ getRatesCapability: () => ({ state: 'direct' }), setRatesCapability: () => {}, resetRatesCapability: () => {} }));
const { fetchRateOptionsSteps, clearRatesCache } = await import('@/lib/rates/options');

const ok = (m: string) => ({ rows: [{ Seqnr: 1, Hwerks: 'P1', Headmat: m, Source: 'MBEW' }], messages: [], ms: 1 });
beforeEach(() => { get.mockReset(); clearRatesCache(); });

describe('rate options in steps', () => {
  it('reads every step, merges the rows and reports progress', async () => {
    get.mockImplementation(async (_s: string, p: { $filter: string }) => ok(p.$filter.slice(-2)));
    const seen: number[] = [];
    const r = await fetchRateOptionsSteps(['a1', 'b2', 'c3'], {}, (d) => seen.push(d));
    expect('rows' in r && r.rows.map((x) => x.Headmat).sort()).toEqual(['1', '2', '3'].map((n, i) => ['a1', 'b2', 'c3'][i]).sort());
    expect(seen).toEqual([1, 2, 3]);
  });

  it('a timed-out step is not repeated and does not fail the others', async () => {
    get.mockImplementation(async (_s: string, p: { $filter: string }) => { if (p.$filter.includes('bad')) throw new SapError('slow', 'timeout'); return ok(p.$filter.slice(-2)); });
    const r = await fetchRateOptionsSteps(['a1', 'bad', 'c3'], {});
    expect('rows' in r && r.rows).toHaveLength(2);
    expect((r as { failed?: { count: number } }).failed?.count).toBe(1);
    expect(get.mock.calls.filter((c) => String((c[1] as { $filter: string }).$filter).includes('bad'))).toHaveLength(1);
  });

  it('retries an HTTP failure once, and fails only when every step failed', async () => {
    get.mockRejectedValue(new SapError('boom', 'http', 500, [], 500));
    await expect(fetchRateOptionsSteps(['a1', 'b2'], {})).rejects.toThrow('boom');
    expect(get).toHaveBeenCalledTimes(4);
  });
});
