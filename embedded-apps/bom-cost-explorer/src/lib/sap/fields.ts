/**
 * THE single place SAP property names live.
 *
 * Every entity is a map of  internal key -> [SAP property name, kind].  The rest of the app only
 * ever uses the internal keys (which start out identical to the SAP names in the service spec).
 * If `npm run check:metadata` reports that SAP spells a property differently (e.g. `Selsource`
 * instead of `SelSource`), change ONLY the SAP name here - the normaliser renames it back to the
 * internal key, and the filter builder writes the SAP name.
 *
 * Kinds drive normalisation and $filter literals:
 *   s = Edm.String              -> string (trimmed of nothing; SAP values pass as is)
 *   d = Edm.Decimal             -> canonical decimal string ("12.5"), summed with decimal.js
 *   i = Edm.Int16/32/Byte       -> number
 *   b = Edm.Boolean             -> boolean
 *   t = Edm.DateTime            -> ISO date string (YYYY-MM-DD) or null
 */
export type FieldKind = 's' | 'd' | 'i' | 'b' | 't';
type FieldMap = Record<string, readonly [sapName: string, kind: FieldKind]>;

const def = <T extends FieldMap>(m: T) => m;

export const SERVICE = 'ZMM_BOM_COST_SRV';

export const ENTITY_SETS = {
  CostLines: 'CostLines',
  Rates: 'Rates',
  Freight: 'FreightSet',
  RmPm: 'RmPmSet',
  Plants: 'PlantSet',
  Materials: 'MaterialSet',
  Config: 'ConfigSet',
} as const;

/** Entity TYPE names as they appear in $metadata (used only by check:metadata). Adjust if SAP's
 * type names differ from the set names; the script lists what it finds when one is missing. */
export const ENTITY_TYPES: Record<keyof typeof ENTITY_SETS, string> = {
  CostLines: 'CostLine',
  Rates: 'RateRow',
  Freight: 'FreightRow',
  RmPm: 'RmPmRow',
  Plants: 'Plant',
  Materials: 'Material',
  Config: 'Config',
};

export const NAV_RATE_OPTIONS = 'RateOptions';
export const ENTITY_TYPE_RATE_OPTION = 'RateOption';

/** Selection ("filter-only") properties, present on CostLines, Rates, FreightSet and RmPmSet. */
export const SELECTION = def({
  Mode: ['Mode', 's'],
  Matnr: ['Matnr', 's'],
  Werks: ['Werks', 's'],
  Cplnt: ['Cplnt', 's'],
  Lookback: ['Lookback', 'i'],
  FreightDays: ['FreightDays', 'i'],
  ExplQty: ['ExplQty', 'd'],
  MaxLevel: ['MaxLevel', 'i'],
  Capid: ['Capid', 's'],
  Prio: ['Prio', 's'],
  DonorPlant: ['DonorPlant', 's'],
  AsofDate: ['AsofDate', 't'],
  UseAsof: ['UseAsof', 'b'],
  InclFrt: ['InclFrt', 'b'],
  StdFrt: ['StdFrt', 'b'],
  LatestOnly: ['LatestOnly', 'b'],
  InclBudget: ['InclBudget', 'b'],
  InclCover: ['InclCover', 'b'],
  BudgetYr: ['BudgetYr', 'i'],
  Hor1: ['Hor1', 'i'],
  Hor2: ['Hor2', 'i'],
  Hor3: ['Hor3', 'i'],
  BudatFrom: ['BudatFrom', 't'],
  BudatTo: ['BudatTo', 't'],
});

