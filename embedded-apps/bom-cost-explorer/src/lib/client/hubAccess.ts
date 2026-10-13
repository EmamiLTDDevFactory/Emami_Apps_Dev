'use client';
/**
 * The person's Manage Access role on this app - used ONLY to show admin tools (connection
 * diagnostics, expand re-test). Same endpoint every sibling app uses (po-followup, mediclaim...):
 * the hub's Manage Access API, which returns roles, never SAP data. Fails closed (not admin).
 */
const APP_ID = 'bom-cost-explorer';

function accessApiBase(): string {
  const env = process.env.NEXT_PUBLIC_ACCESS_API_URL;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}`;
}

export async function fetchIsAdmin(email: string): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_MOCK_SAP === 'true') return true; // local development
  try {
    const res = await fetch(`${accessApiBase()}/access/me?email=${encodeURIComponent(email)}`, { cache: 'no-store' });
    const data = (await res.json()) as { apps?: { appId: string; role: string }[] };
    return !!data.apps?.some((a) => a.appId === APP_ID && a.role === 'Admin');
  } catch {
    return false;
  }
}

/** This app's Manage Access role for the person ('' = none / unknown). Fails closed. Used by the
 * Production Plan module: writes need 'Planner' (or 'Admin'). */
export async function fetchAppRole(email: string): Promise<string> {
  if (process.env.NEXT_PUBLIC_MOCK_SAP === 'true') return 'Admin'; // local development
  try {
    const res = await fetch(`${accessApiBase()}/access/me?email=${encodeURIComponent(email)}`, { cache: 'no-store' });
    const data = (await res.json()) as { apps?: { appId: string; role: string }[] };
    return data.apps?.find((a) => a.appId === APP_ID)?.role ?? '';
  } catch {
    return '';
  }
}
