import { D, type Decimal } from './cost/decimal';

const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, dp: number, min = dp) {
  const k = `${locale}|${dp}|${min}`;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: dp });
    cache.set(k, f);
  }
  return f;
}

/** INR uses Indian digit grouping (1,23,45,678.90); everything else en-US grouping. Decimal is
 * formatted from its fixed-point string, never via float arithmetic on sums. */
export function fmtNum(v: Decimal | string | number | null | undefined, dp = 2, curr?: string): string {
  if (v === null || v === undefined || v === '') return '';
  const d = D(v as string);
  const locale = curr === 'INR' || curr === undefined ? 'en-IN' : 'en-US';
  // Intl accepts numeric strings exactly (no float rounding) in modern engines.
  return nf(locale, dp).format(d.toFixed(dp) as unknown as number);
}

/** Amount with its currency code: "₹ 1,23,456.78" style but always with the ISO code. */
export const fmtAmt = (v: Decimal | string | null | undefined, curr: string, dp = 2) => (v === null || v === undefined ? '' : `${fmtNum(v, dp, curr)} ${curr}`);
export const fmtRate = (v: Decimal | string | null | undefined, curr?: string) => fmtNum(v, 4, curr);
export const fmtQty = (v: Decimal | string | null | undefined) => fmtNum(v, 3, 'X');
export const fmtPct = (v: Decimal | null | undefined, dp = 1) => (v === null || v === undefined ? '—' : `${v.gte(0) ? '' : '−'}${nf('en-US', dp).format(v.abs().toFixed(dp) as unknown as number)}%`);
export const fmtSigned = (v: Decimal, dp = 2, curr = 'INR') => `${v.gt(0) ? '+' : v.lt(0) ? '−' : ''}${fmtNum(v.abs(), dp, curr)}`;

/** Compact INR for chart axes: 1.2 K, 3.4 L (lakh), 5.6 Cr (crore). */
export function fmtCompactInr(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)} Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)} L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)} K`;
  return `${s}${a.toFixed(a < 10 ? 2 : 0)}`;
}

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  if (iso.startsWith('9999')) return 'unlimited';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

export const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`);
