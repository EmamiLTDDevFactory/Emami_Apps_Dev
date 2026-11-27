/**
 * Variance check maths on SAP's rows. SAP computes every figure (cost per piece, MBEW price, Diff %, variance value); this file only
 * filters by the threshold, sorts, and adds up already-computed variances (order totals, the cause list across orders).
 * Sign convention = ZMM_PCOST: Diff % = (standard - actual) / standard x 100, so a NEGATIVE Diff % is an order (or a component) COSTLIER than standard.
 */
import Decimal from 'decimal.js';
import type { PoVarRow } from './fields';
import type { StdExplosion } from '../dash/ckItemVariance';

export type Direction = 'both' | 'costlier' | 'cheaper';
/** Which standard an order is flagged against: the MBEW price (as ZMM_PCOST), the CK13N current standard estimate, or either of them. */
export type Basis = 'mbew' | 'ck' | 'either';
export const BASIS_LABEL: Record<Basis, string> = { mbew: 'MBEW (as ZMM_PCOST)', ck: 'CK13N', either: 'MBEW or CK13N' };
export const DIRECTION_LABEL: Record<Direction, string> = { both: 'Both ways', costlier: 'Costlier than standard', cheaper: 'Cheaper than standard' };
export const CAT_LABEL: Record<string, string> = { R: 'Raw material', P: 'Packing material', F: 'Perfume', W: 'WIP / bulk', O: 'Other' };
export const PRICE_CONTROL: Record<string, string> = { S: 'Standard price (STPRS)', V: 'Moving average (VERPR)' };

const ZERO = new Decimal(0);
export const dec = (v: string | null | undefined): Decimal | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  try { const d = new Decimal(String(v).trim()); return d.isFinite() ? d : null; } catch { return null; }
};
const z = (v: string | null | undefined) => dec(v) ?? ZERO;
export const strip = (v: string) => String(v ?? '').trim().replace(/^0+(?=\d)/, '');

/** A row SAP could value (it has a standard price and an actual cost). */
export const hasStd = (r: PoVarRow): boolean => !!dec(r.StdPc) && !z(r.StdPc).isZero() && !!dec(r.ActPc) && !z(r.ActPc).isZero();

/** A row SAP could compare with CK13N (an estimate was found and there is an actual cost). */
export const hasCk = (r: PoVarRow): boolean => !!dec(r.CkPc) && !z(r.CkPc).isZero() && !!dec(r.ActPc) && !z(r.ActPc).isZero();

const over = (d: Decimal, pct: number, dir: Direction) => !d.abs().lt(pct) && (dir === 'both' || (dir === 'costlier' ? d.isNegative() : d.isPositive()));
/** Whether a row's Diff % crosses the threshold in the chosen direction, against the chosen standard. Rows without that standard never do. */
export function crosses(r: PoVarRow, pct: number, dir: Direction, basis: Basis = 'mbew'): boolean {
  const m = basis !== 'ck' && hasStd(r) && over(z(r.DiffPct), pct, dir);
  const c = basis !== 'mbew' && hasCk(r) && over(z(r.CkDiffPct), pct, dir);
  return m || c;
}
/** The Diff % the row is judged on: MBEW, CK13N, or (either) the larger of the two in absolute terms. */
export function diffOf(r: PoVarRow, basis: Basis): Decimal | null {
  const m = hasStd(r) ? z(r.DiffPct) : null, c = hasCk(r) ? z(r.CkDiffPct) : null;
  if (basis === 'mbew') return m;
  if (basis === 'ck') return c;
  if (m && c) return m.abs().gte(c.abs()) ? m : c;
  return m ?? c;
}
const varOf = (r: PoVarRow, basis: Basis): Decimal => {
  if (basis === 'mbew') return z(r.VarVal);
  if (basis === 'ck') return z(r.CkVarVal);
  const d = diffOf(r, basis);
  return d && hasCk(r) && d.eq(z(r.CkDiffPct)) && !(hasStd(r) && d.eq(z(r.DiffPct))) ? z(r.CkVarVal) : z(r.VarVal);
};