export const COST_LINE = def({
  Seqnr: ['Seqnr', 'i'],
  Land1: ['Land1', 's'],
  Landx: ['Landx', 's'],
  Hwerks: ['Hwerks', 's'],
  Headmat: ['Headmat', 's'],
  Headtxt: ['Headtxt', 's'],
  Level: ['Level', 'i'],
  Parent: ['Parent', 's'],
  Idnrk: ['Idnrk', 's'],
  Maktx: ['Maktx', 's'],
  Mtart: ['Mtart', 's'],
  Meins: ['Meins', 's'],
  HasChild: ['HasChild', 's'],
  Donor: ['Donor', 's'],
  Sobsl: ['Sobsl', 's'],
  CompGrp: ['CompGrp', 's'],
  CompOgrp: ['CompOgrp', 's'],
  Werks: ['Werks', 's'],
  Zskugrcodecrs: ['Zskugrcodecrs', 's'],
  Zskugroupcrs: ['Zskugroupcrs', 's'],
  Prodha: ['Prodha', 's'],
  Zskusize: ['Zskusize', 's'],
  Zscheme: ['Zscheme', 's'],
  Ntgew: ['Ntgew', 'd'],
  Matkl: ['Matkl', 's'],
  Zbusiness: ['Zbusiness', 's'],
  Usedqty: ['Usedqty', 'd'],
  Qtysrc: ['Qtysrc', 's'],
  Menge: ['Menge', 'd'],
  Bmeng: ['Bmeng', 'd'],
  Bmein: ['Bmein', 's'],
  Hbmeng: ['Hbmeng', 'd'],
  Hbmein: ['Hbmein', 's'],
  ProdQty: ['ProdQty', 'd'],
  SelSource: ['SelSource', 's'],
  SelCond: ['SelCond', 's'],
  SelCurr: ['SelCurr', 's'],
  SelVendor: ['SelVendor', 's'],
  SelVname: ['SelVname', 's'],
  SelCurrLocal: ['SelCurrLocal', 's'],
  LocCurr: ['LocCurr', 's'],
  SrcCount: ['SrcCount', 'i'],
  SelRate: ['SelRate', 'd'],
  SelRateLocal: ['SelRateLocal', 'd'],
  SelRatePc: ['SelRatePc', 'd'],
  SelRatePcLoc: ['SelRatePcLoc', 'd'],
  SelFx: ['SelFx', 'd'],
  CompCost: ['CompCost', 'd'],
  CompCostLocal: ['CompCostLocal', 'd'],
  SelFxInr: ['SelFxInr', 'd'],
  SelRateInr: ['SelRateInr', 'd'],
  SelRatePcInr: ['SelRatePcInr', 'd'],
  CompCostInr: ['CompCostInr', 'd'],
  DelvAsof: ['DelvAsof', 't'],
  FrtSrc: ['FrtSrc', 's'],
  FrtCurr: ['FrtCurr', 's'],
  TotActDelv: ['TotActDelv', 'd'],
  TotStdDelv: ['TotStdDelv', 'd'],
  FrtFx: ['FrtFx', 'd'],
  FrtPcLoc: ['FrtPcLoc', 'd'],
  FrtPcInr: ['FrtPcInr', 'd'],
  TotCostPcLoc: ['TotCostPcLoc', 'd'],
  TotCostLoc: ['TotCostLoc', 'd'],
  TotCostPcInr: ['TotCostPcInr', 'd'],
  TotCostInr: ['TotCostInr', 'd'],
  BudGjahr: ['BudGjahr', 's'],
  BudSource: ['BudSource', 's'],
  BudSrccurr: ['BudSrccurr', 's'],
  BudLanded: ['BudLanded', 'd'],
  BudSrcamt: ['BudSrcamt', 'd'],
  BudExchrate: ['BudExchrate', 'd'],
  StockQty: ['StockQty', 'd'],
  Eisbe: ['Eisbe', 'd'],
  OpenpoQty: ['OpenpoQty', 'd'],
  OpenprQty: ['OpenprQty', 'd'],
  TotalAvail: ['TotalAvail', 'd'],
  ReqH1: ['ReqH1', 'd'],
  ReqH2: ['ReqH2', 'd'],
  ReqH3: ['ReqH3', 'd'],
  CovH1: ['CovH1', 'd'],
  CovH2: ['CovH2', 'd'],
  CovH3: ['CovH3', 'd'],
});

