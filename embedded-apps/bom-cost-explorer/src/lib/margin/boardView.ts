/**
 * Pure presentation logic of the Margin Board. SAP computed every cost, ratio, variance, erosion and impact: this file only decides what is shown as
 * n/a, orders, filters and words the numbers. No total, weighted value or other arithmetic on SAP figures (only row counts).
 */
import Decimal from 'decimal.js';
import { dec } from '../wac/view';
import { SCENARIOS, type MarginRow, type Scenario, type Severity } from './types';
import type { MarginQuery } from './filter';
import { EMPTY_LIST } from '../so/types';

export const hasAmt = (v: string | null | undefined): boolean => dec(v) !== null;
/** The stable key of a board row. */
export const rowKey = (r: Pick<MarginRow, 'Matnr' | 'Werks' | 'Market' | 'Channel'>): string => `${r.Matnr}|${r.Werks}|${r.Market}|${r.Channel}`;

const OK: Record<Scenario, 'OkStd' | 'OkAct' | 'OkBud' | 'OkCur'> = { STD: 'OkStd', ACT: 'OkAct', BUD: 'OkBud', CUR: 'OkCur' };
const CAP: Record<Scenario, 'Std' | 'Act' | 'Bud' | 'Cur'> = { STD: 'Std', ACT: 'Act', BUD: 'Bud', CUR: 'Cur' };

export interface ScenarioCells { ok: boolean; cogm: string; ratio: string; remain: string }
/** One scenario of a row. A scenario SAP says is not OK (Ok flag blank) is n/a as a whole: its amounts are never shown, whatever they hold. */
export function scenarioCells(r: MarginRow, s: Scenario): ScenarioCells {
  const c = CAP[s];
  if (!r[OK[s]]) return { ok: false, cogm: '', ratio: '', remain: '' };
  return { ok: true, cogm: r[`Cogm${c}` as 'CogmStd'], ratio: r[`Ratio${c}` as 'RatioStd'], remain: r[`Remain${c}` as 'RemainStd'] };
}
/** Variance of the current cost against another scenario, as SAP sent it (positive = cost up). Only when both scenarios are OK. */
export function varianceCells(r: MarginRow, against: 'STD' | 'ACT' | 'BUD'): { abs: string; pct: string } {
  if (!r.OkCur || !r[OK[against]]) return { abs: '', pct: '' };
  const c = CAP[against];
  return { abs: r[`VarCur${c}` as 'VarCurStd'], pct: r[`VarpCur${c}` as 'VarpCurStd'] };
}

/** "Positive annual impact = loss, negative = saving": the word and icon name that go with the number (never colour alone). */
export type Direction = 'up' | 'down' | 'none' | 'na';
export function directionOf(v: string | null | undefined): Direction {
  const d = dec(v);
  return d === null ? 'na' : d.gt(0) ? 'up' : d.lt(0) ? 'down' : 'none';
}
export const IMPACT_WORD: Record<Direction, string> = { up: 'Loss', down: 'Saving', none: 'No change', na: 'n/a' };
export const VARIANCE_WORD: Record<Direction, string> = { up: 'Cost up', down: 'Cost down', none: 'No change', na: 'n/a' };
export const EROSION_WORD: Record<Direction, string> = { up: 'Remaining amount down', down: 'Remaining amount up', none: 'No change', na: 'n/a' };

export const SEVERITY_WORD: Record<'H' | 'M' | 'L', string> = { H: 'High', M: 'Medium', L: 'Low' };
export const severityOf = (r: Pick<MarginRow, 'AlertSev' | 'AlertCnt'>): Severity => (r.AlertSev === 'H' || r.AlertSev === 'M' || r.AlertSev === 'L' ? r.AlertSev : '');
export const STATUS_WORD: Record<string, string> = { P: 'No price', S: 'No standard cost', C: 'No current cost' };
export const statusWord = (s: string): string => STATUS_WORD[s] ?? '';
/** The note under a row: SAP's Status word and its Msg (both kept as SAP sent them, the word only explains the code). */
export function rowNote(r: Pick<MarginRow, 'Status' | 'Msg'>): string {
  const w = statusWord(r.Status);
  const m = (r.Msg ?? '').trim();
  return [w, m].filter(Boolean).join(': ');
}

/* ------------------------------ columns ------------------------------ */
export type ColKey =
  | 'fg' | 'market' | 'mrp' | 'sp'
  | 'stdCogm' | 'stdRatio' | 'stdRemain' | 'actCogm' | 'actRatio' | 'actRemain' | 'budCogm' | 'budRatio' | 'budRemain' | 'curCogm' | 'curRatio' | 'curRemain'
  | 'varStd' | 'varAct' | 'varBud' | 'erosion' | 'annual' | 'reqSp' | 'reqMrp' | 'alert' | 'status';
