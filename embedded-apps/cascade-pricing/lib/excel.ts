import * as XLSX from 'xlsx';
import { RATE_COLUMNS, SIM_INPUT_COLUMNS } from './columns';
import type { Column, Row } from './types';

export interface ParseResult {
  rows: Row[];
  errors: string[];
}

export class ExcelParseError extends Error {}

/** dd.mm.yyyy (also d.m.yyyy, dd/mm/yyyy, dd-mm-yyyy), YYYYMMDD, or an Excel date serial -> YYYYMMDD; null when not a real date. */
export function toYmd(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  let y: number, m: number, d: number;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 19000101 && value <= 99991231) return toYmd(String(Math.trunc(value)));
    const dc = XLSX.SSF.parse_date_code(value);
    if (!dc) return null;
    ({ y, m, d } = dc);
  } else {
    const s = String(value).trim();
    const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
    const ymd = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    else if (ymd) [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
    else return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

/** Numeric material numbers are stored with leading zeros (18 digits); alphanumeric ones as typed, upper case. */
export function padMatnr(value: unknown): string {
  const s = String(value ?? '').trim();
  return /^\d+$/.test(s) ? s.padStart(18, '0') : s.toUpperCase();
}

/** Numeric customer numbers are 10 digits with leading zeros. */
export function padKunnr(value: unknown): string {
  const s = String(value ?? '').trim();
  return /^\d+$/.test(s) ? s.padStart(10, '0') : s.toUpperCase();
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function isBlankRow(cells: unknown[]): boolean {
  return cells.every((c) => text(c) === '');
}

/** Rate rows from a sheet matrix (row 1 = header, data from row 2, columns in RATE_COLUMNS order). */
export function parseRateMatrix(matrix: unknown[][]): ParseResult {
  const rows: Row[] = [];
  const errors: string[] = [];
  matrix.slice(1).forEach((cells, i) => {
    const line = i + 2;
    if (!cells || isBlankRow(cells)) return;
    const row: Row = {};
    const problems: string[] = [];
    RATE_COLUMNS.forEach((col, c) => {
      const v = cells[c];
      if (col.key.endsWith('_KBETR')) {
        if (text(v) === '') { row[col.key] = 0; return; }
        const n = typeof v === 'number' ? v : Number(text(v).replace(/,/g, ''));
        if (!Number.isFinite(n)) problems.push(`${col.label} "${text(v)}" is not a number`);
        row[col.key] = Number.isFinite(n) ? n : 0;
      } else if (col.key === 'VFROM' || col.key === 'VTO') {
        const ymd = toYmd(v);
        if (!ymd) problems.push(`${col.label} "${text(v)}" is not a date (dd.mm.yyyy)`);
        row[col.key] = ymd ?? '';
      } else if (col.key === 'MATNR') {
        row[col.key] = padMatnr(v);
      } else {
        row[col.key] = text(v).toUpperCase();
      }
    });
    if (!row.LLAND) problems.push('Selling Country is empty');
    if (!row.MATNR) problems.push('Material Code is empty');
    if (row.VFROM && row.VTO && row.VFROM > row.VTO) problems.push('Valid From is after Valid To');
    if (problems.length) errors.push(`Row ${line}: ${problems.join('; ')}`);
    else rows.push(row);
  });
  return { rows, errors };
}

/** Simulation rows from a sheet matrix (row 1 = header, data from row 2, columns in SIM_INPUT_COLUMNS order). */
export function parseSimulationMatrix(matrix: unknown[][]): ParseResult {
  const rows: Row[] = [];
  const errors: string[] = [];
  matrix.slice(1).forEach((cells, i) => {
    const line = i + 2;
    if (!cells || isBlankRow(cells)) return;
    const row: Row = {};
    SIM_INPUT_COLUMNS.forEach((col, c) => {
      const v = cells[c];
      row[col.key] = col.key === 'MATNR' ? padMatnr(v) : col.key === 'KUNNR' ? padKunnr(v) : text(v).toUpperCase();
    });
    const missing = ['VKORG', 'KUNNR', 'MATNR'].filter((k) => !row[k]).map((k) => SIM_INPUT_COLUMNS.find((c) => c.key === k)?.label ?? k);
    if (missing.length) errors.push(`Row ${line}: ${missing.join(', ')} empty`);
    else rows.push(row);
  });
  return { rows, errors };
}

/** First sheet of an .xlsx file as a matrix of raw cell values (dates stay Excel serials). */
export function readSheetMatrix(data: ArrayBuffer): unknown[][] {
  const head = new Uint8Array(data.slice(0, 2));
  if (head.length < 2 || head[0] !== 0x50 || head[1] !== 0x4b) throw new ExcelParseError('This is not an .xlsx file. Save it as Excel Workbook (.xlsx) and try again.');
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false });
  } catch {
    throw new ExcelParseError('The file could not be read as an Excel workbook.');
  }
  const first = wb.SheetNames[0];
  if (!first) throw new ExcelParseError('The workbook has no sheets.');
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, raw: true, defval: '', blankrows: false });
}

export function parseRateFile(data: ArrayBuffer): ParseResult {
  return parseRateMatrix(readSheetMatrix(data));
}

export function parseSimulationFile(data: ArrayBuffer): ParseResult {
  return parseSimulationMatrix(readSheetMatrix(data));
}

/** An .xlsx template: header row of labels, then the sample rows in column order. */
export function templateWorkbook(columns: Column[], sample: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([columns.map((c) => c.label), ...sample]);
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.label.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
