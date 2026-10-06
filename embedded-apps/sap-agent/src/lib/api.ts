'use client';
/**
 * Client for the sap-agent server (server/sap_agent_web). The browser never talks to SAP or the model:
 * the server holds the SAP and Anthropic credentials and runs the agent; this page starts runs, follows
 * their events and answers approvals.
 *
 * Server URL: NEXT_PUBLIC_SAP_AGENT_API, else per hostname - localhost -> http://localhost:4130,
 * dev.* -> https://sap-agent.emamiapps.in/dev, otherwise https://sap-agent.emamiapps.in.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_SAP_AGENT_API;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4130';
  return host.includes('dev') ? 'https://sap-agent.emamiapps.in/dev' : 'https://sap-agent.emamiapps.in';
}

const HUB_EMAIL_KEY = 'emami_apps_user_email';
const HUB_TOKEN_KEY = 'emami_apps_session_token';
const SESSION_KEY = 'sap-agent:session';

export interface Session {
  token: string;
  email: string;
  expiresAt: number;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function readSession(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as Session | null;
    return s && s.expiresAt > Date.now() + 60_000 ? s : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode */
  }
}

export function hubSignedIn(): boolean {
  try {
    return !!(localStorage.getItem(HUB_TOKEN_KEY) && localStorage.getItem(HUB_EMAIL_KEY));
  } catch {
    return false;
  }
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const d = body?.error ?? body?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: { msg?: string }) => x.msg).join('; ');
  return `Request failed (${res.status})`;
}

/** Hub session -> this server's admin session (Manage Access role Admin on sap-agent). */
export async function signIn(): Promise<Session> {
  const existing = readSession();
  if (existing) return existing;
  let hubToken = '';
  try {
    hubToken = localStorage.getItem(HUB_TOKEN_KEY) || '';
  } catch {
    /* ignore */
  }
  if (!hubToken && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    // Local development: the server allows a dev sign-in only when ALLOW_DEV_LOGIN=true.
    const res = await fetch(`${apiBase()}/api/session/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'developer@example.com' }) });
    if (!res.ok) throw new ApiError(await readError(res), res.status);
    const s = (await res.json()) as Session;
    writeSession(s);
    return s;
  }
  if (!hubToken) throw new ApiError('Open SAP Agent from the Emami Apps hub - your sign-in comes from there.', 401);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubToken }) });
  } catch {
    throw new ApiError('The SAP Agent server cannot be reached.', 0);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  const s = (await res.json()) as Session;
  writeSession(s);
  return s;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const s = readSession() ?? (await signIn());
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}`, ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError('The SAP Agent server cannot be reached.', 0);
  }
  if (res.status === 401) writeSession(null);
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return (await res.json()) as T;
}

// ---- types (mirror server/sap_agent_web) -------------------------------------------------------
export interface EngineConfig {
  host: string; client: string; user: string; passwordSet: boolean; allowedSids: string[]; allowedPackages: string[];
  readOnly: boolean; allowRelease: boolean; approval: string; model: string; maxSteps: number; handlerPath: string;
  bdcTcodes: string[]; indexTables: string[];
}
export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'done' | 'failed' | 'stopped' | 'cancelled';
export interface PendingApproval { id: string; action: string; detail: string; requestedAt: number }
export interface RunSummary {
  id: string; kind: 'task' | 'deploy' | 'bootstrap' | 'doctor'; owner: string; title: string; status: RunStatus;
  created: number; finished: number | null; events: number; pendingApproval: PendingApproval | null;
}
export interface RunEvent { seq: number; ts: number; type: string; [k: string]: unknown }
export interface RunDetail extends RunSummary { params: Record<string, unknown>; result: Record<string, unknown>; eventList: RunEvent[] }
export interface Capability { key: string; tier: string; maturity: string; how: string; verify?: string }
export interface ManifestInfo { path: string; name: string; package?: string; steps: { id: string; type: string; title: string }[]; error?: string }
export interface AuditEntry { ts: string; actor: string; event: string; [k: string]: unknown }

export const ACTIVE: RunStatus[] = ['queued', 'running', 'waiting_approval'];

export const api = {
  config: () => call<{ user: string; engine: EngineConfig; anthropicKeySet: boolean; active: RunSummary | null }>('/api/config'),
  capabilities: () => call<{ capabilities: Capability[] }>('/api/capabilities'),
  manifests: () => call<{ manifests: ManifestInfo[]; bootstrap: string }>('/api/manifests'),
  runs: () => call<{ runs: RunSummary[] }>('/api/runs'),
  run: (id: string) => call<RunDetail>(`/api/runs/${id}`),
  start: (body: Record<string, unknown>) => call<RunSummary>('/api/runs', { method: 'POST', body: JSON.stringify(body) }),
  decide: (id: string, approvalId: string, approve: boolean, confirm: string) =>
    call<{ ok: boolean }>(`/api/runs/${id}/approvals/${approvalId}`, { method: 'POST', body: JSON.stringify({ approve, confirm }) }),
  cancel: (id: string) => call<{ ok: boolean }>(`/api/runs/${id}/cancel`, { method: 'POST' }),
  audit: (limit = 200) => call<{ entries: AuditEntry[] }>(`/api/audit?limit=${limit}`),
};

/** Follow a run's events (server-sent events; EventSource cannot send headers, so the token goes in the URL). */
export function followRun(id: string, after: number, onEvent: (e: RunEvent) => void, onEnd: () => void): () => void {
  const s = readSession();
  if (!s) {
    onEnd();
    return () => undefined;
  }
  const es = new EventSource(`${apiBase()}/api/runs/${id}/stream?after=${after}&token=${encodeURIComponent(s.token)}`);
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data) as RunEvent);
    } catch {
      /* ignore */
    }
  };
  es.onerror = () => {
    es.close();
    onEnd();
  };
  return () => es.close();
}
