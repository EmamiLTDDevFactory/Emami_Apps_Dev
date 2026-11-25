/*
   Order to Cash (embedded-apps/order-to-cash): customer PO -> validated sales order -> delivery, appointment, ASN, GRN
   -> invoice, cash application, deductions and disputes. Mounted at /api/me/order-to-cash (rides the nginx /api/me rule).
   The app is a static export, so these routes are its server. SAP is reached only from here (orderToCashSap.js ->
   RFC Z_SD_O2C_ACTION over SOAP-RFC; ABAP in embedded-apps/order-to-cash/abap). The pure rules are in orderToCashCore.js.

     GET  /health                    { ok, system, user } | 502       (SAP action PING)
     GET  /me                        { role, canWrite, isAdmin }
     POST /extract                   { fileName, text } | { fileName, imageDataUrl } -> { header, lines, warnings }   (AI reads the PO; nothing saved)
     GET  /pos?status=               captured POs (newest first, 500 max)
     POST /pos                       save a captured PO               { source, fileName, header, lines, warnings }
     GET  /pos/:id                   one PO with its lines
     PUT  /pos/:id                   edit header / lines             { version, header, lines }  (409 on a stale version)
     POST /pos/:id/reject            { reason }
     POST /pos/:id/validate          { autoAmend?, priceTolPct? }    SAP VALIDATE_PO -> checks, exceptions, amendments
     POST /pos/:id/sales-order       { testrun }                      SAP CREATE_SO (testrun = simulate only)
     GET  /pos/:id/events            audit trail of the PO
     GET  /stats                     counts for the overview
     POST /sap/:action               SAP reads (LIST_*, *_SEARCH, *_ITEMS) and CREATE_DELIVERY     { ...filters }
     GET  /appointments  POST /appointments           delivery appointments (app side)
     GET  /flags?kind=   POST /flags                  ASN sent / invoice delivered markers (app side)
     GET  /disputes      POST /disputes   PUT /disputes/:id

   Access: hub session + an Order to Cash grant in Manage Access. Role "Viewer" reads only; every other role writes.
   SO creation and delivery creation are the only SAP writes; cash application is a proposal (exported), never posted.
   Logs: user, action, ids, counts, timing - never document text, prices or credentials.
   Env: O2C_SAP_BASE / O2C_SAP_CLIENT / O2C_SAP_USER / O2C_SAP_PASSWORD / O2C_SAP_TLS_VERIFY (see orderToCashSap.js), GROQ_API_KEY,
        O2C_AI_MODEL (default llama-3.3-70b-versatile), O2C_AI_VISION_MODEL (default meta-llama/llama-4-scout-17b-16e-instruct).
*/
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const sap = require('./orderToCashSap');
const core = require('./orderToCashCore');

const APP_ID = 'order-to-cash';
const S = 'order_to_cash';
const AI_BASE = (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const AI_MODEL = process.env.O2C_AI_MODEL || 'llama-3.3-70b-versatile';
const AI_VISION = process.env.O2C_AI_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const AI_PER_MIN = Number(process.env.O2C_AI_RATE_PER_MIN || 10);
const MAX_TEXT = 60000;
const MAX_IMAGE = 4 * 1024 * 1024;

const READS = new Set(['CUSTOMER_SEARCH', 'MATERIAL_SEARCH', 'LIST_ORDERS', 'LIST_BACKORDERS', 'LIST_DELIVERIES', 'DELIVERY_ITEMS', 'LIST_INVOICES', 'INVOICE_ITEMS', 'LIST_OPEN_ITEMS', 'LIST_DEDUCTIONS', 'DOC_FLOW']);
const WRITES = new Set(['CREATE_DELIVERY']);
const PO_STATUS = new Set(['captured', 'exceptions', 'ready', 'creating', 'so_created', 'so_unknown', 'rejected']);
const DISPUTE_STATUS = new Set(['open', 'in_progress', 'waiting_customer', 'resolved', 'written_off']);
const FLAG_KINDS = new Set(['asn', 'invoice_sent']);

const router = express.Router();

// ---------- access ----------
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
        if (!grant.rows.length || user.rows[0]?.is_active === false) return res.status(403).json({ error: 'You do not have access to Order to Cash. Ask an Emami Apps admin for it in Admin Center.' });
        req.email = email;
        req.role = String(grant.rows[0].role || '');
        req.isAdmin = req.role.toLowerCase() === 'admin';
        req.canWrite = req.role.toLowerCase() !== 'viewer';
        next();
    } catch (e) {
        console.error('[order-to-cash] access check', e.message);
        res.status(500).json({ error: 'Could not verify your access.' });
    }
}
const writer = (req, res, next) => (req.canWrite ? next() : res.status(403).json({ error: 'Your Order to Cash role is Viewer: you can look, not change.' }));

