'use client';
/** Excel export of the Plant production summary: Finished goods, Cost mix, Components, Monthly trend, Parameters. Only what has been
 * loaded is exported; the sheets say which figures are SAP per-unit values x quantity produced. */
import type { XCol } from '../client/export';
import { downloadWacWorkbook, type WacSheet } from '../wac/export';
import { COST_LABEL, sharePct, type CompAgg, type CostMixPart, type FgValue, type MonthPoint, type PlantTotals } from './view';
import type Decimal from 'decimal.js';

const n = (v: Decimal | null | undefined, dp = 6) => (v ? Number(v.toFixed(dp)) : null);
const sheet = (name: string, count: number, cols: XCol[]): WacSheet => ({ name, cols, count });

export function fgSheet(vals: FgValue[], totals: PlantTotals): WacSheet {
  return sheet('Finished goods', vals.length, [
    { header: 'Finished good', width: 14, get: (i) => vals[i].row.Matnr },
    { header: 'Description', width: 36, get: (i) => vals[i].row.Maktx },
    { header: 'Plant', width: 8, get: (i) => vals[i].row.Werks },
    { header: 'Brand', width: 10, get: (i) => vals[i].row.Zbrand },
    { header: 'Product', width: 16, get: (i) => vals[i].row.Prodha },
    { header: 'Uom', width: 7, get: (i) => vals[i].row.Uom },
    { header: 'Quantity produced', dp: 3, width: 16, get: (i) => n(vals[i].qty) },
    { header: 'Documents', width: 10, get: (i) => vals[i].row.Docs },
    { header: 'Batches', width: 9, get: (i) => vals[i].row.Batches },
    { header: 'Actual landed / unit', dp: 4, curr: 'INR', width: 16, get: (i) => n(vals[i].qty.isZero() ? null : vals[i].landed.div(vals[i].qty), 6) },
    { header: 'RM value', dp: 2, curr: 'INR', width: 16, get: (i) => n(vals[i].rm) },
    { header: 'PM value', dp: 2, curr: 'INR', width: 16, get: (i) => n(vals[i].pm) },
    { header: 'Perfume value', dp: 2, curr: 'INR', width: 16, get: (i) => n(vals[i].perf) },
    { header: 'Conversion value', dp: 2, curr: 'INR', width: 16, get: (i) => n(vals[i].conv) },
    { header: 'Total value (landed)', dp: 2, curr: 'INR', width: 18, get: (i) => n(vals[i].landed) },
    { header: 'Share of plant value %', dp: 2, width: 14, get: (i) => n(sharePct(vals[i].landed, totals.landed), 4) },
  ]);
}

export function mixSheet(mix: CostMixPart[]): WacSheet {
  return sheet('Cost mix', mix.length, [
    { header: 'Cost part', width: 26, get: (i) => mix[i].label },
    { header: 'Value', dp: 2, curr: 'INR', width: 18, get: (i) => n(mix[i].value) },
    { header: 'Share %', dp: 2, width: 10, get: (i) => n(mix[i].pct, 4) },
  ]);
}

export function componentSheet(rows: CompAgg[]): WacSheet {
  return sheet('Components', rows.length, [
    { header: 'Component', width: 14, get: (i) => rows[i].idnrk },
    { header: 'Description', width: 36, get: (i) => rows[i].text },
    { header: 'Group', width: 8, get: (i) => rows[i].grp },
    { header: 'Uom', width: 7, get: (i) => rows[i].uom },
    { header: 'Quantity consumed', dp: 3, width: 18, get: (i) => n(rows[i].qty) },
    { header: 'Cost at selected rate', dp: 2, curr: 'INR', width: 20, get: (i) => n(rows[i].cost) },
    { header: 'Average rate', dp: 4, curr: 'INR', width: 14, get: (i) => n(rows[i].avgRate) },
    { header: 'Used in finished goods', width: 14, get: (i) => rows[i].fgs },
    { header: 'Share of component cost %', dp: 2, width: 14, get: (i) => n(rows[i].sharePct, 4) },
    { header: 'Rows with no cost from SAP', width: 14, get: (i) => rows[i].noCostFgs },
  ]);
}

export function trendSheet(pts: MonthPoint[]): WacSheet {
  return sheet('Monthly trend', pts.length, [
    { header: 'Month', width: 12, get: (i) => pts[i].label },
    { header: 'Finished goods produced', width: 14, get: (i) => pts[i].fgs },
    { header: 'Quantity (by unit)', width: 26, get: (i) => pts[i].qtyByUom.map((q) => `${q.qty.toFixed(0)} ${q.uom}`).join(' · ') },
    { header: 'RM value', dp: 2, curr: 'INR', width: 16, get: (i) => n(pts[i].rm) },
    { header: 'PM value', dp: 2, curr: 'INR', width: 16, get: (i) => n(pts[i].pm) },
    { header: 'Perfume value', dp: 2, curr: 'INR', width: 16, get: (i) => n(pts[i].perf) },
    { header: 'Conversion value', dp: 2, curr: 'INR', width: 16, get: (i) => n(pts[i].conv) },
    { header: 'Total value (landed)', dp: 2, curr: 'INR', width: 18, get: (i) => n(pts[i].landed) },
  ]);
}

export const downloadPsum = (sheets: WacSheet[], params: [string, string][]) => downloadWacWorkbook(sheets, params, 'plant-production-summary');
export { COST_LABEL };
