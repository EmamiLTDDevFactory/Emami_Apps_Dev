export interface SoAreaRow { Vkorg: string; Vtweg: string; OrgTxt: string; ChnTxt: string; Curr: string; NOrders: number; LastDate: string | null }
export interface SoFilterRow { Kind: string; Code: string; Txt: string; NLines: number; NOrders: number; SharePct: string; LastDate: string | null }
/** Prices are per material base unit (Uom) in the currency of the sales organisation (Curr). Sp = 0 with a Msg = no usable order. */
export interface SoPriceRow {
  Matnr: string; Maktx: string; Vkorg: string; Vtweg: string; Auart: string; AuartTxt: string; Segment: string; SegTxt: string; Kalsm: string; KalsmTxt: string; Curr: string; Uom: string; Werks: string;
  Mrp: string; Sp: string; NetPrice: string; SpCond: string; Vbeln: string; Posnr: string; Kunnr: string; Audat: string | null; DaysOld: number; NOrders: number; NSkip: number; Src: string; Msg: string;
}
export interface SoPricingRow {
  Vbeln: string; Posnr: string; Matnr: string; Vkorg: string; Vtweg: string; Auart: string; Stunr: string; Zaehk: string; Kschl: string; Txt: string; Kbetr: string; Kpein: string; Kmein: string; Kwert: string; Waers: string;
  Kstat: boolean; /** SAP's inactive code: '' = active; the live system sends 'X' and 'Y', the spec says 'A' - any non-blank code is inactive */ Kinak: string; Role: 'MRP' | 'SP' | '' | string;
}
export interface SoProcRow { Kalsm: string; KalsmTxt: string; Stunr: string; Zaehl: string; Kschl: string; Txt: string; Role: string }
export interface SoCondRow {
  Vkorg: string; Vtweg: string; Auart: string; Kalsm: string; OrgTxt: string; ChnTxt: string; KschlSp: string; SpTxt: string; KschlMrp: string; MrpTxt: string; SpBasis: string; SpAbs: string; Fallback: string;
  Segment: string; SegTxt: string; Excl: boolean; Text: string; ChBy: string;
}
export interface CogmRow {
  Matnr: string; Maktx: string; Werks: string; Market: string; Channel: string; Curr: string; SellUom: string; Mrp: string; SellPrice: string; PriceFrom: string; PriceSrc: string;
  CogmStd: string; CogmAct: string; CogmBud: string; CogmCur: string; RatioStd: string; RatioCur: string; RemainStd: string; RemainCur: string; ErosionPct: string; AnnualImpactInr: string; ReqSpRestore: string; Status: string; Msg: string;
}
export interface SoRowsBySet { AREA: SoAreaRow; FILTER: SoFilterRow; PRICE: SoPriceRow; PRICING: SoPricingRow; PROC: SoProcRow; COND: SoCondRow; COGM: CogmRow }

/** "Only these values" and "not these values" of one property. */
export interface ListFilter { in: string[]; ex: string[] }
export const EMPTY_LIST: ListFilter = { in: [], ex: [] };
export type ToggleState = 'neutral' | 'in' | 'ex';
