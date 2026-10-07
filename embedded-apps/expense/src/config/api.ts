/**
 * API Base URL Configuration
 */

const getBaseUrl = (): string => {
  // Environment variable override
  if (
    process.env.NEXT_PUBLIC_API_URL &&
    process.env.NEXT_PUBLIC_API_URL.trim() !== ''
  ) {
    return process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, '');
  }

  // Web: construct backend URL based on current origin
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;

    // In production or when already running on backend port 3000, use same origin
    if (port === '3000' || process.env.NODE_ENV === 'production') {
      return window.location.origin;
    }

    return `${protocol}//${hostname}:3000`;
  }

  // Default fallback
  return 'http://172.17.2.21:3000';
};

export const API_BASE_URL = getBaseUrl();

// Direct SAP OData gateway base — only for entity sets Basis has explicitly opened for
// anonymous GET access (currently GstSet, mirroring the exception already granted for
// MoldHealthCheck's ZMM_MOULD_CARE_SRV). Everything else (login/OTP, claim submission,
// claim-header lookups) still goes through the backend, since it needs the Azure OAuth
// token and/or shouldn't be readable by anyone without restriction.
// Hardcoded (not env-based) on purpose, same convention as MoldHealthCheck's lib/config.ts —
// this deploys with zero extra configuration, no Amplify Console env var needed.
// Only the landscape segment (NGD / NGQ / NWP) changes between environments — same host,
// same service name. Quality is NGQ, not NWQ: the proxy rejects NWQ outright with
// {"error":"Invalid Landscape : NWQ"}, so do not use that spelling.
//
// Quality (NGQ) — ACTIVE. Verified live: GstSet 41,414 rows and TaxSet 1,933 rows returned
// from backend 10.17.9.4, so the service is registered and anonymous reads work.
export const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGQ/ZFI_EXPCLAIM_SRV';
// Development (NGD) — backend 10.17.10.12
// export const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZFI_EXPCLAIM_SRV';
// Production (NWP) — the landscape route exists, but ZFI_EXPCLAIM_SRV was NOT registered
// there as of this change ("No service found ... ZFI_EXPCLAIM_SRV"). It has to be transported
// and activated in /IWFND/MAINT_SERVICE before this line can be used. Pre-existing gap, not
// something this rewrite causes or is expected to fix.
// export const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NWP/ZFI_EXPCLAIM_SRV';
