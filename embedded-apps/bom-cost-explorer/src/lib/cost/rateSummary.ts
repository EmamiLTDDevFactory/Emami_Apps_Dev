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
 */
import { D, ZERO, type Decimal } from './decimal';
import { isLeafRow } from './tree';
import { costCategory, type CostCategory } from './categories';
import type { CostLine, RateOption } from '../sap/fields';

export const RATE_TYPES = ['SELECTED', 'BUDGET', 'CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW', 'CHEAPEST'] as const;
export type RateType = (typeof RATE_TYPES)[number];
export const RATE_TYPE_LABEL: Record<RateType, string> = {
  SELECTED: 'Selected (SAP)', BUDGET: 'Budget', CONTRACT: 'Contract', INFOREC: 'Info record', MARKT: 'Market', CONSUMP: 'Consumption', MBEW: 'MBEW', CHEAPEST: 'Cheapest',
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
}

export interface ComponentRow {
  key: string; werks: string; idnrk: string; maktx: string; meins: string; cat: CostCategory;
  qty: Decimal; fgs: number; selectedSource: string;
  rates: Record<RateType, Decimal | null>;
  min: Decimal | null; max: Decimal | null; spreadPct: Decimal | null; // over the priced types
  lowestType: RateType | null;
}

export interface RateSummary { fgs: FgRow[]; rm: ComponentRow[]; pm: ComponentRow[]; other: ComponentRow[] }

const emptyFigures = (): Record<RateType, { total: Decimal; priced: number }> =>
  Object.fromEntries(RATE_TYPES.map((t) => [t, { total: ZERO, priced: 0 }])) as Record<RateType, { total: Decimal; priced: number }>;

export function rateSummary(lines: Line[], explQty: string | number = 1): RateSummary {
  const qty = D(explQty).gt(0) ? D(explQty) : D(1);
  const fgs = new Map<string, { row: Omit<FgRow, 'perPc' | 'landedPc' | 'freightPc' | 'cheapestType'>; fig: ReturnType<typeof emptyFigures>; landed: Decimal; freight: Decimal }>();
  const comps = new Map<string, ComponentRow & { heads: Set<string>; sums: Record<RateType, { cost: Decimal; q: Decimal }> }>();

  for (const l of lines) {
    if (!isLeafRow(l)) continue;
    const hk = `${l.Land1}|${l.Hwerks}|${l.Headmat}`;
    let f = fgs.get(hk);
    if (!f) fgs.set(hk, (f = { row: { key: hk, land1: l.Land1, hwerks: l.Hwerks, headmat: l.Headmat, headtxt: l.Headtxt, leaves: 0 }, fig: emptyFigures(), landed: ZERO, freight: ZERO }));
    f.row.leaves++;
    const pq = D(l.ProdQty);
    f.landed = f.landed.plus(D(l.TotCostInr));
    f.freight = f.freight.plus(D(l.FrtPcInr).times(pq));
    const ck = `${l.Werks || l.Hwerks}|${l.Idnrk}`;
    let c = comps.get(ck);
    if (!c) comps.set(ck, (c = {
      key: ck, werks: l.Werks || l.Hwerks, idnrk: l.Idnrk, maktx: l.Maktx, meins: l.Meins, cat: costCategory(l), qty: ZERO, fgs: 0, selectedSource: l.SelSource,
      rates: Object.fromEntries(RATE_TYPES.map((t) => [t, null])) as Record<RateType, Decimal | null>, min: null, max: null, spreadPct: null, lowestType: null,
      heads: new Set(), sums: Object.fromEntries(RATE_TYPES.map((t) => [t, { cost: ZERO, q: ZERO }])) as Record<RateType, { cost: Decimal; q: Decimal }>,
    }));
    c.qty = c.qty.plus(pq);
    c.heads.add(hk);
    for (const t of RATE_TYPES) {
      const r = rateOf(l, t);
      if (r === null) continue;
      f.fig[t].total = f.fig[t].total.plus(r.times(pq));
      f.fig[t].priced++;
      c.sums[t].cost = c.sums[t].cost.plus(r.times(pq));
      c.sums[t].q = c.sums[t].q.plus(pq);
    }
  }

  const fgRows: FgRow[] = [...fgs.values()].map(({ row, fig, landed, freight }) => {
    const perPc = Object.fromEntries(RATE_TYPES.map((t) => [t, { value: fig[t].priced ? fig[t].total.div(qty) : null, priced: fig[t].priced, leaves: row.leaves }])) as Record<RateType, Figure>;
    const complete = RATE_TYPES.filter((t) => perPc[t].value && perPc[t].priced === row.leaves);
    const cheapestType = complete.length ? complete.reduce((a, t) => (perPc[t].value!.lt(perPc[a].value!) ? t : a)) : null;
    return { ...row, perPc, landedPc: landed.div(qty), freightPc: freight.div(qty), cheapestType };
  }).sort((a, b) => a.land1.localeCompare(b.land1) || a.hwerks.localeCompare(b.hwerks) || a.headmat.localeCompare(b.headmat));

  const compRows = [...comps.values()].map(({ heads, sums, ...c }) => {
    const rates = Object.fromEntries(RATE_TYPES.map((t) => [t, sums[t].q.gt(0) ? sums[t].cost.div(sums[t].q) : null])) as Record<RateType, Decimal | null>;
    const priced = RATE_TYPES.filter((t) => t !== 'CHEAPEST' && rates[t]) as RateType[];
    const vals = priced.map((t) => rates[t]!);
    const min = vals.length ? vals.reduce((a, v) => (v.lt(a) ? v : a)) : null;
    const max = vals.length ? vals.reduce((a, v) => (v.gt(a) ? v : a)) : null;
    return { ...c, fgs: heads.size, rates, min, max, spreadPct: min && max && min.gt(0) ? max.minus(min).div(min).times(100) : null, lowestType: min ? priced.find((t) => rates[t]!.eq(min)) ?? null : null };
  }).sort((a, b) => (b.rates.SELECTED ?? ZERO).times(b.qty).cmp((a.rates.SELECTED ?? ZERO).times(a.qty)));

  return {
    fgs: fgRows,
    rm: compRows.filter((c) => c.cat === 'RM' || c.cat === 'PERFUME'),
    pm: compRows.filter((c) => c.cat === 'PM'),
    other: compRows.filter((c) => c.cat === 'OTHER'),
  };
}
