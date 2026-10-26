import { D, ZERO, type Decimal } from './decimal';
import type { CostLine } from '../sap/fields';

/**
 * The BOM costing total in local currency next to the INR one: leaf lines summed per LocCurr (TotCostLoc), one entry
 * per currency (several plants can have different currencies). A simulated INR value per line is turned into local at
 * that line's own rate (TotCostLoc / TotCostInr).
 */
export interface LocalTotal { curr: string; loc: Decimal; inr: Decimal; simLoc: Decimal | null }

export function localTotals(rows: Pick<CostLine, 'LocCurr' | 'TotCostLoc' | 'TotCostInr'>[], isLeaf: boolean[], simInr?: (i: number) => Decimal | string): LocalTotal[] {
  const by = new Map<string, LocalTotal>();
  rows.forEach((r, i) => {
    if (!isLeaf[i]) return;
    const curr = r.LocCurr || 'INR';
    const t = by.get(curr) ?? { curr, loc: ZERO, inr: ZERO, simLoc: simInr ? ZERO : null };
    const loc = D(r.TotCostLoc);
    const inr = D(r.TotCostInr);
    t.loc = t.loc.plus(loc);
    t.inr = t.inr.plus(inr);
    if (simInr && t.simLoc) {
      const s = D(simInr(i));
      const rate = inr.isZero() ? (curr === 'INR' ? D(1) : null) : loc.div(inr);
      t.simLoc = rate ? t.simLoc.plus(s.times(rate)) : t.simLoc;
    }
    by.set(curr, t);
  });
  return [...by.values()].sort((a, b) => (a.curr === 'INR' ? 1 : 0) - (b.curr === 'INR' ? 1 : 0) || a.curr.localeCompare(b.curr));
}
