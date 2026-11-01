/**
 * Reads of the Margin sets straight from the SAP gateway (static export, no server): the existing sapGetCollection, read-only GET, NO time limit
 * (the call ends when SAP answers, on Stop, or when the page is left). SAP computes every figure; nothing here calculates anything.
 * A 404 for a set (not published in this system yet) becomes one friendly text.
 */
import { sapGetCollection } from '../sap/client';
import type { SapMessage } from '../sap/messages';
import { NOT_AVAILABLE, friendlyError, normalizeRow } from '../price-context/odata';
import { MARGIN_FIELDS, MARGIN_NULLABLE, MARGIN_SET, type MarginReadKey, type MarginSetKey } from './fields';
import { MARGIN_SELECT } from './flag';
import { buildMarginFilter, type MarginQuery } from './filter';
import type { MarginRowsBySet } from './types';

export { NOT_AVAILABLE, friendlyError };
export const PAGE = 500;

export interface MarginRead<T> { rows: T[]; messages: SapMessage[]; ms: number; count: number | null }

export const selectOf = (set: MarginReadKey): string | undefined => (MARGIN_SELECT ? Object.values(MARGIN_FIELDS[set]).map(([n]) => n).join(',') : undefined);

/** One call of a read set. `top` / `skip` page a snapshot (CogmRowSet answers $inlinecount). */
export async function fetchMargin<K extends MarginReadKey>(set: K, q: MarginQuery, opts: { signal?: AbortSignal; top?: number; skip?: number } = {}): Promise<MarginRead<MarginRowsBySet[K]>> {
  const $filter = buildMarginFilter(q, set); // throws FilterError before any request
  const paged = opts.top !== undefined;
  try {
    const r = await sapGetCollection(MARGIN_SET[set], { $filter: $filter || undefined, $select: selectOf(set), $top: paged ? String(opts.top) : undefined, $skip: paged && opts.skip ? String(opts.skip) : undefined, $inlinecount: paged ? 'allpages' : undefined },
      { signal: opts.signal, noTimeout: true, costing: true });
    const rows = r.rows.map((raw) => normalizeRow<MarginRowsBySet[K]>(raw, MARGIN_FIELDS[set], MARGIN_NULLABLE[set]));
    return { rows, messages: [...r.messages], ms: r.ms, count: r.count ?? null };
  } catch (e) {
    throw friendlyError(e);
  }
}

/** Every page of a snapshot read (rows come from the stored snapshot, no live costing). */
export async function fetchMarginAll<K extends MarginReadKey>(set: K, q: MarginQuery, opts: { signal?: AbortSignal } = {}): Promise<MarginRead<MarginRowsBySet[K]>> {
  const rows: MarginRowsBySet[K][] = [];
  const messages: SapMessage[] = [];
  let ms = 0, total: number | null = null;
  for (let skip = 0; skip < 500_000; skip += PAGE) {
    const r = await fetchMargin(set, q, { signal: opts.signal, top: PAGE, skip });
    ms += r.ms; if (skip === 0) messages.push(...r.messages);
    total = r.count ?? total; rows.push(...r.rows);
    if (r.rows.length < PAGE || (total !== null && rows.length >= total)) break;
  }
  return { rows, messages, ms, count: total ?? rows.length };
}

/** Row-level Msg texts as warnings (never as a failure), unique. */
export function rowMessages(rows: { Msg?: string }[], seen: SapMessage[] = []): SapMessage[] {
  const out = [...seen];
  for (const r of rows) { const m = (r.Msg ?? '').trim(); if (m && !out.some((x) => x.message === m)) out.push({ code: '', message: m, severity: 'warning' }); }
  return out;
}

/** The read-only data sets (prices, rules, volumes, budgets, targets): shown as they come, every property SAP sends. */
export type DataSetKey = 'PRICE' | 'RULE' | 'VOLUME' | 'BUDGET' | 'TARGET';
export async function fetchDataSet(set: DataSetKey, signal?: AbortSignal): Promise<MarginRead<Record<string, string>>> {
  try {
    const r = await sapGetCollection(MARGIN_SET[set], {}, { signal, noTimeout: true, costing: true });
    const rows = r.rows.map((raw) => Object.fromEntries(Object.entries(raw).filter(([k]) => k !== '__metadata').map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])));
    return { rows, messages: [...r.messages], ms: r.ms, count: r.count ?? null };
  } catch (e) { throw friendlyError(e); }
}
export type { MarginSetKey };
