'use strict';
const { pool } = require('../db/pool');
const { MIN } = require('../constants');
const { addMinutes, loadCalendar, minutesBetween } = require('./businessHours');

// ---------- SLA ----------

// SLA policies change rarely but are read on every ticket change: keep them for a minute; Admin edits clear the
// cache at once (clearSlaCache).
let slaCache = { at: 0, value: null };
const clearSlaCache = () => { slaCache = { at: 0, value: null }; };

async function loadSlaConfig() {
    if (slaCache.value && Date.now() - slaCache.at < MIN) return slaCache.value;
    const [policies, targets, links] = await Promise.all([
        pool.query('SELECT id, "isDefault", position FROM samadhan.sla_policies ORDER BY position, id'),
        pool.query('SELECT * FROM samadhan.sla_targets'),
        pool.query('SELECT "policyId", "groupId" FROM samadhan.sla_policy_groups'),
    ]);
    slaCache = { at: Date.now(), value: { policies: policies.rows, targets: targets.rows, links: links.rows } };
    return slaCache.value;
}

/** The SLA target for a ticket: the first policy linked to its group, else the default policy. */
async function targetFor(groupId, priority) {
    const { policies, targets, links } = await loadSlaConfig();
    const targetOf = (policyId) => targets.find((t) => t.policyId === policyId && t.priority === priority) ?? null;
    if (groupId) {
        const linked = new Set(links.filter((l) => l.groupId === groupId).map((l) => l.policyId));
        for (const p of policies) {
            if (linked.has(p.id) && targetOf(p.id)) return targetOf(p.id);
        }
    }
    for (const p of policies) {
        if (p.isDefault && targetOf(p.id)) return targetOf(p.id);
    }
    return null;
}

/** Due dates measured from creation, extended by the pause time already credited. */
async function computeDueDates(t) {
    const target = await targetFor(t.groupId, t.priority);
    if (!target) return { firstResponseDueAt: null, resolutionDueAt: null };
    const cal = await loadCalendar();
    const bh = target.businessHours;
    const created = new Date(t.createdAt);
    const out = { resolutionDueAt: addMinutes(created, target.resolutionMins + t.slaPausedMins, bh, cal) };
    if (!t.firstRespondedAt) out.firstResponseDueAt = addMinutes(created, target.firstResponseMins + t.slaPausedMins, bh, cal);
    return out;
}

async function pausedMinutes(pausedAt, groupId, priority, now = new Date()) {
    const target = await targetFor(groupId, priority);
    const cal = await loadCalendar();
    return minutesBetween(new Date(pausedAt), now, target?.businessHours ?? true, cal);
}

async function nextResponseDue(groupId, priority, from = new Date()) {
    const target = await targetFor(groupId, priority);
    if (!target?.nextResponseMins) return null;
    const cal = await loadCalendar();
    return addMinutes(from, target.nextResponseMins, target.businessHours, cal);
}

module.exports = { clearSlaCache, computeDueDates, nextResponseDue, pausedMinutes };
