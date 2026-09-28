// SAP OData v2 client for Audit Tool — a faithful stand-in for the source Fiori app's
// sap.ui.model.odata.v2.ODataModel (manifest.json: dataSource ZIT_MSD_TOOL_INTERNAL_AUDIT_SRV,
// useBatch: false), pointed at the same shared Azure SAP gateway every other SAP-integrated app in
// this monorepo already calls directly from the browser (/api/<SYSTEM>/<SERVICE>/<EntitySet>, see
// fm-po-deviation/src/lib/sapClient.ts). The Fiori app only ever uses two ODataModel operations —
// read() (GET, EntitySet with $filter/$expand, or a keyed entity) and create() (POST, including
// deep inserts) — so that's all this exposes, as read/readEntity/create below.
//
// Every screen in this app was ported by translating each Fiori `oModel.read(path, {filters,
// urlParameters})` / `oModel.create(path, payload)` call 1:1 into these functions, so the three
// ODataModel behaviours ported code implicitly relies on are reproduced here rather than left to
// each screen:
//  1. $filter serialization follows UI5's own ODataUtils/FilterProcessor rules — a filters array
//     is grouped by path (same path ORed, different paths ANDed), a multi-filter keeps its own
//     and/or, and the outermost level has no brackets — so SAP receives the same $filter string
//     the Fiori app sends.
//  2. Responses are converted the way ODataModel hands them to success callbacks: Edm.DateTime
//     "/Date(ms)/" becomes a JS Date and Edm.Time "PT..H..M..S" becomes {ms, __edmType}, so date
//     formatting/comparison code ports unchanged.
//  3. create() payloads are serialized the way ODataModel does it: Date -> "/Date(ms)/",
//     {ms, __edmType:'Edm.Time'} -> "PT..H..M..S".
// One deliberate addition over the Fiori: every read carries the signed-in hub user's email —
// `Email eq '<email>'` ANDed onto each EntitySet $filter, and the email as the key of the blank
// "current user" keyed reads (CheckAuditHeadSet(''), AuditNameCheckSet('')) — because through the
// shared gateway SAP can no longer tell the user from the logon (sy-uname). create() payloads are
// unchanged.
// Errors reject with an ODataError carrying the same {message, statusCode, responseText} shape
// ODataModel passes to error callbacks, so the Fiori app's own JSON.parse(oError.responseText)
// message extraction ports unchanged too (see sapErrorMessage).
import axios, { AxiosError } from 'axios';
import { getHubEmail } from './hubEmailLogin';

const SAP_BASE_URL =
  'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZIT_MSD_TOOL_INTERNAL_AUDIT_SRV';

const http = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------------------------
// Filters (sap.ui.model.Filter equivalent)
// ---------------------------------------------------------------------------------------------

export type FilterOperator =
  | 'EQ' | 'NE' | 'GT' | 'GE' | 'LT' | 'LE' | 'BT' | 'NB'
  | 'Contains' | 'NotContains' | 'StartsWith' | 'NotStartsWith' | 'EndsWith' | 'NotEndsWith';

/** Explicit Edm type for a filter value, for the few non-string properties — UI5 reads this from
 * $metadata, which this app doesn't load, so strings (quoted) are the default like UI5's own
 * fallback. Date values are detected automatically. */
export type EdmType = 'Edm.String' | 'Edm.Boolean' | 'Edm.Int16' | 'Edm.Int32' | 'Edm.Int64' | 'Edm.Byte'
  | 'Edm.Decimal' | 'Edm.Double' | 'Edm.Single' | 'Edm.DateTime' | 'Edm.DateTimeOffset' | 'Edm.Time' | 'Edm.Guid';

export interface SimpleFilter {
  path: string;
  operator: FilterOperator;
  value1: unknown;
  value2?: unknown;
  type?: EdmType;
  caseSensitive?: boolean;
}

export interface MultiFilter {
  filters: Filter[];
  and: boolean;
}

export type Filter = SimpleFilter | MultiFilter;

export function isMultiFilter(f: Filter): f is MultiFilter {
  return Array.isArray((f as MultiFilter).filters);
}

/** new sap.ui.model.Filter(path, operator, value1[, value2]) */
export function F(path: string, operator: FilterOperator, value1: unknown, value2?: unknown, type?: EdmType): SimpleFilter {
  return { path, operator, value1, value2, type };
}

