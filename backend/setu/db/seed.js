'use strict';
const { pool } = require('../../db');

// Base configuration agreed for Emami Secondary Support (statuses, fields, severity matrix, SLA policies,
// business hours, groups, automations, email wording). Inserts only what is missing, so changes made in
// Admin are never overwritten.

const SEED_STATUSES = [
    { id: 2, name: 'Open', pausesSla: false },
    { id: 3, name: 'Pending' },
    { id: 15, name: 'WIP-FUNC' },
    { id: 14, name: 'WIP-AUTH' },
    { id: 8, name: 'Escalation to L3 Support' },
    { id: 11, name: 'Pending Confirmation from function' },
    { id: 12, name: 'Confirmation / Information pending from User' },
    { id: 9, name: 'Resolved but confirmation pending from User' },
    { id: 13, name: 'New Requirement' },
    { id: 4, name: 'Resolved', isResolved: true },
    { id: 5, name: 'Closed', isResolved: true, isClosed: true },
];

const SEED_FIELDS = [
    { key: 'callSubject', label: 'Call Subject', type: 'text' },
    { key: 'region', label: 'Region', type: 'dropdown', required: true },
    { key: 'distributorCode', label: 'Distributor Code', type: 'text', required: true },
    { key: 'distributorName', label: 'Distributor Name', type: 'text', required: true },
    { key: 'salesOrg', label: 'Sales Org', type: 'dropdown', required: true },
    { key: 'state', label: 'State', type: 'dropdown', required: true },
    { key: 'depot', label: 'Depot', type: 'dropdown', required: true },
    { key: 'asmName', label: 'ASM Name', type: 'dropdown', required: true },
    { key: 'depotCoordinator', label: 'Depot Co-ordinator', type: 'dropdown', required: true },
    { key: 'mrUid', label: 'MR UID', type: 'text' },
    { key: 'mobileNo', label: 'Mobile No', type: 'text' },
    { key: 'alternateMobileNo', label: 'Alternate Mobile No', type: 'text' },
    { key: 'callerName', label: 'Caller Name', type: 'text' },
    { key: 'callerContactNumber', label: 'Caller Contact Number', type: 'text' },
    { key: 'type', label: 'Type', type: 'dropdown', required: true },
    { key: 'category', label: 'Category', type: 'nested', required: true },
    { key: 'l2Agent', label: 'L2 Agent', type: 'dropdown', required: true },
    { key: 'helpdeskAnalysis', label: 'HelpDesk Analysis', type: 'paragraph' },
    { key: 'rcaSolution', label: 'RCA/Solution provides', type: 'paragraph', required: true },
];

// Short lists known from the admin review; Admin > Fields maintains the full lists.
const SEED_CHOICES = {
    region: ['EAST', 'WEST', 'NORTH', 'SOUTH', 'Wrong Ticket', 'ALL REGIONS'],
    salesOrg: ['EM01 - CCD', 'EM02 - HCD', 'Wrong Ticket', 'ALL'],
    type: ['Rural mSFA', 'Wrong ticket', 'CDMS', 'mSFA', 'SalesCode DMS', 'SalesCode SFA', 'Salescode B2B App', 'SalesCode Supervisor App', 'SalesCode Portal', 'SalesCode Manager App'],
};

// Fatal combinations (complete). Serious combinations are maintained in Admin > Severity matrix.
const SEED_FATAL = [
    ['mSecSales Application - Sync Issue', 'Multiple Device Sync issue(PAN INDIA)'],
    ['mSecSales Configuration Issues', 'mSecSales App Not Opening'],
    ['mSecSales Configuration Issues', 'SAP mobile Secure Configuration'],
    ['mSecSales Application - Day Start/Day End', 'Day Start Related Issues'],
    ['mSecSales Application - Day Start/Day End', "Day Start' icon not appearing after 'Day End'"],
    ['mSecSales Application - Master', 'Product Master Related issue'],
    ['mSecSales Application - Master', 'Promotion Master Related issue'],
    ['mSecSales Application - Login Screen', 'Login / Password Related issue'],
    ['Application', '*'],
];