// ---------- schema (created on first use) ----------
let ready = null;
function ensureSchema() {
    if (!ready) {
        ready = (async () => {
            await pool.query(`CREATE SCHEMA IF NOT EXISTS ${S}`);
            await pool.query(`CREATE TABLE IF NOT EXISTS ${S}.po (
                id bigserial PRIMARY KEY, status text NOT NULL DEFAULT 'captured', source text, file_name text,
                header jsonb NOT NULL DEFAULT '{}', lines jsonb NOT NULL DEFAULT '[]', warnings jsonb NOT NULL DEFAULT '[]',
                amendments jsonb NOT NULL DEFAULT '[]', open_exceptions int NOT NULL DEFAULT 0, touched boolean NOT NULL DEFAULT false,
                so_number text, so_result jsonb, request_id text, version int NOT NULL DEFAULT 1,
                created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), validated_at timestamptz)`);
            await pool.query(`CREATE INDEX IF NOT EXISTS po_status_idx ON ${S}.po (status, created_at DESC)`);
            await pool.query(`CREATE TABLE IF NOT EXISTS ${S}.event (id bigserial PRIMARY KEY, po_id bigint, at timestamptz NOT NULL DEFAULT now(), actor text, action text NOT NULL, detail jsonb)`);
            await pool.query(`CREATE INDEX IF NOT EXISTS event_po_idx ON ${S}.event (po_id, at)`);
            await pool.query(`CREATE TABLE IF NOT EXISTS ${S}.appointment (delivery text PRIMARY KEY, kunnr text, name1 text, slot_date text, slot_time text, location text, reference text, status text NOT NULL DEFAULT 'requested', note text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`);
            await pool.query(`CREATE TABLE IF NOT EXISTS ${S}.flag (kind text NOT NULL, ref text NOT NULL, data jsonb, by_user text, at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (kind, ref))`);
            await pool.query(`CREATE TABLE IF NOT EXISTS ${S}.dispute (
                id bigserial PRIMARY KEY, ref_type text, ref_no text, kunnr text, name1 text, amount numeric, reason text, status text NOT NULL DEFAULT 'open',
                owner text, notes jsonb NOT NULL DEFAULT '[]', created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
        })().catch((e) => { ready = null; throw e; });
    }
    return ready;
}

async function audit(poId, actor, action, detail) {
    try { await pool.query(`INSERT INTO ${S}.event (po_id, actor, action, detail) VALUES ($1,$2,$3,$4)`, [poId, actor, action, JSON.stringify(detail || {})]); }
    catch (e) { console.error('[order-to-cash] audit', e.message); }
}

const ymdToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, ''); // IST

/** One SAP action: { Requestid, Action, Payload } -> parsed Result. */
async function callSap(action, payload) {
    return sap.sapAction({ Requestid: (payload && payload.REQUEST_ID) || crypto.randomUUID(), Action: action, Payload: JSON.stringify(payload || {}) });
}

const wrap = (fn) => async (req, res) => {
    const t0 = Date.now();
    try {
        await ensureSchema();
        await fn(req, res);
    } catch (e) {
        const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
        console.error(`[order-to-cash] ${req.email} ${req.method} ${req.path} failed (${status}) ms=${Date.now() - t0}: ${e.message}`);
        if (!res.headersSent) res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : e.message });
    }
};
const fail = (status, message) => Object.assign(new Error(message), { status });

router.use(requireUser);

// ---------- health / me ----------
router.get('/health', async (req, res) => {
    if (!sap.isConfigured()) return res.status(502).json({ ok: false, error: 'The SAP connection for Order to Cash is not configured on the server (O2C_SAP_BASE / O2C_SAP_USER).', system: '' });
    try {
        const r = await callSap('PING', {});
        res.json({ ok: true, system: sap.sapSystem() || String(r?.SYSTEM || ''), user: String(r?.USER || '') });
    } catch (e) {
        res.status(502).json({ ok: false, error: e.message, system: sap.sapSystem() });
    }
});
router.get('/me', (req, res) => res.json({ role: req.role, isAdmin: req.isAdmin, canWrite: req.canWrite, email: req.email }));

// ---------- AI reading of the PO ----------
const aiCalls = new Map();
function aiLimited(email, now = Date.now()) {
    const recent = (aiCalls.get(email) || []).filter((t) => now - t < 60000);
    if (recent.length >= AI_PER_MIN) { aiCalls.set(email, recent); return true; }
    recent.push(now);
    aiCalls.set(email, recent);
    return false;
}

async function aiExtract({ text, imageDataUrl }) {
    const key = (process.env.GROQ_API_KEY || '').trim();
    if (!key) throw fail(503, 'PO reading is not set up on the server (GROQ_API_KEY). Enter the PO lines by hand or upload an Excel PO.');
    const user = imageDataUrl
        ? [{ type: 'text', text: 'Read this purchase order image. <<<DOCUMENT>>> is the image. <<<END>>>' }, { type: 'image_url', image_url: { url: imageDataUrl } }]
        : `<<<DOCUMENT>>>\n${text}\n<<<END>>>`;
    let res;
    try {
        res = await fetch(`${AI_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model: imageDataUrl ? AI_VISION : AI_MODEL, temperature: 0, max_tokens: 8000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: core.EXTRACTION_PROMPT }, { role: 'user', content: user }] }),
            signal: AbortSignal.timeout(90000),
        });
    } catch (e) {
        throw fail(502, `The PO reading service did not answer: ${e.message}`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw fail(502, `The PO reading service refused the document: ${body?.error?.message || res.status}`);
    const content = body?.choices?.[0]?.message?.content || '';
    try { return { json: JSON.parse(content), model: body?.model, tokens: body?.usage?.total_tokens }; }
    catch { throw fail(502, 'The PO reading service did not return a readable result. Try again or upload the Excel version.'); }
}

router.post('/extract', writer, wrap(async (req, res) => {
    const { fileName, text, imageDataUrl } = req.body || {};
    if (aiLimited(req.email)) throw fail(429, `Too many POs read in the last minute (limit ${AI_PER_MIN}). Wait a moment.`);
    if (imageDataUrl !== undefined) {
        if (typeof imageDataUrl !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(imageDataUrl)) throw fail(400, 'The image must be PNG, JPG or WEBP.');
        if (imageDataUrl.length > MAX_IMAGE * 1.37) throw fail(413, 'The image is larger than 4 MB.');
    } else if (typeof text !== 'string' || text.trim().length < 20) {
        throw fail(400, 'There is no readable text in this document. If it is a scanned PDF, upload a photo / image of it instead.');
    }
    const t0 = Date.now();
    const r = await aiExtract({ text: typeof text === 'string' ? text.slice(0, MAX_TEXT) : '', imageDataUrl });
    const out = core.normalizeExtraction(r.json);
    if (typeof text === 'string' && text.length > MAX_TEXT) out.warnings.unshift('The document is long; only its first part was read. Check that every line is there.');
    console.info(`[order-to-cash] ${req.email} extract file="${String(fileName || '').slice(0, 60)}" lines=${out.lines.length} model=${r.model} tokens=${r.tokens} ms=${Date.now() - t0}`);
    res.json({ ...out, ai: { model: r.model } });
}));

// ---------- POs ----------
const poRow = (r, withLines = true) => ({
    id: Number(r.id), status: r.status, source: r.source, fileName: r.file_name, header: r.header, ...(withLines ? { lines: r.lines } : { lineCount: Array.isArray(r.lines) ? r.lines.filter((l) => !l.DROPPED).length : 0 }),
    warnings: r.warnings, amendments: r.amendments, openExceptions: r.open_exceptions, touched: r.touched, soNumber: r.so_number, soResult: r.so_result, version: r.version,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, validatedAt: r.validated_at,
});

function cleanHeader(h) {
    const s = (v, n) => (v === undefined || v === null ? '' : String(v).trim().slice(0, n));
    const src = h && typeof h === 'object' ? h : {};
    const out = {};
    for (const [k, n] of Object.entries({ CUSTOMER_NAME: 80, NAME1: 80, KUNNR: 10, KUNWE: 10, BSTKD: 35, PO_DATE: 8, DELIVERY_DATE: 8, SHIP_TO: 200, GSTIN: 15, CURRENCY: 5, VKORG: 4, VTWEG: 2, SPART: 2, AUART: 4 })) out[k] = s(src[k], n);
    for (const k of ['KUNNR', 'KUNWE']) if (/^\d+$/.test(out[k])) out[k] = out[k].padStart(10, '0');
    for (const k of ['PO_DATE', 'DELIVERY_DATE']) if (out[k] && !/^\d{8}$/.test(out[k])) throw fail(400, `${k === 'PO_DATE' ? 'PO date' : 'Delivery date'} must be YYYYMMDD.`);
    out.TOTAL = core.num(src.TOTAL);
    out.PRICE_FROM_PO = !!src.PRICE_FROM_PO;
    out.OVERRIDE = Array.isArray(src.OVERRIDE) ? src.OVERRIDE.filter((c) => core.EXCEPTIONS[c] && !core.EXCEPTIONS[c].blocking) : [];
    return out;
}
function cleanLines(lines) {
    if (!Array.isArray(lines)) throw fail(400, 'lines must be a list.');
    if (lines.length > core.MAX_LINES) throw fail(400, `A PO can have at most ${core.MAX_LINES} lines.`);
    const seen = new Set();
    return lines.map((l, i) => {
        const LINE = Number(l?.LINE) || (i + 1) * 10;
        if (seen.has(LINE)) throw fail(400, `Line number ${LINE} appears twice.`);
        seen.add(LINE);
        const s = (v, n) => (v === undefined || v === null ? '' : String(v).trim().slice(0, n));
        const matnr = s(l?.MATNR, 40);
        return {
            LINE, CUST_MAT: s(l?.CUST_MAT, 35), EAN: s(l?.EAN, 18).replace(/\D/g, ''), DESCRIPTION: s(l?.DESCRIPTION, 80),
            QTY: core.num(l?.QTY), UOM: s(l?.UOM, 6).toUpperCase(), PRICE: core.num(l?.PRICE), MRP: core.num(l?.MRP), AMOUNT: core.num(l?.AMOUNT),
            MATNR: /^\d+$/.test(matnr) ? matnr.padStart(18, '0') : matnr.toUpperCase(), MAKTX: s(l?.MAKTX, 60), MAPPED_BY: s(l?.MAPPED_BY, 12),
            READ_FLAGS: Array.isArray(l?.READ_FLAGS) ? l.READ_FLAGS.filter((f) => f === 'QTY_UNREAD' || f === 'AMOUNT_CHECK') : [],
            DROPPED: !!l?.DROPPED, OVERRIDE: Array.isArray(l?.OVERRIDE) ? l.OVERRIDE.filter((c) => core.EXCEPTIONS[c] && !core.EXCEPTIONS[c].blocking) : [],
            AMENDED: Array.isArray(l?.AMENDED) ? l.AMENDED.slice(0, 5) : [],
            EXCEPTIONS: Array.isArray(l?.EXCEPTIONS) ? l.EXCEPTIONS.filter((c) => core.EXCEPTIONS[c]) : [],
            SAP_PRICE: core.num(l?.SAP_PRICE), ATP_QTY: core.num(l?.ATP_QTY), SAP_MESSAGE: s(l?.SAP_MESSAGE, 220),
        };
    });
}
async function loadPo(id, client = pool, lock = false) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw fail(404, 'PO not found.');
    const { rows } = await client.query(`SELECT * FROM ${S}.po WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [n]);
    if (!rows.length) throw fail(404, 'PO not found.');
    return rows[0];
}

router.get('/pos', wrap(async (req, res) => {
    const status = String(req.query.status || '');
    const list = status.split(',').filter((x) => PO_STATUS.has(x));
    const { rows } = list.length
        ? await pool.query(`SELECT * FROM ${S}.po WHERE status = ANY($1) ORDER BY created_at DESC LIMIT 500`, [list])
        : await pool.query(`SELECT * FROM ${S}.po ORDER BY created_at DESC LIMIT 500`);
    res.json(rows.map((r) => poRow(r, false)));
}));

router.post('/pos', writer, wrap(async (req, res) => {
    const { source, fileName, header, lines, warnings } = req.body || {};
    const h = cleanHeader(header);
    const l = cleanLines(lines || []);
    if (!l.length) throw fail(400, 'The PO has no lines.');
    const src = ['pdf', 'excel', 'image', 'email', 'manual'].includes(source) ? source : 'manual';
    const { rows } = await pool.query(`INSERT INTO ${S}.po (status, source, file_name, header, lines, warnings, created_by) VALUES ('captured',$1,$2,$3,$4,$5,$6) RETURNING *`,
        [src, String(fileName || '').slice(0, 200), JSON.stringify(h), JSON.stringify(l), JSON.stringify(Array.isArray(warnings) ? warnings.slice(0, 20).map((w) => String(w).slice(0, 300)) : []), req.email]);
    await audit(rows[0].id, req.email, 'CAPTURED', { source: src, lines: l.length });
    console.info(`[order-to-cash] ${req.email} capture po=${rows[0].id} source=${src} lines=${l.length}`);
    res.status(201).json(poRow(rows[0]));
}));

router.get('/pos/:id', wrap(async (req, res) => res.json(poRow(await loadPo(req.params.id)))));

router.put('/pos/:id', writer, wrap(async (req, res) => {
    const { version, header, lines } = req.body || {};
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const po = await loadPo(req.params.id, client, true);
        if (['so_created', 'creating', 'so_unknown'].includes(po.status)) throw fail(409, `This PO is ${po.status === 'so_created' ? `already sales order ${po.so_number}` : 'being turned into a sales order'}; it cannot be changed.`);
        if (Number(version) !== po.version) throw fail(409, 'Someone else changed this PO since you opened it. Reload it and make your change again.');
        const h = header !== undefined ? cleanHeader(header) : po.header;
        const l = lines !== undefined ? cleanLines(lines) : po.lines;
        const { rows } = await client.query(`UPDATE ${S}.po SET header=$2, lines=$3, status=CASE WHEN status='rejected' THEN 'rejected' ELSE 'captured' END, touched=true, version=version+1, updated_at=now() WHERE id=$1 RETURNING *`,
            [po.id, JSON.stringify(h), JSON.stringify(l)]);
        await client.query('COMMIT');
        await audit(po.id, req.email, 'EDITED', { lines: l.length });
        res.json(poRow(rows[0]));
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally { client.release(); }
}));

router.post('/pos/:id/reject', writer, wrap(async (req, res) => {
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!reason) throw fail(400, 'Give a reason for rejecting the PO.');
    const po = await loadPo(req.params.id);
    if (['so_created', 'creating', 'so_unknown'].includes(po.status)) throw fail(409, 'A PO with a sales order cannot be rejected here; reject the sales order in SAP.');
    const { rows } = await pool.query(`UPDATE ${S}.po SET status='rejected', version=version+1, updated_at=now() WHERE id=$1 RETURNING *`, [po.id]);
    await audit(po.id, req.email, 'REJECTED', { reason });
    res.json(poRow(rows[0]));
}));

router.post('/pos/:id/validate', writer, wrap(async (req, res) => {
    const po = await loadPo(req.params.id);
    if (!['captured', 'exceptions', 'ready'].includes(po.status)) throw fail(409, `A PO in status ${po.status} cannot be validated again.`);
    const h = po.header || {};
    if (!h.KUNNR) throw fail(400, 'Pick the SAP customer (sold-to) before validation.');
    if (!h.BSTKD) throw fail(400, 'Enter the customer PO number before validation.');
    if (!h.VKORG || !h.VTWEG || !h.SPART) throw fail(400, 'Enter the sales area (sales org., channel, division) before validation.');
    const t0 = Date.now();
    const payload = {
        HEADER: { KUNNR: h.KUNNR, KUNWE: h.KUNWE || h.KUNNR, VKORG: h.VKORG, VTWEG: h.VTWEG, SPART: h.SPART, AUART: h.AUART || '', BSTKD: h.BSTKD, PRSDT: h.PO_DATE || ymdToday(), GSTIN: h.GSTIN || '' },
        LINES: po.lines.filter((l) => !l.DROPPED).map((l) => ({ LINE: l.LINE, MATNR: l.MATNR || '', CUST_MAT: l.CUST_MAT || '', EAN: l.EAN || '', QTY: core.num(l.QTY) || 0, UOM: l.UOM || '' })),
    };
    const r = await callSap('VALIDATE_PO', payload);
    const tol = Number(req.body?.priceTolPct);
    const v = core.applyValidation(po, r, { priceTolPct: Number.isFinite(tol) && tol >= 0 && tol <= 50 ? tol : 0.5, autoAmend: req.body?.autoAmend !== false, today: ymdToday() });
    const { rows } = await pool.query(`UPDATE ${S}.po SET header=$2, lines=$3, amendments=$4, open_exceptions=$5, status=$6, validated_at=now(), version=version+1, updated_at=now() WHERE id=$1 RETURNING *`,
        [po.id, JSON.stringify(v.header), JSON.stringify(v.lines), JSON.stringify(v.amendments), v.open, v.status]);
    await audit(po.id, req.email, 'VALIDATED', { status: v.status, open: v.open, blocking: v.blocking, amended: v.lines.filter((l) => l.AMENDED?.length).length });
    console.info(`[order-to-cash] ${req.email} validate po=${po.id} status=${v.status} open=${v.open} ms=${Date.now() - t0}`);
    res.json(poRow(rows[0]));
}));

router.post('/pos/:id/sales-order', writer, wrap(async (req, res) => {
    const testrun = req.body?.testrun === true;
    const client = await pool.connect();
    let po;
    let payload;
    try {
        await client.query('BEGIN');
        po = await loadPo(req.params.id, client, true);
        if (po.so_number) throw fail(409, `This PO is already sales order ${po.so_number}.`);
        if (po.status === 'creating') throw fail(409, 'The sales order for this PO is being created right now.');
        if (po.status === 'so_unknown') throw fail(409, 'SAP did not confirm the last attempt. Check order tracking for this PO number before trying again.');
        payload = core.createSoPayload(po, po.request_id || crypto.randomUUID());
        if (!testrun) await client.query(`UPDATE ${S}.po SET status='creating', request_id=$2, updated_at=now() WHERE id=$1`, [po.id, payload.REQUEST_ID]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        if (!e.status && /Only a PO|no lines|has no material/.test(e.message)) throw fail(409, e.message);
        throw e;
    } finally { client.release(); }

    const t0 = Date.now();
    let r;
    try {
        r = await callSap('CREATE_SO', { ...payload, TESTRUN: testrun ? 'X' : '' });
    } catch (e) {
        if (!testrun) {
            // Unknown outcome on a timeout / network error: SAP may have created it. CREATE_SO refuses a second order for
            // the same customer + PO number, so a retry is safe, but the person is told to check first.
            const unknown = /not reachable|timeout|aborted/i.test(e.message);
            await pool.query(`UPDATE ${S}.po SET status=$2, so_result=$3, updated_at=now() WHERE id=$1`, [po.id, unknown ? 'so_unknown' : 'ready', JSON.stringify({ error: e.message })]);
            await audit(po.id, req.email, 'SO_FAILED', { unknown, error: e.message.slice(0, 300) });
        }
        throw fail(502, e.message);
    }
    const vbeln = String(r?.VBELN || '').trim();
    const result = { vbeln, netValue: core.num(r?.NET_VALUE), currency: String(r?.CURRENCY || ''), messages: Array.isArray(r?.MESSAGES) ? r.MESSAGES.slice(0, 50) : [], items: Array.isArray(r?.ITEMS) ? r.ITEMS.slice(0, core.MAX_LINES) : [], testrun };
    if (testrun) {
        await audit(po.id, req.email, 'SO_SIMULATED', { ok: !result.messages.some((m) => m.TYPE === 'E' || m.TYPE === 'A'), ms: Date.now() - t0 });
        return res.json({ po: poRow(po), result });
    }
    const ok = !!vbeln;
    const { rows } = await pool.query(`UPDATE ${S}.po SET status=$2, so_number=$3, so_result=$4, version=version+1, updated_at=now() WHERE id=$1 RETURNING *`,
        [po.id, ok ? 'so_created' : 'ready', ok ? vbeln : null, JSON.stringify(result)]);
    await audit(po.id, req.email, ok ? 'SO_CREATED' : 'SO_REFUSED', { vbeln, messages: result.messages.length });
    console.info(`[order-to-cash] ${req.email} create-so po=${po.id} vbeln=${vbeln || '-'} ms=${Date.now() - t0} id=${payload.REQUEST_ID}`);
    res.json({ po: poRow(rows[0]), result });
}));

router.get('/pos/:id/events', wrap(async (req, res) => {
    const po = await loadPo(req.params.id);
    const { rows } = await pool.query(`SELECT at, actor, action, detail FROM ${S}.event WHERE po_id = $1 ORDER BY at`, [po.id]);
    res.json(rows);
}));

router.get('/stats', wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT status, count(*)::int AS n, count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS today,
        count(*) FILTER (WHERE status='so_created' AND NOT touched)::int AS straight, sum(open_exceptions)::int AS exceptions FROM ${S}.po
        WHERE created_at > now() - interval '30 days' GROUP BY status`);
    const d = await pool.query(`SELECT status, count(*)::int AS n, coalesce(sum(amount),0)::float AS amount FROM ${S}.dispute GROUP BY status`);
    const ex = await pool.query(`SELECT code, count(*)::int AS n FROM ${S}.po, jsonb_array_elements(lines) l, jsonb_array_elements_text(coalesce(l->'EXCEPTIONS','[]'::jsonb)) code
        WHERE status IN ('exceptions','ready','captured') GROUP BY code ORDER BY n DESC`);
    res.json({ pos: rows, disputes: d.rows, exceptionCodes: ex.rows });
}));

