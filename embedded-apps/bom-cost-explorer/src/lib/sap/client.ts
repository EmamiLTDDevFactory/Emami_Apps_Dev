import { parseODataError, parseSapMessageHeader, type SapMessage } from './messages';
import { unwrapCollection } from './normalize';

export type SapErrorKind = 'config' | 'timeout' | 'aborted' | 'http' | 'network' | 'parse';

export class SapError extends Error {
  constructor(
    message: string,
    public kind: SapErrorKind,
    public status = 502,
    public details: SapMessage[] = [],
    /** SAP's own HTTP status (status above is what the BFF answers with). */
    public sapStatus = 0,
  ) {
    super(message);
    this.name = 'SapError';
  }
}

export const isMockSap = () => String(process.env.MOCK_SAP).toLowerCase() === 'true';
const timeoutMs = () => Number(process.env.SAP_TIMEOUT_MS) || 120_000;

function baseUrl(): string {
  if (isMockSap()) return 'http://mock-sap.local/sap/opu/odata/sap/ZMM_BOM_COST_SRV';
  const u = (process.env.SAP_BASE_URL || '').replace(/\/+$/, '');
  if (!u || u.includes('SAP_BASE_URL')) throw new SapError('SAP_BASE_URL is not configured on the server.', 'config', 500);
  return u;
}

function authHeader(): Record<string, string> {
  const user = process.env.SAP_USER;
  if (!user || isMockSap()) return {};
  return { Authorization: `Basic ${Buffer.from(`${user}:${process.env.SAP_PASSWORD ?? ''}`).toString('base64')}` };
}

/** Query string with OData `$` options kept literal and values %-encoded (spaces as %20, never
 * "+", which some Gateway releases read literally inside $filter). */
export function buildUrl(path: string, params: Record<string, string | undefined>): string {
  const all: Record<string, string | undefined> = { ...params, $format: 'json' };
  const client = process.env.SAP_CLIENT;
  if (client && !isMockSap()) all['sap-client'] = client;
  const qs = Object.entries(all)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
  return `${baseUrl()}/${path}${qs ? `?${qs}` : ''}`;
}

/** Which fetch to use: the in-process mock SAP (MOCK_SAP=true) or the real network. The mock is
 * imported lazily so it never ships in a production bundle path that isn't using it. */
async function transport(): Promise<typeof fetch> {
  if (isMockSap()) {
    const { mockSapFetch } = await import('../../../mock/sap');
    return mockSapFetch as typeof fetch;
  }
  return fetch;
}

export interface SapRawResponse {
  body: unknown;
  messages: SapMessage[];
  ms: number;
  status: number;
}

/** Combines the caller's AbortSignal (browser pressed Cancel) with our own timeout. */
function linkedSignal(outer: AbortSignal | undefined, ms: number) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException('timeout', 'TimeoutError')), ms);
  const onAbort = () => ctl.abort(outer?.reason ?? new DOMException('aborted', 'AbortError'));
  if (outer) {
    if (outer.aborted) onAbort();
    else outer.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctl.signal,
    timedOut: () => ctl.signal.aborted && (ctl.signal.reason as DOMException)?.name === 'TimeoutError',
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

export interface SapGetOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Who asked (logged, for tracing slow runs). Never log credentials. */
  user?: string;
}

