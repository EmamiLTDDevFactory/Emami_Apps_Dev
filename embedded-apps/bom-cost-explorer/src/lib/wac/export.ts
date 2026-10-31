'use client';
/** Excel export of the Actual vs rate sources screen: Summary, Comparison, Components, Documents, Parameters. Only what has
 * been loaded is exported. exceljs is loaded on demand. Text cells go through sanitizeCell (formula injection guard). */
import type { XCol } from '../client/export';
import { sanitizeCell } from '../client/spreadsheetSafe';
import { GROUP_LABEL, dec, selectionTotal } from './view';
import type { WacCompRow, WacCompareRow, WacDocRow, WacRow } from './types';

export interface WacSheet { name: string; cols: XCol[]; count: number }
const n = (v: string) => { const d = dec(v); return d ? Number(d.toFixed(6)) : null; };

export function summarySheet(rows: WacRow[], showTotal: boolean): WacSheet {
  const total = showTotal ? selectionTotal(rows) : null;
  const count = rows.length + (total ? 1 : 0);
  const at = <T,>(i: number, f: (r: WacRow) => T, tot?: T): T | null => (i < rows.length ? f(rows[i]) : tot ?? null);
  const cols: XCol[] = [
    { header: 'Finished good', width: 14, get: (i) => at(i, (r) => r.Matnr, 'Selection total (weighted by quantity)') },
    { header: 'Description', width: 36, get: (i) => at(i, (r) => r.Maktx, '') },
    { header: 'Plant', width: 8, get: (i) => at(i, (r) => r.Werks, '') },
    { header: 'Brand', width: 10, get: (i) => at(i, (r) => r.Zbrand, '') },
    { header: 'Product', width: 16, get: (i) => at(i, (r) => r.Prodha, '') },
    { header: 'CRS', width: 30, get: (i) => at(i, (r) => [r.Zskugrcodecrs, r.Zskugroupcrs].filter(Boolean).join(' - '), '') },
    { header: 'Uom', width: 7, get: (i) => at(i, (r) => r.Uom, total?.uom ?? '') },
    { header: 'Quantity', dp: 3, width: 14, get: (i) => at(i, (r) => n(r.Qty), total ? n(total.qty) : null) },
    { header: 'Documents', width: 10, get: (i) => at(i, (r) => r.Docs) },
    { header: 'Batches', width: 9, get: (i) => at(i, (r) => r.Batches) },
    { header: 'Actual RM / unit', dp: 4, curr: 'INR', width: 14, get: (i) => at(i, (r) => n(r.ActRm), total ? n(total.rm) : null) },
    { header: 'Actual PM / unit', dp: 4, curr: 'INR', width: 14, get: (i) => at(i, (r) => n(r.ActPm), total ? n(total.pm) : null) },
    { header: 'Actual Perfume / unit', dp: 4, curr: 'INR', width: 16, get: (i) => at(i, (r) => n(r.ActPerf), total ? n(total.perf) : null) },
    { header: 'Actual Material / unit', dp: 4, curr: 'INR', width: 16, get: (i) => at(i, (r) => n(r.ActMat), total ? n(total.mat) : null) },
    { header: 'Actual Conversion / unit', dp: 4, curr: 'INR', width: 17, get: (i) => at(i, (r) => n(r.ActConv), total ? n(total.conv) : null) },
    { header: 'Actual Landed / unit', dp: 4, curr: 'INR', width: 16, get: (i) => at(i, (r) => n(r.ActLanded), total ? n(total.landed) : null) },
    { header: 'Recon (landed - material - conversion)', dp: 4, curr: 'INR', width: 20, get: (i) => at(i, (r) => n(r.ActRecon)) },
    { header: 'Var % vs Selected', dp: 2, width: 12, get: (i) => at(i, (r) => n(r.VarpSel)) },
    { header: 'Flag Selected', width: 9, get: (i) => at(i, (r) => r.FlagSel) },
    { header: 'Var % vs C-MAP', dp: 2, width: 12, get: (i) => at(i, (r) => n(r.VarpCmap)) },
    { header: 'Flag C-MAP', width: 9, get: (i) => at(i, (r) => r.FlagCmap) },
    { header: 'Var % vs Consumption', dp: 2, width: 14, get: (i) => at(i, (r) => n(r.VarpCon)) },
    { header: 'Flag Consumption', width: 11, get: (i) => at(i, (r) => r.FlagCon) },
    { header: 'Var % vs Average', dp: 2, width: 12, get: (i) => at(i, (r) => n(r.VarpAvg)) },
    { header: 'Flag Average', width: 10, get: (i) => at(i, (r) => r.FlagAvg) },
    { header: 'Status', width: 8, get: (i) => at(i, (r) => r.Status) },
    { header: 'SAP message', width: 40, get: (i) => at(i, (r) => r.Msg, '') },
  ];
  return { name: 'Summary', cols, count };
}

