/**
 * Budget costing sets of ZMM_BOM_COST_SRV (the OData rebuild of the SAP report ZMM_FG_BOMEXPLR_COST).
 *
 * *** CONTRACT, NOT YET LIVE ***  None of these sets is published yet, so every name below is the agreed contract and is
 * UNVERIFIED. When SAP publishes them run `npm run check:budget-metadata` and fix names ONLY in this file (the normaliser
 * renames them back to the internal keys). Kept apart from lib/sap/fields.ts on purpose, like lib/ck and lib/wac.
 *
 * Flags are ABAP CHAR1 ('X' = on, left out = off) in every $filter, as on RateRowSet / FreightRowSet (never a boolean).
 * SAP does every costing step (BOM explosion, component cost, rate / activity resolution, roll-up); nothing is recomputed here.
 */
import type { FieldMap } from '../price-context/odata';

export const BUDGET_SET = {
  SUMMARY: 'BudgetSumSet',        // one row per FG x plant (st_summ); one plant per request
  SPLIT: 'BudgetSplitSet',        // component rows of ONE FG + plant (st_split)
  CHECK: 'BudgetChkSet',          // FG-level BOM / production version checklist (the report's "rad7" run)
  PENDING: 'BudgetPendSet',       // zmm_fbudcost_sum rows waiting for the approver (status I)
  PENDING_DET: 'BudgetPendDetSet', // zmm_fbudcost_det rows of a pending version
  INIT: 'BudgetInitSet',          // POST: initiate (save a new version from earlier runs)
  APPROVE: 'BudgetApproveSet',    // POST: approve a pending version
} as const;
export type BudgetSetKey = keyof typeof BUDGET_SET;

/** $filter property names of the selection (same on SUMMARY, SPLIT and CHECK). */
export const BUDGET_FILTER = {
  Werks: 'Werks', Matnr: 'Matnr', Mtart: 'Mtart', BudatFrom: 'BudatFrom', BudatTo: 'BudatTo', Plan1: 'Plan1', Scheme: 'Scheme',
  BudgetYr: 'BudgetYr', RateYr: 'RateYr', Uom: 'Uom',
  FgSource: 'FgSource',       // P production orders (AUFM) | G goods receipts (MSEG 101) | N NPD (material master)
  Business: 'Business',       // 01 CCD | 02 HCD | 03 IMD | 04 CSD (left out when ExclDiv)
  ExclDiv: 'ExclDiv',         // report's EXDV: all business lines; the only way to initiate
  Country: 'Country',         // IN | LK | AE | BD: where component costs come from
  ExclManuf: 'ExclManuf',     // check1: drop manufactured (xtlty M) WIP / FRT2 lines
  Overrides: 'Overrides',     // check2 popup: 'MATNR|VALUE|PCT;MATNR|VALUE|PCT'
  OnlyOverrides: 'OnlyOverrides', // check3: only FGs that contain an overridden component
  OneSkuPerCrs: 'OneSkuPerCrs',   // check4: one FG per CRS SKU / scheme / type / plant / business line
  InclDirect: 'InclDirect',   // check5: add directly purchased products (goods receipt source only)
  BomQtyX10: 'BomQtyX10',     // check7: explode the BOM at 10 x base quantity
  Checklist: 'Checklist',     // rad6: also compute the BOM / production version flags
  Rowid: 'Rowid',             // SPLIT: not a filter, kept for the key
  AppUser: 'AppUser',         // hub e-mail; SAP maps it to the initiator / approver (zmm_cost_aprove)
  Gjahr: 'Gjahr', Version: 'Version',
} as const;

/** Origin groups (HRKFT of the component's valuation): code, label, property stem. */
export const ORIGINS = [
  ['CAP', 'CAP', 'Cap'], ['CBSV', 'COMBI SLEEVE', 'Cbsv'], ['FW', 'FLOW WRAP', 'Fw'], ['GB', 'GLASS BOTTLE', 'Gb'], ['LBEL', 'LABEL', 'Lbel'],
  ['LFLT', 'LEAFLET', 'Lflt'], ['LMNS', 'LAMINATES', 'Lmns'], ['MRCN', 'MASTER CARTON', 'Mrcn'], ['PC', 'PLASTIC CONTAINER', 'Pc'],
  ['SPC', 'SPC', 'Spc'], ['SPT', 'SPOUT', 'Spt'], ['TUBE', 'TUBES', 'Tube'], ['WWF', 'WAD/WASHER/FOIL', 'Wwf'], ['DGHR', 'DANGLER & HEADER', 'Dghr'],
  ['GRNS', 'Granules', 'Grns'], ['IP', 'INTERMEDIATE PACKING', 'Ip'], ['OPI', 'OTHER PACKING ITEMS', 'Opi'],
] as const;
export type OriginStem = (typeof ORIGINS)[number][2];
export type OriginKey = OriginStem | `A${OriginStem}` | `L${OriginStem}`;