/** new sap.ui.model.Filter({ filters, and: true }) / new Filter(filters, true) */
export function And(filters: Filter[]): MultiFilter {
  return { filters, and: true };
}

/** new sap.ui.model.Filter({ filters, and: false }) / new Filter(filters, false) */
export function Or(filters: Filter[]): MultiFilter {
  return { filters, and: false };
}

/** FilterProcessor.groupFilters — same path ORed, different paths (and every multi-filter) ANDed. */
export function groupFilters(filters: Filter[] | undefined): Filter | undefined {
  if (!filters || filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  const byPath = new Map<string, Filter[]>();
  const multi: Filter[] = [];
  for (const f of filters) {
    if (isMultiFilter(f)) {
      multi.push(f);
    } else {
      const list = byPath.get(f.path) || [];
      list.push(f);
      byPath.set(f.path, list);
    }
  }
  const combine = (list: Filter[], and: boolean): Filter => (list.length === 1 ? list[0] : { filters: list, and });
  const result: Filter[] = [];
  byPath.forEach((list) => result.push(combine(list, false)));
  result.push(...multi);
  return combine(result, true);
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function formatDateTimeLiteral(d: Date): string {
  // UI5 formats Edm.DateTime filter values in UTC: datetime'yyyy-MM-ddTHH:mm:ss'
  return `datetime'${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}'`;
}

function formatValue(value: unknown, type?: EdmType): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date || type === 'Edm.DateTime') {
    const d = value instanceof Date ? value : new Date(String(value));
    return formatDateTimeLiteral(d);
  }
  switch (type) {
    case 'Edm.Boolean':
      return String(value === true || value === 'true');
    case 'Edm.Int16':
    case 'Edm.Int32':
    case 'Edm.Byte':
      return String(value);
    case 'Edm.Int64':
      return `${value}l`;
    case 'Edm.Decimal':
      return `${value}m`;
    case 'Edm.Double':
      return `${value}d`;
    case 'Edm.Single':
      return `${value}f`;
    case 'Edm.Guid':
      return `guid'${value}'`;
    case 'Edm.Time':
      return `time'${value}'`;
    default:
      if (typeof value === 'boolean') return String(value);
      return `'${String(value).replace(/'/g, "''")}'`;
  }
}

function createSegment(f: SimpleFilter): string {
  const v1 = formatValue(f.value1, f.type);
  const p = f.path;
  switch (f.operator) {
    case 'EQ': return `${p} eq ${v1}`;
    case 'NE': return `${p} ne ${v1}`;
    case 'GT': return `${p} gt ${v1}`;
    case 'GE': return `${p} ge ${v1}`;
    case 'LT': return `${p} lt ${v1}`;
    case 'LE': return `${p} le ${v1}`;
    case 'BT': return `(${p} ge ${v1} and ${p} le ${formatValue(f.value2, f.type)})`;
    case 'NB': return `not (${p} ge ${v1} and ${p} le ${formatValue(f.value2, f.type)})`;
    case 'Contains': return `substringof(${v1},${p})`;
    case 'NotContains': return `not substringof(${v1},${p})`;
    case 'StartsWith': return `startswith(${p},${v1})`;
    case 'NotStartsWith': return `not startswith(${p},${v1})`;
    case 'EndsWith': return `endswith(${p},${v1})`;
    case 'NotEndsWith': return `not endswith(${p},${v1})`;
    default: return `${p} eq ${v1}`;
  }
}

function createFilterString(f: Filter, omitBrackets: boolean): string {
  if (!isMultiFilter(f)) return createSegment(f);
  const list = f.filters;
  if (list.length === 0) return f.and ? 'true' : 'false';
  if (list.length === 1) return isMultiFilter(list[0]) ? createFilterString(list[0], false) : createFilterString(list[0], true);
  const body = list.map((x) => createFilterString(x, false)).join(f.and ? ' and ' : ' or ');
  return omitBrackets ? body : `(${body})`;
}

/** The exact $filter value ODataModel.read({filters}) would send for these filters. */
export function buildFilterString(filters: Filter[] | undefined): string | undefined {
  const grouped = groupFilters(filters);
  if (!grouped) return undefined;
  return createFilterString(grouped, true);
}

// ---------------------------------------------------------------------------------------------
// Client-side filtering (JSONModel ListBinding.filter equivalent)
// ---------------------------------------------------------------------------------------------

