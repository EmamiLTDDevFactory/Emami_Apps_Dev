require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { pool, testConnection, runMigrations, PERMANENT_SUPER_ADMIN_EMAILS } = require('./db');
const { formatTimeSpent } = require('./userProfile');
const { syncAuditCapaAccess, revokeAuditCapaAccess } = require('./auditCapaSync');

const app = express();
const port = process.env.PORT || 4000;

// Fire-and-forget on module load (covers both `node server.js` and Lambda cold starts, where
// require.main !== module) — idempotent, so a request racing ahead of it is harmless.
runMigrations();

// This Lambda has run login as SAML, then OAuth2 (briefly, on the mouldhealthcheck Azure App
// Service — that turned out to be Basis-owned infra provisioned for Mould's SAP APIs
// specifically, not something this team can deploy unrelated code onto), and is back to SAML
// now (see ./saml-sso.js) — this time driven by an admin-uploaded IdP metadata XML (Configure
// SSO screen) instead of hardcoded settings, so a cert rotation or tenant change doesn't need a
// redeploy. Fronted by API Gateway instead of a Lambda Function URL (which was blocked by an
// unresolved AWS-account-level access issue). The Manage Access endpoints below (backed by
// Postgres) have been here the whole time.
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || 'http://localhost:8081')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

