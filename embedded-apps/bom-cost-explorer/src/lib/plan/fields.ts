/**
 * THE single place the Production Plan SAP names live (ZMM_BOM_COST_SRV, OData V2). Same convention as
 * lib/sap/fields.ts: internal key -> [SAP property name, kind]. Verify against $metadata on the target
 * system (NGQ for DEV, NWP for PRD) and change only the SAP names here.
 *
 *   PlanHeadSet     GET                one row per plan AND plant: key Plan1+Werks, WerksTxt, RowCnt, Total; filter Plan1, Werks
 *   PlanEntrySet    GET / PUT / DELETE key Plan1+Matnr+Werks+Land1; filter Plan1, Matnr, Werks
 *   PlanUploadSet   POST (deep insert) Plan1, UpdMode 'M'|'R', Dryrun, Entries[] -> Status 'E'|'V'|'S', Saved, Errors, MsgTxt
 *   CostLineSet     Mode eq 'P'        plan breakup + cost (no $expand; rate options via lib/rates)
 *   PlanCheckSet    GET                Plan1, ItemCheck -> Kind 'FG'|'ITEM', Matnr, Werks, Comp, Msg
 *   PlanSummarySet  GET                requirement vs stock / PO
 *   PlanWipSet      GET                WIP requirement per FG
 *
 * Months are fiscal: Mth1 / QtyM1 / Qm1 = April ... Mth12 / QtyM12 / Qm12 = March.
 * SAP limit: at most 30 plan rows per request (filter by plant or material).
 */
import { COST_LINE, type FieldKind, type RowOf } from '../sap/fields';

type FieldMap = Record<string, readonly [string, FieldKind]>;
const def = <T extends FieldMap>(m: T) => m;

export const PLAN_SET = {
  HEADS: 'PlanHeadSet',
  ENTRIES: 'PlanEntrySet',
  UPLOAD: 'PlanUploadSet',
  CHECKS: 'PlanCheckSet',
  SUMMARY: 'PlanSummarySet',
  WIP: 'PlanWipSet',
  COST_LINES: 'CostLineSet',
} as const;

/** Navigation property of PlanUploadSet that carries the entries in the deep insert. */
export const NAV_UPLOAD_ENTRIES = 'Entries';
export const PLAN_COST_MODE = 'P';
export const PLAN_MAX_ROWS_PER_REQUEST = 30;
export const PLAN_NAME_MAX = 30;
export const PLAN_UPLOAD_MAX_ROWS = 2000;

export const FISCAL_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'] as const;
const months = <P extends string>(prefix: P, kind: FieldKind) =>
  Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`${prefix}${i + 1}`, [`${prefix}${i + 1}`, kind] as const])) as Record<`${P}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`, readonly [string, FieldKind]>;

/** One row per plan AND plant (key Plan1 + Werks). RowCnt = materials of the plan in that plant. */
export const PLAN_HEAD = def({
  Plan1: ['Plan1', 's'],
  Werks: ['Werks', 's'],
  WerksTxt: ['WerksTxt', 's'],
  RowCnt: ['RowCnt', 'i'],
  Total: ['Total', 'd'],
});

export const PLAN_ENTRY = def({
  Plan1: ['Plan1', 's'],
  Matnr: ['Matnr', 's'],
  Maktx: ['Maktx', 's'],
  Werks: ['Werks', 's'],
  Land1: ['Land1', 's'],
  ...months('Mth', 'd'),
  Total: ['Total', 'd'],
  Status: ['Status', 's'],
  Msg: ['Msg', 's'],
});

/** PlanUploadSet header (request and response). Dryrun is Edm.Boolean; decimals travel as strings. */
export const PLAN_UPLOAD = def({
  Plan1: ['Plan1', 's'],
  UpdMode: ['UpdMode', 's'],
  Dryrun: ['Dryrun', 'b'],
  Status: ['Status', 's'],
  Saved: ['Saved', 'i'],
  Errors: ['Errors', 'i'],
  MsgTxt: ['MsgTxt', 's'],
});

export const PLAN_CHECK = def({
  Kind: ['Kind', 's'],
  Plan1: ['Plan1', 's'],
  Matnr: ['Matnr', 's'],
  Werks: ['Werks', 's'],
  Comp: ['Comp', 's'],
  Msg: ['Msg', 's'],
});

