/**
 * Pure formatters/parsers. Ported from docs/fiori-source/webapp/model/formatter.js (+ Component.js helpers).
 * No React, no DOM, no network.
 */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));

/** SAP "initial" date values (ABAP DATS 00000000 / 0000-00-00) are "no date". */
function isZeroDate(s: string): boolean {
  return /^0{4}-?0{2}-?0{2}([T ].*)?$/.test(s);
}

/**
 * Parse any date shape the SAP gateway / our backend returns.
 * "/Date(ms)/", "/Date(ms+0000)/", ISO, YYYYMMDD, Date. Zero dates and year-0001 initial values -> null.
 * (Fiori's formatter.date only did `new Date(v)`; this is the superset the BUILD_GUIDE requires.)
 */
export function parseSapDate(v: string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const asAny: unknown = v;
  if (asAny instanceof Date) return isNaN(asAny.getTime()) ? null : asAny;
  const s = String(v).trim();
  if (!s || isZeroDate(s)) return null;
  let d: Date;
  const m = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(s);
  if (m) {
    d = new Date(Number(m[1])); // the +hhmm suffix is only a display hint; ms is always UTC
  } else if (/^\d{8}$/.test(s)) {
    d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    d = new Date(s + 'T00:00:00Z');
  } else {
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() <= 1) return null; // 0001-01-01 = ABAP initial timestamp
  return d;
}

/** Date-only values (exact UTC midnight) are shown by their UTC parts so the day never shifts with the viewer's zone. */
function parts(d: Date): { y: number; m: number; d: number } {
  if (d.getTime() % DAY_MS === 0) return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}

/** Write format for Edm.DateTime: "/Date(ms)/" at UTC midnight of the calendar day. */
export function toSapDate(d: Date | string): string {
  const dt = typeof d === 'string' ? parseSapDate(d) : d;
  if (!dt || isNaN(dt.getTime())) return '';
  const p = parts(dt);
  return '/Date(' + Date.UTC(p.y, p.m, p.d) + ')/';
}

/** formatter.date: "dd MMM yyyy" or "-". (Month names fixed, not locale-derived, so "Sep" never becomes "Sept".) */
export function fmtDate(v: string | Date | null | undefined): string {
  const d = parseSapDate(v as string);
  if (!d) return '-';
  const p = parts(d);
  return pad2(p.d) + ' ' + MONTHS[p.m] + ' ' + p.y;
}

/** formatter.dateTime: "dd MMM yyyy, HH:mm" (24h, viewer-local time). */
export function fmtDateTime(v: string | Date | null | undefined): string {
  const d = parseSapDate(v as string);
  if (!d) return '-';
  return pad2(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/** "yyyy-mm-dd" for <input type="date">; '' when no date. */
export function toIsoDate(v: string | Date | null | undefined): string {
  const d = parseSapDate(v as string);
  if (!d) return '';
  const p = parts(d);
  return p.y + '-' + pad2(p.m + 1) + '-' + pad2(p.d);
}

/** SAP decimals arrive as strings ("1234.50"). NaN/null/'' -> 0. */
export function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

const isBlank = (v: unknown) => v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v)) || isNaN(Number(v));

const IN2 = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

/** formatter.inLakhs: 6000000 -> "60.00 L"; null/NaN -> "-". */
export function inLakhs(v: string | number | null | undefined): string {
  if (isBlank(v)) return '-';
  return (Number(v) / 100000).toLocaleString('en-IN', IN2) + ' L';
}

/** formatter.inCrores: 5000000000 -> "500.00 Cr". */
export function inCrores(v: string | number | null | undefined): string {
  if (isBlank(v)) return '-';
  return (Number(v) / 10000000).toLocaleString('en-IN', IN2) + ' Cr';
}

/** formatter.money: auto-scale, Cr at |n| >= 1 crore else L (so 50,000 -> "0.50 L"). */
export function money(v: string | number | null | undefined): string {
  if (isBlank(v)) return '-';
  const n = Number(v);
  return Math.abs(n) >= 10000000 ? inCrores(n) : inLakhs(n);
}

/** Rupee-prefixed lakh/crore shortening (formatter.money with the ₹ glyph). "-" for blanks. */
export function fmtInr(v: string | number | null | undefined): string {
  const s = money(v);
  return s === '-' ? s : '₹ ' + s;
}

/** Full Indian grouping with paise: ₹ 12,34,567.00 ("-" for blanks). Superset of formatter.rupees (which dropped decimals). */
export function fmtInrFull(v: string | number | null | undefined): string {
  if (isBlank(v)) return '-';
  return '₹ ' + Number(v).toLocaleString('en-IN', IN2);
}

