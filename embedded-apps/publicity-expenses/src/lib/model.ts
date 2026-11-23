/**
 * Report model: summary rows -> MIS tree (category > range > product type > reporting row) with sub-totals, and the
 * roll-ups the dashboards use. Pure functions, no React.
 *
 * Column measures per report-header group (as the MIS layout): RB FY, RB YTD, OB FY, OB YTD, CY Actual HO,
 * CY Actual Units, CY Total (= HO + Units), PY Total; with G/L columns expanded, CY HO / Units per G/L account.
 * GR Total MIS = the groups with mis = true; GR Total LR = MIS + the other groups (DSR and any unmapped header), so LR
 * always equals the sum of every row.
 */
import type { AppConfig, Filters, GroupDef, SummaryRow } from './types';

export interface Measures { rba: number; rby: number; oba: number; oby: number; ho: number; un: number; py: number; cyP: number; pyP: number }
export const zero = (): Measures => ({ rba: 0, rby: 0, oba: 0, oby: 0, ho: 0, un: 0, py: 0, cyP: 0, pyP: 0 });
export const cyOf = (m: Measures) => m.ho + m.un;

function add(m: Measures, r: SummaryRow) {
  m.rba += r.RBAnnualAmount; m.rby += r.RBYTDAmount; m.oba += r.OBAnnualAmount; m.oby += r.OBYTDAmount;
  if (r.Site === 'UN') m.un += r.CYYTDAmount; else m.ho += r.CYYTDAmount;
  m.py += r.PYYTDAmount; m.cyP += r.CYPeriodAmount; m.pyP += r.PYPeriodAmount;
}
function merge(into: Measures, m: Measures) {
  (Object.keys(into) as (keyof Measures)[]).forEach((k) => { into[k] += m[k]; });
}

export const NON_BRAND_CATEGORY = 'NON-BRAND / OTHER';
export const categoryOf = (r: SummaryRow) => r.ItemCategory || NON_BRAND_CATEGORY;
export const rangeOf = (r: SummaryRow) => r.ProductRange || r.ProductGroup || 'Unassigned';
export const typeOf = (r: SummaryRow) => r.ProductType || r.ProductGroup || 'Unassigned';
export const lineOf = (r: SummaryRow) => r.MISHeading || r.Product || r.ProductGroup || r.ReportingKey;

// ---------------------------------------------------------------- filters

export function applyFilters(rows: SummaryRow[], f: Filters): SummaryRow[] {
  const site = new Set(f.site); const groups = new Set(f.groups); const cats = new Set(f.categories); const brands = new Set(f.brands);
  return rows.filter((r) =>
    (!site.size || site.has(r.Site)) && (!groups.size || groups.has(r.HeaderGroup))
    && (!cats.size || cats.has(categoryOf(r))) && (!brands.size || brands.has(rangeOf(r))));
}

// ---------------------------------------------------------------- columns

export interface GroupCol extends GroupDef { gls: { gl: string; name: string }[]; seq: number }

/** Header groups in layout order, plus any header SAP sends that the mapping does not know (at the end). */
export function groupColumns(rows: SummaryRow[], config: AppConfig): GroupCol[] {
  const known = new Map(config.groups.map((g, i) => [g.id, { ...g, gls: [] as { gl: string; name: string }[], seq: i }]));
  const extra = new Map<string, GroupCol>();
  const glSeen = new Map<string, Map<string, string>>();
  for (const r of rows) {
    let g = known.get(r.HeaderGroup) ?? extra.get(r.HeaderGroup);
    if (!g) {
      g = { id: r.HeaderGroup, label: r.HeaderLabel, cls: r.SpendClass, mis: false, gls: [], seq: 100 + (r.ReportHeaderSequence || 0) };
      extra.set(r.HeaderGroup, g);
    }
    const m = glSeen.get(g.id) ?? new Map<string, string>();
    if (!m.has(r.GLAccount)) m.set(r.GLAccount, r.GLAccountName);
    glSeen.set(g.id, m);
  }
  const all = [...known.values(), ...extra.values()].sort((a, b) => a.seq - b.seq);
  for (const g of all) g.gls = [...(glSeen.get(g.id) ?? new Map()).entries()].map(([gl, name]) => ({ gl, name })).sort((a, b) => a.gl.localeCompare(b.gl));
  return all;
}

// ---------------------------------------------------------------- tree

export type Level = 0 | 1 | 2 | 3;
export interface Node {
  id: string;
  label: string;
  level: Level; // 0 category, 1 range, 2 product type, 3 reporting row
  key?: string; // ReportingKey (level 3)
  visibleInMIS: boolean;
  sort: string;
  children: Node[];
  byGroup: Map<string, Measures>;
  byGl: Map<string, { ho: number; un: number }>; // `${group}|${gl}`
}

const node = (id: string, label: string, level: Level, sort: string): Node => ({ id, label, level, sort, visibleInMIS: false, children: [], byGroup: new Map(), byGl: new Map() });

