// Live mode: every call goes to the Emami Apps backend (backend/tms.js, <api>/me/smartruck-tms). It checks the hub session and the
// "smartruck-tms" grant, applies the TMS roles and unit scope on the server, and talks to SAP (ZTMS_SRV) as the verified hub user.
// The browser never sends who it is: the backend takes the user from the session token.
import type { AppUser, Db } from './types';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

const HUB_TOKEN_KEY = 'emami_apps_session_token';
const MODE_KEY = 'smartruck_tms_mode';

/** Runtime switch (?mode=live | ?mode=demo, remembered in this browser), else build-time NEXT_PUBLIC_TMS_MODE, else by host (below). */
export function isLiveMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('mode');
    if (q === 'live' || q === 'demo') window.localStorage.setItem(MODE_KEY, q);
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === 'live' || saved === 'demo') return saved === 'live';
  } catch { /* ignore */ }
  if (process.env.NEXT_PUBLIC_TMS_MODE) return process.env.NEXT_PUBLIC_TMS_MODE === 'live';
  // The TMS backend is deployed on DEV only so far: dev.emamiapps.in runs live, every other host (production, localhost) stays demo.
  return window.location.hostname.startsWith('dev.');
}

function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_TMS_API_BASE;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}/me/smartruck-tms`;
}
const token = () => { try { return window.localStorage.getItem(HUB_TOKEN_KEY) || ''; } catch { return ''; } };

async function send<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: init?.method ?? 'GET', cache: 'no-store',
      headers: { Accept: 'application/json', ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch { throw new ApiError(0, 'The Emami Apps server cannot be reached. Check your connection and try again.'); }
  const text = await res.text();
  let json: unknown = {}; try { json = text ? JSON.parse(text) : {}; } catch { /* not json */ }
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error || `The server answered HTTP ${res.status}.`);
  return json as T;
}

export interface Me { user: AppUser; perms: string[]; integrations: { sap: string; eway: string; consent: string; ingest: string } }
export const liveApi = {
  me: () => send<Me>('/me'),
  db: (allUnits: boolean) => send<{ db: Db; serverNow: number }>(`/db${allUnits ? '?allUnits=1' : ''}`),
  cmd: <R = Record<string, unknown>>(c: Record<string, unknown>) => send<{ result: R; db: Db }>('/cmd', { method: 'POST', body: c }),
  reportCatalog: () => send<{ catalog: Record<string, string[]>; count: number }>('/reports/catalog'),
  report: (name: string, allUnits: boolean) => send<Record<string, string | number>[]>(`/reports/${encodeURIComponent(name)}${allUnits ? '?allUnits=1' : ''}`),
  importData: (payload: unknown, dryRun: boolean) => send<{ ok: boolean; errors?: string[]; counts: Record<string, number>; dryRun?: boolean }>(`/admin/import${dryRun ? '?dryRun=1' : ''}`, { method: 'POST', body: payload }),
};
