/**
 * Component wise comparison of one finished good (Margin > Breakup): ACTUAL (consumption of the sold batches' process orders), BUDGET (ZMM_FBUDCOST_DET of the matched
 * valuation type) and the cost at a chosen RATE TYPE (BOM costing quantity x the rate of that type, same figures as BOM costing > Rate summary). All per piece, in INR.
 * Variance = compared figure - budget (positive = costs more than budget). A component missing on one side counts as 0 there and is flagged.
 */
import Decimal from 'decimal.js';
import type { BudGroup, Cat, Cdrill } from './cdrill';
import { defaultQuery } from '../query/schema';
import { api } from '../client/api';
import { attachRateOptions, fetchRateOptions } from '../rates/options';
import { rateSummary, type RateType } from '../cost/rateSummary';

const ZERO = new Decimal(0);
const catOf = (c: string): Cat => (c === 'RM' ? 'R' : c === 'PM' ? 'P' : c === 'PERFUME' ? 'F' : 'O');
export const stripZeros = (m: string) => m.replace(/^0+/, '');

/** One costed component at the chosen rate type: BOM quantity per piece, the rate and their product. */
export interface RateComp { key: string; maktx: string; cat: Cat; qtyPc: Decimal; rate: Decimal | null; costPc: Decimal }
export interface RateCosting { werks: string; type: RateType; comps: Map<string, RateComp>; priced: number; leaves: number; notes: string[] }

/** Runs BOM costing for the finished good in one plant and takes every component's rate of `type`. Heavy (live costing): only on request. */
export async function costComponents(werks: string, matnr: string, type: RateType, signal?: AbortSignal): Promise<RateCosting> {
  const q = { ...defaultQuery('B'), materials: [stripZeros(matnr)], plants: [werks] };
  const cost = await api.cost(q, signal);
  let lines = cost.rows; const notes: string[] = [];
  const rates = await fetchRateOptions(q, { signal });
  if ('unavailable' in rates) notes.push(`${rates.reason} Only the rate SAP selected is available.`); else lines = attachRateOptions(lines, rates.rows);
  const sum = rateSummary(lines, q.explQty);
  const expl = new Decimal(String(q.explQty || 1)).gt(0) ? new Decimal(String(q.explQty || 1)) : new Decimal(1);
  const comps = new Map<string, RateComp>();
  let priced = 0, leaves = 0;
  for (const c of [...sum.rm, ...sum.pm, ...sum.other]) {
    const qtyPc = c.qty.div(expl); const rate = c.rates[type];
    const key = stripZeros(c.idnrk);
    const prev = comps.get(key);
    const costPc = rate ? qtyPc.times(rate) : ZERO;
    leaves++; if (rate) priced++;
    comps.set(key, { key, maktx: c.maktx, cat: catOf(c.cat), qtyPc: (prev?.qtyPc ?? ZERO).plus(qtyPc), rate, costPc: (prev?.costPc ?? ZERO).plus(costPc) });
  }
  return { werks, type, comps, priced, leaves, notes };
}

export interface CmpRow {
  key: string; maktx: string; cat: Cat; meins: string;
  actQty: Decimal | null; actCost: Decimal | null;
  budQty: Decimal | null; budCost: Decimal | null;
  rateQty: Decimal | null; rateCost: Decimal | null; rate: Decimal | null;
  actVar: Decimal | null; actVarPct: Decimal | null;     // actual - budget
  rateVar: Decimal | null; rateVarPct: Decimal | null;   // rate type cost - budget
}
export interface CmpTotals { actual: Decimal; budget: Decimal; rate: Decimal; actVar: Decimal; rateVar: Decimal }
export interface Compare { rows: CmpRow[]; byCat: Record<Cat, CmpTotals>; total: CmpTotals }

const pct = (v: Decimal, base: Decimal | null) => (base && base.gt(0) ? v.div(base).times(100) : null);
const emptyTot = (): CmpTotals => ({ actual: ZERO, budget: ZERO, rate: ZERO, actVar: ZERO, rateVar: ZERO });

export function buildCompare(actual: Cdrill | null, bud: BudGroup | null, rate: RateCosting | null): Compare {
  const m = new Map<string, CmpRow>();
  const row = (key: string, maktx: string, cat: Cat, meins: string): CmpRow => {
    let r = m.get(key);
    if (!r) { r = { key, maktx, cat, meins, actQty: null, actCost: null, budQty: null, budCost: null, rateQty: null, rateCost: null, rate: null, actVar: null, actVarPct: null, rateVar: null, rateVarPct: null }; m.set(key, r); }
    return r;
  };
  if (actual) for (const k of ['R', 'P', 'F', 'O'] as Cat[]) for (const c of actual.comps[k]) {
    const r = row(stripZeros(c.matnr), c.maktx, k, c.meins);
    r.actQty = (r.actQty ?? ZERO).plus(c.qtyPc); r.actCost = (r.actCost ?? ZERO).plus(c.costPc);
  }
  if (bud && bud.flag !== 'NBC') for (const b of bud.items) {
    const r = row(stripZeros(b.matnr), b.maktx, b.cat, b.meins);
    if (!r.maktx) r.maktx = b.maktx;
    r.budQty = (r.budQty ?? ZERO).plus(b.qty); r.budCost = (r.budCost ?? ZERO).plus(b.costPc);
  }
  if (rate) for (const c of rate.comps.values()) {
    const r = row(c.key, c.maktx, c.cat, '');
    if (!r.maktx) r.maktx = c.maktx;
    r.rateQty = c.qtyPc; r.rateCost = c.rate ? c.costPc : null; r.rate = c.rate;
  }
  const byCat: Record<Cat, CmpTotals> = { R: emptyTot(), P: emptyTot(), F: emptyTot(), O: emptyTot() };
  const total = emptyTot();
  const rows = Array.from(m.values());
  for (const r of rows) {
    const b = r.budCost ?? ZERO;
    if (r.actCost) { r.actVar = r.actCost.minus(b); r.actVarPct = pct(r.actVar, r.budCost); }
    else if (r.budCost) { r.actVar = ZERO.minus(b); r.actVarPct = pct(r.actVar, r.budCost); }
    if (r.rateCost) { r.rateVar = r.rateCost.minus(b); r.rateVarPct = pct(r.rateVar, r.budCost); }
    for (const t of [byCat[r.cat], total]) { t.actual = t.actual.plus(r.actCost ?? ZERO); t.budget = t.budget.plus(b); t.rate = t.rate.plus(r.rateCost ?? ZERO); }
  }
  for (const t of [...Object.values(byCat), total]) { t.actVar = t.actual.minus(t.budget); t.rateVar = t.rate.minus(t.budget); }
  rows.sort((a, b) => Math.abs((b.actVar ?? ZERO).toNumber()) - Math.abs((a.actVar ?? ZERO).toNumber()) || a.key.localeCompare(b.key));
  return { rows, byCat, total };
}

/** Tone of a variance: over budget red, under green, within +-0.5 % neutral. */
export const varTone = (v: Decimal | null, p: Decimal | null): 'bad' | 'good' | '' => (!v ? '' : p && p.abs().lt(0.5) ? '' : v.gt(0) ? 'bad' : v.lt(0) ? 'good' : '');
