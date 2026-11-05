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
 *   f = ABAP flag (Edm.String)  -> boolean; in $filter true -> 'X', false -> ''
 */
import type { EntitySetKey } from './entities';

export type FieldKind = 's' | 'd' | 'i' | 'b' | 't' | 'f';
type FieldMap = Record<string, readonly [sapName: string, kind: FieldKind]>;

const def = <T extends FieldMap>(m: T) => m;

/** RateOption entity type name in $metadata (informational: the set itself is not addressable,
 * rows arrive only via $expand=RateOptions on CostLineSet - see entities.ts). */
export const ENTITY_TYPE_RATE_OPTION = 'RateOption';

/** Selection ("filter-only") properties, the same on CostLineSet, RateRowSet, FreightRowSet and
 * RmPmRowSet. Matnr and Werks are mandatory on all four. */
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
  Ekorg: ['Ekorg', 's'], // FreightRowSet: purchasing organisation of the PO (filter and row property; not on an older SAP)
  AllItems: ['AllItems', 'b'], // FreightRowSet only: one row per posting (ABAP char flag, 'X' only when on)
  InclBudget: ['InclBudget', 'b'],
  InclCover: ['InclCover', 'b'],
  BudgetYr: ['BudgetYr', 's'], // NUMC 4 on the live service: sent quoted ('2026')
  Hor1: ['Hor1', 'i'],
  Hor2: ['Hor2', 'i'],
  Hor3: ['Hor3', 'i'],
  BudatFrom: ['BudatFrom', 't'],
  BudatTo: ['BudatTo', 't'],
});

/** CostLineSet. Hwerks = BOM plant (mode B) / comparison (cost) plant (mode C); Werks = component
 * plant; Headmat = header material; Idnrk = component; HasChild 'X' = parent row (leaf = blank);
 * SelSource blank = no rate; LocCurr = currency of the *Loc totals (the *Inr ones are INR). */
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
  HasChild: ['Haschild', 's'], // live service spells it Haschild
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
  // Cost fields the live service sends but the screens did not read before: the actual rate and the BOM source.
  ActRatePc: ['ActRatePc', 'd'],
  ActRatePcInr: ['ActRatePcInr', 'd'],
  BomSrc: ['BomSrc', 's'],
  BomPlant: ['BomPlant', 's'],
  BomSrcDate: ['BomSrcDate', 't'],
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

