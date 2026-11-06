/**
 * Read-only OData V2 client for the SAP gateway (GET only - nothing is ever written to SAP).
 * Runs in the browser (direct to the Azure gateway) and in node (check:metadata, tests).
 */
import { parseODataError, parseSapMessageHeader, type SapMessage } from './messages';
import { unwrapCollection } from './normalize';
import { sapConfig, type SapConfig } from './config';
import { authHeaders } from './auth';

export type SapErrorKind = 'config' | 'timeout' | 'aborted' | 'http' | 'network' | 'parse';

export class SapError extends Error {
  constructor(
    message: string,
    public kind: SapErrorKind,
    public status = 502,
    public details: SapMessage[] = [],
    /** SAP's / the gateway's own HTTP status (0 = no response) */
    public sapStatus = 0,
  ) {
    super(message);
    this.name = 'SapError';
  }
}

const AZURE_LIMIT_HINT = 'The Azure gateway stops waiting after about 230 s. Try fewer materials or plants per run.';

/** Query string with OData `$` options kept literal and every value encoded with
 * encodeURIComponent (spaces as %20, never "+"). sap-client only when SAP_CLIENT is set. */
export function buildUrl(path: string, params: Record<string, string | undefined>, c: SapConfig = sapConfig()): string {
  const all: Record<string, string | undefined> = { ...params, $format: path === '$metadata' ? undefined : 'json' };
  if (c.client) all['sap-client'] = c.client;
  const qs = Object.entries(all)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
  return `${c.baseUrl}/${path}${qs ? `?${qs}` : ''}`;
}

/** Real network, or the built-in mock when MOCK_SAP is on (local development and tests only;
 * the mock chunk is never loaded unless the build was made with NEXT_PUBLIC_MOCK_SAP=true). */
async function transport(c: SapConfig): Promise<typeof fetch> {
  if (c.mock && (process.env.NEXT_PUBLIC_MOCK_SAP === 'true' || typeof window === 'undefined')) {
    const { mockSapFetch } = await import('../../../mock/sap');
    return mockSapFetch as typeof fetch;
  }
  return fetch;
}

/** HTML error page from the proxy -> first 300 characters of its text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export interface SapRawResponse {
  body: unknown;
  messages: SapMessage[];
  /** whether a sap-message header reached us (cross-origin it is only visible if exposed) */
  sapMessageHeader: boolean;
  ms: number;
  status: number;
}

export interface SapGetOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** costing runs are never retried on timeout (they would just run twice) */
  costing?: boolean;
  /** Plant-wide costing (lib/plantwide): no client-side timeout at all, only the caller's signal ends the request. */
  noTimeout?: boolean;
}

/** Every SAP call waits up to 230 s - the Azure gateway's own limit (SAP_TIMEOUT_MS can lower it). */
export const SAP_MAX_TIMEOUT_MS = 230_000;
export const COSTING_TIMEOUT_MS = SAP_MAX_TIMEOUT_MS;

function linkedSignal(outer: AbortSignal | undefined, ms: number | null) {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = ms === null ? undefined : setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, ms);
  const onAbort = () => ctl.abort();
  if (outer) {
    if (outer.aborted) onAbort();
    else outer.addEventListener('abort', onAbort, { once: true });
  }
  return { signal: ctl.signal, timedOut: () => timedOut, done: () => { clearTimeout(timer); outer?.removeEventListener('abort', onAbort); } };
}

function logLine(c: SapConfig, set: string, params: Record<string, string | undefined>, ms: number, status: number | string, rows?: number) {
  // System, entity set, sizes and timing only: never values, never credentials or headers.
  console.info(`[sap] system=${c.system} set=${set} filterLen=${params.$filter?.length ?? 0}${params.$expand ? ` expand=${params.$expand}` : ''} status=${status} ms=${ms}${rows !== undefined ? ` rows=${rows}` : ''}`);
}

/**
 * Connection check before a costing call (browser only). The gateway is HTTP/1.1: a costing request that lands on an idle keep-alive socket the
 * proxy has dropped, or waits for a new one, can sit in the browser for tens of seconds before it is even sent (seen in a HAR: 38 s "blocked", 10 s
 * on the server). A costing call must never be sent twice, so a cheap read (ConfigItemSet, 1 row) goes first: if it does not answer in
 * WARM_TIMEOUT_MS it is cancelled (which closes that socket) and tried once more on a fresh one. Any answer counts, even an error status. Skipped
 * when the gateway answered in the last WARM_IDLE_MS, in node and for the mock. Never throws.
 */
