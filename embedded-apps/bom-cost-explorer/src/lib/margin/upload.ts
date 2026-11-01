/**
 * Margin upload: reading a file (xlsx / csv) into rows, the FORMAT checks done in the browser, the CogmUploadSet deep-insert body, the answer, and the
 * check-before-save rule. SAP validates the content and wins. exceljs is loaded on demand (as for the plan upload). Decimals go to SAP as strings, dates
 * as /Date(ms)/ (UTC midnight), flags as Edm.String 'X' (never booleans), Dryrun 'X' = check only, '' = save.
 */
import Decimal from 'decimal.js';
import { SAP_MAX_TIMEOUT_MS, sapWrite, type SapGetOptions } from '../sap/client';
import { friendlyError } from '../price-context/odata';
import { MARGIN_SET, NAV_UPLOAD_ROWS } from './fields';
import { UPLOAD_MAX_ROWS, columnsOf, type UploadCol, type UploadKind } from './uploadKinds';

export interface UploadRowInput { rowNo: number; cells: Record<string, string> }
export interface RowIssue { rowNo: number; field: string; message: string }

/* ------------------------------ reading a file ------------------------------ */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return cellText(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('').trim();
    if (o.text !== undefined) return String(o.text).trim();
  }
  return String(v).trim();
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Rows of a grid (array of row arrays). Row 1 is the header when it names at least one column of the kind; the columns are then matched by header (or
 * property name), any order; otherwise the template column order is assumed. Empty rows are skipped. */
export function rowsFromGrid(kind: UploadKind, grid: unknown[][]): { rows: UploadRowInput[]; headerFound: boolean; unknown: string[] } {
  const cols = columnsOf(kind);
  const first = (grid[0] ?? []).map(cellText);
  const byName = new Map<string, number>();
  first.forEach((h, i) => { const n = norm(h); if (!n) return; for (const col of cols) if ((norm(col.header) === n || norm(col.key) === n) && !byName.has(col.key)) byName.set(col.key, i); });
  const headerFound = byName.size > 0;
  const index = (col: UploadCol, i: number) => (headerFound ? byName.get(col.key) ?? -1 : i);
  const unknown = headerFound ? first.filter((h, i) => h && ![...byName.values()].includes(i)) : [];
  const rows: UploadRowInput[] = [];
  grid.forEach((cells, r) => {
    if (r === 0 && headerFound) return;
    const text = cols.map((col, i) => { const ix = index(col, i); return ix < 0 ? '' : cellText(cells?.[ix]); });
    if (text.every((x) => x === '')) return;
    rows.push({ rowNo: r + 1, cells: Object.fromEntries(cols.map((col, i) => [col.key, text[i]])) });
  });
  return { rows, headerFound, unknown };
}

