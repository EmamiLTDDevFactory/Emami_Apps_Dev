/**
 * Reads the WAC sets straight from the SAP gateway like every other call of this app (static export, no server):
 * the existing sapGetCollection, read-only GET, encodeURIComponent for every value. NO time limit of any kind: the
 * request ends when SAP answers or when the caller's AbortSignal fires (Stop button, leaving the page).
 * SAP computes everything; nothing here recomputes an average, variance, flag or coverage.
 */
import Decimal from 'decimal.js';
import { sapGetCollection } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import type { SapMessage } from '../sap/messages';
import { WAC_FIELDS, WAC_SET, type WacSetKey } from './fields';
import { buildWacFilter, type WacFilterInput } from './filter';
import type { WacFlag, WacRowsBySet } from './types';

export interface WacResult<T> {
  rows: T[];
  messages: SapMessage[];
  ms: number;
  /** false when no sap-message header reached the browser (a proxy may strip it): never treated as an error. */
  sapMessageHeader: boolean;
}

/** '' (SAP sent nothing / nothing to compare) stays '' so the screen can show n/a; a real number is canonicalised. */
export function nullableDecimal(v: unknown): string {
  let s = String(v ?? '').trim();
  if (!s) return '';
  if (/^[\d.]+-$/.test(s)) s = `-${s.slice(0, -1)}`;
  try {
    const d = new Decimal(s);
    return d.isFinite() ? d.toFixed() : '';
  } catch {
    return '';
  }
}

const NULLABLE = /^(Varp|Var|Rate|Cost)|^(ActPu|SrcPu|CoverPct|FxInr|ActCogm)$/;
export const toFlag = (v: unknown): WacFlag => {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'H' || s === 'M' ? s : '';
};

export function normalizeWac<K extends WacSetKey>(set: K, raw: Record<string, unknown>): WacRowsBySet[K] {
  const map = WAC_FIELDS[set];
  const o = normalizeEntity<Record<string, unknown>>(raw, map);
  for (const key of Object.keys(map)) {
    if (NULLABLE.test(key) && typeof o[key] === 'string') o[key] = nullableDecimal(o[key]);
    else if (/^Flag/.test(key) || (set !== 'ROWS' && key === 'Flag')) o[key] = toFlag(o[key]);
    else if (key === 'Dir') o[key] = String(o[key]).trim() === '+' ? '+' : String(o[key]).trim() === '-' ? '-' : '';
    else if (typeof o[key] === 'string') o[key] = (o[key] as string).trim();
  }
  return o as unknown as WacRowsBySet[K];
}

/** `select` (optional): only these properties are requested. Unused by the existing screens, which send no $select. */
export async function fetchWac<K extends WacSetKey>(set: K, q: WacFilterInput, opts: { signal?: AbortSignal; select?: string } = {}): Promise<WacResult<WacRowsBySet[K]>> {
  const $filter = buildWacFilter(q, set); // throws FilterError (no plant / bad dates) before any request
  const r = await sapGetCollection(WAC_SET[set], opts.select ? { $filter, $select: opts.select } : { $filter }, { signal: opts.signal, noTimeout: true, costing: true });
  const rows = r.rows.map((raw) => normalizeWac(set, raw));
  const messages = [...r.messages];
  if (set === 'ROWS') {
    // A row-level message (Msg) is a warning, never a failure.
    const seen = new Set(messages.map((m) => m.message));
    for (const row of rows as WacRowsBySet['ROWS'][]) {
      if (row.Msg && !seen.has(row.Msg)) {
        seen.add(row.Msg);
        messages.push({ code: '', message: row.Msg, severity: 'warning' });
      }
    }
  }
  return { rows, messages, ms: r.ms, sapMessageHeader: r.sapMessageHeader };
}
