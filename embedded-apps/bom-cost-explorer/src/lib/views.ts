/** Column definitions for the server-paged R / F / M tables, shared by the BFF (search, sort,
 * totals) and the UI (headers, formatting, export). */
import type { FreightRow, RateRow, RmPmRow } from './sap/fields';

export type ColKind = 's' | 'd' | 'i' | 't';
export interface ColDef<T = Record<string, unknown>> {
  key: keyof T & string;
  label: string;
  kind: ColKind;
  dp?: number;
  /** currency: a literal ISO code ('INR') or `@Field` to read it from the row */
  curr?: string;
  sum?: boolean;
  width?: number;
  filter?: boolean; // offer a per-column filter
  badge?: 'source';
}

const R: ColDef<RateRow>[] = [
  { key: 'Recordsource', label: 'Source', kind: 's', badge: 'source', filter: true, width: 110 },
  { key: 'Material', label: 'Material', kind: 's', filter: true, width: 100 },
  { key: 'Matdesc', label: 'Description', kind: 's', width: 200 },
  { key: 'Plant', label: 'Plant', kind: 's', filter: true, width: 70 },
  { key: 'Vendor', label: 'Vendor', kind: 's', filter: true, width: 90 },
  { key: 'Vendorname', label: 'Vendor name', kind: 's', width: 180 },
  { key: 'Inforecord', label: 'Info record', kind: 's', width: 110 },
  { key: 'Purchasedocument', label: 'Contract / PO', kind: 's', width: 110 },
  { key: 'Conditiontype', label: 'Cond.', kind: 's', filter: true, width: 70 },
  { key: 'Validfrom', label: 'Valid from', kind: 't', width: 100 },
  { key: 'Validto', label: 'Valid to', kind: 't', width: 100 },
  { key: 'Currency', label: 'Curr', kind: 's', filter: true, width: 60 },
  { key: 'Rate', label: 'Rate', kind: 'd', dp: 4, curr: '@Currency', width: 110 },
  { key: 'Pricingunit', label: 'Per', kind: 'd', dp: 0, width: 60 },
  { key: 'Conditionunit', label: 'Unit', kind: 's', width: 60 },
  { key: 'RatePc', label: 'Rate / pc', kind: 'd', dp: 4, curr: '@Currency', width: 110 },
  { key: 'FxFactor', label: 'FX → local', kind: 'd', dp: 5, width: 90 },
  { key: 'RatePcLoc', label: 'Rate / pc local', kind: 'd', dp: 4, curr: '@Localcurrency', width: 120 },
  { key: 'FxInr', label: 'FX → INR', kind: 'd', dp: 5, width: 90 },
  { key: 'RatePcInr', label: 'Rate / pc INR', kind: 'd', dp: 4, curr: 'INR', width: 120 },
];

const F: ColDef<FreightRow>[] = [
  { key: 'Material', label: 'Material', kind: 's', filter: true, width: 100 },
  { key: 'Matdesc', label: 'Description', kind: 's', width: 190 },
  { key: 'Plant', label: 'Plant', kind: 's', filter: true, width: 70 },
  { key: 'Purchasedocument', label: 'PO', kind: 's', width: 110 },
  { key: 'Purchaseline', label: 'Item', kind: 's', width: 60 },
  { key: 'Podate', label: 'PO date', kind: 't', width: 100 },
  { key: 'Conditiontype', label: 'Cond.', kind: 's', filter: true, width: 70 },
  { key: 'Currency', label: 'Curr', kind: 's', filter: true, width: 60 },
  { key: 'Actualdelvquantity', label: 'Actual qty', kind: 'd', dp: 3, sum: true, width: 110 },
  { key: 'Actualdelvcostamount', label: 'Actual freight', kind: 'd', dp: 2, curr: '@Currency', sum: true, width: 130 },
  { key: 'ActRate', label: 'Actual / unit', kind: 'd', dp: 4, curr: '@Currency', width: 110 },
  { key: 'Stddelvquantity', label: 'Std qty', kind: 'd', dp: 3, sum: true, width: 110 },
  { key: 'Stddelvcostamount', label: 'Std freight', kind: 'd', dp: 2, curr: '@Currency', sum: true, width: 130 },
  { key: 'StdRate', label: 'Std / unit', kind: 'd', dp: 4, curr: '@Currency', width: 110 },
  { key: 'UsedSrc', label: 'Used', kind: 's', filter: true, width: 90 },
  { key: 'UsedPcLoc', label: 'Used / pc local', kind: 'd', dp: 4, curr: '@Localcurrency', width: 120 },
  { key: 'FxInr', label: 'FX → INR', kind: 'd', dp: 5, width: 90 },
  { key: 'UsedPcInr', label: 'Used / pc INR', kind: 'd', dp: 4, curr: 'INR', width: 120 },
];

