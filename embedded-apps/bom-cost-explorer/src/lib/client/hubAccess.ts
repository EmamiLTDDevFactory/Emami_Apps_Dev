'use client';
/**
 * The person's Manage Access role on this app (plus their Emami Apps access level) - used to show admin tools
 * (connection diagnostics, expand re-test) and to allow plan writes. Same endpoint every sibling app uses (po-followup, mediclaim...):
 * the hub's Manage Access API, which returns roles, never SAP data. Fails closed (not admin).
 */
const APP_ID = 'bom-cost-explorer';

function accessApiBase(): string {
  const env = process.env.NEXT_PUBLIC_ACCESS_API_URL;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}`;
}

type AccessMe = { accessLevel?: string; apps?: { appId: string; role: string }[] };

/** Emami Apps (hub) access levels that count as Admin of this app too. */
export const HUB_ADMIN_LEVELS = ['Super Admin', 'Admin'];

/**
 * Effective role on this app: 'Admin' for this app's Admin role AND for Emami Apps Super Admins / Admins (they have all
 * access here, as on the cost watch backend); otherwise the Manage Access role ('Planner', 'User', '' = none).
 */
export function effectiveRole(data: AccessMe): string {
  const own = data.apps?.find((a) => a.appId === APP_ID)?.role ?? '';
  return own === 'Admin' || HUB_ADMIN_LEVELS.includes(String(data.accessLevel ?? '')) ? 'Admin' : own;
}

async function fetchAccess(email: string): Promise<AccessMe> {
  const res = await fetch(`${accessApiBase()}/access/me?email=${encodeURIComponent(email)}`, { cache: 'no-store' });
  return (await res.json()) as AccessMe;
}

/** Admin of this app (own Admin role or an Emami Apps admin): every feature, including the admin tools. Fails closed. */
export async function fetchIsAdmin(email: string): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_MOCK_SAP === 'true') return true; // local development
  try {
    return effectiveRole(await fetchAccess(email)) === 'Admin';
  } catch {
    return false;
  }
}

/** This app's effective role for the person ('' = none / unknown). Fails closed. Used by the Production Plan module:
 * writes need 'Planner' or 'Admin' (Admin includes Emami Apps admins). */
export async function fetchAppRole(email: string): Promise<string> {
  if (process.env.NEXT_PUBLIC_MOCK_SAP === 'true') return 'Admin'; // local development
  try {
    return effectiveRole(await fetchAccess(email));
  } catch {
    return '';
  }
}
