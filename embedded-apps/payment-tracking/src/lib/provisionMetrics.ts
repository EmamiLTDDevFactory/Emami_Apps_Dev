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
 * the SAP Gjahr filter already scoped the fetch to (see useMonthYear's header comment). */
export function filterByMonth(rows: PaymentTrackingRow[], month: string): PaymentTrackingRow[] {
  if (!month || month === 'all') return rows;
  return rows.filter((r) => r.deliveryDate && r.deliveryDate.slice(5, 7) === month);
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
