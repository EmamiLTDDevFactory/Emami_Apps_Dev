/**
 * Minimal OData V2 client for ZMEDICLAIM_SRV through the Azure gateway (same contract as every sibling app's client, e.g.
 * gate-entry/src/lib/sap.ts): no CSRF handshake here (the gateway does it), JSON via $format=json, V2 envelope
 * ({d:{results}} / {d:{...}}) unwrapped, SAP's error body turned into a SapError.
 *
 * Business exceptions (/IWBEP/CX_MGW_BUSI_EXCEPTION) carry the legacy Web Dynpro message text; it is passed through VERBATIM
 * (only trimmed) as SapError.message so the UI shows exactly what the old app showed.
 *
 * The gateway only routes GET / POST / PUT / DELETE (gate-entry findings): a change is a PUT of the whole entity (no MERGE), and a
 * DELETE may still answer GATEWAY_UNSUPPORTED.
 */
import { SAP_BASE_URL, SAP_SERVICE } from './config';
import { and, odataKey, pathKey } from './format';

export type ErrorCode = 'BUSINESS' | 'FORBIDDEN' | 'NOT_FOUND' | 'SERVICE_MISSING' | 'SAP_UNAVAILABLE' | 'GATEWAY_UNSUPPORTED' | 'INTERNAL';

export class SapError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string) {
    super(message);
    this.name = 'SapError';
  }
}

/** Errors that mean "the service/gateway is not there" (as opposed to a rule SAP enforced). */
export const isServiceDown = (e: unknown) =>
  e instanceof SapError && (e.code === 'SERVICE_MISSING' || e.code === 'SAP_UNAVAILABLE' || e.code === 'GATEWAY_UNSUPPORTED' || e.code === 'INTERNAL');

const GENERIC_SAP_TEXT = /^(An exception was raised|Internal Server Error)\.?$/i;

/** SAP Gateway error: {"error":{"code":"..","message":{"value":".."},"innererror":{"errordetails":[{"message":"..","severity":"error"}]}}}. */
export function parseSapError(status: number, text: string): SapError {
  let message = '';
  let code = '';
  try {
    const j = JSON.parse(text);
    message = (j?.error?.message?.value ?? (typeof j?.error?.message === 'string' ? j.error.message : typeof j?.error === 'string' ? j.error : '')) as string;
    code = j?.error?.code ?? '';
    const details: any[] = j?.error?.innererror?.errordetails ?? [];
    // Prefer the real business text over a generic wrapper message.
    if (!message || GENERIC_SAP_TEXT.test(message.trim())) {
      const d = details.find((x) => x?.message && (!x.severity || /error/i.test(x.severity)));
      if (d?.message) message = d.message;
    }
  } catch {
    /* HTML / plain text from the gateway */
  }
  message = (message || '').trim();

  if (code === '/IWFND/MED/170' || /No service found for namespace/.test(message)) {
    return new SapError(503, 'SERVICE_MISSING', `The SAP service ${SAP_SERVICE} is not available on the SAP gateway.`);
  }
  // The Azure gateway's own Express 404 ("Cannot DELETE /api/..."): it has no route for this method.
  if (status === 404 && /Cannot (GET|POST|PUT|PATCH|DELETE) \/api\//.test(text)) {
    return new SapError(501, 'GATEWAY_UNSUPPORTED', 'The SAP gateway does not pass this request on to SAP yet.');
  }
  if (status === 401 || status === 403) return new SapError(status, 'FORBIDDEN', message || `SAP refused the request (HTTP ${status})`);
  if (status === 404 && !message) return new SapError(404, 'NOT_FOUND', 'Not found');
  if (status >= 400 && status < 500) return new SapError(status, status === 404 ? 'NOT_FOUND' : 'BUSINESS', message || 'Request rejected by SAP');
  return new SapError(status || 502, 'INTERNAL', message || `SAP returned HTTP ${status}`);
}

type Query = Record<string, string | undefined>;

function url(path: string, query?: Query) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
  qs.push('$format=json');
  return `${SAP_BASE_URL}${path}?${qs.join('&')}`;
}

/** V2 envelope: {d:{results:[..]}} for collections, {d:{..}} for an entity. */
const unwrap = (json: any) => {
  const d = json?.d ?? json;
  return d && Array.isArray(d.results) ? d.results : d;
};

/** Navigation property value: {results:[..]} (V2 expanded), a bare array (deep response from some stacks) or {__deferred} / null. */
export const navResults = (v: any): any[] => (Array.isArray(v) ? v : Array.isArray(v?.results) ? v.results : []);

/** Entity without OData bookkeeping (__metadata) and without navigation properties. */
export function plainEntity(r: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(r ?? {})) {
    if (k === '__metadata') continue;
    if (v && typeof v === 'object' && ('__deferred' in (v as object) || 'results' in (v as object))) continue;
    out[k] = v;
  }
  return out;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function send(method: Method, path: string, query?: Query, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(url(path, query), {
      method,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SapError(502, 'SAP_UNAVAILABLE', 'SAP is not reachable right now. Check the network and try again.');
  }
  const text = await res.text();
  if (!res.ok) throw parseSapError(res.status, text);
  if (!text) return undefined;
  try {
    return unwrap(JSON.parse(text));
  } catch {
    // 200 with a non-JSON body: almost certainly an HTML page from the gateway, not SAP.
    throw new SapError(502, 'SAP_UNAVAILABLE', 'The SAP gateway returned an unexpected response.');
  }
}

/* ------------------------------ entity-set helpers ------------------------------ */

/** Compound/single key predicate: ('x') is not used - always named, e.g. (EmpId='1',Email='a@b.c'). */
export const keyPath = (entitySet: string, key: Record<string, string>) =>
  `/${entitySet}(${Object.entries(key).map(([k, v]) => `${k}=${pathKey(v)}`).join(',')})`;

export interface ListOptions {
  /** Condition strings joined with `and`; falsy entries are skipped. */
  filter?: (string | undefined | false | null)[];
  expand?: string;
  orderby?: string;
}

/** Filtered list read. */
export async function sapList<T = any>(entitySet: string, o: ListOptions = {}): Promise<T[]> {
  const rows = await send('GET', `/${entitySet}`, { $filter: and(...(o.filter ?? [])), $expand: o.expand, $orderby: o.orderby });
  return Array.isArray(rows) ? rows : rows ? [rows] : [];
}

/** Keyed read, e.g. sapGet('PolicySet', {ReqNo, Email}, {expand: 'Members'}). */
export const sapGet = <T = any>(entitySet: string, key: Record<string, string>, o: { expand?: string } = {}) =>
  send('GET', keyPath(entitySet, key), { $expand: o.expand }) as Promise<T>;

/** Create; a deep create is the same call with navigation arrays in the body (e.g. Members: [...]). Returns the created entity. */
export const sapCreate = <T = any>(entitySet: string, body: unknown) => send('POST', `/${entitySet}`, undefined, body) as Promise<T>;

/** Update = PUT of the whole entity (the gateway has no MERGE/PATCH route). */
export const sapUpdate = <T = any>(entitySet: string, key: Record<string, string>, body: unknown) => send('PUT', keyPath(entitySet, key), undefined, body) as Promise<T>;

export const sapDelete = (entitySet: string, key: Record<string, string>) => send('DELETE', keyPath(entitySet, key));

/**
 * Function import (POST, parameters in the query string). Parameter values must already be OData literals
 * ('text' via odataKey, datetime'..' via toSapDateLiteral).
 */
export const sapFunction = <T = any>(name: string, params: Record<string, string>) => send('POST', `/${name}`, params) as Promise<T>;

export { odataKey };
