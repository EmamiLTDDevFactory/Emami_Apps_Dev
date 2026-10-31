/**
 * Sales-order price sets (SoAreaVH / SoFilterVH / SoPrice / SoPricing / SoProc / SoCond) and the live cost simulator set
 * (CogmRowSet) of ZMM_BOM_COST_SRV. Like the CK sets they are NOT published on any SAP system yet (404 on NWP, NGD, NGQ as of
 * 2026-10-31): the names follow the agreed contract and are unchecked until `npm run check:ck-so-metadata` can run.
 */
import type { FieldMap } from '../price-context/odata';

export const SO_SET = { AREA: 'SoAreaVHSet', FILTER: 'SoFilterVHSet', PRICE: 'SoPriceSet', PRICING: 'SoPricingSet', PROC: 'SoProcSet', COND: 'SoCondSet', COGM: 'CogmRowSet' } as const;
export type SoSetKey = keyof typeof SO_SET;

/** Filter properties (the same list on SoPriceSet, SoPricingSet, SoAreaVHSet, SoFilterVHSet; "In" = only these, "Ex" = not these). */
export const SO_FILTER = {
  MatnrIn: 'MatnrIn', WerksIn: 'WerksIn', VkorgIn: 'VkorgIn', VtwegIn: 'VtwegIn', SegmentIn: 'SegmentIn',
  AuartIn: 'AuartIn', AuartEx: 'AuartEx', PstyvIn: 'PstyvIn', PstyvEx: 'PstyvEx', KdgrpIn: 'KdgrpIn', KdgrpEx: 'KdgrpEx', KunnrIn: 'KunnrIn', KunnrEx: 'KunnrEx',
  DaysBack: 'DaysBack', DateTo: 'DateTo', KindIn: 'KindIn', KalsmIn: 'KalsmIn',
} as const;
/** CogmRowSet extra filters. */
export const COGM_FILTER = { Matnr: 'Matnr', Werks: 'Werks', PriceSrcIn: 'PriceSrcIn', SoDaysIn: 'SoDaysIn', Source: 'Source', PriceDate: 'PriceDate' } as const;

const def = <T extends FieldMap>(m: T) => m;