export interface Split { receipts: PoVarRow[]; messages: PoVarRow[] }
export const splitRows = (rows: PoVarRow[]): Split => ({ receipts: rows.filter((r) => r.Grain === 'O'), messages: rows.filter((r) => r.Grain === 'M') });

export interface OrderStats { receipts: number; orders: number; flagged: number; costlier: number; cheaper: number; noStd: number; varFlagged: Decimal; varAll: Decimal }
export function orderStats(receipts: PoVarRow[], pct: number, dir: Direction, basis: Basis = 'mbew'): OrderStats {
  const s: OrderStats = { receipts: receipts.length, orders: new Set(receipts.map((r) => r.Aufnr)).size, flagged: 0, costlier: 0, cheaper: 0, noStd: 0, varFlagged: ZERO, varAll: ZERO };
  for (const r of receipts) {
    const d = diffOf(r, basis);
    if (!d) { s.noStd++; continue; }
    s.varAll = s.varAll.plus(varOf(r, basis));
    if (crosses(r, pct, dir, basis)) {
      s.flagged++;
      s.varFlagged = s.varFlagged.plus(varOf(r, basis));
      if (d.isNegative()) s.costlier++; else s.cheaper++;
    }
  }
  return s;
}

/** Biggest absolute Diff % (of the chosen standard) first, rows without that standard last, then order number. */
export function sortReceipts(rows: PoVarRow[], basis: Basis = 'mbew'): PoVarRow[] {
  return [...rows].sort((a, b) => {
    const da = diffOf(a, basis), db = diffOf(b, basis);
    if (!!da !== !!db) return da ? -1 : 1;
    return (db ?? ZERO).abs().comparedTo((da ?? ZERO).abs()) || strip(a.Aufnr).localeCompare(strip(b.Aufnr));
  });
}

/* ------------------------------- breakup of one order (ZMM_COST) ------------------------------- */
export interface Breakup {
  header: PoVarRow | null;
  /** consumed components (not WIP), biggest absolute variance first */
  comps: PoVarRow[];
  wip: PoVarRow[];
  messages: PoVarRow[];
  /** sum of the components' variance (actual value - MBEW price x actual quantity) */
  compVar: Decimal;
  /** components without an MBEW price (not in compVar) */
  noStd: number;
  fgQty: Decimal;
}
export function breakupOf(rows: PoVarRow[]): Breakup {
  const comps = rows.filter((r) => r.Grain === 'C');
  const sorted = [...comps].sort((a, b) => z(b.VarVal).abs().comparedTo(z(a.VarVal).abs()) || strip(a.Matnr).localeCompare(strip(b.Matnr)));
  const header = rows.find((r) => r.Grain === 'H') ?? null;
  return {
    header, comps: sorted, wip: rows.filter((r) => r.Grain === 'W'), messages: rows.filter((r) => r.Grain === 'M'),
    compVar: comps.reduce((t, r) => t.plus(hasStd(r) ? z(r.VarVal) : ZERO), ZERO),
    noStd: comps.filter((r) => !hasStd(r)).length,
    fgQty: z(header?.FgQty ?? comps[0]?.FgQty),
  };
}
/** A component's share of the order's component variance (same sign = it drives the variance), in %. null when the total is 0. */
export function shareOf(r: PoVarRow, total: Decimal): Decimal | null {
  if (total.isZero() || !hasStd(r)) return null;
  return z(r.VarVal).div(total).times(100);
}

/* ------------------------------- components against CK13N ------------------------------- */
/**
 * One line per material: the order's actual consumption (ZMM_COST) against the CK13N costing structure of the finished good, scaled to the
 * pieces produced. Rate variance = actual value - CK13N rate x actual quantity; quantity variance = (actual quantity - CK13N quantity) x CK13N rate;
 * together = actual value - CK13N value (the split only when both sides use the same unit; otherwise just the total). A CK13N line that was not consumed
 * is all quantity variance (negative); a material consumed but not in CK13N is all variance.
 */
