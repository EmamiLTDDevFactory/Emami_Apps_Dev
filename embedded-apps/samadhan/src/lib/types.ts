// Shapes of the JSON the shared backend returns (backend/samadhan/, routes under /api/samadhan).
// Dates arrive as ISO strings.

export type Role = 'Agent' | 'Supervisor' | 'Admin';
export type Severity = 'FATAL' | 'SERIOUS' | 'NORMAL';
export type Availability = 'AVAILABLE' | 'UNAVAILABLE' | 'MEETING' | 'BREAK' | 'TRAINING' | 'LUNCH';
export type ConversationKind = 'INCOMING' | 'REPLY' | 'NOTE' | 'FORWARD';
export type ActivityKind = 'created' | 'status' | 'assigned' | 'agent_reply' | 'requester_reply' | 'note' | 'forward' | 'call';
export type BellEvent = 'requester_reply' | 'new_ticket' | 'assigned' | 'note' | 'mention' | 'status_changed' | 'escalated' | 'sla_warning' | 'sla_breach' | 'csat' | 'watching';
export type BellScope = 'assignee' | 'group' | 'all';
export type CallMode = 'tel' | 'teams';

export interface Me {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  availability: Availability;
}

export interface Status {
  id: number;
  name: string;
  pausesSla: boolean;
  isResolved: boolean;
  isClosed: boolean;
  position: number;
}

export interface Group {
  id: number;
  name: string;
  assignment: 'MANUAL' | 'ROUND_ROBIN';
}

export interface AgentRef {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  availability: Availability;
}

export interface CannedResponse {
  id: number;
  folder: string;
  title: string;
  shortCode: string | null;
  body: string;
  /** null = shared (Admin); otherwise the agent it belongs to - only that agent ever receives it. */
  ownerAgentId: number | null;
}

export interface FieldDef {
  id: number;
  key: string;
  label: string;
  type: 'text' | 'number' | 'dropdown' | 'nested' | 'paragraph';
  required: boolean;
  position: number;
  choices: string[];
}

export interface CategoryNode {
  value: string;
  children: string[];
}

export interface Meta {
  statuses: Status[];
  groups: Group[];
  agents: AgentRef[];
  cannedResponses: CannedResponse[];
  fields: FieldDef[];
  categoryTree: CategoryNode[];
  priorities: Record<string, string>;
  severities: Severity[];
  sources: string[];
  agentStatuses: Record<Availability, string>;
  callMode: CallMode;
  callOutcomes: string[];
  portalEnabled: boolean;
  scenarios: ScenarioRef[];
  options: UiOptions;
  bellEventList: BellEvent[];
  agentEmailTemplates: string[];
}

export interface ScenarioRef {
  id: number;
  name: string;
  description: string | null;
}

