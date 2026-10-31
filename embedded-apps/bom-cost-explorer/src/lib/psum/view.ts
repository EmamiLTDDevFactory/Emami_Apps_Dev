/**
 * Pure aggregation for the Plant production summary. SAP sends per-unit actual costs (WacRowSet) and per-unit component costs
 * (WacCompSet); the plant figures here are those SAP numbers multiplied by the quantity SAP says was produced and added up
 * (decimal.js). That multiplication and sum is the only arithmetic done here and the screen says so.
 */
import Decimal from 'decimal.js';
import { dec } from '../wac/view';
import type { WacCompRow, WacRow } from '../wac/types';

const Z = new Decimal(0);
const d = (v: string | null | undefined): Decimal => dec(v) ?? Z;

export type CostKey = 'rm' | 'pm' | 'perf' | 'conv';
export const COST_KEYS: CostKey[] = ['rm', 'pm', 'perf', 'conv'];
export const COST_LABEL: Record<CostKey | 'other' | 'landed', string> = { rm: 'Raw material', pm: 'Packing material', perf: 'Perfume', conv: 'Conversion', other: 'Other / reconciliation', landed: 'Total (landed)' };

export interface FgValue { key: string; row: WacRow; qty: Decimal; rm: Decimal; pm: Decimal; perf: Decimal; conv: Decimal; landed: Decimal; other: Decimal }

export const fgKey = (r: { Werks: string; Matnr: string }) => `${r.Werks}|${r.Matnr}`;

/** One finished good: SAP's per-unit figure x the quantity produced. "Other" is landed minus the four parts (a data-quality gap). */
export function fgValue(r: WacRow): FgValue {
  const qty = d(r.Qty);
  const rm = d(r.ActRm).times(qty), pm = d(r.ActPm).times(qty), perf = d(r.ActPerf).times(qty), conv = d(r.ActConv).times(qty), landed = d(r.ActLanded).times(qty);
  return { key: fgKey(r), row: r, qty, rm, pm, perf, conv, landed, other: landed.minus(rm).minus(pm).minus(perf).minus(conv) };
}

/** Produced finished goods only (quantity above zero), largest total value first, then by material number. */
export function fgValues(rows: WacRow[]): FgValue[] {
  return rows.map(fgValue).filter((v) => v.qty.gt(0)).sort((a, b) => b.landed.cmp(a.landed) || a.row.Matnr.localeCompare(b.row.Matnr));
}

export interface PlantTotals {
  fgs: number; docs: number; batches: number; qtyByUom: { uom: string; qty: Decimal }[];
  rm: Decimal; pm: Decimal; perf: Decimal; conv: Decimal; landed: Decimal; other: Decimal;
}
export function plantTotals(values: FgValue[]): PlantTotals {
  const by = new Map<string, Decimal>();
  let rm = Z, pm = Z, perf = Z, conv = Z, landed = Z, docs = 0, batches = 0;
  for (const v of values) {
    by.set(v.row.Uom, (by.get(v.row.Uom) ?? Z).plus(v.qty));
    rm = rm.plus(v.rm); pm = pm.plus(v.pm); perf = perf.plus(v.perf); conv = conv.plus(v.conv); landed = landed.plus(v.landed);
    docs += v.row.Docs; batches += v.row.Batches;
  }
  return { fgs: new Set(values.map((v) => v.row.Matnr)).size, docs, batches, qtyByUom: [...by].map(([uom, qty]) => ({ uom, qty })).sort((a, b) => b.qty.cmp(a.qty)),
    rm, pm, perf, conv, landed, other: landed.minus(rm).minus(pm).minus(perf).minus(conv) };
}

/** Share of a part of a total in percent (null when the total is zero). */
export const sharePct = (part: Decimal, total: Decimal): Decimal | null => (total.isZero() ? null : part.div(total).times(100));

