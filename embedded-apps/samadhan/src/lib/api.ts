/**
 * Client for the Samadhan routes of the shared Emami Apps backend (backend/samadhan/, mounted at /api/samadhan;
 * formerly Setu - the backend still answers on /api/setu as an alias).
 * The caller's hub session JWT (same-origin localStorage, written by the hub at sign-in) goes as a Bearer
 * token; the backend checks the Samadhan grant in Manage Access and its role (Agent / Supervisor / Admin).
 *
 * Same dev/prod split as access-tracker's api.ts: a dev.emamiapps.in page reads the dev database through
 * the /dev-api prefix. NEXT_PUBLIC_SAMADHAN_API_URL (or the older NEXT_PUBLIC_SETU_API_URL) overrides it (local development).
 */
import { getHubToken } from './hub';
import type { Scope, Visibility } from './permissions';
import type {
  ActivityItem, AdminAgent, AdminField, AdminGroup, AgentPrefs, Analytics, Article, ArticleRow, AuditEvent, AutomationRule, BellEvent, BellItem, Breakdown, Company,
  ContactDetail, ContactMatch, ContactRow, Counts, Dashboard, DashboardInsights, DayWindow, Distributor, EmailTemplate, Me, Meta, ParkedMail, PresenceAgent,
  Attachment, AttachmentLimits, AttachmentsInfo, SavedView, Scenario, ScenarioAction, SearchResults, SeverityRule, SlaPolicy, Ticket, TicketDetail, TicketInsights, TicketRow, Todo,
  AccessUser, Overview, ReportVariantConfig, Role, Variant, Workspace, Application, MatrixCell, PriorityMode,
} from './types';

const API_HOST = 'https://audit-capa-api.emamiapps.in';

function apiBase(): string {
  const override = process.env.NEXT_PUBLIC_SAMADHAN_API_URL || process.env.NEXT_PUBLIC_SETU_API_URL;
  if (override) return override.replace(/\/+$/, '');
  const isDev = typeof window !== 'undefined' && window.location.hostname.includes('dev');
  return `${API_HOST}${isDev ? '/dev-api' : ''}/api`;
}

/** 401 = no/expired hub session, 403 = signed in but no Samadhan access (or not allowed for that action). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data?: Record<string, unknown> | null) {
    super(message);
  }
}

// App-wide listener so any 401 drops the app into the "session expired" screen.
let onUnauthorized: ((message: string) => void) | null = null;
export const setUnauthorizedHandler = (fn: (message: string) => void) => { onUnauthorized = fn; };

type Json = Record<string, unknown>;

// Route prefix on the server. Until the web server forwards /api/samadhan (dev: one nginx block, server admin), a request
// there is answered by another service (a 404 that is not a Samadhan answer - every Samadhan answer has `success`). The
// app then uses the transport route that is forwarded today, for the rest of the visit (remembered for the tab).
const ROUTE_KEY = 'samadhan.route';
const FALLBACK_ROUTE = 'setu';
let prefix: string = (() => { try { return sessionStorage.getItem(ROUTE_KEY) || 'samadhan'; } catch { return 'samadhan'; } })();
/** True when a 404 did not come from Samadhan (so the route itself is missing on the web server). */
async function notSamadhan(res: Response): Promise<boolean> {
  if (res.status !== 404 || prefix !== 'samadhan') return false;
  const body = await res.clone().json().catch(() => null);
  return !body || typeof body.success !== 'boolean';
}
function useFallbackRoute() {
  prefix = FALLBACK_ROUTE;
  try { sessionStorage.setItem(ROUTE_KEY, FALLBACK_ROUTE); } catch { /* private mode: this page only */ }
}

