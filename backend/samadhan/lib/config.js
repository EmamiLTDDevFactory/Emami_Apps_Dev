'use strict';
const { pool } = require('../db/pool');
const { SEVERITY_PRIORITY, SOURCES } = require('../constants');

// ---------- Admin-configurable options (Admin > General) with their defaults ----------
// Every option falls back to the built-in default when it was never set, so nothing changes until an Admin chooses to.

const DEFAULTS = {
    'general.helpdeskName': 'Emami Secondary Helpdesk',
    'general.supportEmail': 'emami.helpdesk@emamigroup.com',
    'general.supportPhone': '06289423435',
    'csat.question': 'How would you rate your overall satisfaction for the resolution provided by the agent?',
    'csat.labels': { 3: 'Extremely satisfied', 2: 'Neither satisfied nor dissatisfied', 1: 'Extremely dissatisfied' },
    'portal.intro': 'Raise a support ticket with the Emami Secondary Helpdesk, or check the status of one you raised.',
    'export.maxRows': 5000,
    'list.defaultView': 'open',
    'list.pageSize': 50,
    // v7 attachments (master prompt §L); hard ceilings in lib/attachments.js.
    'attachments.limits': { agent: { perFileMb: 10, filesPerAction: 10, perTicketMb: 100 }, portal: { perFileMb: 5, filesPerAction: 5, perTicketMb: 25 }, email: { perFileMb: 20, perTicketMb: 100 }, outboundMb: 20 },
    'severity.priority': SEVERITY_PRIORITY,
    'sources.extra': [],
    'presence.enabled': true,
    'dashboard.widgets': ['kpis', 'insights', 'trends', 'sla', 'backlog', 'ageing', 'risk', 'byStatus', 'bySeverity', 'agentLoad', 'leaderboard', 'regionStatus', 'categories', 'sources', 'byGroup', 'todos', 'csat', 'recent'],
};

let cache = null;
let cachedAt = 0;
/** All settings (30 s cache; cleared when an Admin saves). */
async function settings() {
    if (cache && Date.now() - cachedAt < 30_000) return cache;
    const { rows } = await pool.query('SELECT key, value FROM samadhan.settings');
    cache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    cachedAt = Date.now();
    return cache;
}
const clearConfigCache = () => { cache = null; };

async function option(key) {
    const s = await settings();
    return s[key] ?? DEFAULTS[key];
}

/** Severity -> priority (Fatal = Urgent, Serious = High, Normal = Low unless an Admin changed it). */
async function severityPriority(severity) {
    const map = { ...SEVERITY_PRIORITY, ...((await option('severity.priority')) || {}) };
    const p = Number(map[severity]);
    return p >= 1 && p <= 4 ? p : SEVERITY_PRIORITY[severity] ?? 1;
}

/** Built-in sources plus the ones an Admin added (e.g. "Walk-in", "Teams chat"). */
async function sources() {
    const extra = await option('sources.extra');
    return [...new Set([...SOURCES, ...(Array.isArray(extra) ? extra : [])])];
}

/** The options the app needs on every screen (sent with /meta). */
async function uiOptions() {
    const keys = ['general.helpdeskName', 'general.supportEmail', 'general.supportPhone', 'csat.question', 'csat.labels', 'export.maxRows',
        'list.defaultView', 'list.pageSize', 'presence.enabled', 'dashboard.widgets', 'severity.priority'];
    const out = {};
    for (const k of keys) out[k] = await option(k);
    return out;
}

module.exports = { DEFAULTS, clearConfigCache, option, settings, severityPriority, sources, uiOptions };