export const RATE_OPTION = def({
  Seqnr: ['Seqnr', 'i'],
  Hwerks: ['Hwerks', 's'],
  Headmat: ['Headmat', 's'],
  Source: ['Source', 's'],
  Cond: ['Cond', 's'],
  Curr: ['Curr', 's'],
  LocCurr: ['LocCurr', 's'],
  Uom: ['Uom', 's'],
  Plant: ['Plant', 's'],
  ValidFrom: ['ValidFrom', 't'],
  Rate: ['Rate', 'd'],
  RateLoc: ['RateLoc', 'd'],
  Fx: ['Fx', 'd'],
  FxInr: ['FxInr', 'd'],
  RatePc: ['RatePc', 'd'],
  RatePcLoc: ['RatePcLoc', 'd'],
  RatePcInr: ['RatePcInr', 'd'],
  CostLoc: ['CostLoc', 'd'],
  CostInr: ['CostInr', 'd'],
});

export const RATE_ROW = def({
  RowId: ['RowId', 's'],
  Recordsource: ['Recordsource', 's'],
  Material: ['Material', 's'],
  Matdesc: ['Matdesc', 's'],
  Plant: ['Plant', 's'],
  Vendor: ['Vendor', 's'],
  Vendorname: ['Vendorname', 's'],
  Inforecord: ['Inforecord', 's'],
  Purchasedocument: ['Purchasedocument', 's'],
  Conditiontype: ['Conditiontype', 's'],
  Validfrom: ['Validfrom', 't'],
  Validto: ['Validto', 't'],
  Currency: ['Currency', 's'],
  Pricingunit: ['Pricingunit', 'd'],
  Conditionunit: ['Conditionunit', 's'],
  Baseuom: ['Baseuom', 's'],
  Localcurrency: ['Localcurrency', 's'],
  Rate: ['Rate', 'd'],
  RateUnit: ['RateUnit', 'd'],
  RatePc: ['RatePc', 'd'],
  Ratelocal: ['Ratelocal', 'd'],
  RateUnitLoc: ['RateUnitLoc', 'd'],
  RatePcLoc: ['RatePcLoc', 'd'],
  FxFactor: ['FxFactor', 'd'],
  FxInr: ['FxInr', 'd'],
  RateUnitInr: ['RateUnitInr', 'd'],
  RatePcInr: ['RatePcInr', 'd'],
});

export const FREIGHT_ROW = def({
  RowId: ['RowId', 's'],
  Material: ['Material', 's'],
  Matdesc: ['Matdesc', 's'],
  Plant: ['Plant', 's'],
  Conditiontype: ['Conditiontype', 's'],
  Purchasedocument: ['Purchasedocument', 's'],
  Purchaseline: ['Purchaseline', 's'],
  Podate: ['Podate', 't'],
  Baseunit: ['Baseunit', 's'],
  Matuom: ['Matuom', 's'],
  Currency: ['Currency', 's'],
  Localcurrency: ['Localcurrency', 's'],
  Actualdelvquantity: ['Actualdelvquantity', 'd'],
  Actualdelvcostamount: ['Actualdelvcostamount', 'd'],
  ActRate: ['ActRate', 'd'],
  Stddelvquantity: ['Stddelvquantity', 'd'],
  Stddelvcostamount: ['Stddelvcostamount', 'd'],
  StdRate: ['StdRate', 'd'],
  UsedSrc: ['UsedSrc', 's'],
  UsedRate: ['UsedRate', 'd'],
  UsedRatePc: ['UsedRatePc', 'd'],
  FxFactor: ['FxFactor', 'd'],
  UsedPcLoc: ['UsedPcLoc', 'd'],
  FxInr: ['FxInr', 'd'],
  UsedPcInr: ['UsedPcInr', 'd'],
});