export const WARM_IDLE_MS = 8_000;
export const WARM_TIMEOUT_MS = 6_000;
let lastAnswerAt = 0;
export const noteGatewayAnswer = (at = Date.now()) => { lastAnswerAt = at; };
export async function warmConnection(c: SapConfig, doFetch: typeof fetch, outer?: AbortSignal, now: () => number = Date.now): Promise<void> {
  if (typeof window === 'undefined' || c.mock || now() - lastAnswerAt < WARM_IDLE_MS) return;
  const url = buildUrl('ConfigItemSet', { $top: '1' }, c);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (outer?.aborted) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), WARM_TIMEOUT_MS);
    const onAbort = () => ctl.abort();
    outer?.addEventListener('abort', onAbort, { once: true });
    try {
      await doFetch(url, { method: 'GET', headers: { Accept: 'application/json', ...authHeaders(c) }, signal: ctl.signal, cache: 'no-store' });
      lastAnswerAt = now();
      return;
    } catch { /* stuck or unreachable: try once more, then let the real call report it */ } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  }
}

async function once(c: SapConfig, path: string, params: Record<string, string | undefined>, opts: SapGetOptions): Promise<SapRawResponse> {
  const doFetch = await transport(c);
  const url = buildUrl(path, params, c);
  if (opts.costing) await warmConnection(c, doFetch, opts.signal);
  const started = Date.now();
  const timeout = opts.timeoutMs ?? (opts.costing ? COSTING_TIMEOUT_MS : c.timeoutMs);
  const link = linkedSignal(opts.signal, opts.noTimeout ? null : timeout);
  let res: Response;
  try {
    res = await doFetch(url, { method: 'GET', headers: { Accept: path === '$metadata' ? 'application/xml' : 'application/json', ...authHeaders(c) }, signal: link.signal, cache: 'no-store' });
  } catch {
    const ms = Date.now() - started;
    if (opts.signal?.aborted) {
      logLine(c, path, params, ms, 'cancelled');
      throw new SapError('Request cancelled.', 'aborted', 499);
    }
    if (link.timedOut()) {
      logLine(c, path, params, ms, 'timeout');
      throw new SapError(`SAP did not answer within ${Math.round(timeout / 1000)} s. ${AZURE_LIMIT_HINT}`, 'timeout', 504);
    }
    logLine(c, path, params, ms, 'network-error');
    throw new SapError('Could not reach the SAP gateway. Check your network / VPN and try again.', 'network', 502);
  } finally {
    link.done();
  }
  const ms = Date.now() - started;
  noteGatewayAnswer();
  const header = res.headers.get('sap-message');
  const messages = parseSapMessageHeader(header);
  const text = await res.text();
  let body: unknown;
  try {
    body = text && path !== '$metadata' ? JSON.parse(text) : text;
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    logLine(c, path, params, ms, res.status);
    if (res.status === 504 || res.status === 502) {
      const extra = body && typeof body === 'object' ? parseODataError(body, '').message : htmlToText(text);
      throw new SapError(`The SAP gateway gave up (HTTP ${res.status}). ${AZURE_LIMIT_HINT}${extra ? ` (${extra})` : ''}`, 'http', res.status, messages, res.status);
    }
    const fallback = res.status === 401 || res.status === 403 ? 'The SAP gateway rejected the request (not authorised).' : res.status === 404 ? 'SAP service or entity set not found.' : `SAP returned HTTP ${res.status}.`;
    let message = fallback;
    let details: SapMessage[] = [];
    if (body && typeof body === 'object') ({ message, details } = parseODataError(body, fallback));
    else if (text) message = /<error|<message/i.test(text) ? /<message[^>]*>([^<]+)<\/message>/i.exec(text)?.[1] ?? htmlToText(text) : htmlToText(text) || fallback;
    throw new SapError(message, 'http', res.status >= 500 ? 502 : 400, [...details, ...messages], res.status);
  }
  if (body === undefined) {
    logLine(c, path, params, ms, `${res.status}-not-json`);
    throw new SapError(`The SAP gateway sent a response that is not JSON: ${htmlToText(text)}`, 'parse', 502, [], res.status);
  }
  const rows = path === '$metadata' ? undefined : unwrapCollection(body).results.length;
  logLine(c, path, params, ms, res.status, rows);
  return { body, messages, sapMessageHeader: header !== null, ms, status: res.status };
}

/** GET with at most ONE retry, and only for network errors or 502/503. A timeout is never
 * retried (a costing run would just run twice); neither are 4xx or other 5xx. */
