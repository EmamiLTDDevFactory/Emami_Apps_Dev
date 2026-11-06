'use strict';
const { pool } = require('../db/pool');
const { APP_ID } = require('../constants');
const { ALL_KEYS, CATALOGUE, DEFAULT_SCOPE, KEY_SET, ROLE_PROFILE, SYSTEM_PROFILES, VISIBILITY, effective, isAdminKey } = require('./permissions');
const { invalidate } = require('../middleware/permission');
const { audit } = require('./util');

/*
   Authorization cockpit logic (master prompt §K 9.4 / 9.5), shared by routes/authz.js and the scheduled jobs.
   Every change goes through log() - before / after JSON, actor, reason - into auth_change_log AND the existing audit log.
*/

// SoD rules (§K 9.5): one person holding both keys is a warning the Admin must accept with a reason.
const SOD_RULES = [
    { id: 'create-approve', keys: ['ticket.create', 'approval.decide'], text: 'Can raise a change and also approve it (ticket.create + approval.decide).' },
    { id: 'transport-approve', keys: ['transport.manage', 'approval.decide'], text: 'Can manage transports and also approve their move to production (transport.manage + approval.decide).' },
];
const sodWarnings = (keys) => SOD_RULES.filter((r) => r.keys.every((k) => keys.has(k))).map(({ id, text }) => ({ id, text }));

const LIVE_SQL = (alias, from, to) => `(${alias}."${from}" IS NULL OR ${alias}."${from}" <= now()) AND (${alias}."${to}" IS NULL OR ${alias}."${to}" > now())`;

async function log(actorEmail, action, target, before, after, reason) {
    await pool.query('INSERT INTO samadhan.auth_change_log ("actorEmail", action, target, before, after, reason) VALUES ($1, $2, $3, $4, $5, $6)',
        [actorEmail, action, target, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), reason || null]);
    await audit(actorEmail, `authz_${action}`, { target, reason: reason || null });
}

/** Everything the cockpit knows about one person: rows plus the effective result the middleware would compute. */
async function userAccess(agentId) {
    const agent = (await pool.query('SELECT id, name, email, role, active, "lastSeenAt" FROM samadhan.agents WHERE id = $1', [agentId])).rows[0];
    if (!agent) return null;
    const [profiles, overrides, scope, used] = await Promise.all([
        pool.query(`SELECT up."profileId", p.code, p.name, p.mode, p.keys, p.active, up."validFrom", up."validTo", up.reason, up."createdBy", up."createdAt"
                    FROM samadhan.auth_user_profiles up JOIN samadhan.auth_profiles p ON p.id = up."profileId" WHERE up."agentId" = $1 ORDER BY p.name`, [agentId]),
        pool.query('SELECT key, effect, "expiresAt", reason, "createdBy", "createdAt" FROM samadhan.auth_permission_overrides WHERE "agentId" = $1 ORDER BY key', [agentId]),
        pool.query('SELECT visibility, workspaces, applications FROM samadhan.auth_user_scope WHERE "agentId" = $1', [agentId]),
        pool.query(`SELECT key FROM samadhan.auth_permission_usage WHERE "agentId" = $1 AND "lastUsedAt" > now() - interval '90 days'`, [agentId]),
    ]);
    const keys = effective(agent.role, { profiles: profiles.rows, overrides: overrides.rows });
    const base = new Set(SYSTEM_PROFILES[ROLE_PROFILE[agent.role] || 'AGENT'].keys);
    const usedKeys = new Set(used.rows.map((r) => r.key));
    return {
        agent,
        baseProfile: ROLE_PROFILE[agent.role] || 'AGENT',
        profiles: profiles.rows,
        overrides: overrides.rows,
        scope: agent.role === 'Admin' ? { ...DEFAULT_SCOPE } : (scope.rows[0] ? { visibility: scope.rows[0].visibility } : { ...DEFAULT_SCOPE }),
        effective: [...keys].sort(),
        screens: [...keys].filter((k) => k.startsWith('screen.')).sort(),
        added: [...keys].filter((k) => !base.has(k)).sort(),
        removed: [...base].filter((k) => !keys.has(k)).sort(),
        unused: [...keys].filter((k) => !usedKeys.has(k) && !isAdminKey(k)).sort(),
        sod: sodWarnings(keys),
    };
}

