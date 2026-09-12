// SAP OData integration for PO Deviation Approval — ported from the source Fiori app
// (github.com/EmamiOrg/fm_po_deviation), same SAP Gateway host every other SAP-integrated app in
// this monorepo already calls directly from the client (Market Rate, PO Followup, Provision
// Tracking) — /api/NGD/<ServiceName>/<EntitySet> on the shared Azure gateway. Confirmed live
// 2026-09-12: PoSet and UserSet respond correctly; PrintformSet's GET_ENTITYSET is not implemented
// (501), matching the source app's own filtered-GET fallback for it.
import axios from 'axios';
import type { PoAction, PoRow, PoUser } from '../types/po';
import * as mock from './mockData';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZFMPODEVIATION_SRV';

/** Mock mode — lets the UI be reviewed with realistic data before SAP Basis adds the Email field
 * PoSet needs (see src/types/po.ts's header comment). Defaults ON (opt-out, not opt-in) so this
 * shows something useful immediately rather than the empty states real SAP calls return right now
 * regardless — set NEXT_PUBLIC_MOCK_DATA=false (in this app's .env / the Amplify build env) once
 * that field is live, to switch back to real SAP calls with no other code change. */
const USE_MOCK_DATA = process.env.NEXT_PUBLIC_MOCK_DATA !== 'false';

export function isMockDataEnabled(): boolean {
  return USE_MOCK_DATA;
}

/** A believable network delay so the loading states (spinners, disabled buttons) get exercised
 * too, rather than every mock call resolving instantly. */
function mockDelay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function bool(v: unknown): boolean {
  return v === true || v === 'X' || v === 'L';
}

/** OData v2 JSON encodes Edm.DateTime as "/Date(epochMillis)/" — same shape every other SAP
 * integration in this repo already unpacks. */
function parseODataDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = value.match(/\/Date\((-?\d+)\)\//);
  if (match) return new Date(Number(match[1])).toISOString().split('T')[0];
  return '';
}

/** OData v2 JSON encodes Edm.Time as an ISO-8601 duration string, "PT08H30M00S" — the source
 * app's formatter.js also handles a `{ms}` shape, but that's SAPUI5's own OData v2 model's
 * already-parsed client-side representation, not the raw wire format a plain HTTP client like
 * this one actually receives. */
