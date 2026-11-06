'use strict';
const express = require('express');
const { pool } = require('../db/pool');
const { ALL_KEYS, CATALOGUE, SOD_RULES, SYSTEM_PROFILES, log, revokeExpired, saveUserAccess, sodWarnings, userAccess } = require('../lib/authz');
const { KEY_SET, VISIBILITY, effective, isAdminKey } = require('../lib/permissions');
const { invalidate } = require('../middleware/permission');
const { fail, wrap } = require('../lib/util');

/*
   Admin > Authorization cockpit API (master prompt §K 9.4), mounted at /admin/authz. Admin only, twice over: the
   permission gate needs admin.authorization (which exists only on the Admin base role) and routes/admin.js refuses
   every /admin path for non-Admins. Every change needs a reason and is written to the change log + audit log.
*/

const router = express.Router();
const reasonOf = (b) => { const r = String(b?.reason || '').trim().slice(0, 1000); if (!r) throw fail(400, 'Give a reason for this change.'); return r; };
const cleanKeys = (keys) => {
    const list = [...new Set((Array.isArray(keys) ? keys : []).map(String))];
    if (list.some((k) => !KEY_SET.has(k))) throw fail(400, 'Unknown permission in the list.');
    if (list.some(isAdminKey)) throw fail(400, 'admin.* permissions belong to the Admin role only and cannot be put in a profile.');
    return list.sort();
};
const systemList = () => Object.values(SYSTEM_PROFILES).map((p) => ({ id: null, code: p.code, name: p.name, mode: 'base', system: true, keys: [...p.keys].sort(), active: true }));

router.get('/catalogue', wrap(async (req, res) => {
    res.json({ success: true, catalogue: CATALOGUE, visibility: VISIBILITY, sodRules: SOD_RULES.map(({ id, text, keys }) => ({ id, text, keys })) });
}));

router.get('/overview', wrap(async (req, res) => {
    const [roles, custom, expiring, recent, agents] = await Promise.all([
        pool.query(`SELECT role, count(*)::int AS n FROM samadhan.agents WHERE active GROUP BY role`),
        pool.query(`SELECT count(*)::int AS n FROM samadhan.auth_profiles WHERE active`),
        pool.query(`SELECT (SELECT count(*) FROM samadhan.auth_user_profiles WHERE "validTo" BETWEEN now() AND now() + interval '7 days')
                         + (SELECT count(*) FROM samadhan.auth_permission_overrides WHERE "expiresAt" BETWEEN now() AND now() + interval '7 days') AS n`),
        pool.query(`SELECT id, "actorEmail", action, target, reason, "createdAt" FROM samadhan.auth_change_log ORDER BY "createdAt" DESC LIMIT 10`),
        pool.query(`SELECT id FROM samadhan.agents WHERE active`),
    ]);
    let confidential = 0;
    const sod = [];
    for (const { id } of agents.rows) {
        const a = await userAccess(id);
        if (a.effective.includes('ticket.viewConfidential')) confidential += 1;
        for (const w of a.sod) sod.push({ agentId: id, name: a.agent.name, email: a.agent.email, ...w });
    }
    res.json({
        success: true,
        usersByRole: Object.fromEntries(roles.rows.map((r) => [r.role, r.n])),
        customProfiles: custom.rows[0].n,
        expiringIn7Days: Number(expiring.rows[0].n),
        confidentialUsers: confidential,
        sodWarnings: sod,
        recentChanges: recent.rows,
    });
}));

