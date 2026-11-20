/**
 * HTTP client of the Material master requests, through the Emami Apps backend (backend/mmMdm.js, mounted at <api>/me/mm-mdm).
 * The browser never calls SAP. Every business rule (field control, allowed actions, validation, routing, posting) is SAP's answer;
 * nothing here invents data: when the backend or SAP is unreachable the call throws MmApiError and the screen shows it.
 *
 * Same sign-in and API root as lib/phApi.ts (hub token from localStorage, dev API on hosts containing "dev" and on localhost).
 */
import { hubApiRoot, hubToken } from './phApi';

export type Row = Record<string, unknown>;

/** What the backend returns and accepts as `data` */
export interface BackendData {
  single: Record<string, Row>;
  multi: Record<string, Row[]>;
  /** Names of the selected SAP views (flags of /INOWITS/M_VWSEL, e.g. MARA_BASIC1) */
  views: string[];
}

export type AppId = 'MC' | 'MX' | 'ME';
/** 00 saved as draft, 01 requested, 02 in progress, 03 completed, 04 sent back, 05 rejected (backend STATUS_TEXT) */
export type StatusCode = '00' | '01' | '02' | '03' | '04' | '05';

export interface RequestHeader {
  transId: string;
  appId: AppId | string;
  objValue: string;
  status: StatusCode | string;
  statusText: string;
  initiator: string;
  startDate: string;
  endDate: string;
  workItemId: string;
  isDuplicate: boolean;
  genType: string;
  genField: string;
  genField2: string;
  genField3: string;
  materialType: string;
  description: string;
}

export interface Allowed {
  edit: boolean; validate: boolean; saveDraft: boolean; submit: boolean; approve: boolean; sendBack: boolean; reject: boolean;
  forward: boolean; deleteDraft: boolean; attach: boolean; comment: boolean;
}

export interface HistoryItem {
  serialNo: number; level: string; typeLevel: string; role: string; user: string; status: string; date: string; comment: string;
}

export interface LoadedRequest {
  header: RequestHeader;
  data: BackendData;
  history: HistoryItem[];
  allowed: Allowed;
  /** 'L0' (initiator) .. 'L7' */
  level: string;
}

export interface SapMessage { code: string; message: string; severity: string; target: string }

export interface Session { user: string; displayName: string; department: string; roles: string[]; mode: string }

export interface FieldControlItem { field: string; shown: boolean; displayOnly: boolean; required: boolean; column: string; source: string }
/** Items per SAP view name; key-data ("general") rules sit under the empty name */
export type FieldControl = Record<string, FieldControlItem[]>;

export interface ValueOption { key: string; text: string }
export interface DuplicateHit { matnr: string; description: string; materialType: string; score: number }
export interface PostedMaterial { matnr: string; description: string; materialType: string; materialGroup: string; unit: string; busy: boolean }
export interface ScopeRow {
  kind: string; plant: string; plantText: string; storageLocation: string; storageLocationText: string;
  salesOrg: string; salesOrgText: string; distributionChannel: string; distributionChannelText: string;
}
export interface Attachment { attachId: string; fileName: string; mimeType: string; docType?: string; size: number; uploadedBy: string; uploadedAt: string; level: string }
export interface Comment { commentId: string; text: string; user: string; createdAt: string; level: string }

export class MmApiError extends Error {
  constructor(message: string, public status: number, public messages: SapMessage[] = []) { super(message); }
}

const base = () => `${hubApiRoot()}/me/mm-mdm`;