/** formatter.rupees: "₹ 12,34,567" (no decimals). */
export function rupees(v: string | number | null | undefined): string {
  if (isBlank(v)) return '-';
  return '₹ ' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/** formatter.percent: one decimal. */
export function fmtPct(v: string | number | null | undefined): string {
  if (isBlank(v)) return '-';
  return Number(v).toFixed(1) + '%';
}

/** formatter.share: part/total as 0..100. */
export function share(part: number, total: number): number {
  if (!total || isNaN(part) || isNaN(total)) return 0;
  return Math.max(0, Math.min(100, (Number(part) / Number(total)) * 100));
}

/** formatter.widthPct. */
export function widthPct(part: number, total: number): string {
  return share(part, total).toFixed(2) + '%';
}

/** formatter.days: "1 day" / "n days". */
export function fmtDays(n: number | string | null | undefined): string {
  if (isBlank(n)) return '-';
  const x = Number(n);
  return x === 1 ? '1 day' : x + ' days';
}

/** formatter.orDash. */
export function orDash<T>(v: T | null | undefined | ''): T | '-' {
  return v === null || v === undefined || v === '' ? '-' : v;
}

/** formatter.yesNo. */
export function yesNo(b: unknown): string {
  return b ? 'Yes' : 'No';
}

/** formatter.initials. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const p = String(name).trim().split(/\s+/);
  return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
}

/** formatter.stars. */
export function stars(n: number | string | null | undefined): string {
  const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
}

// ---------------------------------------------------------------- fiscal year

/**
 * BudgetList/Dashboard fyDigits + Component._recalcFiscalYears (log #43): last 4 digits of "2026" / "FY2026" -> "2026".
 * Addition (not in Fiori): the display shape "FY 2026-27" / "2026-27" yields "2026" (Fiori's slice(-4) would give "2627").
 */
export function fyDigits(fy: string | number | null | undefined): string {
  const s = String(fy ?? '');
  const range = /(\d{4})\s*-\s*\d{2,4}/.exec(s);
  if (range) return range[1];
  return s.replace(/\D/g, '').slice(-4);
}

/** Component._recalcFiscalYears: key "FY2026" (what app>/fiscalYear holds). */
export function fyKey(fy: string | number | null | undefined): string {
  const d = fyDigits(fy);
  return d ? 'FY' + d : '';
}

/** Component._recalcFiscalYears: label "FY 2026-27". */
export function fyLabel(fy: string | number | null | undefined): string {
  const d = fyDigits(fy);
  if (!d) return '';
  const next = (Number(d) + 1) % 100;
  return 'FY ' + d + '-' + pad2(next);
}

/** Indian fiscal year (April-March) containing `d`, as the start-year digits the backend stores in Fiscalyear ("2026" for Nov 2026 and Feb 2027). */
export function currentFiscalYear(d: Date = new Date()): string {
  const y = d.getFullYear();
  return String(d.getMonth() >= 3 ? y : y - 1);
}

// ---------------------------------------------------------------- status

const STATUS: Record<string, { tone: Tone; label: string }> = {
  DRAFT: { tone: 'neutral', label: 'Draft' },
  SUBMITTED: { tone: 'warning', label: 'Submitted' },
  IN_APPROVAL: { tone: 'warning', label: 'In Approval' },
  UNDER_EVALUATION: { tone: 'warning', label: 'Under Evaluation' },
  PENDING: { tone: 'warning', label: 'Pending' },
  APPROVED: { tone: 'success', label: 'Approved' },
  REJECTED: { tone: 'error', label: 'Rejected' },
  HOLD: { tone: 'warning', label: 'On Hold' },
  BLOCKED: { tone: 'error', label: 'Blocked' },
  POSTED: { tone: 'success', label: 'Posted' },
  CAPITALIZED: { tone: 'success', label: 'Capitalized' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  COMPLIANT: { tone: 'success', label: 'Compliant' },
  NON_COMPLIANT: { tone: 'error', label: 'Not Compliant' },
  BREACHED: { tone: 'error', label: 'Breached' },
};

/** SAP Status is MaxLength 12: a 12+ char value may be the truncated form of a longer key ("UNDER_EVALUA"). */
function lookupStatus(s: string | null | undefined) {
  const k = String(s || '').trim().toUpperCase();
  if (!k) return undefined;
  if (STATUS[k]) return STATUS[k];
  if (k.length >= 12) {
    const full = Object.keys(STATUS).find((x) => x.startsWith(k));
    if (full) return STATUS[full];
  }
  return undefined;
}

/** formatter.statusText (prefix-aware). Unknown -> the raw value, empty -> "-". */
export function statusLabel(status: string | null | undefined): string {
  return lookupStatus(status)?.label ?? (status || '-');
}

/** formatter.statusState mapped to Tone: Success/Warning/Error/None(Draft)->neutral/default Information->info. */
export function statusTone(status: string | null | undefined): Tone {
  return lookupStatus(status)?.tone ?? 'info';
}

/** True when a status (possibly truncated) is the given full key, e.g. isStatus(s,'UNDER_EVALUATION'). */
export function isStatus(status: string | null | undefined, full: string): boolean {
  const k = String(status || '').trim().toUpperCase();
  if (!k) return false;
  return k === full || (k.length >= 12 && full.startsWith(k));
}

/** formatter.timelineTone. */
export function timelineTone(s: string | null | undefined): 'done' | 'current' | 'reject' | 'hold' | 'waiting' {
  switch ((s || '').toUpperCase()) {
    case 'APPROVED': return 'done';
    case 'PENDING': return 'current';
    case 'REJECTED': return 'reject';
    case 'HOLD': return 'hold';
    default: return 'waiting';
  }
}

// ---------------------------------------------------------------- SLA (log #95)

export type SlaState = 'onTrack' | 'atRisk' | 'breached';
export const DEFAULT_SLA_WARN_DAYS = 3;
export const DEFAULT_SLA_BREACH_DAYS = 5;

/**
 * formatter.slaState. Thresholds come from ConfigSet SLA_WARN_DAYS / SLA_BREACH_DAYS (log #95);
 * like setSlaThresholds, a falsy threshold keeps the 3/5 default. Strictly greater-than: 3 days is still on track, 5 is only at risk.
 */
export function slaState(daysPending: number | string | null | undefined, warnDays = DEFAULT_SLA_WARN_DAYS, breachDays = DEFAULT_SLA_BREACH_DAYS): SlaState {
  const d = Number(daysPending) || 0;
  const w = warnDays || DEFAULT_SLA_WARN_DAYS;
  const b = breachDays || DEFAULT_SLA_BREACH_DAYS;
  if (d > b) return 'breached';
  if (d > w) return 'atRisk';
  return 'onTrack';
}

/** formatter.slaState ValueState -> Tone (Success/Warning/Error). */
export function slaTone(state: SlaState): Tone {
  return state === 'breached' ? 'error' : state === 'atRisk' ? 'warning' : 'success';
}

/** formatter.slaText. */
export function slaLabel(daysPending: number | string | null | undefined, warnDays = DEFAULT_SLA_WARN_DAYS, breachDays = DEFAULT_SLA_BREACH_DAYS): string {
  const d = Number(daysPending) || 0;
  const st = slaState(d, warnDays, breachDays);
  const prefix = st === 'breached' ? 'SLA Breached' : st === 'atRisk' ? 'At Risk' : 'On Track';
  return prefix + ' (' + fmtDays(d) + ')';
}

/** ApprovalInbox.formatPriorityState: High error, Medium warning, anything else success. */
export function priorityTone(priority: string | null | undefined): Tone {
  if (priority === 'High') return 'error';
  if (priority === 'Medium') return 'warning';
  return 'success';
}

// ---------------------------------------------------------------- metric tones

/** formatter.irrTone (hurdle 15%): >=18 good, >=15 warn, else bad; blank none. */
export function irrTone(irr: number | null | undefined): 'good' | 'warn' | 'bad' | 'none' {
  if (irr === null || irr === undefined || isNaN(irr)) return 'none';
  return irr >= 18 ? 'good' : irr >= 15 ? 'warn' : 'bad';
}

/** formatter.npvTone. */
export function npvTone(npv: number | null | undefined): 'good' | 'bad' | 'none' {
  if (npv === null || npv === undefined || isNaN(npv)) return 'none';
  return npv > 0 ? 'good' : 'bad';
}

/** formatter.paybackTone (target <= 3 good, <= 5 warn). */
export function paybackTone(yrs: number | null | undefined): 'good' | 'warn' | 'bad' | 'none' {
  if (yrs === null || yrs === undefined || isNaN(yrs)) return 'none';
  if (yrs > 0 && yrs <= 3) return 'good';
  if (yrs > 0 && yrs <= 5) return 'warn';
  return 'bad';
}

/** formatter.balanceTone. */
export function balanceTone(v: number | string | null | undefined): 'success' | 'error' {
  return (Number(v) || 0) > 0 ? 'success' : 'error';
}

/** formatter.vendorCardTone. */
export function vendorCardTone(rank: string, selected: boolean): 'selected' | 'l1' | 'plain' {
  if (selected) return 'selected';
  return rank === 'L1' ? 'l1' : 'plain';
}
