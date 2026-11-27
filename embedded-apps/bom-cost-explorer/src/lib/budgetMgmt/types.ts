export type ApprStatus = 'D' | 'S' | 'A' | 'R' | 'V';
export type AdjType = 'N' | 'P' | 'A';
export type RateAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'REVISE';

export const COUNTRIES = ['IN', 'LK', 'AE', 'BD'] as const;
export const STATUS_LABEL: Record<ApprStatus, string> = { D: 'Draft', S: 'Submitted', A: 'Approved', R: 'Rejected', V: 'Revised' };
export const SOURCE_LIST = ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'] as const;

export interface BudHistRow {
  Rowid: string; Matnr: string; Maktx: string; Land1: string; Werks: string; Bukrs: string; Mtart: string; Matkl: string; BaseUom: string;
  NetQty: number; NetValue: number; Currency: string; AvgRate: number; CtryValue: number; Matcat: string;
}

export interface BudRateRow {
  Gjahr: string; Land1: string; Matnr: string; Werks: string; Bukrs: string; ValidFrom: string; Matcat: string; RateSrc: string;
  SrcRate: number; DerivedRate: number; DerivedCurr: string; AdjType: string; AdjValue: number; OverrideRate: number; OverrideRsn: string;
  FrtTotal: number; FrtLines: FreightLine[]; LandedRate: number; LandedCurr: string; BaseUom: string; ApprStatus: string;
  SubmittedBy: string; SubmittedOn: string; ApprovedBy: string; ApprovedOn: string; RejectedBy: string; RejectionRsn: string;
}

export interface BudRateSrcRow {
  RateSrc: string; CondType: string; Vendor: string; Vendname: string; Rate: number; Currency: string; PriceUnit: number;
  ValidFrom: string; ValidTo: string; RatePc: number; LocalCurr: string; RateLocal: number; FrtTotal: number; LandedRate: number;
}

/** mtart: material types to read (BudHistSet Mtart); none = every type, nothing sent. */
export const MATERIAL_TYPES = ['ROH', 'PKGN', 'VERP', 'WIP', 'FRT2'] as const;
export interface HistoryFilter { land1: string; gjahr: string; histFrom: string; histTo: string; catAFrom: string; catBFrom: string; mtart?: string[] }
export interface RateFilter { gjahr: string; land1: string; status: string; matnr?: string[]; werks?: string[] }
export interface RateEdit { adjType: AdjType; adjValue: string; overrideRate: string; overrideRsn: string }
export interface ActionPayload { action: RateAction; gjahr: string; land1: string; matnrCsv: string; werksCsv: string; reason: string; email: string }
export interface ActionResult { RowsActed: number; Message: string }

/** History rows of one material in one country, summed over its plants (SAP returns one row per plant). */
export interface BudHistGroup {
  key: string; Matnr: string; Maktx: string; Land1: string; Mtart: string; Matkl: string; Segment: Segment; BaseUom: string; Currency: string;
  NetQty: number; NetValue: number; AvgRate: number; CtryValue: number; Matcat: string; plants: BudHistRow[];
}

/** BudRateSrcDtlSet (filters Matnr + Land1 + Bukrs, all required): one row per source of a material. BASE = weighted average base price (material + country level),
 *  INFO / CONT = the last Info record / Contract price (material + company code level). */
export interface BudRateSrcDtlRow {
  RateSrc: string; CondType: string; Vendor: string; Vendname: string; Rate: number; Currency: string; PriceUnit: number; CondUnit: string; ValidFrom: string; ValidTo: string; RatePc: number;
  /** Freight line items (FrtCond1-4 / FrtRate1-4), the total and the landed rate (price + freight) of this source. */
  FrtLines: FreightLine[]; FrtTotal: number; FrtCurr: string; LandedRate: number; LandedCurr: string;
}
export interface FreightLine { cond: string; rate: number }
/** How the Last Price is chosen: Info record first then Contract, Contract first then Info record, or one source only. */
export type LastPriceMode = 'IR_C' | 'C_IR' | 'IR' | 'C';
export const LAST_PRICE_MODES: { v: LastPriceMode; label: string }[] = [
  { v: 'IR_C', label: 'Info record › Contract' }, { v: 'C_IR', label: 'Contract › Info record' }, { v: 'IR', label: 'Info record only' }, { v: 'C', label: 'Contract only' },
];

/** BasePrcDetSet (filters Matnr + Bukrs required, Land1): the calculation behind the Avg Base Price. Rowtype D = one purchase-order line, S = the summary
 *  (total quantity, total value, weighted average = value / quantity). */
export interface BasePrcRow {
  Rowid: number; Matnr: string; Ebeln: string; Ebelp: string; Podate: string; Vendor: string; Plant: string; Matdesc: string; Baseunit: string; Qtybase: number;
  Doccurr: string; Valuedoc: number; Localcurr: string; Valuelocal: number; Valuegroup: number; Wtdavglocal: number; Wtdavggroup: number; Rowtype: string;
  /** vendor name (LFA1-NAME1); '' / absent where SAP does not send it yet */
  Vendname?: string;
}

/** FrtDtlSet (filters Matnr + Land1 + HistFrom + HistTo, Bukrs not needed): one row per freight condition type of a material in a country over the history window
 *  (Condtype, TotalAmt over TotalQty = AvgRate per unit, plants and POs behind it), plus a summary row Condtype 'TOTA' whose AvgRate is the freight total per unit. */
export interface FrtDtlRow { cond: string; totalAmt: number; totalQty: number; avgRate: number; curr: string; plants: number; pos: number; isTotal: boolean }

/** Raw Material (Budget Rate Preparation) is split in two: Perfume = material type ROH with material group 106, everything else is Raw Material. */
export type Segment = 'Raw Material' | 'Perfume';
export const SEGMENTS: Segment[] = ['Raw Material', 'Perfume'];