function normalize(v: unknown, caseSensitive?: boolean): unknown {
  if (typeof v === 'string') {
    const s = v.normalize('NFC');
    return caseSensitive ? s : s.toUpperCase();
  }
  if (v instanceof Date) return v.getTime();
  return v;
}

function getPath(row: Record<string, unknown>, path: string): unknown {
  return path.split('/').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), row);
}

function testSimple(row: Record<string, unknown>, f: SimpleFilter): boolean {
  const cs = f.caseSensitive;
  const value = normalize(getPath(row, f.path), cs);
  const v1 = normalize(f.value1, cs);
  const v2 = normalize(f.value2, cs);
  const str = (x: unknown) => (x == null ? null : String(x));
  switch (f.operator) {
    // eslint-disable-next-line eqeqeq
    case 'EQ': return value == v1;
    // eslint-disable-next-line eqeqeq
    case 'NE': return value != v1;
    case 'GT': return (value as number) > (v1 as number);
    case 'GE': return (value as number) >= (v1 as number);
    case 'LT': return (value as number) < (v1 as number);
    case 'LE': return (value as number) <= (v1 as number);
    case 'BT': return (value as number) >= (v1 as number) && (value as number) <= (v2 as number);
    case 'NB': return !((value as number) >= (v1 as number) && (value as number) <= (v2 as number));
    case 'Contains': { const s = str(value); return s != null && s.indexOf(String(v1)) !== -1; }
    case 'NotContains': { const s = str(value); return s != null && s.indexOf(String(v1)) === -1; }
    case 'StartsWith': { const s = str(value); return s != null && s.startsWith(String(v1)); }
    case 'NotStartsWith': { const s = str(value); return s != null && !s.startsWith(String(v1)); }
    case 'EndsWith': { const s = str(value); return s != null && s.endsWith(String(v1)); }
    case 'NotEndsWith': { const s = str(value); return s != null && !s.endsWith(String(v1)); }
    default: return true;
  }
}

function testFilter(row: Record<string, unknown>, f: Filter): boolean {
  if (!isMultiFilter(f)) return testSimple(row, f);
  if (f.filters.length === 0) return true;
  return f.and ? f.filters.every((x) => testFilter(row, x)) : f.filters.some((x) => testFilter(row, x));
}

/** oTable.getBinding("items").filter(filters) on a JSONModel — same grouping and the same
 * case-insensitive string comparison UI5's FilterProcessor applies by default. An empty/undefined
 * filter list shows every row, same as binding.filter([]). */
export function applyFilters<T>(rows: T[], filters: Filter[] | Filter | undefined): T[] {
  if (!filters) return rows;
  const grouped = Array.isArray(filters) ? groupFilters(filters) : filters;
  if (!grouped) return rows;
  return rows.filter((r) => testFilter(r as unknown as Record<string, unknown>, grouped));
}

// ---------------------------------------------------------------------------------------------
// Value conversion (wire format <-> ODataModel's JS representation)
// ---------------------------------------------------------------------------------------------

export interface EdmTime {
  ms: number;
  __edmType: 'Edm.Time';
}

const DATE_RE = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/;
const TIME_RE = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/;

export function isEdmTime(v: unknown): v is EdmTime {
  return !!v && typeof v === 'object' && (v as EdmTime).__edmType === 'Edm.Time' && typeof (v as EdmTime).ms === 'number';
}

