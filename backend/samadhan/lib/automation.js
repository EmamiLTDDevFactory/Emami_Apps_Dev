'use strict';
const { pool } = require('../db/pool');

// ---------- Automations ----------

function ruleValue(field, ctx) {
    const now = (ctx.now ?? new Date()).getTime();
    const t = ctx.ticket;
    const hours = (d) => (d ? (now - new Date(d).getTime()) / 3_600_000 : null);
    switch (field) {
        case 'changed': return ctx.changed ?? [];
        case 'hoursSinceStatusChange': return hours(t.statusChangedAt);
        case 'hoursSinceResolved': return hours(t.resolvedAt);
        case 'hoursPastResolutionDue': return t.resolutionDueAt && !t.resolvedAt ? hours(t.resolutionDueAt) : null;
        default: return t[field];
    }
}

function testCondition(c, ctx) {
    const v = ruleValue(c.field, ctx);
    const list = Array.isArray(c.value) ? c.value : [c.value];
    switch (c.op) {
        case 'eq': return v === c.value;
        case 'ne': return v !== c.value;
        case 'in': return Array.isArray(v) ? v.some((x) => list.includes(x)) : list.includes(v);
        case 'not_in': return !list.includes(v);
        case 'gt': return typeof v === 'number' && v > Number(c.value);
        case 'gte': return typeof v === 'number' && v >= Number(c.value);
        case 'lt': return typeof v === 'number' && v < Number(c.value);
        case 'is_empty': return v === null || v === undefined || v === '';
        case 'not_empty': return !(v === null || v === undefined || v === '');
        default: return false;
    }
}

function ruleMatches(set, ctx) {
    const all = set.all ?? [];
    const any = set.any ?? [];
    return all.every((c) => testCondition(c, ctx)) && (any.length === 0 || any.some((c) => testCondition(c, ctx)));
}

/** v7: a rule written for one desk (or application) only acts on that desk's tickets; NULL = every desk. */
const ruleApplies = (r, t) => (!r.workspaceId || r.workspaceId === t.workspaceId) && (!r.applicationId || r.applicationId === t.applicationId);

async function rulesFor(trigger) {
    const { rows } = await pool.query('SELECT * FROM samadhan.automation_rules WHERE trigger = $1 AND active ORDER BY position, id', [trigger]);
    return rows;
}

module.exports = { ruleApplies, ruleMatches, rulesFor };
