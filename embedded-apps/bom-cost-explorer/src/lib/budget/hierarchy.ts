/**
 * Budget result at Brand / Product / SKU level. The FG -> Brand / Product (PRODHA) / SKU link is MaterialVHSet (Zbrand, Prodha, Zsku, as on the cascade picker),
 * the names are HierVHSet (levels B / P / C). The averages are SIMPLE averages (confirmed by the business) of the latest FG code of each combination
 * CRS SKU + plant + material type + scheme indicator + year (the latest = the highest FG code); plan quantity and plan cost are totals. Only SAP's figures are added up.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { sapGetCollection, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import { odataString } from '../sap/filter';
import { ENTITY_SET } from '../sap/entities';
import { HIER_SET, hierRequest, type HierLevel } from '../client/hier';
import type { BudgetSummaryRow } from './types';
import type { WacRow } from '../wac/types';

export interface MatHier { brand: string; product: string; sku: string }
export type HierNames = Record<HierLevel, Map<string, string>>;
export type HierLevelKey = 'brand' | 'product' | 'sku';
export const LEVEL_LABEL: Record<HierLevelKey, string> = { brand: 'Brand', product: 'Product', sku: 'SKU' };
const NONE = '(not in hierarchy)';

/** The latest FG code of each CRS SKU + plant + material type + scheme + year (a later FG code = a higher number). */
export function latestFgs(rows: BudgetSummaryRow[]): BudgetSummaryRow[] {
  const best = new Map<string, BudgetSummaryRow>();
  for (const r of rows) {
    const k = [r.Zskugrcodecrs, r.Werks, r.MtartFg, r.Zscheme, r.Year].join('|');
    const cur = best.get(k);
    if (!cur || r.Matnr.localeCompare(cur.Matnr, undefined, { numeric: true }) > 0) best.set(k, r);
  }
  return [...best.values()];
}

/* ---------- last year's weighted average (WacRowSet = ZMM_PCOST aggregated per FG; Qty = produced quantity) ---------- */
export interface LyAvg { qty: Decimal; rm: Decimal; pm: Decimal; perf: Decimal; mat: Decimal } // per piece, weighted by produced quantity
/** WacRowSet has no scheme, so the combination here is CRS SKU + plant + material type. */
export const lyKey = (crs: string, werks: string, mtart: string) => `${crs}|${werks}|${mtart}`;
export function lastYearAverages(rows: WacRow[]): Map<string, LyAvg> {
  const acc = new Map<string, { qty: Decimal; rm: Decimal; pm: Decimal; perf: Decimal; mat: Decimal }>();
  for (const r of rows) {
    const q = D(r.Qty);
    if (!q.gt(0) || !r.Zskugrcodecrs) continue;
    const a = acc.get(lyKey(r.Zskugrcodecrs, r.Werks, r.Mtart)) ?? { qty: ZERO, rm: ZERO, pm: ZERO, perf: ZERO, mat: ZERO };
    a.qty = a.qty.plus(q); a.rm = a.rm.plus(q.times(D(r.ActRm))); a.pm = a.pm.plus(q.times(D(r.ActPm))); a.perf = a.perf.plus(q.times(D(r.ActPerf))); a.mat = a.mat.plus(q.times(D(r.ActMat)));
    acc.set(lyKey(r.Zskugrcodecrs, r.Werks, r.Mtart), a);
  }
  return new Map([...acc].map(([k, a]) => [k, { qty: a.qty, rm: a.rm.div(a.qty), pm: a.pm.div(a.qty), perf: a.perf.div(a.qty), mat: a.mat.div(a.qty) }]));
}
/** The fiscal year before the budget year (April..March; budget year 2026 = FY 2026-27, so last year is 2025-04-01 .. 2026-03-31). */
export function previousFiscalYear(budgetYr: string): { from: string; to: string } | null {
  const y = Number(budgetYr);
  return Number.isInteger(y) && y > 2000 ? { from: `${y - 1}-04-01`, to: `${y}-03-31` } : null;
}

export interface HierGroup {
  key: string; level: HierLevelKey; code: string; name: string; brand: string; product: string;
  fgs: number; avgBudget: Decimal | null; avgProjected: Decimal | null; avgActual: Decimal | null; withActual: number;
  avgRm: Decimal | null; avgPm: Decimal | null; avgPerfume: Decimal | null; planQty: Decimal; planCost: Decimal;
  /** last year's weighted average of the FGs that have production last year (null = none matched) and the budget average of those same FGs */
  ly: { rm: Decimal; pm: Decimal; perf: Decimal; mat: Decimal; qty: Decimal; matched: number; budgetMat: Decimal } | null;
  varAbs: Decimal | null; varPct: Decimal | null; // budget - last year, on the matched FGs
}
const avg = (rows: BudgetSummaryRow[], k: keyof BudgetSummaryRow, onlyPositive = false): Decimal | null => {
  const l = onlyPositive ? rows.filter((r) => D(r[k] as string).gt(0)) : rows;
  return l.length ? l.reduce((s, r) => s.plus(D(r[k] as string)), ZERO).div(l.length) : null;
};
const sum = (rows: BudgetSummaryRow[], k: keyof BudgetSummaryRow) => rows.reduce((s, r) => s.plus(D(r[k] as string)), ZERO);

