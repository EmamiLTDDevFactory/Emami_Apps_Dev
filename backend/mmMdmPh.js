/*
   Product hierarchy (embedded-apps/mm-mdm, screen master/hierarchy) -> SAP ZMDM_PH_SRV, READ SIDE ONLY. Mounted at
   /api/me/mm-mdm-ph (rides the existing nginx /api/me rule). The app is a static export; the browser never calls SAP.

     GET /health                         { ok, system }
     GET /levels?level=1..6&parent=&code=&text=&top=   LevelValueSet rows  { level, code, text, prodh, parent }
     GET /cost-centers?text=&kostl=&top=               CostCenterSet rows   { kostl, text }
     GET /requests?initiator=&step=&top=               RequestSet rows
     GET /tasks                                         WorkItemSet rows of the caller

   CRS product grouping (ZCRS_PRODUCT_GROUP replacement), same service ZMDM_PH_SRV:
     GET  /crs/verticals                              CrsVerticalSet rows  { code, text }
     GET  /crs/values?level=1..3&prod=&group=&text=   CrsValueSet rows     { level, code, text, crsProd, prdGrp, skuSize, unit }
     GET  /crs/requests?initiator=&top=               CrsRequestSet rows
     GET  /crs/tasks                                  CrsWorkItemSet rows of the caller
     POST /crs/validate  {mode, ...fields}            CrsValidate  -> { ok, message } or 400 with every message
     POST /crs/requests  {...fields, flName, flType, flData(base64)}   initiate (starts the workflow)
     POST /crs/approve   {wiId, skuSize, unit, comments}               approver: generates the codes and writes the master rows
     POST /crs/reject    {wiId}
   NOTE (identity): SAP runs the workflow as SY-UNAME. Through the gateway that is the gateway's technical user, not the hub
   user, so initiate shows the technical user as initiator and approve/reject only work if that user holds the work item.
   Needs the gateway to map X-Emami-User (or a trusted RFC user) to the SAP user before this is used for real approvals.

   Product hierarchy writes (same service, same identity note as above):
     POST /ph/validate {mode, banner, bannerDesc, brand, ... scheme, schemeDesc}   Validate -> { ok, message }
     POST /ph/requests {banner ... schemeDesc}                                     initiate (POST RequestSet)
     POST /ph/approve  {wiId, banner ... schemeDesc}                               approver: fills blank codes, writes T179/T179T
     POST /ph/assign-cost-center {wiId, costCenter}   POST /ph/reject {wiId}   POST /ph/send-back {wiId}

   Every call needs a hub session and an mm-mdm grant (same check as backend/mmMdm.js).

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


/* ---------------- CRS product grouping ---------------- */

const text = (v, max) => String(v == null ? '' : v).slice(0, max);
/** values that go into a function-import parameter: printable text, no control characters */
const param = (v, max) => { const t = text(v, max); if (/[\u0000-\u001f]/.test(t)) throw new SapError('A field has characters that are not allowed.', 400); return t; };

const mapCrsValue = (r) => ({ level: Number(r.Level), code: r.Code, text: r.Text, crsProd: r.CrsProd, prdGrp: r.PrdGrp, skuSize: r.SkuSize, unit: r.Unit });
const mapCrsRequest = (r) => ({
    transactionId: r.TransactionId, wiId: r.WiId,
    crsProd: r.CrsProd, crsProdDesc: r.CrsProdDesc, prdGrp: r.PrdGrp, prdGrpDesc: r.PrdGrpDesc, skuGrp: r.SkuGrp, skuGrpDesc: r.SkuGrpDesc,
    busVert: r.BusVert, skuSize: r.SkuSize, unit: r.Unit, comments: r.Comments, flName: r.FlName, flType: r.FlType,
    step: r.Step, initiator: r.Initiator, createdOn: r.CreatedOn, createdAt: r.CreatedAt, message: r.Message,
});
const mapCrsTask = (r) => ({ wiId: r.WiId, transactionId: r.TransactionId, mode: r.Mode, text: r.Text, status: r.Status, initiator: r.Initiator, createdOn: r.CreatedOn });

const CRS_PARAMS = [['CrsProd', 'crsProd', 10], ['CrsProdDesc', 'crsProdDesc', 40], ['PrdGrp', 'prdGrp', 3], ['PrdGrpDesc', 'prdGrpDesc', 40],
    ['SkuGrp', 'skuGrp', 3], ['SkuGrpDesc', 'skuGrpDesc', 40], ['BusVert', 'busVert', 2], ['SkuSize', 'skuSize', 20], ['Unit', 'unit', 3], ['Comments', 'comments', 255]];

