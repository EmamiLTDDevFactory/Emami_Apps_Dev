/**
 * Client of the MDM admin screens: POST /me/mm-mdm-admin/<AREA>/<op> (hub backend mmMdmAdmin.js -> SAP AdminCallSet -> ZCL_MM_MDM_ADM_<AREA>).
 * The hub decides who may call (grant role Admin for rules and workflow maintenance and for the all-users views); the browser never
 * sends the user or the admin flag. Nothing here is invented: an error carries SAP's messages.
 */
import { hubApiRoot, hubToken } from '../phApi';

export type AdminArea = 'WF' | 'RULES' | 'UWL' | 'DASH';
export interface AdminMessage { code?: string; message: string; severity: string; target?: string }

export class AdminApiError extends Error {
  constructor(message: string, public status: number, public messages: AdminMessage[] = []) { super(message); }
}

const base = () => `${hubApiRoot()}/me/mm-mdm-admin`;

async function send<T>(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${hubToken()}`, ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new AdminApiError('The admin service could not be reached. Check your connection and try again.', 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const b = body as { error?: string; messages?: AdminMessage[] } | null;
    throw new AdminApiError(b?.error || `The admin service answered HTTP ${res.status}.`, res.status, Array.isArray(b?.messages) ? b!.messages! : []);
  }
  return body as T;
}

/** One operation of an SAP area class, JSON in, JSON out */
export const adminCall = <T = unknown>(area: AdminArea, op: string, payload: Record<string, unknown> = {}) => send<T>('POST', `/${area}/${op}`, payload);

export interface AdminSession { user: string; isAdmin: boolean; areas: AdminArea[] }
export const getAdminSession = () => send<AdminSession>('GET', '/session');
