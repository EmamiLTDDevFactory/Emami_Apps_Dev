/*
   Cascade Pricing (embedded-apps/cascade-pricing) -> SAP ZMM_CASCADE_SRV, server side. Mounted at /api/me/cascade-pricing
   (rides the existing nginx /api/me rule). The app is a static export, so these routes are its "route handlers":

     GET  /health          { ok: true, count, system } | 502 { ok: false, error, system }   (sapGet('CascadeMapSet'); system NGD / NGQ / NWP)
     GET  /cascade/:set    rows of CascadeMapSet | ApprovalSet | ConditionPendingSet, other sets 404
     POST /action          { action, vfrom?, vto?, payload? } -> { processed, failed, message, data }
                           (sent as ActionRequestSet { Requestid, Action, Validfrom?, Validto?, Payload })

   Every call needs a hub session (Bearer token, same check as the rest of /api/me) and a Cascade Pricing grant in
   Manage Access. SAP's OData property names (Matnr, CascadeDesc, ZiRrpPerPc, LWaerk ...) are returned as the ABAP names
   the app works with (MATNR, CASCADE_DESC, ZI_RRP_PER_PC, L_WAERK ...). Logs: user, action, row counts, timing - never
   payload values or credentials.
*/
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const { sapGet, sapAction, isConfigured, sapSystem } = require('./cascadeSap');

const APP_ID = 'cascade-pricing';
const SETS = new Set(['CascadeMapSet', 'ApprovalSet', 'ConditionPendingSet']);
const ACTIONS = new Set(['SEND_APPROVAL', 'APPROVE', 'APPROVE_SIM', 'REJECT', 'DELETE', 'CREATE_COND', 'RUN_SIM', 'ENRICH_RATES', 'SAVE_RATES', 'COMPARE',
    'REJECT_WITH_REASON', 'GET_PENDING_CORRECTION', 'RESUBMIT', 'GET_NOTIFICATIONS', 'MARK_NOTIF_READ']);
const YMD = /^\d{8}$/;

const router = express.Router();

/** OData name -> ABAP name: CascadeDesc -> CASCADE_DESC, SLand1 -> S_LAND1, ZpttEAp -> ZPTT_E_AP. ABAP names pass through. */
function abapName(k) {
    if (k === k.toUpperCase()) return k;
    return k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toUpperCase();
}
/*
   Until SAP returns one format everywhere (see the SAP error report, issues 4 and 5), rows coming back are aligned to
   what the app sends: dates as YYYYMMDD (SAP returns "2026-11-01" in DATA and "/Date(ms)/" for Edm.DateTime) and
   all-digit KUNNR / MATNR with leading zeros (SAP returns "510012" / "400003658"). Applying it twice changes nothing.
*/
const DATE_KEYS = new Set(['VFROM', 'VTO', 'VALIDFROM', 'VALIDTO', 'ZSUB_DATE', 'PDATE']);
const PAD = { KUNNR: 10, MATNR: 18 };

function ymd(v) {
    if (typeof v !== 'string') return v;
    const s = v.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(s);
    if (m) return `${m[1]}${m[2]}${m[3]}`;
    m = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(s);
    if (m) {
        const d = new Date(Number(m[1]));
        return Number.isNaN(d.getTime()) ? v : `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    return v;
}

function alignValues(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const out = { ...row };
    for (const k of Object.keys(out)) {
        if (DATE_KEYS.has(k)) out[k] = ymd(out[k]);
        else if (PAD[k] && typeof out[k] === 'string' && /^\d+$/.test(out[k].trim())) out[k] = out[k].trim().padStart(PAD[k], '0');
    }
    return out;
}

function toAbapRow(r) {
    const out = {};
    for (const [k, v] of Object.entries(r || {})) {
        if (k === '__metadata' || (v && typeof v === 'object' && v.__deferred)) continue;
        out[abapName(k)] = v;
    }
    return alignValues(out);
}

/** The action's DATA as a string, with any rows in it aligned the same way. */
function alignData(data) {
    if (data === undefined || data === null || data === '') return '';
    let v = data;
    if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch { return data; }
    }
    if (Array.isArray(v)) return JSON.stringify(v.map(alignValues));
    return typeof data === 'string' ? data : JSON.stringify(data);
}

/**
 * The ActionRequest entity as ZMM_CASCADE_SRV_SRV on NGD defines it (checked 24.10.2026): Requestid, Action, Payload
 * (JSON string), Validfrom / Validto as Edm.DateTime - "YYYY-MM-DDT00:00:00", left out when blank (SAP rejects null and
 * ""). Result comes back as a JSON string.
 */
function actionRequest(action, vfrom, vto, payload) {
    const dt = (v) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00`;
    return {
        Requestid: crypto.randomUUID(),
        Action: action,
        ...(vfrom ? { Validfrom: dt(vfrom) } : {}),
        ...(vto ? { Validto: dt(vto) } : {}),
        Payload: JSON.stringify(payload ?? {}),
    };
}

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
        if (!grant.rows.length || user.rows[0]?.is_active === false) return res.status(403).json({ error: 'You do not have access to Cascade Pricing. Ask an Emami Apps admin for it in Admin Center.' });
        req.email = email;
        next();
    } catch (e) {
        console.error('[cascade-pricing] access check', e.message);
        res.status(500).json({ error: 'Could not verify your access.' });
    }
}

