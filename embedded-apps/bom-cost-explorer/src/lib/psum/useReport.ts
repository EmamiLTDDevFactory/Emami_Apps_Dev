'use client';
/**
 * Runs the Cost and margin report: the plant's production rows of the cost look-back window (WacRowSet with a narrow $select, no live costing), then - only
 * when a sales organisation is chosen - the latest sales prices of those materials (SoPriceSet, 50 per call, up to 3 calls in parallel). No call has a time
 * limit; Stop / leaving the page aborts them all; results stay in the shared cache for the same inputs, Refresh refetches. Nothing starts until run().
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { abortAll, ensure, invalidate, peek, stop as stopCtx, subscribe, type WacEntry } from '../wac/cache';
import { buildWacFilter } from '../wac/filter';
import { fetchWac } from '../wac/service';
import { wacKey } from '../wac/useWac';
import type { WacRow } from '../wac/types';
import type { SoPriceRow } from '../so/types';
import { fetchReportPrices, priceSignature, type PriceFilters } from './reportPrices';
import { isWip, lookbackRange, type ReportKind } from './report';

/** Only the fields the page shows. ActCogm is left out when SAP does not know it yet (see fetchRows). */
export const REPORT_WAC_FIELDS = ['Matnr', 'Maktx', 'Werks', 'Mtart', 'Zbrand', 'Prodha', 'Zskugrcodecrs', 'Zskugroupcrs', 'Uom', 'Docs', 'Batches', 'DupDocs', 'Qty', 'ActRm', 'ActPm', 'ActPerf', 'ActMat', 'ActConv', 'ActCogm', 'ActLanded', 'ActRecon', 'Status', 'Msg'];
export const reportSelect = (withCogm: boolean): string => REPORT_WAC_FIELDS.filter((f) => withCogm || f !== 'ActCogm').join(',');

export interface ReportQuery { plants: string[]; days: number; kind: ReportKind; price: PriceFilters | null }
const wacQ = (q: ReportQuery) => { const r = lookbackRange(q.days); return { plants: q.plants, dateFrom: r.from, dateTo: r.to }; };
const ctxOf = (q: ReportQuery) => `report|${buildWacFilter(wacQ(q), 'ROWS')}|${q.kind}|${q.price ? priceSignature(q.price) : ''}`;
const rowsKey = (q: ReportQuery) => `${wacKey('ROWS', wacQ(q))}|report`;
const priceKey = (q: ReportQuery, mats: string[]) => `report-price|${q.price ? priceSignature(q.price) : ''}|${mats.join(',')}`;

/** WacRowSet with the narrow $select. A SAP that does not know ActCogm yet answers 400 ("property not found"): the call is repeated without it. */
export async function fetchRows(q: ReportQuery, signal: AbortSignal) {
  const f = wacQ(q);
  try {
    return await fetchWac('ROWS', f, { signal, select: reportSelect(true) });
  } catch (e) {
    if (signal.aborted || !/ActCogm/i.test((e as Error).message)) throw e;
    return fetchWac('ROWS', f, { signal, select: reportSelect(false) });
  }
}

export function useReport() {
  const [q, setQ] = useState<ReportQuery | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const token = useRef(0);
  const [mats, setMats] = useState<string[]>([]);
  useEffect(() => subscribe(bump), []);
  useEffect(() => () => { token.current++; abortAll(); }, []);

  const rowsEntry = q ? peek<WacRow>(rowsKey(q)) : undefined;
  const priceEntry: WacEntry<SoPriceRow> | undefined = q && q.price && mats.length ? peek<SoPriceRow>(priceKey(q, mats)) : undefined;
  const running = rowsEntry?.status === 'loading' || priceEntry?.status === 'loading';

  const drive = useCallback(async (query: ReportQuery, force: boolean) => {
    const my = ++token.current;
    const ctx = ctxOf(query);
    if (force) invalidate(ctx);
    await ensure<WacRow>(rowsKey(query), ctx, 'ROWS', (signal) => fetchRows(query, signal) as never, force);
    const e = peek<WacRow>(rowsKey(query));
    if (token.current !== my || e?.status !== 'done') return;
    const list = Array.from(new Set((e.data ?? []).filter((r) => (isWip(r) ? 'wip' : 'fg') === query.kind && Number(r.Qty) > 0).map((r) => r.Matnr)));
    setMats(list);
    if (!query.price || !list.length) return;
    const price = query.price;
    await ensure<SoPriceRow>(priceKey(query, list), ctx, 'PRICE', (signal) => fetchReportPrices(list, price, signal) as never, force);
  }, []);

  const run = useCallback((query: ReportQuery) => { setQ(query); setMats([]); void drive(query, false); }, [drive]);
  const stop = useCallback(() => { token.current++; if (q) stopCtx(ctxOf(q)); }, [q]);
  const resume = useCallback(() => { if (q) void drive(q, false); }, [q, drive]);
  const refresh = useCallback(() => { if (q) void drive(q, true); }, [q, drive]);

  return {
    q, running, run, stop, resume, refresh, materials: mats,
    rows: (rowsEntry?.status === 'done' ? rowsEntry.data : null) as WacRow[] | null,
    prices: (priceEntry?.status === 'done' ? priceEntry.data : null) as SoPriceRow[] | null,
    rowsEntry, priceEntry,
  };
}
