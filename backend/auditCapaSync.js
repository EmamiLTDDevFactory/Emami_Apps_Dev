/**
 * Keeps Audit & CAPA's own Postgres-backed role table (audit_capa.users, a separate database this
 * backend has no direct connection to) in sync with what's granted here in Manage Access — see
 * server.js's POST/DELETE /access/users/:email/apps/:appId. Historically that table was only ever
 * updated by hand (embedded-apps/audit-capa/backend/sql/seed-users.js); this replaces that manual
 * step with a same-secret HTTP call to a small internal endpoint on Audit & CAPA's own backend
 * (embedded-apps/audit-capa/backend/routes/internal.js), authenticated with the same
 * HUB_AUTH_JWT_SECRET both backends already share (see that app's controllers/authController.js).
 *
 * Best-effort: a failure here is logged but never fails the Manage Access request itself — the
 * grant in emami_apps.authorized_user_apps has already succeeded by the time this runs. Audit &
 * CAPA's own Layout.js re-verifies against its table on every load, so a transient failure here
 * just means the next grant/revoke for this person will catch it up.
 *
 * AUDIT_CAPA_API_URL must be set in this backend's deployed .env, pointing at wherever Audit &
 * CAPA's own backend actually listens (see backend/.env.example) — left unset, this only logs a
 * warning and skips the sync rather than crashing.
 */
const AUDIT_CAPA_API_URL = process.env.AUDIT_CAPA_API_URL || '';
const HUB_AUTH_JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || '';

/** Turns "delhi.depot@emamigroup.com" into "Delhi Depot" — used only when the hub has no better
 * display name on file yet (a granted-but-never-logged-in user), so audit_capa.users' NOT NULL
 * name column never gets an empty string. */
function nameFromEmail(email) {
    const local = String(email).split('@')[0] || email;
    return local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' ');
}

/** Called right after a successful grant/role-change for appId === 'audit-capa'. `pool` is the
 * hub's own emami_apps.users lookup, used only for a best-effort display name. */
async function syncAuditCapaAccess(pool, email, role, depot) {
    if (!AUDIT_CAPA_API_URL) {
        console.warn('[audit-capa-sync] AUDIT_CAPA_API_URL is not set — skipping sync for', email);
        return;
    }
    let name = null;
    try {
        const { rows } = await pool.query('SELECT name FROM emami_apps.users WHERE email = $1', [email]);
        name = rows[0]?.name || null;
    } catch (err) {
        console.error('[audit-capa-sync] Could not look up display name for', email, ':', err.message);
    }
    const res = await fetch(`${AUDIT_CAPA_API_URL}/internal/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': HUB_AUTH_JWT_SECRET },
        body: JSON.stringify({ email, name: name || nameFromEmail(email), role, depot: depot || null }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Audit & CAPA sync failed: ${res.status}`);
    }
}

/** Called right after a successful revoke for appId === 'audit-capa' — deactivates (not deletes)
 * the row on that side too, mirroring is_active semantics already used elsewhere in this schema. */
async function revokeAuditCapaAccess(email) {
    if (!AUDIT_CAPA_API_URL) {
        console.warn('[audit-capa-sync] AUDIT_CAPA_API_URL is not set — skipping revoke for', email);
        return;
    }
    const res = await fetch(`${AUDIT_CAPA_API_URL}/internal/access/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { 'X-Internal-Secret': HUB_AUTH_JWT_SECRET },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Audit & CAPA revoke failed: ${res.status}`);
    }
}

module.exports = { syncAuditCapaAccess, revokeAuditCapaAccess };
