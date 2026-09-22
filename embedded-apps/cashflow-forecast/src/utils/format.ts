// ---------------------------------------------------------------------------
// Display formatting utilities.
// Currency: this is DISPLAY-ONLY conversion. Transaction currency handling and
// official FX rates stay server-side (ABAP facade uses TCURR via
// BAPI_EXCHRATE_GETEXCHANGERATE). Fallback rates below are static, used only
// while the live rate isn't available (demo data / SAP unreachable).
// ---------------------------------------------------------------------------

export const CURRENCIES: Record<string, { symbol: string; rate: number }> = {
  INR: { symbol: '₹', rate: 1 },
  USD: { symbol: '$', rate: 1 / 88.4 },
  EUR: { symbol: '€', rate: 1 / 103.2 },
};

export type CurrencyCode = keyof typeof CURRENCIES;

/** Format an INR-Crore amount into the display currency. */
export function fmt(value: number, currency: CurrencyCode): string {
  const { symbol, rate } = CURRENCIES[currency];
  const converted = value * rate;
  const digits = currency === 'INR' ? 1 : 2;
  return `${symbol}${converted.toFixed(digits)} Cr`;
}

export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}
