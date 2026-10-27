/**
 * Actual vs standard freight per finished good and plant, with the break-up behind it.
 * Input: the leaf cost lines of two ordinary BOM costing runs of the same selection, one with StdFrt off
 * (freight from actual PO deliveries) and one with StdFrt on (standard freight). Nothing new is asked of SAP.
 *
 * Freight of a leaf line per 1 finished-good piece (INR) = line cost x freight per component piece / cost per
 * component piece, divided by the costed quantity - the same scaling lib/cost/freightIncluded.ts uses. Lines
 * priced on Consumption / MBEW already carry freight in the rate, so their freight is 0 on both sides.
 * The break-up is by cost category (RM / Perfume / PM / Other) and by component; the condition-type split of one
 * component is the existing freight break-up (components/freight/FreightBreakup.tsx).
 */
import type { CostLine } from '../sap/fields';
import { D, ZERO, type Decimal } from '../cost/decimal';
import { CATEGORIES, costCategory, type CostCategory } from '../cost/categories';
import { isLeafRow, rowKey } from '../cost/tree';

export interface FreightComponent {
  key: string;
  idnrk: string;
  text: string;
  werks: string;
  category: CostCategory;
  /** freight per FG piece, INR */
  actual: Decimal;
  standard: Decimal;
  delta: Decimal;
  /** FrtSrc of each run: what SAP used for this component (ACTUAL falls back to STANDARD when it has no PO freight) */
  actualSrc: string;
  standardSrc: string;
  /** the actual-run cost line, for the condition-type break-up */
  line: CostLine;
}

export interface FreightCompareRow {
  key: string;
  plant: string;
  fg: string;
  text: string;
  actual: Decimal;
  standard: Decimal;
  delta: Decimal;
  /** (actual - standard) / standard, null when standard is 0 */
  deltaPct: Decimal | null;
  /** material cost per FG piece in the actual run, INR (freight included) */
  costPc: Decimal;
  actualPctOfCost: Decimal | null;
  byCategory: Record<CostCategory, { actual: Decimal; standard: Decimal }>;
  components: FreightComponent[];
}

const freightPc = (r: CostLine, qty: Decimal): Decimal => {
  const pc = D(r.TotCostPcInr);
  if (!pc.gt(0) || qty.isZero()) return ZERO;
  return D(r.TotCostInr).times(D(r.FrtPcInr)).div(pc).div(qty);
};

const emptyCats = () => Object.fromEntries(CATEGORIES.map((c) => [c, { actual: ZERO, standard: ZERO }])) as FreightCompareRow['byCategory'];

export function compareFreight(actualRows: CostLine[], standardRows: CostLine[], explQty = '1'): FreightCompareRow[] {
  const qty = D(explQty);
  const std = new Map<string, CostLine>();
  for (const r of standardRows) if (isLeafRow(r)) std.set(rowKey(r), r);
  const out = new Map<string, FreightCompareRow>();
  for (const a of actualRows) {
    if (!isLeafRow(a)) continue;
    const s = std.get(rowKey(a));
    const key = `${a.Hwerks}|${a.Headmat}`;
    let h = out.get(key);
    if (!h) {
      h = { key, plant: a.Hwerks, fg: a.Headmat, text: a.Headtxt, actual: ZERO, standard: ZERO, delta: ZERO, deltaPct: null, costPc: ZERO, actualPctOfCost: null, byCategory: emptyCats(), components: [] };
      out.set(key, h);
    }
    const act = freightPc(a, qty);
    const stdv = s ? freightPc(s, qty) : ZERO;
    const cat = costCategory(a);
    h.actual = h.actual.plus(act);
    h.standard = h.standard.plus(stdv);
    h.costPc = h.costPc.plus(qty.isZero() ? ZERO : D(a.TotCostInr).div(qty));
    h.byCategory[cat].actual = h.byCategory[cat].actual.plus(act);
    h.byCategory[cat].standard = h.byCategory[cat].standard.plus(stdv);
    if (!act.isZero() || !stdv.isZero()) {
      h.components.push({ key: rowKey(a), idnrk: a.Idnrk, text: a.Maktx, werks: a.Werks, category: cat, actual: act, standard: stdv, delta: act.minus(stdv), actualSrc: a.FrtSrc || '', standardSrc: s?.FrtSrc || '', line: a });
    }
  }
  const rows = Array.from(out.values());
  for (const h of rows) {
    h.delta = h.actual.minus(h.standard);
    h.deltaPct = h.standard.isZero() ? null : h.delta.div(h.standard).times(100);
    h.actualPctOfCost = h.costPc.gt(0) ? h.actual.div(h.costPc).times(100) : null;
    h.components.sort((x, y) => y.delta.abs().comparedTo(x.delta.abs()) || y.actual.comparedTo(x.actual));
  }
  return rows.sort((x, y) => y.delta.abs().comparedTo(x.delta.abs()));
}

export interface FreightCompareTotals { rows: number; actual: Decimal; standard: Decimal; delta: Decimal; over: number; under: number }

export function compareTotals(rows: FreightCompareRow[]): FreightCompareTotals {
  const t: FreightCompareTotals = { rows: rows.length, actual: ZERO, standard: ZERO, delta: ZERO, over: 0, under: 0 };
  for (const r of rows) {
    t.actual = t.actual.plus(r.actual);
    t.standard = t.standard.plus(r.standard);
    if (r.delta.gt('0.005')) t.over++;
    else if (r.delta.lt('-0.005')) t.under++;
  }
  t.delta = t.actual.minus(t.standard);
  return t;
}
