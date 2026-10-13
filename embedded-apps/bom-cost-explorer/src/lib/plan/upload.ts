/**
 * Plan upload template, parsing and the checks done in the browser before SAP sees anything (SAP checks
 * again and wins). Template: A Material, B Plant, C Plan, D Country, E..P Apr..Mar; row 1 may be the
 * header (detected and skipped). Uses exceljs (already shipped for the exports) instead of SheetJS.
 */
import { FISCAL_MONTHS, PLAN_NAME_MAX, PLAN_UPLOAD_MAX_ROWS } from './fields';
import type { PlanRowInput } from './write';

/** sessionStorage key the WIP tab uses to hand rows to the upload wizard. */
export const PENDING_UPLOAD_KEY = 'plan:pending-upload';

export const TEMPLATE_HEADER = ['Material', 'Plant', 'Plan', 'Country', ...FISCAL_MONTHS];

export interface ParsedRow extends PlanRowInput {
  rowNo: number; // spreadsheet row number (1-based, as the person sees it)
}
export interface RowIssue {
  rowNo: number;
  field: string;
  message: string;
}

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return cellText(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('');
    if (o.text !== undefined) return String(o.text);
  }
  return String(v).trim();
};

/** Rows from a worksheet-like grid (array of row arrays, index 0 = column A). */
export function rowsFromGrid(grid: unknown[][]): ParsedRow[] {
  const out: ParsedRow[] = [];
  grid.forEach((cells, i) => {
    const t = Array.from({ length: 16 }, (_, c) => cellText(cells[c]));
    if (t.every((x) => x === '')) return;
    const headerLike = i === 0 && (/material/i.test(t[0]) || t.slice(4).some((x) => x !== '' && Number.isNaN(Number(x.replace(/,/g, '')))));
    if (headerLike) return;
    out.push({ rowNo: i + 1, matnr: t[0].toUpperCase(), werks: t[1].toUpperCase(), plan: t[2], land1: t[3].toUpperCase(), months: t.slice(4, 16).map((x) => (x === '' ? '0' : x)) });
  });
  return out;
}

export async function parseWorkbook(data: ArrayBuffer): Promise<ParsedRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const vals = row.values as unknown[]; // exceljs: index 1 = column A
    grid[n - 1] = vals.slice(1);
  });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return rowsFromGrid(grid);
}

export function validateRows(rows: ParsedRow[]): RowIssue[] {
  const issues: RowIssue[] = [];
  if (rows.length > PLAN_UPLOAD_MAX_ROWS) issues.push({ rowNo: 0, field: 'file', message: `${rows.length} rows; at most ${PLAN_UPLOAD_MAX_ROWS} per upload` });
  const seen = new Map<string, number>();
  for (const r of rows) {
    const add = (field: string, message: string) => issues.push({ rowNo: r.rowNo, field, message });
    if (!r.matnr) add('Material', 'Material is required');
    if (!r.werks) add('Plant', 'Plant is required');
    else if (!/^[A-Z0-9]{4}$/.test(r.werks)) add('Plant', 'Plant must be 4 characters (letters / digits)');
    if (!r.plan.trim()) add('Plan', 'Plan name is required');
    else if (r.plan.trim().length > PLAN_NAME_MAX) add('Plan', `Plan name is longer than ${PLAN_NAME_MAX} characters`);
    if (!r.land1) add('Country', 'Country is required');
    r.months.forEach((m, i) => {
      const n = Number(String(m).replace(/,/g, ''));
      if (!Number.isFinite(n)) add(FISCAL_MONTHS[i], `${FISCAL_MONTHS[i]} is not a number`);
      else if (n < 0) add(FISCAL_MONTHS[i], `${FISCAL_MONTHS[i]} cannot be negative`);
    });
    const key = `${r.plan.trim()}|${r.matnr}|${r.werks}|${r.land1}`;
    const first = seen.get(key);
    if (first !== undefined) add('Row', `Duplicate of row ${first} (plan + material + plant + country)`);
    else seen.set(key, r.rowNo);
  }
  return issues;
}

/** Months cleaned to numbers (commas removed) for sending. */
export const cleanMonths = (r: ParsedRow): PlanRowInput => ({ ...r, months: r.months.map((m) => String(Number(String(m).replace(/,/g, '')) || 0)) });

export function groupByPlan(rows: ParsedRow[]): Map<string, ParsedRow[]> {
  const m = new Map<string, ParsedRow[]>();
  for (const r of rows) {
    const k = r.plan.trim();
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

/** The Excel template, with one example row. */
export async function downloadTemplate() {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Plan');
  ws.addRow(TEMPLATE_HEADER);
  ws.addRow(['400016291', 'UB01', 'FY27-BASE', 'IN', ...Array(12).fill(1000)]);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = i < 4 ? 14 : 9; });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = 'production-plan-template.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
