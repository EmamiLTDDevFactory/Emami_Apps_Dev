require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { pool, testConnection, runMigrations, PERMANENT_SUPER_ADMIN_EMAILS } = require('./db');
const { formatTimeSpent, normalizeIndianMobile } = require('./userProfile');
const { syncAuditCapaAccess, revokeAuditCapaAccess } = require('./auditCapaSync');
const { recordAccessChange, listAccessChanges } = require('./accessHistory');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./sessionAuth');

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
// Salescode (SAP SD master/transactional data for products sold through Salescode, via OData) — own routes under /salescode,
// self-contained in salescode.js. Purely additive, same as Dev Tracker above.
apiRouter.use('/salescode', require('./salescode'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Guards every route that lists users or changes anyone's access. These used to trust whatever
 * `actingEmail` the request carried, with no check on the caller at all, so anyone who knew the
 * URL could grant themselves Admin on any app. Now the caller must send their Emami Apps session
 * token (`Authorization: Bearer <token>`, the JWT the hub stores at sign-in), it must verify
 * against HUB_AUTH_JWT_SECRET, and that person must be an active Super Admin or Admin — the same
 * rule the hub's own Manage Access / Administration screens use to show themselves. The verified
 * email is put on `req.verifiedEmail`, and routes use it as the acting user instead of any
 * `actingEmail` the client sends, so the audit history and the access-level rules below can't be
 * spoofed either. */
const ACCESS_MANAGER_LEVELS = ['Super Admin', 'Admin'];
/** Server-to-server callers (embedded-apps/timesheet/server's Add employee search) have no user
 * session, so they prove themselves with HUB_INTERNAL_API_SECRET in an X-Internal-Secret header
 * instead — the same shared-secret pattern as AUDIT_CAPA_SYNC_SECRET. Unset on either side means
 * no internal access at all, never open access. */
const HUB_INTERNAL_API_SECRET = process.env.HUB_INTERNAL_API_SECRET || '';
function isInternalCaller(req) {
    const sent = Buffer.from(String(req.get('x-internal-secret') || ''));
    const expected = Buffer.from(HUB_INTERNAL_API_SECRET);
    return expected.length > 0 && sent.length === expected.length && crypto.timingSafeEqual(sent, expected);
}
function requireAccessManagerOrInternal(req, res, next) {
    if (isInternalCaller(req)) return next();
    return requireAccessManager(req, res, next);
}

async function requireAccessManager(req, res, next) {
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!match || !JWT_SECRET) {
        return res.status(401).json({ success: false, error: 'Sign in to Emami Apps to manage access.' });
    }
    let email;
    try {
        email = String(jwt.verify(match[1].trim(), JWT_SECRET)?.email || '').trim().toLowerCase();
    } catch {
        return res.status(401).json({ success: false, error: 'Your Emami Apps session has expired or is invalid. Please sign in again.' });
    }
    if (!email) {
        return res.status(401).json({ success: false, error: 'Invalid Emami Apps session.' });
    }
    try {
        const { rows } = await pool.query(
            'SELECT access_level, is_active FROM emami_apps.authorized_users WHERE email = $1',
            [email]
        );
        const caller = rows[0];
        if (!caller || caller.is_active === false || !ACCESS_MANAGER_LEVELS.includes(caller.access_level)) {
            return res.status(403).json({ success: false, error: 'You do not have permission to manage access.' });
        }
        req.verifiedEmail = email;
        next();
    } catch (err) {
        console.error('[access] Could not check the caller\'s access level:', err.message);
        res.status(500).json({ success: false, error: 'Could not verify your access.' });
    }
}
/** Most apps use the generic User/Admin pair. Audit & CAPA has its own role vocabulary — CQA
 * (elevated, equivalent to Admin) and Depot (base, equivalent to User) — see auditCapaSync.js,
 * which is what actually makes this role take effect inside that app. Provision Tracking
 * (payment-tracking) adds a third role, Finance, on top of the generic pair — see that app's own
 * PaymentTrackingAuthContext.tsx/_layout.tsx for what each role sees. PO Approval
 * (fm-po-deviation) has no Admin/User distinction — everyone granted access gets the single
 * 'User' role. */
const VALID_ROLES_BY_APP = { 'audit-capa': ['CQA', 'Depot'], 'payment-tracking': ['User', 'Admin', 'Finance'], 'fm-po-deviation': ['User'] };
const DEFAULT_VALID_ROLES = ['User', 'Admin'];
function validRolesForApp(appId) {
    return VALID_ROLES_BY_APP[appId] || DEFAULT_VALID_ROLES;
}
/** Every brand-new authorized user gets the base 'User' role on these apps immediately, with no
 * Super Admin having to grant them one by one — see POST /access/users below. Both are
 * employee-facing forms (Mediclaim/Term Policy) everyone in the company is expected to be able to
 * use the moment they're added to the hub; Admin access on top of this default still has to be
 * granted explicitly through Manage Access, same as any other app. */
const DEFAULT_GRANTED_APPS = ['mediclaim', 'term-policy'];
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
// The full user list (emails, mobiles, grants): the hub's Manage Access screen (signed-in Super
// Admin / Admin) or TimeSheet's server (internal secret) only.
apiRouter.get('/access/users', requireAccessManagerOrInternal, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT au.email,
                   au.is_active,
                   au.access_level,
                   au.pre_registered_mobile,
                   u.mobile AS profile_mobile,
                   COALESCE(
                       json_agg(json_build_object('appId', a.app_id, 'role', a.role, 'depot', a.depot)) FILTER (WHERE a.app_id IS NOT NULL),
                       '[]'
                   ) AS apps
            FROM emami_apps.authorized_users au
            LEFT JOIN emami_apps.authorized_user_apps a ON a.email = au.email
            LEFT JOIN emami_apps.users u ON u.email = au.email
            GROUP BY au.email, au.is_active, au.access_level, au.pre_registered_mobile, u.mobile, au.created_at
            ORDER BY au.created_at ASC
        `);
        res.json({
            success: true,
            // `mobile` prefers the person's own profile value (set via Settings, once they've
            // logged in at least once) over the admin's pre-registration guess — see
            // userProfile.js's upsertLoginProfile for how the latter seeds the former.
            users: rows.map((r) => ({
                email: r.email,
                isActive: r.is_active,
                accessLevel: r.access_level,
                mobile: r.profile_mobile || r.pre_registered_mobile || null,
                apps: r.apps,
            })),
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
apiRouter.get('/admin/overview', requireAccessManager, async (req, res) => {
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
apiRouter.get('/admin/roster', requireAccessManager, async (req, res) => {
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
apiRouter.get('/admin/user/:email/apps', requireAccessManager, async (req, res) => {
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

/** Administration / Access Tracker — one user's sign-ins and sessions, rebuilt from the raw
 * emami_apps.events log (the views above only keep totals). A session runs from a SESSION_START
 * (written with every LOGIN, see userProfile.js upsertLoginProfile) to the SESSION_END the hub
 * writes on sign-out, or is left open when there was none (closed tab, expired token) — those have
 * no duration rather than a guessed one. Every APP_OPEN between a session's start and its end (or
 * the next start) is that session's app list. Reads the newest ACTIVITY_EVENT_LIMIT events only,
 * so a very old session can be cut at its start; the response says when that happened. */
const ACTIVITY_EVENT_LIMIT = 5000;
apiRouter.get('/admin/user/:email/activity', requireAccessManager, async (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({ success: false, error: 'email is required.' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT e.event_type, e.app_id, e.occurred_at
             FROM emami_apps.users u
             JOIN emami_apps.events e ON e.user_id = u.user_id
             WHERE u.email = $1 AND e.event_type IN ('LOGIN', 'SESSION_START', 'SESSION_END', 'APP_OPEN')
             ORDER BY e.occurred_at DESC, e.event_type
             LIMIT $2`,
            [email, ACTIVITY_EVENT_LIMIT]
        );
        const events = rows.reverse();
        const logins = [];
        const sessions = [];
        let current = null;
        for (const e of events) {
            const at = e.occurred_at;
            if (e.event_type === 'LOGIN') {
                logins.push(at);
            } else if (e.event_type === 'SESSION_START') {
                current = { start: at, end: null, apps: [] };
                sessions.push(current);
            } else if (e.event_type === 'SESSION_END') {
                if (current && !current.end) current.end = at;
            } else if (e.event_type === 'APP_OPEN' && e.app_id && current && !current.end) {
                current.apps.push({ appId: e.app_id, at });
            }
        }
        let recordedSeconds = 0;
        const out = sessions.reverse().map((s) => {
            const seconds = s.end ? Math.max(0, (new Date(s.end) - new Date(s.start)) / 1000) : null;
            if (seconds != null) recordedSeconds += seconds;
            return { start: s.start, end: s.end, durationSeconds: seconds == null ? null : Math.round(seconds), apps: s.apps };
        });
        res.json({
            success: true,
            activity: {
                logins: logins.reverse(),
                sessions: out,
                recordedSeconds: Math.round(recordedSeconds),
                truncated: rows.length === ACTIVITY_EVENT_LIMIT,
            },
        });
    } catch (err) {
        console.error('[admin] Failed to load sign-in activity for', email, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not load sign-in activity.' });
    }
});

