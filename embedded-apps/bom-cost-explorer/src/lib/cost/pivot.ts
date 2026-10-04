/**
 * Mode C pivot: flat rows (one per cost plant x component) -> one row per header x component
 * with a column group per plant. Everything is INR: plants have different local currencies, so
 * only the group currency is comparable. Leaf components only (parents carry their subtree's
 * roll-up and would double count).
 */
import type { CostLine } from '../sap/fields';
import { D, ZERO, type Decimal } from './decimal';
import { isLeafRow } from './tree';

export interface PlantCell {
  qty: Decimal;
  rateCost: Decimal; // SelRatePcInr x ProdQty, summed
  frtCost: Decimal; // FrtPcInr x ProdQty, summed
  cost: Decimal; // TotCostInr, summed
  ratePc: Decimal; // rateCost / qty
  frtPc: Decimal; // frtCost / qty
  source: string; // single source, 'MIXED' when duplicates disagree, '' = no rate
  hasRate: boolean;
  lines: number;
}

export interface PivotRow {
  kind: 'component' | 'total';
  head: string;
  headText: string;
  comp: string;
  compText: string;
  uom: string;
  cells: Record<string, PlantCell | undefined>;
  min: Decimal | null;
  max: Decimal | null;
  diff: Decimal | null;
  cheapest: string | null;
}

export interface Pivot {
  plants: string[];
  rows: PivotRow[];
}

function emptyCell(): PlantCell {
  return { qty: ZERO, rateCost: ZERO, frtCost: ZERO, cost: ZERO, ratePc: ZERO, frtPc: ZERO, source: '', hasRate: false, lines: 0 };
}

function finish(c: PlantCell) {
  c.ratePc = c.qty.isZero() ? ZERO : c.rateCost.div(c.qty);
  c.frtPc = c.qty.isZero() ? ZERO : c.frtCost.div(c.qty);
}

/** Min / max / difference / cheapest over the plants that HAVE a cost - only when >= 2 do. */
export function compare(cells: Record<string, PlantCell | undefined>, plants: string[]) {
  const costed = plants.filter((p) => cells[p] && cells[p]!.hasRate && cells[p]!.cost.gt(0));
  if (costed.length < 2) return { min: null, max: null, diff: null, cheapest: null };
  let minP = costed[0];
  let maxP = costed[0];
  for (const p of costed) {
    if (cells[p]!.cost.lt(cells[minP]!.cost)) minP = p;
    if (cells[p]!.cost.gt(cells[maxP]!.cost)) maxP = p;
  }
  const min = cells[minP]!.cost;
  const max = cells[maxP]!.cost;
  return { min, max, diff: max.minus(min), cheapest: minP };
}

export function buildPivot(rows: CostLine[], plantOrder?: string[]): Pivot {
  const plants: string[] = plantOrder?.length ? [...plantOrder] : [];
  const byKey = new Map<string, PivotRow>();
  const totals = new Map<string, PivotRow>();
  const headOrder: string[] = [];
  const compOrder = new Map<string, string[]>();

  for (const r of rows) {
    // Hwerks = the comparison (cost) plant; Werks is the component plant.
    if (!plants.includes(r.Hwerks)) plants.push(r.Hwerks);
    if (!isLeafRow(r)) continue;
    if (!totals.has(r.Headmat)) {
      headOrder.push(r.Headmat);
      compOrder.set(r.Headmat, []);
      totals.set(r.Headmat, { kind: 'total', head: r.Headmat, headText: r.Headtxt, comp: '', compText: 'TOTAL', uom: '', cells: {}, min: null, max: null, diff: null, cheapest: null });
    }
    const key = `${r.Headmat}|${r.Idnrk}`;
    let pr = byKey.get(key);
    if (!pr) {
      pr = { kind: 'component', head: r.Headmat, headText: r.Headtxt, comp: r.Idnrk, compText: r.Maktx, uom: r.Meins, cells: {}, min: null, max: null, diff: null, cheapest: null };
      byKey.set(key, pr);
      compOrder.get(r.Headmat)!.push(key);
    }
    const qty = D(r.ProdQty);
    const hasRate = !!r.SelSource;
    for (const target of [pr, totals.get(r.Headmat)!]) {
      const c = (target.cells[r.Hwerks] ??= emptyCell());
      c.qty = target.kind === 'component' ? c.qty.plus(qty) : ZERO;
      c.rateCost = c.rateCost.plus(D(r.SelRatePcInr).times(qty));
      c.frtCost = c.frtCost.plus(D(r.FrtPcInr).times(qty));
      c.cost = c.cost.plus(D(r.TotCostInr));
      c.lines += 1;
      if (target.kind === 'component') {
        c.source = c.lines === 1 ? r.SelSource : c.source === r.SelSource ? c.source : 'MIXED';
        c.hasRate = c.lines === 1 ? hasRate : c.hasRate && hasRate;
      } else {
        c.hasRate = c.hasRate || hasRate;
      }
    }
  }

  const out: PivotRow[] = [];
  for (const h of headOrder) {
    for (const key of compOrder.get(h)!) {
      const pr = byKey.get(key)!;
      Object.values(pr.cells).forEach((c) => c && finish(c));
      Object.assign(pr, compare(pr.cells, plants));
      out.push(pr);
    }
    const t = totals.get(h)!;
    Object.values(t.cells).forEach((c) => c && (c.ratePc = ZERO, c.frtPc = ZERO));
    Object.assign(t, compare(t.cells, plants));
    out.push(t);
  }
  return { plants, rows: out };
}
