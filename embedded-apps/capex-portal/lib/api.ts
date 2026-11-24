/**
 * The app's only way to SAP. The browser never calls SAP: every call goes to the Emami Apps backend
 * (backend/capex.js, mounted at <api>/me/capex), which checks the hub session + the CAPEX Portal grant and adds the
 * signed-in person's verified e-mail so SAP resolves role / plants / approver for THAT person. This app stores nothing.
 * There is no mock data. Types of the rows are in lib/entities.ts (generated from the live $metadata).
 */
const HUB_TOKEN_KEY = 'emami_apps_session_token';

export function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_CAPEX_API_BASE;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}/me/capex`;
}

function hubToken(): string {
  try { return window.localStorage.getItem(HUB_TOKEN_KEY) || ''; } catch { return ''; }
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code = '') { super(message); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${hubToken()}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('The Emami Apps server could not be reached. Check your connection and try again.', 0);
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) { try { json = JSON.parse(text); } catch { /* not JSON */ } }
  if (!res.ok) {
    const j = (json ?? {}) as { error?: string; code?: string };
    const msg = j.error || (res.status === 401 ? 'Your session has expired. Please sign in again.' : `Request failed (${res.status}).`);
    throw new ApiError(msg, res.status, j.code || '');
  }
  return json as T;
}

export interface ListOptions {
  $filter?: string; $select?: string; $expand?: string; $orderby?: string; $top?: number; $skip?: number;
  /** ask SAP for the total count ($inlinecount) */
  count?: boolean;
}

const qs = (o: ListOptions = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) {
    if (k === 'count') { if (v) p.set('$inlinecount', 'allpages'); continue; }
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** OData key literal: odataKey({ Budgetid: 'B-1' }) -> "('B-1')"; compound keys -> "(Doctype='CPE',Docid='X',Docseq=3)". */
export function odataKey(key: Record<string, string | number> | string): string {
  if (typeof key === 'string') return `('${key.replace(/'/g, "''")}')`;
  const e = Object.entries(key);
  const lit = (v: string | number) => (typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);
  return e.length === 1 ? `(${lit(e[0][1])})` : `(${e.map(([k, v]) => `${k}=${lit(v)}`).join(',')})`;
}

/** SAP OData string literal for $filter: eq(Werks, 'UN13') -> "Werks eq 'UN13'". */
export const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** A list read: GET <Set>[?options]. path can include a key and navigation: "CPESet('X')/CPEToVendors". */
export async function list<T>(path: string, o?: ListOptions): Promise<{ rows: T[]; count?: number }> {
  const r = await call<{ rows?: T[]; row?: T; count?: number }>('GET', `/odata/${encodeURI(path)}${qs(o)}`);
  return { rows: r.rows ?? (r.row ? [r.row] : []), count: r.count };
}

/** A single entity read: GET <Set>(key). Returns null when SAP says it does not exist. */
export async function get<T>(path: string, o?: ListOptions): Promise<T | null> {
  try {
    const r = await call<{ rows?: T[]; row?: T }>('GET', `/odata/${encodeURI(path)}${qs(o)}`);
    return (r.row ?? r.rows?.[0] ?? null) as T | null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Result of a function import. SAP's actions answer { Success, Message, ... }. */
export interface FnResult { Success?: boolean | string; Message?: string; [k: string]: unknown }

/** POST a function import (ApproveCPE, SubmitCPE, ...). Throws ApiError with SAP's own message on failure. */
export async function fn<T = FnResult>(name: string, params: Record<string, string | number | boolean | null | undefined> = {}): Promise<T> {
  return call<T>('POST', `/fn/${encodeURIComponent(name)}`, params);
}

/** Create (POST <Set>); deep inserts pass nested arrays (BudgetToCashFlows ...). */
export async function create<T = Record<string, unknown>>(set: string, body: unknown): Promise<T> {
  return call<T>('POST', `/entity/${encodeURIComponent(set)}`, body);
}

/** Update (PUT <Set>(key)). */
export async function update<T = Record<string, unknown>>(setWithKey: string, body: unknown): Promise<T> {
  return call<T>('PUT', `/entity/${encodeURI(setWithKey)}`, body);
}

/** Did a function import succeed? SAP sends Success as true or "X". */
export const isOk = (r: FnResult | null | undefined) => !!r && (r.Success === true || r.Success === 'X' || r.Success === 'true');

export async function health(): Promise<{ ok: boolean; system?: string; user?: unknown; error?: string }> {
  return call('GET', '/health');
}