export interface CkCompLine {
  matnr: string; maktx: string; cat: string; via: string; actUom: string; ckUom: string;
  actQty: Decimal | null; actVal: Decimal | null; actRate: Decimal | null;
  ckQty: Decimal | null; ckVal: Decimal | null; ckRate: Decimal | null;
  rateVar: Decimal | null; qtyVar: Decimal | null; totVar: Decimal; diffPct: Decimal | null; qtyPct: Decimal | null;
  status: 'both' | 'ck-only' | 'actual-only';
  /** the SAP row (MBEW side), when consumed */
  row: PoVarRow | null;
}
export interface CkCompare { lines: CkCompLine[]; rateVar: Decimal; qtyVar: Decimal; totVar: Decimal; convCk: Decimal; fgQty: Decimal }
const catOfMtart = (m: string) => (['VERP', 'PKGN'].includes(String(m).toUpperCase()) ? 'P' : String(m).toUpperCase() === 'ROH' ? 'R' : 'O');
export function ckCompare(comps: PoVarRow[], exp: StdExplosion, fgQty: Decimal): CkCompare {
  const act = new Map<string, { qty: Decimal; val: Decimal; row: PoVarRow }>();
  for (const r of comps) {
    if (r.Grain !== 'C') continue;
    const k = strip(r.Matnr);
    const e = act.get(k);
    act.set(k, e ? { qty: e.qty.plus(z(r.Menge)), val: e.val.plus(z(r.Total)), row: e.row } : { qty: z(r.Menge), val: z(r.Total), row: r });
  }
  const std = new Map<string, { qtyPc: Decimal; valPc: Decimal; uom: string; text: string; mtart: string; via: Set<string> }>();
  for (const l of exp.lines) {
    const k = strip(l.matnr);
    const e = std.get(k);
    if (e) { e.qtyPc = e.qtyPc.plus(l.qtyPc); e.valPc = e.valPc.plus(l.valPc); if (l.via) e.via.add(strip(l.via)); }
    else std.set(k, { qtyPc: l.qtyPc, valPc: l.valPc, uom: l.uom, text: l.text, mtart: l.mtart, via: new Set(l.via ? [strip(l.via)] : []) });
  }
  const lines: CkCompLine[] = [];
  for (const k of new Set([...act.keys(), ...std.keys()])) {
    const a = act.get(k), s = std.get(k);
    const ckQty = s ? s.qtyPc.times(fgQty) : null, ckVal = s ? s.valPc.times(fgQty) : null;
    const ckRate = s && !s.qtyPc.isZero() ? s.valPc.div(s.qtyPc) : null;
    const actRate = a && !a.qty.isZero() ? a.val.div(a.qty) : null;
    const same = !!a && !!s && (a.row.Meins || '').toUpperCase() === (s.uom || '').toUpperCase();
    const totVar = (a?.val ?? ZERO).minus(ckVal ?? ZERO);
    let rateVar: Decimal | null = null, qtyVar: Decimal | null = null;
    if (a && s && same && ckRate) { rateVar = a.val.minus(ckRate.times(a.qty)); qtyVar = a.qty.minus(ckQty!).times(ckRate); }
    else if (s && !a) qtyVar = totVar;
    lines.push({
      matnr: k, maktx: a?.row.Maktx || s?.text || '', cat: a ? a.row.Cat : catOfMtart(s!.mtart), via: s ? [...s.via].join(', ') : '',
      actUom: a?.row.Meins ?? '', ckUom: s?.uom ?? '', actQty: a?.qty ?? null, actVal: a?.val ?? null, actRate,
      ckQty, ckVal, ckRate, rateVar, qtyVar, totVar,
      diffPct: same && ckRate && actRate && !ckRate.isZero() ? ckRate.minus(actRate).div(ckRate).times(100) : null,
      qtyPct: same && ckQty && a && !ckQty.isZero() ? a.qty.minus(ckQty).div(ckQty).times(100) : null,
      status: a && s ? 'both' : s ? 'ck-only' : 'actual-only', row: a?.row ?? null,
    });
  }
  lines.sort((x, y) => y.totVar.abs().comparedTo(x.totVar.abs()) || x.matnr.localeCompare(y.matnr));
  const sum = (f: (l: CkCompLine) => Decimal | null) => lines.reduce((t, l) => t.plus(f(l) ?? ZERO), ZERO);
  return { lines, rateVar: sum((l) => l.rateVar), qtyVar: sum((l) => l.qtyVar), totVar: sum((l) => l.totVar), convCk: exp.convPc.times(fgQty), fgQty };
}

