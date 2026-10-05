/**
 * SAP OData v2 client for Shelf Life Deviation — a faithful stand-in for the source Fiori app's
 * sap.ui.model.odata.v2.ODataModel (manifest.json: dataSource ZQM_SLED_APPROVAL_SRV), pointed at
 * the same shared Azure SAP gateway every other SAP-integrated app in this monorepo calls
 * directly from the browser (see audit-tool/src/lib/odata.ts, fm-po-deviation/src/lib/sapClient.ts).
 *
 * The Fiori app only uses two ODataModel operations, so that's all this exposes:
 *   oModel.read(path, { urlParameters })   -> read()
 *   oModel.create(path, payload)           -> create()
 *
 * ODataModel behaviour the ported code relies on is reproduced here:
 *  - read() of an entity set resolves with { results: [...] }; read() of a keyed entity resolves
 *    with the entity (expanded navigation properties as { results: [...] }).
 *  - Edm.DateTime "/Date(ms)/" becomes a JS Date and Edm.Time "PT..H..M..S" becomes
 *    { ms, __edmType }, so the formatters' `oTime.ms` checks port unchanged. Like audit-tool, this
 *    is pattern-based — $metadata is not loaded through the gateway.
 *  - create() serializes Date -> "\/Date(ms)\/" and never sends __metadata back.
 *
 * NO CSRF HANDSHAKE — the Azure gateway performs the X-CSRF-Token exchange with SAP on our behalf
 * (same contract as RC Portal / Audit & CAPA's sapNgdService.js / every sibling client here).
 *
 * Errors reject with an ODataError carrying { statusCode, responseText }, the same shape
 * ODataModel passes to error callbacks.
 */
import { SAP_BASE_URL } from './config';

export interface EdmTime {
  ms: number;
  __edmType: 'Edm.Time';
}

export class ODataError extends Error {
  statusCode: number;
  responseText: string;
  constructor(message: string, statusCode: number, responseText: string) {
    super(message);
    this.name = 'ODataError';
    this.statusCode = statusCode;
    this.responseText = responseText;
  }
}

/** Pulls SAP's own message out of an error (error.message.value), with a fallback. */
export function sapErrorMessage(err: unknown, fallback = 'Internal Server error'): string {
  if (err instanceof ODataError) {
    try {
      const parsed = JSON.parse(err.responseText);
      const v = parsed?.error?.message?.value;
      if (v) return String(v);
      if (typeof parsed?.error === 'string') return parsed.error;
    } catch {
      /* not JSON */
    }
    return fallback;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

// ---------------------------------------------------------------------------------------------
// Wire format <-> ODataModel's JS representation
// ---------------------------------------------------------------------------------------------

const DATE_RE = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/;
const TIME_RE = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/;

function fromWire(value: unknown): unknown {
  if (typeof value === 'string') {
    const d = DATE_RE.exec(value);
    if (d) return new Date(Number(d[1]));
    const t = value.length > 2 ? TIME_RE.exec(value) : null;
    if (t && (t[1] || t[2] || t[3])) {
      const ms = ((Number(t[1] || 0) * 60 + Number(t[2] || 0)) * 60) * 1000 + Math.round(Number(t[3] || 0) * 1000);
      return { ms, __edmType: 'Edm.Time' } as EdmTime;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(fromWire);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = k === '__metadata' || k === '__deferred' ? v : fromWire(v);
    }
    return out;
  }
  return value;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const DATE_MARK = '\u0000ODATA_DATE\u0000';

function toWire(value: unknown): unknown {
  if (value instanceof Date) return DATE_MARK + value.getTime() + DATE_MARK;
  if (value && typeof value === 'object' && (value as EdmTime).__edmType === 'Edm.Time') {
    const total = Math.floor((value as EdmTime).ms / 1000);
    return `PT${pad(Math.floor(total / 3600))}H${pad(Math.floor((total % 3600) / 60))}M${pad(total % 60)}S`;
  }
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '__metadata') continue;
      out[k] = toWire(v);
    }
    return out;
  }
  return value;
}

/** JSON body with dates in the classic escaped form "\/Date(1700000000000)\/". */
function serialize(payload: Record<string, unknown>): string {
  return JSON.stringify(toWire(payload)).replace(
    /"\\u0000ODATA_DATE\\u0000(-?\d+)\\u0000ODATA_DATE\\u0000"/g,
    '"\\/Date($1)\\/"'
  );
}

// ---------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------

function buildUrl(path: string, urlParameters?: Record<string, string>): string {
  const rel = path.startsWith('/') ? path : `/${path}`;
  const parts = Object.entries(urlParameters || {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  parts.push('$format=json');
  return `${SAP_BASE_URL}${rel}?${parts.join('&')}`;
}

const HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

async function parseOrThrow(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) throw new ODataError(`HTTP ${res.status}`, res.status, text);
  if (!text) return {};
  const json = JSON.parse(text);
  let d = json && json.d !== undefined ? json.d : json;
  if (Array.isArray(d)) d = { results: d };
  return fromWire(d);
}

export interface ReadOptions {
  urlParameters?: Record<string, string>;
}

/** oModel.read(path, { urlParameters }) */
export async function read<T = any>(path: string, opts: ReadOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.urlParameters), { method: 'GET', headers: HEADERS, cache: 'no-store' });
  } catch (e) {
    throw new ODataError((e as Error).message || 'Network error', 0, '');
  }
  return parseOrThrow(res);
}

/** oModel.create(path, payload) — no CSRF handshake (the gateway does it). */
export async function create<T = any>(path: string, payload: Record<string, unknown>): Promise<T> {
  const rel = path.startsWith('/') ? path : `/${path}`;
  let res: Response;
  try {
    res = await fetch(`${SAP_BASE_URL}${rel}`, {
      method: 'POST',
      headers: HEADERS,
      body: serialize(payload),
      cache: 'no-store',
    });
  } catch (e) {
    throw new ODataError((e as Error).message || 'Network error', 0, '');
  }
  return parseOrThrow(res);
}

export const odata = { read, create };
