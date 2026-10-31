'use client';
/**
 * Runs the Plant production summary from the existing WAC sets, one request at a time per step and with NO time limit: the whole
 * period (WacRowSet), then each calendar month (WacRowSet, for the trend) and, in batches of 25 finished goods, the components
 * (WacCompSet, live costing about 10-15 s per batch). Results live in the shared WAC cache (no expiry; Refresh refetches); Stop and
 * leaving the page abort. Nothing starts until run() is called.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { abortAll, ensure, invalidate, peek, stop, subscribe, type WacEntry } from '../wac/cache';
import { buildWacFilter, type WacFilterInput } from '../wac/filter';
import { fetchWac } from '../wac/service';
import { wacKey } from '../wac/useWac';
import type { WacCompRow, WacRow } from '../wac/types';
import { monthSlices, type MonthSlice } from './dates';
import { chunk, fgValues, pickForComponents } from './view';

export const COMP_BATCH = 25;
export interface PsumQuery { plants: string[]; dateFrom: string; dateTo: string; prodha?: string[]; compTop: number; withComponents: boolean; withTrend: boolean }

export const psumCtx = (q: PsumQuery): string => `psum|${buildWacFilter({ ...q }, 'ROWS')}|${q.compTop}`;
const monthQuery = (q: PsumQuery, m: MonthSlice): WacFilterInput => ({ plants: q.plants, prodha: q.prodha, dateFrom: m.from, dateTo: m.to });
const mainQuery = (q: PsumQuery): WacFilterInput => ({ plants: q.plants, prodha: q.prodha, dateFrom: q.dateFrom, dateTo: q.dateTo });
const compQuery = (q: PsumQuery, mats: string[]): WacFilterInput => ({ plants: q.plants, dateFrom: q.dateFrom, dateTo: q.dateTo, materials: mats });

export interface Step<T> { key: string; entry: WacEntry<T> | undefined }
export interface PsumState {
  main: WacEntry<WacRow> | undefined;
  months: { slice: MonthSlice; entry: WacEntry<WacRow> | undefined }[];
  batches: { n: number; mats: string[]; entry: WacEntry<WacCompRow> | undefined }[];
  running: boolean;
}

/** Plan of the component batches from the loaded rows (value ranking, then groups of 25). */
export function planBatches(rows: WacRow[], compTop: number): string[][] {
  return chunk(pickForComponents(fgValues(rows), compTop).map((v) => v.row.Matnr), COMP_BATCH);
}

export function usePsum() {
  const [q, setQ] = useState<PsumQuery | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const token = useRef(0);
  useEffect(() => subscribe(bump), []);
  useEffect(() => () => { token.current++; abortAll(); }, []);

  const ctx = q ? psumCtx(q) : '';
  const main = q ? peek<WacRow>(wacKey('ROWS', mainQuery(q))) : undefined;
  const slices = q && q.withTrend ? monthSlices(q.dateFrom, q.dateTo) : [];
  const months = slices.map((slice) => ({ slice, entry: q ? peek<WacRow>(wacKey('ROWS', monthQuery(q, slice))) : undefined }));
  const mats = main?.status === 'done' && q && q.withComponents ? planBatches(main.data ?? [], q.compTop) : [];
  const batches = mats.map((m, n) => ({ n, mats: m, entry: q ? peek<WacCompRow>(wacKey('COMP', compQuery(q, m))) : undefined }));
  const running = [main, ...months.map((m) => m.entry), ...batches.map((b) => b.entry)].some((e) => e?.status === 'loading');

  const drive = useCallback(async (query: PsumQuery, force: boolean) => {
    const my = ++token.current;
    const alive = () => token.current === my;
    const c = psumCtx(query);
    if (force) invalidate(c);
    const run = <T,>(set: 'ROWS' | 'COMP', f: WacFilterInput) =>
      ensure<T>(wacKey(set, f), c, set, (signal) => fetchWac(set, f, { signal }) as never, force);
    await run<WacRow>('ROWS', mainQuery(query));
    const m = peek<WacRow>(wacKey('ROWS', mainQuery(query)));
    if (!alive() || m?.status !== 'done') return;
    // Trend months (cheap, no live costing): two at a time.
    const trend = (async () => {
      if (!query.withTrend) return;
      const todo = monthSlices(query.dateFrom, query.dateTo);
      for (let i = 0; i < todo.length && alive(); i += 2) await Promise.all(todo.slice(i, i + 2).map((s) => run<WacRow>('ROWS', monthQuery(query, s))));
    })();
    // Components: one batch after the other (each is live costing).
    const comps = (async () => {
      if (!query.withComponents) return;
      for (const b of planBatches(m.data ?? [], query.compTop)) {
        if (!alive()) return;
        await run<WacCompRow>('COMP', compQuery(query, b));
        if (peek(wacKey('COMP', compQuery(query, b)))?.status === 'cancelled') return;
      }
    })();
    await Promise.all([trend, comps]);
  }, []);

  const start = useCallback((query: PsumQuery, force = false) => { setQ(query); void drive(query, force); }, [drive]);
  const halt = useCallback(() => { token.current++; if (q) stop(ctx); }, [q, ctx]);
  /** Continue after a Stop or an error: the done steps are reused, the rest is fetched. */
  const resume = useCallback(() => { if (q) void drive(q, false); }, [q, drive]);
  const refresh = useCallback(() => { if (q) void drive(q, true); }, [q, drive]);

  return { q, ctx, state: { main, months, batches, running } as PsumState, start, halt, resume, refresh };
}
