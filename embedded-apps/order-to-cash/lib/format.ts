const N2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const N0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};
export const money = (v: unknown) => { const n = num(v); return n === null ? '' : N2.format(n); };
export const qty = (v: unknown) => { const n = num(v); return n === null ? '' : N0.format(n); };
/** Lakh / crore short form for KPI tiles. */
export function short(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  return N0.format(Math.round(v));
}
/** YYYYMMDD -> 05 Nov 2026; '' stays ''. Also accepts ISO timestamps. */
export function date(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s || /^0+$/.test(s)) return '';
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export const dateTime = (v: string) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
/** SAP number without leading zeros. */
export const alpha = (v: unknown) => String(v ?? '').replace(/^0+(?=\d)/, '');
export const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
export const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86400000));
/** <input type=date> value <-> YYYYMMDD */
export const toInput = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : '');
export const fromInput = (v: string) => v.replace(/-/g, '');
export function daysBetween(a: string, b: string): number | null {
  if (!/^\d{8}$/.test(a) || !/^\d{8}$/.test(b)) return null;
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6));
  return Math.round((t(b) - t(a)) / 86400000);
}
