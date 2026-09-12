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
