// Comma-separated amount for on-screen display (Indian grouping, e.g. 13,830.00) — never used for
// the Excel export's raw data, which needs a plain number for Excel to sort/calculate on.
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