/**
 * Replaces one person's profiles / scope / overrides (each part only when sent). Guardrails:
 * no admin.* overrides, no unknown keys, a reason always, SoD warnings need acceptSod.
 */
async function saveUserAccess(agentId, body, actorEmail) {
    const reason = String(body.reason || '').trim().slice(0, 1000);
    if (!reason) return { error: 'Give a reason for this change.' };
    const before = await userAccess(agentId);
    if (!before) return { error: 'No such person.', status: 404 };
    const iso = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); };

    const profiles = body.profiles === undefined ? null : (Array.isArray(body.profiles) ? body.profiles : []).map((p) => ({ profileId: Number(p.profileId), validFrom: iso(p.validFrom), validTo: iso(p.validTo) }));
    const overrides = body.overrides === undefined ? null : (Array.isArray(body.overrides) ? body.overrides : []).map((o) => ({ key: String(o.key || ''), effect: o.effect, expiresAt: iso(o.expiresAt) }));
    const visibility = body.scope?.visibility;
    if (profiles?.some((p) => !Number.isInteger(p.profileId) || p.validFrom === undefined || p.validTo === undefined || (p.validFrom && p.validTo && p.validTo <= p.validFrom))) return { error: 'Check the profiles: unknown profile or invalid dates (valid to must be after valid from).' };
    if (overrides?.some((o) => !KEY_SET.has(o.key) || !['grant', 'deny'].includes(o.effect) || o.expiresAt === undefined)) return { error: 'Check the overrides: unknown permission, effect or date.' };
    if (overrides?.some((o) => isAdminKey(o.key) && o.effect === 'grant')) return { error: 'admin.* permissions come only with the Admin role in Manage Access; they cannot be granted here.' };
    if (new Set((overrides || []).map((o) => o.key)).size !== (overrides || []).length) return { error: 'Each permission can have only one override.' };
    if (visibility !== undefined && !VISIBILITY.includes(visibility)) return { error: 'Visibility must be all, groups or own.' };
    if (profiles?.length) {
        const known = (await pool.query('SELECT id FROM samadhan.auth_profiles WHERE id = ANY($1::int[])', [profiles.map((p) => p.profileId)])).rows.length;
        if (known !== new Set(profiles.map((p) => p.profileId)).size) return { error: 'One of the profiles does not exist.' };
    }

    // SoD check on the result before saving.
    const profileRows = profiles === null ? before.profiles
        : (await pool.query('SELECT id AS "profileId", keys, mode, active FROM samadhan.auth_profiles WHERE id = ANY($1::int[])', [profiles.map((p) => p.profileId)])).rows
            .map((r) => ({ ...r, ...profiles.find((p) => p.profileId === r.profileId) }));
    const after = effective(before.agent.role, { profiles: profileRows, overrides: overrides ?? before.overrides });
    const sod = sodWarnings(after).filter((w) => !before.sod.some((b) => b.id === w.id));
    if (sod.length && body.acceptSod !== true) return { error: 'Segregation-of-duties warning - confirm to continue.', sod, status: 409 };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (profiles !== null) {
            await client.query('DELETE FROM samadhan.auth_user_profiles WHERE "agentId" = $1', [agentId]);
            for (const p of profiles) {
                await client.query('INSERT INTO samadhan.auth_user_profiles ("agentId", "profileId", "validFrom", "validTo", reason, "createdBy") VALUES ($1, $2, $3, $4, $5, $6)',
                    [agentId, p.profileId, p.validFrom, p.validTo, reason, actorEmail]);
            }
        }
        if (overrides !== null) {
            await client.query('DELETE FROM samadhan.auth_permission_overrides WHERE "agentId" = $1', [agentId]);
            for (const o of overrides) {
                await client.query('INSERT INTO samadhan.auth_permission_overrides ("agentId", key, effect, "expiresAt", reason, "createdBy") VALUES ($1, $2, $3, $4, $5, $6)',
                    [agentId, o.key, o.effect, o.expiresAt, reason, actorEmail]);
            }
        }
        if (visibility !== undefined) {
            await client.query(`INSERT INTO samadhan.auth_user_scope ("agentId", visibility, "updatedBy", "updatedAt") VALUES ($1, $2, $3, now())
                                ON CONFLICT ("agentId") DO UPDATE SET visibility = EXCLUDED.visibility, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = now()`,
            [agentId, visibility, actorEmail]);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
    invalidate(agentId);
    const now = await userAccess(agentId);
    const snap = (a) => ({ profiles: a.profiles.map((p) => ({ code: p.code, validFrom: p.validFrom, validTo: p.validTo })), overrides: a.overrides.map((o) => ({ key: o.key, effect: o.effect, expiresAt: o.expiresAt })), scope: a.scope });
    await log(actorEmail, 'user_access', before.agent.email, snap(before), snap(now), [reason, ...(sod.length ? [`SoD accepted: ${sod.map((s) => s.id).join(', ')}`] : [])].join(' | '));
    return { access: now };
}

