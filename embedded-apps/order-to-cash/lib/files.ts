import type { Row } from './types';

/** Everything the app reads from a file stays in the browser except what it sends to its own backend. */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export type FileKind = 'pdf' | 'excel' | 'image' | 'email' | 'unknown';
export function kindOf(file: File): FileKind {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (/\.(xlsx|xls|csv)$/.test(n)) return 'excel';
  if (/\.(png|jpe?g|webp)$/.test(n) || file.type.startsWith('image/')) return 'image';
  if (/\.(eml|txt)$/.test(n) || file.type.startsWith('text/')) return 'email';
  return 'unknown';
}

/** Text of a PDF, page by page, rows kept together by their y position (so table rows stay on one line). */
export async function pdfText(file: File, maxPages = 30): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      const list = rows.get(y) ?? [];
      list.push({ x: it.transform[4], s: it.str });
      rows.set(y, list);
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.s).join('  '));
    out.push(`--- page ${p} ---`, ...lines);
  }
  return out.join('\n');
}

/** First sheet as rows of objects (header row = keys). */
export async function sheetRows(file: File): Promise<Row[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Row>(ws, { defval: '', raw: false });
}

/** A sheet as plain text (tab separated) for the AI to read an Excel PO with an unknown layout. */
export async function sheetText(file: File): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames.slice(0, 3).map((n) => `--- sheet ${n} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: '\t', blankrows: false })}`).join('\n');
}

/** Image as a data URL, scaled down to at most 2000 px on the long side (JPEG) so it stays under the 4 MB limit. */
export async function imageDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('The image could not be opened.')); i.src = url; });
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

/** Find a column by any of its usual names (case and punctuation ignored). */
export function pick(row: Row, names: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((x) => norm(x) === norm(n));
    if (k !== undefined && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return '';
}

/** Excel download of rows with friendly column names. */
export async function downloadXlsx(fileName: string, rows: Row[], columns: { key: string; label: string }[]) {
  const XLSX = await import('xlsx');
  const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c.label, r[c.key] ?? ''])));
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, fileName);
}
