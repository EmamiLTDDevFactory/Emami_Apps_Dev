export type ApprStatus = 'D' | 'S' | 'A' | 'R' | 'V';
export type AdjType = 'N' | 'P' | 'A';
export type RateAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'REVISE';

export const COUNTRIES = ['IN', 'LK', 'AE', 'BD'] as const;
export const STATUS_LABEL: Record<ApprStatus, string> = { D: 'Draft', S: 'Submitted', A: 'Approved', R: 'Rejected', V: 'Revised' };
export const SOURCE_LIST = ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'] as const;

export interface BudHistRow {
  Rowid: string; Matnr: string; Maktx: string; Land1: string; Werks: string; Bukrs: string; Mtart: string; BaseUom: string;
  NetQty: number; NetValue: number; Currency: string; AvgRate: number; CtryValue: number; Matcat: string;
}

export interface BudRateRow {
  Gjahr: string; Land1: string; Matnr: string; Werks: string; Bukrs: string; ValidFrom: string; Matcat: string; RateSrc: string;
  SrcRate: number; DerivedRate: number; DerivedCurr: string; AdjType: string; AdjValue: number; OverrideRate: number; OverrideRsn: string;
  FrtTotal: number; LandedRate: number; LandedCurr: string; BaseUom: string; ApprStatus: string;
  SubmittedBy: string; SubmittedOn: string; ApprovedBy: string; ApprovedOn: string; RejectedBy: string; RejectionRsn: string;
}

export interface BudRateSrcRow {
  RateSrc: string; CondType: string; Vendor: string; Vendname: string; Rate: number; Currency: string; PriceUnit: number;
  ValidFrom: string; ValidTo: string; RatePc: number; LocalCurr: string; RateLocal: number; FrtTotal: number; LandedRate: number;
}

/** mtart: material types to read (BudHistSet Mtart); none = every type, nothing sent. */
export const MATERIAL_TYPES = ['ROH', 'PKGN', 'VERP', 'HALB', 'FERT'] as const;
export interface HistoryFilter { land1: string; gjahr: string; histFrom: string; histTo: string; catAFrom: string; catBFrom: string; mtart?: string[] }
export interface RateFilter { gjahr: string; land1: string; status: string; matnr?: string[]; werks?: string[] }
export interface RateEdit { adjType: AdjType; adjValue: string; overrideRate: string; overrideRsn: string }
export interface ActionPayload { action: RateAction; gjahr: string; land1: string; matnrCsv: string; werksCsv: string; reason: string; email: string }
export interface ActionResult { RowsActed: number; Message: string }

/** History rows of one material in one country, summed over its plants (SAP returns one row per plant). */
export interface BudHistGroup {
  key: string; Matnr: string; Maktx: string; Land1: string; Mtart: string; BaseUom: string; Currency: string;
  NetQty: number; NetValue: number; AvgRate: number; CtryValue: number; Matcat: string; plants: BudHistRow[];
}