async function once(url: string, label: string, opts: SapGetOptions): Promise<SapRawResponse> {
  const doFetch = await transport();
  const started = Date.now();
  const link = linkedSignal(opts.signal, opts.timeoutMs ?? timeoutMs());
  let res: Response;
  try {
    res = await doFetch(url, { method: 'GET', headers: { Accept: 'application/json', ...authHeader() }, signal: link.signal, cache: 'no-store' });
  } catch (e) {
    const ms = Date.now() - started;
    if (opts.signal?.aborted) {
      console.info(`[sap] ${label} cancelled by user after ${ms}ms user=${opts.user ?? '-'}`);
      throw new SapError('Request cancelled.', 'aborted', 499);
    }
    if (link.timedOut()) {
      console.warn(`[sap] ${label} TIMEOUT after ${ms}ms user=${opts.user ?? '-'}`);
      throw new SapError(`SAP did not answer within ${Math.round((opts.timeoutMs ?? timeoutMs()) / 1000)} s. Try fewer materials or plants.`, 'timeout', 504);
    }
    console.warn(`[sap] ${label} network error after ${ms}ms: ${(e as Error).message}`);
    throw new SapError('Could not reach SAP. Check the connection and try again.', 'network', 502);
  } finally {
    link.done();
  }
  const ms = Date.now() - started;
  const messages = parseSapMessageHeader(res.headers.get('sap-message'));
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON (HTML login page, XML error) handled below */
  }
  console.info(`[sap] ${label} ${res.status} ${ms}ms bytes=${text.length} user=${opts.user ?? '-'}`);

  if (!res.ok) {
    const fallback =
      res.status === 401 || res.status === 403
        ? 'SAP rejected the service credentials.'
        : res.status === 404
          ? 'SAP service or entity set not found.'
          : `SAP returned HTTP ${res.status}.`;
    const xmlMsg = /<message[^>]*>([^<]+)<\/message>/i.exec(text)?.[1];
    const { message, details } = body ? parseODataError(body, fallback) : { message: xmlMsg || fallback, details: [] };
    throw new SapError(message, 'http', res.status >= 500 ? 502 : res.status === 401 || res.status === 403 ? 502 : 400, [...details, ...messages], res.status);
  }
  if (body === undefined) throw new SapError('SAP sent a response that is not JSON.', 'parse', 502);
  return { body, messages, ms, status: res.status };
}

/** GET with one retry on 5xx / timeout / network failure (never on a user cancel or a 4xx). */
export async function sapGet(path: string, params: Record<string, string | undefined>, opts: SapGetOptions = {}): Promise<SapRawResponse> {
  const url = buildUrl(path, params);
  const label = `GET ${path.split('?')[0]}`;
  try {
    return await once(url, label, opts);
  } catch (e) {
    const err = e as SapError;
    // 501 = "method not implemented" in the data provider class: retrying can't help.
    const retryable = err.kind === 'timeout' || err.kind === 'network' || (err.kind === 'http' && err.sapStatus >= 500 && err.sapStatus !== 501);
    if (!retryable || opts.signal?.aborted) throw err;
    console.info(`[sap] ${label} retrying once after ${err.kind}`);
    return once(url, `${label} (retry)`, opts);
  }
}

export async function sapGetCollection(path: string, params: Record<string, string | undefined>, opts: SapGetOptions = {}) {
  const r = await sapGet(path, params, opts);
  const { results, count } = unwrapCollection(r.body);
  return { results, count, messages: r.messages, ms: r.ms };
}

/** Fetches $metadata as text (check:metadata), through the same auth / sap-client as the BFF.
 * A wrong service name comes back from Gateway as /IWFND/MED/170 "No service found" - that is
 * turned into an explicit SapError so the script can say so plainly. */
export async function sapGetMetadata(): Promise<string> {
  const doFetch = await transport();
  const client = process.env.SAP_CLIENT;
  const url = `${baseUrl()}/$metadata${client && !isMockSap() ? `?sap-client=${encodeURIComponent(client)}` : ''}`;
  const res = await doFetch(url, { headers: { Accept: 'application/xml', ...authHeader() } });
  const text = await res.text();
  if (!res.ok) {
    let msg = `$metadata returned HTTP ${res.status}`;
    try {
      const { message } = parseODataError(JSON.parse(text), msg);
      msg = message;
    } catch {
      const x = /<message[^>]*>([^<]+)<\/message>/i.exec(text)?.[1];
      if (x) msg = x;
    }
    const code = /\/IWFND\/MED\/170|No service found/i.test(text) ? 'NO_SERVICE' : 'http';
    throw Object.assign(new SapError(msg, 'http', res.status), { code, url });
  }
  return text;
}
