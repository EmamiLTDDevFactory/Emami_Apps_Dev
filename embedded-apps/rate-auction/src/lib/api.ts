'use client';

import { useEffect, useState } from 'react';

// This app's own backend (server/) holds the live auction. Hardcoded per hostname rather than a
// NEXT_PUBLIC_* env var, same as TimeSheet (see embedded-apps/timesheet/src/context/AppContext.tsx):
// dev.emamiapps.in must call the dev process, because the dev and prod hubs sign their session
// tokens with different secrets and only the matching server can verify them. Planned routes on
// 172.17.2.21's nginx: /dev-api/rate-auction/ -> rate-auction-api-dev, /api/rate-auction/ ->
// rate-auction-api. In local dev the server is reached directly.
const IS_DEV_HOST = typeof window !== 'undefined' && window.location.hostname.includes('dev');
export const API_BASE = process.env.NODE_ENV !== 'production'
  ? 'http://localhost:4110/api'
  : `https://audit-capa-api.emamiapps.in${IS_DEV_HOST ? '/dev-api/rate-auction' : '/api/rate-auction'}/api`;

export type AppRole = 'admin' | 'vendor';
export type Session = { email: string; role: AppRole; token: string };
export type Result = { ok: boolean; error?: string; [k: string]: unknown };

async function readJson(res: Response): Promise<Result> {
  const body = await res.json().catch(() => null);
  if (body && typeof body === 'object') return body as Result;
  return { ok: false, error: `Request failed (${res.status})` };
}

/** Exchanges the hub's own session token for this app's session (role comes from Manage Access). */
export async function hubLogin(hubToken: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/hub-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hubToken }),
  });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Sign-in failed.');
  return { email: String(d.email), role: d.role as AppRole, token: String(d.token) };
}

export async function demoEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/demo-enabled`);
    return Boolean((await res.json()).enabled);
  } catch {
    return false;
  }
}

export async function demoLogin(role: AppRole, email: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, email }),
  });
  const d = await readJson(res);
  if (!res.ok || !d.ok) throw new Error(d.error || 'Sign-in failed.');
  return { email: String(d.email), role: d.role as AppRole, token: String(d.token) };
}

export async function apiPost(token: string, path: string, body: object): Promise<Result> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return readJson(res);
  } catch {
    return { ok: false, error: 'Could not reach the Rate Auction server. Check your connection and try again.' };
  }
}

export async function apiGet<T = any>(token: string, path: string): Promise<T & { error?: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return (await res.json()) as T & { error?: string };
  } catch {
    return { error: 'Could not reach the Rate Auction server.' } as T & { error?: string };
  }
}

/** Live view over server-sent events, rebuilt by the server for this user's role every 500 ms.
 * EventSource reconnects on its own after a dropped connection; `connected` drives the banner. */
export function useLive(token: string | null) {
  const [view, setView] = useState<any>(null);
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    if (!token) return;
    const es = new EventSource(`${API_BASE}/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      setConnected(true);
      setView(JSON.parse(e.data));
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [token]);
  return { view, connected };
}
