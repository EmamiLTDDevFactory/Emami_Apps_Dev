/**
 * Product hierarchy, READ side of the SAP service ZMDM_PH_SRV, through the Emami Apps backend
 * (backend/mmMdmPh.js, mounted at <api>/me/mm-mdm-ph). The browser never calls SAP. The hub sign-in token authenticates the call.
 *
 * Always live: the product hierarchy of the material screens comes only from SAP (there is no demo tree any more).
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
  return true;
}

/** Hub API root: the dev API on hosts containing "dev" and on localhost, the production API elsewhere (shared with lib/mmApi.ts) */
export function hubApiRoot(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}`;
}

function apiBase(): string {
  return `${hubApiRoot()}/me/mm-mdm-ph`;
}

/** The hub sign-in token the whole portal shares */
export function hubToken(): string {
  try {
    return window.localStorage.getItem(HUB_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export class PhApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${hubToken()}`, ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      cache: 'no-store',
    });
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

const get = <T>(path: string) => request<T>('GET', path);

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
/* Product hierarchy writes                                              */
/* ------------------------------------------------------------------ */

export interface PhFields {
  banner: string; bannerDesc: string; brand: string; brandDesc: string; product: string; productDesc: string;
  sku: string; skuDesc: string; variant: string; variantDesc: string; scheme: string; schemeDesc: string;
}
export const phValidate = (f: PhFields, mode: 'I' | 'A' | 'C' = 'I') =>
  request<{ ok: boolean; message: string }>('POST', '/ph/validate', { mode, ...f });
export const phInitiate = (f: PhFields) => request<PhRequest>('POST', '/ph/requests', f);
export const phApprove = (wiId: string, f: PhFields) => request<PhRequest>('POST', '/ph/approve', { wiId, ...f });
export const phAssignCostCenter = (wiId: string, costCenter: string) => request<PhRequest>('POST', '/ph/assign-cost-center', { wiId, costCenter });
export const phReject = (wiId: string) => request<PhRequest>('POST', '/ph/reject', { wiId });
export const phSendBack = (wiId: string) => request<PhRequest>('POST', '/ph/send-back', { wiId });

/** The request's six levels as the SAP function imports take them */
export function phFieldsOf(levels: { code: string; text: string }[]): PhFields {
  const l = (i: number) => levels[i] ?? { code: '', text: '' };
  return {
    banner: l(0).code, bannerDesc: l(0).text, brand: l(1).code, brandDesc: l(1).text, product: l(2).code, productDesc: l(2).text,
    sku: l(3).code, skuDesc: l(3).text, variant: l(4).code, variantDesc: l(4).text, scheme: l(5).code, schemeDesc: l(5).text,
  };
}

/* ------------------------------------------------------------------ */
/* CRS product grouping (CrsValueSet / CrsRequestSet / CrsVerticalSet ... of the same service)       */
/* ------------------------------------------------------------------ */

/** Real SAP code lengths: CRS product 9 digits, group 2 or 3 digits (existing data has both), SKU group 3 */
export const CRS_LIVE_LEN = { product: 9, group: 3, sku: 3 } as const;

export interface CrsValueRow { level: number; code: string; text: string; crsProd: string; prdGrp: string; skuSize: string; unit: string }
export interface CrsVertical { code: string; text: string }
export interface CrsFields {
  crsProd: string; crsProdDesc: string; prdGrp: string; prdGrpDesc: string; skuGrp: string; skuGrpDesc: string;
  busVert: string; skuSize: string; unit: string; comments: string;
}
export interface CrsRequest extends CrsFields {
  transactionId: string; wiId: string; flName: string; flType: string;
  /** A waiting approval, C created */
  step: string; initiator: string; createdOn: string; createdAt: string; message: string;
}
export interface CrsTask { wiId: string; transactionId: string; mode: string; text: string; status: string; initiator: string; createdOn: string }

export const fetchCrsVerticals = () => get<CrsVertical[]>('/crs/verticals');
export const fetchCrsValues = (level: 1 | 2 | 3, prod = '', group = '') =>
  get<CrsValueRow[]>(`/crs/values?level=${level}${prod ? `&prod=${encodeURIComponent(prod)}` : ''}${group ? `&group=${encodeURIComponent(group)}` : ''}`);
export const fetchCrsRequests = (top = 20) => get<CrsRequest[]>(`/crs/requests?top=${top}`);
export const fetchCrsTasks = () => get<CrsTask[]>('/crs/tasks');
export const crsValidate = (fields: CrsFields, mode: 'I' | 'A' = 'I') =>
  request<{ ok: boolean; message: string; request: CrsRequest }>('POST', '/crs/validate', { mode, ...fields });
export const crsInitiate = (fields: CrsFields & { flName: string; flType: string; flData: string }) =>
  request<CrsRequest>('POST', '/crs/requests', fields);
export const crsApprove = (wiId: string, extra: { skuSize?: string; unit?: string; comments?: string } = {}) =>
  request<CrsRequest>('POST', '/crs/approve', { wiId, ...extra });
export const crsReject = (wiId: string) => request<CrsRequest>('POST', '/crs/reject', { wiId });

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
