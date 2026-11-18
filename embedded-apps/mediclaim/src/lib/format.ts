// OData V2 <-> JS conversions for the types ZMEDICLAIM_SRV uses (same helpers as gate-entry/src/lib/format.ts).

/** OData string literal. */
export const odataKey = (v: string) => `'${v.replace(/'/g, "''")}'`;
export const eq = (field: string, value: string) => `${field} eq ${odataKey(value)}`;
export const and = (...c: (string | undefined | false | null)[]) => c.filter(Boolean).join(' and ');

/** Key value inside a URL path: quoted, quotes doubled, URL-encoded (but '@' kept, as the other apps send emails). */
export const pathKey = (v: string) => `'${encodeURIComponent(v.replace(/'/g, "''")).replace(/%40/g, '@')}'`;

/** 'YYYY-MM-DD' -> '/Date(ms)/' (UTC midnight, which is how Gateway maps ABAP dates). */
export function toSapDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `/Date(${Date.UTC(y, m - 1, d)})/`;
}

/** 'YYYY-MM-DD' -> datetime'YYYY-MM-DDT00:00:00' (function import parameter literal). */
export const toSapDateLiteral = (iso: string) => `datetime'${iso}T00:00:00'`;

/** '/Date(1700000000000)/' -> 'YYYY-MM-DD'. Empty and 0001-01-01 (ABAP initial) -> null. */
export function fromSapDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /\/Date\((-?\d+)/.exec(v);
  if (!m) return null;
  const iso = new Date(Number(m[1])).toISOString().slice(0, 10);
  return iso.startsWith('0001') || iso.startsWith('0000') ? null : iso;
}

/** Edm.Decimal travels as a JSON string in V2. */
export const dec = (n: number, scale = 2) => n.toFixed(scale);
export const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
export const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
/** ABAP flag ('X' / '') -> boolean. */
export const isX = (v: unknown) => str(v).toUpperCase() === 'X';
export const flag = (b: boolean) => (b ? 'X' : '');

// ---- display ----
const pad = (n: number) => String(n).padStart(2, '0');
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};
/** Indian digit grouping, no decimals unless the amount has paise. */
export const fmtMoney = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const fmtRs = (n: number) => `Rs. ${fmtMoney(n)}`;
