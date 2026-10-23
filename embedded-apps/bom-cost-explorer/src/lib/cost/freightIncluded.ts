/**
 * Consumption and MBEW rates already include freight (moving-average / consumption values are landed), so freight is
 * never added on top of them. SAP's costing adds the component's freight to every priced line (live NGQ, 23.10.2026:
 * MBEW 104.540 + standard freight 10.000 = 114.540), so the app takes it out where the lines come in:
 *
 *   cost lines (CostLineSet, Mode B / C / plan P), leaf lines whose selected source is in FREIGHT_INCLUDED_SOURCES:
 *     TotCostPcInr / TotCostPcLoc - freight per piece; TotCostInr / TotCostLoc scaled the same way (any quantity basis);
 *     FrtPcInr / FrtPcLoc = 0, SAP's values kept in FrtPcInrSap / FrtPcLocSap, FrtIncluded = true
 *   RM / PM requirement rows (RmPmRowSet) with RateSrc in the list: freight shown as SAP gives it, totals = rate
 * Freight stays visible everywhere a line's freight is shown (SAP's value, marked "not added"); it is only never added.
 *
 * The component's freight is still known (FrtPc*Sap): Contract and Info record options of that line add it
 * (componentFreight*), Consumption and MBEW options never do. The switch FREIGHT_INCLUDED_SOURCES (default
 * "CONSUMP,MBEW"; empty = SAP's figures unchanged) rolls it back. Applying it twice changes nothing.
 */
import { D } from './decimal';
import { isLeafRow } from './tree';
import type { CostLine } from '../sap/fields';

export const freightIncludedSources = (): string[] =>
  (process.env.NEXT_PUBLIC_FREIGHT_INCLUDED_SOURCES ?? process.env.FREIGHT_INCLUDED_SOURCES ?? 'CONSUMP,MBEW')
    .split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);

export const isFreightIncluded = (source: string | undefined | null): boolean => !!source && freightIncludedSources().includes(source.trim().toUpperCase());

export type FreightTagged = { FrtIncluded?: boolean; FrtPcInrSap?: string; FrtPcLocSap?: string };

type Line = Pick<CostLine, 'HasChild' | 'SelSource' | 'FrtPcInr' | 'FrtPcLoc' | 'TotCostPcInr' | 'TotCostPcLoc' | 'TotCostInr' | 'TotCostLoc'> & FreightTagged;

/** total x (per piece - freight) / per piece; unchanged when the per-piece value is not positive. */
function scaled(total: string, perPc: string, frt: string): string {
  const p = D(perPc);
  if (!p.gt(0)) return total;
  return D(total).times(p.minus(D(frt))).div(p).toFixed();
}

/** The cost line without freight when its rate already includes it (see above); other lines are returned as they are. */
export function excludeIncludedFreight<T extends Line>(r: T): T {
  if (r.FrtIncluded || !isLeafRow(r) || !isFreightIncluded(r.SelSource)) return r;
  const fi = D(r.FrtPcInr), fl = D(r.FrtPcLoc);
  if (fi.isZero() && fl.isZero()) return r;
  return {
    ...r,
    TotCostInr: scaled(r.TotCostInr, r.TotCostPcInr, r.FrtPcInr),
    TotCostLoc: scaled(r.TotCostLoc, r.TotCostPcLoc, r.FrtPcLoc),
    TotCostPcInr: D(r.TotCostPcInr).minus(fi).toFixed(),
    TotCostPcLoc: D(r.TotCostPcLoc).minus(fl).toFixed(),
    FrtPcInr: '0',
    FrtPcLoc: '0',
    FrtIncluded: true,
    FrtPcInrSap: r.FrtPcInr,
    FrtPcLocSap: r.FrtPcLoc,
  };
}

/** The component's freight per piece as SAP gave it (for Contract / Info record options of the line). */
export const componentFreightInr = (l: Pick<CostLine, 'FrtPcInr'> & FreightTagged) => D(l.FrtPcInrSap ?? l.FrtPcInr);
export const componentFreightLoc = (l: Pick<CostLine, 'FrtPcLoc'> & FreightTagged) => D(l.FrtPcLocSap ?? l.FrtPcLoc);

/** Freight per piece a given source adds on this line: none for Consumption / MBEW, the component's freight otherwise. */
export const sourceFreightInr = (source: string, l: Pick<CostLine, 'FrtPcInr'> & FreightTagged) => (isFreightIncluded(source) ? D(0) : componentFreightInr(l));
export const sourceFreightLoc = (source: string, l: Pick<CostLine, 'FrtPcLoc'> & FreightTagged) => (isFreightIncluded(source) ? D(0) : componentFreightLoc(l));

type RmPm = { RateSrc?: unknown; FrtPcLoc?: unknown; FrtPcInr?: unknown; FrtCostLoc?: unknown; FrtCostInr?: unknown; RatePcLoc?: unknown; RatePcInr?: unknown; RateCostLoc?: unknown; RateCostInr?: unknown; TotPcLoc?: unknown; TotPcInr?: unknown; TotCostLoc?: unknown; TotCostInr?: unknown };

/** RM / PM requirement row on a Consumption / MBEW rate: freight still shown, but the totals are the rate figures. */
export function excludeIncludedFreightRmPm<T extends RmPm>(r: T): T {
  if (!isFreightIncluded(String(r.RateSrc ?? ''))) return r;
  if (D(String(r.FrtPcLoc ?? '0')).isZero() && D(String(r.FrtPcInr ?? '0')).isZero() && D(String(r.FrtCostInr ?? '0')).isZero()) return r;
  return { ...r, TotPcLoc: r.RatePcLoc, TotPcInr: r.RatePcInr, TotCostLoc: r.RateCostLoc, TotCostInr: r.RateCostInr };
}
