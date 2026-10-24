import type { ActionName, ActionPayload, ActionResult, CascadeSet, Row } from './types';

/**
 * The app's only way to SAP. The browser never calls SAP: in live mode every call goes to the Emami Apps backend
 * (backend/cascadePricing.js, mounted at <api>/me/cascade-pricing), which holds the SAP connection and checks the hub
 * session and the Cascade Pricing grant. The hub's own sign-in token is read to authenticate the call; this app stores
 * nothing in the browser. There is no mock or demo data: every screen shows SAP's data.
 */

const HUB_TOKEN_KEY = 'emami_apps_session_token';

function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_CASCADE_API_BASE;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}/me/cascade-pricing`;
}

function hubToken(): string {
  try {
    return window.localStorage.getItem(HUB_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function call<T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  const token = hubToken();
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Accept: 'application/json', ...(init ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the pricing service. Check your connection.', 0);
  }
  const body = await readJson(res);
  if (!res.ok) {
    const msg = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : `Request failed (${res.status} ${res.statusText}).`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

/** Rows of an entity set. */
export async function getCascade(set: CascadeSet): Promise<Row[]> {
  const rows = await call<unknown>(`/cascade/${encodeURIComponent(set)}`);
  if (!Array.isArray(rows)) throw new ApiError('Unexpected answer from the pricing service.', 502);
  return rows as Row[];
}

/** __id is a client-side row id: never sent to SAP. */
const strip = (rows: Row[] | undefined) => rows?.map(({ __id: _id, ...rest }) => { void _id; return rest; });
function stripPayload(p?: ActionPayload): ActionPayload | undefined {
  if (!p) return p;
  return { ...p, ...(p.ROWS ? { ROWS: strip(p.ROWS) } : {}), ...(p.RATE_ROWS ? { RATE_ROWS: strip(p.RATE_ROWS) } : {}) };
}

/** One action through the backend; dates only when filled. */
export async function runAction(action: ActionName, payload?: ActionPayload, vfrom?: string, vto?: string): Promise<ActionResult> {
  const req = { action, payload: stripPayload(payload), ...(vfrom ? { vfrom } : {}), ...(vto ? { vto } : {}) };
  const r = await call<Partial<ActionResult>>('/action', { method: 'POST', body: req });
  return { processed: Number(r?.processed ?? 0) || 0, failed: Number(r?.failed ?? 0) || 0, message: String(r?.message ?? ''), data: typeof r?.data === 'string' ? r.data : '' };
}

/** SAP connectivity for the banner and footer. */
export async function checkHealth(): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    return await call<{ ok: boolean; count?: number }>('/health');
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'SAP connection unavailable' };
  }
}

/** The action's data (a JSON string) as an array; [] when empty or not an array. */
export function parseDataArray<T = Row>(result: ActionResult): T[] {
  if (!result.data) return [];
  try {
    const v: unknown = JSON.parse(result.data);
    return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : [];
  } catch {
    return [];
  }
}