/** Administration tab — app-wise usage aggregated across every user, not scoped to one (that's
 * the per-user drill-down above). Backs the "App-wise Usage" sheet in the Excel export button.
 * Scoped through the same `scope` (active authorized users) as /admin/overview's own app_opens
 * CTE, so an app's total doesn't get inflated by opens from someone who's since been deactivated
 * or removed. */
apiRouter.get('/admin/apps', requireAccessManager, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            WITH scope AS (
                SELECT u.user_id
                FROM emami_apps.authorized_users au
                JOIN emami_apps.users u ON u.email = au.email
                WHERE au.is_active = true
            )
            SELECT e.app_id,
                   COUNT(*) AS opens,
                   COUNT(DISTINCT e.user_id) AS unique_users,
                   MIN(e.occurred_at) AS first_opened,
                   MAX(e.occurred_at) AS last_opened
            FROM emami_apps.events e
            JOIN scope s ON s.user_id = e.user_id
            WHERE e.event_type = 'APP_OPEN' AND e.app_id IS NOT NULL
            GROUP BY e.app_id
            ORDER BY opens DESC
        `);
        res.json({
            success: true,
            apps: rows.map((r) => ({
                appId: r.app_id,
                opens: Number(r.opens || 0),
                uniqueUsers: Number(r.unique_users || 0),
                firstOpened: r.first_opened,
                lastOpened: r.last_opened,
            })),
        });
    } catch (err) {
        console.error('[admin] Failed to load app-wise usage:', err.message);
        res.status(500).json({ success: false, error: 'Could not load app-wise usage.' });
    }
});

/** Administration tab — per-user breakdown for ONE specific app (the App-wise Usage section's
 * own drill-down, and its standalone Excel export) — the inverse of GET /admin/user/:email/apps
 * above (that one's "every app one user opened"; this is "every user who opened one app"). Not
 * scoped to currently-granted users, same reasoning as that endpoint: someone whose grant has
 * since been revoked still shows here if they used it while they had access. */
apiRouter.get('/admin/app/:appId/users', requireAccessManager, async (req, res) => {
    const appId = String(req.params.appId || '').trim();
    if (!appId) {
        return res.status(400).json({ success: false, error: 'appId is required.' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT u.email,
                    COUNT(*) AS opens,
                    MIN(e.occurred_at) AS first_opened,
                    MAX(e.occurred_at) AS last_opened
             FROM emami_apps.events e
             JOIN emami_apps.users u ON u.user_id = e.user_id
             WHERE e.app_id = $1 AND e.event_type = 'APP_OPEN'
             GROUP BY u.email
             ORDER BY opens DESC`,
            [appId]
        );
        res.json({
            success: true,
            users: rows.map((r) => ({
                email: r.email,
                opens: Number(r.opens || 0),
                firstOpened: r.first_opened,
                lastOpened: r.last_opened,
            })),
        });
    } catch (err) {
        console.error('[admin] Failed to load per-user stats for app', appId, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not load per-user stats for this app.' });
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

/** Grant a brand-new email access to the hub (active by default, Viewer access level) — and, per
 * DEFAULT_GRANTED_APPS above, the base User role on Mediclaim/Term Policy right away, so those two
 * apps work the instant someone's added instead of needing a separate Manage Access grant. Every
 * other app still starts ungranted, same as before.
 *
 * `mobile`, if given, is stored as a pre-registration value (authorized_users.pre_registered_mobile)
 * and only actually lands on emami_apps.users.mobile — where the Profile page reads it from — once
 * this person logs in for the first time (see userProfile.js's upsertLoginProfile). There's no
 * users row to update yet at Add-User time. `actingEmail` (the admin doing the adding) is optional
 * but expected from the frontend — recorded on the USER_ADDED history row either way. */
apiRouter.post('/access/users', requireAccessManager, async (req, res) => {
    const email = (req.body?.email || '').trim().toLowerCase();
    const actingEmail = req.verifiedEmail;
    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
    }
    let mobile = null;
    if (req.body?.mobile) {
        mobile = normalizeIndianMobile(req.body.mobile);
        if (!mobile) {
            return res.status(400).json({ success: false, error: 'Enter a valid 10-digit Indian mobile number, or leave it blank.' });
        }
    }
    try {
        const { rows } = await pool.query(
            `INSERT INTO emami_apps.authorized_users (email, pre_registered_mobile)
             VALUES ($1, $2)
             ON CONFLICT (email) DO NOTHING
             RETURNING email, access_level`,
            [email, mobile]
        );
        if (rows.length === 0) {
            return res.status(409).json({ success: false, error: 'This email already has access.' });
        }
        if (DEFAULT_GRANTED_APPS.length > 0) {
            await pool.query(
                `INSERT INTO emami_apps.authorized_user_apps (email, app_id, role)
                 SELECT $1, app_id, 'User' FROM UNNEST($2::text[]) AS app_id
                 ON CONFLICT (email, app_id) DO NOTHING`,
                [email, DEFAULT_GRANTED_APPS]
            );
        }
        recordAccessChange({ targetEmail: email, changedBy: actingEmail, changeType: 'USER_ADDED', newValue: mobile ? `mobile: ${mobile}` : null });
        const apps = DEFAULT_GRANTED_APPS.map((appId) => ({ appId, role: 'User' }));
        res.json({ success: true, email, isActive: true, accessLevel: rows[0].access_level, apps });
    } catch (err) {
        console.error('[access] Failed to add authorized user:', err.message);
        res.status(500).json({ success: false, error: 'Could not add this user.' });
    }
});

/** Revoke a user entirely — cascades to remove all of their app grants too. The permanent Super
 * Admin can't be removed this way either, same reasoning as the active-toggle guard below.
 * `actingEmail` comes as a query param (not a body) since this is a DELETE — matches how every
 * other DELETE route in this file already takes its target purely from the URL. */
apiRouter.delete('/access/users/:email', requireAccessManager, async (req, res) => {
    const email = req.params.email.toLowerCase();
    const actingEmail = req.verifiedEmail;
    if (PERMANENT_SUPER_ADMIN_EMAILS.includes(email)) {
        return res.status(403).json({ success: false, error: 'The Super Admin account cannot be removed.' });
    }
    try {
        await pool.query('DELETE FROM emami_apps.authorized_users WHERE email = $1', [email]);
        recordAccessChange({ targetEmail: email, changedBy: actingEmail, changeType: 'USER_REMOVED' });
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
apiRouter.patch('/access/users/:email/active', requireAccessManager, async (req, res) => {
    const email = req.params.email.toLowerCase();
    const isActive = !!req.body?.isActive;
    const actingEmail = req.verifiedEmail;
    if (PERMANENT_SUPER_ADMIN_EMAILS.includes(email) && !isActive) {
        return res.status(403).json({ success: false, error: 'The Super Admin account cannot be deactivated.' });
    }
    try {
        const { rows: [before] } = await pool.query(
            'SELECT is_active FROM emami_apps.authorized_users WHERE email = $1',
            [email]
        );
        const { rowCount } = await pool.query(
            'UPDATE emami_apps.authorized_users SET is_active = $1 WHERE email = $2',
            [isActive, email]
        );
        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'That user is not authorized.' });
        }
        if (before && before.is_active !== isActive) {
            recordAccessChange({
                targetEmail: email,
                changedBy: actingEmail,
                changeType: 'ACTIVE_STATUS',
                oldValue: String(before.is_active),
                newValue: String(isActive),
            });
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
apiRouter.patch('/access/users/:email/access-level', requireAccessManager, async (req, res) => {
    const targetEmail = req.params.email.toLowerCase();
    const actingEmail = req.verifiedEmail;
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

        const { rows: [before] } = await pool.query(
            'SELECT access_level FROM emami_apps.authorized_users WHERE email = $1',
            [targetEmail]
        );
        const { rowCount } = await pool.query(
            'UPDATE emami_apps.authorized_users SET access_level = $1 WHERE email = $2',
            [accessLevel, targetEmail]
        );
        if (rowCount === 0) {
            return res.status(404).json({ success: false, error: 'That user is not authorized.' });
        }
        if (before && before.access_level !== accessLevel) {
            recordAccessChange({
                targetEmail,
                changedBy: actingEmail,
                changeType: 'ACCESS_LEVEL',
                oldValue: before.access_level,
                newValue: accessLevel,
            });
        }
        res.json({ success: true, accessLevel });
    } catch (err) {
        console.error('[access] Failed to update access level for', targetEmail, ':', err.message);
        res.status(500).json({ success: false, error: 'Could not update access level.' });
    }
});

/** Grant (or change the role on) one app for an existing authorized user. */
apiRouter.post('/access/users/:email/apps/:appId', requireAccessManager, async (req, res) => {
    const role = req.body?.role;
    const depot = req.body?.depot || null;
    const actingEmail = req.verifiedEmail;
    const appId = req.params.appId;
    const validRoles = validRolesForApp(appId);
    if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, error: `Role must be one of: ${validRoles.join(', ')}.` });
    }
    const email = req.params.email.toLowerCase();
    try {
        const { rows: [before] } = await pool.query(
            'SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2',
            [email, appId]
        );
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
        if (before?.role !== role) {
            recordAccessChange({
                targetEmail: email,
                changedBy: actingEmail,
                changeType: 'APP_ROLE',
                appId,
                oldValue: before?.role || null,
                newValue: role,
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
apiRouter.delete('/access/users/:email/apps/:appId', requireAccessManager, async (req, res) => {
    const email = req.params.email.toLowerCase();
    const appId = req.params.appId;
    const actingEmail = req.verifiedEmail;
    try {
        const { rows: [before] } = await pool.query(
            'SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2',
            [email, appId]
        );
        await pool.query(
            'DELETE FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2',
            [email, appId]
        );
        if (appId === 'audit-capa') {
            revokeAuditCapaAccess(email).catch((err) => {
                console.error('[access] Could not revoke Audit & CAPA access for', email, ':', err.message);
            });
        }
        if (before?.role) {
            recordAccessChange({
                targetEmail: email,
                changedBy: actingEmail,
                changeType: 'APP_ROLE',
                appId,
                oldValue: before.role,
                newValue: null,
            });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[access] Failed to revoke app access:', err.message);
        res.status(500).json({ success: false, error: 'Could not revoke access.' });
    }
});

/** Change-history audit feed for the Administration tab — pass ?email= for one user's own history
 * (the roster's user-detail dialog), omit it for the org-wide feed (the tab's own Change History
 * section). See accessHistory.js for what's recorded and by which routes above. */
apiRouter.get('/access/history', requireAccessManager, async (req, res) => {
    const email = req.query?.email ? String(req.query.email).trim().toLowerCase() : undefined;
    try {
        const changes = await listAccessChanges({ targetEmail: email });
        res.json({ success: true, changes });
    } catch (err) {
        console.error('[access] Failed to load change history:', err.message);
        res.status(500).json({ success: false, error: 'Could not load change history.' });
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