router.use(requireUser);

router.get('/health', async (req, res) => {
    if (!isConfigured()) return res.status(502).json({ ok: false, error: 'The SAP connection for Cascade Pricing is not configured on the server.' });
    try {
        const rows = await sapGet('CascadeMapSet');
        res.json({ ok: true, count: rows.length, system: sapSystem() });
    } catch (e) {
        res.status(502).json({ ok: false, error: e.message, system: sapSystem() });
    }
});

router.get('/cascade/:set', async (req, res) => {
    const set = String(req.params.set || '');
    if (!SETS.has(set)) return res.status(404).json({ error: `Unknown entity set "${set}".` });
    const t0 = Date.now();
    try {
        const rows = (await sapGet(set)).map(toAbapRow);
        console.info(`[cascade-pricing] ${req.email} GET ${set} rows=${rows.length} ms=${Date.now() - t0}`);
        res.json(rows);
    } catch (e) {
        console.error(`[cascade-pricing] ${req.email} GET ${set} failed: ${e.message}`);
        res.status(502).json({ error: e.message });
    }
});

router.post('/action', async (req, res) => {
    const { action, vfrom, vto, payload } = req.body || {};
    if (!ACTIONS.has(action)) return res.status(400).json({ error: `Unknown action "${action}".` });
    for (const [name, v] of [['Valid From', vfrom], ['Valid To', vto]]) {
        if (v !== undefined && v !== null && v !== '' && !(typeof v === 'string' && YMD.test(v))) return res.status(400).json({ error: `${name} must be a date in YYYYMMDD format.` });
    }
    if (payload !== undefined && (payload === null || typeof payload !== 'object' || Array.isArray(payload))) return res.status(400).json({ error: 'payload must be an object.' });
    const body = actionRequest(action, vfrom, vto, payload);
    const rows = Array.isArray(payload?.ROWS) ? payload.ROWS.length : Array.isArray(payload?.RATE_ROWS) ? payload.RATE_ROWS.length : 0;
    const t0 = Date.now();
    try {
        const r = await sapAction(body);
        const data = r?.DATA;
        const out = {
            processed: Number(r?.PROCESSED ?? 0) || 0,
            failed: Number(r?.FAILED ?? 0) || 0,
            message: String(r?.MESSAGE ?? ''),
            data: alignData(data),
        };
        console.info(`[cascade-pricing] ${req.email} ${action} rows=${rows} processed=${out.processed} failed=${out.failed} ms=${Date.now() - t0} id=${body.Requestid}`);
        res.json(out);
    } catch (e) {
        console.error(`[cascade-pricing] ${req.email} ${action} rows=${rows} failed: ${e.message} id=${body.Requestid}`);
        res.status(502).json({ error: e.message });
    }
});

module.exports = router;
module.exports.abapName = abapName;
module.exports.toAbapRow = toAbapRow;
module.exports.actionRequest = actionRequest;
module.exports.alignValues = alignValues;
module.exports.alignData = alignData;
