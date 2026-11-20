'use client';
/**
 * BOM costing > Excel: the BOM tree report as it is on screen - the columns the user has chosen (and only those), one row per
 * tree node (country, plant, FG, components). Rules:
 *  - WIP lines (a line with a sub-tree, or material type HALB) carry no cost at all: every cost column is blank. Their
 *    components below them carry the cost, so nothing is lost and nothing is counted twice.
 *  - FG rows carry the RM / PM / Perfume cost, total and per unit (per unit = total / explosion quantity).
 */
import type { CostQuery } from '../query/schema';
import type { SapMessage } from '../sap/messages';
import type { CostLine } from '../sap/fields';
import type { SimRow, SimSettings } from '../cost/simulate';
import { minCover } from '../cost/analytics';
import { categoryTotals, perUnit, type CatTotals } from '../cost/catTotals';
import { D, type Decimal } from '../cost/decimal';
import { componentFreightInr, componentFreightLoc, type FreightTagged } from '../cost/freightIncluded';
import type { CostTree, TreeNode } from '../cost/tree';
import { costLineSheets, exportTable, type XCol, type XSheet } from './export';

/** Tree column ids that have cost figures; the rest of the tree columns are descriptive. Shown for WIP lines as blank. */
export interface NodeAggX { inr: Decimal[]; loc: Decimal[]; sim: Decimal[] | null }

interface Ctx { tree: CostTree; sim: SimRow[]; simOn: boolean; agg: NodeAggX; cat: CatTotals; explQty: Decimal | null; n: TreeNode; i: number; r: CostLine | null; s: SimRow | null; leaf: boolean; wip: boolean }
interface Def { header: string; dp?: number; curr?: string; width?: number; cost?: boolean; get: (c: Ctx) => string | number | null }

/** A WIP line: a component with a sub-tree (its figure is only the roll-up of what is below) or of material type HALB. */
export const isWipLine = (r: Pick<CostLine, 'HasChild' | 'Mtart'>, leaf: boolean) => !leaf || (r.Mtart || '').trim().toUpperCase() === 'HALB';

const fix = (v: string | Decimal | number | null | undefined, dp = 6): number | null => (v === null || v === undefined || v === '' ? null : Number(Number(String(v)).toFixed(dp)));
const nz = (v: string | number | null | undefined, dp = 6): number | null => (v === null || v === undefined || D(String(v)).isZero() ? null : fix(v, dp));
const frtTagged = (r: CostLine) => r as CostLine & FreightTagged;
const hasFrt = (r: CostLine) => !!(frtTagged(r).FrtIncluded || r.FrtSrc);

const line = <T,>(c: Ctx, f: (r: CostLine, s: SimRow) => T): T | null => (c.r && c.s ? f(c.r, c.s) : null);
const leafOnly = <T,>(c: Ctx, f: (r: CostLine, s: SimRow) => T): T | null => (c.r && c.s && c.leaf ? f(c.r, c.s) : null);

