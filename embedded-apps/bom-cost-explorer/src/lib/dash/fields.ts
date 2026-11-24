import type { FieldMap } from '../price-context/odata';

/** DashMisSet: one row per brand. SAP does the maths (actual cost of the period, approved budget cost per piece x actual quantity);
 *  Werks and DateTo are $filter properties only. Decimals are strings. */
export const DASH_SET = 'DashMisSet';
export const DASH_FILTER = { Werks: 'Werks', DateTo: 'DateTo' } as const;
export const DASH_MARGIN_FILTER = { Matnr: 'Matnr', Vkorg: 'Vkorg', Vtweg: 'Vtweg', Crssku: 'Crssku', Vbeln: 'Vbeln' } as const;
export const DASH_MIS_FIELDS = {
  Zbrand: ['Zbrand', 's'], Gjahr: ['Gjahr', 's'], Version: ['Version', 's'], FgCnt: ['FgCnt', 'i'], FgNobud: ['FgNobud', 'i'],
  FtmQty: ['FtmQty', 'd'], FtmBudget: ['FtmBudget', 'd'], FtmActual: ['FtmActual', 'd'], FtmActualCmp: ['FtmActualCmp', 'd'],
  YtmQty: ['YtmQty', 'd'], YtmBudget: ['YtmBudget', 'd'], YtmActual: ['YtmActual', 'd'], YtmActualCmp: ['YtmActualCmp', 'd'],
  Msg: ['Msg', 's'],
} as const satisfies FieldMap;

/** DashMisSet with Grain eq 'F': one row per finished good (material and plant) of the same figures, with the budget key SAP matched (or could not match). */
export const DASH_MIS_FG_FIELDS = {
  ...DASH_MIS_FIELDS,
  Grain: ['Grain', 's'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], BudPc: ['BudPc', 'd'], ActPc: ['ActPc', 'd'], BudSrc: ['BudSrc', 's'],
} as const satisfies FieldMap;

/** DashBridgeSet (ZCL_MM_COGM_BRIDGE): year-to-date COGM variance bridge per brand, one row per effect; Value in INR. Werks / DateTo are $filter properties only. */
export const DASH_BRIDGE_SET = 'DashBridgeSet';
export const DASH_BRIDGE_FIELDS = { Zbrand: ['Zbrand', 's'], Effect: ['Effect', 's'], SortNo: ['SortNo', 'i'], Value: ['Value', 'd'], Msg: ['Msg', 's'] } as const satisfies FieldMap;

/** DashSalesSet: invoiced sales of finished goods. Grain 'B' = one row per brand, 'S' = one row per SKU x distribution channel. GSV = condition ZSAL (the item's net value when it has none),
 *  NSV = VBRP-NETWR, Deductions = GSV - NSV; COGM = SAP's actual cost per piece of the period x sold quantity. Werks / DateFrom / DateTo are $filter properties only. */