const H = 60;
const SEED_SLA = [
    {
        name: 'SLA Metrics & Reminders', isDefault: false, position: 0, groups: ['Customer Support', 'L2 Support'],
        targets: [
            { priority: 4, firstResponseMins: 15, nextResponseMins: 30, resolutionMins: 4 * H, businessHours: false },
            { priority: 3, firstResponseMins: 1 * H, nextResponseMins: 2 * H, resolutionMins: 8 * H, businessHours: false },
            { priority: 2, firstResponseMins: 4 * H, nextResponseMins: 11 * H, resolutionMins: 33 * H, businessHours: true },
            { priority: 1, firstResponseMins: 6 * H + 6, nextResponseMins: 22 * H, resolutionMins: 55 * H, businessHours: true },
        ],
    },
    {
        name: 'Default SLA Policy', isDefault: true, position: 1, groups: [],
        targets: [
            { priority: 4, firstResponseMins: 2 * H, nextResponseMins: null, resolutionMins: 4 * H, businessHours: false },
            { priority: 3, firstResponseMins: 3 * H, nextResponseMins: null, resolutionMins: 6 * H, businessHours: true },
            { priority: 2, firstResponseMins: 4 * H, nextResponseMins: null, resolutionMins: 22 * H, businessHours: true },
            { priority: 1, firstResponseMins: 8 * H, nextResponseMins: null, resolutionMins: 55 * H, businessHours: true },
        ],
    },
];

const SIGN = '<br><br>Regards,<br>Samadhan – Emami Secondary Helpdesk';
const SEED_TEMPLATES = [
    {
        key: 'requester.ticket_received', audience: 'requester',
        subject: 'Ticket Received - {{ticket.subject}} || {{ticket.id}}',
        body: 'Dear {{ticket.requester.name}},<br><br>Thank you for writing in. Your request is logged as ticket {{ticket.id}}, and someone from the helpdesk team will reply to you, normally within one working day.<br><br>When you write about this issue again, please keep the ticket number in the subject line so your message reaches the same ticket.<br><br>Regards,<br>Emami Secondary Helpdesk',
    },
    {
        key: 'reply.signature', audience: 'requester', subject: '-',
        body: '#TICKET No - {{ticket.id}}<br><br>Thanks &amp; Regards,<br>{{ticket.agent.name}}<br>Emami Secondary Helpdesk<br>Mail ID - emami.helpdesk@emamigroup.com<br>Phone No - 06289423435',
    },
    { key: 'forward.signature', audience: 'agent', subject: '-', body: '#TICKET No - {{ticket.id}}<br><br>Thanks &amp; Regards,<br>Emami Secondary Helpdesk' },
    {
        key: 'requester.closing_reminder', audience: 'requester',
        subject: '{{ticket.id}} {{ticket.subject}}',
        body: 'Hi,<br><br>This is a gentle reminder that we have not received any update from your side, so the ticket is now closed. Please send a new email to open a new ticket.<br><br>Thanks &amp; Regards,<br>Emami Secondary Helpdesk',
    },
    { key: 'agent.assigned_group', audience: 'agent', subject: 'New in {{ticket.group.name}}: {{ticket.subject}} [#{{ticket.id}}]', body: 'A ticket has been routed to {{ticket.group.name}}.<br><br><b>{{ticket.subject}}</b><br>{{ticket.description}}<br><br>Open ticket: {{ticket.url}}' + SIGN },
    { key: 'agent.assigned_agent', audience: 'agent', subject: 'Assigned to you: {{ticket.subject}} [#{{ticket.id}}]', body: 'Hi {{ticket.agent.name}},<br><br>Ticket {{ticket.id}} is now assigned to you.<br><br><b>{{ticket.subject}}</b><br>{{ticket.description}}<br><br>Open ticket: {{ticket.url}}' + SIGN },
    { key: 'agent.requester_replied', audience: 'agent', subject: 'Requester replied: {{ticket.subject}} [#{{ticket.id}}]', body: 'Hi {{ticket.agent.name}},<br><br>{{ticket.requester.name}} has replied on ticket {{ticket.id}}:<br><br>{{comment.body}}<br><br>Open ticket: {{ticket.url}}' + SIGN },
    { key: 'agent.note_added', audience: 'agent', subject: 'Note added: {{ticket.subject}} [#{{ticket.id}}]', body: 'A colleague added a private note on ticket {{ticket.id}}:<br><br>{{comment.body}}<br><br>Open ticket: {{ticket.url}}' + SIGN },
    { key: 'agent.first_response_violated', audience: 'agent', subject: 'First response overdue: {{ticket.subject}} [#{{ticket.id}}]', body: 'Ticket {{ticket.id}} from {{ticket.requester.email}} was due a first response by {{ticket.first_response_due}} and has not had one.<br><br>Open ticket: {{ticket.url}}' + SIGN },
    { key: 'agent.resolution_violated', audience: 'agent', subject: 'Resolution overdue: {{ticket.subject}} [#{{ticket.id}}]', body: 'Ticket {{ticket.id}} from {{ticket.requester.email}} was due to be resolved by {{ticket.resolution_due}}.<br><br>Open ticket: {{ticket.url}}' + SIGN },
    { key: 'agent.first_response_reminder', audience: 'agent', subject: 'First response due soon: {{ticket.subject}} [#{{ticket.id}}]', body: 'Ticket {{ticket.id}} needs a first response by {{ticket.first_response_due}}.<br><br>Open ticket: {{ticket.url}}' + SIGN },
    { key: 'agent.resolution_reminder', audience: 'agent', subject: 'Resolution due soon: {{ticket.subject}} [#{{ticket.id}}]', body: 'Ticket {{ticket.id}} is due to be resolved by {{ticket.resolution_due}}.<br><br>Open ticket: {{ticket.url}}' + SIGN },
    { key: 'agent.escalation_l3', audience: 'agent', subject: 'Escalated to L3: {{ticket.subject}} [#{{ticket.id}}]', body: 'Ticket {{ticket.id}} has been moved to Escalation to L3 Support.<br><br><b>{{ticket.subject}}</b><br>Assigned to: {{ticket.agent.name}}<br><br>Open ticket: {{ticket.url}}' + SIGN },
];

