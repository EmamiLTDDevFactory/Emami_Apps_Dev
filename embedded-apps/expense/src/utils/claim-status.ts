// Presentation-only renaming: the underlying ClaimStatus values ('Paid'/'Pending Release') stay
// exactly as SAP/ClaimContext use them everywhere (filtering, KPI counts, comparisons) — only the
// text shown to the user changes, at the point each screen renders it.
export function displayStatusLabel(status: string): string {
  if (status === 'Paid') return 'Posted';
  // No park step anymore (H -> posted/S directly per the DOA handover) - "Awaiting Posting" reads
  // as a neutral in-progress state instead of implying the old two-step park-then-post process.
  if (status === 'Pending Release') return 'Awaiting Posting';
  return status;
}
