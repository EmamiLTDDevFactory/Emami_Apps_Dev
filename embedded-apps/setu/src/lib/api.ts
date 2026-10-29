/**
 * Client for the Setu routes of the shared Emami Apps backend (backend/setu/, mounted at /api/setu).
 * The caller's hub session JWT (same-origin localStorage, written by the hub at sign-in) goes as a Bearer
 * token; the backend checks the 'setu' grant in Manage Access and its role (Agent / Supervisor / Admin).
 *
 * Same dev/prod split as access-tracker's api.ts: a dev.emamiapps.in page reads the dev database through
 * the /dev-api prefix. NEXT_PUBLIC_SETU_API_URL overrides it (local development).
 */
import { getHubToken } from './hub';
import type {
  ActivityItem, AdminAgent, AdminField, AdminGroup, AgentPrefs, AuditEvent, AutomationRule, BellEvent, BellItem, ContactMatch, Counts, Dashboard,
  DashboardInsights, DayWindow, Distributor, EmailTemplate, Me, Meta, ParkedMail, SeverityRule, SlaPolicy, Ticket, TicketDetail, TicketInsights, TicketRow,
} from './types';

const API_HOST = 'https://audit-capa-api.emamiapps.in';

function apiBase(): string {
  if (process.env.NEXT_PUBLIC_SETU_API_URL) return process.env.NEXT_PUBLIC_SETU_API_URL.replace(/\/+$/, '');
  const isDev = typeof window !== 'undefined' && window.location.hostname.includes('dev');
  return `${API_HOST}${isDev ? '/dev-api' : ''}/api`;
}

/** 401 = no/expired hub session, 403 = signed in but no Setu access (or not allowed for that action). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// App-wide listener so any 401 drops the app into the "session expired" screen.
let onUnauthorized: ((message: string) => void) | null = null;
export const setUnauthorizedHandler = (fn: (message: string) => void) => { onUnauthorized = fn; };

type Json = Record<string, unknown>;

async function request<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/setu${path}`, {
      method,
      headers: { Authorization: `Bearer ${getHubToken()}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the Emami Apps server. Check the network and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    const err = new ApiError(data?.error || 'Something went wrong. Please try again.', res.status);
    if (res.status === 401) onUnauthorized?.(err.message);
    throw err;
  }
  return data as T;
}

/** Full URL of a Setu API path (shown to admins, e.g. the WhatsApp webhook address to give Meta). */
export const setuApiUrl = (path: string) => `${apiBase()}/setu${path}`;

const get = <T>(p: string) => request<T & Json>('GET', p);
const qs = (o: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};

// ---------- Requester portal (no hub sign-in; the backend ignores the empty token on these routes) ----------
export interface PortalTicketStatus { id: number; subject: string; status: string; isResolved: boolean; isClosed: boolean; createdAt: string; lastActivityAt: string | null; resolvedAt: string | null }
export const portalConfig = () => get<{ enabled: boolean; categories?: string[] }>('/portal/config');
export const portalCreate = (body: { name: string; email: string; phone: string; distributorCode: string; category: string; subject: string; description: string; website: string }) =>
  request<{ ticket: { id: number } }>('POST', '/portal/tickets', body).then((r) => r.ticket);
export const portalStatus = (id: number, email: string) => request<{ ticket: PortalTicketStatus }>('POST', '/portal/status', { id, email }).then((r) => r.ticket);

// ---------- Me & reference data ----------
export const getMe = () =>
  get<{ me: Me; agentStatuses: Meta['agentStatuses']; mailEnabled: boolean; whatsappEnabled: boolean; prefs: AgentPrefs; bellEvents: BellEvent[] }>('/me');
export const savePrefs = (prefs: { bellMuted: BellEvent[] }) => request<{ prefs: AgentPrefs }>('PUT', '/me/preferences', prefs).then((r) => r.prefs);
export const searchContacts = (q: string) => get<{ items: ContactMatch[] }>(`/contacts/search${qs({ q })}`).then((r) => r.items);

// ---------- In-app bell ----------
export const getBell = () => get<{ items: BellItem[]; unread: number }>('/notifications');
export const markBellRead = (body: { ids: number[] } | { all: true }) => request('POST', '/notifications/read', body);

// ---------- Personal canned responses (private to the signed-in agent) ----------
export const saveMyCanned = (b: { id?: number; folder: string; title: string; shortCode: string; body: string }) => request('POST', '/me/canned', b);
export const deleteMyCanned = (id: number) => request('DELETE', `/me/canned/${id}`);
export const setAvailability = (availability: string) => request('PATCH', '/me/availability', { availability });
export const getMeta = () => get<Meta>('/meta');
export const lookupDistributor = (code: string) => get<{ distributor: Distributor | null }>(`/distributors/lookup${qs({ code })}`).then((r) => r.distributor);

// ---------- Tickets ----------
export interface TicketQuery {
  view?: string;
  statusId?: string;
  priority?: string;
  severity?: string;
  groupId?: string;
  agentId?: string;
  source?: string;
  type?: string;
  category?: string;
  activity?: string;
  tag?: string;
  from?: string;
  to?: string;
  due?: string;
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}
export const listTickets = (q: TicketQuery) => get<{ items: TicketRow[]; total: number; page: number; pageSize: number }>(`/tickets${qs({ ...q })}`);
export const getCounts = () => get<{ counts: Counts }>('/tickets/counts').then((r) => r.counts);
export const getTicket = (id: number) => get<TicketDetail>(`/tickets/${id}`);
export const createTicket = (body: Json) => request<{ ticket: Ticket }>('POST', '/tickets', body).then((r) => r.ticket);
export const updateTicket = (id: number, patch: Json) => request<{ ticket: Ticket }>('PATCH', `/tickets/${id}`, patch).then((r) => r.ticket);
export const addMessage = (id: number, body: { kind: 'REPLY' | 'NOTE' | 'FORWARD'; text: string; to?: string; cc?: string }) =>
  request<{ delivery: { sent: boolean; reason?: string } | null }>('POST', `/tickets/${id}/messages`, body).then((r) => r.delivery);
