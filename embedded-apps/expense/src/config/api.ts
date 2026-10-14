/**
 * API Base URL Configuration
 */

const getBaseUrl = (): string => {
  // No environment-variable override here on purpose. `NEXT_PUBLIC_API_URL` is already a name
  // claimed at the Amplify app level for the hub's own login flow (points at the hub-auth
  // Lambda) — checking the same name here meant this app silently inherited THAT Lambda's URL
  // in production (confirmed live: requests were hitting emami-apps-hub-auth-dev's Lambda
  // Function URL instead of this app's backend, 403ing since that Lambda has no
  // /api/expense/extract-document route or CORS for this origin). Always use the hardcoded
  // backend URL below instead.

  // Hardcoded (not origin-derived) on purpose, same convention as SAP_BASE_URL below — this app's
  // frontend (Amplify, HTTPS) and its backend (172.17.2.21) are two separate hosts, so "same
  // origin as the page" is never correct here, and a plain http://172.17.2.21:4102 URL would be
  // blocked by the browser as mixed content from an HTTPS page anyway. Instead this goes through
  // the SAME nginx HTTPS reverse proxy every other embedded app's backend uses on this box
  // (audit-capa-api.emamiapps.in — a shared/misleadingly-named domain, not audit-capa-specific;
  // see e.g. timesheet's AppContext.tsx for the identical pattern), which strips the /dev-api/
  // expense/ prefix and forwards to localhost:4102 (the expense-api-dev PM2 process — see
  // embedded-apps/expense/server). Dev-only for now, same reasoning as SAP_BASE_URL below
  // pointing at NGQ, not NWP: no prod expense-api process or /api/expense/ nginx route exists yet.
  return 'https://audit-capa-api.emamiapps.in/dev-api/expense';
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
