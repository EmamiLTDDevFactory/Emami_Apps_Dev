// Amounts arrive in INR (company code currency). The MIS shows Rs lakh by default; crore and rupees on request.
export type Unit = 'lakh' | 'crore' | 'inr';
export const UNIT_DIV: Record<Unit, number> = { lakh: 1e5, crore: 1e7, inr: 1 };
export const UNIT_LABEL: Record<Unit, string> = { lakh: '₹ lakh', crore: '₹ crore', inr: '₹' };

const nf = (digits: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const NF2 = nf(2);
const NF1 = nf(1);
const NF0 = nf(0);

/** Amount in the chosen unit, en-IN grouping; negatives in brackets like the MIS. Zero shows as a dash. */
export function amt(inr: number, unit: Unit, { dash = true, digits }: { dash?: boolean; digits?: number } = {}): string {
  const v = inr / UNIT_DIV[unit];
  const d = digits ?? (unit === 'inr' ? 0 : 2);
  if (dash && Math.abs(v) < 0.5 * 10 ** -d) return '–';
  const s = (d === 0 ? NF0 : d === 1 ? NF1 : NF2).format(Math.abs(v));
  return v < 0 ? `(${s})` : s;
}

/** Short headline number: "₹ 495.0 Cr" / "₹ 42.3 L". */
export function short(inr: number): string {
  const a = Math.abs(inr);
  const sign = inr < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹ ${NF1.format(a / 1e7)} Cr`;
  if (a >= 1e5) return `${sign}₹ ${NF1.format(a / 1e5)} L`;
  return `${sign}₹ ${NF0.format(a)}`;
}

/** Percentage change (CY vs PY); null when PY is zero. */
export function growth(cy: number, py: number): number | null {
  if (!py) return null;
  return ((cy - py) / Math.abs(py)) * 100;
}

export const pct = (v: number | null, digits = 1) => (v === null || !Number.isFinite(v) ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`);
export const share = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);
export const pctPlain = (v: number, digits = 1) => (Number.isFinite(v) ? `${v.toFixed(digits)}%` : '–');

// Fiscal year April - March (SAP fiscal year variant V3): FY 2026 = Apr 2026 - Mar 2027 = "FY'27"; period 1 = April.
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
export const monthOf = (period: number) => MONTHS[(period - 1) % 12];
export const yearOf = (fy: string | number, period: number) => Number(fy) + (period >= 10 ? 1 : 0);
/** "Oct'26" */
export const periodLabel = (fy: string | number, period: number) => `${monthOf(period)}'${String(yearOf(fy, period) % 100).padStart(2, '0')}`;
/** "FY'27" */
export const fyLabel = (fy: string | number) => `FY'${String((Number(fy) + 1) % 100).padStart(2, '0')}`;
export const ytdLabel = (fy: string | number, period: number) => `YTD-${periodLabel(fy, period)}`;

/** Current fiscal year and the last closed period (previous month) in IST. */
export function defaultPeriod(now = new Date()): { fy: string; period: number } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  let y = ist.getUTCFullYear();
  let m = ist.getUTCMonth() + 1; // 1..12
  m -= 1; // last closed month
  if (m === 0) { m = 12; y -= 1; }
  const fy = m >= 4 ? y : y - 1;
  const period = m >= 4 ? m - 3 : m + 9;
  return { fy: String(fy), period };
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
