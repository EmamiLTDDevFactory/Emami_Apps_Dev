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

// ---- Sales view ------------------------------------------------------------------------------------------------------
import type { PvmRow, SalesRow, ThreshRow } from './types';

/** Gross margin % bands of the agreed mock (no budget GM% exists yet): below 18 % red, below 22 % amber. */
export const GM_RED = 18;
export const GM_AMBER = 22;
export const gmBand = (p: Decimal | null, red = GM_RED, amber = GM_AMBER): Band => (p === null ? 'none' : p.lt(red) ? 'red' : p.lt(amber) ? 'amber' : 'good');

/** Bands of the GM % per SKU category from ZMIS_ALERT_THR (a blank category is the default; without any row the mock's 18 / 22 apply). */
export interface GmBands { byCategory: Map<string, { red: number; amber: number }>; fallback: { red: number; amber: number } }
export function gmBands(rows: ThreshRow[]): GmBands {
  const m = new Map<string, { red: number; amber: number }>();
  let fb = { red: GM_RED, amber: GM_AMBER };
  for (const r of rows.filter((x) => x.Metric.trim().toUpperCase() === 'GM')) {
    const b = { red: Number(r.RedPct), amber: Number(r.AmberPct) };
    if (!Number.isFinite(b.red) || !Number.isFinite(b.amber)) continue;
    if (r.Category.trim()) m.set(r.Category.trim(), b); else fb = b;
  }
  return { byCategory: m, fallback: fb };
}
export const bandsOf = (b: GmBands, category: string) => b.byCategory.get(category.trim()) ?? b.fallback;

export interface PvmStep { effect: string; value: Decimal; total: boolean; msg: string }
/** Bridge steps in SAP's order; the first and the last are the budget and actual gross margin (totals). */
export function pvmSteps(rows: PvmRow[]): PvmStep[] {
  return [...rows].sort((a, b) => a.SortNo - b.SortNo).filter((r) => r.SortNo > 0).map((r) => ({ effect: r.Effect, value: d(r.Value), total: /gross margin$/i.test(r.Effect), msg: r.Msg }));
}

export interface SalesView {
  grain: string; brand: string; matnr: string; maktx: string; vtweg: string; channel: string;
  soldQty: Decimal; gsv: Decimal; deductions: Decimal; nsv: Decimal;
  /** margin basis: only the lines that have an actual cost per piece */
  nsvCmp: Decimal; cogm: Decimal; gm: Decimal; gmPct: Decimal | null; band: Band;
  netRealPc: Decimal | null; cogmPc: Decimal | null; gmPc: Decimal | null;
  skuCnt: number; noCogm: number; msg: string;
}

export function salesViews(rows: SalesRow[], bands?: GmBands): SalesView[] {
  return rows.map((r) => {
    const q = d(r.SoldQty), nsv = d(r.Nsv), cmp = d(r.NsvCmp), cogm = d(r.Cogm), gm = cmp.minus(cogm);
    const gmPct = cmp.gt(0) ? gm.div(cmp).times(100) : null;
    const nr = !q.isZero() ? nsv.div(q) : null, cpc = d(r.CogmPc).gt(0) ? d(r.CogmPc) : null;
    return {
      grain: r.Grain, brand: r.Zbrand, matnr: r.Matnr, maktx: r.Maktx, vtweg: r.Vtweg, channel: r.VtwegTxt || r.Vtweg,
      soldQty: q, gsv: d(r.Gsv), deductions: d(r.Deductions), nsv, nsvCmp: cmp, cogm, gm, gmPct, band: bands ? gmBand(gmPct, bandsOf(bands, r.Matkl).red, bandsOf(bands, r.Matkl).amber) : gmBand(gmPct),
      netRealPc: nr, cogmPc: cpc, gmPc: nr && cpc ? nr.minus(cpc) : null, skuCnt: r.SkuCnt, noCogm: r.SkuNocogm, msg: r.Msg,
    };
  });
}
export const brandSales = (v: SalesView[]) => v.filter((x) => x.grain === 'B');
export const skuSales = (v: SalesView[]) => v.filter((x) => x.grain === 'S');

export function salesTotals(b: SalesView[]) {
  const add = (f: (x: SalesView) => Decimal) => b.reduce((s, x) => s.plus(f(x)), new Decimal(0));
  const nsvCmp = add((x) => x.nsvCmp), cogm = add((x) => x.cogm), gm = nsvCmp.minus(cogm);
  return { soldQty: add((x) => x.soldQty), gsv: add((x) => x.gsv), deductions: add((x) => x.deductions), nsv: add((x) => x.nsv), nsvCmp, cogm, gm, gmPct: nsvCmp.gt(0) ? gm.div(nsvCmp).times(100) : null };
}

// ---- Cost breakup ----------------------------------------------------------------------------------------------------
import type { WacRow } from '../wac/types';

export interface BreakupView {
  key: string; brand: string; matnr: string; maktx: string; werks: string; qty: Decimal;
  rm: Decimal; pm: Decimal; perf: Decimal; conv: Decimal; cogm: Decimal;
  /** share of each group in the COGM per piece, % (null when the COGM is 0) */
  shareRm: Decimal | null; sharePm: Decimal | null; sharePerf: Decimal | null; shareConv: Decimal | null;
}
const share = (part: Decimal, tot: Decimal) => (tot.gt(0) ? part.div(tot).times(100) : null);
function mk(key: string, brand: string, matnr: string, maktx: string, werks: string, qty: Decimal, rm: Decimal, pm: Decimal, perf: Decimal, conv: Decimal): BreakupView {
  const cogm = rm.plus(pm).plus(perf).plus(conv);
  return { key, brand, matnr, maktx, werks, qty, rm, pm, perf, conv, cogm, shareRm: share(rm, cogm), sharePm: share(pm, cogm), sharePerf: share(perf, cogm), shareConv: share(conv, cogm) };
}
/** Actual cost per piece by group (SAP's ActRm / ActPm / ActPerf / ActConv per piece, the period's figures). Only produced finished goods (quantity above 0). */
export function breakupByFg(rows: WacRow[]): BreakupView[] {
  return rows.filter((r) => d(r.Qty).gt(0)).map((r) => mk(`${r.Werks}|${r.Matnr}`, r.Zbrand, r.Matnr, r.Maktx, r.Werks, d(r.Qty), d(r.ActRm), d(r.ActPm), d(r.ActPerf), d(r.ActConv)));
}
/** Brand rows: quantity-weighted cost per piece (total group cost / total quantity). */
export function breakupByBrand(fgs: BreakupView[]): BreakupView[] {
  const by = new Map<string, BreakupView[]>();
  for (const f of fgs) by.set(f.brand, [...(by.get(f.brand) ?? []), f]);
  return Array.from(by.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([brand, list]) => {
    const q = list.reduce((s, x) => s.plus(x.qty), new Decimal(0));
    const w = (f: (x: BreakupView) => Decimal) => (q.gt(0) ? list.reduce((s, x) => s.plus(f(x).times(x.qty)), new Decimal(0)).div(q) : new Decimal(0));
    return mk(brand || '-', brand, '', `${list.length} finished goods`, '', q, w((x) => x.rm), w((x) => x.pm), w((x) => x.perf), w((x) => x.conv));
  });
}
