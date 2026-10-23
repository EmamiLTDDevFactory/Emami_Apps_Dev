import { DATE_KEYS, isNumericKey } from './columns';

const NUM = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmt2 = (n: number) => NUM.format(n);
export const fmtPct = (n: number) => `${PCT.format(n)}%`;

/** YYYYMMDD -> DD.MM.YYYY (SAP display); anything else unchanged. */
export function fmtDate(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
}

/** Display text for one cell and whether it is right-aligned. */
export function cellText(key: string, value: unknown): { text: string; numeric: boolean } {
  if (value === null || value === undefined || value === '') return { text: '', numeric: false };
  if (isNumericKey(key)) {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    if (Number.isFinite(n) && String(value).trim() !== '') return { text: NUM.format(n), numeric: true };
  }
  const s = String(value);
  if (DATE_KEYS.has(key)) return { text: fmtDate(s), numeric: false };
  if ((key === 'MATNR' || key === 'KUNNR') && /^0+\d+$/.test(s)) return { text: s.replace(/^0+/, ''), numeric: false };
  return { text: s, numeric: false };
}

/** Valid YYYYMMDD calendar date. */
export function isYmd(v: string): boolean {
  if (!/^\d{8}$/.test(v)) return false;
  const y = Number(v.slice(0, 4)), m = Number(v.slice(4, 6)), d = Number(v.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
