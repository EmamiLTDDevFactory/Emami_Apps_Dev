/**
 * Rate summary report (BOM costing > "Rate summary"): every rate type side by side, for the FGs and for their RM and
 * PM components, from SAP's cost lines (leaf rows only) and their lazy rate options. decimal.js throughout.
 *
 * Rate types (INR per component unit):
 *   SELECTED   SelRatePcInr - the rate SAP picked (by the run's priority)
 *   BUDGET     BudLanded    - budget landed rate (when the run included the budget)
 *   CONTRACT / INFOREC / MARKT / CONSUMP / MBEW
 *              the rate option of that source (the component plant's own option first)
 *   CHEAPEST   the lowest priced rate option of the line
 *
 *   FG cost per piece (type) = sum over leaf components of rate(type) x ProdQty / explosion qty
 *   A component without a rate of that type is not counted as 0: priced / leaves tells how complete the figure is.
 *   FG landed (incl. freight) = sum of leaf TotCostInr / explosion qty  (the BOM tree's total).
 *
 * Contract + freight / Info record + freight (lib/rates/withFreight): that source's rate plus the line's freight per
 * unit, in INR and in local currency; per FG piece the same sum over the components priced by that source. Not part of
 * the lowest / spread comparison (those compare material rates only).
 *
 * Plants whose currency is not INR (e.g. BDT): every INR figure also has its local value, at the rate of the lines
 * themselves (locPerInr = sum TotCostLoc / sum TotCostInr of the FG's or the component's lines).
 */
import { D, ZERO, type Decimal } from './decimal';
import { isLeafRow } from './tree';
import { costCategory, type CostCategory } from './categories';
import type { CostLine, RateOption } from '../sap/fields';
import { WITH_FREIGHT_SOURCES, rateWithFreight, sourceOption, vendorOf, vendorText, type WithFreightSource } from '../rates/withFreight';

export const RATE_TYPES = ['SELECTED', 'BUDGET', 'CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW', 'CHEAPEST'] as const;
export type RateType = (typeof RATE_TYPES)[number];
export const RATE_TYPE_LABEL: Record<RateType, string> = {
  SELECTED: 'Selected (SAP)', BUDGET: 'Budget', CONTRACT: 'Contract', INFOREC: 'Info record', MARKT: 'Market', CONSUMP: 'Consumption', MBEW: 'C-MAP', CHEAPEST: 'Cheapest',
};
/** Types that need the lazy rate options. */
export const NEEDS_OPTIONS: RateType[] = ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW', 'CHEAPEST'];

type Line = CostLine & { RateOptions?: RateOption[] };

function optionRate(l: Line, source: string): Decimal | null {
  const opts = (l.RateOptions ?? []).filter((o) => o.Source === source && D(o.RatePcInr).gt(0));
  if (!opts.length) return null;
  return D((opts.find((o) => o.Plant === l.Werks) ?? opts[0]).RatePcInr);
}

/** INR rate per component unit of one type, or null when the line has none. */
export function rateOf(l: Line, t: RateType): Decimal | null {
  switch (t) {
    case 'SELECTED': return l.SelSource && D(l.SelRatePcInr).gt(0) ? D(l.SelRatePcInr) : null;
    case 'BUDGET': return D(l.BudLanded).gt(0) ? D(l.BudLanded) : null;
    case 'CHEAPEST': {
      const v = (l.RateOptions ?? []).map((o) => D(o.RatePcInr)).filter((x) => x.gt(0));
      return v.length ? v.reduce((a, x) => (x.lt(a) ? x : a)) : null;
    }
    default: return optionRate(l, t);
  }
}

export interface Figure { value: Decimal | null; priced: number; leaves: number }

export interface FgRow {
  key: string; land1: string; hwerks: string; headmat: string; headtxt: string; leaves: number;
  perPc: Record<RateType, Figure>; // material cost per FG piece by rate type
  landedPc: Decimal | null; // incl. freight (BOM tree total / qty)
  freightPc: Decimal | null;
  cheapestType: RateType | null; // lowest complete figure among the types
  /** Contract / Info record rate + freight per FG piece; loc in the plant's currency (null when a component's could not be told) */
  withFrt: Record<WithFreightSource, { inr: Figure; loc: Decimal | null; locCurr: string }>;
  /** plant currency, and local units per INR (null when INR, or when the lines have no local / INR totals) */
  curr: string; locPerInr: Decimal | null;
}

