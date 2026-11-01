/** Rows of the CK13N sets. Decimals are strings (decimal.js at the point of use); '' = SAP sent nothing (n/a). Dates are YYYY-MM-DD or null. */
export interface CkListRow {
  Matnr: string; Maktx: string; Werks: string; Kalnr: string; Kadky: string | null; Tvers: string; Bwvar: string; Kkzma: string; Klvar: string; Status: string; StatusTxt: string; CurStd: boolean;
  Kadat: string | null; Bidat: string | null; Losgr: string; Meeht: string; Total: string; StdPrice: string; Curr: string; Ernam: string; Erdat: string | null;
}
export interface CkHeaderRow {
  Matnr: string; Maktx: string; Werks: string; WerksTxt: string; Mtart: string; Kalnr: string; Kadky: string | null; Tvers: string; Bwvar: string; Kkzma: string; Klvar: string; Status: string; StatusTxt: string; CurStd: boolean;
  Kadat: string | null; Bidat: string | null; Bwdat: string | null; Aldat: string | null; Losgr: string; Meeht: string; Peinh: string; Curr: string; TotalLot: string; TotalUnit: string; ValueBasis: string;
  StdPrice: string; PriceCtrl: string; StdDiff: string; StdDiffPct: string; NComp: number; NItem: number; Ernam: string; Erdat: string | null; Msg: string;
  /** moving average price and fixed / variable units of the material master ('' = SAP sent nothing) */
  MapPrice: string; FixedUnit: string; VarUnit: string;
}
export type CkGroup = 'RM' | 'PM' | 'CONV' | 'OVH' | 'OTH' | 'SUM';
export interface CkCompRow { CompNo: string; CompTxt: string; Grp: CkGroup | string; Seq: number; Total: string; SharePct: string; Curr: string; IsSum: boolean; /** memo component: shown, but not part of the cost share */ IsMemo: boolean }
export interface CkItemRow {
  Posnr: string; Typps: string; TyppsTxt: string; Kstar: string; KstarTxt: string; Idnrk: string; ItemTxt: string; Mtart: string; ItemWerks: string; Kostl: string; Lstar: string;
  Qty: string; Uom: string; QtyUnit: string; Price: string; PriceUnit: string; ValueLot: string; ValueUnit: string; Curr: string; HasEst: boolean;
  /** origin group (HRKFT); '' when SAP sent none */
  Hrkft?: string;
}
export interface CkRowsBySet { LIST: CkListRow; HEADER: CkHeaderRow; COMP: CkCompRow; ITEM: CkItemRow }
