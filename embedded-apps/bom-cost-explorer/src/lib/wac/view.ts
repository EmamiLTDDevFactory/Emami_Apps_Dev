/**
 * Pure presentation logic for the Actual vs rate sources screen. SAP computed every average, variance, flag and
 * coverage: this file only formats, filters, sorts and counts what SAP sent. The ONE number computed here is the
 * "selection total" row (quantity-weighted mean of the displayed per-unit values, decimal.js).
 */
import Decimal from 'decimal.js';
import type { SapMessage } from '../sap/messages';
import type { WacCompRow, WacFlag, WacRow, WacSource } from './types';

export const dec = (v: string | null | undefined): Decimal | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  try {
    const d = new Decimal(String(v).trim());
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
};

export type Tone = 'na' | 'good' | 'warn' | 'bad';
/** SAP's flag decides the colour: H red, M amber, blank green. No value at all is n/a (grey), NEVER green. */
export function tone(value: string, flag: WacFlag): Tone {
  if (dec(value) === null) return 'na';
  return flag === 'H' ? 'bad' : flag === 'M' ? 'warn' : 'good';
}
/** Colour is never the only signal: a short word next to / inside the cell. */
export const toneWord = (t: Tone): string => (t === 'bad' ? 'High' : t === 'warn' ? 'Medium' : t === 'good' ? 'OK' : 'n/a');

/** "+4.2 %" = actual is above the source, "−1.0 %" below, "n/a" when SAP has no value. */
export function fmtVarPct(v: string, dp = 1): string {
  const d = dec(v);
  if (d === null) return 'n/a';
  const abs = d.abs().toFixed(dp);
  return `${d.gt(0) ? '+' : d.lt(0) ? '−' : ''}${abs} %`;
}

export const SOURCES = ['Sel', 'Cmap', 'Con', 'Avg'] as const;
export type SrcKey = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<SrcKey, string> = { Sel: 'Selected rate', Cmap: 'C-MAP', Con: 'Consumption', Avg: 'Average rate' };
export const SRC_CODE: Record<SrcKey, WacSource> = { Sel: 'SEL', Cmap: 'CMAP', Con: 'CON', Avg: 'AVG' };
export const varOf = (r: WacRow, s: SrcKey): string => r[`Varp${s}` as 'VarpSel'];
export const flagOf = (r: WacRow, s: SrcKey): WacFlag => r[`Flag${s}` as 'FlagSel'];

/** Without the comparison switch SAP sends 0.0000 and no flag in every variance column, so those columns are not shown at
 * all. With it on, a source SAP has no rates for (e.g. the average rate before that dataset is loaded) also answers 0.0000
 * with a blank flag: a source column shows only when at least one row has a flag or a non-zero variance. */
export function sourceHasData(rows: WacRow[], s: SrcKey, inclCmp: boolean): boolean {
  if (!inclCmp) return false;
  return rows.some((r) => flagOf(r, s) !== '' || !(dec(varOf(r, s))?.isZero() ?? true));
}

/** Intersect the requested plants with the plants SAP lists for this person (PlantVHSet); order of the request is kept. */
export function intersectPlants(requested: string[], allowed: string[]): string[] {
  const ok = new Set(allowed.map((p) => p.toUpperCase()));
  return requested.filter((p) => ok.has(p.toUpperCase()));
}

export interface Kpis { fgs: number; plants: number; docs: number; batches: number; dupRows: number; red: number; amber: number }
/** Counted from the SAP flags: red = at least one H; amber = at least one M and no H. */
export function kpis(rows: WacRow[]): Kpis {
  let docs = 0, batches = 0, dupRows = 0, red = 0, amber = 0;
  for (const r of rows) {
    docs += r.Docs;
    batches += r.Batches;
    if (r.Status === 'D') dupRows++;
    const flags = [r.FlagSel, r.FlagCmap, r.FlagCon, r.FlagAvg];
    if (flags.includes('H')) red++;
    else if (flags.includes('M')) amber++;
  }
  return { fgs: new Set(rows.map((r) => r.Matnr)).size, plants: new Set(rows.map((r) => r.Werks)).size, docs, batches, dupRows, red, amber };
}

