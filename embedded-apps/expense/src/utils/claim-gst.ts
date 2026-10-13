// A claim only gets a vendor code (Lifnr) back from SAP when it was submitted with GSTIN details
// attached (see create/page.tsx's gstinChoice flow) - no separate "is this a GST claim" flag exists.
export function isGstClaim(claim: { lifnr?: string }): boolean {
  return !!claim.lifnr && claim.lifnr.trim().length > 0;
}