export function rollup(rows: BudgetSummaryRow[], map: ReadonlyMap<string, MatHier>, names: HierNames, level: HierLevelKey, ly?: ReadonlyMap<string, LyAvg> | null): HierGroup[] {
  const by = new Map<string, { rows: BudgetSummaryRow[]; h: MatHier }>();
  for (const r of latestFgs(rows)) {
    const h = map.get(r.Matnr) ?? { brand: '', product: '', sku: '' };
    const code = h[level];
    const key = level === 'brand' ? code : level === 'product' ? `${h.brand}|${code}` : `${h.brand}|${h.product}|${code}`;
    const g = by.get(key) ?? { rows: [], h };
    g.rows.push(r); by.set(key, g);
  }
  const nm = (l: HierLevel, c: string) => (c ? names[l].get(c) || '' : '');
  const out = [...by.entries()].map(([key, { rows: l, h }]): HierGroup => {
    const code = h[level];
    const lv: HierLevel = level === 'brand' ? 'B' : level === 'product' ? 'P' : 'C';
    // last year: each distinct combination once, weighted by its produced quantity; the budget side is averaged over the same FGs
    let lyG: HierGroup['ly'] = null;
    if (ly) {
      const seen = new Map<string, { a: LyAvg; budget: Decimal }[]>();
      for (const r of l) { const k = lyKey(r.Zskugrcodecrs, r.Werks, r.MtartFg); const a = ly.get(k); if (a) { const g = seen.get(k) ?? []; g.push({ a, budget: D(r.CostPerpc1) }); seen.set(k, g); } }
      let q = ZERO, rm = ZERO, pm = ZERO, pf = ZERO, mt = ZERO, bm = ZERO, n = 0;
      for (const g of seen.values()) { const a = g[0].a; q = q.plus(a.qty); rm = rm.plus(a.qty.times(a.rm)); pm = pm.plus(a.qty.times(a.pm)); pf = pf.plus(a.qty.times(a.perf)); mt = mt.plus(a.qty.times(a.mat)); for (const x of g) { bm = bm.plus(x.budget); n++; } }
      if (q.gt(0) && n) lyG = { rm: rm.div(q), pm: pm.div(q), perf: pf.div(q), mat: mt.div(q), qty: q, matched: n, budgetMat: bm.div(n) };
    }
    const varAbs = lyG ? lyG.budgetMat.minus(lyG.mat) : null;
    return {
      ly: lyG, varAbs, varPct: varAbs && lyG && lyG.mat.gt(0) ? varAbs.div(lyG.mat).times(100) : null,
      key, level, code, name: code ? nm(lv, code) || code : NONE, brand: nm('B', h.brand) || h.brand, product: nm('P', h.product) || h.product,
      fgs: l.length, avgBudget: avg(l, 'CostPerpc1', true), avgProjected: avg(l, 'PCostPerpc1', true), avgActual: avg(l, 'ACostPerpc1', true), withActual: l.filter((r) => D(r.ACostPerpc1).gt(0)).length,
      avgRm: avg(l, 'RmCost', true), avgPm: avg(l, 'PmCost', true), avgPerfume: avg(l, 'PerfumeCost', true), planQty: sum(l, 'PlanQty'), planCost: sum(l, 'PlanCost'),
    };
  });
  return out.sort((a, b) => (a.code ? 0 : 1) - (b.code ? 0 : 1) || a.name.localeCompare(b.name));
}

/* ---------- SAP: FG -> hierarchy codes (MaterialVHSet) and the names (HierVHSet) ---------- */
const MAT_BATCH = 40;
const matCache = new Map<string, MatHier>();
let namesCache: HierNames | null = null;

export const materialHierRequest = (matnrs: string[]) => ({
  entitySet: ENTITY_SET.MATERIALS,
  params: { $filter: matnrs.length === 1 ? `Matnr eq ${odataString(matnrs[0])}` : `(${matnrs.map((m) => `Matnr eq ${odataString(m)}`).join(' or ')})` } as Record<string, string | undefined>,
});

/** Brand / product / SKU codes of the given FGs; asks SAP only for the FGs not seen yet. */
export async function loadMaterialHier(matnrs: string[], opts: SapGetOptions = {}): Promise<Map<string, MatHier>> {
  const todo = [...new Set(matnrs)].filter((m) => m && !matCache.has(m));
  for (let i = 0; i < todo.length; i += MAT_BATCH) {
    const batch = todo.slice(i, i + MAT_BATCH);
    const req = materialHierRequest(batch);
    const r = await sapGetCollection(req.entitySet, req.params, opts);
    for (const raw of r.rows) {
      const m = normalizeEntity<{ Matnr: string; Zbrand: string; Prodha: string; Zsku: string }>(raw, { Matnr: ['Matnr', 's'], Zbrand: ['Zbrand', 's'], Prodha: ['Prodha', 's'], Zsku: ['Zsku', 's'] });
      matCache.set(m.Matnr, { brand: m.Zbrand, product: m.Prodha, sku: m.Zsku });
    }
    for (const m of batch) if (!matCache.has(m)) matCache.set(m, { brand: '', product: '', sku: '' }); // SAP has no hierarchy for it
  }
  return new Map(matnrs.filter((m) => matCache.has(m)).map((m) => [m, matCache.get(m)!]));
}

/** Names of every brand, product and SKU (HierVHSet, one call per level, remembered for the session). */
export async function loadHierNames(opts: SapGetOptions = {}): Promise<HierNames> {
  if (namesCache) return namesCache;
  const out: HierNames = { B: new Map(), P: new Map(), C: new Map() };
  for (const level of ['B', 'P', 'C'] as const) {
    const req = hierRequest(level);
    const r = await sapGetCollection(HIER_SET, req.params, opts);
    for (const raw of r.rows) {
      const o = normalizeEntity<{ Code: string; Descr: string }>(raw, { Code: ['Code', 's'], Descr: ['Descr', 's'] });
      if (o.Code) out[level].set(o.Code, o.Descr);
    }
  }
  return (namesCache = out);
}
export const resetHierCache = () => { matCache.clear(); namesCache = null; };
