'use strict';

/*
   Samadhan v7 permissions (master prompt §K / docs/v7/PLAN.md §7).

   The hub grant still decides WHO may open Samadhan and their base role (Agent / Supervisor / Admin). On top of it:
     - three system profiles AGENT / SUPERVISOR / ADMIN, defined HERE in code (read-only, never stored), which reproduce
       the pre-v7 behaviour exactly - the access test compares every route and screen against the old role checks;
     - custom profiles (Admin > Authorization cockpit), assigned to a person with optional valid-from / valid-to;
     - per-person grant / deny overrides with an expiry and a reason (deny wins);
     - a data scope per person: ticket visibility all / groups / own (default all = today's behaviour).
   admin.* keys exist only for the Admin base role: a custom profile or override can never give them to anyone else,
   and an Admin always has every key.
*/

const CATALOGUE = {
    Screens: ['screen.dashboard', 'screen.helpdesk', 'screen.tickets', 'screen.board', 'screen.newTicket', 'screen.contacts', 'screen.solutions',
        'screen.analytics', 'screen.reports', 'screen.changeCalendar', 'screen.approvals'],
    Tickets: ['ticket.view', 'ticket.create', 'ticket.edit', 'ticket.reply', 'ticket.note', 'ticket.forward', 'ticket.assign', 'ticket.bulk',
        'ticket.merge', 'ticket.link', 'ticket.child', 'ticket.spam', 'ticket.trash', 'ticket.purge', 'ticket.export', 'ticket.moveWorkspace',
        'ticket.changeApplication', 'ticket.overridePriority', 'ticket.declareMajor', 'ticket.viewConfidential', 'ticket.setConfidential',
        'ticket.pir.edit', 'ticket.classify'],
    Attachments: ['attachment.upload', 'attachment.download', 'attachment.delete'],
    'Change / SAP': ['transport.manage', 'externalRef.manage', 'approval.decide', 'approval.override', 'change.schedule', 'change.freezeOverride', 'problem.manage'],
    'Knowledge / content': ['article.edit', 'article.publish', 'canned.personal', 'canned.shared.manage', 'scenario.run', 'views.share', 'report.variants.share'],
    // Configuration management (CMDB, 7.12): add / change configuration items, relationships, verification, import.
    Configuration: ['cmdb.manage'],
    Insights: ['insights.dashboard', 'insights.ticket', 'insights.ai', 'insights.refresh'],
    Contacts: ['contact.edit', 'company.create', 'contact.anonymize'],
    Admin: ['admin.general', 'admin.people', 'admin.groups', 'admin.sla', 'admin.fields', 'admin.statuses', 'admin.templates', 'admin.canned',
        'admin.scenarios', 'admin.masters', 'admin.applications', 'admin.workspaces', 'admin.catalog', 'admin.approvalChains', 'admin.automations',
        'admin.channels', 'admin.integrations', 'admin.audit', 'admin.parkedMail', 'admin.jobs', 'admin.authorization',
        // ITSM support model (7.11)
        'admin.supportModel', 'admin.migration'],
};
const ALL_KEYS = Object.values(CATALOGUE).flat();
const KEY_SET = new Set(ALL_KEYS);
const isAdminKey = (k) => k.startsWith('admin.');

// PLAN §7. Agent: everything a pre-v7 Agent could do, plus the new features that are open to Agents by default.
const AGENT = [
    'screen.dashboard', 'screen.helpdesk', 'screen.tickets', 'screen.board', 'screen.newTicket', 'screen.contacts', 'screen.solutions',
    'screen.changeCalendar', 'screen.approvals',
    'ticket.view', 'ticket.create', 'ticket.edit', 'ticket.reply', 'ticket.note', 'ticket.forward', 'ticket.assign', 'ticket.bulk', 'ticket.merge',
    'ticket.link', 'ticket.child', 'ticket.spam', 'ticket.trash', 'ticket.changeApplication', 'ticket.classify',
    // Agents set priority by hand today (Urgent + Production flags a major incident): kept, now as a real key an Admin
    // can take away per person / profile (2026-11-08 security review).
    'ticket.overridePriority',
    'attachment.upload', 'attachment.download',
    'transport.manage', 'externalRef.manage', 'problem.manage', 'change.schedule',
    'canned.personal', 'scenario.run',
    'insights.dashboard', 'insights.ticket', 'insights.ai',
    'contact.edit',
];
const SUPERVISOR = [...AGENT,
    'screen.analytics', 'screen.reports',
    'ticket.export', 'ticket.moveWorkspace', 'ticket.overridePriority', 'ticket.declareMajor', 'ticket.viewConfidential', 'ticket.setConfidential', 'ticket.pir.edit',
    'attachment.delete',
    'article.edit', 'article.publish', 'views.share', 'report.variants.share',
    'insights.refresh', 'company.create',
    'cmdb.manage',
];
const SYSTEM_PROFILES = {
    AGENT: { code: 'AGENT', name: 'Agent (system)', baseRole: 'Agent', keys: AGENT },
    SUPERVISOR: { code: 'SUPERVISOR', name: 'Supervisor (system)', baseRole: 'Supervisor', keys: SUPERVISOR },
    ADMIN: { code: 'ADMIN', name: 'Admin (system)', baseRole: 'Admin', keys: ALL_KEYS },
};
const ROLE_PROFILE = { Agent: 'AGENT', Supervisor: 'SUPERVISOR', Admin: 'ADMIN' };
const VISIBILITY = ['all', 'groups', 'own'];
const DEFAULT_SCOPE = { visibility: 'all', workspaces: 'all', applications: 'all' };

/**
 * Effective permissions of one person, from their base role plus the cockpit rows (all already loaded):
 *   profiles:  [{ keys: string[], mode: 'add'|'restrict', validFrom?, validTo?, active }]   (custom profiles assigned to the person)
 *   overrides: [{ key, effect: 'grant'|'deny', expiresAt? }]
 * Pure function - the middleware, /me and the cockpit's "effective access" preview all use it.
 */
function effective(role, { profiles = [], overrides = [], now = new Date() } = {}) {
    const base = SYSTEM_PROFILES[ROLE_PROFILE[role] || 'AGENT'];
    if (base.code === 'ADMIN') return new Set(ALL_KEYS); // an Admin always has everything (locked column)
    const live = (from, to) => (!from || new Date(from) <= now) && (!to || new Date(to) > now);
    let keys = new Set(base.keys);
    const current = profiles.filter((p) => p.active !== false && live(p.validFrom, p.validTo));
    for (const p of current.filter((x) => x.mode !== 'restrict')) {
        for (const k of p.keys || []) if (KEY_SET.has(k) && !isAdminKey(k)) keys.add(k);
    }
    // 'restrict' profiles (e.g. Auditor) cap the result to the union of their keys.
    const caps = current.filter((x) => x.mode === 'restrict');
    if (caps.length) {
        const allowed = new Set(caps.flatMap((p) => p.keys || []));
        keys = new Set([...keys].filter((k) => allowed.has(k)));
    }
    for (const o of overrides) {
        if (!live(null, o.expiresAt) || !KEY_SET.has(o.key) || isAdminKey(o.key)) continue;
        if (o.effect === 'grant') keys.add(o.key);
    }
    for (const o of overrides) {
        if (live(null, o.expiresAt) && o.effect === 'deny' && KEY_SET.has(o.key)) keys.delete(o.key);
    }
    return keys;
}

module.exports = { ALL_KEYS, CATALOGUE, DEFAULT_SCOPE, KEY_SET, ROLE_PROFILE, SYSTEM_PROFILES, VISIBILITY, effective, isAdminKey };