const def = <T extends FieldMap>(m: T) => m;
const originMap = (): FieldMap => Object.fromEntries(ORIGINS.flatMap(([, , n]) => [[n, [n, 'd']], [`A${n}`, [`A${n}`, 'd']], [`L${n}`, [`L${n}`, 'd']]])) as FieldMap;

/** BudgetSumSet: one budget cost line per FG and plant. B = budget (priced from zcomponent / zcomponent_n, CPD), P = projected (override), A = actual (goods issues),
 *  L = latest info-record rate, INFORMATION ONLY (never part of the cost); C / T = consumer / trade. */
export const BUDGET_SUMMARY = def({
  Rowid: ['Rowid', 'i'], RunId: ['RunId', 's'],
  Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], MtartFg: ['MtartFg', 's'], Werks: ['Werks', 's'], Zscheme: ['Zscheme', 's'], Zbusiness: ['Zbusiness', 's'], Year: ['Year', 's'],
  Zskugrcodecrs: ['Zskugrcodecrs', 's'], Zskugroupcrs: ['Zskugroupcrs', 's'], Zskusize: ['Zskusize', 'd'], Ntgew: ['Ntgew', 'd'], Gewei: ['Gewei', 's'], Lifnr: ['Lifnr', 's'], Name1: ['Name1', 's'],
  WipCode: ['WipCode', 's'], WipDesc: ['WipDesc', 's'], WipStlal: ['WipStlal', 's'], WipBaseUnit: ['WipBaseUnit', 's'], WipBaseQty: ['WipBaseQty', 'd'], WipUsedQty: ['WipUsedQty', 'd'], WipCostp: ['WipCostp', 'd'],
  RmCost: ['RmCost', 'd'], PmCost: ['PmCost', 'd'], PerfumeCost: ['PerfumeCost', 'd'],
  CostPerpc1: ['CostPerpc1', 'd'], PCostPerpc1: ['PCostPerpc1', 'd'], ACostPerpc1: ['ACostPerpc1', 'd'], LastRate: ['LastRate', 'd'],
  ARmcostPerpc1: ['ARmcostPerpc1', 'd'], APmcostPerpc1: ['APmcostPerpc1', 'd'], APerfcostPerpc1: ['APerfcostPerpc1', 'd'],
  RmlastRate: ['RmlastRate', 'd'], PmlastRate: ['PmlastRate', 'd'], PerfumelastRate: ['PerfumelastRate', 'd'],
  CRmCost: ['CRmCost', 'd'], CPmCost: ['CPmCost', 'd'], CPerfCost: ['CPerfCost', 'd'], COthCost: ['COthCost', 'd'],
  TRmCost: ['TRmCost', 'd'], TPmCost: ['TPmCost', 'd'], TPerfCost: ['TPerfCost', 'd'], TOthCost: ['TOthCost', 'd'],
  Machine: ['Machine', 'd'], Labour: ['Labour', 'd'], Power: ['Power', 'd'], Steam: ['Steam', 'd'], Labour3p: ['Labour3p', 'd'],
  Bmsch: ['Bmsch', 'd'], Vgw01: ['Vgw01', 'd'], Vgw02: ['Vgw02', 'd'], Vgw03: ['Vgw03', 'd'], Vgw04: ['Vgw04', 'd'], Vgw05: ['Vgw05', 'd'],
  Machrs: ['Machrs', 'd'], Labhrs: ['Labhrs', 'd'], Powerhrs: ['Powerhrs', 'd'], Steamhrs: ['Steamhrs', 'd'],
  MachrsQty: ['MachrsQty', 'd'], LabhrsQty: ['LabhrsQty', 'd'], PowerQty: ['PowerQty', 'd'], SteamQty: ['SteamQty', 'd'], Labour3pQty: ['Labour3pQty', 'd'],
  BomBmeng: ['BomBmeng', 'd'], Bmeng: ['Bmeng', 'd'],
  PlanCost: ['PlanCost', 'd'], PlanQty: ['PlanQty', 'd'], QtyMt: ['QtyMt', 'd'],
  StartD: ['StartD', 't'], EndD: ['EndD', 't'], InfoDateFrm: ['InfoDateFrm', 't'], InfoDateTo: ['InfoDateTo', 't'],
  MulUnlock: ['MulUnlock', 'f'], MulBom: ['MulBom', 'f'], MulProd: ['MulProd', 'f'], AllBomIn: ['AllBomIn', 'f'], AllPverIn: ['AllPverIn', 'f'],
  Msg: ['Msg', 's'],
  ...originMap(),
});

