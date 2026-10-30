/** Rows of the four WAC sets. Decimals are STRINGS (decimal.js at the point of use); '' = SAP sent nothing (shown as n/a). */
export type WacFlag = 'H' | 'M' | '';
export type WacGroup = 'RM' | 'PM' | 'PERF' | 'MAT';
export type WacSource = 'SEL' | 'CMAP' | 'CON' | 'AVG';

export interface WacRow {
  Rowid: number; Matnr: string; Maktx: string; Werks: string; Mtart: string; Zbrand: string; Prodha: string;
  Zskugrcodecrs: string; Zskugroupcrs: string; Uom: string; Docs: number; Batches: number; DupDocs: number; Qty: string;
  ActRm: string; ActPm: string; ActPerf: string; ActMat: string; ActConv: string; ActLanded: string; ActRecon: string;
  VarpSel: string; VarpCmap: string; VarpCon: string; VarpAvg: string;
  FlagSel: WacFlag; FlagCmap: WacFlag; FlagCon: WacFlag; FlagAvg: WacFlag;
  Status: string; Msg: string;
}

export interface WacCompareRow {
  Rowid: number; Matnr: string; Maktx: string; Werks: string; Grp: WacGroup; Src: WacSource;
  ActPu: string; SrcPu: string; VarAbs: string; VarPct: string; Flag: WacFlag; Dir: '+' | '-' | '';
  NComp: number; NRated: number; CoverPct: string;
}

export interface WacCompRow {
  Rowid: number; Matnr: string; Werks: string; Idnrk: string; CompTxt: string; Mtart: string; Grp: 'RM' | 'PM' | 'PERF'; SrcSel: string; Uom: string; QtyPu: string;
  RateSel: string; RateCmap: string; RateCon: string; RateAvg: string;
  CostSel: string; CostCmap: string; CostCon: string; CostAvg: string;
  VarpCmap: string; VarpCon: string; VarpAvg: string; Flag: WacFlag;
}

export interface WacDocRow {
  Rowid: number; Mblnr: string; Mjahr: string; Werks: string; Matnr: string; Charg: string; Budat: string | null; Aufnr: string;
  Via: string; Qty: string; Uom: string; Hwaer: string; FxInr: string; Rm: string; Pm: string; Perf: string; Conv: string; Landed: string; Rows: number;
}

export interface WacRowsBySet { ROWS: WacRow; COMPARE: WacCompareRow; COMP: WacCompRow; DOCS: WacDocRow }
