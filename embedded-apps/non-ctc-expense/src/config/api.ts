/**
 * API Base URL Configuration
 */

const getBaseUrl = (): string => {
  // Environment variable override
  if (
    process.env.EXPO_PUBLIC_API_URL &&
    process.env.EXPO_PUBLIC_API_URL.trim() !== ""
  ) {
    return process.env.EXPO_PUBLIC_API_URL.trim().replace(/\/+$/, "");
  }

  // Web: construct backend URL based on current origin
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;

    // In production or when already running on backend port 3000, use same origin
    if (port === "3000" || process.env.NODE_ENV === "production") {
      return window.location.origin;
    }

    return `${protocol}//${hostname}:3000`;
  }

  // React Native / default fallback
  return "http://172.17.2.21:3000";
};

export const API_BASE_URL = getBaseUrl();

// Direct SAP OData gateway base — only for entity sets Basis has explicitly opened for
// anonymous GET access (currently GstSet, mirroring the exception already granted for
// MoldHealthCheck's ZMM_MOULD_CARE_SRV). Everything else (login/OTP, claim submission,
// claim-header lookups) still goes through the backend, since it needs the Azure OAuth
// token and/or shouldn't be readable by anyone without restriction.
// Hardcoded (not env-based) on purpose, same convention as MoldHealthCheck's lib/config.ts —
// this deploys with zero extra configuration, no Amplify Console env var needed.
// Development (NGD)
export const SAP_BASE_URL = "https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZFI_EXPCLAIM_SRV";
// Quality (NGQ)
// export const SAP_BASE_URL = "https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGQ/ZFI_EXPCLAIM_SRV";
// Production (NWP)
// export const SAP_BASE_URL = "https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NWP/ZFI_EXPCLAIM_SRV";


