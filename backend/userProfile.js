/**
 * Real per-user profile + activity data for the hub's Dashboard/Settings screens — backed by
 * emami_apps.users and emami_apps.user_profile_stats (see db.js for the migration that made these
 * usable from an email-identified login instead of the device-id identity they were originally
 * built around).
 *
 * upsertLoginProfile() is called from both login paths (hub-auth.js's direct email login,
 * saml-sso.js's SAML ACS callback) so "last login" and "logins"/"sessions" stay accurate
 * regardless of which path a user signs in through.
 */
const { pool } = require('./db');

/** Title-cases an email's local part as a last-resort display name when no real name is known
 * (direct email login has none; SAML login usually does via Azure's name claims). */
function nameFromEmail(email) {
    const local = String(email).split('@')[0] || '';
    return local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' ') || email;
}

/** Appends one row to the emami_apps.events log — the single source every stats view (see
 * db.js's comment on user_profile_stats/user_most_used_app/user_time_spent) computes from.
 * Never throws into the caller; a missed activity event shouldn't break the action it describes. */
async function recordEvent(userId, eventType, appId) {
    if (!userId) return;
    try {
        await pool.query(
            `INSERT INTO emami_apps.events (user_id, event_type, app_id) VALUES ($1, $2, $3)`,
            [userId, eventType, appId || null]
        );
    } catch (err) {
        console.error('[userProfile] Failed to record event', eventType, 'for user', userId, ':', err.message);
    }
}

/** Called on every successful login. Creates the user on first login, otherwise just refreshes
 * name/status, then logs LOGIN + SESSION_START — never blocks or fails the login itself. */
async function upsertLoginProfile(email, name) {
    const displayName = (name || '').trim() || nameFromEmail(email);
    try {
        const { rows: [user] } = await pool.query(
            `INSERT INTO emami_apps.users (email, name, status, last_login_at)
             VALUES ($1, $2, 'Active', now())
             ON CONFLICT (email) DO UPDATE SET
                 name = EXCLUDED.name,
                 last_login_at = now()
             RETURNING user_id, email, name, mobile, role, status, created_at, last_login_at`,
            [email, displayName]
        );

        await recordEvent(user.user_id, 'LOGIN');
        await recordEvent(user.user_id, 'SESSION_START');

        return user;
    } catch (err) {
        console.error('[userProfile] Failed to record login for', email, ':', err.message);
        return null;
    }
}

/** Formats a duration (Postgres `interval`, comes back from `pg` as {hours, minutes, ...} or
 * null) into the short display string the Settings screen expects (e.g. "3h 20m"). */
function formatTimeSpent(interval) {
    if (!interval) return '—';
    const hours = (interval.days || 0) * 24 + (interval.hours || 0);
    const minutes = interval.minutes || 0;
    if (!hours && !minutes) return '—';
    return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null].filter(Boolean).join(' ') || '—';
}

/** Everything HomeScreen/SettingsScreen need for the logged-in user, in the exact shape the
 * frontend's mock CURRENT_USER/ACTIVITY_STATS used — see src/data/mockData.ts. */
async function getProfile(email) {
    const { rows } = await pool.query(
        `SELECT user_id, name, email, mobile, role, status, last_login_at,
                sessions_total, logins, time_spent, apps_opened, downloads,
                favorites_added, notifications_read, most_used_app
         FROM emami_apps.user_profile_stats
         WHERE email = $1`,
        [email]
    );
    const row = rows[0];
    if (!row) return null;

    return {
        name: row.name || nameFromEmail(email),
        email: row.email,
        mobile: row.mobile || '',
        role: row.role || 'Employee',
        status: row.status || 'Active',
        lastLogin: row.last_login_at,
        sessionsTotal: Number(row.sessions_total || 0),
        logins: Number(row.logins || 0),
        timeSpent: formatTimeSpent(row.time_spent),
        appsOpened: Number(row.apps_opened || 0),
        downloads: Number(row.downloads || 0),
        favoritesAdded: Number(row.favorites_added || 0),
        notificationsRead: Number(row.notifications_read || 0),
        mostUsedApp: row.most_used_app || '—',
    };
}

/** Activity events the frontend is allowed to log via POST /api/events — anything the
 * user_profile_stats/user_most_used_app/user_time_spent views (see db.js) actually count.
 * LOGIN/SESSION_START are logged server-side by upsertLoginProfile, not through this route. */
const CLIENT_EVENT_TYPES = ['APP_OPEN', 'DOWNLOAD', 'FAVORITE_ADD', 'FAVORITE_REMOVE', 'NOTIFICATION_READ', 'SESSION_END'];

async function getUserIdByEmail(email) {
    const { rows } = await pool.query('SELECT user_id FROM emami_apps.users WHERE email = $1', [email]);
    return rows[0]?.user_id || null;
}

const express = require('express');
const router = express.Router();

/** Read-only profile fetch for the logged-in user. Takes the email as a query param rather than a
 * bearer token — consistent with this hub's existing endpoints (/access/users etc.), none of which
 * currently require an auth header; see authorizedUsers.js for why login itself doesn't gate on
 * much either right now. */
router.get('/me', async (req, res) => {
    const email = String(req.query?.email || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({ success: false, error: 'email is required.' });
    }
    try {
        const profile = await getProfile(email);
        if (!profile) {
            return res.status(404).json({ success: false, error: 'No profile found for this user yet.' });
        }
        res.json({ success: true, profile });
    } catch (err) {
        console.error('[userProfile] Failed to load profile for', email, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not load profile.' });
    }
});

/** Logs one activity event (app opened, favorite toggled, logout, etc.) for the ACTIVITY stats on
 * the Settings screen — fire-and-forget from the frontend's point of view, same "email, no bearer
 * token" auth posture as GET /me above. */
router.post('/events', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const eventType = String(req.body?.eventType || '').trim().toUpperCase();
    const appId = req.body?.appId ? String(req.body.appId) : null;
    if (!email || !CLIENT_EVENT_TYPES.includes(eventType)) {
        return res.status(400).json({ success: false, error: 'A valid email and eventType are required.' });
    }
    try {
        const userId = await getUserIdByEmail(email);
        if (!userId) {
            return res.status(404).json({ success: false, error: 'Unknown user.' });
        }
        await recordEvent(userId, eventType, appId);
        res.json({ success: true });
    } catch (err) {
        console.error('[userProfile] Failed to log event for', email, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not log event.' });
    }
});

module.exports = router;
module.exports.upsertLoginProfile = upsertLoginProfile;
module.exports.getProfile = getProfile;
module.exports.recordEvent = recordEvent;
module.exports.getUserIdByEmail = getUserIdByEmail;
