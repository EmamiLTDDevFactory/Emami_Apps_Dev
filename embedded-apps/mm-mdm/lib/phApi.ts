/**
 * Product hierarchy, READ side of the SAP service ZMDM_PH_SRV, through the Emami Apps backend
 * (backend/mmMdmPh.js, mounted at <api>/me/mm-mdm-ph). The browser never calls SAP. The hub sign-in token authenticates the call.
 *
 * Live only on the DEV site (host contains "dev") or when NEXT_PUBLIC_MDM_PH_LIVE=1 was set at build time. Everywhere else
 * (localhost, the e2e tests, PRD) the demo tree in valueHelps.ts is used and nothing here is called.
 *
 * Service map (LevelValueSet, Level 1..6 = Banner, Brand, Product, SKU, Variant, Scheme; the app's levels are 0..5):
 *   Code   = this level's own code (2/4/4/3/3/2 digits)
 *   Parent = the full path of the levels above (empty for the banner), Prodh = Parent + Code
 */
import type { Opt } from './valueHelps';

/** Code length of each level in SAP (T179): banner 2, brand 4, product 4, SKU 3, variant 3, scheme 2 = 18 */
export const PH_LIVE_SEGMENTS = [2, 4, 4, 3, 3, 2] as const;

const HUB_TOKEN_KEY = 'emami_apps_session_token';

export function phLive(): boolean {
  if (process.env.NEXT_PUBLIC_MDM_PH_LIVE === '1') return true;
  return typeof window !== 'undefined' && window.location.hostname.includes('dev');
}

function apiBase(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}/me/mm-mdm-ph`;
}

function hubToken(): string {
  try {
    return window.localStorage.getItem(HUB_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export class PhApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { headers: { Authorization: `Bearer ${hubToken()}` }, cache: 'no-store' });
  } catch {
    throw new PhApiError('The product hierarchy service could not be reached. Check your connection and try again.', 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    throw new PhApiError(msg || `The product hierarchy service answered HTTP ${res.status}.`, res.status);
  }
  return body as T;
}

/* ------------------------------------------------------------------ */
/* Row types (what the backend returns)                                 */
/* ------------------------------------------------------------------ */

export interface PhLevelRow { level: number; code: string; text: string; prodh: string; parent: string }
export interface PhCostCenter { kostl: string; text: string }
export interface PhRequest {
  transactionId: string; wiId: string;
  banner: string; bannerDesc: string; brand: string; brandDesc: string; product: string; productDesc: string;
  sku: string; skuDesc: string; variant: string; variantDesc: string; scheme: string; schemeDesc: string;
  hierarchy: string; costCenter: string; costCenterDesc: string;
  /** I raised, A waiting approval, C waiting cost centre, D done */
  step: string; initiator: string; createdOn: string | null; createdAt: string; message: string;
}
export interface PhTask { wiId: string; transactionId: string; mode: string; text: string; status: string; initiator: string; createdOn: string | null }

export const fetchLevel = (level: number, parent = '') =>
  get<PhLevelRow[]>(`/levels?level=${level + 1}${parent ? `&parent=${encodeURIComponent(parent)}` : ''}`);
export const fetchCostCenters = (text = '') => get<PhCostCenter[]>(`/cost-centers${text ? `?text=${encodeURIComponent(text)}` : ''}`);
export const fetchRequests = (opts: { initiator?: string; step?: string; top?: number } = {}) => {
  const q = Object.entries(opts).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return get<PhRequest[]>(`/requests${q ? `?${q}` : ''}`);
};
export const fetchTasks = () => get<PhTask[]>('/tasks');

/* ------------------------------------------------------------------ */
/* Level cache: valueHelps reads it synchronously, screens load into it */
/* ------------------------------------------------------------------ */

const cache = new Map<string, Opt[]>();
const inflight = new Map<string, Promise<void>>();
const errors = new Map<string, string>();
const listeners = new Set<() => void>();
let tick = 0;

const keyOf = (level: number, parent: string) => `${level}:${parent}`;
const emit = () => { tick++; listeners.forEach((l) => l()); };

export const phSubscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const phTick = () => tick;

/** Options already loaded for a level under the path chosen above it; undefined when not loaded yet */
export function phCached(level: number, path: string[]): Opt[] | undefined {
  return cache.get(keyOf(level, path.slice(0, level).join('')));
}

export function phError(level: number, path: string[]): string {
  return errors.get(keyOf(level, path.slice(0, level).join(''))) ?? '';
}

/** Loads the values of `level` (0..5) under the codes above it, once; later calls reuse the cache. */
export function phLoad(level: number, path: string[], force = false): Promise<void> {
  const parent = path.slice(0, level).join('');
  const key = keyOf(level, parent);
  if (!force && cache.has(key)) return Promise.resolve();
  const running = inflight.get(key);
  if (running) return running;
  const p = fetchLevel(level, parent)
    .then((rows) => {
      errors.delete(key);
      cache.set(key, rows.map((r) => ({ value: r.code, label: r.text })));
    })
    .catch((e: Error) => { errors.set(key, e.message); })
    .finally(() => { inflight.delete(key); emit(); });
  inflight.set(key, p);
  return p;
}

/** Loads every level of an 18-digit code so its texts can be shown */
export function phLoadCode(code: string): Promise<void> {
  const codes: string[] = [];
  let at = 0;
  for (const len of PH_LIVE_SEGMENTS) { codes.push(code.slice(at, at + len)); at += len; }
  return Promise.all(codes.map((_, i) => phLoad(i, codes))).then(() => undefined);
}

/** Forget what was loaded (after a write, or a manual refresh) */
export function phReset() { cache.clear(); errors.clear(); emit(); }
