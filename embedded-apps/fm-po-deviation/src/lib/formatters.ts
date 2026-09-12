/** en-IN grouping (lakhs/crores) — same formatting choice every sibling Provision/Payment
 * Tracking screen in this repo already uses for INR-denominated amounts. */
export function formatCurrency(waers: string, netwr: string): string {
  if (!netwr) return '';
  const value = parseFloat(netwr);
  if (Number.isNaN(value)) return netwr;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${waers || 'INR'} ${formatted}`;
}

export function formatNumber(value: string): string {
  if (!value) return '';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

/** 'YYYY-MM-DD' -> 'DD Mon YYYY', matching every sibling screen's date display. Empty/unparseable
 * input returns an em dash rather than "Invalid Date". */
export function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string, time: string): string {
  const d = formatDate(iso);
  if (d === '—') return time || '—';
  return time ? `${d} · ${time}` : d;
}

export function releaseStatusLabel(zpoInd: string): string {
  return zpoInd === 'R' ? 'Released' : 'Unreleased';
}

/** Whole days between a 'YYYY-MM-DD' date and now — the basis for the pending-approvals SLA/aging
 * indicator (see AgingBadge in PoCard.tsx). Negative/unparseable input returns null rather than a
 * misleading number, since a PO dated in the future or with an unparseable date has no meaningful
 * "age". */
export function daysSince(iso: string): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Date.now() - then;
  if (diff < 0) return null;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** Threshold above which a PO is flagged "High Value" for extra scrutiny — a common
 * segregation-of-duties practice in approval workflows (a second look for anything unusually
 * large, regardless of who it's assigned to). Currency-agnostic on purpose: this app's data is
 * overwhelmingly INR, and a single fixed threshold is simpler and more predictable than a
 * per-currency table for a first cut — revisit if a real multi-currency case shows up. */
export const HIGH_VALUE_THRESHOLD = 200000;

export function isHighValue(netwr: string): boolean {
  const n = parseFloat(netwr);
  return !Number.isNaN(n) && n >= HIGH_VALUE_THRESHOLD;
}
