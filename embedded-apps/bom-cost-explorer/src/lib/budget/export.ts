'use client';
/** Excel export of Budget costing: Summary (the columns on screen), Split (when loaded), Checklist, Parameters. exceljs loads on demand; text cells go through sanitizeCell. */
import type { XCol } from '../client/export';
import { downloadWacWorkbook, type WacSheet } from '../wac/export';
import { D } from '../cost/decimal';
import { COUNTRY_LABEL, COUNTRY_TABLE, BUSINESS_LABEL, SOURCE_LABEL, overridesParam, type BudgetQuery } from './filter';
import { BUCKET_LABEL, SPLIT_BUCKETS, bucketOf, calcValue, groupedSplitRows, isCalcKey, issuesOf, splitTotals, type Col, type FgRates } from './view';
import { peekRateBasis, type RateBasisComp } from './rateBasis';
import type { BudgetCheckRow, BudgetPendingDetRow, BudgetPendingRow, BudgetSplitRow, BudgetSummaryRow } from './types';

const num = (v: string | undefined, dp: number): number | null => { if (v === undefined || v === '') return null; const d = D(v); return d.isFinite() ? Number(d.toFixed(dp)) : null; };

export function summarySheet(rows: BudgetSummaryRow[], cols: Col<BudgetSummaryRow>[], ratesOf?: (r: BudgetSummaryRow) => FgRates | undefined): WacSheet {
  const x: XCol[] = cols.map((c) => {
    const base = { header: c.label, width: c.width ? Math.round(c.width / 7) : c.kind === 'd' ? 14 : 12 };
    if (isCalcKey(c.key)) {
      if (c.key === '_issues') return { ...base, header: 'Checklist issues', width: 40, get: (i: number) => issuesOf(rows[i]).join('; ') };
      return { ...base, dp: c.dp ?? 4, get: (i: number) => { const v = calcValue(c.key, rows[i], ratesOf?.(rows[i])); return v && v.isFinite() ? Number(v.toFixed(c.dp ?? 4)) : null; } };
    }
    return { ...base, dp: c.kind === 'd' ? c.dp ?? 4 : undefined, get: (i: number) => { const v = (rows[i] as unknown as Record<string, unknown>)[c.key]; return c.kind === 'd' ? num(v as string, c.dp ?? 4) : c.kind === 'f' ? (v ? 'X' : '') : c.kind === 't' ? (v as string | null) ?? '' : String(v ?? ''); } };
  });
  return { name: 'Summary', cols: x, count: rows.length };
}
type CompRate = Pick<RateBasisComp, 'selectedPc' | 'cmapPc'>;
/** One finished good with its split, for the combined export. `split` is null when the split could not be loaded. */
export interface FgSplit { fg: BudgetSummaryRow; split: BudgetSplitRow[] | null }

export function splitSheet(rowsIn: BudgetSplitRow[], title = 'Split', descOf?: (r: BudgetSplitRow) => string, compOf?: (r: BudgetSplitRow) => CompRate | undefined): WacSheet {
  const rows = groupedSplitRows(rowsIn);
  const grp = (i: number) => BUCKET_LABEL[bucketOf(rows[i])];
  const t = (h: string, k: keyof BudgetSplitRow, w = 12): XCol => ({ header: h, width: w, get: (i) => String(rows[i][k] ?? '') });
  const n = (h: string, k: keyof BudgetSplitRow, dp = 4): XCol => ({ header: h, dp, width: 14, get: (i) => num(rows[i][k] as string, dp) });
  return { name: title, count: rows.length, cols: [
    t('FG', 'Matnr', 12), ...(descOf ? [{ header: 'FG description', width: 34, get: (i: number) => descOf(rows[i]) }] : []), t('Plant', 'Werks', 7), t('Alt BOM', 'Stlal', 7), { header: 'Group (RM / Perfume / PM)', width: 14, get: grp }, { header: 'Level', width: 6, get: (i) => rows[i].Stufe }, t('Component', 'ItemCode', 14), t('Component desc.', 'ItemDesc', 34), t('Type', 'Mtart', 7), t('Origin', 'Hrkft', 8), t('C/T', 'Erskz', 5),
    n('Qty incl. scrap', 'Menge', 6), t('Unit', 'Meins', 6), n('Price unit', 'Epein', 0), t('Base unit', 'MeinsFg', 7), n('B-Net landed', 'Total', 4), n('Proj net landed', 'PTotal', 4), n('Act net landed', 'ATotal', 4),
    n('B-Cost / pc', 'CostPerpc1', 4), n('Proj cost / pc', 'PCostPerpc1', 4), n('Act cost / pc', 'ACostPerpc1', 4), ...(compOf ? [{ header: 'Selected rate / pc', dp: 4, width: 15, get: (i: number) => { const v = compOf(rows[i])?.selectedPc; return v ? Number(v.toFixed(4)) : null; } }, { header: 'C-Map / pc', dp: 4, width: 15, get: (i: number) => { const v = compOf(rows[i])?.cmapPc; return v ? Number(v.toFixed(4)) : null; } }] : []), n('B-Cost / 1000', 'CostPer1000', 3), n('Info-record rate (info only)', 'LastRate', 4),
    n('Machine', 'Machine'), n('Labour', 'Labour'), n('Power', 'Power'), n('Steam', 'Steam'), n('3P conv.', 'Labour3p'), t('Vendor', 'Name1', 24),
    { header: 'Checklist issues', width: 40, get: (i) => issuesOf(rows[i]).join('; ') },
  ] };
}
/** All splits of the run in one flat sheet (filterable by FG, group or component), each line carrying its FG description. */
export function splitAllSheet(items: FgSplit[]): WacSheet {
  const rows = items.flatMap((x) => x.split ?? []);
  const desc = new Map(items.map((x) => [`${x.fg.Matnr}|${x.fg.Werks}`, x.fg.Maktx]));
  const any = items.some((x) => peekRateBasis(x.fg.Matnr, x.fg.Werks));
  return splitSheet(rows, 'Split', (r) => desc.get(`${r.Matnr}|${r.Werks}`) ?? '', any ? (r) => peekRateBasis(r.Matnr, r.Werks)?.comps.get(r.ItemCode) : undefined);
}

