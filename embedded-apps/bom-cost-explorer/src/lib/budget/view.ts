/** Pure view logic of Budget costing: columns, KPIs, variance, search / sort, checklist flags, pending-version grouping. decimal.js for every amount. */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { ORIGINS } from './fields';
import type { BudgetCheckRow, BudgetPendingRow, BudgetSplitRow, BudgetSummaryRow } from './types';

export interface Col<_R = unknown> { key: string; label: string; kind: 's' | 'd' | 'f' | 't'; dp?: number; group: ColGroup; width?: number; sticky?: boolean }
export type ColGroup = 'core' | 'wip' | 'budget' | 'origin' | 'originAct' | 'originLast' | 'conversion' | 'plan' | 'consumer' | 'activity' | 'check' | 'calc' | 'rate';
export const GROUP_LABEL: Record<ColGroup, string> = {
  core: 'Material', wip: 'WIP', budget: 'Budget / actual / info-record rate', origin: 'Budget by origin', originAct: 'Actual by origin', originLast: 'Info-record rate by origin (info only)',
  conversion: 'Conversion', plan: 'Plan', consumer: 'Consumer / trade', activity: 'Activity', check: 'Checklist flags',
  calc: 'Variance and checklist (calculated here)', rate: 'Selected / C-Map rate (load on demand)',
};
/** columns shown at first; the others are one click away in the column menu */
export const DEFAULT_GROUPS: ColGroup[] = ['core', 'wip', 'budget', 'conversion', 'plan'];

const c = (key: string, label: string, kind: Col['kind'], group: ColGroup, dp = 4, extra: { width?: number; sticky?: boolean } = {}): Col<BudgetSummaryRow> => ({ key, label, kind, group, dp, ...extra });

