export interface Domain {
  id: string;
  tcode: string;
  label: string;
  short: string;
  description: string;
  enabled: boolean;
}

/** The seven master data objects governed by the portal. Only Material is live for now. */
export const DOMAINS: Domain[] = [
  { id: 'material', tcode: 'ZMDM_M', label: 'Material Master', short: 'MM', description: 'Create (MC) with 7-level approval; change and extension in phase 2', enabled: true },
  { id: 'customer', tcode: 'ZMDM_C', label: 'Customer Master', short: 'CU', description: 'Sold-to, ship-to and payer accounts', enabled: false },
  { id: 'vendor', tcode: 'ZMDM_V', label: 'Vendor Master', short: 'VE', description: 'Supplier general, company code and purchasing data', enabled: false },
  { id: 'glaccount', tcode: 'ZMDM_G', label: 'GL Account Master', short: 'GL', description: 'Chart of accounts and company code segments', enabled: false },
  { id: 'costcenter', tcode: 'ZMDM_K', label: 'Cost Center Master', short: 'CC', description: 'Cost centers and hierarchy assignment', enabled: false },
  { id: 'profitcenter', tcode: 'ZMDM_P', label: 'Profit Center Master', short: 'PC', description: 'Profit centers and segment assignment', enabled: false },
  { id: 'bank', tcode: 'ZMDM_B', label: 'Bank Master', short: 'BK', description: 'Bank keys and house bank details', enabled: false },
];

/** Accepts SAP-style input: "zmdm_m", "/nZMDM_M", "/oZMDM_C", "/n" (home) */
/** Set-up transaction done before material creation */
export const SETUP_TCODE = 'ZMDM_PH';
export const SETUP_PATH = '/master/hierarchy';

export function resolveTcode(raw: string): { code: string; home?: boolean; domain?: Domain; path?: string } {
  let code = raw.trim().toUpperCase();
  if (code.startsWith('/N') || code.startsWith('/O')) code = code.slice(2);
  if (code === '' || code === 'HOME' || code === 'SESSION_MANAGER' || code === 'SMEN') return { code, home: true };
  if (code === SETUP_TCODE) return { code, path: SETUP_PATH };
  return { code, domain: DOMAINS.find((d) => d.tcode === code) };
}
