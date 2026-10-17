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
// Ticket columns an agent can change from the properties panel.
const EDITABLE_FIELDS = [
    'callSubject', 'region', 'distributorCode', 'distributorName', 'salesOrg', 'state', 'depot',
    'asmName', 'depotCoordinator', 'mrUid', 'mobileNo', 'alternateMobileNo', 'callerName',
    'callerContactNumber', 'category', 'function', 'l2Agent', 'helpdeskAnalysis', 'rcaSolution', 'type',
];
const PATCHABLE = ['subject', 'statusId', 'priority', 'groupId', 'agentId', 'tags', ...EDITABLE_FIELDS];
const MAIL_ENABLED = String(process.env.SETU_MAIL_ENABLED || 'false').toLowerCase() === 'true';
const MAILBOX = String(process.env.SETU_MAILBOX || 'emami.helpdesk@emamigroup.com').trim().toLowerCase();
const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;
const sqlList = (arr) => arr.map((v) => `'${v}'`).join(', ');
const q = (col) => `"${col}"`;

module.exports = { AGENT_STATUSES, APP_ID, CONVERSATION_KINDS, EDITABLE_FIELDS, EMAIL_RE, MAILBOX, MAIL_ENABLED, MIN, PATCHABLE, PRIORITIES, ROLES, SEVERITIES, SEVERITY_PRIORITY, SOURCES, STATUS, TRIGGERS, q, sqlList };