const TIE = 0.0005;
/** Header vs split per FG: the split groups added up against the header B-RM / B-PM / B-Perfume / B-cost per pc, with the difference, so a header that does not tally is visible at once. */
export function tieOutSheet(items: FgSplit[]): WacSheet {
  const calc = items.map(({ fg, split }) => {
    const sum = { RM: D(0), PERF: D(0), PM: D(0) };
    for (const r of split ?? []) sum[bucketOf(r)] = sum[bucketOf(r)].plus(D(r.CostPerpc1));
    const head = { RM: D(fg.RmCost), PERF: D(fg.PerfumeCost), PM: D(fg.PmCost) };
    const total = splitTotals(split ?? []).budget;
    const bad = !split ? 'Split not loaded' : SPLIT_BUCKETS.some((b) => head[b].minus(sum[b]).abs().gt(TIE)) ? 'Does not tally' : 'Tallies';
    return { fg, split, sum, head, total, bad };
  });
  const dp = 4;
  const fix = (v: { toFixed: (n: number) => string }) => Number(v.toFixed(dp));
  const cols: XCol[] = [
    { header: 'FG', width: 12, get: (i) => calc[i].fg.Matnr }, { header: 'FG description', width: 34, get: (i) => calc[i].fg.Maktx }, { header: 'Plant', width: 7, get: (i) => calc[i].fg.Werks },
    { header: 'Components', width: 11, get: (i) => calc[i].split?.length ?? '' },
  ];
  for (const b of SPLIT_BUCKETS) {
    const L = BUCKET_LABEL[b];
    cols.push(
      { header: `Header B-${L} / pc`, dp, width: 15, get: (i) => fix(calc[i].head[b]) },
      { header: `Split ${L} total / pc`, dp, width: 15, get: (i) => (calc[i].split ? fix(calc[i].sum[b]) : '') },
      { header: `${L} difference`, dp, width: 13, get: (i) => (calc[i].split ? fix(calc[i].head[b].minus(calc[i].sum[b])) : '') },
    );
  }
  cols.push(
    { header: 'Header B-Cost / pc', dp, width: 15, get: (i) => num(calc[i].fg.CostPerpc1, dp) },
    { header: 'Split B-Cost total / pc', dp, width: 16, get: (i) => (calc[i].split ? fix(calc[i].total) : '') },
    { header: 'Status', width: 16, get: (i) => calc[i].bad },
  );
  if (items.some((x) => peekRateBasis(x.fg.Matnr, x.fg.Werks))) {
    const rb = (i: number) => peekRateBasis(calc[i].fg.Matnr, calc[i].fg.Werks);
    cols.push(
      { header: 'Selected rate / pc', dp, width: 16, get: (i) => { const b = rb(i); return b ? fix(b.selected) : ''; } },
      { header: 'C-Map / pc', dp, width: 14, get: (i) => { const b = rb(i); return b ? fix(b.cmap) : ''; } },
    );
  }
  return { name: 'Header vs split', cols, count: calc.length };
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