function parseODataTime(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return '';
  const h = (match[1] || '0').padStart(2, '0');
  const m = (match[2] || '0').padStart(2, '0');
  const s = (match[3] || '0').padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function toPoRow(raw: Record<string, any>): PoRow {
  return {
    ebeln: str(raw.Ebeln),
    ebelp: str(raw.Ebelp),
    lifnr: str(raw.Lifnr),
    name1: str(raw.Name1),
    stxt: str(raw.Stxt),
    netwr: str(raw.Netwr),
    waers: str(raw.Waers),
    status: (str(raw.Status) as PoRow['status']) || '',
    zpoInd: str(raw.ZpoInd),
    erdat: parseODataDate(raw.Erdat),
    uzeit: parseODataTime(raw.Uzeit),
    addInfo: str(raw.AddInfo),
    initRem: str(raw.InitRem),
    zname: str(raw.Zname),
    delDate: parseODataDate(raw.DelDate),
    ccenter: str(raw.Ccenter),
    gl: str(raw.Gl),
    menge: str(raw.Menge),
    meins: str(raw.Meins),
    order: str(raw.Order),
    loekz: bool(raw.Loekz),
    email: str(raw.Email),
    raw,
  };
}

async function readPoSet(filter: string): Promise<PoRow[]> {
  const { data } = await sapClient.get('/PoSet', {
    params: { '$format': 'json', '$filter': filter },
  });
  const results = data?.d?.results;
  return Array.isArray(results) ? results.map(toPoRow) : [];
}

function escapeODataString(value: string): string {
  // OData string literals escape a single quote by doubling it.
  return value.replace(/'/g, "''");
}

/** Pending approvals for the signed-in user — Email is not yet confirmed live on this entity (see
 * src/types/po.ts's header comment); this sends the filter regardless, per instruction, so it
 * starts working the moment SAP Basis adds the field, with no further app changes needed. */
export async function fetchMyApprovals(email: string): Promise<PoRow[]> {
  if (USE_MOCK_DATA) return mockDelay(mock.mockPending().map(toPoRow));
  return readPoSet(`Email eq '${escapeODataString(email)}'`);
}

export async function fetchApprovedHistory(email: string): Promise<PoRow[]> {
  if (USE_MOCK_DATA) return mockDelay(mock.mockApproved().map(toPoRow));
  return readPoSet(`Email eq '${escapeODataString(email)}' and Status eq 'A'`);
}

export async function fetchRejectedHistory(email: string): Promise<PoRow[]> {
  if (USE_MOCK_DATA) return mockDelay(mock.mockRejected().map(toPoRow));
  return readPoSet(`Email eq '${escapeODataString(email)}' and Status eq 'R'`);
}

/** Every row (header + line items) for one PO — Details screen. Not scoped by Email: once you
 * know the PO number (from an already-scoped list above, or a direct link), its own line items
 * belong to it regardless of who's viewing. */
export async function fetchPoByNumber(poNumber: string): Promise<{ header: PoRow | null; items: PoRow[] }> {
  const rows = USE_MOCK_DATA
    ? await mockDelay(mock.mockPoByNumber(poNumber).map(toPoRow))
    : await readPoSet(`Ebeln eq '${escapeODataString(poNumber)}'`);
  const header = rows.find((r) => r.ebelp === '00000') ?? rows[0] ?? null;
  const items = rows.filter((r) => r.ebelp !== '00000');
  return { header, items };
}

/** The full action/comment log for one PO (Status 'L' rows) — same shape regardless of who's
 * viewing, so not scoped by Email either. */
export async function fetchHistoryLog(poNumber: string): Promise<PoRow[]> {
  if (USE_MOCK_DATA) return mockDelay(mock.mockHistoryLog(poNumber).map(toPoRow));
  return readPoSet(`Ebeln eq '${escapeODataString(poNumber)}' and Status eq 'L'`);
}

/** Approve / Reject / Unrelease a PO — same ZProvHeader-style "POST the header with an Action/
 * Status override" pattern as every other write in this repo's SAP integrations. `reason` is
 * mandatory (enforced by the caller's UI) for Reject, stored back as AddInfo. */
export async function submitPoAction(header: PoRow, action: PoAction, reason?: string): Promise<void> {
  if (USE_MOCK_DATA) {
    await mockDelay(null, 500);
    mock.mockSubmitAction(header.ebeln, action, reason);
    return;
  }
  const payload: Record<string, unknown> = {
    ...header.raw,
    Action: action,
    Status: action,
  };
  if (reason) payload.AddInfo = reason;
  try {
    const { data } = await sapClient.post('/PoSet', payload);
    const body = data?.d || data;
    if (body?.Type === 'E') {
      throw new Error(body.Message || 'SAP rejected this action.');
    }
  } catch (err: any) {
    const sapMessage = err?.response?.data?.error?.message?.value;
    throw new Error(sapMessage || (err instanceof Error ? err.message : 'Action failed.'));
  }
}

/** Current user info — kept for parity with the source app, but not relied on for identity in
 * this conversion (the hub already tells us who's signed in, see hubEmailLogin.ts); only used as
 * an optional display enrichment if the backend happens to return a match. */
export async function fetchUsers(): Promise<PoUser[]> {
  try {
    const { data } = await sapClient.get('/UserSet', { params: { '$format': 'json' } });
    const results = data?.d?.results;
    if (!Array.isArray(results)) return [];
    return results.map((r: any) => ({ id: str(r.Id), username: str(r.Username) }));
  } catch {
    return [];
  }
}

/** PDF printform for a PO — tries the media $value stream first (binary), falls back to a
 * filtered JSON GET reading an inline base64 Value field, matching the source app's own two-step
 * resilience (its own comments note PrintformSet's GET_ENTITYSET returns 501, so the JSON fallback
 * is filtered by Ebeln rather than a plain list read). Returns a Blob ready for
 * URL.createObjectURL, or null if neither path produced a file. */
export async function fetchPrintformPdf(poNumber: string): Promise<Blob | null> {
  if (USE_MOCK_DATA) return mockDelay(mock.mockPrintformPdf(), 500);
  const key = `PrintformSet('${escapeODataString(poNumber)}')`;
  try {
    const res = await sapClient.get(`/${key}/$value`, {
      responseType: 'arraybuffer',
      headers: { Accept: 'application/pdf' },
    });
    if (res.status === 200 && res.data) {
      return new Blob([res.data], { type: 'application/pdf' });
    }
  } catch {
    // fall through to the JSON fallback below
  }

  try {
    const { data } = await sapClient.get('/PrintformSet', {
      params: { '$format': 'json', '$filter': `Ebeln eq '${escapeODataString(poNumber)}'` },
    });
    const row = data?.d?.results?.[0];
    const base64 = row?.Value;
    if (!base64) return null;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'application/pdf' });
  } catch {
    return null;
  }
}