/** POST to the gateway with a CSRF token. `path` is relative to the service root; `json` is an entity body or null. */
async function sapPost(caller, path, json = null) {
    if (!base()) throw new SapError('The SAP connection for the product hierarchy is not configured on the server (MM_PH_SAP_ODATA_BASE).', 503);
    const client = env('MM_PH_SAP_CLIENT') ? `${path.includes('?') ? '&' : '?'}sap-client=${encodeURIComponent(env('MM_PH_SAP_CLIENT'))}` : '';
    const common = { 'X-Emami-User': caller.user, Accept: 'application/json' };
    let res;
    try {
        const tok = await fetch(`${base()}/${env('MM_PH_SAP_CLIENT') ? `?sap-client=${encodeURIComponent(env('MM_PH_SAP_CLIENT'))}` : ''}`, { headers: { ...common, 'X-CSRF-Token': 'Fetch' }, cache: 'no-store' });
        const token = tok.headers.get('x-csrf-token') || '';
        const cookie = (tok.headers.getSetCookie ? tok.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
        const headers = { ...common, 'X-CSRF-Token': token };
        if (cookie) headers.Cookie = cookie;
        if (json) headers['Content-Type'] = 'application/json';
        // The Azure proxy drops the query string of a POST (SAP then answers an empty 404): send it as an encoded path, "Name%3F<query>"
        let target = `${path}${client}`;
        const qi = target.indexOf('?');
        if (qi >= 0) target = `${target.slice(0, qi)}%3F${encodeURIComponent(target.slice(qi + 1))}`;
        res = await fetch(`${base()}/${target}`, { method: 'POST', headers, body: json ? JSON.stringify(json) : undefined, cache: 'no-store' });
    } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    const raw = await res.text();
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* not JSON */ }
    if (!res.ok) {
        const e = body && body.error;
        const details = ((e && e.innererror && e.innererror.errordetails) || []).map((d) => d.message).filter(Boolean);
        const msg = details.length ? details.join('\n') : (e && e.message && e.message.value) || `SAP returned HTTP ${res.status} without a message.`;
        throw new SapError(msg, res.status === 400 || res.status === 404 ? res.status : 502);
    }
    return body.d ? clean(body.d) : {};
}

const crsFnPath = (name, fields) => `${name}?${Object.entries(fields).map(([k, v]) => `${k}='${encodeURIComponent(String(v).replace(/'/g, "''"))}'`).join('&')}`;
const crsFields = (b) => Object.fromEntries(CRS_PARAMS.map(([sap, key, max]) => [sap, param(b[key], max)]));

router.get('/crs/verticals', handle('crs-verticals', async (req) =>
    (await sapGet(req.caller, 'CrsVerticalSet')).map((r) => ({ code: r.Code, text: r.Text }))));

router.get('/crs/values', handle('crs-values', async (req) => {
    const level = String(req.query.level || '');
    if (!/^[1-3]$/.test(level)) throw new SapError('level must be 1 to 3.', 400);
    const f = [`Level eq ${q(level)}`];
    if (level !== '1') {
        if (!/^\d{1,10}$/.test(String(req.query.prod || ''))) throw new SapError('prod (the CRS product) is required for level 2 and 3.', 400);
        f.push(`CrsProd eq ${q(req.query.prod)}`);
    }
    if (level === '3') {
        if (!/^[0-9A-Za-z]{1,3}$/.test(String(req.query.group || ''))) throw new SapError('group (the CRS group) is required for level 3.', 400);
        f.push(`PrdGrp eq ${q(req.query.group)}`);
    }
    if (req.query.text) { const t = safe(req.query.text); if (!t) throw new SapError('text has characters that are not allowed.', 400); f.push(`Text eq ${q(t)}`); }
    return (await sapGet(req.caller, 'CrsValueSet', f, topOf(req.query.top, 1000))).map(mapCrsValue);
}));

router.get('/crs/requests', handle('crs-requests', async (req) => {
    const f = [];
    if (req.query.initiator) { const i = safe(req.query.initiator); if (!i) throw new SapError('initiator has characters that are not allowed.', 400); f.push(`Initiator eq ${q(i)}`); }
    return (await sapGet(req.caller, 'CrsRequestSet', f, topOf(req.query.top, 100) || 50)).map(mapCrsRequest);
}));

router.get('/crs/tasks', handle('crs-tasks', async (req) => (await sapGet(req.caller, 'CrsWorkItemSet')).map(mapCrsTask)));

router.post('/crs/validate', handle('crs-validate', async (req) => {
    const b = req.body || {};
    const mode = b.mode === 'A' ? 'A' : 'I';
    const r = await sapPost(req.caller, crsFnPath('CrsValidate', { Mode: mode, ...crsFields(b) }));
    return { ok: true, message: r.Message || 'Valid', request: mapCrsRequest(r) };
}));

