/**
 * Plan cost per FG piece on four rate bases (Breakup & cost > "FG per pc"):
 *   BUDGET    As per Budget       BudLanded (SAP budget landed rate per component unit; needs InclBudget)
 *   MBEW      As per MBEW         the MBEW rate option of the component (lazy rate options)
 *   CONSUMP   As per Consumption  the CONSUMP rate option of the component (lazy rate options)
 *   SELECTED  Current selected    SelRatePcInr (the rate SAP picked)
 *
 * cost per FG piece (source) = sum over LEAF components of rate(source) x QtyTot  /  PlanQty
 * Material rate only (freight is shown separately as "Selected incl. freight" = the header roll-up).
 * A component without a rate on a source is not counted as 0: `priced` / `leaves` says how complete
 * the figure is, so an incomplete source is never mistaken for a cheap one. decimal.js throughout.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import type { RateOption } from '../sap/fields';
import type { PlanCostLine } from './fields';

export const PLAN_SOURCES = ['BUDGET', 'MBEW', 'CONSUMP', 'SELECTED'] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];
export const PLAN_SOURCE_LABEL: Record<PlanSource, string> = { BUDGET: 'As per Budget', MBEW: 'As per C-MAP', CONSUMP: 'As per Consumption', SELECTED: 'Current selected' };
export const PLAN_SOURCE_COLOR: Record<PlanSource, string> = { BUDGET: '#4F3FD6', MBEW: '#e34948', CONSUMP: '#eb6834', SELECTED: '#008300' };

export type PlanLineWithOptions = PlanCostLine & { RateOptions?: RateOption[] };

/** The option of one source for a component: the component plant's own option first, else the first priced one. */
function optionRate(l: PlanLineWithOptions, source: 'MBEW' | 'CONSUMP'): Decimal | null {
  const opts = (l.RateOptions ?? []).filter((o) => o.Source === source && D(o.RatePcInr).gt(0));
  if (!opts.length) return null;
  const own = opts.find((o) => o.Plant === l.Werks) ?? opts[0];
  return D(own.RatePcInr);
}

/** Rate per component unit (INR) of one source, or null when that source has none for the component. */
export function componentRate(l: PlanLineWithOptions, source: PlanSource): Decimal | null {
  switch (source) {
    case 'BUDGET': return D(l.BudLanded).gt(0) ? D(l.BudLanded) : null;
    case 'SELECTED': return l.SelSource && D(l.SelRatePcInr).gt(0) ? D(l.SelRatePcInr) : null;
    default: return optionRate(l, source);
  }
}

export interface SourceFigure {
  perPc: Decimal | null; // null = PlanQty 0 or nothing priced
  total: Decimal; // sum of rate x qty over priced leaves
  priced: number;
  leaves: number;
}

export interface FgSources {
  key: string; // Land1|Hwerks|Headmat (plan country)
  land1: string;
  landx: string;
  hwerks: string;
  headmat: string;
  headtxt: string;
  stlal: string;
  bomSrc: string;
  bomPlant: string;
  planQty: Decimal;
  sources: Record<PlanSource, SourceFigure>;
  /** Selected rate incl. freight = sum of leaf TotCostInr / PlanQty (the Breakup header figure). */
  selectedInclFrt: Decimal | null;
  /** Cheapest complete source (every leaf priced), or null. */
  lowest: PlanSource | null;
}

const emptyFig = (): SourceFigure => ({ perPc: null, total: ZERO, priced: 0, leaves: 0 });

export function fgSources(lines: PlanLineWithOptions[]): FgSources[] {
  const by = new Map<string, FgSources & { frt: Decimal }>();
  for (const l of lines) {
    const key = `${l.Land1}|${l.Hwerks}|${l.Headmat}`;
    let g = by.get(key);
    if (!g) {
      g = {
        key, land1: l.Land1, landx: l.Landx, hwerks: l.Hwerks, headmat: l.Headmat, headtxt: l.Headtxt, stlal: l.Stlal, bomSrc: l.BomSrc, bomPlant: l.BomPlant,
        planQty: D(l.PlanQty), sources: { BUDGET: emptyFig(), MBEW: emptyFig(), CONSUMP: emptyFig(), SELECTED: emptyFig() }, selectedInclFrt: null, lowest: null, frt: ZERO,
      };
      by.set(key, g);
    }
    if (!g.stlal && l.Stlal) g.stlal = l.Stlal;
    if (!isLeafRow(l)) continue;
    const qty = D(l.QtyTot);
    g.frt = g.frt.plus(D(l.TotCostInr));
    for (const s of PLAN_SOURCES) {
      const f = g.sources[s];
      f.leaves++;
      const r = componentRate(l, s);
      if (r) {
        f.priced++;
        f.total = f.total.plus(r.times(qty));
      }
    }
  }
  return [...by.values()].map(({ frt, ...g }) => {
    const pq = g.planQty;
    for (const s of PLAN_SOURCES) {
      const f = g.sources[s];
      f.perPc = pq.gt(0) && f.priced > 0 ? f.total.div(pq) : null;
    }
    const complete = PLAN_SOURCES.filter((s) => g.sources[s].perPc && g.sources[s].priced === g.sources[s].leaves);
    const lowest = complete.length ? complete.reduce((a, b) => (g.sources[b].perPc!.lt(g.sources[a].perPc!) ? b : a)) : null;
    return { ...g, selectedInclFrt: pq.gt(0) ? frt.div(pq) : null, lowest };
  });
}

/** Countries in first-seen order, with their FGs (segregation for the table and the filter chips). */
export function byCountry(rows: FgSources[]): { land1: string; landx: string; rows: FgSources[] }[] {
  const m = new Map<string, { land1: string; landx: string; rows: FgSources[] }>();
  for (const r of rows) {
    const c = m.get(r.land1) ?? { land1: r.land1, landx: r.landx, rows: [] };
    c.rows.push(r);
    m.set(r.land1, c);
  }
  return [...m.values()];
}
