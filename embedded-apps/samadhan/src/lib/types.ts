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
  /** v7: the service desk it belongs to (null = every desk). */
  workspaceId?: number | null;
}

export interface FieldDef {
  id: number;
  key: string;
  label: string;
  type: 'text' | 'number' | 'dropdown' | 'nested' | 'paragraph';
  required: boolean;
  position: number;
  choices: string[];
  /** v7 Phase 3 (per workspace, from field_workspaces): */
  requiredBeforeResolve?: boolean;
  visible?: boolean;
  section?: string | null;
  helpText?: string | null;
  /** Type field only: record class of each type value. */
  recordClasses?: Record<string, RecordClass>;
}

// ---------- v7 Phase 3: workspaces and applications ----------
export type PriorityMode = 'SEVERITY_MATRIX' | 'IMPACT_URGENCY' | 'BOTH';
export type RecordClass = 'INCIDENT' | 'SERVICE_REQUEST' | 'ACCESS_REQUEST' | 'CHANGE' | 'PROBLEM' | 'QUERY' | 'ENHANCEMENT' | 'DEFECT' | 'TASK' | 'RISK';
export type ClassificationSource = 'manual' | 'subject_tag' | 'keyword' | 'sender_rule' | 'ai' | 'default' | 'backfill';
export interface Workspace {
  id: number;
  key: string;
  name: string;
  shortCode: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  enabled: boolean;
  portalEnabled: boolean;
  position: number;
  priorityMode: PriorityMode;
  categoryLabel: string;
  functionLabel: string;
  defaultGroupId: number | null;
  defaultSlaPolicyId: number | null;
  /** True when tickets can be in this workspace now (Secondary Sales always; others with the flag on). */
  available?: boolean;
}
export interface Application {
  id: number;
  code: string;
  name: string;
  workspaceId: number;
  workspaceKey: string;
  description: string | null;
  icon: string | null;
  aliases: string[];
  criticality: string | null;
  businessOwner: string | null;
  /** Arteria (today) / Salescode.AI (going forward) / ... - shown on the tiles. */
  vendor?: string | null;
  itOwnerAgentId: number | null;
  supportGroupId: number | null;
  defaultSlaPolicyId: number | null;
  portalVisible: boolean;
  active: boolean;
  position: number;
  available?: boolean;
  /** Admin listing only */
  used?: boolean;
  tickets?: number;
}
export interface MatrixCell { workspaceId: number; impact: number; urgency: number; priority: number }
export interface WorkspaceFields { fields: FieldDef[]; tree: CategoryNode[] }

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
  /** v7 Phase 3 (empty / null on an older backend or before migration 7.2). */
  workspaces?: Workspace[];
  applications?: Application[];
  priorityMatrix?: MatrixCell[];
  recordClasses?: RecordClass[];
  impacts?: Record<string, string>;
  urgencies?: Record<string, string>;
  statusWorkspaces?: { statusId: number; workspaceId: number }[];
  groupWorkspaces?: Record<string, number>;
  byWorkspace?: Record<string, WorkspaceFields> | null;
  /** v7 Phase 4 */
  sapLists?: SapLists;
  /** v7 Phase 5 */
  itLists?: ItLists;
  /** v7 Phase 7 */
  problemStatuses?: string[];
  /** v7 Phase 8 */
  programLists?: ProgramLists;
  /** v7 Phase 6 */
  changeLists?: ChangeLists;
  catalogItems?: CatalogItem[];
  refMasterKinds?: string[];
  /** ITSM support model (migration 7.11); null before it. */
  itsm?: ItsmMeta | null;
}

export interface ScenarioRef {
  id: number;
  name: string;
  description: string | null;
  /** v7: the service desk it belongs to (null = every desk). */
  workspaceId?: number | null;
}