async function request<T>(method: string, path: string, payload?: unknown, init: { headers?: Record<string, string>; raw?: BodyInit } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${hubToken()}`,
        ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.raw ?? (payload !== undefined ? JSON.stringify(payload) : undefined),
      cache: 'no-store',
    });
  } catch {
    throw new MmApiError('The Material master service could not be reached. Check your connection and try again.', 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const b = body as { error?: string; messages?: SapMessage[] } | null;
    throw new MmApiError(b?.error || `The Material master service answered HTTP ${res.status}.`, res.status, Array.isArray(b?.messages) ? b!.messages! : []);
  }
  return body as T;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const q = Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return q ? `?${q}` : '';
};
const id = (v: string) => encodeURIComponent(v);

/* ------------------------------------------------------------------ */

export const getSession = () => request<Session>('GET', '/session');

/** scope: 'inbox' = waiting for me, 'mine' = raised by me, empty = all (as far as SAP lets this user see) */
export const listRequests = (q: { scope?: string; status?: string; materialType?: string; text?: string } = {}) =>
  request<RequestHeader[]>('GET', `/requests${qs(q)}`);

export interface StartInput {
  materialType: string; industrySector: string; description: string; mainGroup?: string; subGroup?: string; subSubGroup?: string;
  manufacturerPart?: string; plant: string; storageLocation: string; salesOrg: string; distributionChannel: string; views: string[]; draft: boolean;
}
export const startRequest = (i: StartInput) => request<LoadedRequest>('POST', '/requests', i);
export const getRequest = (rid: string) => request<LoadedRequest>('GET', `/requests/${id(rid)}`);
/** Live values a change request (MX) started from, same shape as request.data; exists=false when there is no base to compare with */
export interface BaseData { exists: boolean; baseId?: string; data: { single: Record<string, Row>; multi: Record<string, Row[]> } }
export const getBase = (rid: string) => request<BaseData>('GET', `/requests/${id(rid)}/base`);
export const saveRequest = (rid: string, data: BackendData) => request<{ request: LoadedRequest; messages: SapMessage[] }>('PUT', `/requests/${id(rid)}`, { data });
export const deleteRequest = (rid: string) => request<{ ok: boolean }>('DELETE', `/requests/${id(rid)}`);
export const validateRequest = (rid: string, data: BackendData) => request<{ messages: SapMessage[] }>('POST', `/requests/${id(rid)}/validate`, { data });
export const submitRequest = (rid: string, data: BackendData, comment = '') =>
  request<{ request: LoadedRequest; messages: SapMessage[] }>('POST', `/requests/${id(rid)}/submit`, { data, comment });

export type WorkflowAction = 'approve' | 'sendback' | 'reject' | 'forward';
export const actOnRequest = (rid: string, action: WorkflowAction, body: { data?: BackendData; comment?: string; agent?: string }) =>
  request<{ request: LoadedRequest; messages: SapMessage[] }>('POST', `/requests/${id(rid)}/${action}`, body);

export const getFieldControl = (type: string, level: string) => request<FieldControl>('GET', `/fieldcontrol${qs({ type, level })}`);
export const getValueHelp = (name: string, params: Record<string, string> = {}) => request<ValueOption[]>('GET', `/valuehelp/${id(name)}${qs(params)}`);
export const checkDuplicates = (description: string, materialType: string) => request<DuplicateHit[]>('POST', '/duplicates', { description, materialType });
export const buildDescription = (i: { mainGroup?: string; subGroup?: string; subSubGroup?: string; description?: string; manufacturerPart?: string }) =>
  request<{ text: string; truncated: boolean }>('POST', '/description', i);
export const getHsn = (text: string) => request<{ code: string; text: string; count: number }[]>('GET', `/hsn${qs({ text })}`);

export const listPosted = (q: { text?: string; materialType?: string; top?: number } = {}) => request<PostedMaterial[]>('GET', `/posted${qs(q)}`);
export const getPostedScope = (matnr: string) => request<ScopeRow[]>('GET', `/posted/${id(matnr)}/scope`);
export const startChange = (i: { matnr: string; plant?: string; storageLocation?: string; salesOrg?: string; distributionChannel?: string }) =>
  request<LoadedRequest>('POST', '/change', i);
export interface ExtensionInput {
  type: 'P' | 'S' | 'V'; matnr: string; plant?: string; storageLocation?: string; salesOrg?: string; distributionChannel?: string;
  valuationType?: string; sourcePlant?: string; sourceSalesOrg?: string; sourceDistributionChannel?: string;
}
export const startExtension = (i: ExtensionInput) => request<LoadedRequest>('POST', '/extension', i);

export const listAttachments = (rid: string) => request<Attachment[]>('GET', `/requests/${id(rid)}/attachments`);
export const addAttachment = (rid: string, file: File, docType = '') =>
  request<Attachment>('POST', `/requests/${id(rid)}/attachments${docType ? `?docType=${encodeURIComponent(docType)}` : ''}`, undefined, {
    headers: { Slug: encodeURIComponent(file.name), 'Content-Type': file.type || 'application/octet-stream' }, raw: file,
  });
export const deleteAttachment = (rid: string, attachId: string) => request<{ ok: boolean }>('DELETE', `/requests/${id(rid)}/attachments/${id(attachId)}`);
/** Downloads one attachment through the hub (the token cannot ride a plain link) and opens it as a file save */
export async function downloadAttachment(rid: string, a: Attachment): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${base()}/requests/${id(rid)}/attachments/${id(a.attachId)}`, { headers: { Authorization: `Bearer ${hubToken()}` }, cache: 'no-store' });
  } catch { throw new MmApiError('The Material master service could not be reached.', 0); }
  if (!res.ok) throw new MmApiError(`The file could not be downloaded (HTTP ${res.status}).`, res.status);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = a.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const listComments = (rid: string) => request<Comment[]>('GET', `/requests/${id(rid)}/comments`);
export const addComment = (rid: string, text: string) => request<Comment>('POST', `/requests/${id(rid)}/comments`, { text });