export const SO_AREA = def({ Vkorg: ['Vkorg', 's'], Vtweg: ['Vtweg', 's'], OrgTxt: ['OrgTxt', 's'], ChnTxt: ['ChnTxt', 's'], Curr: ['Curr', 's'], NOrders: ['NOrders', 'i'], LastDate: ['LastDate', 't'] });
export const SO_FILTER_VH = def({ Kind: ['Kind', 's'], Code: ['Code', 's'], Txt: ['Txt', 's'], NLines: ['NLines', 'i'], NOrders: ['NOrders', 'i'], SharePct: ['SharePct', 's'], LastDate: ['LastDate', 't'] });
export const SO_PRICE = def({
  Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Vkorg: ['Vkorg', 's'], Vtweg: ['Vtweg', 's'], Auart: ['Auart', 's'], AuartTxt: ['AuartTxt', 's'], Segment: ['Segment', 's'], SegTxt: ['SegTxt', 's'],
  Kalsm: ['Kalsm', 's'], KalsmTxt: ['KalsmTxt', 's'], Curr: ['Curr', 's'], Uom: ['Uom', 's'], Werks: ['Werks', 's'], Mrp: ['Mrp', 's'], Sp: ['Sp', 's'], NetPrice: ['NetPrice', 's'], SpCond: ['SpCond', 's'],
  Vbeln: ['Vbeln', 's'], Posnr: ['Posnr', 's'], Kunnr: ['Kunnr', 's'], Audat: ['Audat', 't'], DaysOld: ['DaysOld', 'i'], NOrders: ['NOrders', 'i'], NSkip: ['NSkip', 'i'], Src: ['Src', 's'], Msg: ['Msg', 's'],
});
export const SO_PRICING = def({
  Vbeln: ['Vbeln', 's'], Posnr: ['Posnr', 's'], Matnr: ['Matnr', 's'], Vkorg: ['Vkorg', 's'], Vtweg: ['Vtweg', 's'], Auart: ['Auart', 's'], Stunr: ['Stunr', 's'], Zaehk: ['Zaehk', 's'], Kschl: ['Kschl', 's'], Txt: ['Txt', 's'],
  Kbetr: ['Kbetr', 's'], Kpein: ['Kpein', 's'], Kmein: ['Kmein', 's'], Kwert: ['Kwert', 's'], Waers: ['Waers', 's'], Kstat: ['Kstat', 'f'], Kinak: ['Kinak', 'f'], Role: ['Role', 's'],
});
export const SO_PROC = def({ Kalsm: ['Kalsm', 's'], KalsmTxt: ['KalsmTxt', 's'], Stunr: ['Stunr', 's'], Zaehl: ['Zaehl', 's'], Kschl: ['Kschl', 's'], Txt: ['Txt', 's'], Role: ['Role', 's'] });
export const SO_COND = def({
  Vkorg: ['Vkorg', 's'], Vtweg: ['Vtweg', 's'], Auart: ['Auart', 's'], Kalsm: ['Kalsm', 's'], OrgTxt: ['OrgTxt', 's'], ChnTxt: ['ChnTxt', 's'], KschlSp: ['KschlSp', 's'], SpTxt: ['SpTxt', 's'], KschlMrp: ['KschlMrp', 's'], MrpTxt: ['MrpTxt', 's'],
  SpBasis: ['SpBasis', 's'], SpAbs: ['SpAbs', 's'], Fallback: ['Fallback', 's'], Segment: ['Segment', 's'], SegTxt: ['SegTxt', 's'], Excl: ['Excl', 'f'], Text: ['Text', 's'], ChBy: ['ChBy', 's'],
});
export const COGM_ROW = def({
  Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Werks: ['Werks', 's'], Market: ['Market', 's'], Channel: ['Channel', 's'], Curr: ['Curr', 's'], SellUom: ['SellUom', 's'], Mrp: ['Mrp', 's'], SellPrice: ['SellPrice', 's'], PriceFrom: ['PriceFrom', 's'], PriceSrc: ['PriceSrc', 's'],
  CogmStd: ['CogmStd', 's'], CogmAct: ['CogmAct', 's'], CogmBud: ['CogmBud', 's'], CogmCur: ['CogmCur', 's'], RatioStd: ['RatioStd', 's'], RatioCur: ['RatioCur', 's'], RemainStd: ['RemainStd', 's'], RemainCur: ['RemainCur', 's'],
  ErosionPct: ['ErosionPct', 's'], AnnualImpactInr: ['AnnualImpactInr', 's'], ReqSpRestore: ['ReqSpRestore', 's'], Status: ['Status', 's'], Msg: ['Msg', 's'],
});
export const SO_FIELDS = { AREA: SO_AREA, FILTER: SO_FILTER_VH, PRICE: SO_PRICE, PRICING: SO_PRICING, PROC: SO_PROC, COND: SO_COND, COGM: COGM_ROW } as const;
export const SO_NULLABLE: Record<SoSetKey, ReadonlySet<string>> = {
  AREA: new Set(), FILTER: new Set(['SharePct']),
  PRICE: new Set(['Mrp', 'Sp', 'NetPrice']),
  PRICING: new Set(['Kbetr', 'Kpein', 'Kwert']), PROC: new Set(), COND: new Set(['SpAbs']),
  COGM: new Set(['Mrp', 'SellPrice', 'CogmStd', 'CogmAct', 'CogmBud', 'CogmCur', 'RatioStd', 'RatioCur', 'RemainStd', 'RemainCur', 'ErosionPct', 'AnnualImpactInr', 'ReqSpRestore']),
};
