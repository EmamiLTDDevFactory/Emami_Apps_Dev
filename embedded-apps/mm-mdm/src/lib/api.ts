// Client of the app. Two modes behind one interface:
//   demo (default): the built-in demo service runs in the browser, no SAP needed (src/lib/demo/*).
//   live          : every call goes to the Emami Apps backend (backend/mmMdm.js, <api>/me/mm-mdm), which holds the SAP
//                   connection and checks the hub session and the grant. The browser never talks to SAP.
import type { AttachmentItem, CommentItem, DuplicateHit, FieldControl, ListQuery, Message, RequestData, RequestHeader, RequestView, SessionInfo, StartInput, ValueHelpItem } from './types';
import { ServiceError, type Caller, type MdmService } from './service';
import { currentLang, translate } from '../i18n/translate';
import { DEMO_MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES, base64ToBytes, bytesToBase64 } from './attachments';

export class ApiError extends Error {
  constructor(public status: number, message: string, public messages: Message[] = []) {
    super(message);
  }
}

export type WorkflowBody = { comment?: string; agent?: string; data?: RequestData };
export interface Api {
  mode: 'demo' | 'live';
  /** largest file the mode accepts (the demo keeps files in the browser; the live backend limits to 10 MB) */
  maxUploadBytes: number;
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
  attachments(id: string): Promise<AttachmentItem[]>;
  uploadAttachment(id: string, file: File): Promise<AttachmentItem>;
  downloadAttachment(id: string, attachId: string): Promise<Blob>;
  deleteAttachment(id: string, attachId: string): Promise<{ ok: true }>;
  comments(id: string): Promise<CommentItem[]>;
  addComment(id: string, text: string): Promise<CommentItem>;
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

async function send(path: string, init?: { method?: string; body?: unknown; raw?: { body: Blob; headers: Record<string, string> } }): Promise<Response> {
  const token = hubToken();
  try {
    return await fetch(`${apiBase()}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Accept: 'application/json', ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(init?.raw?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init?.raw ? init.raw.body : init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store'
    });
  } catch {
    throw new ApiError(0, translate(currentLang(), 'error.network'));
  }
}

async function failure(res: Response): Promise<ApiError> {
  const text = await res.text();
  let body: { error?: string; messages?: Message[] } = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  return new ApiError(res.status, body.error ?? res.statusText, body.messages ?? []);
}

async function http<T>(path: string, init?: { method?: string; body?: unknown; raw?: { body: Blob; headers: Record<string, string> } }): Promise<T> {
  const res = await send(path, init);
  if (!res.ok) throw await failure(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** A MIME type the browser reports can be anything: JSON and form types would be read by the server's body parsers, so they travel as plain bytes. */
const safeMime = (t: string): string => (!t || /json|x-www-form-urlencoded|multipart/i.test(t) ? 'application/octet-stream' : t);

const q = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v && p.set(k, v));
  return p.toString();
};

const liveApi: Api = {
  mode: 'live',
  maxUploadBytes: MAX_UPLOAD_BYTES,
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
  relatedHsn: (text) => http(`/hsn?${q({ text })}`),
  attachments: (id) => http<AttachmentItem[]>(`/requests/${encodeURIComponent(id)}/attachments`),
  uploadAttachment: (id, file) => http<AttachmentItem>(`/requests/${encodeURIComponent(id)}/attachments`, { method: 'POST', raw: { body: file, headers: { 'Content-Type': safeMime(file.type), Slug: encodeURIComponent(file.name) } } }),
  downloadAttachment: async (id, attachId) => {
    const res = await send(`/requests/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachId)}`);
    if (!res.ok) throw await failure(res);
    return res.blob();
  },
  deleteAttachment: (id, attachId) => http(`/requests/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachId)}`, { method: 'DELETE' }),
  comments: (id) => http<CommentItem[]>(`/requests/${encodeURIComponent(id)}/comments`),
  addComment: (id, text) => http<CommentItem>(`/requests/${encodeURIComponent(id)}/comments`, { method: 'POST', body: { text } })
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
  maxUploadBytes: DEMO_MAX_UPLOAD_BYTES,
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
  relatedHsn: (text) => demo((s, c) => s.relatedHsn(c, text)),
  attachments: (id) => demo((s, c) => s.listAttachments(c, id)),
  uploadAttachment: async (id, file) => {
    const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    return demo((s, c) => s.addAttachment(c, id, { fileName: file.name, mimeType: file.type, base64 }));
  },
  downloadAttachment: async (id, attachId) => {
    const f = await demo((s, c) => s.readAttachment(c, id, attachId));
    return new Blob([base64ToBytes(f.base64) as BlobPart], { type: f.mimeType });
  },
  deleteAttachment: (id, attachId) => demo(async (s, c) => { await s.deleteAttachment(c, id, attachId); return { ok: true as const }; }),
  comments: (id) => demo((s, c) => s.listComments(c, id)),
  addComment: (id, text) => demo((s, c) => s.addComment(c, id, text))
};

// ---------------------------------------------------------------- which mode runs

/** Hosts where the app talks to the real SAP service (NGD landscape, through the hub backend). Every other host runs the demo. */
const LIVE_HOSTS = ['dev.emamiapps.in'];
const MODE_KEY = 'mm_mode';

/**
 * Decided when a call is made, so one build serves every environment:
 *   1. a build setting (MM_MODE=live|demo) wins, 2. a ?mm=demo|live link switches (and is remembered in this browser),
 *   3. otherwise the dev host runs live and everything else (localhost, www, tests) runs the demo.
 */
export function resolveMode(): 'demo' | 'live' {
  const built = process.env.NEXT_PUBLIC_MM_MODE;
  if (built === 'live' || built === 'demo') return built;
  if (typeof window === 'undefined') return 'demo';
  try {
    const asked = new URLSearchParams(window.location.search).get('mm');
    if (asked === 'live' || asked === 'demo') window.localStorage.setItem(MODE_KEY, asked);
    const kept = window.localStorage.getItem(MODE_KEY);
    if (kept === 'live' || kept === 'demo') return kept;
  } catch { /* storage blocked: fall through to the host */ }
  return LIVE_HOSTS.includes(window.location.hostname) ? 'live' : 'demo';
}

const current = (): Api => (resolveMode() === 'live' ? liveApi : demoApi);
export const api: Api = new Proxy({} as Api, { get: (_t, key) => Reflect.get(current(), key) });
