/*
   MDM admin screens of the Material master app: rules maintenance (/INOWITS/MDM_CONFIG), workflow maintenance (/INOWITS/MDM_ROLE_MAIN),
   workflow visibility (/INOWITS/UWL) and the dashboard (/INOWITS/MDM_DB). Mounted at /api/me/mm-mdm-admin.

     POST /:area/:op     body = JSON payload of the operation      -> JSON result of SAP class ZCL_MM_MDM_ADM_<AREA>=>RUN
        area: WF | RULES | UWL | DASH

   One SAP entity (AdminCallSet) carries every call (Area, Op, Actor, Payload JSON in, Result JSON out); the work is done by the SAP area
   classes. The gateway runs as a technical user, so authorization lives here: a Material master grant (Manage Access) is needed for
   everything, the grant role "Admin" for rules and workflow maintenance and for the all-users views. The hub overwrites `actor`
   (verified e-mail) and `isAdmin` in the payload: the browser cannot set them. Logs: user, area, op, timing - never the payload.
*/
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const sap = require('./mmMdmSap');

const APP_ID = 'mm-mdm';
const router = express.Router();

const AREAS = ['WF', 'RULES', 'UWL', 'DASH'];
/** Areas whose every operation needs the Admin grant; UWL and DASH show the caller's own requests to everyone else (SAP decides by isAdmin). */
const ADMIN_ONLY = new Set(['WF', 'RULES']);

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
        if (!grant.rows.length || (user.rows[0] && user.rows[0].is_active === false)) return res.status(403).json({ error: 'You do not have access to Material master. Ask an Emami Apps admin for it in Admin Center.' });
        req.caller = { user: email, isAdmin: String(grant.rows[0].role || '').toLowerCase() === 'admin' };
        next();
    } catch (e) {
        console.error('[mm-mdm-admin] access check', e.message);
        res.status(500).json({ error: 'Could not verify your access.' });
    }
}

/** Calls one operation of an SAP area class. Throws SapError (with SAP's messages) when SAP answers ok:false. */
async function call(caller, area, op, payload) {
    const body = { ...(payload && typeof payload === 'object' ? payload : {}), actor: caller.user, isAdmin: !!caller.isAdmin };
    const made = await sap.odata.post(caller, 'AdminCallSet', { Area: area, Op: op, Actor: caller.user, Payload: JSON.stringify(body) });
    const raw = String(((made && made.d) || {}).Result || '');
    let out;
    try { out = JSON.parse(raw); } catch { throw new sap.SapError('SAP answered with something that is not JSON.', 502); }
    if (out && out.ok === false) {
        const msgs = (out.messages || []).map((m) => ({ code: String(m.code || ''), message: String(m.message || ''), severity: String(m.severity || 'E'), target: String(m.target || '') }));
        throw new sap.SapError(msgs.map((m) => m.message).join(' ') || 'SAP refused the request.', 400, msgs);
    }
    return out && out.data !== undefined ? out.data : out;
}

router.use(requireUser);
router.use(express.json({ limit: '6mb' }));

router.get('/session', (req, res) => res.json({ user: req.caller.user, isAdmin: req.caller.isAdmin, areas: AREAS.filter((a) => req.caller.isAdmin || !ADMIN_ONLY.has(a)) }));

router.post('/:area/:op', async (req, res) => {
    const t0 = Date.now();
    const area = String(req.params.area || '').toUpperCase();
    const op = String(req.params.op || '');
    if (!AREAS.includes(area) || !/^[A-Za-z0-9_]{1,40}$/.test(op)) return res.status(404).json({ error: 'Unknown operation.' });
    if (ADMIN_ONLY.has(area) && !req.caller.isAdmin) return res.status(403).json({ error: 'This needs the Admin role of Material master in Admin Center.' });
    try {
        const out = await call(req.caller, area, op, req.body);
        console.info(`[mm-mdm-admin] ${req.caller.user} ${area}/${op} ms=${Date.now() - t0}`);
        res.json(out === undefined ? { ok: true } : out);
    } catch (e) {
        const status = e instanceof sap.SapError ? e.status : 500;
        console.error(`[mm-mdm-admin] ${req.caller.user} ${area}/${op} failed: ${e.message}`);
        res.status(status).json({ error: status === 500 && !(e instanceof sap.SapError) ? 'Unexpected error.' : e.message, messages: e.messages || [] });
    }
});

module.exports = router;
module.exports._test = { call, AREAS, ADMIN_ONLY };
