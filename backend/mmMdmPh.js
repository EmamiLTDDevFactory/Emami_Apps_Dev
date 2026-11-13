/*
   Product hierarchy (embedded-apps/mm-mdm, screen master/hierarchy) -> SAP ZMDM_PH_SRV, READ SIDE ONLY. Mounted at
   /api/me/mm-mdm-ph (rides the existing nginx /api/me rule). The app is a static export; the browser never calls SAP.

     GET /health                         { ok, system }
     GET /levels?level=1..6&parent=&code=&text=&top=   LevelValueSet rows  { level, code, text, prodh, parent }
     GET /cost-centers?text=&kostl=&top=               CostCenterSet rows   { kostl, text }
     GET /requests?initiator=&step=&top=               RequestSet rows
     GET /tasks                                         WorkItemSet rows of the caller

   Every call needs a hub session and an mm-mdm grant (same check as backend/mmMdm.js). Writes (Validate, Approve,
   AssignCostCenter, POST RequestSet) are NOT here: the function-import names and parameters are unconfirmed, because the
   Azure gateway refuses $metadata for every service.

   Env (server .env):  MM_PH_SAP_ODATA_BASE  e.g. https://<azure gateway>/api/NGD/ZMDM_PH_SRV     MM_PH_SAP_CLIENT (optional)
   The gateway signs in itself; the hub user's e-mail goes in X-Emami-User, like the other mm-mdm calls.
*/
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');

const APP_ID = 'mm-mdm';
const env = (k) => (process.env[k] || '').trim();
const base = () => env('MM_PH_SAP_ODATA_BASE').replace(/\/+$/, '');

class SapError extends Error {
    constructor(message, status = 502) { super(message); this.status = status; }
}

const systemOf = () => {
    const m = /\/api\/([A-Z0-9]{3})\//i.exec(`${base()}/`);
    return m ? m[1].toUpperCase() : '';
};

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const clean = (row) => {
    const out = {};
    for (const [k, v] of Object.entries(row || {})) if (k !== '__metadata' && !(v && typeof v === 'object')) out[k] = v;
    return out;
};

/** GET <base>/<set>?$filter=..&$top=.. -> rows. $filter is built from the allowed parts only, never from raw client text. */
async function sapGet(caller, set, filters = [], top = 0) {
    if (!base()) throw new SapError('The SAP connection for the product hierarchy is not configured on the server (MM_PH_SAP_ODATA_BASE).', 503);
    const params = [];
    if (filters.length) params.push(`$filter=${encodeURIComponent(filters.join(' and '))}`);
    if (top > 0) params.push(`$top=${top}`);
    if (env('MM_PH_SAP_CLIENT')) params.push(`sap-client=${encodeURIComponent(env('MM_PH_SAP_CLIENT'))}`);
    let res;
    try {
        res = await fetch(`${base()}/${set}${params.length ? `?${params.join('&')}` : ''}`, {
            headers: { Accept: 'application/json', 'X-Emami-User': caller.user },
            cache: 'no-store',
        });
    } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    const text = await res.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    if (!res.ok) {
        const e = body && body.error;
        const msg = (e && e.message && e.message.value) || `SAP returned HTTP ${res.status} without a message.`;
        throw new SapError(msg, res.status === 400 || res.status === 404 ? res.status : 502);
    }
    return ((body.d && body.d.results) || []).map(clean);
}

const mapLevel = (r) => ({ level: Number(r.Level), code: r.Code, text: r.Text, prodh: r.Prodh, parent: r.Parent });
const mapCostCenter = (r) => ({ kostl: r.Kostl, text: r.Text });
const mapRequest = (r) => ({
    transactionId: r.TransactionId, wiId: r.WiId,
    banner: r.Banner, bannerDesc: r.BannerDesc, brand: r.Brand, brandDesc: r.BrandDesc, product: r.Product, productDesc: r.ProductDesc,
    sku: r.Sku, skuDesc: r.SkuDesc, variant: r.Variant, variantDesc: r.VariantDesc, scheme: r.Scheme, schemeDesc: r.SchemeDesc,
    hierarchy: r.Hierarchy, costCenter: r.CostCenter, costCenterDesc: r.CostCenterDesc, step: r.Step, initiator: r.Initiator,
    createdOn: r.CreatedOn, createdAt: r.CreatedAt, message: r.Message,
});
const mapTask = (r) => ({ wiId: r.WiId, transactionId: r.TransactionId, mode: r.Mode, text: r.Text, status: r.Status, initiator: r.Initiator, createdOn: r.CreatedOn });

