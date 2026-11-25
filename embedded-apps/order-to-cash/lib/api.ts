import type { Appointment, Dispute, Extraction, Po, PoHeader, PoLine, PoStatus, Row, SapRead, SoResult, Source } from './types';

/**
 * The app's only way to SAP and to its own records. The browser never calls SAP: every call goes to the Emami Apps
 * backend (backend/orderToCash.js at <api>/me/order-to-cash), which holds the SAP connection and the AI key and checks
 * the hub session and the Order to Cash grant. The hub's sign-in token authenticates the call. No demo data.
 */
const HUB_TOKEN_KEY = 'emami_apps_session_token';

function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_O2C_API_BASE;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}/me/order-to-cash`;
}

function hubToken(): string {
  try { return window.localStorage.getItem(HUB_TOKEN_KEY) || ''; } catch { return ''; }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown): Promise<T> {
  const token = hubToken();
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the Order to Cash service. Check your connection.', 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : `Request failed (${res.status}).`;
    throw new ApiError(res.status === 502 ? `SAP: ${msg}` : msg, res.status);
  }
  return data as T;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function checkHealth(): Promise<{ ok: boolean; system?: string; error?: string }> {
  try { return await call('/health'); } catch (e) { return { ok: false, error: errText(e) }; }
}
export async function getMe(): Promise<{ role: string; isAdmin: boolean; canWrite: boolean; email: string }> {
  try { return await call('/me'); } catch { return { role: '', isAdmin: false, canWrite: false, email: '' }; }
}

export const extractPo = (b: { fileName: string; text?: string; imageDataUrl?: string }) => call<Extraction>('/extract', 'POST', b);
export const listPos = (status?: PoStatus[]) => call<Po[]>(`/pos${status?.length ? `?status=${status.join(',')}` : ''}`);
export const getPo = (id: number) => call<Po>(`/pos/${id}`);
export const savePo = (b: { source: Source; fileName: string; header: PoHeader; lines: PoLine[]; warnings: string[] }) => call<Po>('/pos', 'POST', b);
export const updatePo = (id: number, b: { version: number; header?: PoHeader; lines?: PoLine[] }) => call<Po>(`/pos/${id}`, 'PUT', b);
export const rejectPo = (id: number, reason: string) => call<Po>(`/pos/${id}/reject`, 'POST', { reason });
export const validatePo = (id: number, opts: { autoAmend: boolean; priceTolPct: number }) => call<Po>(`/pos/${id}/validate`, 'POST', opts);
export const createSo = (id: number, testrun: boolean) => call<{ po: Po; result: SoResult }>(`/pos/${id}/sales-order`, 'POST', { testrun });
export const poEvents = (id: number) => call<{ at: string; actor: string; action: string; detail: Row }[]>(`/pos/${id}/events`);
export const getStats = () => call<{ pos: { status: PoStatus; n: number; today: number; straight: number; exceptions: number }[]; disputes: { status: string; n: number; amount: number }[]; exceptionCodes: { code: string; n: number }[] }>('/stats');

export async function sapRead(action: SapRead, filters: Row = {}): Promise<{ rows: Row[]; truncated: boolean }> {
  const r = await call<{ rows?: Row[]; truncated?: boolean }>(`/sap/${action}`, 'POST', filters);
  return { rows: Array.isArray(r?.rows) ? r.rows : [], truncated: !!r?.truncated };
}
export const createDeliveries = (items: { VBELN: string; POSNR: string; QTY: number }[]) => call<{ deliveries: Row[]; messages: { TYPE: string; MESSAGE: string }[] }>('/sap/CREATE_DELIVERY', 'POST', { ITEMS: items });

export const listAppointments = () => call<Appointment[]>('/appointments');
export const saveAppointment = (a: Partial<Appointment> & { delivery: string }) => call<Appointment>('/appointments', 'POST', a);
export const listFlags = (kind: 'asn' | 'invoice_sent') => call<{ ref: string; data: Row; by_user: string; at: string }[]>(`/flags?kind=${kind}`);
export const setFlags = (kind: 'asn' | 'invoice_sent', refs: string[], data?: Row) => call<{ count: number }>('/flags', 'POST', { kind, refs, data });
export const listDisputes = () => call<Dispute[]>('/disputes');
export const openDispute = (d: { ref_type: string; ref_no: string; kunnr?: string; name1?: string; amount?: number | null; reason: string; note?: string; owner?: string }) => call<Dispute>('/disputes', 'POST', d);
export const updateDispute = (id: number, d: { status?: Dispute['status']; owner?: string; note?: string }) => call<Dispute>(`/disputes/${id}`, 'PUT', d);
export const grnRecon = (grn: Row[]) => call<{ rows: Row[]; invoices: number; found: number }>('/grn-recon', 'POST', { grn });
export const cashMatch = (remits: Row[]) => call<{ rows: Row[]; openItems: number }>('/cash-match', 'POST', { remits });