const M: ColDef<RmPmRow>[] = [
  { key: 'Material', label: 'Material', kind: 's', filter: true, width: 100 },
  { key: 'Matdesc', label: 'Description', kind: 's', width: 190 },
  { key: 'Mtart', label: 'Type', kind: 's', filter: true, width: 60 },
  { key: 'Plant', label: 'Plant', kind: 's', filter: true, width: 70 },
  { key: 'Qty', label: 'Qty', kind: 'd', dp: 3, width: 100 },
  { key: 'Baseuom', label: 'UoM', kind: 's', width: 55 },
  { key: 'RateSrc', label: 'Source', kind: 's', badge: 'source', filter: true, width: 100 },
  { key: 'Vendname', label: 'Vendor', kind: 's', width: 170 },
  { key: 'RateCurr', label: 'Rate curr', kind: 's', filter: true, width: 70 },
  { key: 'RatePcOrg', label: 'Rate / pc (orig.)', kind: 'd', dp: 4, curr: '@RateCurr', width: 130 },
  { key: 'RatePcLoc', label: 'Rate / pc', kind: 'd', dp: 4, curr: '@LocCurr', width: 110 },
  { key: 'FrtPcLoc', label: 'Freight / pc', kind: 'd', dp: 4, curr: '@LocCurr', width: 110 },
  { key: 'TotPcLoc', label: 'Total / pc', kind: 'd', dp: 4, curr: '@LocCurr', width: 110 },
  { key: 'RateCostLoc', label: 'Rate cost', kind: 'd', dp: 2, curr: '@LocCurr', sum: true, width: 120 },
  { key: 'FrtCostLoc', label: 'Freight cost', kind: 'd', dp: 2, curr: '@LocCurr', sum: true, width: 120 },
  { key: 'TotCostLoc', label: 'Total cost', kind: 'd', dp: 2, curr: '@LocCurr', sum: true, width: 120 },
  { key: 'RatePcInr', label: 'Rate / pc INR', kind: 'd', dp: 4, curr: 'INR', width: 120 },
  { key: 'FrtPcInr', label: 'Freight / pc INR', kind: 'd', dp: 4, curr: 'INR', width: 120 },
  { key: 'TotPcInr', label: 'Total / pc INR', kind: 'd', dp: 4, curr: 'INR', width: 120 },
  { key: 'RateCostInr', label: 'Rate cost INR', kind: 'd', dp: 2, curr: 'INR', sum: true, width: 130 },
  { key: 'FrtCostInr', label: 'Freight cost INR', kind: 'd', dp: 2, curr: 'INR', sum: true, width: 130 },
  { key: 'TotCostInr', label: 'Total cost INR', kind: 'd', dp: 2, curr: 'INR', sum: true, width: 130 },
];

export const VIEW_COLUMNS = { R, F, M } as unknown as Record<'R' | 'F' | 'M', ColDef[]>;

export function currencyOf(col: ColDef, row: Record<string, unknown>): string | undefined {
  if (!col.curr) return undefined;
  return col.curr.startsWith('@') ? String(row[col.curr.slice(1)] ?? '') : col.curr;
}
