/** Rows of the Margin sets. Amounts are STRINGS ('' = SAP sent nothing: n/a); flags are booleans (Edm.String 'X'). */
export type Scenario = 'STD' | 'ACT' | 'BUD' | 'CUR';
export const SCENARIOS: Scenario[] = ['STD', 'ACT', 'BUD', 'CUR'];
export const SCENARIO_LABEL: Record<Scenario, string> = { STD: 'Standard', ACT: 'Actual', BUD: 'Budget', CUR: 'Current' };
export type Severity = 'H' | 'M' | 'L' | '';
export type RowStatus = 'P' | 'S' | 'C' | '';

export interface MarginRow {
  Matnr: string; Maktx: string; Werks: string; Market: string; Channel: string; Prodha: string; Brand: string; Curr: string; Uom: string; SellUom: string;
  Mrp: string; SellPrice: string; PriceFrom: string; PriceSrc: string;
  CogmStd: string; CogmAct: string; CogmBud: string; CogmCur: string; OkStd: boolean; OkAct: boolean; OkBud: boolean; OkCur: boolean;
  StdRm: string; StdPm: string; StdPerf: string; StdConv: string; StdOth: string; CurRm: string; CurPm: string; CurPerf: string; CurConv: string; CurOth: string;
  RatioStd: string; RatioAct: string; RatioBud: string; RatioCur: string; RemainStd: string; RemainAct: string; RemainBud: string; RemainCur: string;
  VarCurStd: string; VarpCurStd: string; VarCurAct: string; VarpCurAct: string; VarCurBud: string; VarpCurBud: string;
  Erosion: string; ErosionPct: string; AnnualImpact: string; AnnualImpactInr: string; ReqSpRestore: string; ReqMrpRestore: string; SpRisePct: string; ReqSpRatio: string; ReqSpRemain: string; VolumeYr: string;
  AlertCnt: number; AlertSev: Severity; AlertTxt: string; Status: RowStatus; Msg: string; Src: string;
}
export interface MarginDriver { Idnrk: string; CompTxt: string; Grp: string; SrcSel: string; PStd: string; PCur: string; PricePct: string; DeltaUnit: string; AnnualInr: string; Curr: string; NoStd: boolean; NoRate: boolean }
export interface MarginSim {
  Matnr: string; Maktx: string; Werks: string; Market: string; Channel: string; Curr: string; Uom: string; Msg: string;
  MrpBefore: string; MrpAfter: string; SpBefore: string; SpAfter: string; CogmBefore: string; CogmAfter: string; RemainBefore: string; RemainAfter: string; RatioBefore: string; RatioAfter: string;
  DeltaRemain: string; AnnualDeltaInr: string; ReqSpRatio: string; ReqSpRemain: string; ReqMrpRestore: string;
}
export interface MarginAlert { Rule: string; Severity: Severity; Scope: 'F' | 'C' | ''; Matnr: string; Maktx: string; Werks: string; Market: string; Channel: string; Comp: string; Text: string; Value: string; Threshold: string; ImpactInr: string; Curr: string; FgCnt: number }
export interface MarginHistory { SnapDate: string | null; Matnr: string; Werks: string; Market: string; Channel: string; Curr: string; CogmStd: string; CogmCur: string; CogmAct: string; RatioCur: string; ErosionStd: string; ErosionBase: string }
export interface MarginBoard { GroupKind: string; GrpKey: string; GrpTxt: string; FgCnt: number; AlertHigh: number; AlertMed: number; NoDataCnt: number; WratioStd: string; WratioCur: string; RevenueInr: string; AnnualImpactInr: string }
export interface MarginRowsBySet { ROW: MarginRow; DRIVER: MarginDriver; SIM: MarginSim; ALERT: MarginAlert; HISTORY: MarginHistory; BOARD: MarginBoard }
