// Export helpers standing in for the source Fiori app's two export APIs:
//  - sap.ui.core.util.Export + ExportTypeCSV({ separatorChar: "\t", mimeType:
//    "application/vnd.ms-excel", charset: "utf-8", fileExtension: "xls" }) — a tab-separated text
//    file with an .xls extension (what AuditStatus, CheckList, DraftReport and MISReport do).
//  - sap.ui.export.Spreadsheet — a real .xlsx workbook (CheckList), via the xlsx package.
import * as XLSX from 'xlsx';
import { downloadBlob } from './files';

export interface ExportColumn<T> {
  name: string;
  value: (row: T) => unknown;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
  }
  return String(v);
}

/** ExportTypeCSV semantics: values containing the separator, quotes or newlines are quoted. */
function csvEscape(s: string, sep: string): string {
  if (s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportTabSeparatedXls<T>(rows: T[], columns: ExportColumn<T>[], fileName: string) {
  const sep = '\t';
  const lines = [columns.map((c) => csvEscape(c.name, sep)).join(sep)];
  for (const r of rows) lines.push(columns.map((c) => csvEscape(cellText(c.value(r)), sep)).join(sep));
  // BOM so Excel reads UTF-8 correctly, same as ExportTypeCSV's byteOrderMark default for utf-8.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'application/vnd.ms-excel;charset=utf-8' });
  downloadBlob(blob, fileName.endsWith('.xls') ? fileName : `${fileName}.xls`);
}

export function exportXlsx<T>(rows: T[], columns: ExportColumn<T>[], fileName: string, sheetName = 'Sheet1') {
  const data = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of columns) {
      const v = c.value(r);
      o[c.name] = v instanceof Date ? cellText(v) : v ?? '';
    }
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.name) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
