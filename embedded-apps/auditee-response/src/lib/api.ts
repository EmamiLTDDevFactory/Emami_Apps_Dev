// Client of the app. Two modes behind one interface:
//   demo (default): sample data in the browser (src/lib/demo.ts), no backend.
//   live          : every call goes to the Emami Apps backend (backend/auditeeResponse.js, <api>/me/auditee), which checks the hub
//                   session and the grant and talks to SAP as the verified hub user. The browser never talks to SAP and never
//                   sends an e-mail of its own: the backend takes the user from the session token.
import { DEMO_MAX_UPLOAD_BYTES, DemoError, demoService } from './demo';
import { MAX_UPLOAD_BYTES, type Attachment, type ResponseInput, type Track, type Workpaper } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface Api {
  mode: 'demo' | 'live';
  maxUploadBytes: number;
  list(track: Track, fy?: string): Promise<Workpaper[]>;
  get(track: Track, guid: string): Promise<Workpaper>;
  /** Draft in SAP: only when the workpaper says draftStorage 'sap' (not the as-built SAP side; drafts live in the browser there). */
  save(track: Track, guid: string, responses: ResponseInput[]): Promise<Workpaper>;
  submit(track: Track, guid: string, responses: ResponseInput[]): Promise<Workpaper>;
  attachments(track: Track, guid: string): Promise<Attachment[]>;
  download(track: Track, guid: string, name: string): Promise<Blob>;
  upload(track: Track, guid: string, file: File): Promise<Attachment[]>;
  remove(track: Track, guid: string, name: string): Promise<Attachment[]>;
}

// ---------------------------------------------------------------- live
const HUB_TOKEN_KEY = 'emami_apps_session_token';

function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_AUD_API_BASE;
  if (env) return env.replace(/\/+$/, '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `https://audit-capa-api.emamiapps.in${host.includes('dev') || host === 'localhost' ? '/dev-api/api' : '/api'}/me/auditee`;
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
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'The Emami Apps server cannot be reached. Check your connection and try again.');
  }
}
async function failure(res: Response): Promise<ApiError> {
  let message = res.statusText || `HTTP ${res.status}`;
  try {
    const body = JSON.parse(await res.text()) as { error?: { message?: string } | string };
    message = (typeof body.error === 'string' ? body.error : body.error?.message) || message;
  } catch { /* not JSON */ }
  return new ApiError(res.status, message);
}
async function http<T>(path: string, init?: Parameters<typeof send>[1]): Promise<T> {
  const res = await send(path, init);
  if (!res.ok) throw await failure(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}
/** JSON, form and multipart types would be read by the server's body parsers: such files travel as plain bytes. */
const safeMime = (t: string): string => (!t || /json|x-www-form-urlencoded|multipart/i.test(t) ? 'application/octet-stream' : t);
const wp = (track: Track, guid: string, sub = '') => `/workpapers/${encodeURIComponent(guid)}${sub}?track=${track}`;

const liveApi: Api = {
  mode: 'live',
  maxUploadBytes: MAX_UPLOAD_BYTES,
  list: (track, fy) => http<Workpaper[]>(`/observations?track=${track}${fy ? `&fy=${encodeURIComponent(fy)}` : ''}`),
  get: (track, guid) => http<Workpaper>(wp(track, guid)),
  save: (track, guid, responses) => http<Workpaper>(wp(track, guid, '/responses'), { method: 'PUT', body: { responses } }),
  submit: (track, guid, responses) => http<Workpaper>(wp(track, guid, '/submit'), { method: 'POST', body: { responses } }),
  attachments: (track, guid) => http<Attachment[]>(wp(track, guid, '/attachments')),
  download: async (track, guid, name) => {
    const res = await send(wp(track, guid, `/attachments/${encodeURIComponent(name)}/content`));
    if (!res.ok) throw await failure(res);
    return res.blob();
  },
  upload: (track, guid, file) => http<Attachment[]>(wp(track, guid, '/attachments'), { method: 'POST', raw: { body: file, headers: { 'Content-Type': safeMime(file.type), Slug: encodeURIComponent(file.name) } } }),
  remove: (track, guid, name) => http<Attachment[]>(wp(track, guid, `/attachments/${encodeURIComponent(name)}`), { method: 'DELETE' }),
};

// ---------------------------------------------------------------- demo
async function demo<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (e instanceof DemoError) throw new ApiError(e.status, e.message);
    throw e;
  }
}
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

const demoApi: Api = {
  mode: 'demo',
  maxUploadBytes: DEMO_MAX_UPLOAD_BYTES,
  list: (track, fy) => demo(() => demoService.list(track, fy ?? '')),
  get: (_t, guid) => demo(() => demoService.get(guid)),
  save: () => Promise.reject(new ApiError(409, 'Drafts are kept in your browser for this app; only "Submit my response" is stored in SAP.')),
  submit: (_t, guid, r) => demo(() => demoService.submit(guid, r)),
  attachments: (_t, guid) => demo(() => demoService.attachments(guid)),
  download: (_t, guid, name) => demo(async () => {
    const f = await demoService.download(guid, name);
    return new Blob([fromBase64(f.base64) as BlobPart], { type: f.mimeType });
  }),
  upload: (_t, guid, file) => demo(async () => {
    const base64 = file.size <= DEMO_MAX_UPLOAD_BYTES ? toBase64(new Uint8Array(await file.arrayBuffer())) : '';
    return demoService.upload(guid, { name: file.name, mimeType: file.type, base64, size: file.size });
  }),
  remove: (_t, guid, name) => demo(() => demoService.remove(guid, name)),
};

// ---------------------------------------------------------------- which mode runs
/** Hosts where the app talks to SAP through the hub backend. Empty until the SAP side is transported (see README). */
const LIVE_HOSTS: string[] = [];
const MODE_KEY = 'aud_mode';

/** 1. build setting AUD_MODE wins, 2. a ?aud=demo|live link switches (remembered in this browser), 3. LIVE_HOSTS, else demo. */
export function resolveMode(): 'demo' | 'live' {
  const built = process.env.NEXT_PUBLIC_AUD_MODE;
  if (built === 'live' || built === 'demo') return built;
  if (typeof window === 'undefined') return 'demo';
  try {
    const asked = new URLSearchParams(window.location.search).get('aud');
    if (asked === 'live' || asked === 'demo') window.localStorage.setItem(MODE_KEY, asked);
    const kept = window.localStorage.getItem(MODE_KEY);
    if (kept === 'live' || kept === 'demo') return kept;
  } catch { /* storage blocked */ }
  return LIVE_HOSTS.includes(window.location.hostname) ? 'live' : 'demo';
}

const current = (): Api => (resolveMode() === 'live' ? liveApi : demoApi);
export const api: Api = new Proxy({} as Api, { get: (_t, key) => Reflect.get(current(), key) });