/** Ticket columns an agent can edit from the properties panel (backend EDITABLE_FIELDS). */
export const EDITABLE_FIELDS = [
  'callSubject', 'region', 'distributorCode', 'distributorName', 'salesOrg', 'state', 'depot',
  'asmName', 'depotCoordinator', 'mrUid', 'mobileNo', 'alternateMobileNo', 'callerName',
  'callerContactNumber', 'category', 'function', 'l2Agent', 'helpdeskAnalysis', 'rcaSolution', 'type',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export interface TicketRow {
  id: number;
  subject: string;
  statusId: number;
  priority: number;
  severity: Severity;
  source: string;
  type: string | null;
  groupId: number | null;
  agentId: number | null;
  tags: string[];
  category: string | null;
  function: string | null;
  region: string | null;
  distributorCode: string | null;
  distributorName: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  frViolated: boolean;
  resViolated: boolean;
  slaPausedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  lastActivityKind: ActivityKind | null;
  lastActivityBy: string | null;
  lastActivityDetail: string | null;
  requesterName: string;
  requesterEmail: string | null;
  agentName: string | null;
  groupName: string | null;
  statusName: string;
  pausesSla: boolean;
  isResolved: boolean;
  isClosed: boolean;
}

export interface Ticket extends TicketRow, Record<EditableField, string | null> {
  description: string;
  requesterId: number;
  requesterPhone: string | null;
  requesterMobile: string | null;
  nextResponseDueAt: string | null;
  statusChangedAt: string;
  slaPausedMins: number;
  escalatedAt: string | null;
  agentEmail: string | null;
  companyId: number | null;
  parentId: number | null;
  mergedIntoId: number | null;
  spam: boolean;
  deletedAt: string | null;
}

export interface Conversation {
  id: number;
  ticketId: number;
  kind: ConversationKind;
  bodyHtml: string;
  bodyText: string;
  fromEmail: string | null;
  fromPhone: string | null;
  channel: 'email' | 'whatsapp' | 'portal';
  toEmails: string[];
  ccEmails: string[];
  agentId: number | null;
  agentName: string | null;
  createdAt: string;
}

export interface ActivityItem {
  id: number;
  action: string;
  details: Record<string, unknown>;
  actorName: string | null;
  createdAt: string;
}

export interface TimeLog {
  id: number;
  minutes: number;
  note: string | null;
  agentName: string;
  createdAt: string;
}

export interface CallLog {
  id: number;
  phone: string;
  direction: 'OUTBOUND' | 'INBOUND';
  outcome: string;
  durationSecs: number;
  notes: string | null;
  agentName: string;
  ticketId: number;
  createdAt: string;
}

export interface RelatedTicket { id: number; subject: string; statusName: string; isResolved: boolean; createdAt: string }

export interface TicketDetail {
  ticket: Ticket;
  conversations: Conversation[];
  activities: ActivityItem[];
  timeLogs: TimeLog[];
  requesterTickets: RelatedTicket[];
  calls: CallLog[];
  watchers: { id: number; name: string }[];
  watching: boolean;
  links: RelatedTicket[];
  children: RelatedTicket[];
  parent: RelatedTicket | null;
  csat: { rating: 1 | 2 | 3; comment: string | null; createdAt: string } | null;
  todos: Todo[];
}

export interface Todo {
  id: number;
  agentId: number;
  ticketId: number | null;
  ticketSubject?: string | null;
  text: string;
  done: boolean;
  dueAt: string | null;
  createdAt: string;
}

export interface SavedView {
  id: number;
  name: string;
  shared: boolean;
  query: Record<string, string>;
  ownerAgentId: number;
  ownerName: string;
}

export interface PresenceAgent { agentId: number; name: string; mode: 'viewing' | 'replying' }

export interface SearchResults {
  tickets: TicketRow[];
  contacts: { id: number; name: string; email: string | null; mobile: string | null }[];
  articles: { id: number; title: string; category: string; status: ArticleStatus }[];
}

export interface ContactRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  companyId: number | null;
  companyName: string | null;
  createdAt: string;
  tickets: number;
  open: number;
  lastTicketAt: string | null;
}

export interface ContactDetail {
  contact: ContactRow & { anonymizedAt: string | null };
  tickets: TicketRow[];
  calls: (CallLog & { ticketSubject: string })[];
  stats: { total: number; open: number; csatAvg: string | null };
}

export interface Company {
  id: number;
  name: string;
  description: string | null;
  domains: string[];
  contacts: number;
  open: number;
  tickets: number;
}

export type ArticleStatus = 'published' | 'draft';
export interface ArticleRow {
  id: number;
  category: string;
  folder: string;
  title: string;
  excerpt: string;
  status: ArticleStatus;
  tags: string[];
  views: number;
  helpful: number;
  notHelpful: number;
  updatedAt: string;
  authorName: string | null;
}
export interface Article extends Omit<ArticleRow, 'excerpt'> {
  body: string;
  createdAt: string;
}

export interface NameValue { name: string; value: number }

export interface Breakdown {
  days: number;
  totals: { total: number; unresolved: number };
  region: NameValue[];
  status: (NameValue & { id: number | null })[];
  type: NameValue[];
  source: NameValue[];
  category: NameValue[];
  depot: NameValue[];
  state: NameValue[];
  critical: { id: number; subject: string; severity: Severity; statusName: string; createdAt: string }[];
}

export interface AgentPerformance {
  id: number;
  name: string;
  active: boolean;
  assigned: number;
  resolved: number;
  open: number;
  avgFirstResponseMins: number | null;
  avgResolutionMins: number | null;
  firstResponseSlaPct: number | null;
  resolutionSlaPct: number | null;
  csatPositivePct: number | null;
  csatResponses: number;
  minutesLogged: number;
}

