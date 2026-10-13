// Presentation-only trim: SAP's zero-padded claim id (e.g. "0000000073") stays exactly as-is for
// every backend call, URL param, and lookup key — only the text shown on list cards drops the
// leading zeros, so "0000000073" reads as "73" and later "0000000100" reads as "100" with no
// separate width-tracking logic needed.
export function displayClaimNumber(claimId: string): string {
  const trimmed = claimId.replace(/^0+(?=\d)/, '');
  return trimmed || claimId;
}
