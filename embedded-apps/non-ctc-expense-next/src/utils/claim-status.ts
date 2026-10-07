// Presentation-only renaming: the underlying ClaimStatus values ('Paid'/'Pending Release') stay
// exactly as SAP/ClaimContext use them everywhere (filtering, KPI counts, comparisons) — only the
// text shown to the user changes, at the point each screen renders it.
export function displayStatusLabel(status: string): string {
  if (status === 'Paid') return 'Posted';
  if (status === 'Pending Release') return 'Parked';
  return status;
}
