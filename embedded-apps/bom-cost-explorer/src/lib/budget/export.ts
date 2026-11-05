'use client';
/** Excel export of Budget costing: Summary (the columns on screen), Split (when loaded), Checklist, Parameters. exceljs loads on demand; text cells go through sanitizeCell. */
import type { XCol } from '../client/export';
import { downloadWacWorkbook, type WacSheet } from '../wac/export';
import { D } from '../cost/decimal';
import { COUNTRY_LABEL, COUNTRY_TABLE, BUSINESS_LABEL, SOURCE_LABEL, overridesParam, type BudgetQuery } from './filter';
import { issuesOf, type Col } from './view';
import type { BudgetCheckRow, BudgetPendingDetRow, BudgetPendingRow, BudgetSplitRow, BudgetSummaryRow } from './types';

const num = (v: string | undefined, dp: number): number | null => { if (v === undefined || v === '') return null; const d = D(v); return d.isFinite() ? Number(d.toFixed(dp)) : null; };

export function summarySheet(rows: BudgetSummaryRow[], cols: Col<BudgetSummaryRow>[]): WacSheet {
  const x: XCol[] = cols.map((c) => ({
    header: c.label, width: c.width ? Math.round(c.width / 7) : c.kind === 'd' ? 14 : 12, dp: c.kind === 'd' ? c.dp ?? 4 : undefined,
    get: (i) => { const v = (rows[i] as unknown as Record<string, unknown>)[c.key]; return c.kind === 'd' ? num(v as string, c.dp ?? 4) : c.kind === 'f' ? (v ? 'X' : '') : c.kind === 't' ? (v as string | null) ?? '' : String(v ?? ''); },
  }));
  x.push({ header: 'Checklist issues', width: 40, get: (i) => issuesOf(rows[i]).join('; ') });
  return { name: 'Summary', cols: x, count: rows.length };
}
export function splitSheet(rows: BudgetSplitRow[], title = 'Split'): WacSheet {
  const t = (h: string, k: keyof BudgetSplitRow, w = 12): XCol => ({ header: h, width: w, get: (i) => String(rows[i][k] ?? '') });
  const n = (h: string, k: keyof BudgetSplitRow, dp = 4): XCol => ({ header: h, dp, width: 14, get: (i) => num(rows[i][k] as string, dp) });
  return { name: title, count: rows.length, cols: [
    t('FG', 'Matnr', 12), t('Plant', 'Werks', 7), t('Alt BOM', 'Stlal', 7), { header: 'Level', width: 6, get: (i) => rows[i].Stufe }, t('Component', 'ItemCode', 14), t('Component desc.', 'ItemDesc', 34), t('Type', 'Mtart', 7), t('Origin', 'Hrkft', 8), t('C/T', 'Erskz', 5),
    n('Qty incl. scrap', 'Menge', 6), t('Unit', 'Meins', 6), n('Price unit', 'Epein', 0), t('Base unit', 'MeinsFg', 7), n('B-Net landed', 'Total', 4), n('Proj net landed', 'PTotal', 4), n('Act net landed', 'ATotal', 4),
    n('B-Cost / pc', 'CostPerpc1', 4), n('Proj cost / pc', 'PCostPerpc1', 4), n('Act cost / pc', 'ACostPerpc1', 4), n('B-Cost / 1000', 'CostPer1000', 3), n('Info-record rate (info only)', 'LastRate', 4),
    n('Machine', 'Machine'), n('Labour', 'Labour'), n('Power', 'Power'), n('Steam', 'Steam'), n('3P conv.', 'Labour3p'), t('Vendor', 'Name1', 24),
    { header: 'Checklist issues', width: 40, get: (i) => issuesOf(rows[i]).join('; ') },
  ] };
}
export function checkSheet(rows: BudgetCheckRow[]): WacSheet {
  const f = (h: string, k: 'AllBomIn' | 'AllPverIn' | 'MulUnlock' | 'MulBom' | 'MulProd'): XCol => ({ header: h, width: 16, get: (i) => (rows[i][k] ? 'X' : '') });
  return { name: 'Checklist', count: rows.length, cols: [
    { header: 'Material', width: 14, get: (i) => rows[i].Matnr }, { header: 'Description', width: 36, get: (i) => rows[i].Maktx }, { header: 'Type', width: 7, get: (i) => rows[i].Mtart }, { header: 'Plant', width: 7, get: (i) => rows[i].Werks },
    f('All BoM inactive', 'AllBomIn'), f('All PVer inactive', 'AllPverIn'), f('Multiple BoM active', 'MulBom'), f('Multiple PVer unlocked', 'MulUnlock'), f('Alt. BoM issue', 'MulProd'),
  ] };
}
export function pendingSheet(rows: BudgetPendingRow[]): WacSheet {
  const t = (h: string, k: keyof BudgetPendingRow, w = 12): XCol => ({ header: h, width: w, get: (i) => String(rows[i][k] ?? '') });
  const n = (h: string, k: keyof BudgetPendingRow, dp = 4): XCol => ({ header: h, dp, width: 14, get: (i) => num(rows[i][k] as string, dp) });
  return { name: 'Pending', count: rows.length, cols: [
    t('Year', 'Gjahr', 6), t('Version', 'Version', 8), t('Status', 'Status', 7), t('Material', 'Matnr', 14), t('Description', 'Maktx', 34), t('Plant', 'Werks', 7), t('Scheme', 'Zscheme', 8), t('Business', 'Zbusiness', 9), t('CRS SKU', 'Zskugrcodecrs', 16),
    n('B-RM / pc', 'RmCost'), n('B-PM / pc', 'PmCost'), n('B-Perfume / pc', 'PerfumeCost'), n('Budget mat. / pc', 'CostPc'), n('Proj / pc', 'PcostPc'), n('Actual / pc', 'AcostPc'), n('Info-record rate / pc (info only)', 'LRate'),
    n('Machine', 'Machine'), n('Labour', 'Labour'), n('Power', 'Power'), n('Steam', 'Steam'), n('3P labour', 'Labour3p'), t('Initiated by', 'InitiatedBy', 18), t('Initiated on', 'InitiatedOn', 12), t('Remarks', 'Remarks', 30),
  ] };
}
export function pendingDetSheet(rows: BudgetPendingDetRow[]): WacSheet {
  const t = (h: string, k: keyof BudgetPendingDetRow, w = 12): XCol => ({ header: h, width: w, get: (i) => String(rows[i][k] ?? '') });
  const n = (h: string, k: keyof BudgetPendingDetRow, dp = 4): XCol => ({ header: h, dp, width: 14, get: (i) => num(rows[i][k] as string, dp) });
  return { name: 'Detail', count: rows.length, cols: [t('FG', 'Matnr', 12), t('Plant', 'Werks', 7), t('Component', 'Idnrk', 14), t('Desc.', 'ItemDesc', 30), t('Type', 'Mtart', 7), t('Origin', 'Hrkft', 8), n('Qty', 'Menge', 6), t('Unit', 'Meins', 6),
    n('B-Cost / pc', 'CostPc'), n('Proj / pc', 'PcostPc'), n('Act / pc', 'AcostPc'), n('Info-record rate (info only)', 'LRate'), n('Machine', 'Machine'), n('Labour', 'Labour'), n('Power', 'Power'), n('Steam', 'Steam')] };
}