export interface CostMixPart { key: CostKey | 'other'; label: string; value: Decimal; pct: Decimal | null }
export function costMix(t: PlantTotals): CostMixPart[] {
  const parts: [CostKey | 'other', Decimal][] = [['rm', t.rm], ['pm', t.pm], ['perf', t.perf], ['conv', t.conv], ['other', t.other]];
  return parts.filter(([k, v]) => k !== 'other' || !v.abs().lt(t.landed.abs().times(0.005))).map(([key, value]) => ({ key, label: COST_LABEL[key], value, pct: sharePct(value, t.landed) }));
}

/** The finished goods whose components are loaded: the first `n` of the value ranking (all when n is 0). */
export const pickForComponents = (values: FgValue[], n: number): FgValue[] => (n > 0 ? values.slice(0, n) : values);
export const chunk = <T,>(items: T[], size: number): T[][] => { const o: T[][] = []; for (let i = 0; i < items.length; i += size) o.push(items.slice(i, i + size)); return o; };

export interface CompAgg { idnrk: string; text: string; grp: string; uom: string; qty: Decimal; cost: Decimal; avgRate: Decimal | null; fgs: number; sharePct: Decimal | null; noCostFgs: number }
/** Components summed over the loaded finished goods: quantity = QtyPu x quantity produced, cost = SAP's cost at the selected rate x
 * quantity produced. A component is kept per unit of measure (never added across units). A row with no cost from SAP adds quantity
 * but no cost and is counted in noCostFgs, so the cost is never shown as a zero that SAP did not send. */
export function aggregateComponents(comps: WacCompRow[], qtyOf: Map<string, Decimal>): CompAgg[] {
  const m = new Map<string, CompAgg>();
  const seenFg = new Map<string, Set<string>>();
  for (const c of comps) {
    const q = qtyOf.get(fgKey(c));
    if (!q || q.isZero()) continue;
    const key = `${c.Idnrk}|${c.Uom}`;
    const a = m.get(key) ?? { idnrk: c.Idnrk, text: c.CompTxt, grp: c.Grp, uom: c.Uom, qty: Z, cost: Z, avgRate: null, fgs: 0, sharePct: null, noCostFgs: 0 };
    a.qty = a.qty.plus(d(c.QtyPu).times(q));
    const cost = dec(c.CostSel);
    if (cost === null) a.noCostFgs++; else a.cost = a.cost.plus(cost.times(q));
    const s = seenFg.get(key) ?? new Set<string>();
    if (!s.has(fgKey(c))) { s.add(fgKey(c)); a.fgs++; }
    seenFg.set(key, s);
    m.set(key, a);
  }
  const rows = [...m.values()];
  const total = rows.reduce((s, r) => s.plus(r.cost), Z);
  for (const r of rows) { r.avgRate = r.qty.isZero() || r.cost.isZero() ? null : r.cost.div(r.qty); r.sharePct = sharePct(r.cost, total); }
  return rows.sort((a, b) => b.cost.cmp(a.cost) || a.idnrk.localeCompare(b.idnrk));
}

export interface GrpAgg { grp: string; cost: Decimal; pct: Decimal | null; comps: number }
export function groupTotals(rows: CompAgg[]): GrpAgg[] {
  const m = new Map<string, GrpAgg>();
  for (const r of rows) { const g = m.get(r.grp) ?? { grp: r.grp, cost: Z, pct: null, comps: 0 }; g.cost = g.cost.plus(r.cost); g.comps++; m.set(r.grp, g); }
  const out = [...m.values()];
  const total = out.reduce((s, g) => s.plus(g.cost), Z);
  for (const g of out) g.pct = sharePct(g.cost, total);
  return out.sort((a, b) => b.cost.cmp(a.cost));
}

export interface MonthPoint { key: string; label: string; fgs: number; qtyByUom: PlantTotals['qtyByUom']; landed: Decimal; rm: Decimal; pm: Decimal; perf: Decimal; conv: Decimal }
export const monthPoint = (key: string, label: string, rows: WacRow[]): MonthPoint => { const t = plantTotals(fgValues(rows)); return { key, label, fgs: t.fgs, qtyByUom: t.qtyByUom, landed: t.landed, rm: t.rm, pm: t.pm, perf: t.perf, conv: t.conv }; };
