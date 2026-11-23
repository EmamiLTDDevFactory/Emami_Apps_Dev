export interface MisRow {
  Zbrand: string; Gjahr: string; Version: string; FgCnt: number; FgNobud: number;
  FtmQty: string; FtmBudget: string; FtmActual: string; FtmActualCmp: string;
  YtmQty: string; YtmBudget: string; YtmActual: string; YtmActualCmp: string;
  Msg: string;
}

export interface SalesRow {
  Grain: 'B' | 'S' | string; Zbrand: string; Matnr: string; Maktx: string; Matkl: string; Vtweg: string; VtwegTxt: string;
  SoldQty: string; Gsv: string; Deductions: string; Nsv: string; CogmQty: string; NsvCmp: string; Cogm: string; CogmPc: string;
  SkuCnt: number; SkuNocogm: number; Msg: string;
}

export interface PvmRow { Effect: string; SortNo: number; Value: string; Msg: string }
export interface ThreshRow { Metric: string; Category: string; RedPct: string; AmberPct: string; HighBad: string }

/** DashMarginSet row (grain S = SKU, C = customer, B = brand). Decimals are strings. */
export interface MarginRow {
  Grain: string;
  Zbrand: string;
  Matnr: string;
  Kunag: string;
  Maktx: string;
  Matkl: string;
  KunagTxt: string;
  Zscheme: string;
  Crssku: string;
  Zbusiness: string;
  BudVer: string;
  BudFlag: string;
  Msg: string;
  Qty: string;
  Mrp: string;
  Sp: string;
  ChRet: string;
  ChDis: string;
  ChSs: string;
  Gst: string;
  Rm: string;
  Pm: string;
  Pf: string;
  Oh: string;
  CRm: string;
  CPm: string;
  CPf: string;
  COh: string;
  TRm: string;
  TPm: string;
  TPf: string;
  TOh: string;
  BudRm: string;
  BudPm: string;
  BudPf: string;
  BudOh: string;
}

/** DashCdrillSet row (grain S = summary, B = sold batch, C = component). Decimals are strings. */
export interface CdrillRow {
  Grain: string; Matnr: string; Charg: string; Idnrk: string; Maktx: string; Mtart: string; Matkl: string; Cat: string; Meins: string; Flag: string; Msg: string; Orders: number;
  SoldQty: string; ProdQty: string; Qty: string; Val: string; AvgQtyPc: string; AvgCostPc: string; RmPc: string; PmPc: string; PfPc: string; OthPc: string;
}
