// OData V2 <-> JS conversions for the types the gate-entry service uses (ported from gate-entry-web src/lib/sap/format.ts).

export const odataKey = (v: string) => `'${v.replace(/'/g, "''")}'`;
export const eq = (field: string, value: string) => `${field} eq ${odataKey(value)}`;
export const and = (...c: (string | undefined | false | null)[]) => c.filter(Boolean).join(' and ');

/** 'YYYY-MM-DD' -> '/Date(ms)/' (UTC midnight, which is how Gateway maps ABAP dates). */
export function toSapDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `/Date(${Date.UTC(y, m - 1, d)})/`;
}

/** '/Date(1700000000000)/' -> 'YYYY-MM-DD'. Empty and 0001-01-01 (ABAP initial) -> null. */
export function fromSapDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /\/Date\((-?\d+)/.exec(v);
  if (!m) return null;
  const iso = new Date(Number(m[1])).toISOString().slice(0, 10);
  return iso.startsWith('0001') || iso.startsWith('0000') ? null : iso;
}

/** 'HH:MM[:SS]' -> 'PT10H30M00S' (Edm.Time). */
export function toSapTime(hhmm: string): string {
  const [h, m, s] = hhmm.split(':');
  return `PT${h}H${m}M${(s ?? '00').padStart(2, '0')}S`;
}

/** 'PT10H30M00S' -> '10:30:00'. Initial (00:00:00) -> null. */
export function fromSapTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^PT(\d+)H(\d+)M(\d+)S$/.exec(v);
  if (!m) return null;
  const t = `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${m[3].padStart(2, '0')}`;
  return t === '00:00:00' ? null : t;
}

/** Edm.Decimal travels as a JSON string in V2. */
export const dec = (n: number, scale = 3) => n.toFixed(scale);
export const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
export const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

// ---- display ----
const pad = (n: number) => String(n).padStart(2, '0');
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const nowHhmm = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtDate = (iso: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};
export const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : '');
export const fmtQty = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
/** Days between two ISO dates (b - a). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