/* ------------------------------- causes across the checked orders ------------------------------- */
export interface Cause { matnr: string; maktx: string; cat: string; werks: string; orders: string[]; qty: Decimal; meins: string; actVal: Decimal; stdVal: Decimal; varVal: Decimal; actRate: Decimal | null; stdRate: Decimal | null; diffPct: Decimal | null; flags: string[];
  /** against CK13N (orders whose CK13N structure was read): rate, quantity and total variance */ ckRateVar: Decimal; ckQtyVar: Decimal; ckTotVar: Decimal; ckOrders: number }
/** Components of every checked order, added up per component and plant: which materials drive the variance of the day. Biggest absolute variance first. */
export function causes(breakups: Map<string, PoVarRow[]>, ck: Map<string, CkCompare> = new Map()): Cause[] {
  const m = new Map<string, Cause>();
  const blank = (matnr: string, maktx: string, cat: string, werks: string, meins: string): Cause => ({ matnr, maktx, cat, werks, orders: [], qty: ZERO, meins, actVal: ZERO, stdVal: ZERO, varVal: ZERO, actRate: null, stdRate: null, diffPct: null, flags: [], ckRateVar: ZERO, ckQtyVar: ZERO, ckTotVar: ZERO, ckOrders: 0 });
  for (const [aufnr, rows] of breakups) {
    const werks = rows.find((r) => r.Grain === 'H')?.Werks ?? rows.find((r) => r.Werks)?.Werks ?? '';
    for (const l of ck.get(aufnr)?.lines ?? []) {
      const k = `${werks}|${l.matnr}`;
      const c = m.get(k) ?? blank(l.matnr, l.maktx, l.cat, werks, l.actUom || l.ckUom);
      c.ckRateVar = c.ckRateVar.plus(l.rateVar ?? ZERO); c.ckQtyVar = c.ckQtyVar.plus(l.qtyVar ?? ZERO); c.ckTotVar = c.ckTotVar.plus(l.totVar); c.ckOrders++;
      if (!c.orders.includes(aufnr)) c.orders.push(aufnr);
      m.set(k, c);
    }
    for (const r of rows) {
      if (r.Grain !== 'C' || !hasStd(r)) continue;
      const k = `${r.Werks}|${strip(r.Matnr)}`;
      const c = m.get(k) ?? blank(strip(r.Matnr), r.Maktx, r.Cat, r.Werks, r.Meins);
      if (!c.orders.includes(aufnr)) c.orders.push(aufnr);
      c.qty = c.qty.plus(z(r.Menge)); c.actVal = c.actVal.plus(z(r.Total)); c.stdVal = c.stdVal.plus(z(r.StdVal)); c.varVal = c.varVal.plus(z(r.VarVal));
      if (r.Flag && !c.flags.includes(r.Flag)) c.flags.push(r.Flag);
      m.set(k, c);
    }
  }
  const out = [...m.values()].map((c) => {
    const actRate = c.qty.isZero() ? null : c.actVal.div(c.qty);
    const stdRate = c.qty.isZero() ? null : c.stdVal.div(c.qty);
    const diffPct = stdRate && actRate && !stdRate.isZero() ? stdRate.minus(actRate).div(stdRate).times(100) : null;
    return { ...c, actRate, stdRate, diffPct };
  });
  return out.sort((a, b) => Decimal.max(b.varVal.abs(), b.ckTotVar.abs()).comparedTo(Decimal.max(a.varVal.abs(), a.ckTotVar.abs())) || a.matnr.localeCompare(b.matnr));
}

/** Yesterday as YYYY-MM-DD (local time): the default of the daily check. */
export function yesterday(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