// ---- Role profiles ----
router.get('/profiles', wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT p.id, p.code, p.name, p.description, p.mode, p.keys, p."scopePreset", p.active, p."updatedAt",
                                              (SELECT count(*)::int FROM samadhan.auth_user_profiles up WHERE up."profileId" = p.id) AS users
                                       FROM samadhan.auth_profiles p ORDER BY p.active DESC, p.name`);
    res.json({ success: true, system: systemList(), profiles: rows.map((r) => ({ ...r, keys: [...r.keys].sort(), system: false })) });
}));

/** Create a custom profile, optionally as a copy of a system profile (copyOf: 'AGENT') or a custom one (copyOf: <id>). */
router.post('/profiles', wrap(async (req, res) => {
    const b = req.body ?? {};
    const reason = reasonOf(b);
    const name = String(b.name || '').trim().slice(0, 120);
    if (!name) throw fail(400, 'Give the profile a name.');
    let keys = b.keys;
    let mode = b.mode === 'restrict' ? 'restrict' : 'add';
    if (b.copyOf !== undefined && b.copyOf !== null) {
        if (SYSTEM_PROFILES[b.copyOf]) {
            keys = SYSTEM_PROFILES[b.copyOf].keys.filter((k) => !isAdminKey(k));
        } else {
            const src = (await pool.query('SELECT keys, mode FROM samadhan.auth_profiles WHERE id = $1', [Number(b.copyOf)])).rows[0];
            if (!src) throw fail(404, 'The profile to copy does not exist.');
            ({ keys, mode } = src);
        }
    }
    keys = cleanKeys(keys);
    const code = (String(b.code || name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'PROFILE').slice(0, 60);
    if (SYSTEM_PROFILES[code]) throw fail(400, 'That code belongs to a system profile; choose another name.');
    const { rows } = await pool.query(
        `INSERT INTO samadhan.auth_profiles (code, name, description, mode, keys) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO NOTHING RETURNING id, code, name, description, mode, keys, active`,
        [code, name, String(b.description || '').slice(0, 1000) || null, mode, keys]);
    if (!rows[0]) throw fail(409, 'A profile with that code already exists.');
    await log(req.verifiedEmail, 'profile_created', code, null, rows[0], reason);
    res.status(201).json({ success: true, profile: rows[0] });
}));

/** Edit a custom profile (name, description, mode, keys, active). System profiles cannot be edited - copy them instead. */
router.put('/profiles/:id', wrap(async (req, res) => {
    const b = req.body ?? {};
    const reason = reasonOf(b);
    const id = Number(req.params.id);
    const before = (await pool.query('SELECT id, code, name, description, mode, keys, active FROM samadhan.auth_profiles WHERE id = $1', [id])).rows[0];
    if (!before) throw fail(404, 'No such profile.');
    const next = {
        name: b.name === undefined ? before.name : String(b.name).trim().slice(0, 120),
        description: b.description === undefined ? before.description : String(b.description).slice(0, 1000) || null,
        mode: b.mode === undefined ? before.mode : (b.mode === 'restrict' ? 'restrict' : 'add'),
        keys: b.keys === undefined ? before.keys : cleanKeys(b.keys),
        active: b.active === undefined ? before.active : b.active === true,
    };
    if (!next.name) throw fail(400, 'Give the profile a name.');
    // SoD: who would newly get a conflict through this profile?
    if (b.acceptSod !== true) {
        const holders = (await pool.query('SELECT DISTINCT "agentId" FROM samadhan.auth_user_profiles WHERE "profileId" = $1', [id])).rows;
        const hits = [];
        for (const { agentId } of holders) {
            const a = await userAccess(agentId);
            const others = a.profiles.filter((p) => p.profileId !== id);
            const keys = effective(a.agent.role, { profiles: [...others, { ...next, validFrom: null, validTo: null }], overrides: a.overrides });
            for (const w of sodWarnings(keys)) if (!a.sod.some((x) => x.id === w.id)) hits.push({ email: a.agent.email, ...w });
        }
        if (hits.length) return res.status(409).json({ success: false, error: 'Segregation-of-duties warning - confirm to continue.', sod: hits });
    }
    const { rows } = await pool.query(
        `UPDATE samadhan.auth_profiles SET name = $2, description = $3, mode = $4, keys = $5, active = $6, "updatedAt" = now() WHERE id = $1
         RETURNING id, code, name, description, mode, keys, active`,
        [id, next.name, next.description, next.mode, next.keys, next.active]);
    invalidate();
    await log(req.verifiedEmail, 'profile_changed', before.code, before, rows[0], reason + (b.acceptSod === true ? ' | SoD accepted' : ''));
    res.json({ success: true, profile: rows[0] });
}));

// ---- User access ----
router.get('/users', wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const { rows } = await pool.query(
        `SELECT a.id, a.name, a.email, a.role, a.active, a."lastSeenAt",
                COALESCE((SELECT array_agg(p.name ORDER BY p.name) FROM samadhan.auth_user_profiles up JOIN samadhan.auth_profiles p ON p.id = up."profileId" WHERE up."agentId" = a.id), '{}') AS profiles,
                (SELECT count(*)::int FROM samadhan.auth_permission_overrides o WHERE o."agentId" = a.id) AS overrides,
                COALESCE((SELECT visibility FROM samadhan.auth_user_scope s WHERE s."agentId" = a.id), 'all') AS visibility
         FROM samadhan.agents a WHERE ($1 = '' OR a.name ILIKE '%' || $1 || '%' OR a.email ILIKE '%' || $1 || '%')
         ORDER BY a.active DESC, a.name LIMIT 500`, [q]);
    res.json({ success: true, users: rows.map((r) => (r.role === 'Admin' ? { ...r, visibility: 'all' } : r)) });
}));

router.get('/users/:id', wrap(async (req, res) => {
    const a = await userAccess(Number(req.params.id));
    if (!a) throw fail(404, 'No such person.');
    res.json({ success: true, access: a });
}));

router.put('/users/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const out = await saveUserAccess(id, req.body ?? {}, req.verifiedEmail);
    if (out.error) return res.status(out.status || 400).json({ success: false, error: out.error, ...(out.sod ? { sod: out.sod } : {}) });
    res.json({ success: true, access: out.access });
}));

// ---- Access review ----
router.get('/review', wrap(async (req, res) => {
    const agents = (await pool.query('SELECT id FROM samadhan.agents WHERE active ORDER BY name')).rows;
    const rows = [];
    for (const { id } of agents) {
        const a = await userAccess(id);
        const soon = (d) => d && new Date(d) > new Date() && new Date(d) - Date.now() < 30 * 86_400_000;
        rows.push({
            id, name: a.agent.name, email: a.agent.email, role: a.agent.role, lastSeenAt: a.agent.lastSeenAt,
            profiles: a.profiles.map((p) => p.name), visibility: a.scope.visibility,
            expiring: [...a.profiles.filter((p) => soon(p.validTo)).map((p) => ({ what: `profile ${p.name}`, at: p.validTo })),
                ...a.overrides.filter((o) => soon(o.expiresAt)).map((o) => ({ what: `${o.effect} ${o.key}`, at: o.expiresAt }))],
            expired: a.profiles.filter((p) => p.validTo && new Date(p.validTo) <= new Date()).length + a.overrides.filter((o) => o.expiresAt && new Date(o.expiresAt) <= new Date()).length,
            unused: a.unused, sod: a.sod.map((w) => w.id),
        });
    }
    res.json({ success: true, users: rows });
}));

router.post('/review/revoke-expired', wrap(async (req, res) => {
    res.json({ success: true, people: await revokeExpired(req.verifiedEmail) });
}));

// ---- Change log ----
router.get('/log', wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
    const { rows } = await pool.query(
        `SELECT id, "actorEmail", action, target, before, after, reason, "createdAt" FROM samadhan.auth_change_log
         WHERE ($1 = '' OR "actorEmail" ILIKE '%' || $1 || '%' OR target ILIKE '%' || $1 || '%' OR action ILIKE '%' || $1 || '%' OR reason ILIKE '%' || $1 || '%')
           AND ($2::date IS NULL OR "createdAt" >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata'))
           AND ($3::date IS NULL OR "createdAt" < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
         ORDER BY "createdAt" DESC LIMIT 1000`,
        [q, isDate(req.query.from) ? req.query.from : null, isDate(req.query.to) ? req.query.to : null]);
    res.json({ success: true, entries: rows });
}));

module.exports = router;
module.exports.ALL_KEYS = ALL_KEYS;