/** BudgetSplitSet: the BOM components of one FG and plant (the report's split level). Level 1 = Stufe 1. */
export const BUDGET_SPLIT = def({
  Rowid: ['Rowid', 'i'], Matnr: ['MatnrFg', 's'], Maktx: ['MaktxFg', 's'], Werks: ['Werks', 's'], Stlal: ['Stlal', 's'], Bmeng: ['Bmeng', 'd'], Stufe: ['Stufe', 'i'],
  ItemCode: ['ItemCode', 's'], ItemDesc: ['ItemDesc', 's'], ItemBom: ['ItemBom', 's'], ItemStlal: ['ItemStlal', 's'], Mtart: ['Mtart', 's'], Hrkft: ['Hrkft', 's'], Sobsl: ['Sobsl', 's'],
  Erskz: ['Erskz', 's'], Xtlty: ['Xtlty', 's'], Pcindi: ['Pcindi', 's'], PcindiDesc: ['PcindiDesc', 's'], WipPcindi: ['WipPcindi', 's'], WipPcindiDesc: ['WipPcindiDesc', 's'],
  Menge: ['Menge', 'd'], Meins: ['Meins', 's'], MeinsFg: ['MeinsFg', 's'], Epein: ['Epein', 'd'],
  DiscountBasic: ['DiscountBasic', 'd'], FrgAmt: ['FrgAmt', 'd'], Landed: ['Landed', 'd'], Total: ['Total', 'd'], PTotal: ['PTotal', 'd'], ATotal: ['ATotal', 'd'],
  CostPerpc: ['CostPerpc', 'd'], PCostPerpc: ['PCostPerpc', 'd'], ACostPerpc: ['ACostPerpc', 'd'],
  CostPerpc1: ['CostPerpc1', 'd'], PCostPerpc1: ['PCostPerpc1', 'd'], ACostPerpc1: ['ACostPerpc1', 'd'],
  CostPer1000: ['CostPer1000', 'd'], PCostPer1000: ['PCostPer1000', 'd'], ACostPer1000: ['ACostPer1000', 'd'], LastRate: ['LastRate', 'd'],
  Machine: ['Machine', 'd'], Labour: ['Labour', 'd'], Power: ['Power', 'd'], Steam: ['Steam', 'd'], Labour3p: ['Labour3p', 'd'],
  Bmsch: ['Bmsch', 'd'], Vgw01: ['Vgw01', 'd'], Vgw02: ['Vgw02', 'd'], Vgw03: ['Vgw03', 'd'], Vgw04: ['Vgw04', 'd'], Vgw05: ['Vgw05', 'd'],
  Machrs: ['Machrs', 'd'], Labhrs: ['Labhrs', 'd'], Powerhrs: ['Powerhrs', 'd'], Steamhrs: ['Steamhrs', 'd'],
  MachrsQty: ['MachrsQty', 'd'], LabhrsQty: ['LabhrsQty', 'd'], PowerQty: ['PowerQty', 'd'], SteamQty: ['SteamQty', 'd'], Labour3pQty: ['Labour3pQty', 'd'],
  Lifnr: ['Lifnr', 's'], Name1: ['Name1', 's'], Zscheme: ['Zscheme', 's'], Zbusiness: ['Zbusiness', 's'], Zskusize: ['Zskusize', 'd'], Zskugrcodecrs: ['Zskugrcodecrs', 's'],
  MulUnlock: ['MulUnlock', 'f'], MulBom: ['MulBom', 'f'], MulProd: ['MulProd', 'f'], AllBomIn: ['AllBomIn', 'f'], AllPverIn: ['AllPverIn', 'f'],
});