// DELETE (deassigning an app role, removing a user) and PATCH (toggling active, granting/revoking
// an access level) were missing here — the browser's CORS preflight for those methods got back an
// Access-Control-Allow-Methods that didn't list them, so it silently blocked the actual request
// before it ever reached this server. POST-based "assign" always worked; DELETE-based "deassign"
// never did. curl/server-side testing never catches this — CORS is enforced by the browser, not
// the server, so a same-machine curl call bypasses it entirely.
// PUT added for Dev Tracker's item-edit route (devTracker.js) — same class of gap as the
// DELETE/PATCH one above, additive only, doesn't change any existing route's behavior.
app.use(cors({ origin: FRONTEND_ORIGINS, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
// 6mb (not the old 2mb) because this now also covers userProfile.js's profile-photo upload — a
// 512x512 image encoded as a base64 data URI, plus JSON/base64 overhead, needs more headroom than
// the earlier 2mb ceiling (itself raised from 10kb for saml-sso.js's metadata upload). Once this
// global parser has consumed the body, a route-level express.json() can't raise the limit again
// (body-parser skips re-parsing a body it already parsed).
app.use(express.json({ limit: '6mb' }));

const apiRouter = express.Router();
app.use('/api', apiRouter);

apiRouter.use(require('./hub-auth'));
apiRouter.use(require('./magicLink'));
apiRouter.use(require('./saml-sso'));
apiRouter.use(require('./userProfile'));
apiRouter.use(require('./stockQuote'));
// Development Tracker (SAP ABAP dev item tracking) — own dev_tracker schema, own routes under
// /dev-tracker, self-contained in devTracker.js. Purely additive: doesn't touch any route above.
apiRouter.use('/dev-tracker', require('./devTracker'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Most apps use the generic User/Admin pair. Audit & CAPA has its own role vocabulary — CQA
 * (elevated, equivalent to Admin) and Depot (base, equivalent to User) — see auditCapaSync.js,
 * which is what actually makes this role take effect inside that app. Provision Tracking
 * (payment-tracking) adds a third role, Finance, on top of the generic pair — see that app's own
 * PaymentTrackingAuthContext.tsx/_layout.tsx for what each role sees. */
const VALID_ROLES_BY_APP = { 'audit-capa': ['CQA', 'Depot'], 'payment-tracking': ['User', 'Admin', 'Finance'] };
const DEFAULT_VALID_ROLES = ['User', 'Admin'];
function validRolesForApp(appId) {
    return VALID_ROLES_BY_APP[appId] || DEFAULT_VALID_ROLES;
}
/** Hub-wide role (emami_apps.authorized_users.access_level) — distinct from the per-app roles
 * above. Order matters for the permission checks in the access-level route below. */
const ACCESS_LEVELS = ['Super Admin', 'Admin', 'Viewer'];

/**
 * Real-time Manage Access check for one email — used by the frontend right after a Microsoft SSO
 * login (src/lib/authApi.ts's verifySsoToken) to enforce the DB gate even though the SAML flow
 * itself still runs on the hub-auth Lambda, which has no route to Postgres and so can't run this
 * check on its own (see backend/authorizedUsers.js). Same rule as isAuthorized(): the email must
 * exist in emami_apps.authorized_users AND be marked active.
 */
apiRouter.get('/access/authorized/:email', async (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    try {
        const { rows } = await pool.query(
            'SELECT is_active FROM emami_apps.authorized_users WHERE email = $1',
            [email]
        );
        const authorized = rows.length > 0 && rows[0].is_active === true;
        res.json({ success: true, authorized });
    } catch (err) {
        console.error('[access] Authorization check failed for', email, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not verify access.' });
    }
});

/** Manage Access — list every authorized user with active status, hub-wide access level, and
 * their per-app roles. */
apiRouter.get('/access/users', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT au.email,
                   au.is_active,
                   au.access_level,
                   COALESCE(
                       json_agg(json_build_object('appId', a.app_id, 'role', a.role, 'depot', a.depot)) FILTER (WHERE a.app_id IS NOT NULL),
                       '[]'
                   ) AS apps
            FROM emami_apps.authorized_users au
            LEFT JOIN emami_apps.authorized_user_apps a ON a.email = au.email
            GROUP BY au.email, au.is_active, au.access_level, au.created_at
            ORDER BY au.created_at ASC
        `);
        res.json({
            success: true,
            users: rows.map((r) => ({ email: r.email, isActive: r.is_active, accessLevel: r.access_level, apps: r.apps })),
        });
    } catch (err) {
        console.error('[access] Failed to list authorized users:', err.message);
        res.status(500).json({ success: false, error: 'Could not load authorized users.' });
    }
});

/** Administration tab — org-wide KPI summary. Scoped to `authorized_users` (the hub's actual
 * roster), not the raw `emami_apps.users` table, so someone who logged in once and was later
 * revoked doesn't inflate these numbers. "Active" for the 7d/30d counts means both currently
 * authorized (is_active) AND recently logged in — a deactivated user who logged in yesterday
 * doesn't count, since they can no longer sign in. One round trip via scalar subqueries. */
apiRouter.get('/admin/overview', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            WITH scope AS (
                SELECT au.email, u.user_id, u.last_login_at
                FROM emami_apps.authorized_users au
                LEFT JOIN emami_apps.users u ON u.email = au.email
                WHERE au.is_active = true
            ),
            app_opens AS (
                SELECT e.app_id, COUNT(*) AS opens
                FROM emami_apps.events e
                JOIN scope s ON s.user_id = e.user_id
                WHERE e.event_type = 'APP_OPEN' AND e.app_id IS NOT NULL
                GROUP BY e.app_id
                ORDER BY opens DESC
                LIMIT 1
            )
            SELECT
                (SELECT COUNT(*) FROM emami_apps.authorized_users) AS total_authorized_users,
                (SELECT COUNT(*) FROM emami_apps.authorized_users WHERE is_active) AS active_authorized_users,
                (SELECT COUNT(*) FROM scope WHERE last_login_at >= now() - interval '7 days') AS active_last_7d,
                (SELECT COUNT(*) FROM scope WHERE last_login_at >= now() - interval '30 days') AS active_last_30d,
                (SELECT COUNT(*) FROM scope WHERE user_id IS NULL) AS never_logged_in,
                (SELECT COUNT(*) FROM emami_apps.events e JOIN scope s ON s.user_id = e.user_id WHERE e.event_type = 'LOGIN') AS total_logins,
                (SELECT COUNT(*) FROM emami_apps.events e JOIN scope s ON s.user_id = e.user_id WHERE e.event_type = 'APP_OPEN') AS total_app_opens,
                (SELECT app_id FROM app_opens) AS most_used_app,
                (SELECT opens FROM app_opens) AS most_used_app_opens
        `);
        const r = rows[0];
        res.json({
            success: true,
            overview: {
                totalAuthorizedUsers: Number(r.total_authorized_users || 0),
                activeAuthorizedUsers: Number(r.active_authorized_users || 0),
                activeLast7Days: Number(r.active_last_7d || 0),
                activeLast30Days: Number(r.active_last_30d || 0),
                neverLoggedIn: Number(r.never_logged_in || 0),
                totalLogins: Number(r.total_logins || 0),
                totalAppOpens: Number(r.total_app_opens || 0),
                mostUsedApp: r.most_used_app ? { appId: r.most_used_app, opens: Number(r.most_used_app_opens) } : null,
            },
        });
    } catch (err) {
        console.error('[admin] Failed to load overview:', err.message);
        res.status(500).json({ success: false, error: 'Could not load the administration overview.' });
    }
});

/** Administration tab — every authorized user (same base shape as GET /access/users: email,
 * isActive, accessLevel, apps) plus a usage summary per row, sourced from
 * emami_apps.user_profile_stats. LEFT JOINed (not INNER) against both authorized_user_apps and
 * user_profile_stats so a user with zero app grants or who has never logged in still appears
 * (with an empty apps array / null usage) instead of being dropped. One query, no N+1. */
apiRouter.get('/admin/roster', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT au.email,
                   au.is_active,
                   au.access_level,
                   COALESCE(
                       json_agg(json_build_object('appId', a.app_id, 'role', a.role, 'depot', a.depot)) FILTER (WHERE a.app_id IS NOT NULL),
                       '[]'
                   ) AS apps,
                   ups.name,
                   ups.last_login_at,
                   ups.sessions_total,
                   ups.logins,
                   ups.time_spent,
                   ups.apps_opened,
                   ups.most_used_app
            FROM emami_apps.authorized_users au
            LEFT JOIN emami_apps.authorized_user_apps a ON a.email = au.email
            LEFT JOIN emami_apps.user_profile_stats ups ON ups.email = au.email
            GROUP BY au.email, au.is_active, au.access_level, au.created_at,
                     ups.name, ups.last_login_at, ups.sessions_total, ups.logins, ups.time_spent,
                     ups.apps_opened, ups.most_used_app
            ORDER BY au.created_at ASC
        `);
        res.json({
            success: true,
            users: rows.map((r) => ({
                email: r.email,
                isActive: r.is_active,
                accessLevel: r.access_level,
                apps: r.apps,
                usage: {
                    name: r.name || null,
                    lastLogin: r.last_login_at,
                    sessionsTotal: Number(r.sessions_total || 0),
                    logins: Number(r.logins || 0),
                    timeSpent: formatTimeSpent(r.time_spent),
                    appsOpened: Number(r.apps_opened || 0),
                    mostUsedApp: r.most_used_app || null,
                    hasLoggedIn: r.last_login_at != null,
                },
            })),
        });
    } catch (err) {
        console.error('[admin] Failed to load roster:', err.message);
        res.status(500).json({ success: false, error: 'Could not load the user roster.' });
    }
});

/** Administration tab — per-app drill-down for one user, shown when an admin taps an app tile in
 * the roster's user-detail dialog. Same visit-count-not-duration honesty as userProfile.js's
 * getTopApps: only APP_OPEN events carry a reliable app_id today (FAVORITE_ADD/REMOVE don't), so
 * opens/first/last-opened is what's actually available. Covers every app the user has ever opened,
 * not just their currently-granted ones — useful if a grant was since revoked. */
apiRouter.get('/admin/user/:email/apps', async (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({ success: false, error: 'email is required.' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT e.app_id,
                    COUNT(*) AS opens,
                    MIN(e.occurred_at) AS first_opened,
                    MAX(e.occurred_at) AS last_opened
             FROM emami_apps.users u
             JOIN emami_apps.events e ON e.user_id = u.user_id
             WHERE u.email = $1 AND e.event_type = 'APP_OPEN' AND e.app_id IS NOT NULL
             GROUP BY e.app_id
             ORDER BY opens DESC`,
            [email]
        );
        res.json({
            success: true,
            apps: rows.map((r) => ({
                appId: r.app_id,
                opens: Number(r.opens || 0),
                firstOpened: r.first_opened,
                lastOpened: r.last_opened,
            })),
        });
    } catch (err) {
        console.error('[admin] Failed to load per-app stats for', email, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not load per-app stats.' });
    }
});

/**
 * What the CURRENTLY LOGGED IN user themselves is allowed to see/do — their own hub-wide access
 * level (gates whether the frontend even shows the Manage Access nav item/screen — see
 * UserAccessScreen.tsx) and their own per-app grants (gates which app tiles render unlocked —
 * see HomeScreen.tsx/AppListScreen.tsx). Same "email, no bearer token" auth posture as the rest of
 * this backend. An email with no row here (shouldn't happen for anyone who made it past login, but
 * defends against a stale/deleted account) comes back as the least-privileged Viewer with no apps.
 */
apiRouter.get('/access/me', async (req, res) => {
    const email = String(req.query?.email || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({ success: false, error: 'email is required.' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT au.access_level,
                    COALESCE(
                        json_agg(json_build_object('appId', a.app_id, 'role', a.role)) FILTER (WHERE a.app_id IS NOT NULL),
                        '[]'
                    ) AS apps
             FROM emami_apps.authorized_users au
             LEFT JOIN emami_apps.authorized_user_apps a ON a.email = au.email
             WHERE au.email = $1
             GROUP BY au.access_level`,
            [email]
        );
        const row = rows[0];
        res.json({ success: true, accessLevel: row?.access_level || 'Viewer', apps: row?.apps || [] });
    } catch (err) {
        console.error('[access] Failed to load own access for', email, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not load access.' });
    }
});

/** Grant a brand-new email access to the hub (active by default, Viewer access level, no apps granted yet). */
apiRouter.post('/access/users', async (req, res) => {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
    }
    try {
        const { rows } = await pool.query(
            'INSERT INTO emami_apps.authorized_users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING email, access_level',
            [email]
        );
        if (rows.length === 0) {
            return res.status(409).json({ success: false, error: 'This email already has access.' });
        }
        res.json({ success: true, email, isActive: true, accessLevel: rows[0].access_level, apps: [] });
    } catch (err) {
        console.error('[access] Failed to add authorized user:', err.message);
        res.status(500).json({ success: false, error: 'Could not add this user.' });
    }
});

/** Revoke a user entirely — cascades to remove all of their app grants too. The permanent Super
 * Admin can't be removed this way either, same reasoning as the active-toggle guard below. */
apiRouter.delete('/access/users/:email', async (req, res) => {
    const email = req.params.email.toLowerCase();
    if (PERMANENT_SUPER_ADMIN_EMAILS.includes(email)) {
        return res.status(403).json({ success: false, error: 'The Super Admin account cannot be removed.' });
    }
    try {
        await pool.query('DELETE FROM emami_apps.authorized_users WHERE email = $1', [email]);
        res.json({ success: true });
    } catch (err) {
        console.error('[access] Failed to remove authorized user:', err.message);
        res.status(500).json({ success: false, error: 'Could not remove this user.' });
    }
});

/** Flip a user active/inactive — inactive users are blocked at login (see hub-auth.js's /auth/db-login)
 * without losing their app grants. The permanent Super Admin can't be deactivated either — an
 * "access level can't be changed" guarantee is meaningless if the same account can just be locked
 * out instead. */
apiRouter.patch('/access/users/:email/active', async (req, res) => {
    const email = req.params.email.toLowerCase();
    const isActive = !!req.body?.isActive;
    if (PERMANENT_SUPER_ADMIN_EMAILS.includes(email) && !isActive) {
        return res.status(403).json({ success: false, error: 'The Super Admin account cannot be deactivated.' });
    }
    try {
        const { rowCount } = await pool.query(
            'UPDATE emami_apps.authorized_users SET is_active = $1 WHERE email = $2',
            [isActive, email]
        );
        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'That user is not authorized.' });
        }
        res.json({ success: true, isActive });
    } catch (err) {
        console.error('[access] Failed to update active status:', err.message);
        res.status(500).json({ success: false, error: 'Could not update this user.' });
    }
});

/**
 * Change a user's hub-wide access level — the permission matrix the whole feature hinges on:
 *   - A permanent Super Admin's own level can never change, by anyone, including themselves.
 *   - Nobody can grant 'Super Admin' through this route — it only ever exists on the permanently
 *     seeded emails (see db.js's runMigrations).
 *   - An acting Super Admin can set any other user to 'Admin' or 'Viewer'.
 *   - An acting Admin can only set other users to 'Viewer' — granting Admin is Super-Admin-only.
 *   - Anyone else (Viewer, or an unrecognized acting email) can't change anything.
 * `actingEmail` identifies the caller — same "email in the body, no bearer token" posture as the
 * rest of this backend; the frontend passes the signed-in user's own email (AuthContext).
 */
apiRouter.patch('/access/users/:email/access-level', async (req, res) => {
    const targetEmail = req.params.email.toLowerCase();
    const actingEmail = String(req.body?.actingEmail || '').trim().toLowerCase();
    const accessLevel = req.body?.accessLevel;

    if (!ACCESS_LEVELS.includes(accessLevel) || accessLevel === 'Super Admin') {
        return res.status(400).json({ success: false, error: `Access level must be one of: Admin, Viewer.` });
    }
    if (PERMANENT_SUPER_ADMIN_EMAILS.includes(targetEmail)) {
        return res.status(403).json({ success: false, error: 'The Super Admin access level cannot be changed.' });
    }
    if (!actingEmail) {
        return res.status(400).json({ success: false, error: 'actingEmail is required.' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT access_level FROM emami_apps.authorized_users WHERE email = $1',
            [actingEmail]
        );
        const actingLevel = rows[0]?.access_level;
        const canGrant =
            actingLevel === 'Super Admin' ||
            (actingLevel === 'Admin' && accessLevel === 'Viewer');
        if (!canGrant) {
            return res.status(403).json({
                success: false,
                error: actingLevel === 'Admin'
                    ? 'Only Super Admin can grant Admin access.'
                    : 'You do not have permission to change access levels.',
            });
        }

        const { rowCount } = await pool.query(
            'UPDATE emami_apps.authorized_users SET access_level = $1 WHERE email = $2',
            [accessLevel, targetEmail]
        );
        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'That user is not authorized.' });
        }
        res.json({ success: true, accessLevel });
    } catch (err) {
        console.error('[access] Failed to update access level for', targetEmail, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not update access level.' });
    }
});

/** Grant (or change the role on) one app for an existing authorized user. */
apiRouter.post('/access/users/:email/apps/:appId', async (req, res) => {
    const role = req.body?.role;
    const depot = req.body?.depot || null;
    const appId = req.params.appId;
    const validRoles = validRolesForApp(appId);
    if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, error: `Role must be one of: ${validRoles.join(', ')}.` });
    }
    const email = req.params.email.toLowerCase();
    try {
        await pool.query(
            `INSERT INTO emami_apps.authorized_user_apps (email, app_id, role, depot)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email, app_id) DO UPDATE SET role = EXCLUDED.role, depot = EXCLUDED.depot`,
            [email, appId, role, depot]
        );
        // Audit & CAPA maintains its own separate Postgres-backed role table, historically only
        // ever updated by hand — push this grant through so it takes effect immediately. See
        // auditCapaSync.js's own comment for why this never fails the response above.
        if (appId === 'audit-capa') {
            syncAuditCapaAccess(pool, email, role, depot).catch((err) => {
                console.error('[access] Could not sync Audit & CAPA role for', email, ':', err.message);
            });
        }
        res.json({ success: true, role, depot });
    } catch (err) {
        if (err.code === '23503') {
            return res.status(404).json({ success: false, error: 'That user is not authorized.' });
        }
        console.error('[access] Failed to grant app access:', err.message);
        res.status(500).json({ success: false, error: 'Could not grant access.' });
    }
});

/** Revoke one app from an existing authorized user. */
apiRouter.delete('/access/users/:email/apps/:appId', async (req, res) => {
    const email = req.params.email.toLowerCase();
    const appId = req.params.appId;
    try {
        await pool.query(
            'DELETE FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2',
            [email, appId]
        );
        if (appId === 'audit-capa') {
            revokeAuditCapaAccess(email).catch((err) => {
                console.error('[access] Could not revoke Audit & CAPA access for', email, ':', err.message);
            });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[access] Failed to revoke app access:', err.message);
        res.status(500).json({ success: false, error: 'Could not revoke access.' });
    }
});

apiRouter.get('/health', (req, res) => res.json({ success: true }));

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Emami Apps hub auth backend listening on port ${port}`);
        testConnection();
    });
}

module.exports = app;