function fromWire(value: unknown): unknown {
  if (typeof value === 'string') {
    const d = value.match(DATE_RE);
    if (d) return new Date(Number(d[1]));
    const t = value.length > 2 ? value.match(TIME_RE) : null;
    if (t && (t[1] || t[2] || t[3])) {
      const ms = ((Number(t[1] || 0) * 60 + Number(t[2] || 0)) * 60 + Number(t[3] || 0)) * 1000;
      return { ms, __edmType: 'Edm.Time' } as EdmTime;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(fromWire);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = fromWire(v);
    return out;
  }
  return value;
}

function timeToWire(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${pad(h)}H${pad(m)}M${pad(s)}S`;
}

function toWire(value: unknown): unknown {
  if (value instanceof Date) return `/Date(${value.getTime()})/`;
  if (isEdmTime(value)) return timeToWire(value.ms);
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // ODataModel never sends read-side bookkeeping back on create.
      if (k === '__metadata') continue;
      if (v && typeof v === 'object' && '__deferred' in (v as Record<string, unknown>)) continue;
      out[k] = toWire(v);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** Same shape as the oError ODataModel hands to error callbacks. */
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

function toODataError(err: unknown): ODataError {
  const ax = err as AxiosError;
  const status = ax?.response?.status ?? 0;
  const body = ax?.response?.data;
  const responseText = typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
  return new ODataError(ax?.message || 'HTTP request failed', status, responseText);
}

/** Pulls SAP's own message out of an error the way the Fiori controllers do
 * (JSON.parse(oError.responseText).error.message.value), with a fallback. */
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
// Operations
// ---------------------------------------------------------------------------------------------

export interface ReadOptions {
  filters?: Filter[];
  urlParameters?: Record<string, string>;
}

/** The signed-in hub user's email. The Fiori app let SAP identify the user from the SAP logon
 * (sy-uname); through the shared Azure gateway every call runs as the gateway's technical user, so
 * the email is passed explicitly on every read instead — same posture as PO Approval
 * (fm-po-deviation/src/lib/sapClient.ts). */
function loginEmail(): string {
  return (getHubEmail() || '').trim();
}

/** Adds `Email eq '<login email>'` to a read's filters. It's a separate path from every other
 * filter, so UI5-style grouping ANDs it with the screen's own $filter. */
function withEmailFilter(filters: Filter[] | undefined): Filter[] | undefined {
  const email = loginEmail();
  if (!email) return filters;
  return [...(filters || []), F('Email', 'EQ', email)];
}

function buildQuery(opts: ReadOptions | undefined, includeEmail = true): string {
  const parts: string[] = [];
  const params = { ...(opts?.urlParameters || {}) };
  for (const [k, v] of Object.entries(params)) parts.push(`${k}=${encodeURIComponent(v)}`);
  const filter = buildFilterString(includeEmail ? withEmailFilter(opts?.filters) : opts?.filters);
  if (filter) parts.push(`$filter=${encodeURIComponent(filter)}`);
  parts.push('$format=json');
  return parts.join('&');
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export interface ReadResult<T> {
  results: T[];
}

/** oModel.read("/EntitySet", { filters, urlParameters }) — resolves to { results } exactly like
 * the ODataModel success callback's oData. */
export async function read<T = any>(entitySet: string, opts?: ReadOptions): Promise<ReadResult<T>> {
  try {
    const { data } = await http.get(`${normalizePath(entitySet)}?${buildQuery(opts)}`);
    const d = data?.d ?? data;
    const results = Array.isArray(d?.results) ? d.results : Array.isArray(d) ? d : [];
    return { results: fromWire(results) as T[] };
  } catch (err) {
    throw toODataError(err);
  }
}

/** oModel.read("/EntitySet('key')") — a keyed single-entity read; resolves to the entity. */
export async function readEntity<T = any>(path: string, opts?: ReadOptions): Promise<T> {
  // A keyed read can't take a $filter, so the login email goes in as the key instead of the
  // Fiori's blank "current user" key: CheckAuditHeadSet('') -> CheckAuditHeadSet('<email>').
  const email = loginEmail();
  const keyed = email ? path.replace(/\(''\)$/, `('${encodeURIComponent(email.replace(/'/g, "''"))}')`) : path;
  try {
    const { data } = await http.get(`${normalizePath(keyed)}?${buildQuery(opts, false)}`);
    return fromWire(data?.d ?? data) as T;
  } catch (err) {
    throw toODataError(err);
  }
}

/** oModel.create("/EntitySet", payload) — POST, including deep inserts. Resolves to the created
 * entity SAP echoes back (ODataModel's oData). */
export async function create<T = any>(entitySet: string, payload: Record<string, unknown>): Promise<T> {
  try {
    const { data } = await http.post(normalizePath(entitySet), toWire(payload));
    return fromWire(data?.d ?? data) as T;
  } catch (err) {
    throw toODataError(err);
  }
}

/** Builds an entity key segment like ODataModel.createKey — ObservationAttachementSet(ControlNumber='1',Gjahr='2024'). */
export function createKey(entitySet: string, keys: Record<string, string>): string {
  const inner = Object.entries(keys)
    .map(([k, v]) => `${k}='${encodeURIComponent(String(v).replace(/'/g, "''"))}'`)
    .join(',');
  return `/${entitySet.replace(/^\//, '')}(${inner})`;
}

export { SAP_BASE_URL };
