/**
 * Contract and Info record rates including freight, per component unit, in INR and in local currency: the option's rate
 * per piece plus the line's freight per piece (FrtPcInr / FrtPcLoc) - the same basis as the option totals in
 * lib/rates/sources.ts (rate x qty + freight x qty). Shown wherever Contract and Info record rates are listed:
 * Rate sources, Rate summary and the row drawer's options table.
 *
 * Local currency = the line's (the plant's). When the option's local currency differs (another plant's option), the
 * option rate is brought into the line's currency through INR: rate INR / (line INR per local unit).
 */
import { D, type Decimal } from '../cost/decimal';
import type { CostLine } from '../sap/fields';

export const WITH_FREIGHT_SOURCES = ['CONTRACT', 'INFOREC'] as const;
export type WithFreightSource = (typeof WITH_FREIGHT_SOURCES)[number];
export const WITH_FREIGHT_LABEL: Record<WithFreightSource, string> = { CONTRACT: 'Contract + freight', INFOREC: 'Info record + freight' };
export const hasFreightColumns = (source: string): source is WithFreightSource => (WITH_FREIGHT_SOURCES as readonly string[]).includes(source);

type Opt = { Source: string; RatePcInr: string; RatePcLoc: string; LocCurr?: string; FxInr?: string };
type Line = Pick<CostLine, 'FrtPcInr' | 'FrtPcLoc' | 'LocCurr' | 'TotCostInr' | 'TotCostLoc'>;

export interface WithFreight { inr: Decimal; loc: Decimal | null; locCurr: string }

/** INR per one unit of the line's local currency, from the line's own totals; null when it cannot be told. */
function inrPerLocal(l: Line): Decimal | null {
  const loc = D(l.TotCostLoc), inr = D(l.TotCostInr);
  if (loc.gt(0) && inr.gt(0)) return inr.div(loc);
  const fl = D(l.FrtPcLoc), fi = D(l.FrtPcInr);
  return fl.gt(0) && fi.gt(0) ? fi.div(fl) : null;
}

/** Rate + freight of a Contract / Info record option on this line; null for other sources or an unpriced option. */
export function rateWithFreight(o: Opt, l: Line): WithFreight | null {
  if (!hasFreightColumns(o.Source) || !D(o.RatePcInr).gt(0)) return null;
  const inr = D(o.RatePcInr).plus(D(l.FrtPcInr));
  const lineCurr = l.LocCurr || o.LocCurr || '';
  if (!o.LocCurr || !l.LocCurr || o.LocCurr === l.LocCurr) return { inr, loc: D(o.RatePcLoc).plus(D(l.FrtPcLoc)), locCurr: lineCurr };
  const f = inrPerLocal(l);
  return { inr, loc: f ? inr.div(f) : null, locCurr: lineCurr };
}

/** The option of a source for a line: the component plant's own option first (as the rate summary picks rates). */
export function sourceOption<T extends Opt & { Plant?: string }>(opts: T[] | undefined, source: string, werks: string): T | null {
  const list = (opts ?? []).filter((o) => o.Source === source && D(o.RatePcInr).gt(0));
  return list.length ? list.find((o) => o.Plant === werks) ?? list[0] : null;
}

/**
 * Vendor of a rate option where SAP gives one: the option's own Vendor / Vname (RateOptionSet), else - for the option
 * SAP used on this line - the line's SelVendor / SelVname. Empty when neither is known.
 */
export function vendorOf(
  o: { Source: string; RatePcInr: string; Vendor?: string; Vname?: string },
  l: Pick<CostLine, 'SelSource' | 'SelRatePcInr' | 'SelVendor' | 'SelVname'>,
): { code: string; name: string } {
  const code = (o.Vendor ?? '').trim();
  const name = (o.Vname ?? '').trim();
  if (code || name) return { code, name };
  const isUsed = !!l.SelSource && o.Source === l.SelSource && D(o.RatePcInr).minus(D(l.SelRatePcInr)).abs().lte('0.0001');
  return isUsed ? { code: (l.SelVendor ?? '').trim(), name: (l.SelVname ?? '').trim() } : { code: '', name: '' };
}

/** "Name (code)", the name alone, or the code alone. */
export const vendorText = (v: { code: string; name: string }) => (v.name && v.code ? `${v.name} (${v.code.replace(/^0+/, '')})` : v.name || v.code.replace(/^0+/, ''));
