import * as XLSX from 'xlsx';
import { RATE_FILE_KEYS, SIM_FILE_KEYS } from './columns';
import type { RateRow, SimRow } from './types';

/**
 * Pure parsers for the two upload files (first sheet, header in row 1, data from row 2, columns by position).
 * A date that cannot be read comes back as '' - the editable Valid From / Valid To cells then show it red.
 */

/** dd.mm.yyyy (also d.m.yyyy, / or -), YYYYMMDD, an Excel date serial or a Date -> YYYYMMDD; '' when not a real date. */
export function toYmd(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  let y: number, m: number, d: number;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    [y, m, d] = [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 19000101 && value <= 99991231) return toYmd(String(Math.trunc(value)));
    const dc = XLSX.SSF.parse_date_code(value);
    if (!dc) return '';
    ({ y, m, d } = dc);
  } else {
    const s = String(value).trim();
    const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
    const ymd = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    else if (ymd) [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
    else return '';
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

/** All-digit material numbers are padded to 18 characters; others kept as typed (upper case). */
export function padMatnr(value: unknown): string {
  const s = String(value ?? '').trim();
  return /^\d+$/.test(s) ? s.padStart(18, '0') : s.toUpperCase();
}

/** Customer numbers are padded to 10 characters. */
export function padKunnr(value: unknown): string {
  const s = String(value ?? '').trim();
  return /^\d+$/.test(s) ? s.padStart(10, '0') : s.toUpperCase();
}

const text = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(text(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const blank = (cells: unknown[] | undefined) => !cells || cells.every((c) => text(c) === '');

/** First sheet as a matrix of raw values (dates stay Excel serials, so no time zone can shift them). */
export function readSheetMatrix(data: ArrayBuffer): unknown[][] {
  const head = new Uint8Array(data.slice(0, 2));
  if (head.length < 2 || head[0] !== 0x50 || head[1] !== 0x4b) throw new Error('This is not an .xlsx file. Save it as Excel Workbook (.xlsx) and try again.');
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false });
  } catch {
    throw new Error('The file could not be read as an Excel workbook.');
  }
  const first = wb.SheetNames[0];
  if (!first) throw new Error('The workbook has no sheets.');
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, raw: true, defval: '', blankrows: false });
}

export function parseRateMatrix(matrix: unknown[][]): RateRow[] {
  const rows = matrix.slice(1).filter((c) => !blank(c)).map((cells) => {
    const r: RateRow = {};
    RATE_FILE_KEYS.forEach((key, i) => {
      const v = cells[i];
      if (key.endsWith('_KBETR')) r[key] = num(v);
      else if (key === 'VFROM' || key === 'VTO') r[key] = toYmd(v);
      else if (key === 'MATNR') r[key] = padMatnr(v);
      else r[key] = text(v).toUpperCase();
    });
    return r;
  });
  if (!rows.length) throw new Error('Rate file: no data rows found (data starts in row 2).');
  return rows;
}

export function parseSimulationMatrix(matrix: unknown[][]): SimRow[] {
  const rows = matrix.slice(1).filter((c) => !blank(c)).map((cells) => {
    const r: SimRow = { ZPRICE_IN: 0 };
    SIM_FILE_KEYS.forEach((key, i) => {
      const v = cells[i];
      r[key] = key === 'KUNNR' ? padKunnr(v) : key === 'MATNR' ? padMatnr(v) : text(v).toUpperCase();
    });
    return r;
  });
  if (!rows.length) throw new Error('Simulation file: no data rows found (data starts in row 2).');
  return rows;
}

/** Rate file -> rows (KBETR as numbers, VFROM / VTO as YYYYMMDD, numeric MATNR padded to 18). */
export function parseRateFile(buf: ArrayBuffer): RateRow[] {
  return parseRateMatrix(readSheetMatrix(buf));
}

/** Simulation file -> rows (KUNNR padded to 10, numeric MATNR to 18, ZPRICE_IN 0). */
export function parseSimulationFile(buf: ArrayBuffer): SimRow[] {
  return parseSimulationMatrix(readSheetMatrix(buf));
}

/** An .xlsx template: header labels in row 1, then sample rows. */
export function templateWorkbook(header: string[], sample: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([header, ...sample]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
