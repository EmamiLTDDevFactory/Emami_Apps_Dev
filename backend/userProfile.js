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

/** Same idea as formatTimeSpent but for one session's length specifically, which is often under a
 * minute (formatTimeSpent's hours/minutes granularity would just show "—" for those) — takes a
 * plain second count instead of a Postgres interval. */
function formatSeconds(totalSeconds) {
    if (totalSeconds == null || totalSeconds < 0) return null;
    const s = Math.round(totalSeconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

/** The most recently *completed* session's length — the last SESSION_END and whichever
 * LOGIN/SESSION_START immediately preceded it. Only ever fed by client-side logout()
 * (AuthContext.tsx fires SESSION_END) — a session with no matching end yet (still open, or the
 * tab was just closed without an explicit sign-out) is reported as null, not guessed at. */
async function getLastSessionDuration(userId) {
    try {
        const { rows } = await pool.query(
            `WITH last_end AS (
                 SELECT occurred_at AS end_at FROM emami_apps.events
                 WHERE user_id = $1 AND event_type = 'SESSION_END'
                 ORDER BY occurred_at DESC LIMIT 1
             )
             SELECT
                 (SELECT end_at FROM last_end) AS end_at,
                 (SELECT occurred_at FROM emami_apps.events, last_end
                  WHERE user_id = $1 AND event_type IN ('SESSION_START', 'LOGIN')
                    AND occurred_at <= last_end.end_at
                  ORDER BY occurred_at DESC LIMIT 1) AS start_at`,
            [userId]
        );
        const row = rows[0];
        if (!row?.start_at || !row?.end_at) return null;
        const seconds = (new Date(row.end_at).getTime() - new Date(row.start_at).getTime()) / 1000;
        return formatSeconds(seconds);
    } catch (err) {
        console.error('[userProfile] Failed to compute last session duration:', err.message);
        return null;
    }
}

/** Top apps by how many times this user has opened them (APP_OPEN events) — the per-app bars on
 * the "Your time on app" card. Visit counts, not literal per-app time: nothing today tracks how
 * long an app stays open (only that it was opened), so this is what's honestly available rather
 * than a duration figure invented from thin air. */
async function getTopApps(userId, limit = 3) {
    try {
        const { rows } = await pool.query(
            `SELECT app_id, COUNT(*) AS opens
             FROM emami_apps.events
             WHERE user_id = $1 AND event_type = 'APP_OPEN' AND app_id IS NOT NULL
             GROUP BY app_id
             ORDER BY opens DESC
             LIMIT $2`,
            [userId, limit]
        );
        return rows.map((r) => ({ appId: r.app_id, opens: Number(r.opens) }));
    } catch (err) {
        console.error('[userProfile] Failed to load top apps:', err.message);
        return [];
    }
}

/** Everything HomeScreen/SettingsScreen need for the logged-in user, in the exact shape the
 * frontend's mock CURRENT_USER/ACTIVITY_STATS used — see src/data/mockData.ts. */
async function getProfile(email) {
    const { rows } = await pool.query(
        `SELECT user_id, name, email, mobile, role, status, last_login_at,
                sessions_total, logins, time_spent, apps_opened, downloads,
                favorites_added, notifications_read, most_used_app, photo_url
         FROM emami_apps.user_profile_stats
         WHERE email = $1`,
        [email]
    );
    const row = rows[0];
    if (!row) return null;

    const [lastSessionDuration, topApps] = await Promise.all([
        getLastSessionDuration(row.user_id),
        getTopApps(row.user_id),
    ]);

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
        lastSessionDuration,
        topApps,
        photoUrl: row.photo_url || null,
    };
}

/** Whitelisted image MIME types for the "Upload Photo" data URI — matches the JPG/PNG/WebP copy
 * shown on the Settings screen's upload helper text. */
const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Sanity cap on the stored data URI's length — the client resizes to 512x512 and compresses
 * before upload, so a legitimate photo is nowhere near this; it only guards against something
 * malformed or unexpectedly huge slipping through before it hits the DB. */
const MAX_PHOTO_DATA_URI_LENGTH = 2_000_000;

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

/** Records a login from the frontend directly, bypassing the hub-auth Lambda (hub-auth.js,
 * saml-sso.js) which already calls upsertLoginProfile() server-side but has no VPC route to
 * Postgres and so silently fails to persist it. Called right after a successful login — direct
 * email (LoginScreen.tsx) or SSO (RootNavigator.tsx), both funnel through AuthContext's login() —
 * via EXPO_PUBLIC_ACCESS_API_URL, the backend instance that can actually reach Postgres, instead
 * of duplicating the write through the Lambda. Login itself still happens on the Lambda; this
 * only records that it happened. Same "email, no bearer token" auth posture as the rest of this
 * file. */
router.post('/me/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = req.body?.name ? String(req.body.name) : undefined;
    if (!email) {
        return res.status(400).json({ success: false, error: 'email is required.' });
    }
    const user = await upsertLoginProfile(email, name);
    if (!user) {
        return res.status(500).json({ success: false, error: 'Could not record login.' });
    }
    res.json({ success: true });
});

/** Saves the logged-in user's profile photo — the Settings screen's "Upload Photo" button. The
 * client already resized/compressed the image to 512x512 and encoded it as a data URI
 * ("data:image/jpeg;base64,...") before calling this, so the only work here is validating it looks
 * like one of the allowed image types and isn't absurdly large, then storing it as-is. Same "email,
 * no bearer token" auth posture as the rest of this file. */
router.post('/me/photo', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const imageDataUri = String(req.body?.imageDataUri || '');
    if (!email) {
        return res.status(400).json({ success: false, error: 'email is required.' });
    }
    if (imageDataUri.length > MAX_PHOTO_DATA_URI_LENGTH) {
        return res.status(413).json({ success: false, error: 'Image is too large.' });
    }
    const match = /^data:(image\/[a-zA-Z+.-]+);base64,/.exec(imageDataUri);
    if (!match || !ALLOWED_PHOTO_MIME_TYPES.includes(match[1].toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Photo must be a JPG, PNG or WebP image.' });
    }
    try {
        const { rowCount } = await pool.query(
            'UPDATE emami_apps.users SET photo_url = $1 WHERE email = $2',
            [imageDataUri, email]
        );
        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Unknown user.' });
        }
        res.json({ success: true, photoUrl: imageDataUri });
    } catch (err) {
        console.error('[userProfile] Failed to save photo for', email, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not save photo.' });
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
