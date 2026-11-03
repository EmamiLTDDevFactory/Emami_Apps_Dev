// Client of the app. Two modes behind one interface:
//   demo (default): the built-in demo service runs in the browser, no SAP needed (src/lib/demo/*).
//   live          : every call goes to the Emami Apps backend (backend/mmMdm.js, <api>/me/mm-mdm), which holds the SAP
//                   connection and checks the hub session and the grant. The browser never talks to SAP.
import type { DuplicateHit, FieldControl, ListQuery, Message, RequestData, RequestHeader, RequestView, SessionInfo, StartInput, ValueHelpItem } from './types';
import { ServiceError, type Caller, type MdmService } from './service';

export class ApiError extends Error {
  constructor(public status: number, message: string, public messages: Message[] = []) {
    super(message);
  }
}

export type WorkflowBody = { comment?: string; agent?: string; data?: RequestData };
export interface Api {
  mode: 'demo' | 'live';
  session(): Promise<SessionInfo>;
  switchUser(user: string): Promise<SessionInfo>;
  list(q: ListQuery): Promise<RequestHeader[]>;
  get(id: string): Promise<RequestView>;
  start(input: StartInput): Promise<RequestView>;
  save(id: string, data: RequestData): Promise<{ request: RequestView; messages: Message[] }>;
  validate(id: string, data: RequestData): Promise<{ messages: Message[] }>;
  submit(id: string, data: RequestData): Promise<{ request: RequestView; messages: Message[] }>;
  act(id: string, action: 'approve' | 'sendback' | 'reject' | 'forward', body: WorkflowBody): Promise<{ request: RequestView; messages: Message[] }>;
  remove(id: string): Promise<{ ok: true }>;
  fieldControl(materialType: string, level: string): Promise<FieldControl>;
  valueHelp(name: string, params?: Record<string, string>): Promise<ValueHelpItem[]>;
  duplicates(input: { description: string; materialType: string }): Promise<DuplicateHit[]>;
  buildDescription(input: { mainGroup?: string; subGroup?: string; subSubGroup?: string; description: string; manufacturerPart?: string }): Promise<{ text: string; truncated: boolean }>;
  relatedHsn(text: string): Promise<Array<{ code: string; text: string; count: number }>>;
}

// ---------------------------------------------------------------- live: the Emami Apps backend

const HUB_TOKEN_KEY = 'emami_apps_session_token';

function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_MM_API_BASE;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}/me/mm-mdm`;
}

function hubToken(): string {
  try { return window.localStorage.getItem(HUB_TOKEN_KEY) || ''; } catch { return ''; }
}

async function http<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = hubToken();
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Accept: 'application/json', ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store'
    });
  } catch {
    throw new ApiError(0, 'Could not reach the material master service. Check your connection.');
  }
  const text = await res.text();
  let body: { error?: string; messages?: Message[] } = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText, body.messages ?? []);
  return body as T;
}

const q = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v && p.set(k, v));
  return p.toString();
};

const liveApi: Api = {
  mode: 'live',
  session: () => http<SessionInfo>('/session'),
  switchUser: () => Promise.reject(new ApiError(400, 'Not available in live mode')),
  list: (l) => http<RequestHeader[]>(`/requests?${q(l as Record<string, string | undefined>)}`),
  get: (id) => http<RequestView>(`/requests/${encodeURIComponent(id)}`),
  start: (input) => http<RequestView>('/requests', { method: 'POST', body: input }),
  save: (id, data) => http(`/requests/${encodeURIComponent(id)}`, { method: 'PUT', body: { data } }),
  validate: (id, data) => http(`/requests/${encodeURIComponent(id)}/validate`, { method: 'POST', body: { data } }),
  submit: (id, data) => http(`/requests/${encodeURIComponent(id)}/submit`, { method: 'POST', body: { data } }),
  act: (id, action, body) => http(`/requests/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }),
  remove: (id) => http(`/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  fieldControl: (type, level) => http<FieldControl>(`/fieldcontrol?${q({ type, level })}`),
  valueHelp: (name, params = {}) => http<ValueHelpItem[]>(`/valuehelp/${encodeURIComponent(name)}?${new URLSearchParams(params).toString()}`),
  duplicates: (input) => http<DuplicateHit[]>('/duplicates', { method: 'POST', body: input }),
  buildDescription: (input) => http('/description', { method: 'POST', body: input }),
  relatedHsn: (text) => http(`/hsn?${q({ text })}`)
};

// ---------------------------------------------------------------- demo: the built-in service in the browser

const DEMO_USERS = ['initiator', 'reviewer', 'approver'];
const DEMO_USER_KEY = 'mm_demo_user';
const demoUser = (): string => { try { const u = sessionStorage.getItem(DEMO_USER_KEY) ?? 'initiator'; return DEMO_USERS.includes(u) ? u : 'initiator'; } catch { return 'initiator'; } };

let demoSvc: MdmService | undefined;
async function demo<T>(fn: (s: MdmService, c: Caller) => Promise<T>): Promise<T> {
  // loaded on demand so live builds carry no demo code on the first paint
  const mod = await import('./demo/service');
  demoSvc ??= new mod.MockService();
  try {
    return await fn(demoSvc, { user: demoUser() });
  } catch (e) {
    if (e instanceof ServiceError) throw new ApiError(e.status, e.message, e.messages);
    throw e;
  } finally {
    mod.persistDemoStore();
  }
}

const demoApi: Api = {
  mode: 'demo',
  session: () => demo((s, c) => s.session(c)),
  switchUser: async (user) => { try { sessionStorage.setItem(DEMO_USER_KEY, DEMO_USERS.includes(user) ? user : 'initiator'); } catch { /* ignore */ } return demo((s, c) => s.session(c)); },
  list: (l) => demo((s, c) => s.listRequests(c, l)),
  get: (id) => demo((s, c) => s.getRequest(c, id)),
  start: (input) => demo((s, c) => s.startRequest(c, input)),
  save: (id, data) => demo((s, c) => s.saveRequest(c, id, data)),
  validate: (id, data) => demo(async (s, c) => ({ messages: await s.validate(c, id, data) })),
  submit: (id, data) => demo((s, c) => s.submit(c, id, data)),
  act: (id, action, body) => demo((s, c) => s.act(c, id, action, body)),
  remove: (id) => demo(async (s, c) => { await s.deleteDraft(c, id); return { ok: true as const }; }),
  fieldControl: (type, level) => demo((s, c) => s.fieldControl(c, type, level)),
  valueHelp: (name, params = {}) => demo((s, c) => s.valueHelp(c, name, params)),
  duplicates: (input) => demo((s, c) => s.duplicates(c, input)),
  buildDescription: (input) => demo((s, c) => s.buildDescription(c, input)),
  relatedHsn: (text) => demo((s, c) => s.relatedHsn(c, text))
};

export const api: Api = process.env.NEXT_PUBLIC_MM_MODE === 'live' ? liveApi : demoApi;
