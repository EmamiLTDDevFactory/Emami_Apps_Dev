/**
 * Margin (cost simulator) sets of ZMM_BOM_COST_SRV. The names follow the agreed contract (SEGW key property "Rowid"); CogmRowSet answers 404 on NWP
 * and the other sets have not been seen live, so every name is UNCHECKED until `npm run check:margin-metadata` runs against $metadata. A property
 * missing from the answer reads as '' (n/a), never as 0. Amounts are per SELLING unit in the price currency (Curr).
 */
import type { FieldMap } from '../price-context/odata';

export const MARGIN_SET = {
  ROW: 'CogmRowSet', DRIVER: 'CogmDriverSet', SIM: 'CogmSimSet', ALERT: 'CogmAlertSet', HISTORY: 'CogmHistorySet', BOARD: 'CogmBoardSet',
  PRICE: 'CogmPriceSet', RULE: 'CogmRuleSet', VOLUME: 'CogmVolumeSet', BUDGET: 'CogmBudgetSet', TARGET: 'CogmTargetSet', UPLOAD: 'CogmUploadSet',
} as const;
export type MarginSetKey = keyof typeof MARGIN_SET;
export const NAV_UPLOAD_ROWS = 'UploadRows';

/** Filter properties (the same names on every set that supports them). */
export const MARGIN_FILTER = {
  Matnr: 'Matnr', Werks: 'Werks', Market: 'Market', Channel: 'Channel', Prodha: 'Prodha', Brand: 'Brand',
  Source: 'Source', PriceDate: 'PriceDate', ExplQty: 'ExplQty', InclFrt: 'InclFrt', Scenario: 'Scenario',
  NewMrp: 'NewMrp', NewSp: 'NewSp', CogmDpct: 'CogmDpct', CogmDabs: 'CogmDabs', TgtRatioIn: 'TgtRatioIn', TgtRemainIn: 'TgtRemainIn',
  GroupBy: 'GroupBy', DaysBack: 'DaysBack', RuleIn: 'RuleIn', PriceSrcIn: 'PriceSrcIn', VkorgIn: 'VkorgIn', VtwegIn: 'VtwegIn', SegmentIn: 'SegmentIn', SoDaysIn: 'SoDaysIn',
  AuartIn: 'AuartIn', AuartEx: 'AuartEx', PstyvIn: 'PstyvIn', PstyvEx: 'PstyvEx', KdgrpIn: 'KdgrpIn', KdgrpEx: 'KdgrpEx', KunnrIn: 'KunnrIn', KunnrEx: 'KunnrEx',
} as const;

const def = <T extends FieldMap>(m: T) => m;
const s = (n: string) => [n, 's'] as const;
const f = (n: string) => [n, 'f'] as const;
const i = (n: string) => [n, 'i'] as const;
const t = (n: string) => [n, 't'] as const;
const many = (names: string, kind: 's' | 'f' | 'i' | 't' = 's') => Object.fromEntries(names.split(/\s+/).filter(Boolean).map((n) => [n, [n, kind] as const]));

export const MARGIN_ROW = def({
  ...many('Matnr Maktx Werks Market Channel Prodha Brand Curr Uom SellUom PriceFrom PriceSrc Status Msg Src AlertSev AlertTxt'),
  ...many('Mrp SellPrice CogmStd CogmAct CogmBud CogmCur'),
  ...many('OkStd OkAct OkBud OkCur', 'f'),
  ...many('StdRm StdPm StdPerf StdConv StdOth CurRm CurPm CurPerf CurConv CurOth'),
  ...many('RatioStd RatioAct RatioBud RatioCur RemainStd RemainAct RemainBud RemainCur'),
  ...many('VarCurStd VarpCurStd VarCurAct VarpCurAct VarCurBud VarpCurBud Erosion ErosionPct AnnualImpact AnnualImpactInr ReqSpRestore ReqMrpRestore SpRisePct ReqSpRatio ReqSpRemain VolumeYr'),
  AlertCnt: i('AlertCnt'),
});
export const MARGIN_DRIVER = def({
  ...many('Idnrk CompTxt Grp SrcSel PStd PCur PricePct DeltaUnit AnnualInr Curr'),
  ...many('NoStd NoRate', 'f'),
});
export const MARGIN_SIM = def({
  ...many('Matnr Maktx Werks Market Channel Curr Uom Msg'),
  ...many('MrpBefore MrpAfter SpBefore SpAfter CogmBefore CogmAfter RemainBefore RemainAfter RatioBefore RatioAfter DeltaRemain AnnualDeltaInr ReqSpRatio ReqSpRemain ReqMrpRestore'),
});
export const MARGIN_ALERT = def({
  ...many('Rule Severity Scope Matnr Maktx Werks Market Channel Comp Text Value Threshold ImpactInr Curr'),
  FgCnt: i('FgCnt'),
});
export const MARGIN_HISTORY = def({
  SnapDate: t('SnapDate'),
  ...many('Matnr Werks Market Channel Curr CogmStd CogmCur CogmAct RatioCur ErosionStd ErosionBase'),
});
export const MARGIN_BOARD = def({
  ...many('GroupKind GrpKey GrpTxt WratioStd WratioCur RevenueInr AnnualImpactInr'),
  ...many('FgCnt AlertHigh AlertMed NoDataCnt', 'i'),
});
export const MARGIN_UPLOAD_HEAD = def({ ...many('UploadId Kind UpdMode Dryrun Status MsgTxt'), Saved: i('Saved'), Errors: i('Errors') });
export const MARGIN_UPLOAD_ROW = def({ Rowno: i('Rowno'), ...many('Status Msg') });

export const MARGIN_FIELDS = { ROW: MARGIN_ROW, DRIVER: MARGIN_DRIVER, SIM: MARGIN_SIM, ALERT: MARGIN_ALERT, HISTORY: MARGIN_HISTORY, BOARD: MARGIN_BOARD } as const;
export type MarginReadKey = keyof typeof MARGIN_FIELDS;

/** Properties kept as the string SAP sent (kind 's') that are amounts / ratios / counts of money: '' = SAP sent nothing, shown as n/a, never as 0. */
const AMOUNTS = (m: FieldMap, extra = '') => new Set(Object.keys(m).filter((k) => /^(Mrp|SellPrice|Cogm|Std|Cur(Rm|Pm|Perf|Conv|Oth)|Ratio|Remain|Var|Erosion|AnnualImpact|Annual|Req|SpRise|Volume|PStd|PCur|PricePct|DeltaUnit|InrAnnual|Before|After|Value|Threshold|Impact|Wratio|Revenue|MrpB|MrpA|SpB|SpA)/.test(k) || new RegExp(`^(${extra})$`).test(k)));
export const MARGIN_NULLABLE: Record<MarginReadKey, ReadonlySet<string>> = {
  ROW: AMOUNTS(MARGIN_ROW), DRIVER: AMOUNTS(MARGIN_DRIVER, 'AnnualInr'), SIM: AMOUNTS(MARGIN_SIM, 'DeltaRemain|AnnualDeltaInr'), ALERT: AMOUNTS(MARGIN_ALERT),
  HISTORY: AMOUNTS(MARGIN_HISTORY), BOARD: AMOUNTS(MARGIN_BOARD),
};