// ---------- SAP reads and delivery creation ----------
/** SAP dates arrive as YYYY-MM-DD (ABAP type D through /UI2/CL_JSON) or YYYYMMDD; the app uses YYYYMMDD, '' for none. */
function sapDates(row) {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v === '0000-00-00' ? '' : v.replace(/-/g, '');
        else if (typeof v === 'string' && v === '00000000') out[k] = '';
        else out[k] = v;
    }
    return out;
}
router.post('/sap/:action', wrap(async (req, res) => {
    const action = String(req.params.action || '').toUpperCase();
    const write = WRITES.has(action);
    if (!READS.has(action) && !write) throw fail(404, `Unknown SAP action "${action}".`);
    if (write && !req.canWrite) throw fail(403, 'Your Order to Cash role is Viewer: you cannot create deliveries.');
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    for (const k of ['DATE_FROM', 'DATE_TO']) if (body[k] !== undefined && body[k] !== '' && !/^\d{8}$/.test(String(body[k]))) throw fail(400, `${k} must be YYYYMMDD.`);
    if (write && (!Array.isArray(body.ITEMS) || !body.ITEMS.length || body.ITEMS.length > 200)) throw fail(400, 'Choose 1 to 200 order lines.');
    const payload = { MAX_ROWS: Math.min(Number(body.MAX_ROWS) || 2000, 5000), ...body };
    const t0 = Date.now();
    let r;
    try { r = await callSap(action, payload); }
    catch (e) { throw fail(502, e.message); }
    const rows = (Array.isArray(r?.ROWS) ? r.ROWS : Array.isArray(r) ? r : []).map(sapDates);
    console.info(`[order-to-cash] ${req.email} ${action} rows=${rows.length} ms=${Date.now() - t0}`);
    if (write) {
        const items = body.ITEMS.length;
        const created = Array.isArray(r?.DELIVERIES) ? r.DELIVERIES : [];
        await audit(null, req.email, action, { items, deliveries: created.map((d) => d.VBELN || d).slice(0, 50) });
        return res.json({ deliveries: created, messages: Array.isArray(r?.MESSAGES) ? r.MESSAGES : [] });
    }
    res.json({ rows, truncated: r?.TRUNCATED === 'X' || r?.TRUNCATED === true });
}));

