/**
 * Actual cost of the process orders of a finished good (goods receipt documents: RM, PM, perfume, conversion) against its CK13N standard cost estimate (CkCompSet),
 * per piece. Variance = actual - standard (positive = the production cost more than the standard). SAP gives both sides; only the division by the quantity and the difference are computed here.
 * CK13N has no perfume line of its own (perfume is a raw material there), so the actual perfume is added to the actual RM; conversion and overheads of the estimate are one line.
 */
import Decimal from 'decimal.js';
import type { CkCompRow } from '../ck/types';

const ZERO = new Decimal(0);
const d = (v: string | null | undefined): Decimal => { try { return v && v.trim() !== '' ? new Decimal(v) : ZERO; } catch { return ZERO; } };

export interface ActualTotals { qty: Decimal; rm: Decimal; pm: Decimal; perf: Decimal; conv: Decimal; landed: Decimal }
export interface CkVarRow { key: string; label: string; actual: Decimal | null; standard: Decimal; variance: Decimal | null; pct: Decimal | null; note?: string }

export function ckVariance(a: ActualTotals, comps: CkCompRow[]): CkVarRow[] {
  const std = { RM: ZERO, PM: ZERO, CONV: ZERO, OTH: ZERO, SUM: ZERO };
  for (const c of comps) {
    if (c.IsMemo) continue;
    const v = d(c.Total);
    if (c.IsSum) { std.SUM = v; continue; }
    const g = String(c.Grp).toUpperCase();
    if (g === 'RM') std.RM = std.RM.plus(v);
    else if (g === 'PM') std.PM = std.PM.plus(v);
    else if (g === 'CONV' || g === 'OVH') std.CONV = std.CONV.plus(v);
    else std.OTH = std.OTH.plus(v);
  }
  if (std.SUM.isZero()) std.SUM = std.RM.plus(std.PM).plus(std.CONV).plus(std.OTH);
  const pc = (v: Decimal): Decimal | null => (a.qty.gt(0) ? v.div(a.qty) : null);
  const row = (key: string, label: string, act: Decimal | null, s: Decimal, note?: string): CkVarRow => {
    const variance = act ? act.minus(s) : null;
    return { key, label, actual: act, standard: s, variance, pct: variance && s.gt(0) ? variance.div(s).times(100) : null, note };
  };
  const rows = [
    row('RM', 'Raw material + perfume', pc(a.rm.plus(a.perf)), std.RM),
    row('PM', 'Packing material', pc(a.pm), std.PM),
    row('CONV', 'Conversion + overheads', pc(a.conv), std.CONV),
  ];
  if (!std.OTH.isZero()) rows.push(row('OTH', 'Other (CK13N)', null, std.OTH, 'no actual counterpart'));
  rows.push(row('TOTAL', 'Total per piece', pc(a.landed), std.SUM));
  return rows;
}