async function request<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  const send = () => fetch(`${apiBase()}/${prefix}${path}`, {
    method,
    headers: { Authorization: `Bearer ${getHubToken()}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  try {
    res = await send();
    if (await notSamadhan(res)) {
      useFallbackRoute();
      res = await send();
    }
  } catch {
    throw new ApiError('Could not reach the Emami Apps server. Check the network and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    const err = new ApiError(data?.error || 'Something went wrong. Please try again.', res.status, data);
    if (res.status === 401) onUnauthorized?.(err.message);
    throw err;
  }
  return data as T;
}

/** Full URL of a Samadhan API path (shown to admins, e.g. the WhatsApp webhook address to give Meta). */
export const samadhanApiUrl = (path: string) => `${apiBase()}/samadhan${path}`;

const get = <T>(p: string) => request<T & Json>('GET', p);
const qs = (o: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};

// ---------- Requester portal (no hub sign-in; the backend ignores the empty token on these routes) ----------
export interface PortalTicketStatus { id: number; ref?: string; subject: string; status: string; isResolved: boolean; isClosed: boolean; createdAt: string; lastActivityAt: string | null; resolvedAt: string | null }
export const portalConfig = () => get<{ enabled: boolean; categories?: string[]; helpdeskName?: string; intro?: string; supportEmail?: string; files?: { limits: AttachmentLimits['portal'] } | null }>('/portal/config');
export const portalCreate = (body: { name: string; email: string; phone: string; distributorCode: string; category: string; subject: string; description: string; website: string }) =>
  request<{ ticket: { id: number; ref?: string }; files?: { uploadToken: string; limits: AttachmentLimits['portal'] } }>('POST', '/portal/tickets', body).then((r) => ({ ...r.ticket, files: r.files ?? null }));
export const portalStatus = (id: number | string, email: string) => request<{ ticket: PortalTicketStatus }>('POST', '/portal/status', { id, email }).then((r) => r.ticket);
export interface PortalArticle { id: number; category: string; folder: string; title: string; body: string; tags: string[] }
export const portalArticles = (q = '') => get<{ items: PortalArticle[] }>(`/portal/articles${qs({ q })}`).then((r) => r.items);
export interface CsatSurvey { ticketId: number; subject: string; agentName: string | null; answered: boolean; question?: string; labels?: Record<'1' | '2' | '3', string> }
export const portalCsat = (token: string) => get<{ survey: CsatSurvey }>(`/portal/csat/${encodeURIComponent(token)}`).then((r) => r.survey);
export const portalCsatAnswer = (token: string, rating: 1 | 2 | 3, comment: string) => request('POST', `/portal/csat/${encodeURIComponent(token)}`, { rating, comment });

// ---------- Me & reference data ----------
export const getMe = () =>
  get<{ me: Me; agentStatuses: Meta['agentStatuses']; mailEnabled: boolean; whatsappEnabled: boolean; prefs: AgentPrefs; bellEvents: BellEvent[]; permissions?: string[]; scope?: Scope; attachments?: AttachmentsInfo }>('/me');
/** Only the keys sent change (bellMuted, emailMuted, listView, pageSize, dashboardWidgets, defaultVariants). */
export const savePrefs = (prefs: Partial<AgentPrefs>) => request<{ prefs: AgentPrefs }>('PUT', '/me/preferences', prefs).then((r) => r.prefs);
export const searchContacts = (q: string) => get<{ items: ContactMatch[] }>(`/contacts/search${qs({ q })}`).then((r) => r.items);

// ---------- In-app bell ----------
export const getBell = (q: { unread?: boolean; events?: BellEvent[]; before?: number } = {}) =>
  get<{ items: BellItem[]; unread: number; more: boolean; unreadByEvent: Partial<Record<BellEvent, number>> }>(`/notifications${qs({ unread: q.unread ? 1 : undefined, events: q.events?.join(','), before: q.before })}`);
export const clearReadBell = () => request<{ cleared: number }>('POST', '/notifications/clear', {});
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
  region?: string;
  state?: string;
  depot?: string;
  salesOrg?: string;
  l2Agent?: string;
  asmName?: string;
  created?: string;
  resDue?: string;
  frDue?: string;
  requesterId?: string;
  companyId?: string;
  /** v7: '1' = only tickets with files. */
  hasAttachments?: string;
  /** v7 Phase 3: comma-separated ids / record classes; '1' = needs classification. */
  applicationId?: string;
  workspaceId?: string;
  recordClass?: string;
  needsClassification?: string;
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
/** v7 Phase 3: confirm the automatic classification (no applicationId) or change the application. */
export const classifyTicket = (id: number, applicationId?: number) =>
  request<{ ticket: Ticket }>('POST', `/tickets/${id}/classify`, applicationId ? { applicationId } : {}).then((r) => r.ticket);
export const addMessage = (id: number, body: { kind: 'REPLY' | 'NOTE' | 'FORWARD'; text: string; to?: string; cc?: string; statusAfter?: number; attachmentIds?: number[] }) =>
  request<{ delivery: { sent: boolean; reason?: string } | null }>('POST', `/tickets/${id}/messages`, body).then((r) => r.delivery);
export const logCall = (id: number, body: { phone: string; direction: 'OUTBOUND' | 'INBOUND'; outcome: string; durationMins: number; notes: string }) =>
  request('POST', `/tickets/${id}/calls`, body);
export const addTimeLog = (id: number, minutes: number, note: string) => request('POST', `/tickets/${id}/time-logs`, { minutes, note });
export const watchTicket = (id: number, watch: boolean) => request('POST', `/tickets/${id}/watch`, { watch });
export const linkTickets = (id: number, ids: number[], unlink = false) => request<{ linked: number[] }>('POST', `/tickets/${id}/links`, { ids, unlink });
export const mergeTickets = (id: number, ids: number[]) => request<{ merged: number[] }>('POST', `/tickets/${id}/merge`, { ids });
export const runScenario = (id: number, scenarioId: number) => request<{ name: string }>('POST', `/tickets/${id}/scenarios/${scenarioId}`, {});
export const reportPresence = (id: number, mode: 'viewing' | 'replying' | 'leave') =>
  request<{ others: PresenceAgent[] }>('POST', `/tickets/${id}/presence`, { mode }).then((r) => r.others);
export type BulkAction = 'update' | 'close' | 'watch' | 'unwatch' | 'spam' | 'unspam' | 'trash' | 'restore' | 'purge' | 'merge';
export const bulkTickets = (ids: number[], action: BulkAction, patch?: Json) =>
  request<{ done: number[]; failed: { id: number; error: string }[] }>('POST', '/tickets/bulk', { ids, action, patch });
export const exportColumns = () => get<{ columns: string[] }>('/tickets/export/columns').then((r) => r.columns);
export const exportTickets = (q: TicketQuery, columns: string[]) =>
  get<{ columns: string[]; rows: (string | number)[][] }>(`/tickets/export${qs({ ...q, page: undefined, pageSize: undefined, columns: columns.join(',') })}`);

// ---------- To-dos, saved views, search ----------
export const getTodos = () => get<{ items: Todo[] }>('/todos').then((r) => r.items);
export const addTodo = (b: { text: string; dueAt?: string | null; ticketId?: number | null }) => request<{ todo: Todo }>('POST', '/todos', b).then((r) => r.todo);
export const updateTodo = (id: number, b: { done?: boolean; text?: string; dueAt?: string | null }) => request('PATCH', `/todos/${id}`, b);
export const deleteTodo = (id: number) => request('DELETE', `/todos/${id}`);
export const getViews = () => get<{ views: SavedView[] }>('/views').then((r) => r.views);
export const saveView = (b: { name: string; shared: boolean; query: TicketQuery }) => request<{ id: number }>('POST', '/views', b).then((r) => r.id);
export const deleteView = (id: number) => request('DELETE', `/views/${id}`);
export const globalSearch = (q: string) => get<SearchResults>(`/search${qs({ q })}`);

// ---------- Contacts, companies, Solutions ----------
export const listContacts = (q: { q?: string; page?: number; companyId?: number }) => get<{ items: ContactRow[]; total: number; page: number }>(`/contacts${qs(q)}`);
export const getContact = (id: number) => get<ContactDetail>(`/contacts/${id}`);
export const updateContact = (id: number, b: { name?: string; email?: string; phone?: string; mobile?: string; companyId?: number | null }) => request('PATCH', `/contacts/${id}`, b);
export const listCompanies = () => get<{ items: Company[] }>('/companies').then((r) => r.items);
export const saveCompany = (b: { id?: number; name: string; description?: string; domains?: string }) => request('POST', '/companies', b);
export const listArticles = (q: { q?: string; category?: string }) => get<{ items: ArticleRow[] }>(`/articles${qs(q)}`).then((r) => r.items);
export const getArticle = (id: number) => get<{ article: Article }>(`/articles/${id}`).then((r) => r.article);
export const saveArticle = (b: { id?: number; category: string; folder: string; title: string; body: string; status: 'published' | 'draft'; tags: string }) => request('POST', '/articles', b);
export const deleteArticle = (id: number) => request('DELETE', `/articles/${id}`);
export const articleFeedback = (id: number, helpful: boolean) => request('POST', `/articles/${id}/feedback`, { helpful });

// ---------- Board, dashboard, reports ----------
export const getBoard = (q: { mine?: string; groupId?: string; workspaceId?: string }) => get<{ items: TicketRow[] }>(`/board${qs(q)}`).then((r) => r.items);
export const getDashboard = () => get<Dashboard>('/dashboard');
export const getOverview = (days = 30) => get<Overview>(`/dashboard/overview${qs({ days })}`);
export const getVariants = (kind: 'report') => get<{ variants: Variant[] }>(`/variants${qs({ kind })}`).then((r) => r.variants);
export const saveVariant = (b: { id?: number; kind: 'report'; name: string; shared: boolean; config: ReportVariantConfig }) => request<{ id: number }>('POST', '/variants', b).then((r) => r.id);
export const deleteVariant = (id: number) => request('DELETE', `/variants/${id}`);
export const getBreakdown = (q: { days?: number; groupId?: number; applicationId?: string; workspaceId?: string }) => get<Breakdown>(`/dashboard/breakdown${qs(q)}`);
export const getAnalytics = (q: { days?: number; groupId?: number; applicationId?: string; workspaceId?: string }) => get<Analytics>(`/analytics${qs(q)}`);
export const getDashboardInsights = (refresh = false) =>
  get<{ insights: DashboardInsights }>(`/insights/dashboard${refresh ? '?refresh=1' : ''}`).then((r) => r.insights);
export const getTicketInsights = (id: number, generate = false) => get<TicketInsights>(`/tickets/${id}/insights${generate ? '?generate=1' : ''}`);
export const getDailyReport = (from: string, to: string, extra?: string[]) =>
  get<{ columns: string[]; rows: (string | number)[][] }>(`/reports/daily${qs({ from, to, ...(extra?.length ? { extra: extra.join(',') } : {}) })}`);
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
  /** Change numeric thresholds of a rule's conditions: [{ group: 'all' | 'any', index, value }]. */
  saveAutomationThresholds: (id: number, thresholds: { group: 'all' | 'any'; index: number; value: number }[]) => request('PATCH', `/admin/automations/${id}`, { thresholds }),
  saveStatus: (b: { id?: number; name: string; pausesSla: boolean; isResolved?: boolean }) => request('POST', '/admin/statuses', b),
  orderStatuses: (ids: number[]) => request('PUT', '/admin/statuses/order', { ids }),
  deleteStatus: (id: number) => request('DELETE', `/admin/statuses/${id}`),
  access: (q = '') => get<{ users: AccessUser[]; roles: Role[] }>(`/admin/access${qs({ q })}`),
  setRole: (email: string, role: Role) => request('PUT', `/admin/access/${encodeURIComponent(email)}`, { role }),
  removeAccess: (email: string) => request('DELETE', `/admin/access/${encodeURIComponent(email)}`),
  audit: () => get<{ events: AuditEvent[] }>('/admin/audit').then((r) => r.events),
  parkedMail: () => get<{ items: ParkedMail[] }>('/admin/parked-mail').then((r) => r.items),
  scenarios: () => get<{ scenarios: Scenario[] }>('/admin/scenarios').then((r) => r.scenarios),
  saveScenario: (b: { id?: number; name: string; description: string; actions: ScenarioAction[] }) => request('POST', '/admin/scenarios', b),
  deleteScenario: (id: number) => request('DELETE', `/admin/scenarios/${id}`),
};

// ---------- v7 attachments (backend routes/attachments.js) ----------
/** Sends one file as the raw request body (its name in X-File-Name). Same sign-in and /setu fallback as request(). */
async function sendFile<T>(path: string, file: Blob, name: string, signedIn = true): Promise<T> {
  let res: Response;
  const send = () => fetch(`${apiBase()}/${prefix}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), ...(signedIn ? { Authorization: `Bearer ${getHubToken()}` } : {}) },
    body: file,
  });
  try {
    res = await send();
    if (await notSamadhan(res)) { useFallbackRoute(); res = await send(); }
  } catch {
    throw new ApiError('Could not reach the Emami Apps server. Check the network and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    const err = new ApiError(data?.error || (res.status === 413 ? 'The file is too large.' : 'Could not upload the file.'), res.status, data);
    if (res.status === 401) onUnauthorized?.(err.message);
    throw err;
  }
  return data as T;
}
export const listAttachments = (ticketId: number) => get<{ items: Attachment[] }>(`/tickets/${ticketId}/attachments`).then((r) => r.items);
export const uploadAttachment = (ticketId: number, file: Blob, name: string, conversationId?: number) =>
  sendFile<{ attachment: Attachment }>(`/tickets/${ticketId}/attachments${conversationId ? `?conversationId=${conversationId}` : ''}`, file, name).then((r) => r.attachment);
