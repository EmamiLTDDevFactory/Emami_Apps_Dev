'use client';
/**
 * Daily cost watch API (hub backend, backend/costWatch.js), mounted at <access api>/me/cost-watch so it rides the
 * existing /api/me proxy. The hub session token goes as Bearer; the server checks the Costing Cockpit grant.
 * NEXT_PUBLIC_WATCH_ENABLED (default false; on for the deployed DEV build) shows the Cost watch pages.
 */
import { HUB_TOKEN_KEY } from '../client/session';

export const WATCH_ENABLED = String(process.env.NEXT_PUBLIC_WATCH_ENABLED ?? 'false').toLowerCase() === 'true';

function base(): string {
  const env = process.env.NEXT_PUBLIC_ACCESS_API_URL;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}`;
}

export class WatchError extends Error { constructor(msg: string, public status: number) { super(msg); } }

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let token = '';
  try { token = localStorage.getItem(HUB_TOKEN_KEY) || ''; } catch { /* storage blocked */ }
  let res: Response;
  try {
    res = await fetch(`${base()}/me/cost-watch${path}`, { method: init.method ?? 'GET', headers: { ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: init.body !== undefined ? JSON.stringify(init.body) : undefined, cache: 'no-store' });
  } catch {
    throw new WatchError('Could not reach the cost watch service. Check your connection.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new WatchError(data?.error || `Cost watch error (${res.status}).`, res.status);
  return data as T;
}

export interface WatchSettings { prio: string[]; donor: string; lookback: number; freightDays: number; stdFrt: boolean; inclFrt: boolean; inclCover: boolean }
export interface WatchItem { id: string; owner: string; name: string; system: string; skus: string[]; plants: string[]; qty: string; settings: WatchSettings; thresholds: Record<string, number>; recipients: string[]; plan1: string | null; active: boolean; open_alerts?: number; last_run?: string | null }
export interface Alert { id: string; watch_id: string; watch_name: string; rule: string; severity: 'high' | 'medium' | 'low'; sku: string; plant: string; idnrk: string; direction: string; impact_inr: string; evidence: Record<string, unknown>; first_seen: string; last_seen: string; status: string; ack_by: string | null; snooze_until: string | null }
export interface SnapLine { idnrk: string; maktx: string; meins: string; q: string; p_inr: string; r_loc: string; f_loc: string; fx_inr: string; sel_source: string }

export const watchApi = {
  me: () => call<{ canEdit: boolean; isAdmin: boolean; enabled: boolean; scheduler: boolean; system: string }>('/me'),
  items: () => call<{ items: WatchItem[] }>('/items'),
  create: (b: Partial<WatchItem>) => call<{ id: string }>('/items', { method: 'POST', body: b }),
  update: (id: string, b: Partial<WatchItem>) => call('/items/' + encodeURIComponent(id), { method: 'PUT', body: b }),
  remove: (id: string) => call('/items/' + encodeURIComponent(id), { method: 'DELETE' }),
  runNow: (id: string, digest = false) => call<{ runs: number }>(`/items/${encodeURIComponent(id)}/run-now`, { method: 'POST', body: { digest } }),
  alerts: (f: Record<string, string>) => call<{ alerts: Alert[]; rules: Record<string, string> }>(`/alerts?${new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString().replace(/\+/g, '%20')}`),
  alert: (id: string) => call<{ alert: Alert & { settings: WatchSettings; qty: string; plan1: string | null }; before: { ts: string; total_per_unit: string; lines: SnapLine[] } | null; after: { ts: string; total_per_unit: string; lines: SnapLine[] } | null; rules: Record<string, string> }>('/alerts/' + encodeURIComponent(id)),
  ack: (id: string) => call(`/alerts/${encodeURIComponent(id)}/ack`, { method: 'POST', body: {} }),
  snooze: (id: string, days: 7 | 30) => call(`/alerts/${encodeURIComponent(id)}/snooze`, { method: 'POST', body: { days } }),
  admin: () => call<{ runs: Record<string, unknown>[]; digests: Record<string, unknown>[]; lastRunDate: string | null; enabled: boolean; scheduler: boolean; system: string; running: boolean }>('/admin'),
};