export function comparisonSheet(rows: WacCompareRow[]): WacSheet {
  const cols: XCol[] = [
    { header: 'Finished good', width: 14, get: (i) => rows[i].Matnr }, { header: 'Description', width: 36, get: (i) => rows[i].Maktx },
    { header: 'Plant', width: 8, get: (i) => rows[i].Werks }, { header: 'Group', width: 14, get: (i) => GROUP_LABEL[rows[i].Grp] ?? rows[i].Grp },
    { header: 'Source', width: 9, get: (i) => rows[i].Src },
    { header: 'Actual / unit', dp: 4, curr: 'INR', width: 13, get: (i) => n(rows[i].ActPu) }, { header: 'Source / unit', dp: 4, curr: 'INR', width: 13, get: (i) => n(rows[i].SrcPu) },
    { header: 'Variance', dp: 4, curr: 'INR', width: 12, get: (i) => n(rows[i].VarAbs) }, { header: 'Variance %', dp: 2, width: 11, get: (i) => n(rows[i].VarPct) },
    { header: 'Flag', width: 6, get: (i) => rows[i].Flag }, { header: 'Direction (+ actual above)', width: 12, get: (i) => rows[i].Dir },
    { header: 'Components', width: 11, get: (i) => rows[i].NComp }, { header: 'With a rate', width: 11, get: (i) => rows[i].NRated }, { header: 'Coverage %', dp: 1, width: 11, get: (i) => n(rows[i].CoverPct) },
  ];
  return { name: 'Comparison', cols, count: rows.length };
}

export function componentsSheet(rows: WacCompRow[]): WacSheet {
  const cols: XCol[] = [
    { header: 'Finished good', width: 14, get: (i) => rows[i].Matnr }, { header: 'Plant', width: 8, get: (i) => rows[i].Werks },
    { header: 'Component', width: 14, get: (i) => rows[i].Idnrk }, { header: 'Description', width: 34, get: (i) => rows[i].CompTxt },
    { header: 'Group', width: 8, get: (i) => rows[i].Grp }, { header: 'Material type', width: 10, get: (i) => rows[i].Mtart }, { header: 'Selected source', width: 12, get: (i) => rows[i].SrcSel },
    { header: 'Uom', width: 7, get: (i) => rows[i].Uom }, { header: 'Qty / unit', dp: 6, width: 11, get: (i) => n(rows[i].QtyPu) },
    { header: 'Rate Selected', dp: 6, curr: 'INR', width: 13, get: (i) => n(rows[i].RateSel) }, { header: 'Rate C-MAP', dp: 6, curr: 'INR', width: 12, get: (i) => n(rows[i].RateCmap) },
    { header: 'Rate Consumption', dp: 6, curr: 'INR', width: 15, get: (i) => n(rows[i].RateCon) }, { header: 'Rate Average', dp: 6, curr: 'INR', width: 13, get: (i) => n(rows[i].RateAvg) },
    { header: 'Cost Selected / unit', dp: 6, curr: 'INR', width: 16, get: (i) => n(rows[i].CostSel) }, { header: 'Cost C-MAP / unit', dp: 6, curr: 'INR', width: 15, get: (i) => n(rows[i].CostCmap) },
    { header: 'Cost Consumption / unit', dp: 6, curr: 'INR', width: 18, get: (i) => n(rows[i].CostCon) }, { header: 'Cost Average / unit', dp: 6, curr: 'INR', width: 16, get: (i) => n(rows[i].CostAvg) },
    { header: 'Var % C-MAP vs Selected', dp: 2, width: 14, get: (i) => n(rows[i].VarpCmap) }, { header: 'Var % Consumption vs Selected', dp: 2, width: 16, get: (i) => n(rows[i].VarpCon) },
    { header: 'Var % Average vs Selected', dp: 2, width: 15, get: (i) => n(rows[i].VarpAvg) }, { header: 'Flag', width: 6, get: (i) => rows[i].Flag },
  ];
  return { name: 'Components', cols, count: rows.length };
}