/** BudgetChkSet: FG level BOM / production version checks (st_fg_bom). */
export const BUDGET_CHECK = def({
  Rowid: ['Rowid', 'i'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Mtart: ['Mtart', 's'], Werks: ['Werks', 's'],
  AllBomIn: ['AllBomIn', 'f'], AllPverIn: ['AllPverIn', 'f'], MulUnlock: ['MulUnlock', 'f'], MulBom: ['MulBom', 'f'], MulProd: ['MulProd', 'f'],
});

/** BudgetPendSet: saved budget lines (zmm_fbudcost_sum) of the approver, status I = initiated, A = approved. */
export const BUDGET_PENDING = def({
  Rowid: ['Rowid', 'i'], Gjahr: ['Gjahr', 's'], Monat: ['Monat', 's'], Version: ['Version', 's'], Status: ['Status', 's'],
  Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Mtart: ['Mtart', 's'], Werks: ['Werks', 's'], Zscheme: ['Zscheme', 's'], Zbusiness: ['Zbusiness', 's'],
  Zskugrcodecrs: ['Zskugrcodecrs', 's'], Zskugroupcrs: ['Zskugroupcrs', 's'], Zskusize: ['Zskusize', 'd'],
  WipCode: ['WipCode', 's'], WipDesc: ['WipDesc', 's'], WipStlal: ['WipStlal', 's'], WipBaseUnit: ['WipBaseUnit', 's'], WipCostp: ['WipCostp', 'd'],
  RmCost: ['RmCost', 'd'], PmCost: ['PmCost', 'd'], PerfumeCost: ['PerfumeCost', 'd'],
  CostPc: ['CostPc', 'd'], PcostPc: ['PcostPc', 'd'], AcostPc: ['AcostPc', 'd'], LRate: ['LRate', 'd'],
  ArmCostPc: ['ArmCostPc', 'd'], ApmCostPc: ['ApmCostPc', 'd'], AperfCostPc: ['AperfCostPc', 'd'], RmLrate: ['RmLrate', 'd'], PmLrate: ['PmLrate', 'd'], PerfLrate: ['PerfLrate', 'd'],
  Machine: ['Machine', 'd'], Labour: ['Labour', 'd'], Power: ['Power', 'd'], Steam: ['Steam', 'd'], Labour3p: ['Labour3p', 'd'],
  PlanCost: ['PlanCost', 'd'], PlanQty: ['PlanQty', 'd'], QtyMt: ['QtyMt', 'd'], Ntgew: ['Ntgew', 'd'], Gewei: ['Gewei', 's'],
  Remarks: ['Remarks', 's'], Remarks1: ['Remarks1', 's'], InitiatedBy: ['InitiatedBy', 's'], InitiatedOn: ['InitiatedOn', 't'], ApprovedBy: ['ApprovedBy', 's'], ApprovedOn: ['ApprovedOn', 't'],
  ...originMap(),
});

/** BudgetPendDetSet: the component rows saved with a version (zmm_budcost_det). */
export const BUDGET_PENDING_DET = def({
  Rowid: ['Rowid', 'i'], SrNo: ['SrNo', 'i'], Gjahr: ['Gjahr', 's'], Version: ['Version', 's'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], MtartFg: ['MtartFg', 's'], Werks: ['Werks', 's'],
  Zscheme: ['Zscheme', 's'], Zskugrcodecrs: ['Zskugrcodecrs', 's'], Idnrk: ['Idnrk', 's'], ItemDesc: ['ItemDesc', 's'], Matkl: ['Matkl', 's'], Mtart: ['Mtart', 's'], Hrkft: ['Hrkft', 's'], Erskz: ['Erskz', 's'], Stufe: ['Stufe', 'i'],
  Menge: ['Menge', 'd'], Meins: ['Meins', 's'], BaseUnit: ['BaseUnit', 's'], BasicD: ['BasicD', 'd'],
  Cost: ['Cost', 'd'], PCost: ['PCost', 'd'], ACost: ['ACost', 'd'], CostPc: ['CostPc', 'd'], PcostPc: ['PcostPc', 'd'], AcostPc: ['AcostPc', 'd'], LRate: ['LRate', 'd'],
  Cost1000: ['Cost1000', 'd'], Pcost1000: ['Pcost1000', 'd'], Acost1000: ['Acost1000', 'd'], Ptotal: ['Ptotal', 'd'], Atotal: ['Atotal', 'd'],
  Machine: ['Machine', 'd'], Labour: ['Labour', 'd'], Power: ['Power', 'd'], Steam: ['Steam', 'd'], Labour3p: ['Labour3p', 'd'],
});

/** POST results (BudgetInitSet / BudgetApproveSet). Status S saved, E error, W saved with warnings. */
export const BUDGET_INIT_RESULT = def({
  Gjahr: ['Gjahr', 's'], Monat: ['Monat', 's'], Version: ['Version', 's'], Status: ['Status', 's'], SavedSum: ['SavedSum', 'i'], SavedDet: ['SavedDet', 'i'], MsgTxt: ['MsgTxt', 's'],
});
export const BUDGET_APPROVE_RESULT = def({
  Gjahr: ['Gjahr', 's'], Version: ['Version', 's'], Status: ['Status', 's'], Approved: ['Approved', 'i'], MsgTxt: ['MsgTxt', 's'],
});

export const BUDGET_FIELDS = { SUMMARY: BUDGET_SUMMARY, SPLIT: BUDGET_SPLIT, CHECK: BUDGET_CHECK, PENDING: BUDGET_PENDING, PENDING_DET: BUDGET_PENDING_DET } as const;
export type BudgetReadKey = keyof typeof BUDGET_FIELDS;
