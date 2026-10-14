/**
 * Client for the hub backend's IT Change Control Board routes (backend/changeControl.js, mounted at
 * /api/change-control). Every call carries the caller's hub session JWT (same-origin localStorage,
 * written by the hub at sign-in) as a Bearer token; the backend reads the caller's role from their
 * 'change-control' grant in Manage Access and enforces the workflow there, never here.
 *
 * Same dev/prod split as access-tracker's api.ts and dev-tracker's constants.js: a dev.emamiapps.in
 * page reads the dev database through the /dev-api prefix.
 */
import { getHubToken } from './hub';

const API_HOST = 'https://audit-capa-api.emamiapps.in';

function apiBase(): string {
  if (process.env.NEXT_PUBLIC_ACCESS_API_URL) return `${process.env.NEXT_PUBLIC_ACCESS_API_URL}/change-control`;
  const isDev = typeof window !== 'undefined' && window.location.hostname.includes('dev');
  return `${API_HOST}${isDev ? '/dev-api' : ''}/api/change-control`;
}

export type Role = 'User' | 'Change Manager' | 'CAB Member' | 'CAB Chair' | 'Admin';
export type ChangeType = 'standard' | 'normal' | 'emergency';
export type Category = 'infrastructure' | 'application' | 'sap' | 'network' | 'security' | 'database' | 'end_user';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Risk = 'low' | 'medium' | 'high';
export type Status = 'draft' | 'submitted' | 'cab_review' | 'approved' | 'rejected' | 'implementing' | 'implemented' | 'closed' | 'cancelled';
export type Outcome = 'successful' | 'partial' | 'failed' | 'rolled_back';
export type Action =
  | 'submit' | 'cancel' | 'return_to_draft' | 'forward_to_cab' | 'reject'
  | 'emergency_approve' | 'approve' | 'start_implementation' | 'complete' | 'close';

export interface Change {
  id: number;
  crNo: string;
  title: string;
  description: string;
  justification: string;
  changeType: ChangeType;
  category: Category;
  priority: Priority;
  impact: number;
  likelihood: number;
  riskLevel: Risk;
  affectedSystems: string;
  affectedLocations: string;
  implementationPlan: string;
  rollbackPlan: string;
  testPlan: string;
  downtimeMinutes: number;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  status: Status;
  outcome: Outcome | null;
  reviewNotes: string | null;
  closureNotes: string | null;
  requesterEmail: string;
  implementerEmail: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Vote { id: number; voterEmail: string; decision: 'approve' | 'reject' | 'abstain'; comment: string; votedAt: string }
export interface Comment { id: number; authorEmail: string; body: string; createdAt: string }
export interface HistoryEntry {
  id: number;
  changeId: number | null;
  actorEmail: string;
  actorRole: string | null;
  action: string;
  fromStatus: Status | null;
  toStatus: Status | null;
  details: Record<string, unknown> | null;
  occurredAt: string;
  crNo?: string | null;
  title?: string | null;
}
export type Names = Record<string, string>;

export interface Me { email: string; name: string | null; role: Role }
export interface Person { email: string; name: string | null; role: Role }
export interface Dashboard {
  counts: Partial<Record<Status, number>>;
  avgDecisionHours: number | null;
  successRate: number | null;
  /** null when the caller's role has no review queue (plain requesters). */
  queue: Change[] | null;
  mine: Change[];
  upcoming: Change[];
}
export interface Detail {
  change: Change;
  votes: Vote[];
  comments: Comment[];
  history: HistoryEntry[];
  names: Names;
  actions: Action[];
  canVote: boolean;
}

/** 401 = no/expired hub session, 403 = not granted (or not allowed this action), 409 = stale. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${getHubToken()}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the Emami Apps server. Check the network and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) throw new ApiError(data?.error || 'Something went wrong. Please try again.', res.status);
  return data as T;
}

export const getMe = () => call<{ me: Me }>('/me').then((d) => d.me);
export const getPeople = () => call<{ people: Person[] }>('/people').then((d) => d.people);
export const getDashboard = () => call<{ dashboard: Dashboard }>('/dashboard').then((d) => d.dashboard);
export const getChanges = (f: { q?: string; status?: string; type?: string; category?: string; mine?: boolean }) => {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.status) p.set('status', f.status);
  if (f.type) p.set('type', f.type);
  if (f.category) p.set('category', f.category);
  if (f.mine) p.set('mine', '1');
  return call<{ changes: Change[]; names: Names }>(`/changes?${p}`);
};
export const getDetail = (id: number) => call<{ detail: Detail }>(`/changes/${id}`).then((d) => d.detail);
export const createChange = (body: Record<string, unknown>) => call<{ change: Change }>('/changes', { method: 'POST', body }).then((d) => d.change);
export const transition = (id: number, body: { action: Action; note?: string; impact?: number; likelihood?: number; outcome?: Outcome }) =>
  call<{ change: Change }>(`/changes/${id}/transition`, { method: 'POST', body });
export const vote = (id: number, body: { decision: string; comment: string }) => call(`/changes/${id}/votes`, { method: 'POST', body });
export const addComment = (id: number, body: string) => call(`/changes/${id}/comments`, { method: 'POST', body: { body } });
export const getHistory = () => call<{ history: HistoryEntry[]; names: Names }>('/history');
