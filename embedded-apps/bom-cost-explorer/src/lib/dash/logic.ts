/** Pure logic of the Costing dashboard. SAP gives the budget and actual totals; the only arithmetic here is the variance (actual minus budget,
 *  both over the finished goods that HAVE a budget), its percentage, the lakh display and the rule-based notes. No model, no guesses. */
import Decimal from 'decimal.js';
import type { MisRow } from './types';

export const LAKH = new Decimal(100000);
export const AMBER_PCT = 2;   // variance % from which a brand is amber
export const RED_PCT = 3;     // ... and red (the thresholds of the agreed mock)

const d = (v: string | number | null | undefined) => { try { return new Decimal(String(v ?? '0') || '0'); } catch { return new Decimal(0); } };
export const toLakh = (v: Decimal) => v.div(LAKH);

export interface Window { qty: Decimal; budget: Decimal; actual: Decimal; actualCmp: Decimal; variance: Decimal; variancePct: Decimal | null }
export interface BrandView { brand: string; fgCnt: number; fgNoBudget: number; version: string; gjahr: string; ftm: Window; ytm: Window; msg: string; band: Band }
export type Band = 'good' | 'amber' | 'red' | 'none';

export function windowOf(qty: string, budget: string, actual: string, actualCmp: string): Window {
  const b = d(budget), c = d(actualCmp), v = c.minus(b);
  return { qty: d(qty), budget: b, actual: d(actual), actualCmp: c, variance: v, variancePct: b.gt(0) ? v.div(b).times(100) : null };
}
export const bandOf = (pct: Decimal | null): Band => (pct === null ? 'none' : pct.gt(RED_PCT) ? 'red' : pct.gt(AMBER_PCT) ? 'amber' : 'good');

export function brandViews(rows: MisRow[]): BrandView[] {
  return rows.map((r) => {
    const ytm = windowOf(r.YtmQty, r.YtmBudget, r.YtmActual, r.YtmActualCmp);
    return { brand: r.Zbrand, fgCnt: r.FgCnt, fgNoBudget: r.FgNobud, version: r.Version, gjahr: r.Gjahr, ftm: windowOf(r.FtmQty, r.FtmBudget, r.FtmActual, r.FtmActualCmp), ytm, msg: r.Msg, band: bandOf(ytm.variancePct) };
  });
}

export function totals(b: BrandView[]): { ftm: Window; ytm: Window } {
  const sum = (pick: (x: BrandView) => Window): Window => {
    const w = b.map(pick);
    const add = (f: (x: Window) => Decimal) => w.reduce((s, x) => s.plus(f(x)), new Decimal(0));
    const bud = add((x) => x.budget), cmp = add((x) => x.actualCmp), v = cmp.minus(bud);
    return { qty: add((x) => x.qty), budget: bud, actual: add((x) => x.actual), actualCmp: cmp, variance: v, variancePct: bud.gt(0) ? v.div(bud).times(100) : null };
  };
  return { ftm: sum((x) => x.ftm), ytm: sum((x) => x.ytm) };
}

export interface Insight { type: 'Variance' | 'Coverage' | 'Summary'; role: string; text: string }
const L = (v: Decimal) => `₹${toLakh(v.abs()).toFixed(1)} lakh`;
const P = (v: Decimal) => `${v.toFixed(1)} %`;

/** Rule-based notes from the numbers above, each stating only what they show (thresholds: red above 3 %, amber above 2 %). */
export function insights(b: BrandView[]): Insight[] {
  const out: Insight[] = [];
  const t = totals(b);
  if (t.ytm.variancePct !== null) {
    out.push({ type: 'Summary', role: 'All brands', text: `Year to date, actual COGM is ${L(t.ytm.variance)} ${t.ytm.variance.gte(0) ? 'above' : 'below'} the approved budget (${P(t.ytm.variancePct.abs())}), measured on the finished goods that have a budget.` });
  }
  for (const x of b) {
    if (x.band === 'red' || x.band === 'amber') {
      out.push({ type: 'Variance', role: `Brand ${x.brand}`, text: `${x.band === 'red' ? 'Red' : 'Amber'}: year-to-date actual COGM is ${P(x.ytm.variancePct as Decimal)} above budget (${L(x.ytm.variance)}).` });
    }
    if (x.fgNoBudget > 0) {
      out.push({ type: 'Coverage', role: `Brand ${x.brand}`, text: `${x.fgNoBudget} of ${x.fgCnt} finished goods have no approved budget and are not in the comparison.` });
    }
  }
  return out;
}
