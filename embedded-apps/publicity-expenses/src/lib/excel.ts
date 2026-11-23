/** Excel in the browser (SheetJS, loaded on demand): read an uploaded sheet, write templates and exports. */

export type Cell = string | number | boolean | null;

/** First sheet (or the one named `prefer`) as rows of cells. */
export async function readSheet(file: File, prefer?: string): Promise<{ sheet: string; rows: Cell[][] }> {
  if (file.size > 8 * 1024 * 1024) throw new Error('The file is larger than 8 MB.');
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = (prefer && wb.SheetNames.find((n) => n.toLowerCase() === prefer.toLowerCase())) || wb.SheetNames[0];
  if (!sheet) throw new Error('The file has no sheets.');
  const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: false });
  return { sheet, rows };
}

const normH = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Find the header row (within the first 10 rows) holding `required` and map wanted columns by name.
 * `columns`: { field: ['Header name', 'alias', ...] }. Returns the header row index and field -> column index.
 */
export function mapColumns(rows: Cell[][], columns: Record<string, string[]>, required: string[]): { headerRow: number; col: Record<string, number> } {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] ?? []).map(normH);
    const col: Record<string, number> = {};
    for (const [field, names] of Object.entries(columns)) {
      const idx = cells.findIndex((c) => names.some((n) => normH(n) === c));
      if (idx >= 0) col[field] = idx;
    }
    if (required.every((f) => f in col)) return { headerRow: i, col };
  }
  throw new Error(`Header row not found: the sheet needs the columns ${required.map((f) => `"${columns[f][0]}"`).join(', ')}. Download the template and keep its first row.`);
}

export interface SheetSpec { name: string; rows: Cell[][]; widths?: number[]; freeze?: { rows: number; cols?: number } }

export async function writeBook(fileName: string, sheets: SheetSpec[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.widths) ws['!cols'] = s.widths.map((wch) => ({ wch }));
    if (s.freeze) ws['!freeze'] = { xSplit: s.freeze.cols ?? 0, ySplit: s.freeze.rows };
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName);
}

export const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