export interface Analytics {
  days: number;
  totals: {
    created: number; resolved: number; unresolved: number;
    avgFirstResponseMins: number | null; avgResolutionMins: number | null;
    firstResponseSlaPct: number | null; resolutionSlaPct: number | null;
    reopenedPct: number | null; wrongTicketPct: number | null; perAgentPerDay: number | null;
  };
  trend: { day: string; created: number; resolved: number }[];
  heat: { dow: string; hours: number[] }[];
  agents: AgentPerformance[];
  byCategory: NameValue[]; byRegion: NameValue[]; byState: NameValue[]; byDepot: NameValue[];
  byType: NameValue[]; bySource: NameValue[]; byStatus: NameValue[]; bySeverity: NameValue[]; byPriority: NameValue[];
  csat: { responses: number; positive: number; neutral: number; negative: number; comments: { rating: 1 | 2 | 3; comment: string; createdAt: string; ticketId: number; agentName: string | null }[] };
  calls: { total: number; outbound: number; inbound: number; connected: number; avgMins: number | null; byOutcome: NameValue[] };
}

export interface ScenarioAction { type: 'setStatus' | 'setPriority' | 'setGroup' | 'setAgent' | 'setField' | 'addTag' | 'reply' | 'note'; value?: number | string; field?: string; text?: string }
export interface Scenario extends ScenarioRef { actions: ScenarioAction[]; position: number }

