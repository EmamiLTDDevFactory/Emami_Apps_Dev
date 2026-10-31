/**
 * Pure presentation logic of the Standard cost (CK13N) page. SAP computed every cost: this file only formats, filters, sorts and keys
 * what SAP sent. The ONE number computed here is the difference between two estimates in the compare view ("difference, computed here").
 */
import Decimal from 'decimal.js';
import type { CkEstimateKey } from './filter';
import type { CkCompRow, CkHeaderRow, CkItemRow, CkListRow } from './types';

export const dec = (v: string | null | undefined): Decimal | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  try {
    const d = new Decimal(String(v).trim());
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
};

/* ------------------------------ status chips ------------------------------ */
export type StatusTone = 'good' | 'info' | 'neutral';
/** The tone comes from SAP's own status TEXT (never from a hard-coded status code): "released" green, "marked" blue, anything else grey. */
export function statusTone(text: string): StatusTone {
  const t = (text || '').toLowerCase();
  if (t.includes('mark')) return 'info'; // "marked for release" is not released yet, so it is checked first
  if (t.includes('releas')) return 'good';
  return 'neutral';
}

/* ------------------------------ group colours ------------------------------ */
export const OTH_COLOR = '#8B8FA3';
/** A stable colour per group code (hash of the code), grey for OTH. The same code gives the same colour on every screen and every run. */
export function groupColor(code: string): string {
  const g = (code || '').trim().toUpperCase();
  if (!g || g === 'OTH') return OTH_COLOR;
  let h = 5381;
  for (let i = 0; i < g.length; i++) h = ((h * 33) ^ g.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 42%)`;
}
export const GROUP_NAME: Record<string, string> = { RM: 'Raw material', PM: 'Packing material', CONV: 'Conversion', OVH: 'Overhead', OTH: 'Other', SUM: 'Total' };
export const groupName = (code: string): string => GROUP_NAME[code] ?? code;

/** Components in SAP's order (Seq), the total row (IsSum) kept where SAP put it. */
export const sortComps = (rows: CkCompRow[]): CkCompRow[] => [...rows].sort((a, b) => a.Seq - b.Seq);
export const partComps = (rows: CkCompRow[]): CkCompRow[] => sortComps(rows).filter((r) => !r.IsSum && r.Grp !== 'SUM');

/* ------------------------------ header card ------------------------------ */
export const STD_DIFF_OK_BELOW = 0.5;
export interface StdCheck { state: 'ok' | 'note' | 'na'; pct: Decimal | null }
/** Green check when SAP's StdDiffPct is below 0.5 (in absolute value), otherwise an amber note that carries SAP's Msg; n/a when SAP sent no difference. */
export function stdCheck(h: Pick<CkHeaderRow, 'StdDiffPct'>): StdCheck {
  const pct = dec(h.StdDiffPct);
  if (pct === null) return { state: 'na', pct: null };
  return { state: pct.abs().lt(STD_DIFF_OK_BELOW) ? 'ok' : 'note', pct };
}

/* ------------------------------ estimates ------------------------------ */
export const keyFromRow = (r: Pick<CkListRow, 'Kalnr' | 'Kadky' | 'Tvers' | 'Bwvar' | 'Kkzma'>): CkEstimateKey | null =>
  r.Kalnr && r.Kadky && r.Tvers !== undefined && r.Bwvar !== undefined ? { kalnr: r.Kalnr, kadky: r.Kadky, tvers: r.Tvers, bwvar: r.Bwvar, kkzma: r.Kkzma || undefined } : null;
export const sameKey = (a: CkEstimateKey | null, b: CkEstimateKey | null): boolean =>
  !!a && !!b && a.kalnr === b.kalnr && a.kadky === b.kadky && a.tvers === b.tvers && a.bwvar === b.bwvar && (a.kkzma ?? '') === (b.kkzma ?? '');
/** The estimate shown by default: the current standard, else the first one SAP lists. */
export const defaultEstimate = (rows: CkListRow[]): CkListRow | null => rows.find((r) => r.CurStd) ?? rows[0] ?? null;

export interface CompareRow { CompNo: string; CompTxt: string; Grp: string; Seq: number; IsSum: boolean; a: string | null; b: string | null; curA: string; curB: string; diff: string | null }
/** Components of two estimates side by side. diff = B - A (decimal.js), only when both have an amount and the same currency (never converted). */
export function compareEstimates(a: CkCompRow[], b: CkCompRow[]): CompareRow[] {
  const byNo = new Map<string, CompareRow>();
  const put = (r: CkCompRow, side: 'a' | 'b') => {
    const k = `${r.CompNo}|${r.IsSum ? 'S' : ''}`;
    const row = byNo.get(k) ?? { CompNo: r.CompNo, CompTxt: r.CompTxt, Grp: String(r.Grp), Seq: r.Seq, IsSum: r.IsSum, a: null, b: null, curA: '', curB: '', diff: null };
    row[side] = dec(r.Total) === null ? null : r.Total;
    if (side === 'a') row.curA = r.Curr; else row.curB = r.Curr;
    if (!row.CompTxt) row.CompTxt = r.CompTxt;
    row.Seq = Math.min(row.Seq, r.Seq);
    byNo.set(k, row);
  };
  a.forEach((r) => put(r, 'a'));
  b.forEach((r) => put(r, 'b'));
  const out = Array.from(byNo.values());
  for (const r of out) {
    const x = dec(r.a), y = dec(r.b);
    r.diff = x && y && r.curA === r.curB ? y.minus(x).toFixed() : null;
  }
  return out.sort((p, q) => p.Seq - q.Seq || p.CompNo.localeCompare(q.CompNo));
}

/* ------------------------------ itemization ------------------------------ */
export function itemTypes(rows: CkItemRow[]): { code: string; text: string; n: number }[] {
  const m = new Map<string, { code: string; text: string; n: number }>();
  for (const r of rows) {
    const e = m.get(r.Typps) ?? { code: r.Typps, text: r.TyppsTxt || r.Typps, n: 0 };
    e.n++;
    m.set(r.Typps, e);
  }
  return Array.from(m.values());
}
export function filterItems(rows: CkItemRow[], types: ReadonlySet<string>, q: string): CkItemRow[] {
  const t = q.trim().toLowerCase();
  return rows.filter((r) => (!types.size || types.has(r.Typps)) && (!t || `${r.Posnr} ${r.Idnrk} ${r.ItemTxt} ${r.KstarTxt} ${r.Kstar} ${r.Kostl} ${r.Lstar} ${r.TyppsTxt}`.toLowerCase().includes(t)));
}

/* ------------------------------ breadcrumb stack (?stack=) ------------------------------ */
/** The materials drilled into with "Open estimate", in order. The first selected material is not part of it. */
export const encodeStack = (stack: readonly string[]): string => stack.filter(Boolean).join(',');
export const decodeStack = (raw: string | null | undefined): string[] => (raw ? raw.split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean) : []);
export const pushStack = (stack: readonly string[], matnr: string): string[] => (matnr && stack[stack.length - 1] !== matnr ? [...stack, matnr] : [...stack]);
export const popStack = (stack: readonly string[]): string[] => stack.slice(0, -1);
/** Material of the view that is open: the top of the stack, else the selected one. */
export const currentMaterial = (root: string, stack: readonly string[]): string => stack[stack.length - 1] ?? root;
export const breadcrumb = (root: string, stack: readonly string[]): string[] => [root, ...stack].filter(Boolean);

/* ------------------------------ Copy for SAP ------------------------------ */
/** The key values of an estimate, ready to type into CK13N. */
export function sapKeyText(h: CkHeaderRow, fmtDay: (iso: string | null) => string): string {
  const L = (k: string, v: string | null | undefined) => `${k}: ${v || '-'}`;
  return [
    L('Material', h.Matnr), L('Plant', h.Werks), L('Costing variant', h.Klvar), L('Costing version', h.Tvers), L('Valuation variant', h.Bwvar),
    L('Costing date from', fmtDay(h.Kadat)), L('Costing date to', fmtDay(h.Bidat)), L('Costing lot size', [h.Losgr, h.Meeht].filter(Boolean).join(' ')),
    L('Cost estimate number (Kalnr)', h.Kalnr), L('Costing key date (Kadky)', fmtDay(h.Kadky)), L('Costing type (Kkzma)', h.Kkzma), L('Status', h.StatusTxt || h.Status),
  ].join('\n');
}
