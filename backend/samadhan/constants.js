'use strict';

// Manage Access app id (the hub tile, grants and inbox rows all use it).
const APP_ID = 'samadhan';
const APP_IDS = [APP_ID];
/** Environment setting SAMADHAN_<name>. */
const env = (name, fallback = '') => process.env[`SAMADHAN_${name}`] || fallback;
const MIN = 60_000;

const ROLES = ['Agent', 'Supervisor', 'Admin'];
const SEVERITIES = ['FATAL', 'SERIOUS', 'NORMAL'];
const SEVERITY_PRIORITY = { FATAL: 4, SERIOUS: 3, NORMAL: 1 };
const PRIORITIES = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent' };
const SOURCES = ['Email', 'Phone', 'Portal', 'WhatsApp', 'Chat', 'Internal'];
const AGENT_STATUSES = {
    AVAILABLE: 'Available',
    UNAVAILABLE: 'Unavailable',
    MEETING: 'In a meeting',
    BREAK: 'On a break',
    TRAINING: 'In training',
    LUNCH: 'At lunch',
};
const STATUS = { OPEN: 2, RESOLVED: 4, CLOSED: 5, ESCALATION_L3: 8 };
const CONVERSATION_KINDS = ['INCOMING', 'REPLY', 'NOTE', 'FORWARD'];
const TRIGGERS = ['ON_CREATE', 'ON_UPDATE', 'TIME'];
// What the ticket list shows as "last activity" (tickets."lastActivityKind").
const ACTIVITY_KINDS = ['created', 'status', 'assigned', 'agent_reply', 'requester_reply', 'note', 'forward', 'call'];
// Events that can reach the in-app bell; Admin > Channels & bell picks which ones are on (default: requester replies only).
const BELL_EVENTS = ['requester_reply', 'new_ticket', 'assigned', 'note', 'mention', 'status_changed', 'escalated', 'sla_warning', 'sla_breach', 'csat', 'watching', 'external_ref', 'approval'];
// Agent notifications by email / hub inbox that each agent can switch off for themselves (agents.prefs.emailMuted).
const AGENT_EMAIL_TEMPLATES = ['agent.assigned_agent', 'agent.assigned_group', 'agent.requester_replied', 'agent.note_added', 'agent.first_response_reminder',
    'agent.resolution_reminder', 'agent.first_response_violated', 'agent.resolution_violated', 'agent.escalation_l3'];
const BELL_SCOPES = ['assignee', 'group', 'all'];
const CALL_OUTCOMES = ['Connected', 'No answer', 'Busy', 'Switched off', 'Wrong number', 'Call back later'];
const CALL_MODES = ['tel', 'teams'];
// Channels a requester can use by themselves (the rest are logged by agents).
const CUSTOMER_SOURCES = ['Email', 'Portal', 'WhatsApp'];
const PHONE_RE = /^\+?[0-9][0-9 -]{5,18}[0-9]$/;
// Ticket columns an agent can change from the properties panel.
const EDITABLE_FIELDS = [
    'callSubject', 'region', 'distributorCode', 'distributorName', 'salesOrg', 'state', 'depot',
    'asmName', 'depotCoordinator', 'mrUid', 'mobileNo', 'alternateMobileNo', 'callerName',
    'callerContactNumber', 'category', 'function', 'l2Agent', 'helpdeskAnalysis', 'rcaSolution', 'type',
    // v7 Phase 4
    'rootCauseCategory', 'resolutionCode',
];
// v7 Phase 3: applicationId (workspace follows), recordClass, impact, urgency.
const PATCHABLE = ['subject', 'statusId', 'priority', 'groupId', 'agentId', 'tags', ...EDITABLE_FIELDS, 'applicationId', 'recordClass', 'impact', 'urgency', 'confidential'];
const MAIL_ENABLED = String(env('MAIL_ENABLED', 'false') || 'false').toLowerCase() === 'true';
const WHATSAPP = {
    enabled: String(env('WHATSAPP_ENABLED', 'false') || 'false').toLowerCase() === 'true',
    verifyToken: env('WHATSAPP_VERIFY_TOKEN'),
    appSecret: env('WHATSAPP_APP_SECRET'),
    token: env('WHATSAPP_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    apiVersion: env('WHATSAPP_API_VERSION') || 'v21.0',
};
const MAILBOX = String(env('MAILBOX') || 'emami.helpdesk@emamigroup.com').trim().toLowerCase();
const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;
// Reserved domains (RFC 2606 / 6761, e.g. the demo data's @demo.samadhan.local) can never receive mail: sending to
// them only spends the shared Graph mailbox quota (2026-11-07: 22 throttled sends). They still get the in-app bell.
const UNDELIVERABLE_RE = /@(?:[^@\s]+\.)?(?:local|localhost|test|example|invalid|example\.(?:com|net|org))$/i;
const deliverable = (email) => EMAIL_RE.test(String(email ?? '').trim()) && !UNDELIVERABLE_RE.test(String(email).trim());
const sqlList = (arr) => arr.map((v) => `'${v}'`).join(', ');
const q = (col) => `"${col}"`;

module.exports = {
    AGENT_EMAIL_TEMPLATES, ACTIVITY_KINDS, AGENT_STATUSES, APP_ID, APP_IDS, env, BELL_EVENTS, BELL_SCOPES, CALL_MODES, CALL_OUTCOMES, CONVERSATION_KINDS, CUSTOMER_SOURCES, EDITABLE_FIELDS,
    EMAIL_RE, MAILBOX, MAIL_ENABLED, MIN, deliverable, PATCHABLE, PHONE_RE, PRIORITIES, ROLES, SEVERITIES, SEVERITY_PRIORITY, SOURCES, STATUS, TRIGGERS, WHATSAPP, q, sqlList,
};
