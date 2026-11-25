/*
   CAPEX Portal (embedded-apps/capex-portal) -> SAP ZCAPEX_PORTAL_SRV, server side. Mounted at /api/me/capex (rides the
   existing nginx /api/me rule). The app is a static export; these routes are its data layer.

     GET  /health                     { ok, system, user }   (the SAP user the e-mail resolved to: role, plants, admin)
     GET  /odata/<Set>[(key)][/<Nav>]  OData query options pass through ($filter $select $expand $orderby $top $skip $inlinecount)
     POST /fn/<Function>              body = the function's parameters -> its result ({ Success, Message, ... })
     POST /entity/<Set>               body = entity (deep insert allowed)
     PUT  /entity/<Set>(key)          body = changed fields

   Every call needs a hub session (Bearer token) and a CAPEX Portal grant in Manage Access. Who the person is inside SAP
   (role, plants, approver, admin) is decided by SAP from the verified e-mail added here; the browser cannot send it.
   Logs: user, route, timing. Never request bodies or credentials.
*/
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const sap = require('./capexSap');

const APP_ID = 'capex-portal';
const router = express.Router();
// Document uploads arrive as base64 in JSON (DocXferSet); SAP limits a file to DOC_MAX_MB (10), base64 adds a third.
router.use(express.json({ limit: '16mb' }));

function verifiedEmail(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!m || !JWT_SECRET) return '';
    try {
        const p = jwt.verify(m[1].trim(), JWT_SECRET, { algorithms: ['HS256'] });
        return p && !p.purpose ? String(p.email || '').trim().toLowerCase() : '';
    } catch { return ''; }
}

async function requireUser(req, res, next) {
    const email = verifiedEmail(req);
    if (!email) return res.status(401).json({ error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    try {
        const [grant, user] = await Promise.all([
            pool.query('SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [email, APP_ID]),
            pool.query('SELECT is_active FROM emami_apps.authorized_users WHERE email = $1', [email]),
        ]);
        if (!grant.rows.length || user.rows[0]?.is_active === false) return res.status(403).json({ error: 'You do not have access to the CAPEX Portal. Ask an Emami Apps admin for it in Admin Center.' });
        req.email = email;
        req.role = String(grant.rows[0].role || '');
        // Maintenance (users, DOA rules, settings) belongs to whoever is Admin of this app in Emami Apps (Admin Center).
        req.hubAdmin = req.role.trim().toLowerCase() === 'admin';
        next();
    } catch (e) {
        console.error('[capex] access check', e.message);
        res.status(500).json({ error: 'Could not verify your access.' });
    }
}
router.use(requireUser);

const fail = (res, e, what) => {
    const status = e instanceof sap.SapError ? e.status : 500;
    console.error(`[capex] ${what} failed: ${e.message}`);
    res.status(status).json({ error: e.message, code: e.code || undefined });
};

/** "BudgetSet('B-1')/BudgetToCashFlows" -> checks the set name against the live metadata list and a conservative shape. */
const PATH = /^([A-Za-z0-9]+)(\([^()]*\))?(\/[A-Za-z0-9]+)?$/;
function checkedPath(raw) {
    const m = PATH.exec(raw || '');
    if (!m || !sap.SETS.has(m[1])) return '';
    return raw;
}

// Maintenance lists/saves are only for the app's Admins; SAP re-checks the hub's vouching (zcpxadm) as a second gate.
const ADMIN_SETS = new Set(['AdminDataSet']);
const ADMIN_FUNCTIONS = new Set(['AdminSave', 'SetCpeVendorCode', 'ReviseCpeAmount']);
const needAdmin = (req, res) => {
    if (req.hubAdmin) return true;
    res.status(403).json({ error: 'Maintenance is only for CAPEX Portal administrators (Admin role for this app in Emami Apps).' });
    return false;
};

/** What the signed-in person may do here, from the Emami Apps grant (not from SAP). */
router.get('/access', (req, res) => res.json({ role: req.role, isAdmin: req.hubAdmin }));

router.get('/health', async (req, res) => {
    if (!sap.isConfigured()) return res.status(502).json({ ok: false, error: 'The SAP connection for the CAPEX Portal is not configured on the server.' });
    try {
        const { rows } = await sap.read('CurrentUserSet', {}, req.email);
        res.json({ ok: true, system: sap.sapSystem(), user: rows[0] || null });
    } catch (e) {
        res.status(502).json({ ok: false, error: e.message, system: sap.sapSystem() });
    }
});

// Regex routes: valid on Express 4 and 5 (a bare '*' is rejected by Express 5's path-to-regexp).
router.get(/^\/odata\/(.+)$/, async (req, res) => {
    const path = checkedPath(decodeURIComponent(req.params[0] || ''));
    if (!path) return res.status(404).json({ error: 'Unknown entity set.' });
    const admin = ADMIN_SETS.has(path.split('(')[0].split('/')[0]);
    if (admin && !needAdmin(req, res)) return;
    const t0 = Date.now();
    try {
        const out = await sap.read(path, req.query, req.email, admin);
        console.info(`[capex] ${req.email} GET ${path.split('(')[0]} ms=${Date.now() - t0}`);
        res.json(out);
    } catch (e) { fail(res, e, `GET ${path}`); }
});

router.post('/fn/:name', async (req, res) => {
    const name = req.params.name;
    if (!sap.FUNCTIONS[name]) return res.status(404).json({ error: 'Unknown function.' });
    const admin = ADMIN_FUNCTIONS.has(name);
    if (admin && !needAdmin(req, res)) return;
    const t0 = Date.now();
    try {
        const out = await sap.callFunction(name, req.body || {}, req.email, admin);
        console.info(`[capex] ${req.email} ${name} ms=${Date.now() - t0}`);
        res.json(out ?? {});
    } catch (e) { fail(res, e, name); }
});

for (const method of ['post', 'put']) {
    router[method](/^\/entity\/(.+)$/, async (req, res) => {
        const path = checkedPath(decodeURIComponent(req.params[0] || ''));
        if (!path || path.includes('/')) return res.status(404).json({ error: 'Unknown entity set.' });
        if (method === 'post' && path.includes('(')) return res.status(400).json({ error: 'Create goes to the entity set, not an entity.' });
        const t0 = Date.now();
        try {
            const out = await sap.write(method.toUpperCase(), path, req.body || {}, req.email);
            console.info(`[capex] ${req.email} ${method.toUpperCase()} ${path.split('(')[0]} ms=${Date.now() - t0}`);
            res.json(out ?? {});
        } catch (e) { fail(res, e, `${method.toUpperCase()} ${path}`); }
    });
}

module.exports = router;