/** RateRowSet: Material / Plant (not Matnr / Werks), Recordsource = rate source. */
export const RATE_ROW = def({
  RowId: ['Rowid', 'i'], // live: Rowid, Edm.Int
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

/** FreightRowSet: one row per PO line (Material, Plant, Podate, Conditiontype). */
export const FREIGHT_ROW = def({
  RowId: ['Rowid', 'i'], // live: Rowid, Edm.Int32 (key)
  Bukrs: ['Bukrs', 's'],
  FgMatnr: ['FgMatnr', 's'],
  Lifnr: ['Lifnr', 's'],
  Name1: ['Name1', 's'],
  Belnr: ['Belnr', 's'],
  Xblnr: ['Xblnr', 's'],
  Ztmode: ['Ztmode', 's'],
  GstPart: ['GstPart', 's'],
  PlcSup: ['PlcSup', 's'],
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
  // With AllItems eq 'X' (NEXT_PUBLIC_FREIGHT_ALL_ITEMS): one row per posting. All of these are absent on an older SAP.
  Ekorg: ['Ekorg', 's'], // purchasing organisation of the PO
  Cpudt: ['Cpudt', 't'], // posting date (Edm.DateTime)
  Vgabe: ['Vgabe', 's'], // 1 goods receipt, 2 or 3 invoice
  Buzei: ['Buzei', 's'],
  Gjahr: ['Gjahr', 's'],
  Shkzg: ['Shkzg', 's'], // S debit, H credit
  // NWP spells these Ismaxdate / Islatestpo (checked on a live answer, 5 Nov 2026); OData names are case sensitive
  IsMaxDate: ['Ismaxdate', 'f'], // 'X' = on the max posting date of its PO line and side
  IsLatestPo: ['Islatestpo', 'f'], // 'X' = newest PO date for material, plant and condition type
});

/** RmPmRowSet: key Material + Plant. */
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

/** PlantVHSet (value help). */
export const PLANT = def({
  Werks: ['Werks', 's'],
  Name1: ['Name1', 's'],
  Land1: ['Land1', 's'],
  Waers: ['Waers', 's'],
});

/** MaterialVHSet (value help, type-ahead via ?search=). */
export const MATERIAL = def({
  Matnr: ['Matnr', 's'],
  Maktx: ['Maktx', 's'],
  Mtart: ['Mtart', 's'],
  Meins: ['Meins', 's'],
});

/** Brand / Product (PRODHA) / CRS levels come from HierVHSet; MaterialVHSet is only filtered by them
 * (Zbrandcode, Prodha, Zskugrcodecrs) - see lib/client/hier.ts. */
/** ConfigItemSet: CfgKey / CfgVal pairs. */
export const CONFIG = def({
  CfgKey: ['CfgKey', 's'],
  CfgVal: ['CfgVal', 's'],
});

export const CONFIG_KEYS = { GROUP_CURR: 'GROUP_CURR', DEFAULT_PRIO: 'DEFAULT_PRIO', MAX_HEADS: 'MAX_HEADS' } as const;

/** Result field map of each entity set (keys = ENTITY_SET keys in entities.ts). */
export const FIELDS_BY_SET = {
  COST_LINES: COST_LINE,
  RATES: RATE_ROW,
  FREIGHT: FREIGHT_ROW,
  RMPM: RMPM_ROW,
  PLANTS: PLANT,
  MATERIALS: MATERIAL,
  CONFIG: CONFIG,
} as const;

/**
 * Selection properties whose Edm type differs per entity set on the live service (checked against
 * NGD 2026-10-04): the flags are Edm.Boolean on CostLineSet but ABAP char flags ('X' / '') on the
 * row sets - sending `StdFrt eq false` there fails with "Invalid parametertype used at function 'eq'".
 */
const FLAGS_AS_CHAR = { UseAsof: 'f', InclFrt: 'f', StdFrt: 'f', LatestOnly: 'f', AllItems: 'f', InclBudget: 'f', InclCover: 'f' } as const;
export const SELECTION_KIND_BY_SET: Partial<Record<EntitySetKey, Partial<Record<keyof typeof SELECTION, FieldKind>>>> = {
  RATES: FLAGS_AS_CHAR,
  FREIGHT: FLAGS_AS_CHAR,
  RMPM: FLAGS_AS_CHAR,
};

/** [SAP name, kind] of a selection field on a given entity set. */
export function selectionField(set: EntitySetKey, k: keyof typeof SELECTION): readonly [string, FieldKind] {
  const [name, kind] = SELECTION[k];
  return [name, SELECTION_KIND_BY_SET[set]?.[k] ?? kind];
}

/**
 * Properties the app can live without: absent on the live service today (coverage is not
 * implemented in ZMM_BOM_COST_SRV yet). They normalise to 0, coverage KPIs then show "not
 * requested", and check:metadata reports them as a warning instead of failing.
 */
export const OPTIONAL_PROPS: ReadonlySet<string> = new Set([
  'Ekorg', 'StockQty', 'Eisbe', 'OpenpoQty', 'OpenprQty', 'TotalAvail', 'ReqH1', 'ReqH2', 'ReqH3', 'CovH1', 'CovH2', 'CovH3',
]);

/** SAP name of a selection field. */
export const sel = (k: keyof typeof SELECTION) => SELECTION[k][0];

// ---- derived row types (decimals are strings, dates ISO strings) -------------------------------
type KindType<K extends FieldKind> = K extends 'd' ? string : K extends 'i' ? number : K extends 'b' | 'f' ? boolean : K extends 't' ? string | null : string;
export type RowOf<M extends FieldMap> = { [P in keyof M]: KindType<M[P][1]> };

export type RateOption = RowOf<typeof RATE_OPTION>;
/** RateOptions is present only when the line came from CostLineSet?$expand=RateOptions (mode B). */
export type CostLine = RowOf<typeof COST_LINE> & { RateOptions?: RateOption[] };
export type RateRow = RowOf<typeof RATE_ROW>;
/** The posting fields only exist on a SAP service with the AllItems change; the normaliser fills them in, but a row built by hand may leave them out. */
type FreightPostingKeys = 'Ekorg' | 'Cpudt' | 'Vgabe' | 'Buzei' | 'Gjahr' | 'Shkzg' | 'IsMaxDate' | 'IsLatestPo';
/** IsNet is not a SAP property: groupPoLines sets it on a summed PO line whose amounts are already net of debit and credit. */
export type FreightRow = Omit<RowOf<typeof FREIGHT_ROW>, FreightPostingKeys> & Partial<Pick<RowOf<typeof FREIGHT_ROW>, FreightPostingKeys>> & { IsNet?: boolean };
export type RmPmRow = RowOf<typeof RMPM_ROW>;
export type PlantRow = RowOf<typeof PLANT>;
export type MaterialRow = RowOf<typeof MATERIAL>;
export type ConfigRow = RowOf<typeof CONFIG>;
