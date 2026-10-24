import { DATE_KEYS, isNumericKey } from './columns';

const NUM = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmt2 = (n: number) => NUM.format(n);
export const fmtPct = (n: number) => `${PCT.format(n)}%`;

/** YYYYMMDD -> YYYY-MM-DD; anything else unchanged. */
export function fmtDate(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : v;
}

/** Display text for one cell and whether it is right-aligned. A blank ZVERSION shows as 01. */
export function cellText(key: string, value: unknown): { text: string; numeric: boolean } {
  if (key === 'ZVERSION') return { text: String(value ?? '').trim() || '01', numeric: false };
  if (value === null || value === undefined || value === '') return { text: '', numeric: false };
  if (isNumericKey(key)) {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    if (Number.isFinite(n) && String(value).trim() !== '') return { text: NUM.format(n), numeric: true };
  }
  const s = String(value);
  if (DATE_KEYS.has(key)) return { text: fmtDate(s), numeric: false };
  return { text: s, numeric: false };
}

/** YYYYMMDD when filled: the top bar and the editable dates. */
export const YMD = /^\d{8}$/;

/** Pricing Factor %: up to 3 digits and 2 decimals, optionally negative; while typing, partial values are allowed. */
export const FACTOR_INPUT = /^-?\d{0,3}(\.\d{0,2})?$/;

/** '' when the factor is fine (blank = 0 = base price), else the message. */
export function factorError(v: unknown): string {
  const s = String(v ?? '').trim();
  if (s === '' || s === '-') return '';
  if (!FACTOR_INPUT.test(s)) return 'Pricing Factor %: up to 3 digits and 2 decimals';
  if (Number(s) <= -100) return 'Pricing Factor % must be above -100';
  return '';
}

export const factorNumber = (v: unknown): number => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};