/** The export columns of every BOM tree column id (same ids and labels as the tree). */
export const TREE_EXPORT: Record<string, Def[]> = {
  level: [{ header: 'Lvl', width: 6, get: (c) => line(c, (r) => r.Level) }],
  qty: [
    { header: 'Prod. qty', dp: 3, width: 12, get: (c) => line(c, (r, s) => fix(s.changed && !s.qty.eq(D(r.ProdQty)) ? s.qty : r.ProdQty, 3)) },
    { header: 'UoM', width: 6, get: (c) => line(c, (r) => r.Meins) },
  ],
  qtysrc: [{ header: 'Qty src', width: 8, get: (c) => line(c, (r) => r.Qtysrc) }],
  source: [{ header: 'Rate source', width: 12, cost: true, get: (c) => leafOnly(c, (_r, s) => s.source || 'NO RATE') }],
  vendor: [{ header: 'Vendor', width: 24, cost: true, get: (c) => leafOnly(c, (r) => r.SelVname || r.SelVendor) }],
  ratePc: [
    { header: 'Rate / pc', dp: 4, width: 14, cost: true, get: (c) => leafOnly(c, (r) => (r.SelSource ? fix(r.SelRatePc) : null)) },
    { header: 'Rate currency', width: 8, cost: true, get: (c) => leafOnly(c, (r) => (r.SelSource ? r.SelCurr : null)) },
  ],
  fx: [{ header: 'FX', dp: 5, width: 10, cost: true, get: (c) => leafOnly(c, (r) => (r.SelSource ? fix(r.SelFx) : null)) }],
  ratePcLoc: [{ header: 'Rate / pc (local)', dp: 4, width: 14, cost: true, get: (c) => leafOnly(c, (r) => (r.SelSource ? fix(r.SelRatePcLoc) : null)) }],
  ratePcInr: [{ header: 'Rate / pc INR', dp: 4, curr: 'INR', width: 14, cost: true, get: (c) => leafOnly(c, (r, s) => (s.changed && !s.ratePcInr.eq(D(r.SelRatePcInr)) ? fix(s.ratePcInr) : r.SelSource ? fix(r.SelRatePcInr) : 'NO RATE')) }],
  frtPc: [{ header: 'Freight / pc (local)', dp: 4, width: 14, cost: true, get: (c) => leafOnly(c, (r) => (hasFrt(r) ? fix(componentFreightLoc(r)) : null)) }],
  frtPcInr: [{ header: 'Freight / pc INR', dp: 4, curr: 'INR', width: 14, cost: true, get: (c) => leafOnly(c, (r, s) => (s.changed && !s.frtPcInr.eq(D(r.FrtPcInr)) ? fix(s.frtPcInr) : hasFrt(r) ? fix(componentFreightInr(r)) : null)) }],
  totPcInr: [{ header: 'Total / pc INR', dp: 4, curr: 'INR', width: 14, cost: true, get: (c) => leafOnly(c, (r, s) => fix(s.changed ? s.totPcInr : r.TotCostPcInr)) }],
  totLoc: [{ header: 'Total (local)', dp: 2, width: 16, cost: true, get: (c) => (c.r ? leafOnly(c, (r) => fix(r.TotCostLoc, 2)) : c.n.kind === 'plant' || c.n.kind === 'header' ? fix(c.agg.loc[c.i], 2) : null) }],
  totInr: [{ header: 'Total INR', dp: 2, curr: 'INR', width: 16, cost: true, get: (c) => (c.r ? leafOnly(c, (r) => fix(r.TotCostInr, 2)) : fix(c.agg.inr[c.i], 2)) }],
  budget: [{ header: 'Budget landed / pc', dp: 4, curr: 'INR', width: 14, cost: true, get: (c) => leafOnly(c, (r) => nz(r.BudLanded)) }],
  cover: [{ header: 'Coverage (days)', dp: 0, width: 10, get: (c) => leafOnly(c, (r) => minCover(r)) }],
  selRate: [{ header: 'Rate / price unit', dp: 4, width: 14, cost: true, get: (c) => leafOnly(c, (r) => (r.SelSource ? nz(r.SelRate) : null)) }],
  selRateInr: [{ header: 'Rate / price unit INR', dp: 4, curr: 'INR', width: 14, cost: true, get: (c) => leafOnly(c, (r) => (r.SelSource ? nz(r.SelRateInr) : null)) }],
  compCost: [{ header: 'Component cost (rate currency)', dp: 2, width: 16, cost: true, get: (c) => leafOnly(c, (r) => nz(r.CompCost, 2)) }],
  totPcLoc: [{ header: 'Total / pc (local)', dp: 4, width: 14, cost: true, get: (c) => leafOnly(c, (r) => nz(r.TotCostPcLoc)) }],
  actRatePc: [{ header: 'Actual rate / pc', dp: 4, width: 14, cost: true, get: (c) => leafOnly(c, (r) => nz(r.ActRatePc)) }],
  actRatePcInr: [{ header: 'Actual rate / pc INR', dp: 4, curr: 'INR', width: 14, cost: true, get: (c) => leafOnly(c, (r) => nz(r.ActRatePcInr)) }],
  budAmt: [{ header: 'Budget source amount', dp: 4, width: 14, cost: true, get: (c) => leafOnly(c, (r) => nz(r.BudSrcamt)) }],
  bomSrc: [{ header: 'BOM source', width: 12, get: (c) => line(c, (r) => (r.BomSrc ? `${r.BomSrc}${r.BomPlant ? ` ${r.BomPlant}` : ''}` : '')) }],
  donor: [{ header: 'Donor', width: 8, get: (c) => line(c, (r) => r.Donor) }],
  matkl: [{ header: 'Mat. group', width: 10, get: (c) => line(c, (r) => r.Matkl) }],
  mtart: [{ header: 'Type', width: 7, get: (c) => line(c, (r) => r.Mtart) }],
  compOgrp: [{ header: 'Comp. origin group', width: 12, get: (c) => line(c, (r) => r.CompOgrp) }],
  skusize: [{ header: 'SKU size', width: 10, get: (c) => line(c, (r) => r.Zskusize) }],
  rmTot: [{ header: 'RM total INR', dp: 2, curr: 'INR', width: 16, get: (c) => (c.n.kind === 'header' ? fix(c.cat.rm[c.i], 2) : null) }],
  rmPc: [{ header: 'RM / unit INR', dp: 4, curr: 'INR', width: 14, get: (c) => catPer(c, c.cat.rm) }],
  pmTot: [{ header: 'PM total INR', dp: 2, curr: 'INR', width: 16, get: (c) => (c.n.kind === 'header' ? fix(c.cat.pm[c.i], 2) : null) }],
  pmPc: [{ header: 'PM / unit INR', dp: 4, curr: 'INR', width: 14, get: (c) => catPer(c, c.cat.pm) }],
  perfTot: [{ header: 'Perfume total INR', dp: 2, curr: 'INR', width: 16, get: (c) => (c.n.kind === 'header' ? fix(c.cat.perf[c.i], 2) : null) }],
  perfPc: [{ header: 'Perfume / unit INR', dp: 4, curr: 'INR', width: 14, get: (c) => catPer(c, c.cat.perf) }],
};
function catPer(c: Ctx, arr: Decimal[]): number | null {
  if (c.n.kind !== 'header') return null;
  const v = perUnit(arr[c.i], c.explQty);
  return v ? fix(v, 4) : null;
}

