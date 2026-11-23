/*
   SmarTruck TMS (embedded-apps/smartruck-tms) backend. Mounted at /api/me/smartruck-tms (rides the existing nginx /api/me rule), plus
   an ingest endpoint for tracking feeds that authenticates with an API key instead of a hub session.

     GET  /me                      who I am in the TMS: roles, units, permissions, which integrations are simulated
     GET  /db?allUnits=1           everything I may see (units/locations/masters + my units' orders, shipments, invoices). Vendors: anonymised auctions only
     POST /cmd                     { type, ... }  every change (tmsEngine.js handlers). Returns { result, db }. 4xx carries the rule that was broken
     GET  /reports/catalog         9 categories / 40+ reports        GET /reports/:name?allUnits=1   rows
     POST /admin/import?dryRun=1   Phase 0 migration: validated, referentially checked import of an export from the old system (user.manage)
   Ingest (no hub session; header x-tms-key = TMS_INGEST_KEY):
     POST /ingest/ping             { sin | vehicleNo, lat, lon, speed, ts, source } or { pings: [...] }  (<= 500)
     POST /ingest/consent          { phone, state: Granted | Declined | Expired }   telecom consent callback

   Who may use it: a hub session plus the "smartruck-tms" grant in Admin Center; what they may DO is the TMS role set in tmsEngine.js
   (checked per action, server side). The TMS user row (email -> roles, units, carrier) is created in Settings > User Management; a hub
   Admin of this app is bootstrapped as TMS Admin when none exists. State is one locked JSON document in emami_apps.tms_state (pilot scale;
   move to relational tables before company-wide volume), every command is written to emami_apps.tms_audit.
   Logs: user, command, timing - never payload values.
*/
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const engine = require('./tmsEngine');
const reports = require('./tmsReports');
const sapSvc = require('./tmsSap');
const integ = require('./tmsIntegrations');
const ulip = require('./tmsUlip');
const { MAX_FILE } = require('./tmsTrips');

const APP_ID = 'smartruck-tms';
const router = express.Router();
const ingest = express.Router();