/** Ticket columns an agent can edit from the properties panel (backend EDITABLE_FIELDS). */
export const EDITABLE_FIELDS = [
  'callSubject', 'region', 'distributorCode', 'distributorName', 'salesOrg', 'state', 'depot',
  'asmName', 'depotCoordinator', 'mrUid', 'mobileNo', 'alternateMobileNo', 'callerName',
  'callerContactNumber', 'category', 'function', 'l2Agent', 'helpdeskAnalysis', 'rcaSolution', 'type',
  // v7 Phase 4
  'rootCauseCategory', 'resolutionCode',
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
  /** v7: number of files on the ticket (absent on an older backend). */
  attachmentCount?: number;
  /** v7 Phase 3 */
  applicationId?: number;
  workspaceId?: number;
  recordClass?: RecordClass;
  classificationSource?: ClassificationSource | null;
  classificationConfidence?: number | null;
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
  /** ITSM support model (7.11): the support vendor, the old tool's number, the escalation level reached. */
  supportPartnerId?: number | null;
  legacyRef?: string | null;
  escalationLevel?: number;
  escalationLevelAt?: string | null;
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
  /** v7 Phase 3 */
  ref?: string;
  applicationCode?: string | null;
  applicationName?: string | null;
  workspaceKey?: string | null;
  impact?: number | null;
  urgency?: number | null;
  /** v7 Phase 4 */
  confidential?: boolean;
  /** v7 Phase 7 */
  isMajorIncident?: boolean;
  majorDeclaredAt?: string | null;
  majorBridgeUrl?: string | null;
  majorNextUpdateAt?: string | null;
  problemId?: number | null;
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

/** v7: a file on a ticket (backend lib/attachments.js). */
export interface Attachment {
  id: number;
  ticketId: number;
  conversationId: number | null;
  fileName: string;
  contentType: string;
  size: number;
  channel: 'agent' | 'portal' | 'email';
  uploadedByAgentId: number | null;
  uploadedByName?: string | null;
  scanStatus?: string;
  preview: boolean;
  createdAt: string;
}
export interface AttachmentLimits {
  agent: { perFileMb: number; filesPerAction: number; perTicketMb: number };
  portal: { perFileMb: number; filesPerAction: number; perTicketMb: number };
  email: { perFileMb: number; perTicketMb: number };
  outboundMb: number;
}
export interface AttachmentsInfo { enabled: boolean; adapter: string | null; reason: string | null; limits: AttachmentLimits }

export interface TicketDetail {
  ticket: Ticket;
  /** v7: files on the ticket (empty when attachments are off). */
  attachments?: Attachment[];
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
  /** v7 Phase 4 (null / [] before migration 7.4) */
  sap?: SapDetails | null;
  externalRefs?: ExternalRef[];
  /** v7 Phase 5 (null before migration 7.5) */
  it?: ItDetails | null;
  /** v7 Phase 6 (empty / null before migration 7.6) */
  transports?: Transport[];
  change?: ChangeDetails | null;
  approvals?: Approval[];
  /** v7 Phase 8 */
  program?: ProgramDetails | null;
  /** v7 Phase 7 */
  pir?: Pir | null;
  problem?: ProblemRef | null;
  incidents?: LinkedIncident[];
  knownError?: KnownError | null;
}

// ---------- v7 Phase 9: integrations, desk analytics ----------
export interface IntegrationRow { key: 'calm' | 'monitoring' | 'teams' | 'solman'; enabled: boolean; config: { applicationCode?: string; requesterEmail?: string; urlHint?: string; events?: string[] }; hasSecret: boolean; secretHint?: string | null; rotatedAt?: string | null }
export interface MonitoringSource { id: number; name: string; tokenHint: string | null; applicationId: number | null; applicationCode: string | null; defaultPriority: number; enabled: boolean; requesterEmail: string | null; createdAt: string }
export interface IntegrationCall { id: number; integration: string; source: string | null; ok: boolean; status: number | null; summary: string | null; externalId: string | null; ticketId: number | null; createdAt: string }
export interface IntegrationsOverview { integrations: IntegrationRow[]; sources: MonitoringSource[]; calls: IntegrationCall[]; endpoints: { calm: string; monitoring: string }; solmanTargets: string[] }
export interface SolmanResult { total: number; ok: number; skipped: number; errors: { line: number; error: string }[]; created: number; dryRun: boolean }
export interface DeskAnalytics {
  days: number;
  sap: { modules: { k: string; total: number; open: number; breached: number }[]; tcodes: { k: string; n: number }[]; errors: { k: string; n: number }[]; externalAgeing: { k: string; n: number }[] };
  change: { total: number; emergencyPct: number | null; successPct: number | null; resolved: number };
  infra: { p1Open: number; mttrByDomain: { k: string; n: number; hours: number }[] };
}

// ---------- v7 Phase 8: S/4HANA Programme ----------
export interface ProgramDetails {
  activatePhase?: string | null; releaseWave?: string | null; testCycle?: string | null; testCaseId?: string | null; testScenario?: string | null; processArea?: string | null;
  defectSeverity?: string | null; migrationObject?: string | null; mockCycle?: string | null; cutoverStepId?: string | null; plannedStart?: string | null; plannedEnd?: string | null;
  simplificationItem?: string | null; atcFinding?: string | null; ricefwId?: string | null; fitGapId?: string | null; retestStatus?: string | null; retestBy?: string | null;
  retestAt?: string | null; updatedAt?: string;
}
export interface ProgramLists { activatePhase: string[]; testCycle: string[]; defectSeverity: string[]; retestStatus: string[]; mockCycle: string[] }
export interface ProgramOverview {
  burndown: { day: string; open: number; openS1S2: number; found: number; fixed: number }[];
  kpis: { total: number; open: number; overdue: number; leakagePct: number | null; retestPassPct: number | null; bySeverity: { k: string; n: number }[]; byArea: { k: string; n: number; open: number }[]; byCycle: { k: string; n: number }[] };
  hypercare: { id: number; ref: string; subject: string; priority: number; createdAt: string; statusName: string; isResolved: boolean; processArea: string | null; agentName: string | null }[];
}

// ---------- v7 Phase 7: major incident, PIR, problems / KEDB ----------
export interface PirAction { text: string; owner?: string; due?: string }
export interface Pir {
  ticketId: number; summary: string | null; impactDescription: string | null; timeline: PirAction[]; rootCause: string | null; rootCauseCategory: string | null;
  contributingFactors: string | null; correctiveActions: PirAction[]; preventiveActions: PirAction[]; reviewedBy: string | null; reviewedAt: string | null; updatedAt: string;
}
export interface ProblemRef { id: number; ref: string; subject: string; statusName: string; isResolved: boolean; knownError: boolean | null; workaround: string | null; problemStatus: string | null }
export interface LinkedIncident { id: number; ref: string; subject: string; statusName: string; isResolved: boolean; createdAt: string; isMajorIncident: boolean }
export interface KnownError { ticketId: number; status: string; knownError: boolean; symptom: string | null; workaround: string | null; rootCause: string | null; permanentFix: string | null; updatedAt: string }
export interface ProblemCandidate { id: number; applicationCode: string | null; applicationName: string | null; category: string; function: string | null; ticketIds: number[]; count: number; updatedAt: string }
export interface DuplicateHint { id: number; ref: string; subject: string; createdAt: string; statusName: string; agentName: string | null }
export interface ServiceHealth {
  major: number; problems: number; knownErrors: number; approvals: number; external: number; changesWeek: number; candidates: number;
  majorList: { id: number; ref: string; subject: string; majorDeclaredAt: string; majorNextUpdateAt: string | null; majorBridgeUrl: string | null }[];
}

// ---------- v7 Phase 6: change and access ----------
export interface Transport {
  id: number; ticketId: number; trNumber: string; description: string | null; trType: string | null; owner: string | null; sourceSystem: string | null; status: string;
  targetSystems: string[]; importedQasAt: string | null; testedOkBy: string | null; approvedForPrdBy: string | null; importedPrdAt: string | null; returnCode: number | null;
  notes: string | null; createdAt: string; updatedAt: string;
}
export interface ChangeDetails {
  ticketId?: number; changeType: string | null; changeRisk: string | null; plannedStart: string | null; plannedEnd: string | null; transportsNa: boolean;
  testEvidence: string | null; implementationPlan: string | null; backoutPlan: string | null; accessValidTo: string | null; freezeOverrideReason: string | null; updatedAt?: string;
}
export type ApprovalState = 'Waiting' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export interface Approval {
  id: number; ticketId: number; chainId: number | null; chainName: string | null; stepNo: number; stepName: string; approverType: string; approverAgentId: number | null;
  approverAgentName: string | null; approverEmail: string | null; state: ApprovalState; decision: string | null; comment: string | null; decidedAt: string | null;
  decidedBy: string | null; dueAt: string | null; createdAt: string; round: number;
}
export interface ApprovalStep { name: string; type: 'manager' | 'email' | 'agent' | 'approver'; email?: string }
export interface ApprovalChain { id: number; name: string; workspaceId: number | null; steps: ApprovalStep[]; appliesTo: Record<string, string[]>; active: boolean; used?: number }
export interface CatalogField { label: string; type: 'text' | 'textarea' | 'date' | 'select' | 'checkbox'; required?: boolean; options?: string[] }
export interface CatalogItem {
  id: number; name: string; workspaceId: number; applicationId: number | null; description: string | null; icon: string | null; recordClass: string;
  category: string | null; function: string | null; formSchema: CatalogField[]; approvalChainId: number | null; approvalChainName?: string | null;
  fulfilGroupId: number | null; fulfilGroupName?: string | null; portalVisible: boolean; active: boolean; position: number; needsManager?: boolean;
}
export interface ChangeLists { trTypes: string[]; trStatuses: string[]; changeTypes: string[]; changeRisks: string[]; decisions: string[]; windowKinds: string[] }
export interface ChangeWindow { id: number; workspaceId: number | null; workspaceName?: string | null; kind: 'FREEZE' | 'MAINTENANCE'; name: string; startsAt: string; endsAt: string; systems: string[]; note: string | null }
export interface CalendarChange {
  id: number; ref: string; subject: string; workspaceId: number | null; changeType: string | null; changeRisk: string | null; plannedStart: string; plannedEnd: string | null;
  statusName: string; isResolved: boolean; agentName: string | null;
}
export interface MyApproval {
  id: number; ticketId: number; ref: string; stepNo: number; stepName: string; chainName: string | null; subject: string; priority: number; dueAt: string | null;
  createdAt: string; requesterName: string | null; comment: string | null; decision: string | null;
}
export interface RegisterData { title: string; columns: [string, string][]; rows: Record<string, unknown>[] }
/** The one-click approval page (portal, no sign-in). */
export interface PublicApproval { id: number; stepName: string; chainName: string | null; ref: string; subject: string; requesterName: string | null; summary: string; createdAt: string; steps: { stepNo: number; stepName: string; state: string }[] }
/** Portal catalogue item (portal-visible, in a desk open to the portal). */
export interface PortalCatalogItem { id: number; name: string; description: string | null; icon: string | null; workspaceId: number; formSchema: CatalogField[]; needsManager: boolean }

// ---------- v7 Phase 5: IT details (Digital Apps, Infra & IT) ----------
export interface ItDetails {
  layer?: string | null; environment?: string | null; platform?: string | null; deviceModel?: string | null; os?: string | null; browser?: string | null;
  appVersion?: string | null; url?: string | null; apiEndpoint?: string | null; odataService?: string | null; httpStatus?: string | null; correlationId?: string | null;
  database?: string | null; hosting?: string | null; serverName?: string | null; ipOrHost?: string | null; assetTag?: string | null; siteLocation?: string | null;
  usersAffected?: number | null; updatedAt?: string;
}
export interface ItLists { layer: string[]; platform: string[]; browser: string[]; environment: string[]; database: string[]; hosting: string[]; os: string[] }
/** Portal application picker (only while service desks are on and open to the portal). */
export interface PortalApplication { id: number; code: string; name: string; vendor: string | null; workspaceId: number; workspaceKey: string; workspaceName: string }

// ---------- v7 Phase 4: SAP details, external references, reference masters ----------
export interface SapDetails {
  landscape?: string | null; sapSystem?: string | null; sapClient?: string | null; environment?: string | null; tcode?: string | null;
  fioriAppId?: string | null; programName?: string | null; errorMessageClass?: string | null; errorMessageNo?: string | null; errorText?: string | null;
  shortDumpId?: string | null; idocNumber?: string | null; idocMessageType?: string | null; batchJob?: string | null; companyCode?: string | null;
  plant?: string | null; salesOrg?: string | null; purchOrg?: string | null; documentNumbers?: string[]; usersAffected?: number | null;
  businessProcess?: string | null; workaroundAvailable?: boolean | null; workaroundText?: string | null; reproducible?: boolean | null;
  stepsToReproduce?: string | null; expectedResult?: string | null; actualResult?: string | null; sapNotes?: string[]; sapComponent?: string | null;
  riseOwner?: string | null; updatedAt?: string;
}
export interface ExternalRef {
  id: number; ticketId: number; system: string; ref: string; status: string | null; priority: string | null; url: string | null; owner: string | null;
  justification: string | null; notes: string | null; openedAt: string; lastUpdateAt: string; ageDays: number; createdByName: string | null;
}
export interface RefMaster { id?: number; kind?: string; code: string; description: string | null; parentCode: string | null; active?: boolean }
export interface SapLists {
  landscape: string[]; environment: string[]; riseOwner: string[]; externalSystem: string[]; sapCasePriority: string[]; externalStatus: string[];
  rootCause: string[]; resolutionCode: string[];
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
  /** v7 Phase 3 */
  application?: NameValue[];
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
  /** v7 Phase 3 */
  byApplication?: ApplicationKpi[];
  byWorkspace?: { key: string; name: string; value: number }[];
}
export interface ApplicationKpi {
  id: number | null; code: string; name: string; workspace: string; value: number; resolved: number; open: number;
  resolutionSlaPct: number | null; avgResolutionMins: number | null; reopenedPct: number | null; csatPositivePct: number | null;
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
  /** v7 Phase 3: the workspace switcher ('' / missing = All). */
  workspace?: string | null;
  /** v7 Phase 3: recently used application ids (New ticket shows them first). */
  recentApps?: number[];
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
  /** v7 Phase 3: multi-desk mode (missing on an older backend). */
  'workspaces.enabled'?: boolean;
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

// ---------- ITSM support model (migration 7.11) ----------
export type PartnerKind = 'CLIENT' | 'ITSM_VENDOR' | 'HYPERSCALER';
export interface PartnerRef { id: number; name: string; shortName: string | null }
export interface ItsmMeta {
  vendors: PartnerRef[];
  hyperscalers: PartnerRef[];
  clients: PartnerRef[];
  clientId: number | null;
  vendorId: number | null;
  hyperscalerId: number | null;
  vendorDesks: string[];
  autoEscalate: boolean;
  escalationLevels: number[];
  hostingExtra: string[];
}
export interface SupportPartner extends PartnerRef {
  kind: PartnerKind;
  active: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contractRef: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  slaTargetPct: number | null;
  notes: string | null;
  position: number;
}
export interface EscalationContact {
  id: number;
  level: number;
  party: 'VENDOR' | 'CLIENT';
  workspaceId: number | null;
  workspaceName?: string | null;
  name: string;
  designation: string | null;
  email: string;
  phone: string | null;
  afterHours: number;
  priorities: number[];
  active: boolean;
}
export interface SupportModelData {
  partners: SupportPartner[];
  model: { clientId: number | null; vendorId: number | null; hyperscalerId: number | null; vendorDesks: string[]; autoEscalate: boolean };
  contacts: EscalationContact[];
  desks: { id: number; key: string; name: string }[];
  kinds: Record<PartnerKind, string>;
  suggestions: { level: number; party: 'VENDOR' | 'CLIENT'; designation: string; afterHours: number }[];
  openByVendor: { id: number | null; n: number }[];
}
export interface TicketEscalation {
  id: number;
  level: number;
  manual: boolean;
  reason: string | null;
  notified: string[];
  createdAt: string;
  byName: string | null;
}
export interface VendorScore {
  id: number | null;
  name: string;
  contractEnd: string | null;
  total: number;
  open: number;
  resolved: number;
  openBreached: number;
  frPct: number | null;
  resPct: number | null;
  mttrHours: number | null;
  escalated: number;
  escalatedPct: number | null;
  major: number;
  csatCount: number;
  csatPct: number | null;
  fcr: number;
  fcrPct: number | null;
  slaTargetPct: number | null;
  targetMet: boolean | null;
}
export type MigrationKind = 'itsm' | 'sales';
export interface MigrationColumn { key: string; header: string; required?: boolean; hint: string; example: string; list?: string }
export interface MigrationTemplate {
  kind: MigrationKind;
  title: string;
  sheet: string;
  file: string;
  intro: string;
  columns: MigrationColumn[];
  values: Record<string, string[]>;
  currentVendor: string | null;
}
export interface MigrationResult {
  dryRun: boolean;
  total: number;
  ok: number;
  skipped: number;
  errors: { line: number; legacyRef: string | null; error: string }[];
  created: { line: number; legacyRef: string; id: number; ref: string }[];
}
