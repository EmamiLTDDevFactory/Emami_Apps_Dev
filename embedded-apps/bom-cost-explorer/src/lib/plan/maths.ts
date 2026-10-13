/**
 * Production Plan calculation rules (decimal.js; SAP does the BOM, rate, currency and UoM maths, this only
 * presents and simulates). Months are fiscal April..March (index 0 = April).
 *
 *   monthly cost of a line    = QtyMn x TotCostPcInr
 *   total cost of a line      = TotCostInr (in Mode P, ProdQty = QtyTot, so it is the whole plan's cost)
 *   cost per FG piece         = sum of LEAF TotCostInr / PlanQty      (PlanQty 0 -> blank)
 *   cost per 1000 FG pieces   = that x 1000
 *   shortage (requirement)    = BudQty - (Lbkum + RemQty)
 *   SelSource blank           = no rate (freight only): counted and flagged
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import { monthKeys, type PlanCostLine, type PlanSummary } from './fields';

const QTY = monthKeys('QtyM');
const QM = monthKeys('Qm');

export const monthQty = (l: PlanCostLine): Decimal[] => QTY.map((k) => D((l as unknown as Record<string, string>)[k]));
export const summaryMonths = (s: PlanSummary): Decimal[] => QM.map((k) => D((s as unknown as Record<string, string>)[k]));

/** Monthly cost of one line; `ratePc` overrides TotCostPcInr (simulation), `mult` scales each month's quantity. */
export function monthlyCost(l: PlanCostLine, ratePc?: Decimal, mult?: number[]): Decimal[] {
  const pc = ratePc ?? D(l.TotCostPcInr);
  return monthQty(l).map((q, i) => q.times(mult?.[i] ?? 1).times(pc));
}

export interface PlanHeaderRollup {
  key: string; // Hwerks|Headmat
  hwerks: string;
  headmat: string;
  headtxt: string;
  land1: string;
  planQty: Decimal;
  total: Decimal; // sum of leaf TotCostInr
  months: Decimal[]; // sum of leaf monthly cost
  perPiece: Decimal | null;
  per1000: Decimal | null;
  bomSrc: string;
  bomPlant: string;
  bomSrcDate: string | null;
  leaves: number;
  noRate: number;
}

export const headerKey = (l: Pick<PlanCostLine, 'Hwerks' | 'Headmat'>) => `${l.Hwerks}|${l.Headmat}`;

/** Roll-ups per plan material in a plant, from LEAF rows only (HasChild blank). */
export function headerRollups(lines: PlanCostLine[], lineTotal?: (l: PlanCostLine, i: number) => Decimal, lineMonths?: (l: PlanCostLine, i: number) => Decimal[]): Map<string, PlanHeaderRollup> {
  const out = new Map<string, PlanHeaderRollup>();
  lines.forEach((l, i) => {
    const k = headerKey(l);
    let h = out.get(k);
    if (!h) {
      h = { key: k, hwerks: l.Hwerks, headmat: l.Headmat, headtxt: l.Headtxt, land1: l.Land1, planQty: D(l.PlanQty), total: ZERO, months: Array(12).fill(ZERO), perPiece: null, per1000: null, bomSrc: l.BomSrc, bomPlant: l.BomPlant, bomSrcDate: l.BomSrcDate, leaves: 0, noRate: 0 };
      out.set(k, h);
    }
    if (!isLeafRow(l)) return;
    h.leaves++;
    if (!l.SelSource) h.noRate++;
    h.total = h.total.plus(lineTotal ? lineTotal(l, i) : D(l.TotCostInr));
    const m = lineMonths ? lineMonths(l, i) : monthlyCost(l);
    h.months = h.months.map((v, j) => v.plus(m[j]));
  });
  for (const h of out.values()) {
    h.perPiece = h.planQty.gt(0) ? h.total.div(h.planQty) : null;
    h.per1000 = h.perPiece ? h.perPiece.times(1000) : null;
  }
  return out;
}

export interface PlanTotals {
  total: Decimal;
  months: Decimal[];
  leaves: number;
  noRate: number;
}

export function planTotals(rollups: Iterable<PlanHeaderRollup>): PlanTotals {
  let total = ZERO;
  let months: Decimal[] = Array(12).fill(ZERO);
  let leaves = 0;
  let noRate = 0;
  for (const h of rollups) {
    total = total.plus(h.total);
    months = months.map((v, i) => v.plus(h.months[i]));
    leaves += h.leaves;
    noRate += h.noRate;
  }
  return { total, months, leaves, noRate };
}

export const shortage = (s: PlanSummary): Decimal => D(s.BudQty).minus(D(s.Lbkum).plus(D(s.RemQty)));

/** Variance of SAP's rate vs the actual average rate, in % of the actual ('null' when there is no actual). */
export function actVariancePct(l: PlanCostLine): Decimal | null {
  const act = D(l.ActRatePcInr);
  if (act.isZero()) return null;
  return D(l.SelRatePcInr).minus(act).div(act).times(100);
}

/** Human BOM-source text for a header. */
export function bomSourceLabel(h: Pick<PlanHeaderRollup, 'bomSrc' | 'bomPlant' | 'bomSrcDate'>): string {
  if (h.bomSrc === 'LASTPROD') {
    const d = h.bomSrcDate ? h.bomSrcDate.split('-').reverse().join('.') : '?';
    return `From plant ${h.bomPlant} (last production ${d})`;
  }
  return 'OWN';
}
export const BOM_SOURCE_RULE = 'OWN: the plant\'s own BOM. LASTPROD: the plant has no BOM, so SAP takes the BOM of the plant that last produced the material (with fallback on).';