export async function sapGet(path: string, params: Record<string, string | undefined>, opts: SapGetOptions = {}): Promise<SapRawResponse> {
  const c = sapConfig();
  try {
    return await once(c, path, params, opts);
  } catch (e) {
    const err = e as SapError;
    const retryable = err.kind === 'network' || (err.kind === 'http' && (err.sapStatus === 502 || err.sapStatus === 503));
    if (!retryable || opts.signal?.aborted) throw err;
    console.info(`[sap] system=${c.system} set=${path} retrying once after ${err.kind} ${err.sapStatus || ''}`);
    return once(c, path, params, opts);
  }
}

/** GET an entity set: `{ rows, count, messages, ms }` - rows still raw (normalise per entity),
 * messages from the sap-message header, count from $inlinecount. */
export async function sapGetCollection(path: string, params: Record<string, string | undefined>, opts: SapGetOptions = {}) {
  const r = await sapGet(path, params, opts);
  const { results, count } = unwrapCollection(r.body);
  return { rows: results, count, messages: r.messages, ms: r.ms, sapMessageHeader: r.sapMessageHeader, status: r.status };
}

/** $metadata as XML text. Gateway answers /IWFND/MED/170 when the service name is wrong. */
export async function sapGetMetadata(opts: SapGetOptions = {}): Promise<string> {
  try {
    const r = await sapGet('$metadata', {}, { ...opts, timeoutMs: opts.timeoutMs ?? SAP_MAX_TIMEOUT_MS });
    return String(r.body);
  } catch (e) {
    const err = e as SapError & { code?: string };
    if (/\/IWFND\/MED\/170|No service found/i.test(`${err.message}`)) err.code = 'NO_SERVICE';
    throw err;
  }
}

/**
 * POST / PUT / DELETE through the same gateway path as the reads (Production Plan writes only). The Azure
 * gateway does the CSRF handshake with SAP; this sends JSON and turns SAP's error body into a SapError. No
 * retry: a write must never run twice. The gateway answers its own 404 HTML ("Cannot DELETE /api/...") for a
 * method it does not forward - that is reported as such, not as a SAP error.
 */
export async function sapWrite(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, opts: SapGetOptions = {}): Promise<SapRawResponse> {
  const c = sapConfig();
  const doFetch = await transport(c);
  const url = buildUrl(path, {}, c);
  const started = Date.now();
  const timeout = opts.timeoutMs ?? c.timeoutMs;
  const link = linkedSignal(opts.signal, timeout);
  let res: Response;
  try {
    res = await doFetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...authHeaders(c) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: link.signal,
      cache: 'no-store',
    });
  } catch {
    if (opts.signal?.aborted) throw new SapError('Request cancelled.', 'aborted', 499);
    if (link.timedOut()) throw new SapError(`SAP did not answer within ${Math.round(timeout / 1000)} s. ${AZURE_LIMIT_HINT}`, 'timeout', 504);
    throw new SapError('Could not reach the SAP gateway. Check your network / VPN and try again.', 'network', 502);
  } finally {
    link.done();
  }
  const ms = Date.now() - started;
  const header = res.headers.get('sap-message');
  const messages = parseSapMessageHeader(header);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = undefined;
  }
  logLine(c, `${method} ${path.replace(/\(.*$/, '(...)')}`, {}, ms, res.status);
  if (!res.ok) {
    if (res.status === 404 && /Cannot (POST|PUT|DELETE) \//.test(text)) {
      throw new SapError(`The SAP gateway does not pass ${method} requests on to SAP yet (gateway route missing).`, 'http', 501, messages, 404);
    }
    if (res.status === 403 && /csrf/i.test(`${text} ${res.headers.get('x-csrf-token') ?? ''}`)) {
      throw new SapError('SAP refused the CSRF token: the gateway proxy must forward the x-csrf-token header and the SAP session cookies.', 'http', 403, messages, 403);
    }
    const fallback = res.status === 401 || res.status === 403 ? 'SAP refused the change (not authorised).' : `SAP returned HTTP ${res.status}.`;
    let message = fallback;
    let details: SapMessage[] = [];
    if (parsed && typeof parsed === 'object') ({ message, details } = parseODataError(parsed, fallback));
    else if (text) message = htmlToText(text) || fallback;
    throw new SapError(message, 'http', res.status >= 500 ? 502 : 400, [...details, ...messages], res.status);
  }
  return { body: parsed ?? null, messages, sapMessageHeader: header !== null, ms, status: res.status };
}