/** Removes expired temporary profiles and overrides (scheduler and the Access review button); notifies the people. */
async function revokeExpired(actorEmail = 'system (scheduler)') {
    const gone = await pool.query(`
        WITH p AS (DELETE FROM samadhan.auth_user_profiles up USING samadhan.auth_profiles pr
                   WHERE pr.id = up."profileId" AND up."validTo" IS NOT NULL AND up."validTo" <= now()
                   RETURNING up."agentId", 'profile ' || pr.name AS what),
             o AS (DELETE FROM samadhan.auth_permission_overrides WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= now()
                   RETURNING "agentId", effect || ' ' || key AS what)
        SELECT x."agentId", a.email, array_agg(x.what ORDER BY x.what) AS what FROM (SELECT * FROM p UNION ALL SELECT * FROM o) x
        JOIN samadhan.agents a ON a.id = x."agentId" GROUP BY x."agentId", a.email`);
    for (const r of gone.rows) {
        invalidate(r.agentId);
        await log(actorEmail, 'expired_revoked', r.email, { expired: r.what }, null, 'temporary access ended');
        await notifyHub(r.email, 'Temporary Samadhan access ended', `This temporary access has ended: ${r.what.join(', ')}.`);
    }
    return gone.rows.length;
}

/** Quarterly access recertification reminder to every active Admin (once per 90 days). */
async function recertificationReminder() {
    const last = (await pool.query(`SELECT value FROM samadhan.settings WHERE key = 'authz.lastRecertReminder'`)).rows[0]?.value;
    if (last && Date.now() - Number(last) < 90 * 86_400_000) return false;
    const admins = (await pool.query(`SELECT email FROM samadhan.agents WHERE active AND role = 'Admin'`)).rows;
    for (const a of admins) {
        await notifyHub(a.email, 'Samadhan quarterly access review', 'Please review who has which access in Samadhan: Admin > Authorization cockpit > Access review.');
    }
    await pool.query(`INSERT INTO samadhan.settings (key, value) VALUES ('authz.lastRecertReminder', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(Date.now())]);
    return true;
}

async function notifyHub(email, title, body) {
    try {
        const { notify } = require('../../notifications');
        await notify({ email, appId: APP_ID, kind: 'info', title, body, link: '/apps/samadhan/?screen=admin', sendMail: false });
    } catch (err) {
        console.error('[samadhan] authz notify:', err.message);
    }
}

module.exports = { ALL_KEYS, CATALOGUE, LIVE_SQL, SOD_RULES, SYSTEM_PROFILES, log, recertificationReminder, revokeExpired, saveUserAccess, sodWarnings, userAccess };
