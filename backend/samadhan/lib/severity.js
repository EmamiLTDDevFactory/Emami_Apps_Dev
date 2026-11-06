'use strict';
const { pool } = require('../db/pool');
const { MIN } = require('../constants');

// ---------- Severity matrix ----------

// The matrix is read on every Category / Function change: keep it for a minute; Admin edits clear it at once.
let rulesCache = { at: 0, value: null };
const clearSeverityCache = () => { rulesCache = { at: 0, value: null }; };

async function loadRules() {
    if (rulesCache.value && Date.now() - rulesCache.at < MIN) return rulesCache.value;
    const { rows } = await pool.query('SELECT category, "function", severity FROM samadhan.severity_rules');
    const map = new Map(rows.map((r) => [`${r.category}\u0000${r.function}`, r.severity]));
    rulesCache = { at: Date.now(), value: map };
    return map;
}

/** A Category -> Function pair maps to Fatal, Serious or Normal; function "*" covers the whole category. */
async function severityFor(category, fn) {
    if (!category) return 'NORMAL';
    const rules = await loadRules();
    return rules.get(`${category}\u0000${fn ?? ''}`) ?? rules.get(`${category}\u0000*`) ?? 'NORMAL';
}

module.exports = { clearSeverityCache, severityFor };
