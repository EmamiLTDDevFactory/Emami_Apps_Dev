'use strict';

const APP_ID = 'setu';
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
// Events that can reach the in-app bell; Admin > System picks which ones are on (default: requester replies only).
const BELL_EVENTS = ['requester_reply', 'new_ticket', 'assigned', 'note'];
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
];
const PATCHABLE = ['subject', 'statusId', 'priority', 'groupId', 'agentId', 'tags', ...EDITABLE_FIELDS];
const MAIL_ENABLED = String(process.env.SETU_MAIL_ENABLED || 'false').toLowerCase() === 'true';
const WHATSAPP = {
    enabled: String(process.env.SETU_WHATSAPP_ENABLED || 'false').toLowerCase() === 'true',
    verifyToken: process.env.SETU_WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.SETU_WHATSAPP_APP_SECRET || '',
    token: process.env.SETU_WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.SETU_WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: process.env.SETU_WHATSAPP_API_VERSION || 'v21.0',
};
const MAILBOX = String(process.env.SETU_MAILBOX || 'emami.helpdesk@emamigroup.com').trim().toLowerCase();
const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;
const sqlList = (arr) => arr.map((v) => `'${v}'`).join(', ');
const q = (col) => `"${col}"`;

module.exports = {
    ACTIVITY_KINDS, AGENT_STATUSES, APP_ID, BELL_EVENTS, BELL_SCOPES, CALL_MODES, CALL_OUTCOMES, CONVERSATION_KINDS, CUSTOMER_SOURCES, EDITABLE_FIELDS,
    EMAIL_RE, MAILBOX, MAIL_ENABLED, MIN, PATCHABLE, PHONE_RE, PRIORITIES, ROLES, SEVERITIES, SEVERITY_PRIORITY, SOURCES, STATUS, TRIGGERS, WHATSAPP, q, sqlList,
};