function addRow(n: Node, r: SummaryRow) {
  const m = n.byGroup.get(r.HeaderGroup) ?? zero();
  add(m, r);
  n.byGroup.set(r.HeaderGroup, m);
  const k = `${r.HeaderGroup}|${r.GLAccount}`;
  const g = n.byGl.get(k) ?? { ho: 0, un: 0 };
  if (r.Site === 'UN') g.un += r.CYYTDAmount; else g.ho += r.CYYTDAmount;
  n.byGl.set(k, g);
  if (r.VisibleInMIS && r.VisibleInMIS !== 'N') n.visibleInMIS = true;
}

const sortKey = (r: SummaryRow) => [r.SerialNo ? r.SerialNo.padStart(4, '0') : '9999', r.T1 || '~', r.T2 || '~', r.T3 || '~', r.ProductGroup].join('|');

/** Category > range > product type > reporting row, sorted by SerialNo, T1, T2, T3 (non-brand groups last). */
export function buildTree(rows: SummaryRow[]): Node {
  const root = node('ALL', 'TOTAL', 0, '');
  const index = new Map<string, Node>();
  const child = (parent: Node, id: string, label: string, level: Level, sort: string) => {
    let n = index.get(id);
    if (!n) { n = node(id, label, level, sort); index.set(id, n); parent.children.push(n); }
    if (sort < n.sort) n.sort = sort;
    return n;
  };
  for (const r of rows) {
    const s = sortKey(r);
    const c = child(root, `c|${categoryOf(r)}`, categoryOf(r), 0, s);
    const g = child(c, `${c.id}|r|${rangeOf(r)}`, rangeOf(r), 1, s);
    const t = child(g, `${g.id}|t|${typeOf(r)}`, typeOf(r), 2, s);
    const l = child(t, `k|${r.ReportingKey}`, lineOf(r), 3, s);
    l.key = r.ReportingKey;
    for (const n of [root, c, g, t, l]) addRow(n, r);
  }
  const sortRec = (n: Node) => { n.children.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0)); n.children.forEach(sortRec); };
  sortRec(root);
  return root;
}

/** Group measures of a node, and the MIS / LR totals. */
export function nodeMeasures(n: Node, groups: GroupCol[]): { group: Map<string, Measures>; mis: Measures; lr: Measures } {
  const mis = zero(); const lr = zero();
  for (const g of groups) {
    const m = n.byGroup.get(g.id);
    if (!m) continue;
    if (g.mis) merge(mis, m);
    merge(lr, m);
  }
  return { group: n.byGroup, mis, lr };
}

export const isZero = (n: Node) => [...n.byGroup.values()].every((m) => Math.abs(cyOf(m)) < 0.5 && Math.abs(m.py) < 0.5 && Math.abs(m.rby) < 0.5);

// ---------------------------------------------------------------- roll-ups for dashboards

export interface Roll { key: string; label: string; cy: number; py: number; cyP: number; pyP: number; rby: number; rba: number; oby: number; oba: number; ho: number; un: number }
const emptyRoll = (key: string, label: string): Roll => ({ key, label, cy: 0, py: 0, cyP: 0, pyP: 0, rby: 0, rba: 0, oby: 0, oba: 0, ho: 0, un: 0 });

export function rollup(rows: SummaryRow[], keyOf: (r: SummaryRow) => string, labelOf: (r: SummaryRow) => string = keyOf): Roll[] {
  const m = new Map<string, Roll>();
  for (const r of rows) {
    const k = keyOf(r);
    const x = m.get(k) ?? emptyRoll(k, labelOf(r));
    x.cy += r.CYYTDAmount; x.py += r.PYYTDAmount; x.cyP += r.CYPeriodAmount; x.pyP += r.PYPeriodAmount;
    x.rby += r.RBYTDAmount; x.rba += r.RBAnnualAmount; x.oby += r.OBYTDAmount; x.oba += r.OBAnnualAmount;
    if (r.Site === 'UN') x.un += r.CYYTDAmount; else x.ho += r.CYYTDAmount;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.cy - a.cy);
}

export const total = (rows: SummaryRow[]): Roll => rollup(rows, () => 'ALL', () => 'Total')[0] ?? emptyRoll('ALL', 'Total');

/** Pareto: rows sorted by CY desc with cumulative share; how many make up 80 %. */
export function pareto(rolls: Roll[]): { rows: (Roll & { cum: number })[]; n80: number } {
  const pos = rolls.filter((r) => r.cy > 0).sort((a, b) => b.cy - a.cy);
  const sum = pos.reduce((s, r) => s + r.cy, 0) || 1;
  let acc = 0; let n80 = 0;
  const out = pos.map((r, i) => { acc += r.cy; const cum = (acc / sum) * 100; if (!n80 && cum >= 80) n80 = i + 1; return { ...r, cum }; });
  return { rows: out, n80 };
}

/** Straight-line full-year projection from YTD. */
export const projectFY = (ytd: number, period: number) => (period ? (ytd / period) * 12 : 0);