export const RMPM_ROW = def({
  Material: ['Material', 's'],
  Matdesc: ['Matdesc', 's'],
  Mtart: ['Mtart', 's'],
  Plant: ['Plant', 's'],
  Baseuom: ['Baseuom', 's'],
  Qty: ['Qty', 'd'],
  RateSrc: ['RateSrc', 's'],
  Vendor: ['Vendor', 's'],
  Vendname: ['Vendname', 's'],
  RateCurr: ['RateCurr', 's'],
  RatePcOrg: ['RatePcOrg', 'd'],
  LocCurr: ['LocCurr', 's'],
  FxLoc: ['FxLoc', 'd'],
  RatePcLoc: ['RatePcLoc', 'd'],
  FrtSrc: ['FrtSrc', 's'],
  FrtPcLoc: ['FrtPcLoc', 'd'],
  TotPcLoc: ['TotPcLoc', 'd'],
  RateCostLoc: ['RateCostLoc', 'd'],
  FrtCostLoc: ['FrtCostLoc', 'd'],
  TotCostLoc: ['TotCostLoc', 'd'],
  FxInr: ['FxInr', 'd'],
  RatePcInr: ['RatePcInr', 'd'],
  FrtPcInr: ['FrtPcInr', 'd'],
  TotPcInr: ['TotPcInr', 'd'],
  RateCostInr: ['RateCostInr', 'd'],
  FrtCostInr: ['FrtCostInr', 'd'],
  TotCostInr: ['TotCostInr', 'd'],
});

export const PLANT = def({
  Werks: ['Werks', 's'],
  Name1: ['Name1', 's'],
  Land1: ['Land1', 's'],
  Waers: ['Waers', 's'],
});

export const MATERIAL = def({
  Matnr: ['Matnr', 's'],
  Maktx: ['Maktx', 's'],
  Mtart: ['Mtart', 's'],
  Meins: ['Meins', 's'],
});

export const CONFIG = def({
  CfgKey: ['CfgKey', 's'],
  CfgVal: ['CfgVal', 's'],
});

export const CONFIG_KEYS = { GROUP_CURR: 'GROUP_CURR', DEFAULT_PRIO: 'DEFAULT_PRIO', MAX_HEADS: 'MAX_HEADS' } as const;

/** Which field map describes each entity set (and its type in $metadata). */
export const ENTITY_FIELDS = {
  CostLines: COST_LINE,
  Rates: RATE_ROW,
  Freight: FREIGHT_ROW,
  RmPm: RMPM_ROW,
  Plants: PLANT,
  Materials: MATERIAL,
  Config: CONFIG,
} as const;

/** Sets that are driven by the selection properties above. */
export const SELECTION_SETS = ['CostLines', 'Rates', 'Freight', 'RmPm'] as const;

/** SAP name of a selection field. */
export const sel = (k: keyof typeof SELECTION) => SELECTION[k][0];

// ---- derived row types (decimals are strings, dates ISO strings) -------------------------------
type KindType<K extends FieldKind> = K extends 'd' ? string : K extends 'i' ? number : K extends 'b' ? boolean : K extends 't' ? string | null : string;
export type RowOf<M extends FieldMap> = { [P in keyof M]: KindType<M[P][1]> };

export type RateOption = RowOf<typeof RATE_OPTION>;
export type CostLine = RowOf<typeof COST_LINE> & { RateOptions: RateOption[] };
export type RateRow = RowOf<typeof RATE_ROW>;
export type FreightRow = RowOf<typeof FREIGHT_ROW>;
export type RmPmRow = RowOf<typeof RMPM_ROW>;
export type PlantRow = RowOf<typeof PLANT>;
export type MaterialRow = RowOf<typeof MATERIAL>;
export type ConfigRow = RowOf<typeof CONFIG>;
