/**
 * SAP's budget landed rate (BudLanded, BudSrcamt: zcomponent / zcomponent_n) is per PRICE unit (65,000 per kg), while the BOM quantity and every other
 * rate on the line (SelRatePc ...) are per component unit (g). The line's own factor SelRate / SelRatePc (1,000 for kg -> g, also covers a price unit
 * of 100) brings it to the component unit, once, where the lines come in. Without a selected rate the factor is unknown and the rate is left as sent.
 * Leaf lines only; applying it twice changes nothing (BudUnitFactor marks a converted line).
 */
import { D } from './decimal';
import { isLeafRow } from './tree';
import type { CostLine } from '../sap/fields';

export type BudUnitTagged = { BudUnitFactor?: number };
type Line = Pick<CostLine, 'HasChild' | 'BudLanded' | 'BudSrcamt' | 'SelRate' | 'SelRatePc'> & BudUnitTagged;

export function budgetPerUnit<T extends Line>(r: T): T {
  if (r.BudUnitFactor !== undefined || !isLeafRow(r) || !D(r.BudLanded).gt(0)) return r;
  const rate = D(r.SelRate); const pc = D(r.SelRatePc);
  if (!rate.gt(0) || !pc.gt(0)) return r;
  const f = rate.div(pc);
  if (f.eq(1)) return { ...r, BudUnitFactor: 1 };
  return { ...r, BudLanded: D(r.BudLanded).div(f).toFixed(), BudSrcamt: D(r.BudSrcamt).div(f).toFixed(), BudUnitFactor: f.toNumber() };
}