router.post('/crs/requests', handle('crs-initiate', async (req) => {
    const b = req.body || {};
    const data = String(b.flData || '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new SapError('Attach the supporting document (flData must be base64).', 400);
    const body = {
        CrsProd: param(b.crsProd, 10), CrsProdDesc: param(b.crsProdDesc, 40), PrdGrp: param(b.prdGrp, 3), PrdGrpDesc: param(b.prdGrpDesc, 40),
        SkuGrp: param(b.skuGrp, 3), SkuGrpDesc: param(b.skuGrpDesc, 40), BusVert: param(b.busVert, 2), SkuSize: param(b.skuSize, 20),
        Unit: param(b.unit, 3), Comments: param(b.comments, 255), FlName: param(b.flName, 128), FlType: param(b.flType, 128), FlData: data,
    };
    return mapCrsRequest(await sapPost(req.caller, 'CrsRequestSet', body));
}));

router.post('/crs/approve', handle('crs-approve', async (req) => {
    const b = req.body || {};
    if (!/^\d{1,12}$/.test(String(b.wiId || ''))) throw new SapError('wiId is required.', 400);
    return mapCrsRequest(await sapPost(req.caller, crsFnPath('CrsApprove', {
        WiId: String(b.wiId), SkuSize: param(b.skuSize, 20), Unit: param(b.unit, 3), Comments: param(b.comments, 255) })));
}));

router.post('/crs/reject', handle('crs-reject', async (req) => {
    const b = req.body || {};
    if (!/^\d{1,12}$/.test(String(b.wiId || ''))) throw new SapError('wiId is required.', 400);
    return mapCrsRequest(await sapPost(req.caller, crsFnPath('CrsReject', { WiId: String(b.wiId) })));
}));


/* ---------------- Product hierarchy writes ---------------- */

const PH_PARAMS = [['Banner', 'banner', 2], ['BannerDesc', 'bannerDesc', 40], ['Brand', 'brand', 4], ['BrandDesc', 'brandDesc', 40],
    ['Product', 'product', 4], ['ProductDesc', 'productDesc', 40], ['Sku', 'sku', 3], ['SkuDesc', 'skuDesc', 40],
    ['Variant', 'variant', 3], ['VariantDesc', 'variantDesc', 40], ['Scheme', 'scheme', 2], ['SchemeDesc', 'schemeDesc', 40]];
const phFields = (b) => Object.fromEntries(PH_PARAMS.map(([sap, key, max]) => [sap, param(b[key], max)]));
const wiOf = (b) => { if (!/^\d{1,12}$/.test(String(b.wiId || ''))) throw new SapError('wiId is required.', 400); return String(b.wiId); };

router.post('/ph/validate', handle('ph-validate', async (req) => {
    const b = req.body || {};
    const mode = ['I', 'A', 'C'].includes(b.mode) ? b.mode : 'I';
    const r = await sapPost(req.caller, crsFnPath('Validate', { Mode: mode, ...phFields(b) }));
    return { ok: true, message: r.Message || 'Valid', request: mapRequest(r) };
}));

router.post('/ph/requests', handle('ph-initiate', async (req) => mapRequest(await sapPost(req.caller, 'RequestSet', phFields(req.body || {})))));

router.post('/ph/approve', handle('ph-approve', async (req) => {
    const b = req.body || {};
    return mapRequest(await sapPost(req.caller, crsFnPath('Approve', { WiId: wiOf(b), ...phFields(b) })));
}));

router.post('/ph/assign-cost-center', handle('ph-cost-center', async (req) => {
    const b = req.body || {};
    const cc = param(b.costCenter, 10);
    if (!cc) throw new SapError('costCenter is required.', 400);
    return mapRequest(await sapPost(req.caller, crsFnPath('AssignCostCenter', { WiId: wiOf(b), CostCenter: cc })));
}));

router.post('/ph/reject', handle('ph-reject', async (req) => mapRequest(await sapPost(req.caller, crsFnPath('RejectRequest', { WiId: wiOf(req.body || {}) })))));
router.post('/ph/send-back', handle('ph-send-back', async (req) => mapRequest(await sapPost(req.caller, crsFnPath('SendBackRequest', { WiId: wiOf(req.body || {}) })))));

module.exports = router;
module.exports._test = { mapLevel, mapRequest, mapTask, mapCostCenter, safe, clean, mapCrsValue, mapCrsRequest, mapCrsTask, crsFnPath, crsFields, param, phFields };
