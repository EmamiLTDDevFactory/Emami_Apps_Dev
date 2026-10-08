/**
 * Minimal OData V2 client for ZMM_GATE_ENTRY_SRV through the Azure gateway (same contract as every sibling app's client):
 * no CSRF handshake here (the gateway does it), JSON via $format=json, SAP's error body turned into a GateError.
 */
import { SAP_BASE_URL, SAP_SERVICE } from './config';

export type ErrorCode = 'BUSINESS' | 'CONFIRM_DATE' | 'FORBIDDEN' | 'NOT_FOUND' | 'SERVICE_MISSING' | 'SAP_UNAVAILABLE' | 'GATEWAY_UNSUPPORTED' | 'INTERNAL';

export class GateError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string, public field?: string) {
    super(message);
    this.name = 'GateError';
  }
}

const snakeToCamel = (s: string) => s.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * SAP Gateway error: {"error":{"code":"..","message":{"value":".."},"innererror":{...}}}.
 * The DPC raises "FIELD_NAME: text" for field errors and "CONFIRM_DATE|text" for the 7-day date question.
 */
export function parseSapError(status: number, text: string): GateError {
  let message = '';
  let code = '';
  try {
    const j = JSON.parse(text);
    message = j?.error?.message?.value ?? (typeof j?.error === 'string' ? j.error : '');
    code = j?.error?.code ?? '';
  } catch {
    /* HTML from the gateway */
  }
  if (code === '/IWFND/MED/170' || /No service found for namespace/.test(message)) {
    return new GateError(503, 'SERVICE_MISSING', `The SAP service ${SAP_SERVICE} is not available on the SAP gateway.`);
  }
  // The Azure gateway's own Express 404 ("Cannot DELETE /api/..."): it has no route for this method or for /$value.
  if (status === 404 && /Cannot (GET|POST|PUT|DELETE) \/api\//.test(text)) {
    return new GateError(501, 'GATEWAY_UNSUPPORTED', 'The SAP gateway does not pass this request on to SAP yet.');
  }
  if (message.startsWith('CONFIRM_DATE|')) return new GateError(409, 'CONFIRM_DATE', message.slice('CONFIRM_DATE|'.length));
  if (status === 401 || status === 403) return new GateError(status, 'FORBIDDEN', message || `SAP refused the request (HTTP ${status})`);
  if (status === 404 && !message) return new GateError(404, 'NOT_FOUND', 'Not found');
  const m = /^([A-Z][A-Z0-9_]{1,30}):\s+([\s\S]+)$/.exec(message);
  if (status >= 400 && status < 500) {
    return new GateError(status, 'BUSINESS', m ? m[2] : message || 'Request rejected by SAP', m ? snakeToCamel(m[1]) : undefined);
  }
  return new GateError(status || 502, 'INTERNAL', message || `SAP returned HTTP ${status}`);
}

function url(path: string, query?: Record<string, string | undefined>) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
  qs.push('$format=json');
  return `${SAP_BASE_URL}${path}?${qs.join('&')}`;
}

const unwrap = (json: any) => {
  const d = json?.d ?? json;
  return d && Array.isArray(d.results) ? d.results : d;
};

async function send(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, query?: Record<string, string | undefined>, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(url(path, query), {
      method,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new GateError(502, 'SAP_UNAVAILABLE', 'SAP is not reachable right now. Check the network and try again.');
  }
  const text = await res.text();
  if (!res.ok) throw parseSapError(res.status, text);
  return text ? unwrap(JSON.parse(text)) : undefined;
}

export const sapGet = <T = any>(path: string, query?: Record<string, string | undefined>) => send('GET', path, query) as Promise<T>;
export const sapPost = <T = any>(path: string, body?: unknown, query?: Record<string, string | undefined>) =>
  send('POST', path, query, body) as Promise<T>;
/** PUT replaces the whole entity (SAP refuses partial updates, so no MERGE). */
export const sapPut = (path: string, body: unknown) => send('PUT', path, undefined, body);
export const sapDelete = (path: string) => send('DELETE', path);

/** Entity URL with a plain path (no $format) for media reads, e.g. GateRequestPdfSet('..')/$value. */
export const sapRawUrl = (path: string) => `${SAP_BASE_URL}${path}`;