export interface ComponentRow {
  key: string; werks: string; idnrk: string; maktx: string; meins: string; cat: CostCategory;
  qty: Decimal; fgs: number; selectedSource: string;
  rates: Record<RateType, Decimal | null>;
  min: Decimal | null; max: Decimal | null; spreadPct: Decimal | null; // over the priced types
  lowestType: RateType | null;
  /** Contract / Info record rate + freight per unit (weighted by quantity), with the vendor(s) where SAP names them */
  withFrt: Record<WithFreightSource, { inr: Decimal | null; loc: Decimal | null; locCurr: string; vendor: string }>;
  /** component plant currency, and local units per INR (null when INR or not known) */
  curr: string; locPerInr: Decimal | null;
}

/** Local value of an INR figure (null when the currency is INR or the rate is not known). */
export const toLocal = (inr: Decimal | null | undefined, locPerInr: Decimal | null) => (inr && locPerInr ? inr.times(locPerInr) : null);
const locRate = (curr: string, loc: Decimal, inr: Decimal) => (curr && curr !== 'INR' && loc.gt(0) && inr.gt(0) ? loc.div(inr) : null);

export interface RateSummary { fgs: FgRow[]; rm: ComponentRow[]; pm: ComponentRow[]; other: ComponentRow[] }

const emptyFigures = (): Record<RateType, { total: Decimal; priced: number }> =>
  Object.fromEntries(RATE_TYPES.map((t) => [t, { total: ZERO, priced: 0 }])) as Record<RateType, { total: Decimal; priced: number }>;

type FrtSum = { inr: Decimal; loc: Decimal; locOk: boolean; q: Decimal; priced: number; locCurr: string; vendors: Set<string> };
const emptyFrt = (): Record<WithFreightSource, FrtSum> => Object.fromEntries(WITH_FREIGHT_SOURCES.map((t) => [t, { inr: ZERO, loc: ZERO, locOk: true, q: ZERO, priced: 0, locCurr: '', vendors: new Set<string>() }])) as Record<WithFreightSource, FrtSum>;
function addFrt(sum: FrtSum, l: Line, src: WithFreightSource, pq: Decimal) {
  const o = sourceOption(l.RateOptions, src, l.Werks);
  const w = o ? rateWithFreight(o, l) : null;
  if (!w) return;
  sum.inr = sum.inr.plus(w.inr.times(pq));
  if (w.loc) sum.loc = sum.loc.plus(w.loc.times(pq)); else sum.locOk = false;
  if (sum.locCurr && w.locCurr && sum.locCurr !== w.locCurr) sum.locOk = false;
  sum.locCurr ||= w.locCurr;
  sum.q = sum.q.plus(pq);
  sum.priced++;
  const v = vendorText(vendorOf(o!, l));
  if (v) sum.vendors.add(v);
}

