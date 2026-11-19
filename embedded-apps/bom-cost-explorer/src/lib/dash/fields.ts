import type { FieldMap } from '../price-context/odata';

/** DashMisSet: one row per brand. SAP does the maths (actual cost of the period, approved budget cost per piece x actual quantity);
 *  Werks and DateTo are $filter properties only. Decimals are strings. */
export const DASH_SET = 'DashMisSet';
export const DASH_FILTER = { Werks: 'Werks', DateTo: 'DateTo' } as const;
export const DASH_MIS_FIELDS = {
  Zbrand: ['Zbrand', 's'], Gjahr: ['Gjahr', 's'], Version: ['Version', 's'], FgCnt: ['FgCnt', 'i'], FgNobud: ['FgNobud', 'i'],
  FtmQty: ['FtmQty', 'd'], FtmBudget: ['FtmBudget', 'd'], FtmActual: ['FtmActual', 'd'], FtmActualCmp: ['FtmActualCmp', 'd'],
  YtmQty: ['YtmQty', 'd'], YtmBudget: ['YtmBudget', 'd'], YtmActual: ['YtmActual', 'd'], YtmActualCmp: ['YtmActualCmp', 'd'],
  Msg: ['Msg', 's'],
} as const satisfies FieldMap;