export function paramsOf(q: BudgetQuery, extra: [string, string][] = []): [string, string][] {
  return [
    ['Posting date', `${q.budatFrom} to ${q.budatTo || '-'}`], ['Plants', q.plants.join(', ')], ['Materials', q.materials.join(', ') || 'all'], ['Material types', q.mtart.join(', ')], ['Plan', q.plans.join(', ') || '-'], ['Scheme', q.schemes.join(', ') || '-'],
    ['Budgeted year', q.budgetYr], ['Activity rate year', q.rateYr], ['UoM', q.uom || '-'], ['FG source', SOURCE_LABEL[q.source]], ['Component rate table', COUNTRY_TABLE[q.country]], ['Business line', q.exclDiv ? 'All (exclude division)' : q.business ? BUSINESS_LABEL[q.business] : '-'], ['Country', COUNTRY_LABEL[q.country]],
    ['Remove manufactured WIP / FRT2', q.exclManuf ? 'yes' : 'no'], ['Only FGs with cost override', q.onlyOverrides ? 'yes' : 'no'], ['One FG per CRS SKU', q.oneSkuPerCrs ? 'yes' : 'no'], ['Direct purchase products', q.inclDirect ? 'yes' : 'no'], ['BOM at 10 x base qty', q.bomQtyX10 ? 'yes' : 'no'],
    ['Cost overrides', overridesParam(q.overrides) || '-'], ...extra,
  ];
}
export const downloadBudget = (sheets: WacSheet[], params: [string, string][], base = 'budget-cost') => downloadWacWorkbook(sheets, params, base);
