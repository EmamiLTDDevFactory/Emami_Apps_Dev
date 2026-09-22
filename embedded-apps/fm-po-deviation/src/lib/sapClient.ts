// SAP OData integration for PO Deviation Approval — ported from the source Fiori app
// (github.com/EmamiOrg/fm_po_deviation), same SAP Gateway host every other SAP-integrated app in
// this monorepo already calls directly from the client (Market Rate, PO Followup, Provision
// Tracking) — /api/NGD/<ServiceName>/<EntitySet> on the shared Azure gateway. Confirmed live
// 2026-09-12: PoSet and UserSet respond correctly. Email is now confirmed live on PoSet (per
// instruction, 2026-09-14) — mock mode has been removed entirely; every call below hits SAP
// directly, same as every other screen in this app. The printform PDF is read from POPrintFormSet
// via a keyed GetEntity (Ebeln) per instruction — see fetchPrintformPdf's own comment.
import axios from 'axios';
import type { PoAction, PoRow, PoUser } from '../types/po';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NWP/ZFMPODEVIATION_SRV';

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

/** Pending approvals for the signed-in user — Email is confirmed live on PoSet, same posture as
 * every other SAP-integrated app in this repo (never omitted). */
export async function fetchMyApprovals(email: string): Promise<PoRow[]> {
  return readPoSet(`Email eq '${escapeODataString(email)}'`);
}

export async function fetchApprovedHistory(email: string): Promise<PoRow[]> {
  return readPoSet(`Email eq '${escapeODataString(email)}' and Status eq 'A'`);
}

export async function fetchRejectedHistory(email: string): Promise<PoRow[]> {
  return readPoSet(`Email eq '${escapeODataString(email)}' and Status eq 'R'`);
}

/** Every row (header + line items) for one PO — Details screen. Not scoped by Email: once you
 * know the PO number (from an already-scoped list above, or a direct link), its own line items
 * belong to it regardless of who's viewing. */
export async function fetchPoByNumber(poNumber: string): Promise<{ header: PoRow | null; items: PoRow[] }> {
  const rows = await readPoSet(`Ebeln eq '${escapeODataString(poNumber)}'`);
  const header = rows.find((r) => r.ebelp === '00000') ?? rows[0] ?? null;
  const items = rows.filter((r) => r.ebelp !== '00000');
  return { header, items };
}

/** The full action/comment log for one PO (Status 'L' rows) — same shape regardless of who's
 * viewing, so not scoped by Email either. */
export async function fetchHistoryLog(poNumber: string): Promise<PoRow[]> {
  return readPoSet(`Ebeln eq '${escapeODataString(poNumber)}' and Status eq 'L'`);
}

/** Approve / Reject / Unrelease a PO — same ZProvHeader-style "POST the header with an Action/
 * Status override" pattern as every other write in this repo's SAP integrations. `reason` is
 * mandatory (enforced by the caller's UI) for Reject, stored back as AddInfo. */
export async function submitPoAction(header: PoRow, action: PoAction, reason?: string): Promise<void> {
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

/** PDF printform for a PO — per instruction, a keyed GetEntity read against POPrintFormSet
 * (`POPrintFormSet(Ebeln='...')`), returning the document inline as base64 (`Value`) plus its
 * actual `Mimetype`, rather than the value being assumed. Same "email, no bearer token" auth
 * posture as every other read in this file. Returns a Blob ready for URL.createObjectURL, or null
 * when SAP genuinely has no printform for this PO (404 on the keyed read); any other failure
 * re-throws so the caller can tell "nothing to show" apart from a real error and word its message
 * accordingly. */
export async function fetchPrintformPdf(poNumber: string): Promise<Blob | null> {
  try {
    const { data } = await sapClient.get(`/POPrintFormSet(Ebeln='${escapeODataString(poNumber)}')`, {
      params: { '$format': 'json' },
    });
    const entity = data?.d;
    const base64 = entity?.Value;
    if (!base64) return null;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: entity?.Mimetype || 'application/pdf' });
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