async function seed() {
    for (const [i, s] of SEED_STATUSES.entries()) {
        await pool.query(
            `INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
            [s.id, s.name, s.pausesSla ?? true, s.isResolved ?? false, s.isClosed ?? false, i],
        );
    }
    for (const [i, f] of SEED_FIELDS.entries()) {
        const { rows } = await pool.query(
            `INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (key) DO NOTHING RETURNING id`,
            [f.key, f.label, f.type, f.required ?? false, i],
        );
        const starter = SEED_CHOICES[f.key];
        if (rows.length && starter) {
            for (const [p, value] of starter.entries()) {
                await pool.query('INSERT INTO setu.field_choices ("fieldId", value, position) VALUES ($1, $2, $3)', [rows[0].id, value, p]);
            }
        }
    }
    for (const [category, fn] of SEED_FATAL) {
        await pool.query(
            `INSERT INTO setu.severity_rules (category, "function", severity) VALUES ($1, $2, 'FATAL') ON CONFLICT DO NOTHING`,
            [category, fn],
        );
    }
    const days = [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '20:00' }));
    await pool.query(
        `INSERT INTO setu.business_hours (name, timezone, days) VALUES ('Default', 'Asia/Kolkata', $1) ON CONFLICT (name) DO NOTHING`,
        [JSON.stringify(days)],
    );
    // Customer Support: round robin; L2 Support: manual assignment
    for (const [name, assignment] of [['Customer Support', 'ROUND_ROBIN'], ['L2 Support', 'MANUAL']]) {
        await pool.query('INSERT INTO setu.groups (name, assignment) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, assignment]);
    }
    const groupIds = Object.fromEntries((await pool.query('SELECT id, name FROM setu.groups')).rows.map((g) => [g.name, g.id]));

    for (const p of SEED_SLA) {
        const ins = await pool.query(
            `INSERT INTO setu.sla_policies (name, "isDefault", position) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING RETURNING id`,
            [p.name, p.isDefault, p.position],
        );
        if (!ins.rows.length) continue;
        const policyId = ins.rows[0].id;
        for (const t of p.targets) {
            await pool.query(
                `INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours")
                 VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
                [policyId, t.priority, t.firstResponseMins, t.nextResponseMins, t.resolutionMins, t.businessHours],
            );
        }
        for (const g of p.groups) {
            if (groupIds[g]) await pool.query('INSERT INTO setu.sla_policy_groups ("policyId", "groupId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [policyId, groupIds[g]]);
        }
    }

    const rules = [
        { name: 'Route new tickets to Customer Support', trigger: 'ON_CREATE', position: 0, conditions: { all: [{ field: 'groupId', op: 'is_empty' }] }, actions: [{ type: 'setGroup', value: groupIds['Customer Support'] }] },
        { name: 'Notify when escalated to L3', trigger: 'ON_UPDATE', position: 0, conditions: { all: [{ field: 'changed', op: 'in', value: ['statusId'] }, { field: 'statusId', op: 'eq', value: 8 }] }, actions: [{ type: 'notifyAgents', template: 'agent.escalation_l3', to: 'setting', setting: 'escalation.notifyEmails' }] },
        { name: 'Close resolved tickets after 48 hours', trigger: 'TIME', position: 0, conditions: { all: [{ field: 'statusId', op: 'in', value: [4] }, { field: 'hoursSinceResolved', op: 'gt', value: 48 }] }, actions: [{ type: 'setStatus', value: 5 }] },
        { name: 'Move long-overdue tickets to the escalation group', trigger: 'TIME', position: 1, conditions: { all: [{ field: 'statusId', op: 'in', value: [2] }, { field: 'hoursPastResolutionDue', op: 'gt', value: 2 }, { field: 'escalatedAt', op: 'is_empty' }] }, actions: [{ type: 'setGroup', setting: 'escalation.groupId' }, { type: 'markEscalated' }] },
        { name: 'Close after 96 h without user confirmation', trigger: 'TIME', position: 2, conditions: { all: [{ field: 'statusId', op: 'in', value: [9] }, { field: 'hoursSinceStatusChange', op: 'gte', value: 96 }] }, actions: [{ type: 'sendReplyTemplate', template: 'requester.closing_reminder' }, { type: 'setStatus', value: 5 }] },
        { name: 'Close after 14 days without user information', trigger: 'TIME', position: 3, conditions: { all: [{ field: 'statusId', op: 'in', value: [12] }, { field: 'hoursSinceStatusChange', op: 'gte', value: 336 }] }, actions: [{ type: 'sendReplyTemplate', template: 'requester.closing_reminder' }, { type: 'setStatus', value: 5 }] },
    ];
    for (const r of rules) {
        await pool.query(
            `INSERT INTO setu.automation_rules (name, trigger, position, conditions, actions) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`,
            [r.name, r.trigger, r.position, JSON.stringify(r.conditions), JSON.stringify(r.actions)],
        );
    }
    for (const t of SEED_TEMPLATES) {
        await pool.query(
            'INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING',
            [t.key, t.audience, t.subject, t.body],
        );
    }
    // escalation.groupId = 0 means "not chosen yet": the overdue rule then logs and skips.
    // bell.*: the in-app bell shows requester replies only, to the ticket's agent, until an Admin changes it.
    // whatsapp.threadDays: a WhatsApp message joins the sender's open WhatsApp ticket updated within this many days.
    for (const [key, value] of [
        ['escalation.groupId', 0], ['escalation.notifyEmails', []], ['sla.reminderMinutes', 30],
        ['bell.events', ['requester_reply']], ['bell.scope', 'assignee'], ['portal.enabled', true], ['call.mode', 'tel'], ['whatsapp.threadDays', 7],
    ]) {
        await pool.query('INSERT INTO setu.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]);
    }
}

module.exports = { seed };
