import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortAll, ensure, entriesOf, invalidate, isRunning, peek, resetWacCache, stop } from '@/lib/wac/cache';
import { SapError } from '@/lib/sap/client';

afterEach(() => resetWacCache());
const ok = (rows: number[]) => async () => ({ rows, messages: [], ms: 5 });

describe('wac cache', () => {
  it('nothing is fetched until ensure is called (no request on page open)', () => {
    const fetcher = vi.fn(ok([1]));
    expect(peek('k')).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('same inputs are fetched once and kept: no age-based expiry', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(ok([1, 2]));
      await ensure('k', 'c', 'ROWS', fetcher);
      vi.setSystemTime(Date.now() + 1000 * 60 * 60 * 24 * 30); // a month later
      await ensure('k', 'c', 'ROWS', fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(peek<number>('k')?.data).toEqual([1, 2]);
    } finally { vi.useRealTimers(); }
  });
  it('sorting or hiding columns does not touch the cache (the rows live here, not in the table state)', async () => {
    const fetcher = vi.fn(ok([3, 1, 2]));
    await ensure('k', 'c', 'ROWS', fetcher);
    const before = peek('k');
    [...(before!.data as number[])].sort();
    await ensure('k', 'c', 'ROWS', fetcher);
    expect(peek('k')).toBe(before);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('a call that is already running is not started twice', async () => {
    let release: () => void = () => {};
    const fetcher = vi.fn(() => new Promise<{ rows: number[]; messages: []; ms: number }>((res) => { release = () => res({ rows: [1], messages: [], ms: 1 }); }));
    const a = ensure('k', 'c', 'ROWS', fetcher);
    const b = ensure('k', 'c', 'ROWS', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(isRunning('c')).toBe(true);
    release();
    await Promise.all([a, b]);
    expect(isRunning('c')).toBe(false);
  });
  it('Refresh refetches (force) and invalidate drops the finished results of a run', async () => {
    const fetcher = vi.fn(ok([1]));
    await ensure('k', 'c', 'ROWS', fetcher);
    await ensure('k', 'c', 'ROWS', fetcher, true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await ensure('d', 'c', 'COMPARE', ok([9]));
    invalidate('c');
    expect(peek('k')).toBeUndefined();
    expect(peek('d')).toBeUndefined();
  });
  it('an error is kept with SAP\'s message and retried on the next ensure; no retry loop', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new SapError('More than 5000 rows: shorten the date range', 'http', 400)).mockResolvedValueOnce({ rows: [1], messages: [], ms: 1 });
    await ensure('k', 'c', 'ROWS', fetcher);
    expect(peek('k')?.status).toBe('error');
    expect(peek('k')?.error).toMatch(/More than 5000 rows/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await ensure('k', 'c', 'ROWS', fetcher);
    expect(peek('k')?.status).toBe('done');
  });
  it('Stop aborts only the running calls of that run; leaving the page aborts everything; finished results stay', async () => {
    const seen: AbortSignal[] = [];
    const hang = (signal: AbortSignal) => { seen.push(signal); return new Promise<never>((_, rej) => signal.addEventListener('abort', () => rej(new SapError('Request cancelled.', 'aborted', 499)))); };
    await ensure('done', 'c1', 'ROWS', ok([1]));
    const a = ensure('a', 'c1', 'COMPARE', hang);
    const b = ensure('b', 'c2', 'COMPARE', hang);
    stop('c1');
    await a;
    expect(peek('a')?.status).toBe('cancelled');
    expect(peek('done')?.status).toBe('done');
    expect(seen[1].aborted).toBe(false);
    abortAll();
    await b;
    expect(peek('b')?.status).toBe('cancelled');
    await ensure('a', 'c1', 'COMPARE', ok([5]));
    expect(peek('a')?.status).toBe('done');
  });
  it('entries of a run and set are available for the Excel export', async () => {
    await ensure('r', 'c', 'ROWS', ok([1]));
    await ensure('x1', 'c', 'COMPARE', ok([2]));
    await ensure('x2', 'c', 'COMPARE', ok([3]));
    await ensure('y', 'other', 'COMPARE', ok([4]));
    expect(entriesOf('c', 'COMPARE').flatMap((e) => e.data as number[]).sort()).toEqual([2, 3]);
  });
});