/** CSV text -> grid. Delimiter ; , or tab (taken from the first line), quotes with "" escapes, CR LF or LF. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const firstLine = t.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const out: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row); }
  return out;
}

export async function parseWorkbook(data: ArrayBuffer): Promise<unknown[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => { grid[n - 1] = (row.values as unknown[]).slice(1); });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return grid;
}
export async function readUploadFile(kind: UploadKind, file: File) {
  const grid = /\.csv$|\.txt$/i.test(file.name) ? parseCsv(await file.text()) : await parseWorkbook(await file.arrayBuffer());
  return rowsFromGrid(kind, grid);
}

/* ------------------------------ format checks ------------------------------ */
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
/** A date as YYYY-MM-DD (also dd.mm.yyyy); null when it is not a real calendar day. */
export function normDay(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  const a = ISO_DAY.exec(t), b = DMY.exec(t);
  if (a) { y = +a[1]; m = +a[2]; d = +a[3]; } else if (b) { d = +b[1]; m = +b[2]; y = +b[3]; } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function normDecimalText(s: string): Decimal | null {
  const t = s.trim().replace(/,/g, '').replace(/^([\d.]+)-$/, '-$1');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  try { const d = new Decimal(t); return d.isFinite() ? d : null; } catch { return null; }
}

export function validateRows(kind: UploadKind, rows: UploadRowInput[]): RowIssue[] {
  const cols = columnsOf(kind);
  const issues: RowIssue[] = [];
  if (!rows.length) issues.push({ rowNo: 0, field: 'file', message: 'The file has no data rows.' });
  if (rows.length > UPLOAD_MAX_ROWS) issues.push({ rowNo: 0, field: 'file', message: `${rows.length} rows; at most ${UPLOAD_MAX_ROWS} per upload.` });
  for (const r of rows) {
    for (const col of cols) {
      const v = (r.cells[col.key] ?? '').trim();
      const add = (message: string) => issues.push({ rowNo: r.rowNo, field: col.header, message });
      if (v === '') { if (col.required) add(`${col.header} is required.`); continue; }
      if (col.max && v.length > col.max && col.type === 'text') add(`${col.header} is longer than ${col.max} characters.`);
      if (col.type === 'decimal' && normDecimalText(v) === null) add(`${col.header} is not a number.`);
      else if (col.type === 'int') { if (!/^\d+$/.test(v)) add(`${col.header} must be a whole number.`); else if (col.max && v.length > col.max) add(`${col.header} is longer than ${col.max} digits.`); else if (col.key === 'Poper' && (+v < 1 || +v > 12)) add('Period must be 1 to 12.'); }
      else if (col.type === 'date' && normDay(v) === null) add(`${col.header} is not a valid date (use YYYY-MM-DD).`);
      else if (col.type === 'flag' && !/^x$/i.test(v)) add(`${col.header} must be X or empty.`);
    }
  }
  return issues;
}

/* ------------------------------ the request ------------------------------ */
const dayToSap = (s: string): string | null => { const d = normDay(s); if (!d) return null; const [y, m, dd] = d.split('-').map(Number); return `/Date(${Date.UTC(y, m - 1, dd)})/`; };

/** One row as SAP expects it in the JSON body. Empty cells are left out. */
export function rowPayload(kind: UploadKind, r: UploadRowInput): Record<string, unknown> {
  const o: Record<string, unknown> = { Rowno: r.rowNo };
  for (const col of columnsOf(kind)) {
    const v = (r.cells[col.key] ?? '').trim();
    if (v === '') continue;
    if (col.type === 'decimal') { const d = normDecimalText(v); if (d) o[col.key] = d.toFixed(); }
    else if (col.type === 'date') { const d = dayToSap(v); if (d) o[col.key] = d; }
    else if (col.type === 'flag') o[col.key] = 'X';
    else if (col.type === 'int') o[col.key] = v.replace(/^0+(?=\d)/, '').padStart(col.key === 'Gjahr' ? 4 : 1, '0');
    else o[col.key] = col.key === 'Matnr' || col.key === 'Werks' || col.key === 'Curr' || col.key === 'Uom' ? v.toUpperCase() : v;
  }
  return o;
}

/** A client-generated id for one upload (32 hex characters). */
export function newUploadId(): string {
  const g = globalThis.crypto;
  if (g?.randomUUID) return g.randomUUID().replace(/-/g, '').toUpperCase();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
}

export function uploadBody(kind: UploadKind, rows: UploadRowInput[], dryrun: boolean, uploadId: string) {
  return { UploadId: uploadId, Kind: kind, UpdMode: 'M', Dryrun: dryrun ? 'X' : '', [NAV_UPLOAD_ROWS]: rows.map((r) => rowPayload(kind, r)) };
}

export interface UploadRowResult { rowno: number; status: string; msg: string }
export interface UploadResult { status: 'E' | 'V' | 'S' | ''; saved: number; errors: number; msgTxt: string; rows: UploadRowResult[]; uploadId: string; dryrun: boolean }

const asInt = (v: unknown) => { const n = typeof v === 'number' ? v : parseInt(String(v ?? '').trim(), 10); return Number.isFinite(n) ? n : 0; };
export function parseUploadAnswer(body: unknown, dryrun: boolean, uploadId: string): UploadResult {
  const d = ((body as { d?: Record<string, unknown> } | null)?.d ?? body ?? {}) as Record<string, unknown>;
  const raw = d[NAV_UPLOAD_ROWS] as { results?: Record<string, unknown>[] } | Record<string, unknown>[] | undefined;
  const list = Array.isArray(raw) ? raw : raw?.results ?? [];
  const st = String(d.Status ?? '').trim().toUpperCase();
  return {
    status: st === 'E' || st === 'V' || st === 'S' ? st : '', saved: asInt(d.Saved), errors: asInt(d.Errors), msgTxt: String(d.MsgTxt ?? '').trim(), uploadId, dryrun,
    rows: list.map((x) => ({ rowno: asInt(x.Rowno), status: String(x.Status ?? '').trim().toUpperCase(), msg: String(x.Msg ?? '').trim() })),
  };
}
/** Error rows first (then by row number), the rest by row number. */
export function orderRowResults(rows: UploadRowResult[]): UploadRowResult[] {
  return [...rows].sort((a, b) => Number(b.status === 'E') - Number(a.status === 'E') || a.rowno - b.rowno);
}
/** "Nothing was saved" whenever a check or a save ended with an error row (Errors > 0 or Status E). */
export const nothingSaved = (r: UploadResult): boolean => r.errors > 0 || r.status === 'E' || r.rows.some((x) => x.status === 'E');
export const isClean = (r: UploadResult): boolean => !nothingSaved(r);

export async function submitUpload(kind: UploadKind, rows: UploadRowInput[], dryrun: boolean, user: string, opts: SapGetOptions = {}): Promise<UploadResult> {
  const id = newUploadId();
  try {
    const r = await sapWrite('POST', MARGIN_SET.UPLOAD, uploadBody(kind, rows, dryrun, id), { ...opts, timeoutMs: SAP_MAX_TIMEOUT_MS /* the Azure gateway's own limit: sapWrite has no noTimeout option */ });
    const res = parseUploadAnswer(r.body, dryrun, id);
    audit({ user, kind, rows: rows.length, dryrun, status: res.status, saved: res.saved, errors: res.errors });
    return res;
  } catch (e) {
    throw friendlyError(e);
  }
}

/* ------------------------------ check before save ------------------------------ */
/** What a check covers: the kind and every cell of every row. Any change of the rows gives another fingerprint, so an old check no longer counts. */
export function fingerprint(kind: UploadKind, rows: UploadRowInput[]): string {
  const cols = columnsOf(kind);
  return `${kind}|${rows.length}|${rows.map((r) => `${r.rowNo}:${cols.map((c) => (r.cells[c.key] ?? '').trim()).join('␟')}`).join('␞')}`;
}
export interface CheckState { fingerprint: string; result: UploadResult }
/** Save is allowed only after a clean check (Dryrun 'X') of exactly these rows. */
export function canSave(kind: UploadKind, rows: UploadRowInput[], check: CheckState | null, formatIssues: RowIssue[]): boolean {
  return !!check && check.result.dryrun && isClean(check.result) && check.fingerprint === fingerprint(kind, rows) && rows.length > 0 && formatIssues.length === 0;
}

/* ------------------------------ local audit log ------------------------------ */
export interface UploadAuditRow { at: string; user: string; kind: string; rows: number; dryrun: boolean; status: string; saved: number; errors: number }
const AUDIT_KEY = 'margin:upload-audit';
function audit(r: Omit<UploadAuditRow, 'at'>) {
  try {
    if (typeof localStorage === 'undefined') return;
    const list = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]') as UploadAuditRow[];
    list.unshift({ at: new Date().toISOString(), ...r });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 200)));
  } catch { /* storage blocked */ }
}

/* ------------------------------ template ------------------------------ */
export async function downloadTemplate(kind: UploadKind): Promise<void> {
  const [{ sanitizeCell }, ExcelJS] = await Promise.all([import('../client/spreadsheetSafe'), import('exceljs').then((m) => m.default)]);
  const cols = columnsOf(kind);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BOM Simulator';
  const ws = wb.addWorksheet(kind, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((col) => ({ header: col.header, width: Math.max(12, col.header.length + 4) }));
  ws.addRow(cols.map((col) => sanitizeCell(col.example)));
  ws.getRow(1).font = { bold: true };
  const notes = wb.addWorksheet('Notes');
  notes.columns = [{ header: 'Column', width: 28 }, { header: 'Type', width: 10 }, { header: 'Required', width: 10 }, { header: 'Note', width: 50 }];
  notes.getRow(1).font = { bold: true };
  for (const col of cols) notes.addRow([col.header, col.type, col.required ? 'yes' : '', col.hint ?? '']);
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `margin-upload-template-${kind.toLowerCase()}.xlsx`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