export const SUMMARY_COLS: Col<BudgetSummaryRow>[] = [
  c('Matnr', 'Material code', 's', 'core', 0, { sticky: true, width: 130 }), c('Maktx', 'Material desc.', 's', 'core', 0, { width: 240 }), c('MtartFg', 'Type', 's', 'core', 0), c('Werks', 'Plant', 's', 'core', 0),
  c('Zscheme', 'Scheme', 's', 'core', 0), c('Zbusiness', 'Business line', 's', 'core', 0), c('Year', 'Year', 's', 'core', 0), c('Zskugrcodecrs', 'CRS SKU code', 's', 'core', 0), c('Zskugroupcrs', 'CRS SKU desc.', 's', 'core', 0, { width: 200 }),
  c('Zskusize', 'SKU size', 'd', 'core', 3), c('Name1', 'Vendor', 's', 'core', 0),
  c('WipCode', 'WIP code', 's', 'wip', 0), c('WipDesc', 'WIP desc.', 's', 'wip', 0, { width: 200 }), c('WipStlal', 'WIP alt. BOM', 's', 'wip', 0), c('WipCostp', 'WIP cost / kg', 'd', 'wip', 4), c('WipBaseUnit', 'WIP unit', 's', 'wip', 0),
  c('RmCost', 'B-RM / pc', 'd', 'budget'), c('PmCost', 'B-PM / pc', 'd', 'budget'), c('PerfumeCost', 'B-Perfume / pc', 'd', 'budget'),
  c('CostPerpc1', 'Budget mat. cost / pc', 'd', 'budget'), c('PCostPerpc1', 'Projected cost / pc', 'd', 'budget'), c('ACostPerpc1', 'Actual mat. cost / pc', 'd', 'budget'), c('LastRate', 'Info-record rate / pc (info only)', 'd', 'budget'),
  c('ARmcostPerpc1', 'Actual RM / pc', 'd', 'budget'), c('APmcostPerpc1', 'Actual PM / pc', 'd', 'budget'), c('APerfcostPerpc1', 'Actual perfume / pc', 'd', 'budget'),
  c('RmlastRate', 'RM info-record rate (info only)', 'd', 'budget'), c('PmlastRate', 'PM info-record rate (info only)', 'd', 'budget'), c('PerfumelastRate', 'Perfume info-record rate (info only)', 'd', 'budget'),
  ...ORIGINS.map(([, label, n]) => c(n, `B-${label}`, 'd', 'origin')),
  ...ORIGINS.map(([, label, n]) => c(`A${n}`, `Act ${label}`, 'd', 'originAct')),
  ...ORIGINS.map(([, label, n]) => c(`L${n}`, `Info rate ${label} (info only)`, 'd', 'originLast')),
  c('Machine', 'Machine', 'd', 'conversion'), c('Labour', 'Labour', 'd', 'conversion'), c('Power', 'Power', 'd', 'conversion'), c('Steam', 'Steam', 'd', 'conversion'), c('Labour3p', 'Labour charge (3P)', 'd', 'conversion'),
  c('PlanCost', 'Plan cost (Lac)', 'd', 'plan', 2), c('PlanQty', 'Plan qty (PC)', 'd', 'plan', 0), c('Ntgew', 'Net weight', 'd', 'plan', 3), c('Gewei', 'Wt unit', 's', 'plan', 0), c('QtyMt', 'Plan qty (MT)', 'd', 'plan', 3),
  c('CRmCost', 'Cons. RM / pc', 'd', 'consumer'), c('CPmCost', 'Cons. PM / pc', 'd', 'consumer'), c('CPerfCost', 'Cons. perf. / pc', 'd', 'consumer'), c('COthCost', 'Cons. other / pc', 'd', 'consumer'),
  c('TRmCost', 'Trade RM / pc', 'd', 'consumer'), c('TPmCost', 'Trade PM / pc', 'd', 'consumer'), c('TPerfCost', 'Trade perf. / pc', 'd', 'consumer'), c('TOthCost', 'Trade other / pc', 'd', 'consumer'),
  c('BomBmeng', 'BOM base qty', 'd', 'activity', 3), c('Bmsch', 'Activity base qty', 'd', 'activity', 3), c('Vgw02', 'Machine (activity)', 'd', 'activity', 3), c('Vgw03', 'Labour (activity)', 'd', 'activity', 3), c('Vgw04', 'Power (activity)', 'd', 'activity', 3), c('Vgw05', 'Steam (activity)', 'd', 'activity', 3),
  c('Machrs', 'Machine hrs rate', 'd', 'activity'), c('Labhrs', 'Labour hrs rate', 'd', 'activity'), c('Powerhrs', 'Power rate', 'd', 'activity'), c('Steamhrs', 'Steam rate', 'd', 'activity'),
  c('MachrsQty', 'Machine hrs qty', 'd', 'activity', 3), c('LabhrsQty', 'Labour hrs qty', 'd', 'activity', 3), c('PowerQty', 'Power qty', 'd', 'activity', 3), c('SteamQty', 'Steam qty', 'd', 'activity', 3), c('Labour3pQty', '3P conv. qty', 'd', 'activity', 3),
  c('InfoDateFrm', 'Info valid from', 't', 'activity', 0), c('InfoDateTo', 'Info valid to', 't', 'activity', 0),
  c('MulBom', 'Multiple BoM active', 'f', 'check', 0), c('MulUnlock', 'Multiple PVer unlocked', 'f', 'check', 0), c('MulProd', 'Alt. BoM issue', 'f', 'check', 0), c('AllBomIn', 'All BoM inactive', 'f', 'check', 0), c('AllPverIn', 'All PVer inactive', 'f', 'check', 0),
];
export const colsOf = (groups: ReadonlySet<ColGroup>): Col<BudgetSummaryRow>[] => SUMMARY_COLS.filter((x) => groups.has(x.group));

/** Columns the table calculates or loads itself (not SAP summary fields): variance, checklist, and cost per piece at the Selected and C-Map rate. Keys start with "_". */
export const CALC_COLS: Col<BudgetSummaryRow>[] = [
  c('_var', 'Act vs budget %', 'd', 'calc', 1), c('_lastvar', 'Info rate vs budget % (info only)', 'd', 'calc', 1), c('_issues', 'Checklist', 's', 'calc', 0),
  c('_sel', 'Selected rate / pc', 'd', 'rate'), c('_cmap', 'C-Map / pc', 'd', 'rate'),
];
/** Every column of the summary table, in menu order. */
export const ALL_COLS: Col<BudgetSummaryRow>[] = [...SUMMARY_COLS, ...CALC_COLS];
export const isCalcKey = (k: string): boolean => k.startsWith('_');
/** The columns on screen at first: the default groups, the two variances and the checklist. */
export const DEFAULT_VISIBLE: string[] = [...SUMMARY_COLS.filter((x) => DEFAULT_GROUPS.includes(x.group)).map((x) => x.key), '_var', '_lastvar', '_issues'];
export const colsByKeys = (keys: ReadonlySet<string>): Col<BudgetSummaryRow>[] => ALL_COLS.filter((x) => keys.has(x.key));

/** Per-FG Selected / C-Map totals as the table needs them. */
export interface FgRates { selected: Decimal; cmap: Decimal }
/** Value of a calculated column; null when it has none (no actual / info rate / rates not loaded). */
export function calcValue(key: string, r: BudgetSummaryRow, rates?: FgRates): Decimal | null {
  switch (key) {
    case '_var': return variancePct(r);
    case '_lastvar': return lastVariancePct(r);
    case '_sel': return rates ? rates.selected : null;
    case '_cmap': return rates ? rates.cmap : null;
    case '_issues': return D(issuesOf(r).length);
    default: return null;
  }
}