export interface ColDef { key: ColKey; label: string; group: string; defaultVisible: boolean; numeric: boolean }
export const COLUMNS: ColDef[] = [
  { key: 'fg', label: 'Finished good', group: 'Finished good', defaultVisible: true, numeric: false },
  { key: 'market', label: 'Market / channel', group: 'Finished good', defaultVisible: true, numeric: false },
  { key: 'mrp', label: 'MRP', group: 'Price', defaultVisible: true, numeric: true },
  { key: 'sp', label: 'Selling price', group: 'Price', defaultVisible: true, numeric: true },
  { key: 'stdCogm', label: 'COGM', group: 'Standard', defaultVisible: true, numeric: true },
  { key: 'stdRatio', label: 'Ratio %', group: 'Standard', defaultVisible: true, numeric: true },
  { key: 'stdRemain', label: 'Amount remaining', group: 'Standard', defaultVisible: true, numeric: true },
  { key: 'actCogm', label: 'COGM', group: 'Actual', defaultVisible: true, numeric: true },
  { key: 'actRatio', label: 'Ratio %', group: 'Actual', defaultVisible: true, numeric: true },
  { key: 'actRemain', label: 'Amount remaining', group: 'Actual', defaultVisible: true, numeric: true },
  { key: 'budCogm', label: 'COGM', group: 'Budget', defaultVisible: true, numeric: true },
  { key: 'budRatio', label: 'Ratio %', group: 'Budget', defaultVisible: true, numeric: true },
  { key: 'budRemain', label: 'Amount remaining', group: 'Budget', defaultVisible: true, numeric: true },
  { key: 'curCogm', label: 'COGM', group: 'Current', defaultVisible: true, numeric: true },
  { key: 'curRatio', label: 'Ratio %', group: 'Current', defaultVisible: true, numeric: true },
  { key: 'curRemain', label: 'Amount remaining', group: 'Current', defaultVisible: true, numeric: true },
  { key: 'varStd', label: 'Current vs Standard', group: 'Variance', defaultVisible: true, numeric: true },
  { key: 'varAct', label: 'Current vs Actual', group: 'Variance', defaultVisible: false, numeric: true },
  { key: 'varBud', label: 'Current vs Budget', group: 'Variance', defaultVisible: false, numeric: true },
  { key: 'erosion', label: 'Erosion %', group: 'Erosion and impact', defaultVisible: true, numeric: true },
  { key: 'annual', label: 'Annual impact (INR)', group: 'Erosion and impact', defaultVisible: true, numeric: true },
  { key: 'reqSp', label: 'Selling price that restores the standard', group: 'Restore', defaultVisible: true, numeric: true },
  { key: 'reqMrp', label: 'MRP that restores the standard', group: 'Restore', defaultVisible: false, numeric: true },
  { key: 'alert', label: 'Alert', group: 'Alert', defaultVisible: true, numeric: false },
  { key: 'status', label: 'Status', group: 'Alert', defaultVisible: true, numeric: false },
];
export const defaultHidden = (): Set<ColKey> => new Set(COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.key));

/** The groups of the visible columns, in order, with how many columns each spans (the grouped header). */
export function headerGroups(visible: ColDef[]): { group: string; span: number }[] {
  const out: { group: string; span: number }[] = [];
  for (const c of visible) { const last = out[out.length - 1]; if (last && last.group === c.group) last.span++; else out.push({ group: c.group, span: 1 }); }
  return out;
}

/** What a column sorts by: a Decimal, a string, or null (n/a sorts last in both directions). */
export function sortValue(r: MarginRow, k: ColKey): Decimal | string | null {
  const sc = (s: Scenario, f: 'cogm' | 'ratio' | 'remain') => dec(scenarioCells(r, s)[f]);
  switch (k) {
    case 'fg': return `${r.Matnr}|${r.Werks}`;
    case 'market': return `${r.Market}|${r.Channel}`;
    case 'mrp': return dec(r.Mrp);
    case 'sp': return dec(r.SellPrice);
    case 'stdCogm': return sc('STD', 'cogm'); case 'stdRatio': return sc('STD', 'ratio'); case 'stdRemain': return sc('STD', 'remain');
    case 'actCogm': return sc('ACT', 'cogm'); case 'actRatio': return sc('ACT', 'ratio'); case 'actRemain': return sc('ACT', 'remain');
    case 'budCogm': return sc('BUD', 'cogm'); case 'budRatio': return sc('BUD', 'ratio'); case 'budRemain': return sc('BUD', 'remain');
    case 'curCogm': return sc('CUR', 'cogm'); case 'curRatio': return sc('CUR', 'ratio'); case 'curRemain': return sc('CUR', 'remain');
    case 'varStd': return dec(varianceCells(r, 'STD').pct); case 'varAct': return dec(varianceCells(r, 'ACT').pct); case 'varBud': return dec(varianceCells(r, 'BUD').pct);
    case 'erosion': return dec(r.ErosionPct);
    case 'annual': return dec(r.AnnualImpactInr);
    case 'reqSp': return dec(r.ReqSpRestore); case 'reqMrp': return dec(r.ReqMrpRestore);
    case 'alert': return { H: new Decimal(3), M: new Decimal(2), L: new Decimal(1), '': new Decimal(0) }[severityOf(r)];
    case 'status': return r.Status;
  }
}
export type SortDir = 'asc' | 'desc';
export function sortRows(rows: MarginRow[], key: ColKey, dir: SortDir): MarginRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows.map((r, i) => ({ r, i, v: sortValue(r, key) })).sort((a, b) => {
    if (a.v === null && b.v === null) return a.i - b.i;
    if (a.v === null) return 1;
    if (b.v === null) return -1;
    const c = typeof a.v === 'string' || typeof b.v === 'string' ? String(a.v).localeCompare(String(b.v)) : (a.v as Decimal).cmp(b.v as Decimal);
    return c ? c * sign : a.i - b.i;
  }).map((x) => x.r);
}

