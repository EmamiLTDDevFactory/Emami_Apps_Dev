// Shapes of the JSON the shared backend returns (backend/setu/, routes under /api/setu).
// Dates arrive as ISO strings.

export type Role = 'Agent' | 'Supervisor' | 'Admin';
export type Severity = 'FATAL' | 'SERIOUS' | 'NORMAL';
export type Availability = 'AVAILABLE' | 'UNAVAILABLE' | 'MEETING' | 'BREAK' | 'TRAINING' | 'LUNCH';
export type ConversationKind = 'INCOMING' | 'REPLY' | 'NOTE' | 'FORWARD';
export type ActivityKind = 'created' | 'status' | 'assigned' | 'agent_reply' | 'requester_reply' | 'note' | 'forward' | 'call';
export type BellEvent = 'requester_reply' | 'new_ticket' | 'assigned' | 'note';
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
  createdAt: string;
}

export interface TicketDetail {
  ticket: Ticket;
  conversations: Conversation[];
  activities: ActivityItem[];
  timeLogs: TimeLog[];
  requesterTickets: { id: number; subject: string; statusName: string; createdAt: string }[];
  calls: CallLog[];
}

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
}

export interface Counts {
  mine: number;
  unassigned: number;
  open: number;
  pending: number;
  overdue: number;
  all: number;
}

export interface Dashboard {
  counts: { open: number; unassigned: number; overdue: number; dueSoon: number; onHold: number; mine: number };
  byStatus: { id: number; name: string; n: number }[];
  bySeverity: Record<Severity, number>;
  byAgent: { id: number; name: string; availability: Availability; open: number }[];
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
