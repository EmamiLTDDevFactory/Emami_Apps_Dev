require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { pool, testConnection, runMigrations, PERMANENT_SUPER_ADMIN_EMAILS } = require('./db');

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
const VALID_ROLES = ['User', 'Admin'];
/** Hub-wide role (emami_apps.authorized_users.access_level) — distinct from the per-app VALID_ROLES
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
                       json_agg(json_build_object('appId', a.app_id, 'role', a.role)) FILTER (WHERE a.app_id IS NOT NULL),
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
    if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ success: false, error: `Role must be one of: ${VALID_ROLES.join(', ')}.` });
    }
    try {
        await pool.query(
            `INSERT INTO emami_apps.authorized_user_apps (email, app_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (email, app_id) DO UPDATE SET role = EXCLUDED.role`,
            [req.params.email.toLowerCase(), req.params.appId, role]
        );
        res.json({ success: true, role });
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
    try {
        await pool.query(
            'DELETE FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2',
            [req.params.email.toLowerCase(), req.params.appId]
        );
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