export function rateSummary(lines: Line[], explQty: string | number = 1): RateSummary {
  const qty = D(explQty).gt(0) ? D(explQty) : D(1);
  const fgs = new Map<string, { row: Omit<FgRow, 'perPc' | 'landedPc' | 'freightPc' | 'cheapestType' | 'withFrt' | 'curr' | 'locPerInr'>; fig: ReturnType<typeof emptyFigures>; landed: Decimal; landedLoc: Decimal; curr: string; freight: Decimal; frt: Record<WithFreightSource, FrtSum> }>();
  const comps = new Map<string, Omit<ComponentRow, 'withFrt' | 'locPerInr'> & { heads: Set<string>; sums: Record<RateType, { cost: Decimal; q: Decimal }>; frt: Record<WithFreightSource, FrtSum>; costLoc: Decimal; costInr: Decimal }>();

  for (const l of lines) {
    if (!isLeafRow(l)) continue;
    const hk = `${l.Land1}|${l.Hwerks}|${l.Headmat}`;
    let f = fgs.get(hk);
    if (!f) fgs.set(hk, (f = { row: { key: hk, land1: l.Land1, hwerks: l.Hwerks, headmat: l.Headmat, headtxt: l.Headtxt, leaves: 0 }, fig: emptyFigures(), landed: ZERO, landedLoc: ZERO, curr: l.LocCurr || 'INR', freight: ZERO, frt: emptyFrt() }));
    f.row.leaves++;
    const pq = D(l.ProdQty);
    f.landed = f.landed.plus(D(l.TotCostInr));
    f.landedLoc = f.landedLoc.plus(D(l.TotCostLoc));
    f.freight = f.freight.plus(D(l.FrtPcInr).times(pq));
    const ck = `${l.Werks || l.Hwerks}|${l.Idnrk}`;
    let c = comps.get(ck);
    if (!c) comps.set(ck, (c = {
      key: ck, werks: l.Werks || l.Hwerks, idnrk: l.Idnrk, maktx: l.Maktx, meins: l.Meins, cat: costCategory(l), qty: ZERO, fgs: 0, selectedSource: l.SelSource,
      rates: Object.fromEntries(RATE_TYPES.map((t) => [t, null])) as Record<RateType, Decimal | null>, min: null, max: null, spreadPct: null, lowestType: null,
      heads: new Set(), sums: Object.fromEntries(RATE_TYPES.map((t) => [t, { cost: ZERO, q: ZERO }])) as Record<RateType, { cost: Decimal; q: Decimal }>, frt: emptyFrt(),
      curr: l.LocCurr || 'INR', costLoc: ZERO, costInr: ZERO,
    }));
    c.costLoc = c.costLoc.plus(D(l.TotCostLoc));
    c.costInr = c.costInr.plus(D(l.TotCostInr));
    c.qty = c.qty.plus(pq);
    c.heads.add(hk);
    for (const src of WITH_FREIGHT_SOURCES) { addFrt(f.frt[src], l, src, pq); addFrt(c.frt[src], l, src, pq); }
    for (const t of RATE_TYPES) {
      const r = rateOf(l, t);
      if (r === null) continue;
      f.fig[t].total = f.fig[t].total.plus(r.times(pq));
      f.fig[t].priced++;
      c.sums[t].cost = c.sums[t].cost.plus(r.times(pq));
      c.sums[t].q = c.sums[t].q.plus(pq);
    }
  }

  const fgRows: FgRow[] = [...fgs.values()].map(({ row, fig, landed, landedLoc, curr, freight, frt }) => {
    const perPc = Object.fromEntries(RATE_TYPES.map((t) => [t, { value: fig[t].priced ? fig[t].total.div(qty) : null, priced: fig[t].priced, leaves: row.leaves }])) as Record<RateType, Figure>;
    const complete = RATE_TYPES.filter((t) => perPc[t].value && perPc[t].priced === row.leaves);
    const cheapestType = complete.length ? complete.reduce((a, t) => (perPc[t].value!.lt(perPc[a].value!) ? t : a)) : null;
    const withFrt = Object.fromEntries(WITH_FREIGHT_SOURCES.map((t) => [t, {
      inr: { value: frt[t].priced ? frt[t].inr.div(qty) : null, priced: frt[t].priced, leaves: row.leaves },
      loc: frt[t].priced && frt[t].locOk ? frt[t].loc.div(qty) : null, locCurr: frt[t].locCurr,
    }])) as FgRow['withFrt'];
    return { ...row, perPc, landedPc: landed.div(qty), freightPc: freight.div(qty), cheapestType, withFrt, curr, locPerInr: locRate(curr, landedLoc, landed) };
  }).sort((a, b) => a.land1.localeCompare(b.land1) || a.hwerks.localeCompare(b.hwerks) || a.headmat.localeCompare(b.headmat));

  const compRows = [...comps.values()].map(({ heads, sums, frt, costLoc, costInr, ...c }) => {
    const withFrt = Object.fromEntries(WITH_FREIGHT_SOURCES.map((t) => [t, {
      inr: frt[t].q.gt(0) ? frt[t].inr.div(frt[t].q) : null, loc: frt[t].q.gt(0) && frt[t].locOk ? frt[t].loc.div(frt[t].q) : null, locCurr: frt[t].locCurr,
      vendor: [...frt[t].vendors].join(', '),
    }])) as ComponentRow['withFrt'];
    const rates = Object.fromEntries(RATE_TYPES.map((t) => [t, sums[t].q.gt(0) ? sums[t].cost.div(sums[t].q) : null])) as Record<RateType, Decimal | null>;
    const priced = RATE_TYPES.filter((t) => t !== 'CHEAPEST' && rates[t]) as RateType[];
    const vals = priced.map((t) => rates[t]!);
    const min = vals.length ? vals.reduce((a, v) => (v.lt(a) ? v : a)) : null;
    const max = vals.length ? vals.reduce((a, v) => (v.gt(a) ? v : a)) : null;
    return { ...c, locPerInr: locRate(c.curr, costLoc, costInr), withFrt, fgs: heads.size, rates, min, max, spreadPct: min && max && min.gt(0) ? max.minus(min).div(min).times(100) : null, lowestType: min ? priced.find((t) => rates[t]!.eq(min)) ?? null : null };
  }).sort((a, b) => (b.rates.SELECTED ?? ZERO).times(b.qty).cmp((a.rates.SELECTED ?? ZERO).times(a.qty)));

  return {
    fgs: fgRows,
    rm: compRows.filter((c) => c.cat === 'RM' || c.cat === 'PERFUME'),
    pm: compRows.filter((c) => c.cat === 'PM'),
    other: compRows.filter((c) => c.cat === 'OTHER'),
  };
}