export const dec = (v: string | undefined | null): Decimal | null => { if (v === undefined || v === null || v === '') return null; const d = D(v); return d.isFinite() ? d : null; };

/** Actual vs budget material cost per piece, in %. null when either side is 0 (no actual, or no budget). */
export function variancePct(r: Pick<BudgetSummaryRow, 'CostPerpc1' | 'ACostPerpc1'>): Decimal | null {
  const b = D(r.CostPerpc1), a = D(r.ACostPerpc1);
  if (b.isZero() || a.isZero()) return null;
  return a.minus(b).div(b.abs()).times(100);
}
/** Info-record rate vs budget, in %. Information only: the budget cost is priced from zcomponent / zcomponent_n, never from the info record. */
export function lastVariancePct(r: Pick<BudgetSummaryRow, 'CostPerpc1' | 'LastRate'>): Decimal | null {
  const b = D(r.CostPerpc1), l = D(r.LastRate);
  if (b.isZero() || l.isZero()) return null;
  return l.minus(b).div(b.abs()).times(100);
}
export const VAR_WARN = 5, VAR_HIGH = 10;
export const varTone = (p: Decimal | null): 'good' | 'warn' | 'bad' | undefined => (p === null ? undefined : p.abs().gte(VAR_HIGH) ? 'bad' : p.abs().gte(VAR_WARN) ? 'warn' : 'good');

/** Checklist flags of a row (summary, split, check set): the report's five columns, as readable text. */
export function issuesOf(r: Pick<BudgetSummaryRow, 'MulBom' | 'MulUnlock' | 'MulProd' | 'AllBomIn' | 'AllPverIn'>): string[] {
  const out: string[] = [];
  if (r.AllBomIn) out.push('All BoMs inactive');
  if (r.AllPverIn) out.push('All production versions inactive');
  if (r.MulBom) out.push('Multiple BoMs active');
  if (r.MulUnlock) out.push('Multiple production versions unlocked');
  if (r.MulProd) out.push('Alternative BoM does not match the production version');
  return out;
}

export interface Kpis { rows: number; fgs: number; plants: number; avgBudget: Decimal | null; avgActual: Decimal | null; withActual: number; high: number; warn: number; issues: number; planCostLac: Decimal }
export function kpis(rows: BudgetSummaryRow[]): Kpis {
  const fg = new Set(rows.map((r) => r.Matnr)), pl = new Set(rows.map((r) => r.Werks));
  const bud = rows.filter((r) => !D(r.CostPerpc1).isZero());
  const act = rows.filter((r) => !D(r.ACostPerpc1).isZero());
  let high = 0, warn = 0, issues = 0, plan = ZERO;
  for (const r of rows) {
    const t = varTone(variancePct(r));
    if (t === 'bad') high++; else if (t === 'warn') warn++;
    if (issuesOf(r).length) issues++;
    plan = plan.plus(D(r.PlanCost));
  }
  const avg = (l: BudgetSummaryRow[], k: 'CostPerpc1' | 'ACostPerpc1') => (l.length ? l.reduce((s, r) => s.plus(D(r[k])), ZERO).div(l.length) : null);
  return { rows: rows.length, fgs: fg.size, plants: pl.size, avgBudget: avg(bud, 'CostPerpc1'), avgActual: avg(act, 'ACostPerpc1'), withActual: act.length, high, warn, issues, planCostLac: plan };
}

export const distinctRunIds = (rows: { RunId: string }[]): string[] => Array.from(new Set(rows.map((r) => r.RunId).filter(Boolean)));
export const rowKey = (r: Pick<BudgetSummaryRow, 'Matnr' | 'Werks' | 'Zscheme' | 'MtartFg' | 'Rowid'>) => `${r.Werks}|${r.Matnr}|${r.Zscheme}|${r.MtartFg}|${r.Rowid}`;

/** search over code / description / CRS / scheme / WIP, case-insensitive; all words must match */
export function searchRows<T extends object>(rows: T[], text: string, keys: string[]): T[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => { const hay = keys.map((k) => String((r as Record<string, unknown>)[k] ?? '')).join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); });
}
export function sortRows<T extends object>(rows: T[], key: string, kind: Col['kind'], dir: 'asc' | 'desc'): T[] {
  const m = dir === 'asc' ? 1 : -1;
  const out = [...rows];
  out.sort((a, b) => {
    const x = (a as Record<string, unknown>)[key], y = (b as Record<string, unknown>)[key];
    if (kind === 'd') return D(x as string).comparedTo(D(y as string)) * m;
    if (kind === 'f') return (Number(Boolean(x)) - Number(Boolean(y))) * m;
    return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * m;
  });
  return out;
}
export const filterIssues = (rows: BudgetSummaryRow[]) => rows.filter((r) => issuesOf(r).length > 0);

