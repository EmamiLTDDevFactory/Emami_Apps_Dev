require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { pool, testConnection, runMigrations } = require('./db');

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

app.use(cors({ origin: FRONTEND_ORIGINS, methods: ['GET', 'POST', 'OPTIONS'] }));
// 2mb (not the old 10kb) because this now also covers saml-sso.js's metadata upload — a real
// Federation Metadata XML with its signing certificate embedded routinely runs past 10kb, and
// once this global parser has consumed the body, a route-level express.json() can't raise the
// limit again (body-parser skips re-parsing a body it already parsed).
app.use(express.json({ limit: '2mb' }));

const apiRouter = express.Router();
app.use('/api', apiRouter);

apiRouter.use(require('./hub-auth'));
apiRouter.use(require('./saml-sso'));
apiRouter.use(require('./userProfile'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ['User', 'Admin'];

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

/** Manage Access — list every authorized user with active status and their per-app roles. */
apiRouter.get('/access/users', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT au.email,
                   au.is_active,
                   COALESCE(
                       json_agg(json_build_object('appId', a.app_id, 'role', a.role)) FILTER (WHERE a.app_id IS NOT NULL),
                       '[]'
                   ) AS apps
            FROM emami_apps.authorized_users au
            LEFT JOIN emami_apps.authorized_user_apps a ON a.email = au.email
            GROUP BY au.email, au.is_active, au.created_at
            ORDER BY au.created_at ASC
        `);
        res.json({ success: true, users: rows.map((r) => ({ email: r.email, isActive: r.is_active, apps: r.apps })) });
    } catch (err) {
        console.error('[access] Failed to list authorized users:', err.message);
        res.status(500).json({ success: false, error: 'Could not load authorized users.' });
    }
});

/** Grant a brand-new email access to the hub (active by default, no apps granted yet). */
apiRouter.post('/access/users', async (req, res) => {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
    }
    try {
        const { rows } = await pool.query(
            'INSERT INTO emami_apps.authorized_users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING email',
            [email]
        );
        if (rows.length === 0) {
            return res.status(409).json({ success: false, error: 'This email already has access.' });
        }
        res.json({ success: true, email, isActive: true, apps: [] });
    } catch (err) {
        console.error('[access] Failed to add authorized user:', err.message);
        res.status(500).json({ success: false, error: 'Could not add this user.' });
    }
});

/** Revoke a user entirely — cascades to remove all of their app grants too. */
apiRouter.delete('/access/users/:email', async (req, res) => {
    try {
        await pool.query('DELETE FROM emami_apps.authorized_users WHERE email = $1', [req.params.email.toLowerCase()]);
        res.json({ success: true });
    } catch (err) {
        console.error('[access] Failed to remove authorized user:', err.message);
        res.status(500).json({ success: false, error: 'Could not remove this user.' });
    }
});

/** Flip a user active/inactive — inactive users are blocked at login (see hub-auth.js's /auth/db-login) without losing their app grants. */
apiRouter.patch('/access/users/:email/active', async (req, res) => {
    const isActive = !!req.body?.isActive;
    try {
        const { rowCount } = await pool.query(
            'UPDATE emami_apps.authorized_users SET is_active = $1 WHERE email = $2',
            [isActive, req.params.email.toLowerCase()]
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