export function documentsSheet(rows: WacDocRow[]): WacSheet {
  const cols: XCol[] = [
    { header: 'Material document', width: 16, get: (i) => `${rows[i].Mblnr}/${rows[i].Mjahr}` }, { header: 'Plant', width: 8, get: (i) => rows[i].Werks },
    { header: 'Finished good', width: 14, get: (i) => rows[i].Matnr }, { header: 'Posting date', width: 12, get: (i) => rows[i].Budat ?? '' },
    { header: 'Batch', width: 11, get: (i) => rows[i].Charg }, { header: 'Process order', width: 14, get: (i) => rows[i].Aufnr }, { header: 'Via', width: 15, get: (i) => rows[i].Via },
    { header: 'Quantity (negative = reversal)', dp: 3, width: 14, get: (i) => n(rows[i].Qty) }, { header: 'Uom', width: 7, get: (i) => rows[i].Uom },
    { header: 'Currency', width: 9, get: (i) => rows[i].Hwaer }, { header: 'Rate to INR', dp: 6, width: 11, get: (i) => n(rows[i].FxInr) },
    { header: 'RM (INR)', dp: 2, curr: 'INR', width: 13, get: (i) => n(rows[i].Rm) }, { header: 'PM (INR)', dp: 2, curr: 'INR', width: 13, get: (i) => n(rows[i].Pm) },
    { header: 'Perfume (INR)', dp: 2, curr: 'INR', width: 13, get: (i) => n(rows[i].Perf) }, { header: 'Conversion (INR)', dp: 2, curr: 'INR', width: 15, get: (i) => n(rows[i].Conv) },
    { header: 'Landed (INR)', dp: 2, curr: 'INR', width: 13, get: (i) => n(rows[i].Landed) }, { header: 'PO-cost rows', width: 11, get: (i) => rows[i].Rows },
  ];
  return { name: 'Documents', cols, count: rows.length };
}

const INR_FMT = (dp: number) => { const d = dp ? `.${'0'.repeat(dp)}` : ''; return `[>=10000000]##\\,##\\,##\\,##0${d};[>=100000]##\\,##\\,##0${d};##,##0${d}`; };
const numFmt = (dp: number, curr?: string) => (curr === 'INR' ? INR_FMT(dp) : `#,##0${dp ? `.${'0'.repeat(dp)}` : ''}`);
const stamp = () => { const d = new Date(); const p = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

export async function downloadWacWorkbook(sheets: WacSheet[], params: [string, string][], fileBase = 'actual-vs-rate-sources'): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BOM Simulator';
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = s.cols.map((c) => ({ header: c.header, width: c.width ?? Math.max(10, c.header.length + 4) }));
    for (let i = 0; i < s.count; i++) ws.addRow(s.cols.map((c) => sanitizeCell(c.get(i))));
    s.cols.forEach((c, ci) => { if (c.dp !== undefined) ws.getColumn(ci + 1).numFmt = numFmt(c.dp, c.curr); });
    const h = ws.getRow(1);
    h.font = { bold: true };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF4' } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.cols.length } };
  }
  const ps = wb.addWorksheet('Parameters');
  ps.columns = [{ header: 'Parameter', width: 28 }, { header: 'Value', width: 90 }];
  ps.getRow(1).font = { bold: true };
  for (const [k, v] of params) ps.addRow([k, sanitizeCell(v)]);
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `bom-simulator-${fileBase}-${stamp()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