export const DASH_SALES_SET = 'DashSalesSet';
export const DASH_SALES_FIELDS = {
  Grain: ['Grain', 's'], Zbrand: ['Zbrand', 's'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Matkl: ['Matkl', 's'], Vtweg: ['Vtweg', 's'], VtwegTxt: ['VtwegTxt', 's'],
  SoldQty: ['SoldQty', 'd'], Gsv: ['Gsv', 'd'], Deductions: ['Deductions', 'd'], Nsv: ['Nsv', 'd'], CogmQty: ['CogmQty', 'd'], NsvCmp: ['NsvCmp', 'd'], Cogm: ['Cogm', 'd'], CogmPc: ['CogmPc', 'd'],
  SkuCnt: ['SkuCnt', 'i'], SkuNocogm: ['SkuNocogm', 'i'], Msg: ['Msg', 's'],
} as const satisfies FieldMap;

/** DashPvmSet: budget gross margin -> Price -> Volume -> Mix -> Cost -> actual gross margin (+ 'Unexplained' when the effects do not add up). Same filter as DashSalesSet. */
export const DASH_PVM_SET = 'DashPvmSet';
export const DASH_PVM_FIELDS = { Effect: ['Effect', 's'], SortNo: ['SortNo', 'i'], Value: ['Value', 'd'], Msg: ['Msg', 's'] } as const satisfies FieldMap;
/** DashThreshSet: alert bands per metric and SKU category (blank category = the default). */
export const DASH_THRESH_SET = 'DashThreshSet';
export const DASH_THRESH_FIELDS = { Metric: ['Metric', 's'], Category: ['Category', 's'], RedPct: ['RedPct', 'd'], AmberPct: ['AmberPct', 'd'], HighBad: ['HighBad', 's'] } as const satisfies FieldMap;

/** DashMarginSet: invoice-level margin analysis. Grain 'S' = SKU (all customers), 'C' = customer (all SKUs), 'B' = brand. Values are INR, signed by billing category (invoice +, credit memo -), in base units. */
export const DASH_MARGIN_SET = 'DashMarginSet';
export const DASH_MARGIN_FIELDS = {
  Grain: ['Grain', 's'],
  Zbrand: ['Zbrand', 's'],
  Matnr: ['Matnr', 's'],
  Bwtar: ['Bwtar', 's'],
  Mtart: ['Mtart', 's'],
  Kunag: ['Kunag', 's'],
  Maktx: ['Maktx', 's'],
  Matkl: ['Matkl', 's'],
  KunagTxt: ['KunagTxt', 's'],
  Zscheme: ['Zscheme', 's'],
  Crssku: ['Crssku', 's'],
  Zbusiness: ['Zbusiness', 's'],
  BudVer: ['BudVer', 's'],
  BudFlag: ['BudFlag', 's'],
  Msg: ['Msg', 's'],
  Qty: ['Qty', 'd'],
  Mrp: ['Mrp', 'd'],
  Sp: ['Sp', 'd'],
  ChRet: ['ChRet', 'd'],
  ChDis: ['ChDis', 'd'],
  ChSs: ['ChSs', 'd'],
  Gst: ['Gst', 'd'],
  Rm: ['Rm', 'd'],
  Pm: ['Pm', 'd'],
  Pf: ['Pf', 'd'],
  Oh: ['Oh', 'd'],
  CRm: ['CRm', 'd'],
  CPm: ['CPm', 'd'],
  CPf: ['CPf', 'd'],
  COh: ['COh', 'd'],
  TRm: ['TRm', 'd'],
  TPm: ['TPm', 'd'],
  TPf: ['TPf', 'd'],
  TOh: ['TOh', 'd'],
  BudRm: ['BudRm', 'd'],
  BudPm: ['BudPm', 'd'],
  BudPf: ['BudPf', 'd'],
  BudOh: ['BudOh', 'd'],
} as const satisfies FieldMap;

/** DashCdrillSet: item level breakup of ONE finished good: S = summary (cost per piece by category), B = one row per sold batch, C = one row per component (average over the costed batches, weighted by sold quantity). */
export const DASH_CDRILL_SET = 'DashCdrillSet';
export const DASH_CDRILL_FIELDS = {
  Grain: ['Grain', 's'], Matnr: ['Matnr', 's'], Charg: ['Charg', 's'], Idnrk: ['Idnrk', 's'], Maktx: ['Maktx', 's'], Mtart: ['Mtart', 's'], Matkl: ['Matkl', 's'], Cat: ['Cat', 's'], Meins: ['Meins', 's'],
  Flag: ['Flag', 's'], Msg: ['Msg', 's'], Orders: ['Orders', 'i'],
  SoldQty: ['SoldQty', 'd'], ProdQty: ['ProdQty', 'd'], Qty: ['Qty', 'd'], Val: ['Val', 'd'], AvgQtyPc: ['AvgQtyPc', 'd'], AvgCostPc: ['AvgCostPc', 'd'],
  RmPc: ['RmPc', 'd'], PmPc: ['PmPc', 'd'], PfPc: ['PfPc', 'd'], OthPc: ['OthPc', 'd'],
} as const satisfies FieldMap;
