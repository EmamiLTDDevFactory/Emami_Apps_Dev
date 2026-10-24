import type { Column, Row } from './types';

/**
 * Grid -> .xlsx in the browser (SheetJS json_to_sheet + writeFile). Headers are the displayed column labels; values are
 * the raw values (numbers stay numbers). SheetJS is loaded only when an export is asked for.
 */
export async function exportRowsToExcel(rows: Row[], columns: Column[], fileName: string): Promise<void> {
  const XLSX = await import('xlsx');
  // Labels can repeat (two "Damage/Expiry" columns): make each header unique so no column is lost.
  const seen = new Map<string, number>();
  const headers = columns.map((c) => {
    const n = (seen.get(c.label) ?? 0) + 1;
    seen.set(c.label, n);
    return n === 1 ? c.label : `${c.label} (${n})`;
  });
  const data = rows.map((r) => Object.fromEntries(columns.map((c, i) => [headers[i], c.key === 'ZVERSION' ? String(r[c.key] ?? '').trim() || '01' : r[c.key] ?? ''])));
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(10, Math.min(40, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, fileName);
}

/** <tab>_<yyyymmdd>.xlsx */
export function exportFileName(tab: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${tab.replace(/[^\w-]+/g, '_')}_${ymd}.xlsx`;
}