const topOf = (v, max = 500) => { const n = parseInt(String(v || ''), 10); return n > 0 ? Math.min(n, max) : 0; };
/** a value that goes into a $filter literal: letters, digits, space, * . - _ & only */
const safe = (v) => /^[A-Za-z0-9 *._&-]{1,40}$/.test(String(v)) ? String(v) : '';

const router = express.Router();

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
        req.caller = { user: email };
        next();
    } catch (e) {
        console.error('[mm-mdm-ph] access check', e.message);
        res.status(500).json({ error: 'Could not verify your access.' });
    }
}
router.use(requireUser);

const handle = (name, fn) => async (req, res) => {
    const t0 = Date.now();
    try {
        const out = await fn(req);
        console.info(`[mm-mdm-ph] ${req.caller.user} ${name} ms=${Date.now() - t0}`);
        res.json(out);
    } catch (e) {
        const known = e instanceof SapError;
        console.error(`[mm-mdm-ph] ${req.caller.user} ${name} failed: ${e.message}`);
        res.status(known ? e.status : 500).json({ error: known ? e.message : 'Unexpected error.' });
    }
};

router.get('/health', handle('health', async (req) => {
    await sapGet(req.caller, 'CostCenterSet', [], 1);
    return { ok: true, system: systemOf() };
}));

router.get('/levels', handle('levels', async (req) => {
    const level = String(req.query.level || '');
    if (!/^[1-6]$/.test(level)) throw new SapError('level must be 1 to 6.', 400);
    const f = [`Level eq ${q(level)}`];
    if (req.query.parent !== undefined && String(req.query.parent) !== '') {
        if (!/^\d{1,18}$/.test(String(req.query.parent))) throw new SapError('parent must be the digits of the levels above.', 400);
        f.push(`Parent eq ${q(req.query.parent)}`);
    }
    if (req.query.code) { const c = safe(req.query.code); if (!c) throw new SapError('code has characters that are not allowed.', 400); f.push(`Code eq ${q(c)}`); }
    if (req.query.text) { const t = safe(req.query.text); if (!t) throw new SapError('text has characters that are not allowed.', 400); f.push(`Text eq ${q(t)}`); }
    return (await sapGet(req.caller, 'LevelValueSet', f, topOf(req.query.top))).map(mapLevel);
}));

router.get('/cost-centers', handle('cost-centers', async (req) => {
    const f = [];
    if (req.query.kostl) { const k = safe(req.query.kostl); if (!k) throw new SapError('kostl has characters that are not allowed.', 400); f.push(`Kostl eq ${q(k)}`); }
    if (req.query.text) { const t = safe(req.query.text); if (!t) throw new SapError('text has characters that are not allowed.', 400); f.push(`Text eq ${q(t)}`); }
    return (await sapGet(req.caller, 'CostCenterSet', f, topOf(req.query.top))).map(mapCostCenter);
}));

router.get('/requests', handle('requests', async (req) => {
    const f = [];
    if (req.query.initiator) { const i = safe(req.query.initiator); if (!i) throw new SapError('initiator has characters that are not allowed.', 400); f.push(`Initiator eq ${q(i)}`); }
    if (req.query.step) { if (!/^[IACD]$/.test(String(req.query.step))) throw new SapError('step must be I, A, C or D.', 400); f.push(`Step eq ${q(req.query.step)}`); }
    return (await sapGet(req.caller, 'RequestSet', f, topOf(req.query.top, 100) || 50)).map(mapRequest);
}));

router.get('/tasks', handle('tasks', async (req) => (await sapGet(req.caller, 'WorkItemSet')).map(mapTask)));

module.exports = router;
module.exports._test = { mapLevel, mapRequest, mapTask, mapCostCenter, safe, clean };