const LOCAL_IDS = ['ratePcLoc', 'frtPc', 'totLoc', 'totPcLoc'];
const rowType = (c: Ctx) => (c.n.kind === 'country' ? 'Country' : c.n.kind === 'plant' ? 'Plant' : c.n.kind === 'header' ? 'FG' : c.wip ? 'WIP' : 'Component');

export interface BomTreeSheetInput { tree: CostTree; sim: SimRow[]; simOn: boolean; agg: NodeAggX; colIds: string[]; explQty?: string | null }

/** The tree sheet: the shown columns only, in the order shown, one row per tree node. */
export function bomTreeSheet({ tree, sim, simOn, agg, colIds, explQty }: BomTreeSheetInput): XSheet {
  const cat = categoryTotals(tree);
  const q = explQty ? D(explQty) : null;
  const ids = colIds.filter((id) => TREE_EXPORT[id]);
  const defs: Def[] = [
    { header: 'Row', width: 11, get: (c) => rowType(c) },
    { header: 'Plant', width: 8, get: (c) => (c.n.kind === 'country' ? '' : tree.rows[c.n.start]?.Hwerks ?? '') },
    { header: 'FG', width: 14, get: (c) => (c.n.kind === 'country' || c.n.kind === 'plant' ? '' : tree.rows[c.n.start]?.Headmat ?? '') },
    { header: 'Structure', width: 34, get: (c) => `${'  '.repeat(c.n.depth)}${c.n.kind === 'country' ? c.n.sub : c.n.label}` },
    { header: 'Description', width: 30, get: (c) => (c.n.kind === 'country' ? c.n.label : c.n.sub) },
    ...ids.flatMap((id) => TREE_EXPORT[id]),
  ];
  if (ids.some((id) => LOCAL_IDS.includes(id))) defs.push({ header: 'Local currency', width: 8, get: (c) => tree.rows[c.n.start]?.LocCurr ?? '' });
  if (ids.some((id) => id === 'frtPc' || id === 'frtPcInr')) defs.push({ header: 'Freight added', width: 20, cost: true, get: (c) => leafOnly(c, (r) => (frtTagged(r).FrtIncluded ? 'No (included in rate)' : 'Yes')) });
  if (simOn) {
    defs.push({
      header: 'Simulated INR', dp: 2, curr: 'INR', width: 16, cost: true,
      get: (c) => (c.r ? leafOnly(c, (_r, s) => fix(s.total, 2)) : agg.sim ? fix(agg.sim[c.i], 2) : null),
    });
  }
  const ctxOf = (i: number): Ctx => {
    const n = tree.nodes[i];
    const r = n.kind === 'line' ? tree.rows[n.row] : null;
    const leaf = !!r && tree.isLeaf[n.row];
    return { tree, sim, simOn, agg, cat, explQty: q, n, i, r, s: r ? sim[n.row] : null, leaf, wip: !!r && isWipLine(r, leaf) };
  };
  const cols: XCol[] = defs.map((d) => ({
    header: d.header, width: d.width, dp: d.dp, curr: d.curr,
    get: (i: number) => { const c = ctxOf(i); return d.cost && c.wip ? null : d.get(c); },
  }));
  return { name: 'BOM tree', cols, count: tree.nodes.length };
}

export interface ExportTreeInput extends BomTreeSheetInput { fmt: 'xlsx' | 'csv'; query: CostQuery; settings: SimSettings; messages: SapMessage[] }

/** BOM costing > Excel / CSV: the tree sheet (shown columns), the Rate options sheet and Parameters. */
export async function exportBomTree(x: ExportTreeInput) {
  const sheet = bomTreeSheet(x);
  const { extra, options } = costLineSheets({ query: x.query, rows: x.tree.rows, sim: x.sim, settings: x.settings });
  const notes: [string, string][] = [
    ['Rows', `${sheet.count} tree rows (country, plant, FG and component rows)`],
    ['Columns', `the BOM tree columns shown on screen at the time of export (${x.colIds.length})`],
    ['WIP lines', 'a component with a sub-tree, or of type HALB: all cost columns are blank; its components carry the cost'],
    ['RM / PM / Perfume', 'FG rows: leaf cost by ROH (not group 106) = RM, PKGN and VERP = PM, ROH group 106 = Perfume; per unit = total / explosion quantity'],
    ...extra.filter(([k]) => k !== 'Rows'),
  ];
  await exportTable({ fmt: x.fmt, name: sheet.name, query: x.query, cols: sheet.cols, count: sheet.count, extraParams: notes, messages: x.messages, extraSheets: x.fmt === 'xlsx' && options.count ? [options] : [] });
}
