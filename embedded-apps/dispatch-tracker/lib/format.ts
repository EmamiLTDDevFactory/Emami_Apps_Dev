/**
 * Ported 1:1 from the formatter helpers at the top of
 * streamlit_app/dis_shared_components.py (_fd, _finr, _sv, _sfloat,
 * _to_date, _fmt_cw, _gsv_fmt). Keep behavior identical — every screen
 * in the original app renders through these.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (s === '' || s === 'nat' || s === 'nan' || s === 'none') return null;
  const raw = String(v);
  const d = new Date(raw.length >= 10 ? raw.slice(0, 10) : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** _fd — date -> "13 Aug 2026", "—" if missing/invalid. */
export function fd(v: unknown): string {
  const d = toDate(v);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** _sv — safe string, returns fallback for null/blank/"nan"/"none"/"nat". */
export function sv(v: unknown, fb = ''): string {
  if (v === null || v === undefined) return fb;
  const s = String(v);
  if (['nan', 'none', 'nat', ''].includes(s.trim().toLowerCase())) return fb;
  return s;
}

/** _sfloat — safe float, null on failure/NaN. */
export function sfloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** _finr — currency, "₹#,##0.00", "—" if invalid. */
export function finr(v: unknown): string {
  const n = sfloat(v);
  if (n === null) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** _gsv_fmt — abbreviated currency: Cr (>=1e7), L (>=1e5), else full. */
export function gsvFmt(v: unknown): string {
  const n = sfloat(v) ?? 0;
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** _fmt_cw — "Cases: {c}  ·  Weight: {w} KG", omitting missing/zero parts. */
export function fmtCw(cases: unknown, grossWt: unknown): string {
  const c = sfloat(cases);
  const w = sfloat(grossWt);
  const parts: string[] = [];
  if (c) parts.push(`Cases: ${c.toFixed(2)}`);
  if (w) parts.push(`Weight: ${w.toFixed(2)} KG`);
  return parts.length ? parts.join('  ·  ') : '—';
}

export function daysBetween(a: Date, b: Date): number {
  const ms = a.setHours(0, 0, 0, 0) - b.setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

export function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * The calendar date exactly as the user sees it on screen.
 *
 * This used to be `d.toISOString().slice(0, 10)`, which is always UTC. Every Date here comes
 * from todayDate() or the date picker, i.e. LOCAL midnight — and in IST (UTC+5:30) local
 * midnight is 18:30 the previous day in UTC, so toISOString() moved every date back one day.
 * That shifted every date this app wrote to SAP: ActDelDate, RecDate, DispatchDate, CanDate,
 * and the SAP: stamp inside the return reason string.
 *
 * getFullYear/getMonth/getDate are local-time getters, so what the user picked is what SAP gets.
 * (parseDate() on the read side correctly stays UTC — SAP encodes /Date(ms)/ at UTC midnight.)
 */
export function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Current year ±, newest-forward-first, for the Fiscal Year filter dropdown. */
export function fiscalYearOptions(): string[] {
  const y = todayDate().getFullYear();
  const years: string[] = [];
  for (let i = 1; i >= -4; i--) years.push(String(y + i));
  return years;
}
