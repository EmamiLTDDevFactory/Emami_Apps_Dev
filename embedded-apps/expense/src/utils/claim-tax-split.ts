// SAP only populates ExpenseAmt/TaxAmaount once a GST claim has actually gone through a tax-code
// release (leaves them at '0.000' otherwise) - see claim/page.tsx's original persistedExpenseAmt/
// persistedTaxAmount read, which this mirrors so list cards can show the same real, already-known
// split instead of guessing one.
export function getPersistedTaxSplit(claim: { expenseAmt?: number; taxAmaount?: number }): { expenseAmt: number; taxAmt: number } | null {
  const expenseAmt = claim.expenseAmt || 0;
  const taxAmt = claim.taxAmaount || 0;
  if (expenseAmt > 0 && taxAmt > 0) return { expenseAmt, taxAmt };
  return null;
}