/** ActRecon is landed minus material minus conversion: a data-quality indicator. */
export function reconWarn(r: WacRow, pct: number): boolean {
  const recon = dec(r.ActRecon);
  const landed = dec(r.ActLanded);
  if (!recon || !landed || landed.isZero()) return false;
  return recon.abs().div(landed.abs()).times(100).gt(pct);
}

export interface SelectionTotal { uom: string; qty: string; rm: string; pm: string; perf: string; mat: string; conv: string; landed: string }
/** Quantity-weighted mean: sum(unit value x Qty) / sum(Qty). Only when every displayed row has the same Uom. */
export function selectionTotal(rows: WacRow[]): SelectionTotal | null {
  if (!rows.length) return null;
  const uoms = new Set(rows.map((r) => r.Uom));
  if (uoms.size !== 1) return null;
  const qty = rows.reduce((s, r) => s.plus(dec(r.Qty) ?? 0), new Decimal(0));
  if (qty.isZero()) return null;
  const w = (k: 'ActRm' | 'ActPm' | 'ActPerf' | 'ActMat' | 'ActConv' | 'ActLanded') =>
    rows.reduce((s, r) => s.plus((dec(r[k]) ?? new Decimal(0)).times(dec(r.Qty) ?? 0)), new Decimal(0)).div(qty).toFixed();
  return { uom: rows[0].Uom, qty: qty.toFixed(), rm: w('ActRm'), pm: w('ActPm'), perf: w('ActPerf'), mat: w('ActMat'), conv: w('ActConv'), landed: w('ActLanded') };
}

/** SAP's costing limit of 25 finished goods: the message ("... the comparison runs for 25 at most ...") or, when a proxy stripped the
 * header, a selection of more than 25 finished goods that came back with no comparison value at all. */
export const isLimitMessage = (m: SapMessage): boolean => /\b25\b.*(at most|maximum|limit)|(at most|maximum|limit).*\b25\b/i.test(m.message);
export function comparisonLimited(messages: SapMessage[], rows: WacRow[], inclCmp: boolean): boolean {
  if (!inclCmp) return false;
  if (messages.some(isLimitMessage)) return true;
  return new Set(rows.map((r) => r.Matnr)).size > 25 && !SOURCES.some((s) => sourceHasData(rows, s, true));
}
export const LIMIT_FALLBACK = 'The live comparison runs for 25 finished goods at most, so the comparison values are empty for this selection. The actual figures below are complete; narrow the selection to compare.';

/** Largest absolute variance of a component against any non-selected source (null when it has none). */
export function maxAbsVariance(c: WacCompRow): Decimal | null {
  const v = [c.VarpCmap, c.VarpCon, c.VarpAvg].map(dec).filter((x): x is Decimal => x !== null).map((x) => x.abs());
  return v.length ? Decimal.max(...v) : null;
}
/** Components, largest absolute variance first (rows with no variance last, then by component code). */
export function sortComponents(rows: WacCompRow[]): WacCompRow[] {
  return [...rows].sort((a, b) => {
    const x = maxAbsVariance(a), y = maxAbsVariance(b);
    if (x && y) { const c = y.cmp(x); if (c) return c; }
    else if (x) return -1;
    else if (y) return 1;
    return a.Idnrk.localeCompare(b.Idnrk);
  });
}

export const GROUP_LABEL: Record<string, string> = { RM: 'RM', PM: 'PM', PERF: 'Perfume', MAT: 'Material total' };

/** Stable key of one finished good in one plant. */
export const rowKey = (r: { Matnr: string; Werks: string }): string => `${r.Werks}|${r.Matnr}`;