export interface BellItem {
  id: number;
  ticketId: number;
  event: BellEvent;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface ContactMatch {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
}

export interface AgentPrefs {
  bellMuted?: BellEvent[];
  /** Agent email / hub-inbox notifications this agent switched off (template keys such as agent.note_added). */
  emailMuted?: string[];
  listView?: string | null;
  pageSize?: number | null;
  /** Dashboard widgets to show, in order; null / missing = the Admin default. */
  dashboardWidgets?: DashboardWidget[] | null;
  defaultVariants?: { report: number | null };
}

/** Admin > General options every screen can read (meta.options). */
export interface UiOptions {
  'general.helpdeskName': string;
  'general.supportEmail': string;
  'general.supportPhone': string;
  'csat.question': string;
  'csat.labels': Record<'1' | '2' | '3', string>;
  'export.maxRows': number;
  'list.defaultView': string;
  'list.pageSize': number;
  'presence.enabled': boolean;
  'dashboard.widgets': DashboardWidget[];
  'severity.priority': Record<Severity, number>;
}

export const DASHBOARD_WIDGETS = ['kpis', 'insights', 'trends', 'sla', 'backlog', 'ageing', 'risk', 'byStatus', 'bySeverity', 'agentLoad', 'leaderboard',
  'regionStatus', 'categories', 'sources', 'byGroup', 'todos', 'csat', 'recent'] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

/** Daily report variant: the date range (relative or fixed), the columns in order and the filters per column. */
export interface ReportVariantConfig {
  range: 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';
  from?: string;
  to?: string;
  columns: string[];
  filters: Record<string, { values?: string[]; contains?: string }>;
}
export interface Variant<C = ReportVariantConfig> {
  id: number;
  kind: 'report';
  name: string;
  shared: boolean;
  config: C;
  ownerAgentId: number;
  ownerName: string;
  updatedAt: string;
}

export interface Overview {
  days: number;
  backlog: { day: string; open: number; created: number; resolved: number }[];
  ageing: { bucket: '0-4h' | '4-24h' | '1-3d' | '3-7d' | '7d+'; severity: Severity; n: number }[];
  sla: { firstResponsePct: number | null; resolutionPct: number | null; csatPct: number | null; csatResponses: number; open: number; overdue: number; onTrackPct: number | null };
  leaderboard: { id: number; name: string; availability: Availability; resolved: number; open: number; avgFirstResponseMins: number | null; csatPct: number | null }[];
  regionStatus: { region: string; statusId: number; status: string; n: number }[];
  categories: NameValue[];
  sources: NameValue[];
  risk: { id: number; subject: string; severity: Severity; priority: number; resolutionDueAt: string | null; firstResponseDueAt: string | null; firstRespondedAt: string | null; agentName: string | null; statusName: string }[];
  hourly: { hour: number; today: number; avg: number }[];
  hourNow: number;
}

export interface AccessUser {
  email: string;
  hubActive: boolean;
  name: string | null;
  role: Role | null;
  agentId: number | null;
  agentActive: boolean | null;
  lastSeenAt: string | null;
}

/** Ticket counts per view id (built-in views, and "saved:<id>" for saved views). */
export type Counts = Record<string, number | null>;

export interface Dashboard {
  counts: { open: number; unassigned: number; overdue: number; dueSoon: number; onHold: number; mine: number; dueToday: number };
  byStatus: { id: number; name: string; n: number }[];
  bySeverity: Record<Severity, number>;
  byAgent: { id: number; name: string; availability: Availability; open: number }[];
  byGroup: { group: string; groupId: number | null; statusId: number; n: number }[];
  recent: { id: number; ticketId: number; action: string; details: Record<string, unknown>; createdAt: string; actorName: string | null; subject: string }[];
  csat: Record<'1' | '2' | '3', number>;
  trends: {
    hours: { hour: number; today: number; yesterday: number }[];
    hourNow: number;
    receivedToday: number;
    receivedYesterday: number;
    resolvedToday: number;
    avgFirstResponseMins: number | null;
    resolutionWithinSlaPct: number | null;
  };
}

export interface Distributor {
  id: number;
  code: string;
  name: string;
  region: string | null;
  state: string | null;
  depot: string | null;
  asmName: string | null;
  depotCoordinator: string | null;
  category: string | null;
  active: boolean;
  updatedAt: string;
}

// ---------- Admin ----------

export interface AdminAgent extends AgentRef {
  groupIds: number[];
  hasAccess: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AdminGroup extends Group {
  description: string | null;
  agentIds: number[];
}

export interface SlaTarget {
  id: number;
  policyId: number;
  priority: number;
  firstResponseMins: number;
  nextResponseMins: number | null;
  resolutionMins: number;
  businessHours: boolean;
  escalate: boolean;
}

export interface SlaPolicy {
  id: number;
  name: string;
  isDefault: boolean;
  position: number;
  targets: SlaTarget[];
  groupIds: number[];
}

export interface DayWindow {
  day: number;
  start: string;
  end: string;
}

export interface SeverityRule {
  id: number;
  category: string;
  function: string;
  severity: Severity;
}

export interface AdminChoice {
  id: number;
  fieldId: number;
  parentId: number | null;
  value: string;
  position: number;
  active: boolean;
}

export interface AdminField extends Omit<FieldDef, 'choices'> {
  choices: AdminChoice[];
}

export interface EmailTemplate {
  key: string;
  audience: 'requester' | 'agent';
  enabled: boolean;
  subject: string;
  body: string;
}

export interface AutomationRule {
  id: number;
  name: string;
  trigger: 'ON_CREATE' | 'ON_UPDATE' | 'TIME';
  active: boolean;
  position: number;
  conditions: { all?: { field: string; op: string; value?: unknown }[]; any?: { field: string; op: string; value?: unknown }[] };
  actions: { type: string; [k: string]: unknown }[];
}

export interface AuditEvent {
  id: number;
  actorEmail: string | null;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ParkedMail {
  id: number;
  messageId: string;
  fromEmail: string;
  subject: string;
  reason: string;
  receivedAt: string;
}

// ---------- Insights and action points ----------

export type InsightPriority = 'now' | 'today' | 'later';

export interface ActionPoint {
  action: string;
  owner: string;
  priority: InsightPriority;
  why?: string;
}

export interface InsightCheck {
  level: 'bad' | 'warn' | 'info';
  text: string;
}

export interface TicketAnalysis {
  generatedAt: string;
  source: 'ai' | 'rules';
  model: string | null;
  aiNote: string | null;
  summary: string;
  sentiment: 'calm' | 'concerned' | 'frustrated' | 'angry' | null;
  suggestedCategory: string;
  suggestedFunction: string;
  categoryConfidence: 'low' | 'medium' | 'high';
  likelyRootCause: string;
  actionPoints: ActionPoint[];
  suggestedReply: string;
  missingInformation: string[];
}

export interface TicketInsights {
  ticketId: number;
  checks: InsightCheck[];
  analysis: TicketAnalysis | null;
  stale: boolean;
  aiEnabled: boolean;
}

export interface DashboardInsights {
  generatedAt: string;
  source: 'ai' | 'rules';
  model: string | null;
  aiNote: string | null;
  cached: boolean;
  headline: string;
  themes: { title: string; detail: string }[];
  risks: { title: string; detail: string; severity: 'high' | 'medium' | 'low' }[];
  actionPoints: ActionPoint[];
  checks: ActionPoint[];
}
