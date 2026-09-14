// SAP OData integration for PO Deviation Approval — ported from the source Fiori app
// (github.com/EmamiOrg/fm_po_deviation), same SAP Gateway host every other SAP-integrated app in
// this monorepo already calls directly from the client (Market Rate, PO Followup, Provision
// Tracking) — /api/NGD/<ServiceName>/<EntitySet> on the shared Azure gateway. Confirmed live
// 2026-09-12: PoSet and UserSet respond correctly; PrintformSet's GET_ENTITYSET is not implemented
// (501), matching the source app's own filtered-GET fallback for it. Email is now confirmed live on
// PoSet (per instruction, 2026-09-14) — mock mode has been removed entirely; every call below hits
// SAP directly, same as every other screen in this app.
import axios from 'axios';
import type { PoAction, PoRow, PoUser } from '../types/po';
import type { PoUploadResult, PoUploadResultRow } from '../types/poUpload';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZFMPODEVIATION_SRV';

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

/** Distinguishes the three upload failure modes the Upload screen must show differently: a
 * timed-out request (never retry automatically — the backend may have already created POs), a
 * network failure (safe to retry), and a real SAP/Gateway error body (safe to retry). */
export class PoUploadError extends Error {
  kind: 'timeout' | 'network' | 'sap';
  constructor(kind: PoUploadError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

const SERVICE_PO_UPLOAD_MIMETYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** SAP RAW16/CHAR32 wants 32 uppercase hex characters, no dashes. crypto.randomUUID() returns
 * dashed lowercase, so strip and uppercase it. Called fresh inside uploadServicePoFile for every
 * attempt, including a manual retry, since Guid is the backend's dedup key for one upload. */
function generatePoUploadGuid(): string {
  return crypto.randomUUID().replace(/-/g, '').toUpperCase();
}

function toPoUploadRow(raw: Record<string, any>): PoUploadResultRow {
  return {
    rowno: Number(raw.Rowno ?? 0),
    lifnr: str(raw.Lifnr),
    bukrs: str(raw.Bukrs),
    poId: Number(raw.PoId ?? 0),
    txz01: str(raw.Txz01),
    menge: str(raw.Menge),
    grPrice: str(raw.GrPrice),
    werks: str(raw.Werks),
    sakto: str(raw.Sakto),
    kostl: str(raw.Kostl),
    ebeln: str(raw.Ebeln),
    ebelp: str(raw.Ebelp),
    type: (str(raw.Type) as PoUploadResultRow['type']) || 'E',
    message: str(raw.Message),
  };
}

/** Bulk Service-PO upload — a single POST to the deep entity ZSrvPOUploadSet; there is no
 * separate GET, the POST response itself carries the full per-row result (see PoUploadResult).
 *
 * Assumes ZSrvPOUploadSet lives on this same ZFMPODEVIATION_SRV service — the backend contract
 * for this feature only names the entity set, not a service host, and this is the only SAP
 * service this app talks to. Confirm with SAP Basis; if it's actually a different service, only
 * SAP_BASE_URL above needs to change for this call.
 *
 * Timeout is 120s: the backend calls BAPI_PO_CREATE1 once per PO group and can legitimately take
 * a minute on a large file. Never retry automatically on a timeout — the backend may have already
 * created POs, and a second attempt would create duplicates (see PoUploadError). */
export async function uploadServicePoFile(
  email: string,
  filename: string,
  base64: string,
  onProgress?: (pct: number) => void,
): Promise<PoUploadResult> {
  const payload = {
    Guid: generatePoUploadGuid(),
    Email: email,
    Filename: filename,
    Mimetype: SERVICE_PO_UPLOAD_MIMETYPE,
    Value: base64,
    ToUploadItems: [],
  };

  let data: any;
  try {
    const res = await sapClient.post('/ZSrvPOUploadSet', payload, {
      params: { '$format': 'json' },
      timeout: 120000,
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
      },
    });
    data = res.data;
  } catch (err: any) {
    if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message ?? '')) {
      throw new PoUploadError(
        'timeout',
        'The upload is taking longer than expected. Check whether the POs were created before retrying.'
      );
    }
    if (!err?.response) {
      throw new PoUploadError('network', 'Network error — could not reach the server. Check your connection and try again.');
    }
    const sapMessage = err?.response?.data?.error?.message?.value;
    throw new PoUploadError('sap', sapMessage || (err instanceof Error ? err.message : 'Upload failed.'));
  }

  const body = data?.d;
  const results = body?.ToUploadItems?.results;
  return {
    guid: str(body?.Guid),
    status: (str(body?.Status) as PoUploadResult['status']) || 'E',
    message: str(body?.Message),
    totalRows: Number(body?.TotalRows ?? 0),
    successCnt: Number(body?.SuccessCnt ?? 0),
    errorCnt: Number(body?.ErrorCnt ?? 0),
    rows: Array.isArray(results) ? results.map(toPoUploadRow) : [],
  };
}

/** PDF printform for a PO — tries the media $value stream first (binary), falls back to a
 * filtered JSON GET reading an inline base64 Value field, matching the source app's own two-step
 * resilience (its own comments note PrintformSet's GET_ENTITYSET returns 501, so the JSON fallback
 * is filtered by Ebeln rather than a plain list read). Returns a Blob ready for
 * URL.createObjectURL, or null if neither path produced a file. */
export async function fetchPrintformPdf(poNumber: string): Promise<Blob | null> {
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
