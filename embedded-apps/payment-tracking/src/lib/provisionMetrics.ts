// Small numeric/grouping helpers shared by every Provision Tracking screen that summarizes rows
// (Home, Dashboard, Provision Details) — kept separate from paymentTrackingApi.ts since these are
// pure client-side aggregations, not SAP field mappings.
import type { PaymentTrackingRow } from './paymentTrackingApi';

export function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatValue(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export interface Breakdown {
  key: string;
  label: string;
  sublabel: string;
  value: number;
  count: number;
}

/** Groups rows by keyOf(row), summing pendingValue and counting lines per group — used for the
 * "pending value by status" / "by cost center" bar breakdowns. Sorted by value, largest first. */
export function breakdownBy(
  rows: PaymentTrackingRow[],
  keyOf: (r: PaymentTrackingRow) => string,
  labelOf: (r: PaymentTrackingRow) => string,
  sublabelOf: (r: PaymentTrackingRow) => string,
  limit?: number
): Breakdown[] {
  const byKey = new Map<string, Breakdown>();
  for (const r of rows) {
    const key = keyOf(r) || '(unassigned)';
    const cur = byKey.get(key) ?? { key, label: labelOf(r) || 'Unassigned', sublabel: sublabelOf(r), value: 0, count: 0 };
    cur.value += num(r.pendingValue);
    cur.count += 1;
    byKey.set(key, cur);
  }
  const all = Array.from(byKey.values()).sort((a, b) => b.value - a.value);
  return limit ? all.slice(0, limit) : all;
}

/** Narrows rows to a calendar month by their Eindt (delivery date) — 'all' (or empty) is a no-op.
 * `deliveryDate` is stored as 'YYYY-MM-DD' (see paymentTrackingApi.ts's toPaymentTrackingRow), so
 * this is a plain string-slice compare, no Date parsing/timezone risk. Applied on top of whatever
 * the SAP Gjahr filter already scoped the fetch to (see useMonthYear's header comment). Generic so
 * it also works on VendorPOFollowupRow (Pending Approval), not just PaymentTrackingRow. */
/** A blank deliveryDate is NOT the same as "outside the selected month" — some rows (confirmed on
 * Pending Approval: certain Zaction buckets, e.g. Mail-for-P2P/Reverse-SES, have no schedule line
 * at all, per Eindt's own "not every row is guaranteed a schedule line" note above) never carry a
 * date to begin with. Excluding them here previously made real, actionable data silently vanish
 * from Pending Approval whenever a row like that came back — fixed 2026-09-15. A row with no date
 * always passes; only a row with a real date outside the selected month is filtered out. */
export function filterByMonth<T extends { deliveryDate: string }>(rows: T[], month: string): T[] {
  if (!month || month === 'all') return rows;
  return rows.filter((r) => !r.deliveryDate || r.deliveryDate.slice(5, 7) === month);
}

// Matches MonthYearContext's own FY_START_MONTH — kept as a second constant rather than importing
// it, since that context module also carries React/state concerns this pure-helpers file otherwise
// stays free of.
const FY_START_MONTH = 4;

/** GJAHR (financial year start year) for a 'YYYY-MM-DD' delivery date, Apr-Mar fiscal year. '' if
 * unparseable. */
export function fiscalYearOf(deliveryDate: string): string {
  if (!deliveryDate) return '';
  const [y, m] = deliveryDate.split('-').map(Number);
  if (!y || !m) return '';
  return String(m >= FY_START_MONTH ? y : y - 1);
}

/** Narrows rows to a financial year by their delivery date, client-side — for entities like
 * ZVendorPOFollowupSet (Pending Approval) that don't expose a Gjahr server filter the way
 * ZProvisionTrackSet does (see paymentTrackingApi.ts's fetchProvisionPOs). Same "no date is not
 * the same as wrong year" fix as filterByMonth above — a row with no delivery date always passes.
 */
export function filterByFiscalYear<T extends { deliveryDate: string }>(rows: T[], year: string): T[] {
  if (!year) return rows;
  return rows.filter((r) => !r.deliveryDate || fiscalYearOf(r.deliveryDate) === year);
}

/** 'YYYY-MM-DD' -> 'DD Mon YYYY' for display; '' for a blank/unparseable date rather than
 * throwing, since not every row is guaranteed a schedule line. */
export function formatDeliveryDate(deliveryDate: string): string {
  if (!deliveryDate) return '';
  const [y, m, d] = deliveryDate.split('-');
  if (!y || !m || !d) return '';
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