export const logCall = (id: number, body: { phone: string; direction: 'OUTBOUND' | 'INBOUND'; outcome: string; durationMins: number; notes: string }) =>
  request('POST', `/tickets/${id}/calls`, body);
export const addTimeLog = (id: number, minutes: number, note: string) => request('POST', `/tickets/${id}/time-logs`, { minutes, note });

// ---------- Board, dashboard, reports ----------
export const getBoard = (q: { mine?: string; groupId?: string }) => get<{ items: TicketRow[] }>(`/board${qs(q)}`).then((r) => r.items);
export const getDashboard = () => get<Dashboard>('/dashboard');
export const getDashboardInsights = (refresh = false) =>
  get<{ insights: DashboardInsights }>(`/insights/dashboard${refresh ? '?refresh=1' : ''}`).then((r) => r.insights);
export const getTicketInsights = (id: number, generate = false) => get<TicketInsights>(`/tickets/${id}/insights${generate ? '?generate=1' : ''}`);
export const getDailyReport = (from: string, to: string) => get<{ columns: string[]; rows: (string | number)[][] }>(`/reports/daily${qs({ from, to })}`);
export const runJobs = () => request<{ result: Json }>('POST', '/jobs/run').then((r) => r.result);

// ---------- Admin ----------
export const admin = {
  agents: () => get<{ agents: AdminAgent[] }>('/admin/agents').then((r) => r.agents),
  saveAgent: (b: { email: string; name: string; active: boolean; groupIds: number[] }) => request('POST', '/admin/agents', b),
  groups: () => get<{ groups: AdminGroup[] }>('/admin/groups').then((r) => r.groups),
  saveGroup: (b: { id?: number; name: string; description?: string; assignment: string; agentIds: number[] }) => request('POST', '/admin/groups', b),
  settings: () => get<{ settings: Record<string, unknown> }>('/admin/settings').then((r) => r.settings),
  saveSettings: (b: Json) => request('PUT', '/admin/settings', b),
  templates: () => get<{ templates: EmailTemplate[] }>('/admin/templates').then((r) => r.templates),
  saveTemplate: (key: string, b: { subject: string; body: string; enabled: boolean }) => request('PUT', `/admin/templates/${encodeURIComponent(key)}`, b),
  saveCanned: (b: { id?: number; folder: string; title: string; shortCode: string; body: string }) => request('POST', '/admin/canned', b),
  deleteCanned: (id: number) => request('DELETE', `/admin/canned/${id}`),
  distributors: (q: string) => get<{ items: Distributor[]; total: number; lastUpdated: string | null }>(`/admin/distributors${qs({ q })}`),
  importDistributors: (rows: string[][]) => request<{ imported: number }>('POST', '/admin/distributors/import', { rows }).then((r) => r.imported),
  anonymize: (who: { email: string } | { phone: string }) => request('POST', '/admin/contacts/anonymize', who),
  sla: () => get<{ policies: SlaPolicy[] }>('/admin/sla').then((r) => r.policies),
  saveSlaTarget: (id: number, b: Json) => request('PUT', `/admin/sla/targets/${id}`, b),
  saveSlaGroups: (policyId: number, groupIds: number[]) => request('PUT', `/admin/sla/policies/${policyId}/groups`, { groupIds }),
  severityRules: () => get<{ rules: SeverityRule[] }>('/admin/severity-rules').then((r) => r.rules),
  saveSeverityRule: (b: { category: string; function: string; severity: string }) => request('POST', '/admin/severity-rules', b),
  deleteSeverityRule: (id: number) => request('DELETE', `/admin/severity-rules/${id}`),
  fields: () => get<{ fields: AdminField[] }>('/admin/fields').then((r) => r.fields),
  saveField: (id: number, b: { label?: string; required?: boolean }) => request('PATCH', `/admin/fields/${id}`, b),
  addChoices: (fieldId: number, values: string, parentId?: number | null) => request<{ added: number }>('POST', `/admin/fields/${fieldId}/choices`, { values, parentId: parentId ?? null }),
  saveChoice: (id: number, b: { value?: string; active?: boolean }) => request('PATCH', `/admin/choices/${id}`, b),
  businessHours: () => get<{ businessHours: { id: number; name: string; timezone: string; days: DayWindow[] } | null; holidays: { id: number; date: string; name: string }[] }>('/admin/business-hours'),
  saveBusinessHours: (days: DayWindow[]) => request('PUT', '/admin/business-hours', { days }),
  addHoliday: (date: string, name: string) => request('POST', '/admin/holidays', { date, name }),
  deleteHoliday: (id: number) => request('DELETE', `/admin/holidays/${id}`),
  automations: () => get<{ rules: AutomationRule[] }>('/admin/automations').then((r) => r.rules),
  toggleAutomation: (id: number, active: boolean) => request('PATCH', `/admin/automations/${id}`, { active }),
  audit: () => get<{ events: AuditEvent[] }>('/admin/audit').then((r) => r.events),
  parkedMail: () => get<{ items: ParkedMail[] }>('/admin/parked-mail').then((r) => r.items),
};

export type { ActivityItem };