export const deleteAttachment = (ticketId: number, id: number) => request('DELETE', `/tickets/${ticketId}/attachments/${id}`);
/** A 5-minute signed address for the file; inline = shown in the browser (images, PDF) instead of downloaded. */
export const attachmentUrl = async (ticketId: number, id: number, inline = false) => {
  const r = await request<{ url: string }>('POST', `/tickets/${ticketId}/attachments/${id}/link`);
  return `${apiBase()}/${prefix}/${r.url}${inline ? '?inline=1' : ''}`;
};
export const portalUpload = (ticketId: number, token: string, file: Blob, name: string) =>
  sendFile<{ attachment: { id: number; fileName: string; size: number } }>(`/portal/tickets/${ticketId}/attachments?token=${encodeURIComponent(token)}`, file, name, false).then((r) => r.attachment);

// ---------- v7 Authorization cockpit (Admin only; backend routes/authz.js) ----------
export interface AuthzProfile { id: number | null; code: string; name: string; description?: string | null; mode: 'add' | 'restrict' | 'base'; keys: string[]; active: boolean; system: boolean; users?: number; scopePreset?: Record<string, unknown> }
export interface SodWarning { id: string; text: string; email?: string; name?: string; agentId?: number }
export interface AuthzUserRow { id: number; name: string; email: string; role: Role; active: boolean; lastSeenAt: string | null; profiles: string[]; overrides: number; visibility: Visibility }
export interface AuthzAssigned { profileId: number; code: string; name: string; mode: 'add' | 'restrict'; keys: string[]; active: boolean; validFrom: string | null; validTo: string | null; reason: string; createdBy: string | null; createdAt: string }
export interface AuthzOverride { key: string; effect: 'grant' | 'deny'; expiresAt: string | null; reason: string; createdBy: string | null; createdAt: string }
export interface AuthzAccess {
  agent: { id: number; name: string; email: string; role: Role; active: boolean; lastSeenAt: string | null };
  baseProfile: string; profiles: AuthzAssigned[]; overrides: AuthzOverride[]; scope: Scope;
  effective: string[]; screens: string[]; added: string[]; removed: string[]; unused: string[]; sod: SodWarning[];
}
export interface AuthzLogEntry { id: number; actorEmail: string | null; action: string; target: string | null; before: unknown; after: unknown; reason: string | null; createdAt: string }
export interface AuthzReviewRow { id: number; name: string; email: string; role: Role; lastSeenAt: string | null; profiles: string[]; visibility: Visibility; expiring: { what: string; at: string }[]; expired: number; unused: string[]; sod: string[] }
export interface AuthzOverview { usersByRole: Partial<Record<Role, number>>; customProfiles: number; expiringIn7Days: number; confidentialUsers: number; sodWarnings: SodWarning[]; recentChanges: AuthzLogEntry[] }
export interface UserAccessPatch {
  profiles?: { profileId: number; validFrom?: string | null; validTo?: string | null }[];
  overrides?: { key: string; effect: 'grant' | 'deny'; expiresAt?: string | null }[];
  scope?: { visibility?: Visibility; workspaces?: 'all' | string[]; applications?: 'all' | string[] };
  reason: string; acceptSod?: boolean;
}
export const authz = {
  catalogue: () => get<{ catalogue: Record<string, string[]>; visibility: Visibility[]; sodRules: { id: string; text: string; keys: string[] }[] }>('/admin/authz/catalogue'),
  overview: () => get<AuthzOverview>('/admin/authz/overview'),
  profiles: () => get<{ system: AuthzProfile[]; profiles: AuthzProfile[] }>('/admin/authz/profiles'),
  createProfile: (b: { name: string; description?: string; mode?: 'add' | 'restrict'; keys?: string[]; copyOf?: string | number | null; reason: string }) =>
    request<{ profile: AuthzProfile }>('POST', '/admin/authz/profiles', b).then((r) => r.profile),
  saveProfile: (id: number, b: { name?: string; description?: string; mode?: 'add' | 'restrict'; keys?: string[]; active?: boolean; reason: string; acceptSod?: boolean }) =>
    request<{ profile: AuthzProfile }>('PUT', `/admin/authz/profiles/${id}`, b).then((r) => r.profile),
  users: (q = '') => get<{ users: AuthzUserRow[] }>(`/admin/authz/users${qs({ q })}`).then((r) => r.users),
  user: (id: number) => get<{ access: AuthzAccess }>(`/admin/authz/users/${id}`).then((r) => r.access),
  saveUser: (id: number, b: UserAccessPatch) => request<{ access: AuthzAccess }>('PUT', `/admin/authz/users/${id}`, b).then((r) => r.access),
  review: () => get<{ users: AuthzReviewRow[] }>('/admin/authz/review').then((r) => r.users),
  revokeExpired: () => request<{ people: number }>('POST', '/admin/authz/review/revoke-expired', {}).then((r) => r.people),
  log: (q: { q?: string; from?: string; to?: string } = {}) => get<{ entries: AuthzLogEntry[] }>(`/admin/authz/log${qs(q)}`).then((r) => r.entries),
};

