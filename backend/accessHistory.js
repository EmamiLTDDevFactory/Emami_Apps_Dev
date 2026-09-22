/**
 * Change-history audit trail for Manage Access — every add/remove/activate-deactivate/access-
 * level/app-role/mobile change against emami_apps.authorized_users(_apps), who made it, and what
 * changed. See db.js's runMigrations for the emami_apps.access_change_history table this writes
 * to, and server.js's GET /access/history for how it's read back (per-user or org-wide) for the
 * Administration tab.
 */
const { pool } = require('./db');

/** The change types every mutating Manage Access route below can log — kept as one list so the
 * Administration tab's history view has a fixed, known vocabulary to render labels/icons for
 * instead of an arbitrary free-text type. */
const CHANGE_TYPES = ['USER_ADDED', 'USER_REMOVED', 'ACTIVE_STATUS', 'ACCESS_LEVEL', 'APP_ROLE', 'MOBILE_SET'];

/**
 * Records one audit row. Never throws into the caller — a missed history entry shouldn't fail (or
 * even slow down noticeably) the actual access change it's describing. `changedBy` is whatever
 * acting-admin email the frontend sent; null when a route is called without one (defensive only —
 * every current caller does send it).
 */
async function recordAccessChange({ targetEmail, changedBy, changeType, appId = null, oldValue = null, newValue = null }) {
    if (!CHANGE_TYPES.includes(changeType)) {
        console.error('[accessHistory] Unknown change type, not recording:', changeType);
        return;
    }
    try {
        await pool.query(
            `INSERT INTO emami_apps.access_change_history
                (target_email, changed_by, change_type, app_id, old_value, new_value)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [targetEmail, changedBy || null, changeType, appId, oldValue, newValue]
        );
    } catch (err) {
        console.error('[accessHistory] Failed to record change for', targetEmail, ':', err.message);
    }
}

/** `targetEmail` filters to one user's history (the per-user view in the Administration tab's
 * user-detail dialog); omitted, returns the org-wide feed (the tab's own Change History section).
 * Capped at `limit` (default 200) newest-first — this is an audit feed to skim, not a paginated
 * table, and 200 is generously more than anyone reviews in one sitting. */
async function listAccessChanges({ targetEmail, limit = 200 } = {}) {
    const params = [];
    let where = '';
    if (targetEmail) {
        params.push(targetEmail);
        where = 'WHERE target_email = $1';
    }
    params.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
    const { rows } = await pool.query(
        `SELECT id, target_email, changed_by, change_type, app_id, old_value, new_value, occurred_at
         FROM emami_apps.access_change_history
         ${where}
         ORDER BY occurred_at DESC
         LIMIT $${params.length}`,
        params
    );
    return rows.map((r) => ({
        id: Number(r.id),
        targetEmail: r.target_email,
        changedBy: r.changed_by,
        changeType: r.change_type,
        appId: r.app_id,
        oldValue: r.old_value,
        newValue: r.new_value,
        occurredAt: r.occurred_at,
    }));
}

module.exports = { recordAccessChange, listAccessChanges, CHANGE_TYPES };
