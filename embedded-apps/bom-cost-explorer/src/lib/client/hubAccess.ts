'use client';
/**
 * The person's Manage Access role on this app - used to show admin tools (connection diagnostics, expand re-test)
 * and to allow plan writes (Planner or Admin). Same endpoint every sibling app uses (po-followup, mediclaim...):
 * the hub's Manage Access API, which returns roles, never SAP data. Fails closed (not admin).
 */
const APP_ID = 'bom-cost-explorer';

function accessApiBase(): string {
  const env = process.env.NEXT_PUBLIC_ACCESS_API_URL;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}`;
}

type AccessMe = { apps?: { appId: string; role: string }[] };

/**
 * This app's Manage Access role only ('Admin', 'Planner', 'User', '' = none); the Emami Apps access level does not
 * count here. Admin has all access in this app, including everything a Planner does.
 */
export function effectiveRole(data: AccessMe): string {
  return data.apps?.find((a) => a.appId === APP_ID)?.role ?? '';
}

async function fetchAccess(email: string): Promise<AccessMe> {
  const res = await fetch(`${accessApiBase()}/access/me?email=${encodeURIComponent(email)}`, { cache: 'no-store' });
  return (await res.json()) as AccessMe;
}

/** Admin of this app (its Manage Access role Admin): every feature, including the admin tools. Fails closed. */
export async function fetchIsAdmin(email: string): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_MOCK_SAP === 'true') return true; // local development
  try {
    return effectiveRole(await fetchAccess(email)) === 'Admin';
  } catch {
    return false;
  }
}

/** This app's effective role for the person ('' = none / unknown). Fails closed. Used by the Production Plan module:
 * writes need 'Planner' or 'Admin' (Admin can do everything a Planner can). */
export async function fetchAppRole(email: string): Promise<string> {
  if (process.env.NEXT_PUBLIC_MOCK_SAP === 'true') return 'Admin'; // local development
  try {
    return effectiveRole(await fetchAccess(email));
  } catch {
    return '';
  }
}
