'use client';
import { useEffect, useState } from 'react';

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const STATIC = process.env.NEXT_PUBLIC_BUILD_TARGET === 'static';

/**
 * Where the BFF lives. Server build: same origin. Static (embedded) build: hardcoded per hostname,
 * same convention as Rate Auction / TimeSheet - dev.emamiapps.in must call the dev BFF because the
 * dev and prod hubs sign their tokens with different secrets. nginx on 172.17.2.21 routes
 * /dev-api/bom-cost/ and /api/bom-cost/ to the two PM2 processes (prefix stripped).
 * NEXT_PUBLIC_BFF_URL overrides everything.
 */
export function bffBase(): string {
  const override = process.env.NEXT_PUBLIC_BFF_URL;
  if (override) return override.replace(/\/+$/, '');
  if (!STATIC || typeof window === 'undefined') return BASE_PATH;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3210';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') ? '/dev-api/bom-cost' : '/api/bom-cost'}`;
}

export interface AppSession {
  token: string;
  expiresAt: number;
  user: { email: string; name: string; role: string };
}

const KEY = 'bce:session';
// Same-origin key the Emami Apps hub writes on login (see embedded-apps/*/src/lib/hubEmailLogin.ts).
export const HUB_TOKEN_KEY = 'emami_apps_session_token';

export function readSession(): AppSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as AppSession | null;
    return s && s.expiresAt > Date.now() + 60_000 ? s : null;
  } catch {
    return null;
  }
}
export function writeSession(s: AppSession | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
export function hubToken(): string | null {
  try {
    return localStorage.getItem(HUB_TOKEN_KEY);
  } catch {
    return null;
  }
}

export const signinUrl = () => `${BASE_PATH}/signin/?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;

export async function exchange(body: { hubToken: string } | { demo: { email: string } }): Promise<AppSession> {
  const res = await fetch(`${bffBase()}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Sign-in failed (${res.status})`);
  writeSession(data as AppSession);
  return data as AppSession;
}

/** Valid session or, silently, a fresh one from the hub token; otherwise go to /signin. */
export function useAppSession() {
  const [session, setSession] = useState<AppSession | null>(null);
  useEffect(() => {
    const s = readSession();
    if (s) return setSession(s);
    const t = hubToken();
    if (t) {
      exchange({ hubToken: t }).then(setSession).catch(() => (window.location.href = signinUrl()));
      return;
    }
    window.location.href = signinUrl();
  }, []);
  const signOut = () => {
    writeSession(null);
    window.location.href = `${BASE_PATH}/signin/?signedOut=1`;
  };
  return { session, signOut };
}