// ------------------------------------------------------------------ storage (a locked single document; swap for tables later)
function pgStore() {
    let ready;
    const init = () => ready || (ready = (async () => {
        await pool.query(`CREATE TABLE IF NOT EXISTS emami_apps.tms_state (key text PRIMARY KEY, data jsonb NOT NULL, version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())`);
        await pool.query(`CREATE TABLE IF NOT EXISTS emami_apps.tms_audit (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, cmd text NOT NULL, ok boolean NOT NULL, detail text)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS emami_apps.tms_files (id bigserial PRIMARY KEY, sin text NOT NULL, name text NOT NULL, mime text NOT NULL, size integer NOT NULL, data bytea NOT NULL, by_user text, at timestamptz NOT NULL DEFAULT now())`);
        await pool.query(`INSERT INTO emami_apps.tms_state(key, data) VALUES ('db', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(engine.emptyDb())]);
    })().catch((e) => { ready = undefined; throw e; }));
    return {
        async withDb(fn, { write = true } = {}) {
            await init();
            const c = await pool.connect();
            try {
                await c.query('BEGIN');
                const r = await c.query(`SELECT data, version FROM emami_apps.tms_state WHERE key = 'db' ${write ? 'FOR UPDATE' : ''}`);
                const db = r.rows[0].data;
                const out = await fn(db);
                if (write) await c.query(`UPDATE emami_apps.tms_state SET data = $1, version = version + 1, updated_at = now() WHERE key = 'db'`, [JSON.stringify(db)]);
                await c.query('COMMIT');
                return out;
            } catch (e) { await c.query('ROLLBACK').catch(() => null); throw e; } finally { c.release(); }
        },
        files: {
            async put({ sin, name, mime, dataBase64, by }) {
                await init();
                const r = await pool.query('INSERT INTO emami_apps.tms_files(sin, name, mime, size, data, by_user) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [sin, name, mime, Buffer.from(dataBase64, 'base64').length, Buffer.from(dataBase64, 'base64'), by]);
                return `F${r.rows[0].id}`;
            },
            async get(fid) {
                await init();
                const n = /^F(\d{1,12})$/.exec(String(fid)); if (!n) return null;
                const r = await pool.query('SELECT sin, name, mime, data FROM emami_apps.tms_files WHERE id = $1', [n[1]]);
                return r.rows[0] ? { sin: r.rows[0].sin, name: r.rows[0].name, mime: r.rows[0].mime, buffer: r.rows[0].data } : null;
            },
            async mark() { /* no-op */ },
        },
        async audit(actor, cmd, ok, detail) { try { await init(); await pool.query('INSERT INTO emami_apps.tms_audit(actor, cmd, ok, detail) VALUES ($1,$2,$3,$4)', [actor, cmd, ok, String(detail || '').slice(0, 500)]); } catch (e) { console.error('[tms] audit', e.message); } },
    };
}
function memoryStore(db = engine.emptyDb()) {
    const auditLog = [], fileMap = new Map();
    return {
        db, auditLog,
        files: { async put(f) { const fid = `F${fileMap.size + 1}`; fileMap.set(fid, { sin: f.sin, name: f.name, mime: f.mime, buffer: Buffer.from(f.dataBase64, 'base64') }); return fid; }, async get(fid) { return fileMap.get(fid) || null; } },
        async withDb(fn, { write = true } = {}) { const copy = JSON.parse(JSON.stringify(this.db)); const out = await fn(copy); if (write) this.db = copy; return out; },
        async audit(actor, cmd, ok, detail) { auditLog.push({ actor, cmd, ok, detail }); },
    };
}

// ------------------------------------------------------------------ the service (what the routes and the tests call)
function createService(store, depsForCaller) {
    const depsFor = (caller) => ({ ...depsForCaller(caller), files: store.files });
    const sessionUser = (db, caller) => {
        let u = db.users.find((x) => x.email === caller.email);
        if (!u && caller.hubRole === 'Admin' && !db.users.some((x) => (x.roles || []).includes('Admin'))) {
            u = { id: `U${db.users.length + 1}`, name: caller.email.split('@')[0], email: caller.email, designation: 'TMS administrator (bootstrap)', roles: ['Admin'], units: db.units.map((x) => x.id), lastSignin: '' };
            db.users.push(u);
        }
        if (u && engine.isAdmin(u)) u.units = db.units.map((x) => x.id); // an administrator is in every unit, including ones created later
        if (!u) throw new engine.EngineError('You are not set up as a TMS user yet. Ask a TMS administrator to add you in Settings > User Management.', 403);
        return u;
    };
    return {
        sessionUser,
        async me(caller) {
            return store.withDb((db) => {
                const u = sessionUser(db, caller); u.lastSignin = new Date().toISOString();
                return { user: u, perms: [...engine.permsOf(u)], integrations: { sap: sapSvc.simulated() ? 'simulated' : 'live', eway: process.env.TMS_EWAY_BASE ? 'live' : 'simulated', consent: process.env.TMS_CONSENT_URL ? 'live' : 'simulated', ingest: process.env.TMS_INGEST_KEY ? 'enabled' : 'disabled' } };
            });
        },
        async snapshot(caller, allUnits) {
            return store.withDb((db) => { const u = sessionUser(db, caller); return { db: engine.scopedDb(db, u, allUnits), serverNow: Date.now() }; }, { write: false });
        },
        async run(caller, cmd) {
            const deps = depsFor(caller);
            let consentRequest, mailRequest;
            const out = await store.withDb(async (db) => {
                const u = sessionUser(db, caller);
                try {
                    const { result } = await engine.apply(db, cmd, u, deps);
                    consentRequest = result.consentRequest; mailRequest = result.mailRequest; delete result.mailRequest;
                    await store.audit(u.email, cmd.type, true, '');
                    return { result, db: engine.scopedDb(db, u, !!cmd.allUnits) };
                } catch (e) { await store.audit(u.email, cmd && cmd.type, false, e.message); throw e; }
            });
            if (mailRequest) {
                const att = mailRequest.fileId ? await store.files.get(mailRequest.fileId).catch(() => null) : null;
                const m = await deps.mail.send({ to: mailRequest.to, subject: mailRequest.subject, text: mailRequest.text, attachment: att ? { name: att.name, mime: att.mime, dataBase64: att.buffer.toString('base64') } : undefined }).catch((e) => ({ sent: false, error: e.message }));
                out.result.mail = m;
                if (m.sent) await store.withDb((db) => { const i = db.invoices.find((x) => x.id === mailRequest.invoiceId); if (i) { i.mailedAt = new Date().toISOString(); i.history.push({ at: i.mailedAt, actor: 'System', text: `Mailed to ${mailRequest.to}` }); } });
            }
            if (consentRequest) { const r = await deps.consent.request(consentRequest).catch(() => ({ requested: false })); out.result.consent = r; }
            return out;
        },
        /** Recipient link: no session; the token is the credential. Returns only what publicTrack allows. */
        async publicTrack(token) {
            return store.withDb((db) => engine.trips.publicTrack(db, token, Date.now()), { write: false });
        },
        /** A stored file (POD, invoice, departure photo), only if the caller may see its trip. */
        async file(caller, fid) {
            const f = await store.files.get(fid);
            if (!f) throw new engine.EngineError('File not found.', 404);
            await store.withDb((db) => {
                const u = sessionUser(db, caller);
                if (!engine.scopedDb(db, u, true).shipments.some((x) => x.sin === f.sin)) throw new engine.EngineError('You cannot open that file.', 403);
            }, { write: false });
            return f;
        },
        async report(caller, name, allUnits) {
            return store.withDb((db) => {
                const u = sessionUser(db, caller);
                if (engine.isVendor(u)) throw new engine.EngineError('Reports are not available to carrier users.', 403);
                const rows = reports.run(name, engine.scopedDb(db, u, allUnits), Date.now());
                if (!rows) throw new engine.EngineError('Unknown report.', 404);
                return rows.slice(0, 50000);
            }, { write: false });
        },
        async importData(caller, payload, dryRun) {
            return store.withDb((db) => { const u = sessionUser(db, caller); if (!engine.can(u, 'user.manage')) throw new engine.EngineError('Only an administrator can import data.', 403); return engine.importData(db, payload, { dryRun }); }, { write: !dryRun });
        },
        async ingestPings(pings) {
            return store.withDb((db) => {
                const out = { matched: 0, unmatched: 0, errors: 0 };
                for (const p of pings) { try { const r = engine.ingestPing(db, p, Date.now()); r.matched ? out.matched++ : out.unmatched++; } catch { out.errors++; } }
                return out;
            });
        },
        async ingestConsent({ phone, state }) {
            const digits = String(phone || '').replace(/\D/g, '').slice(-10);
            if (!/^[6-9]\d{9}$/.test(digits) || !['Granted', 'Declined', 'Expired'].includes(state)) throw new engine.EngineError('phone and state (Granted | Declined | Expired) are required.');
            return store.withDb((db) => {
                let n = 0;
                for (const s of db.shipments) if (s.phone === digits && ['Assigned', 'Towards Pickup', 'At Pickup', 'In Transit'].includes(s.status)) {
                    s.consent = state; if (state === 'Granted') { s.consentSince = new Date().toISOString(); if (s.tracking === 'No GPS' || s.tracking === 'Non-Tracking') s.tracking = 'Active'; } else s.tracking = 'Non-Tracking';
                    s.log.push({ at: new Date().toISOString(), actor: 'Telecom', text: `SIM consent ${state}` }); n++;
                }
                return { updated: n };
            });
        },
        /** Periodic: close auctions, flag GPS gaps / e-way bills, pull payment status from SAP. */
        async background() {
            const deps = depsFor({ email: '' });
            return store.withDb(async (db) => {
                const s = engine.sweep(db, Date.now());
                let p = { paid: 0 }, tr = { updated: 0, failed: 0 };
                try { tr = await engine.trips.pollTracking(db, Date.now(), deps); } catch (e) { console.error('[tms] tracking poll', e.message); }
                try { p = await engine.syncPayments(db, Date.now(), deps); } catch (e) { console.error('[tms] payment sync', e.message); }
                return { ...s, ...p, tracked: tr.updated, trackFailed: tr.failed };
            });
        },
    };
}

const depsFor = (caller) => ({
    sap: { deliveries: (n) => sapSvc.deliveries(n, caller), shipment: (n) => sapSvc.shipment(n, caller), lanes: () => sapSvc.lanes(caller), vendors: () => sapSvc.vendors(caller), customers: () => sapSvc.customers(caller), checkPoSo: (q) => sapSvc.checkPoSo(q, caller), postFreightInvoice: (i) => sapSvc.postFreightInvoice(i, caller), paymentStatus: (d) => sapSvc.paymentStatus(d, caller) },
    consent: integ.consent, eway: integ.eway, mail: integ.mail, ulip,
});
const service = createService(pgStore(), depsFor);

// ------------------------------------------------------------------ hub session and grant
function verifiedEmail(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!m || !JWT_SECRET) return '';
    try { const p = jwt.verify(m[1].trim(), JWT_SECRET, { algorithms: ['HS256'] }); return p && !p.purpose ? String(p.email || '').trim().toLowerCase() : ''; } catch { return ''; }
}
async function requireUser(req, res, next) {
    const email = verifiedEmail(req);
    if (!email) return res.status(401).json({ error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    try {
        const [grant, user] = await Promise.all([
            pool.query('SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [email, APP_ID]),
            pool.query('SELECT is_active FROM emami_apps.authorized_users WHERE email = $1', [email]),
        ]);
        if (!grant.rows.length || (user.rows[0] && user.rows[0].is_active === false)) return res.status(403).json({ error: 'You do not have access to SmarTruck TMS. Ask an Emami Apps admin for it in Admin Center.' });
        req.caller = { email, hubRole: grant.rows[0].role };
        next();
    } catch (e) { console.error('[tms] access check', e.message); res.status(500).json({ error: 'Could not verify your access.' }); }
}

const handle = (name, fn) => async (req, res) => {
    const t0 = Date.now();
    try {
        const out = await fn(req);
        console.info(`[tms] ${req.caller ? req.caller.email : 'ingest'} ${name} ms=${Date.now() - t0}`);
        res.json(out);
    } catch (e) {
        const status = e instanceof engine.EngineError || e instanceof sapSvc.SapError ? e.status : 500;
        console.error(`[tms] ${req.caller ? req.caller.email : 'ingest'} ${name} failed: ${e.message}`);
        res.status(status).json({ error: status === 500 ? 'Unexpected error.' : e.message });
    }
};

// ------------------------------------------------------------------ ingest (API key)
const keyOk = (req) => { const want = String(process.env.TMS_INGEST_KEY || ''); const got = String(req.get('x-tms-key') || ''); if (!want || want.length < 16) return false; const a = Buffer.from(want), b = Buffer.from(got); return a.length === b.length && crypto.timingSafeEqual(a, b); };
ingest.use(express.json({ limit: '1mb' }));
ingest.use((req, res, next) => (keyOk(req) ? next() : res.status(401).json({ error: 'Invalid or missing ingest key.' })));
ingest.post('/ping', handle('ingest.ping', async (req) => { const list = Array.isArray(req.body && req.body.pings) ? req.body.pings : [req.body]; if (list.length > 500) throw new engine.EngineError('At most 500 pings per request.'); return service.ingestPings(list); }));
ingest.post('/consent', handle('ingest.consent', (req) => service.ingestConsent(req.body || {})));
router.use('/ingest', ingest);

// Recipient tracking link: no hub session (the 128-bit token is the credential). Rate limited per IP; read only.
const hits = new Map();
const limited = (req) => { const k = req.ip || '-', now = Date.now(), e = hits.get(k) || { n: 0, t: now }; if (now - e.t > 60_000) { e.n = 0; e.t = now; } e.n++; hits.set(k, e); if (hits.size > 5000) hits.clear(); return e.n > 60; };
router.get('/public/track/:token', async (req, res) => {
    if (limited(req)) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    try { const r = await service.publicTrack(String(req.params.token)); res.set('Cache-Control', 'no-store'); return r ? res.json(r) : res.status(404).json({ error: 'This tracking link is not valid.' }); } catch (e) { console.error('[tms] public track', e.message); return res.status(500).json({ error: 'Unexpected error.' }); }
});

router.use(requireUser);
router.use(express.json({ limit: '8mb' }));
router.get('/me', handle('me', (req) => service.me(req.caller)));
router.get('/db', handle('db', (req) => service.snapshot(req.caller, req.query.allUnits === '1')));
router.post('/cmd', handle('cmd', (req) => service.run(req.caller, req.body || {})));
router.get('/file/:id', async (req, res) => {
    try { const f = await service.file(req.caller, String(req.params.id)); res.set({ 'Content-Type': f.mime, 'Content-Disposition': `attachment; filename="${f.name.replace(/[^\w.\- ]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); res.send(f.buffer); }
    catch (e) { const st = e instanceof engine.EngineError ? e.status : 500; res.status(st).json({ error: st === 500 ? 'Unexpected error.' : e.message }); }
});
router.get('/reports/catalog', handle('reports.catalog', async () => ({ catalog: reports.catalog(), count: reports.count() })));
router.get('/reports/:name', handle('report', (req) => service.report(req.caller, String(req.params.name), req.query.allUnits === '1')));
router.post('/admin/import', handle('import', (req) => service.importData(req.caller, req.body, req.query.dryRun === '1')));

// Background sweep: only one process should do this per environment; set TMS_BACKGROUND=off on the others.
if (process.env.TMS_BACKGROUND !== 'off' && process.env.NODE_ENV !== 'test' && !process.env.LAMBDA_TASK_ROOT) {
    const t = setInterval(() => { if (process.env.PGHOST) service.background().catch((e) => console.error('[tms] background', e.message)); }, 60_000);
    if (t.unref) t.unref();
}

module.exports = router;
module.exports._test = { createService, memoryStore, depsFor };