/** Totals of the split rows. The report adds every split row of the FG into its summary line (phantom / WIP rows carry no cost of their own), so all rows are added here too. */
export function splitTotals(rows: BudgetSplitRow[]) {
  const s = (k: 'CostPerpc1' | 'PCostPerpc1' | 'ACostPerpc1' | 'LastRate') => rows.reduce((a, r) => a.plus(D(r[k])), ZERO);
  return { budget: s('CostPerpc1'), projected: s('PCostPerpc1'), actual: s('ACostPerpc1'), last: s('LastRate'), count: rows.length };
}
export const bucketTotal = (r: BudgetSplitRow | BudgetSummaryRow, keys: readonly string[]) => keys.reduce((a, k) => a.plus(D((r as unknown as Record<string, string>)[k])), ZERO);

// ---- approver -------------------------------------------------------------------------------------------------------------------
export interface PendingGroup { key: string; gjahr: string; version: string; status: string; lines: number; plants: string[]; remarks: string; initiatedBy: string; initiatedOn: string | null; budgetTotal: Decimal; rows: BudgetPendingRow[] }
/** One group per financial year and version (SAP versions are per year); newest version first. */
export function groupPending(rows: BudgetPendingRow[]): PendingGroup[] {
  const m = new Map<string, PendingGroup>();
  for (const r of rows) {
    const key = `${r.Gjahr}|${r.Version}`;
    let g = m.get(key);
    if (!g) { g = { key, gjahr: r.Gjahr, version: r.Version, status: r.Status, lines: 0, plants: [], remarks: r.Remarks, initiatedBy: r.InitiatedBy, initiatedOn: r.InitiatedOn, budgetTotal: ZERO, rows: [] }; m.set(key, g); }
    g.lines++; g.rows.push(r);
    if (!g.plants.includes(r.Werks)) g.plants.push(r.Werks);
    g.budgetTotal = g.budgetTotal.plus(D(r.CostPc));
    if (!g.remarks && r.Remarks) g.remarks = r.Remarks;
  }
  return Array.from(m.values()).sort((a, b) => b.gjahr.localeCompare(a.gjahr) || b.version.localeCompare(a.version, undefined, { numeric: true }));
}
export const checkRowIssues = (r: BudgetCheckRow) => issuesOf(r);


/* ---------- split rows grouped as the FG header groups them: RM / Perfume / PM ---------- */

/** RM = raw material (type ROH) that is not perfume; PERF = raw material (ROH) of a perfume origin group; PM = every other type (VERP, PKGN ...). */
export type SplitBucket = 'RM' | 'PERF' | 'PM';
export const SPLIT_BUCKETS: readonly SplitBucket[] = ['RM', 'PERF', 'PM'];
/** Origin codes (HRKFT) of perfume. The live data was seen with PRFM; PERF is the code the business uses: both count. */
export const PERFUME_ORIGINS: readonly string[] = ['PERF', 'PRFM'];
export const BUCKET_LABEL: Record<SplitBucket, string> = { RM: 'RM', PERF: 'Perfume', PM: 'PM' };
export const BUCKET_HINT: Record<SplitBucket, string> = {
  RM: 'Raw material: type ROH, origin not perfume. Sums to the header B-RM / pc.',
  PERF: 'Perfume: type ROH with a perfume origin (PERF / PRFM). Sums to the header B-Perfume / pc.',
  PM: 'Packing: every other type (VERP, PKGN ...). Sums to the header B-PM / pc.',
};
/** Row tint and marker colours, one per group. */
export const BUCKET_COLOR: Record<SplitBucket, string> = { RM: '#2563eb', PERF: '#9333ea', PM: '#d97706' };

export function bucketOf(r: Pick<BudgetSplitRow, 'Mtart' | 'Hrkft'>): SplitBucket {
  if (String(r.Mtart ?? '').trim().toUpperCase() === 'ROH') return PERFUME_ORIGINS.includes(String(r.Hrkft ?? '').trim().toUpperCase()) ? 'PERF' : 'RM';
  return 'PM';
}

/** Rows in header order (RM, Perfume, PM), keeping SAP's order inside each group. */
export const groupedSplitRows = (rows: BudgetSplitRow[]): BudgetSplitRow[] => SPLIT_BUCKETS.flatMap((b) => rows.filter((r) => bucketOf(r) === b));