// ---------- v7 Phase 3: workspaces, applications, mail classification (Admin) ----------
export interface SenderRule { id: number; kind: 'domain' | 'email'; pattern: string; applicationId: number; code: string; applicationName: string; note: string | null; createdBy: string | null; createdAt: string }
export interface MailClassification {
  settings: { ai: boolean; threshold: number; defaultCode: string };
  prefixInSubject: boolean;
  rules: SenderRule[];
  suggestions: { applicationId: number; code: string; keyword: string; hits: number }[];
  aiAvailable: boolean;
}
export type ApplicationInput = Partial<Pick<Application, 'code' | 'name' | 'workspaceId' | 'description' | 'icon' | 'criticality' | 'businessOwner' | 'itOwnerAgentId' | 'supportGroupId' | 'portalVisible' | 'active' | 'position'>> & { aliases?: string[] | string };
export const workspacesAdmin = {
  get: () => get<{ enabled: boolean; workspaces: Workspace[]; applications: Application[]; matrix: MatrixCell[] }>('/admin/workspaces'),
  setFlag: (enabled: boolean) => request<{ enabled: boolean }>('PUT', '/admin/workspaces/flag', { enabled }),
  saveWorkspace: (id: number, b: Partial<Pick<Workspace, 'name' | 'shortCode' | 'description' | 'enabled' | 'portalEnabled' | 'position' | 'categoryLabel' | 'functionLabel' | 'defaultGroupId'>> & { priorityMode?: PriorityMode }) =>
    request<{ workspace: Workspace }>('PUT', `/admin/workspaces/${id}`, b).then((r) => r.workspace),
  saveMatrix: (id: number, cells: { impact: number; urgency: number; priority: number }[]) => request('PUT', `/admin/workspaces/${id}/matrix`, { cells }),
  createApplication: (b: ApplicationInput) => request<{ application: Application }>('POST', '/admin/applications', b).then((r) => r.application),
  saveApplication: (id: number, b: ApplicationInput) => request<{ application: Application }>('PUT', `/admin/applications/${id}`, b).then((r) => r.application),
  addAlias: (id: number, alias: string) => request('POST', `/admin/applications/${id}/aliases`, { alias }),
  mail: () => get<MailClassification>('/admin/mail-classification'),
  saveMail: (b: { ai: boolean; threshold: number; defaultCode: string; prefixInSubject: boolean }) => request('PUT', '/admin/mail-classification', b),
  addRule: (b: { kind: 'domain' | 'email'; pattern: string; applicationId: number; note?: string }) => request<{ rule: SenderRule }>('POST', '/admin/mail-rules', b),
  deleteRule: (id: number) => request('DELETE', `/admin/mail-rules/${id}`),
};

export type { ActivityItem };
