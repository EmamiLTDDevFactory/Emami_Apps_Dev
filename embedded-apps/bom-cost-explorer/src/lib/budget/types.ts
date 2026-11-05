/** Rows of the budget sets. Decimals are canonical strings (decimal.js at the point of use); flags are booleans; dates YYYY-MM-DD or null. */
import type { OriginKey } from './fields';

type OriginAmounts = Record<OriginKey, string>;

export interface BudgetSummaryRow extends OriginAmounts {
  Rowid: number; RunId: string;
  Matnr: string; Maktx: string; MtartFg: string; Werks: string; Zscheme: string; Zbusiness: string; Year: string;
  Zskugrcodecrs: string; Zskugroupcrs: string; Zskusize: string; Ntgew: string; Gewei: string; Lifnr: string; Name1: string;
  WipCode: string; WipDesc: string; WipStlal: string; WipBaseUnit: string; WipBaseQty: string; WipUsedQty: string; WipCostp: string;
  RmCost: string; PmCost: string; PerfumeCost: string;
  CostPerpc1: string; PCostPerpc1: string; ACostPerpc1: string; LastRate: string;
  ARmcostPerpc1: string; APmcostPerpc1: string; APerfcostPerpc1: string; RmlastRate: string; PmlastRate: string; PerfumelastRate: string;
  CRmCost: string; CPmCost: string; CPerfCost: string; COthCost: string; TRmCost: string; TPmCost: string; TPerfCost: string; TOthCost: string;
  Machine: string; Labour: string; Power: string; Steam: string; Labour3p: string;
  Bmsch: string; Vgw01: string; Vgw02: string; Vgw03: string; Vgw04: string; Vgw05: string;
  Machrs: string; Labhrs: string; Powerhrs: string; Steamhrs: string; MachrsQty: string; LabhrsQty: string; PowerQty: string; SteamQty: string; Labour3pQty: string;
  BomBmeng: string; Bmeng: string; PlanCost: string; PlanQty: string; QtyMt: string;
  StartD: string | null; EndD: string | null; InfoDateFrm: string | null; InfoDateTo: string | null;
  MulUnlock: boolean; MulBom: boolean; MulProd: boolean; AllBomIn: boolean; AllPverIn: boolean;
  Msg: string;
}

export interface BudgetSplitRow {
  Rowid: number; Matnr: string; Maktx: string; Werks: string; Stlal: string; Bmeng: string; Stufe: number;
  ItemCode: string; ItemDesc: string; ItemBom: string; ItemStlal: string; Mtart: string; Hrkft: string; Sobsl: string; Erskz: string; Xtlty: string;
  Pcindi: string; PcindiDesc: string; WipPcindi: string; WipPcindiDesc: string;
  Menge: string; Meins: string; MeinsFg: string; Epein: string;
  DiscountBasic: string; FrgAmt: string; Landed: string; Total: string; PTotal: string; ATotal: string;
  CostPerpc: string; PCostPerpc: string; ACostPerpc: string; CostPerpc1: string; PCostPerpc1: string; ACostPerpc1: string;
  CostPer1000: string; PCostPer1000: string; ACostPer1000: string; LastRate: string;
  Machine: string; Labour: string; Power: string; Steam: string; Labour3p: string;
  Bmsch: string; Vgw01: string; Vgw02: string; Vgw03: string; Vgw04: string; Vgw05: string;
  Machrs: string; Labhrs: string; Powerhrs: string; Steamhrs: string; MachrsQty: string; LabhrsQty: string; PowerQty: string; SteamQty: string; Labour3pQty: string;
  Lifnr: string; Name1: string; Zscheme: string; Zbusiness: string; Zskusize: string; Zskugrcodecrs: string;
  MulUnlock: boolean; MulBom: boolean; MulProd: boolean; AllBomIn: boolean; AllPverIn: boolean;
}

export interface BudgetCheckRow { Rowid: number; Matnr: string; Maktx: string; Mtart: string; Werks: string; AllBomIn: boolean; AllPverIn: boolean; MulUnlock: boolean; MulBom: boolean; MulProd: boolean }

export interface BudgetPendingRow extends OriginAmounts {
  Rowid: number; Gjahr: string; Monat: string; Version: string; Status: string;
  Matnr: string; Maktx: string; Mtart: string; Werks: string; Zscheme: string; Zbusiness: string; Zskugrcodecrs: string; Zskugroupcrs: string; Zskusize: string;
  WipCode: string; WipDesc: string; WipStlal: string; WipBaseUnit: string; WipCostp: string;
  RmCost: string; PmCost: string; PerfumeCost: string;
  CostPc: string; PcostPc: string; AcostPc: string; LRate: string; ArmCostPc: string; ApmCostPc: string; AperfCostPc: string; RmLrate: string; PmLrate: string; PerfLrate: string;
  Machine: string; Labour: string; Power: string; Steam: string; Labour3p: string; PlanCost: string; PlanQty: string; QtyMt: string; Ntgew: string; Gewei: string;
  Remarks: string; Remarks1: string; InitiatedBy: string; InitiatedOn: string | null; ApprovedBy: string; ApprovedOn: string | null;
}

export interface BudgetPendingDetRow {
  Rowid: number; SrNo: number; Gjahr: string; Version: string; Matnr: string; Maktx: string; MtartFg: string; Werks: string; Zscheme: string; Zskugrcodecrs: string;
  Idnrk: string; ItemDesc: string; Matkl: string; Mtart: string; Hrkft: string; Erskz: string; Stufe: number; Menge: string; Meins: string; BaseUnit: string; BasicD: string;
  Cost: string; PCost: string; ACost: string; CostPc: string; PcostPc: string; AcostPc: string; LRate: string; Cost1000: string; Pcost1000: string; Acost1000: string; Ptotal: string; Atotal: string;
  Machine: string; Labour: string; Power: string; Steam: string; Labour3p: string;
}

export interface BudgetRowsBySet { SUMMARY: BudgetSummaryRow; SPLIT: BudgetSplitRow; CHECK: BudgetCheckRow; PENDING: BudgetPendingRow; PENDING_DET: BudgetPendingDetRow }

export interface BudgetInitResult { Gjahr: string; Monat: string; Version: string; Status: string; SavedSum: number; SavedDet: number; MsgTxt: string }
export interface BudgetApproveResult { Gjahr: string; Version: string; Status: string; Approved: number; MsgTxt: string }