// ---------- GRN reconciliation and cash matching (rules in orderToCashCore.js, data from SAP) ----------
router.post('/grn-recon', wrap(async (req, res) => {
    const grn = Array.isArray(req.body?.grn) ? req.body.grn.slice(0, 5000) : null;
    if (!grn || !grn.length) throw fail(400, 'The GRN file has no rows.');
    const invoices = [...new Set(grn.map((g) => String(g?.INVOICE || '').replace(/\D/g, '')).filter(Boolean))].map((v) => v.padStart(10, '0'));
    if (!invoices.length) throw fail(400, 'No invoice numbers found in the GRN file (column Invoice).');
    if (invoices.length > 300) throw fail(400, 'At most 300 invoices per GRN file.');
    let r;
    try { r = await callSap('INVOICE_ITEMS', { VBELNS: invoices }); } catch (e) { throw fail(502, e.message); }
    const inv = (Array.isArray(r?.ROWS) ? r.ROWS : []).map(sapDates);
    const out = core.reconcileGrn(inv, grn);
    console.info(`[order-to-cash] ${req.email} grn-recon invoices=${invoices.length} rows=${out.length}`);
    res.json({ rows: out, invoices: invoices.length, found: new Set(inv.map((l) => l.VBELN)).size });
}));

router.post('/cash-match', wrap(async (req, res) => {
    const remits = Array.isArray(req.body?.remits) ? req.body.remits.slice(0, 5000) : null;
    if (!remits || !remits.length) throw fail(400, 'The remittance file has no rows.');
    const kunnrs = [...new Set(remits.map((r) => String(r?.KUNNR || '').replace(/\D/g, '')).filter(Boolean))].map((k) => k.padStart(10, '0'));
    let r;
    try { r = await callSap('LIST_OPEN_ITEMS', { KUNNRS: kunnrs, MAX_ROWS: 20000 }); } catch (e) { throw fail(502, e.message); }
    const open = (Array.isArray(r?.ROWS) ? r.ROWS : []).map(sapDates);
    const out = core.matchCash(open, remits);
    console.info(`[order-to-cash] ${req.email} cash-match remits=${remits.length} open=${open.length}`);
    res.json({ rows: out, openItems: open.length });
}));