/* ------------------------------ filters ------------------------------ */
export type SevFilter = 'all' | 'H' | 'M' | 'L' | 'none';
export type StatusFilter = 'all' | 'ok' | 'P' | 'S' | 'C';
export interface BoardFilters { search: string; severity: SevFilter; status: StatusFilter }
export const NO_FILTERS: BoardFilters = { search: '', severity: 'all', status: 'all' };
export const filtersActive = (f: BoardFilters): boolean => !!f.search.trim() || f.severity !== 'all' || f.status !== 'all';
export function filterRows(rows: MarginRow[], f: BoardFilters): MarginRow[] {
  const s = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.severity !== 'all' && (f.severity === 'none' ? severityOf(r) !== '' : severityOf(r) !== f.severity)) return false;
    if (f.status !== 'all' && (f.status === 'ok' ? r.Status !== '' : r.Status !== f.status)) return false;
    if (s && !`${r.Matnr} ${r.Maktx} ${r.Werks} ${r.Market} ${r.Channel} ${r.Prodha} ${r.Brand} ${r.Msg}`.toLowerCase().includes(s)) return false;
    return true;
  });
}
/** Counts for the filter chips (row counts only). */
export function countBy(rows: MarginRow[]): { total: number; high: number; medium: number; low: number; noPrice: number; noStd: number; noCur: number } {
  let high = 0, medium = 0, low = 0, noPrice = 0, noStd = 0, noCur = 0;
  for (const r of rows) {
    const s = severityOf(r); if (s === 'H') high++; else if (s === 'M') medium++; else if (s === 'L') low++;
    if (r.Status === 'P') noPrice++; else if (r.Status === 'S') noStd++; else if (r.Status === 'C') noCur++;
  }
  return { total: rows.length, high, medium, low, noPrice, noStd, noCur };
}

/* ------------------------------ row details ------------------------------ */
/** The query of one row's detail reads (drivers, alerts): the run's own settings narrowed to that finished good and plant. With order prices SAP
 * gives Market = sales organisation and Channel = "<channel>/<document type>", so those go back as the sales-area filters; with uploaded prices
 * Market and Channel go as they are. */
export function detailQuery(q: MarginQuery, r: Pick<MarginRow, 'Matnr' | 'Werks' | 'Market' | 'Channel'>): MarginQuery {
  const base: MarginQuery = { ...q, materials: [r.Matnr], plants: r.Werks ? [r.Werks] : [], prodha: '', brand: '' };
  if (q.priceSrc === 'O') {
    const [vtweg, auart] = r.Channel.split('/');
    return { ...base, market: '', channel: '', vkorg: r.Market ? [r.Market] : [], vtweg: vtweg ? [vtweg] : [], auart: auart ? { in: [auart], ex: q.auart?.ex ?? [] } : q.auart ?? EMPTY_LIST };
  }
  return { ...base, market: r.Market, channel: r.Channel };
}
/** History is read from stored snapshots by finished good, plant, market and channel (the raw values of the row). */
export const historyQuery = (r: Pick<MarginRow, 'Matnr' | 'Werks' | 'Market' | 'Channel'>, daysBack: number): MarginQuery => ({ materials: [r.Matnr], plants: r.Werks ? [r.Werks] : [], market: r.Market, channel: r.Channel, daysBack });

export const COST_PARTS = [['Rm', 'Raw material'], ['Pm', 'Packing material'], ['Perf', 'Perfume'], ['Conv', 'Conversion'], ['Oth', 'Other']] as const;
export interface SplitPart { key: string; label: string; std: string; cur: string }
/** The cost parts SAP sent for the Standard and Current scenario (each as it came; '' = n/a). */
export function costSplit(r: MarginRow): SplitPart[] {
  return COST_PARTS.map(([k, label]) => ({ key: k, label, std: r[`Std${k}` as 'StdRm'], cur: r[`Cur${k}` as 'CurRm'] }));
}
export const hasSplit = (r: MarginRow): boolean => costSplit(r).some((p) => hasAmt(p.std) || hasAmt(p.cur));
/** A driver row with no standard price or no rate has no price effect: shown as such, never as 0. */
export const noEffect = (d: { NoStd: boolean; NoRate: boolean }): boolean => d.NoStd || d.NoRate;
export function noEffectReason(d: { NoStd: boolean; NoRate: boolean }): string {
  return d.NoStd && d.NoRate ? 'no standard price and no rate' : d.NoStd ? 'no standard price' : d.NoRate ? 'no rate' : '';
}
