import * as XLSX from 'xlsx';
import { padPernr } from './mediclaim';

export interface BlockedUploadRow {
  EmpId: string;
  Name: string;
}

export interface BlockedUploadResult {
  rows: BlockedUploadRow[];
  /** 1-based sheet row numbers that were not usable (no numeric PERNR in column A, e.g. a header row). */
  skipped: number[];
}

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_ROWS = 5000;

/**
 * SPEC 5.3: first worksheet, column A = PERNR, column B = name. The WD took every row including a header row; here a row
 * without a numeric PERNR in column A (a header) is skipped and reported. Duplicates keep the last name.
 */
export function parseBlockedWorkbook(data: ArrayBuffer): BlockedUploadResult {
  const book = XLSX.read(data, { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return { rows: [], skipped: [] };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  const byId = new Map<string, BlockedUploadRow>();
  const skipped: number[] = [];
  grid.slice(0, MAX_UPLOAD_ROWS).forEach((cells, i) => {
    const id = String(cells[0] ?? '').trim();
    const name = String(cells[1] ?? '').trim();
    if (!id && !name) return;
    if (!/^\d{1,8}$/.test(id)) {
      skipped.push(i + 1);
      return;
    }
    byId.set(padPernr(id), { EmpId: padPernr(id), Name: name.slice(0, 80) });
  });
  return { rows: [...byId.values()], skipped };
}
