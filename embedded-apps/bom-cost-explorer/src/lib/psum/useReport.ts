'use client';
/**
 * Runs the Cost and margin report: the plant's production rows of the look-back window (WacRowSet, no live costing), then the latest sales prices of those
 * materials (SoPriceSet, 50 materials per call, one after the other). No call has a time limit; Stop / leaving the page aborts; results stay in the shared
 * cache for the same inputs, Refresh refetches. Nothing starts until run() is called.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { abortAll, ensure, invalidate, peek, stop as stopCtx, subscribe, type WacEntry } from '../wac/cache';
import { buildWacFilter } from '../wac/filter';
import { fetchWac } from '../wac/service';
import { wacKey } from '../wac/useWac';
import { fetchSoMerged } from '../so/service';
import type { WacRow } from '../wac/types';
import type { SoPriceRow } from '../so/types';
import { isWip, lookbackRange, type ReportKind } from './report';

export interface ReportQuery { plants: string[]; days: number; kind: ReportKind }
const wacQ = (q: ReportQuery) => { const r = lookbackRange(q.days); return { plants: q.plants, dateFrom: r.from, dateTo: r.to }; };
const ctxOf = (q: ReportQuery) => `report|${buildWacFilter(wacQ(q), 'ROWS')}|${q.days}|${q.kind}`;
const priceKey = (q: ReportQuery, mats: string[]) => `report-price|${q.days}|${mats.join(',')}`;

export function useReport() {
  const [q, setQ] = useState<ReportQuery | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const token = useRef(0);
  const [mats, setMats] = useState<string[]>([]);
  useEffect(() => subscribe(bump), []);
  useEffect(() => () => { token.current++; abortAll(); }, []);

  const rowsEntry = q ? peek<WacRow>(wacKey('ROWS', wacQ(q))) : undefined;
  const priceEntry: WacEntry<SoPriceRow> | undefined = q && mats.length ? peek<SoPriceRow>(priceKey(q, mats)) : undefined;
  const running = rowsEntry?.status === 'loading' || priceEntry?.status === 'loading';

  const drive = useCallback(async (query: ReportQuery, force: boolean) => {
    const my = ++token.current;
    const ctx = ctxOf(query);
    if (force) invalidate(ctx);
    const f = wacQ(query);
    await ensure<WacRow>(wacKey('ROWS', f), ctx, 'ROWS', (signal) => fetchWac('ROWS', f, { signal }) as never, force);
    const e = peek<WacRow>(wacKey('ROWS', f));
    if (token.current !== my || e?.status !== 'done') return;
    const list = Array.from(new Set((e.data ?? []).filter((r) => (isWip(r) ? 'wip' : 'fg') === query.kind && Number(r.Qty) > 0).map((r) => r.Matnr)));
    setMats(list);
    if (!list.length) return;
    await ensure<SoPriceRow>(priceKey(query, list), ctx, 'PRICE', (signal) => fetchSoMerged('PRICE', { materials: list, daysBack: query.days }, { signal }) as never, force);
  }, []);

  const run = useCallback((query: ReportQuery) => { setQ(query); setMats([]); void drive(query, false); }, [drive]);
  const stop = useCallback(() => { token.current++; if (q) stopCtx(ctxOf(q)); }, [q]);
  const resume = useCallback(() => { if (q) void drive(q, false); }, [q, drive]);
  const refresh = useCallback(() => { if (q) void drive(q, true); }, [q, drive]);

  return {
    q, running, run, stop, resume, refresh,
    rows: (rowsEntry?.status === 'done' ? rowsEntry.data : null) as WacRow[] | null,
    prices: (priceEntry?.status === 'done' ? priceEntry.data : null) as SoPriceRow[] | null,
    rowsEntry, priceEntry,
  };
}
