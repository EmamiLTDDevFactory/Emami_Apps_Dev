'use strict';
const { pool } = require('../db/pool');
const { MIN } = require('../constants');

// ---------- Severity matrix ----------

// The matrix is read on every Category / Function change: keep it for a minute; Admin edits clear it at once.
let rulesCache = { at: 0, value: null };
const clearSeverityCache = () => { rulesCache = { at: 0, value: null }; };

async function loadRules() {
    if (rulesCache.value && Date.now() - rulesCache.at < MIN) return rulesCache.value;
    // v7 Phase 3: a rule may belong to one workspace ("workspaceId"); rules without one apply everywhere.
    let rows;
    try {
        rows = (await pool.query('SELECT category, "function", severity, "workspaceId" FROM samadhan.severity_rules')).rows;
    } catch (e) {
        if (e.code !== '42703') throw e;
        rows = (await pool.query('SELECT category, "function", severity FROM samadhan.severity_rules')).rows;
    }
    const map = new Map(rows.map((r) => [`${r.workspaceId ?? ''}\u0000${r.category}\u0000${r.function}`, r.severity]));
    rulesCache = { at: Date.now(), value: map };
    return map;
}

/** The matching rule's severity, or null: the workspace's own rules first, then the shared ones; "*" = whole category. */
async function severityRuleFor(category, fn, workspaceId = null) {
    if (!category) return null;
    const rules = await loadRules();
    const look = (ws) => rules.get(`${ws}\u0000${category}\u0000${fn ?? ''}`) ?? rules.get(`${ws}\u0000${category}\u0000*`);
    return (workspaceId ? look(workspaceId) : undefined) ?? look('') ?? null;
}

/** A Category -> Function pair maps to Fatal, Serious or Normal; function "*" covers the whole category. */
async function severityFor(category, fn, workspaceId = null) {
    return (await severityRuleFor(category, fn, workspaceId)) ?? 'NORMAL';
}

module.exports = { clearSeverityCache, severityFor, severityRuleFor };
