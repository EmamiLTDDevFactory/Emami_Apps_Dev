// Access Requests (backend/accessRequests.js) — the self-service ticket flow for app/role authorization.
// Same Postgres-reachable backend as Manage Access (NEXT_PUBLIC_ACCESS_API_URL). authFetch attaches the session token when
// there is one: a signed-in request is stored as verified, one from the login page (no token) as unverified.
import { authFetch } from './authFetch';
import { ACCESS_CHANGED_EVENT } from './accessApi';

const ACCESS_API_URL =
  process.env.NEXT_PUBLIC_ACCESS_API_URL || process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';
const BASE = `${ACCESS_API_URL}/access/requests`;

export type RequestStatus = 'Pending' | 'Approved' | 'Partially Approved' | 'Rejected';
export type ItemDecision = 'Pending' | 'Approved' | 'Rejected';

export interface RequestItem {
  id: number;
  appId: string;
  role: string;
  depot: string | null;
  decision: ItemDecision;
  decisionNote: string | null;
  decidedBy?: string | null;
  decidedAt: string | null;
  appliedAt?: string | null;
}
export interface AccessRequestSummary {
  id: number;
  ref: string;
  firstName: string;
  lastName: string;
  email: string;
  requesterVerified: boolean;
  existingUser: boolean;
  status: RequestStatus;
  justification: string;
  createdAt: string;
  decidedAt: string | null;
  decidedBy?: string | null;
  decisionNote: string | null;
  items: RequestItem[];
  fileCount: number;
}
export interface RequestFile { id: number; filename: string; contentType: string; size: number; sha256: string; uploadedAt: string }
export interface RequestEvent { id: number; actor: string | null; actorRole: string | null; type: string; detail: string | null; ip: string | null; occurredAt: string }
export interface AccessRequestDetail extends AccessRequestSummary {
  submittedIp: string | null;
  account: { exists: boolean; isActive?: boolean; accessLevel?: string };
  currentGrants: { appId: string; role: string; depot: string | null }[];
  files: RequestFile[];
  events: RequestEvent[];
}

export interface AttachmentInput { name: string; data: string }
export interface NewRequestInput {
  firstName: string;
  lastName: string;
  email: string;
  justification: string;
  items: { appId: string; role: string; depot?: string | null }[];
  files: AttachmentInput[];
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const NETWORK = 'Could not reach the server. Please try again.';

async function call<T>(url: string, init?: RequestInit, pick?: (data: any) => T): Promise<Result<T>> {
  try {
    const res = await authFetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Something went wrong. Please try again.' };
    return { ok: true, ...(pick ? pick(data) : ({} as T)) };
  } catch {
    return { ok: false, error: NETWORK };
  }
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const MAX_ATTACHMENT_TOTAL_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.msg,.eml,.doc,.docx,.txt';

/** Reads a File as base64 (no data: prefix) for the JSON body. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}

export const submitAccessRequest = (input: NewRequestInput) =>
  call(BASE, json('POST', input), (d) => ({ id: d.id as number, ref: d.ref as string }));

export const lookupRequestStatus = (ref: string, email: string) =>
  call(`${BASE}/status`, json('POST', { ref, email }), (d) => ({ request: d.request as AccessRequestSummary }));

export const getMyRequests = () => call(`${BASE}/mine`, undefined, (d) => ({ requests: d.requests as AccessRequestSummary[] }));

export const getPendingRequestCount = () => call(`${BASE}/pending-count`, undefined, (d) => ({ pending: d.pending as number }));

export const listAccessRequests = (status?: RequestStatus) =>
  call(`${BASE}${status ? `?status=${encodeURIComponent(status)}` : ''}`, undefined, (d) => ({ requests: d.requests as AccessRequestSummary[] }));

export const getAccessRequest = (id: number) => call(`${BASE}/${id}`, undefined, (d) => ({ request: d.request as AccessRequestDetail }));

export const decideAccessRequest = async (
  id: number,
  body: { decisions?: { itemId: number; decision: 'Approved' | 'Rejected'; note?: string }[]; sendBack?: boolean; note?: string }
) => {
  const res = await call(`${BASE}/${id}/decision`, json('POST', body), (d) => ({ status: d.status as RequestStatus }));
  // A decision changes someone's access and the pending count: tell the sidebar badge / own-grants refresh.
  if (res.ok && typeof window !== 'undefined') window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
  return res;
};

/** Downloads one stored document. The route needs the Authorization header, so it is fetched and saved from a blob. */
export async function downloadRequestFile(requestId: number, file: RequestFile): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch(`${BASE}/${requestId}/files/${file.id}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error || 'Could not open the file.' };
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK };
  }
}