// ---------- appointments ----------
router.get('/appointments', wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM ${S}.appointment ORDER BY slot_date NULLS LAST, slot_time`);
    res.json(rows);
}));
router.post('/appointments', writer, wrap(async (req, res) => {
    const b = req.body || {};
    const delivery = String(b.delivery || '').trim();
    if (!/^\d{1,10}$/.test(delivery)) throw fail(400, 'Choose a delivery.');
    if (b.slot_date && !/^\d{8}$/.test(String(b.slot_date))) throw fail(400, 'The appointment date must be YYYYMMDD.');
    const status = ['requested', 'confirmed', 'rescheduled', 'missed', 'done', 'cancelled'].includes(b.status) ? b.status : 'requested';
    const s = (v, n) => String(v ?? '').trim().slice(0, n);
    const { rows } = await pool.query(`INSERT INTO ${S}.appointment (delivery, kunnr, name1, slot_date, slot_time, location, reference, status, note, updated_by, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT (delivery) DO UPDATE SET kunnr=EXCLUDED.kunnr, name1=EXCLUDED.name1, slot_date=EXCLUDED.slot_date,
        slot_time=EXCLUDED.slot_time, location=EXCLUDED.location, reference=EXCLUDED.reference, status=EXCLUDED.status, note=EXCLUDED.note, updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING *`,
        [delivery.padStart(10, '0'), s(b.kunnr, 10), s(b.name1, 80), s(b.slot_date, 8), s(b.slot_time, 11), s(b.location, 120), s(b.reference, 40), status, s(b.note, 300), req.email]);
    await audit(null, req.email, 'APPOINTMENT', { delivery, status });
    res.json(rows[0]);
}));

// ---------- flags (ASN sent, invoice delivered) ----------
router.get('/flags', wrap(async (req, res) => {
    const kind = String(req.query.kind || '');
    if (!FLAG_KINDS.has(kind)) throw fail(400, 'Unknown flag kind.');
    const { rows } = await pool.query(`SELECT ref, data, by_user, at FROM ${S}.flag WHERE kind = $1`, [kind]);
    res.json(rows);
}));
router.post('/flags', writer, wrap(async (req, res) => {
    const { kind, refs, data } = req.body || {};
    if (!FLAG_KINDS.has(kind)) throw fail(400, 'Unknown flag kind.');
    if (!Array.isArray(refs) || !refs.length || refs.length > 500) throw fail(400, 'Choose 1 to 500 documents.');
    const clean = refs.map((r) => String(r).trim()).filter((r) => /^\d{1,10}$/.test(r)).map((r) => r.padStart(10, '0'));
    for (const ref of clean) {
        await pool.query(`INSERT INTO ${S}.flag (kind, ref, data, by_user) VALUES ($1,$2,$3,$4) ON CONFLICT (kind, ref) DO UPDATE SET data=EXCLUDED.data, by_user=EXCLUDED.by_user, at=now()`,
            [kind, ref, JSON.stringify(data && typeof data === 'object' ? data : {}), req.email]);
    }
    await audit(null, req.email, `FLAG_${kind.toUpperCase()}`, { count: clean.length });
    res.json({ count: clean.length });
}));

// ---------- disputes ----------
const disputeRow = (r) => ({ ...r, id: Number(r.id), amount: r.amount === null ? null : Number(r.amount) });
router.get('/disputes', wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM ${S}.dispute ORDER BY (status IN ('resolved','written_off')), updated_at DESC LIMIT 1000`);
    res.json(rows.map(disputeRow));
}));
router.post('/disputes', writer, wrap(async (req, res) => {
    const b = req.body || {};
    const s = (v, n) => String(v ?? '').trim().slice(0, n);
    const refType = ['invoice', 'deduction', 'grn', 'delivery', 'order', 'payment'].includes(b.ref_type) ? b.ref_type : 'invoice';
    if (!s(b.ref_no, 20)) throw fail(400, 'Give the document number the dispute is about.');
    if (!s(b.reason, 300)) throw fail(400, 'Give the reason.');
    const notes = s(b.note, 1000) ? [{ at: new Date().toISOString(), by: req.email, text: s(b.note, 1000) }] : [];
    const { rows } = await pool.query(`INSERT INTO ${S}.dispute (ref_type, ref_no, kunnr, name1, amount, reason, owner, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [refType, s(b.ref_no, 20), s(b.kunnr, 10), s(b.name1, 80), core.num(b.amount), s(b.reason, 300), s(b.owner, 120) || req.email, JSON.stringify(notes), req.email]);
    await audit(null, req.email, 'DISPUTE_OPENED', { id: rows[0].id, refType });
    res.status(201).json(disputeRow(rows[0]));
}));
router.put('/disputes/:id', writer, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    if (b.status !== undefined && !DISPUTE_STATUS.has(b.status)) throw fail(400, 'Unknown dispute status.');
    const note = String(b.note ?? '').trim().slice(0, 1000);
    const { rows } = await pool.query(`UPDATE ${S}.dispute SET status=coalesce($2,status), owner=coalesce($3,owner),
        notes = CASE WHEN $4::text = '' THEN notes ELSE notes || jsonb_build_array(jsonb_build_object('at', now(), 'by', $5::text, 'text', $4::text)) END, updated_at=now() WHERE id=$1 RETURNING *`,
        [id, b.status ?? null, b.owner ? String(b.owner).slice(0, 120) : null, note, req.email]);
    if (!rows.length) throw fail(404, 'Dispute not found.');
    await audit(null, req.email, 'DISPUTE_UPDATED', { id, status: b.status });
    res.json(disputeRow(rows[0]));
}));

module.exports = router;
module.exports.cleanLines = cleanLines;
module.exports.cleanHeader = cleanHeader;