export const PLAN_SUMMARY = def({
  Comp: ['Comp', 's'],
  CompTxt: ['CompTxt', 's'],
  Mtart: ['Mtart', 's'],
  Hrkft: ['Hrkft', 's'],
  Werks: ['Werks', 's'],
  Meins: ['Meins', 's'],
  ...months('Qm', 'd'),
  BudQty: ['BudQty', 'd'],
  Lbkum: ['Lbkum', 'd'],
  Salk3: ['Salk3', 'd'],
  PoQty: ['PoQty', 'd'],
  DelQty: ['DelQty', 'd'],
  RemQty: ['RemQty', 'd'],
});

export const PLAN_WIP = def({
  Matnr: ['Matnr', 's'],
  FgTxt: ['FgTxt', 's'],
  Werks: ['Werks', 's'],
  Land1: ['Land1', 's'],
  Ntgew: ['Ntgew', 'd'],
  Gewei: ['Gewei', 's'],
  Comp: ['Comp', 's'],
  CompTxt: ['CompTxt', 's'],
  ...months('Qm', 'd'),
  Qtot: ['Qtot', 'd'],
});

/** Result fields CostLineSet adds in Mode P, on top of the normal COST_LINE fields. */
export const PLAN_COST_EXTRA = def({
  Plan1: ['Plan1', 's'],
  Stlal: ['Stlal', 's'],
  ItemStlal: ['ItemStlal', 's'],
  BomPlant: ['BomPlant', 's'],
  BomSrc: ['BomSrc', 's'], // 'OWN' | 'LASTPROD'
  BomSrcDate: ['BomSrcDate', 't'],
  PlanQty: ['PlanQty', 'd'],
  ...months('QtyM', 'd'),
  QtyTot: ['QtyTot', 'd'],
  ActRatePc: ['ActRatePc', 'd'],
  ActRatePcInr: ['ActRatePcInr', 'd'],
});
export const PLAN_COST_LINE = def({ ...COST_LINE, ...PLAN_COST_EXTRA });

/** Mode P selection properties (filter-only) beyond the normal cost options. */
export const PLAN_SELECTION = def({
  Mode: ['Mode', 's'],
  Plan1: ['Plan1', 's'],
  Werks: ['Werks', 's'],
  Matnr: ['Matnr', 's'],
  MtartFilter: ['MtartFilter', 's'], // 'A' all | 'P' packing | 'R' RM + WIP
  AllBoms: ['AllBoms', 'b'],
  BasePlant: ['BasePlant', 's'],
  Scrap: ['Scrap', 'b'],
  Fallback: ['Fallback', 'b'],
  InclFrt: ['InclFrt', 'b'],
  StdFrt: ['StdFrt', 'b'],
  InclBudget: ['InclBudget', 'b'],
  BudgetYr: ['BudgetYr', 's'],
  InclCover: ['InclCover', 'b'],
  Prio: ['Prio', 's'],
  DonorPlant: ['DonorPlant', 's'],
  Lookback: ['Lookback', 'i'],
  FreightDays: ['FreightDays', 'i'],
  BudatFrom: ['BudatFrom', 't'],
  BudatTo: ['BudatTo', 't'],
  ItemCheck: ['ItemCheck', 'b'],
  Year: ['Year', 's'],
});

export type PlanHead = RowOf<typeof PLAN_HEAD>;
export type PlanEntry = RowOf<typeof PLAN_ENTRY>;
export type PlanUploadResult = RowOf<typeof PLAN_UPLOAD> & { entries: PlanEntry[] };
export type PlanCheck = RowOf<typeof PLAN_CHECK>;
export type PlanSummary = RowOf<typeof PLAN_SUMMARY>;
export type PlanWip = RowOf<typeof PLAN_WIP>;
export type PlanCostLine = RowOf<typeof PLAN_COST_LINE>;

export const monthKeys = <P extends 'Mth' | 'Qm' | 'QtyM'>(prefix: P) => Array.from({ length: 12 }, (_, i) => `${prefix}${i + 1}` as `${P}${number}`);
