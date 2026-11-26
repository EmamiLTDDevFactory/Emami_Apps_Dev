/**
 * Access Requests — self-service incident/ticket flow for Emami Apps authorization.
 *
 * Two entry points, one table set:
 *   1. A signed-in hub user raises a request for more app roles (identity comes from the session token).
 *   2. Someone who cannot sign in at all raises one from the login page (no session; identity is what they
 *      typed, so it is stored as UNVERIFIED and shown that way to the approver).
 *
 * A Super Admin reviews each (app, role) line on its own — approve or reject it, with a reason for every
 * rejection — and approving grants the access automatically, in the same database transaction: a brand-new
 * person gets their emami_apps.authorized_users row (so they can sign in), then each approved line is written to
 * emami_apps.authorized_user_apps exactly like Manage Access does (including the Audit & CAPA role sync and the
 * access_change_history row). Rejecting every line is the "send back to the user" path: the requester is mailed
 * the reason and can raise a fresh request.
 *
 * Audit trail: emami_apps.access_request_events is append-only (a trigger refuses UPDATE/DELETE) and records who
 * did what, from which IP, and when — submission, every file added/downloaded, every view by an approver, each
 * line decision, each grant applied, and the final outcome. The supporting document(s) (an approval e-mail as
 * .msg/.eml/PDF, a screenshot, ...) are required at submission. They are NOT stored in Postgres: each file is written to ACCESS_REQUEST_FILES_DIR on the
 * server's disk (random name, mode 0600) and the database keeps only the filename, size, SHA-256 and stored name.
 *
 * Incident number: INC-YYYY-00001. It is written to access_change_history (incident_id/incident_ref/incident_note) on every
 * grant this makes, so Admin Center's Activity / History and Access Tracker show which incident a role came from.
 *
 * Routes (all under /access/requests so the existing nginx /api/access/ rule already forwards them):
 *   POST /                    raise a request            (public; a valid session token upgrades it to verified)
 *   POST /status              { ref, email } -> outcome  (public; the pair is the secret)
 *   GET  /mine                my requests                (any signed-in user)
 *   GET  /pending-count       badge number               (Super Admin)
 *   GET  /                    inbox, ?status=            (Super Admin)
 *   GET  /:id                 full detail + audit trail  (Super Admin)
 *   GET  /:id/files/:fileId   download a document        (Super Admin, or the requester)
 *   POST /:id/decision        approve/reject per line    (Super Admin; never on your own request)
 *
 * Mounted from server.js with the pieces that live there (requireAccessManager, validRolesForApp, defaults).
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const { syncAuditCapaAccess } = require('./auditCapaSync');
const { recordAccessChange } = require('./accessHistory');
const { invalidatePeopleDirectory } = require('./orgProfile');
const { notify } = require('./notifications');
const { APP_URL } = require('./ccbTeams');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Who gets the "needs your approval" mail for a new access request (only these two, not every Super Admin). */
const APPROVAL_MAIL_TO = ['indranil.banerjee@emamigroup.com', 'sayontan.das@emamigroup.com'];
const MAX_ITEMS = 60;
const MAX_FILES = 5;
/** Request bodies are capped at 6 MB by server.js's JSON parser and base64 adds a third, so ~4 MB of files. */
const MAX_FILE_BYTES_TOTAL = 4 * 1024 * 1024;
/** Where supporting documents live (outside Postgres). Set ACCESS_REQUEST_FILES_DIR to a folder outside the app directory
 * on the server so a redeploy or a rollback of the code never touches them; back it up with the server. */
const FILES_DIR = process.env.ACCESS_REQUEST_FILES_DIR || path.join(__dirname, 'data', 'access-request-files');
const NEEDS_DEPOT = (appId, role) => appId === 'audit-capa' && (role === 'Depot' || role === 'View');

// extension -> magic-byte check (null = text; only a NUL-byte sniff). Content-Type from the browser is never trusted.
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const FILE_TYPES = {
    pdf: { mime: 'application/pdf', ok: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
    png: { mime: 'image/png', ok: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
    jpg: { mime: 'image/jpeg', ok: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
    jpeg: { mime: 'image/jpeg', ok: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
    msg: { mime: 'application/vnd.ms-outlook', ok: (b) => b.subarray(0, 8).equals(OLE) },
    doc: { mime: 'application/msword', ok: (b) => b.subarray(0, 8).equals(OLE) },
    docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ok: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
    eml: { mime: 'message/rfc822', ok: (b) => !b.subarray(0, 1024).includes(0) },
    txt: { mime: 'text/plain', ok: (b) => !b.subarray(0, 1024).includes(0) },
};

const STATUSES = ['Pending', 'Approved', 'Partially Approved', 'Rejected'];

/** Writes one document under FILES_DIR and returns its stored name (never derived from the user's filename). */
async function writeStoredFile(sha256, buf) {
    await fs.promises.mkdir(FILES_DIR, { recursive: true, mode: 0o700 });
    const stored = `${sha256.slice(0, 16)}-${crypto.randomUUID()}`;
    await fs.promises.writeFile(path.join(FILES_DIR, stored), buf, { mode: 0o600, flag: 'wx' });
    return stored;
}
const removeStoredFiles = (names) => Promise.all(names.map((n) => fs.promises.unlink(path.join(FILES_DIR, path.basename(n))).catch(() => {})));

async function ensureSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS emami_apps.access_requests (
            id bigserial PRIMARY KEY,
            first_name text NOT NULL,
            last_name text NOT NULL,
            email text NOT NULL,
            requester_verified boolean NOT NULL DEFAULT false,
            existing_user boolean NOT NULL DEFAULT false,
            justification text NOT NULL,
            status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Partially Approved','Rejected')),
            submitted_ip text,
            created_at timestamptz NOT NULL DEFAULT now(),
            decided_at timestamptz,
            decided_by text,
            decision_note text
        )`);
    await pool.query('CREATE INDEX IF NOT EXISTS access_requests_status_idx ON emami_apps.access_requests (status, created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS access_requests_email_idx ON emami_apps.access_requests (email, created_at DESC)');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS emami_apps.access_request_items (
            id bigserial PRIMARY KEY,
            request_id bigint NOT NULL REFERENCES emami_apps.access_requests(id) ON DELETE CASCADE,
            app_id text NOT NULL,
            role text NOT NULL,
            depot text,
            decision text NOT NULL DEFAULT 'Pending' CHECK (decision IN ('Pending','Approved','Rejected')),
            decision_note text,
            decided_by text,
            decided_at timestamptz,
            applied_at timestamptz,
            UNIQUE (request_id, app_id, role)
        )`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS emami_apps.access_request_files (
            id bigserial PRIMARY KEY,
            request_id bigint NOT NULL REFERENCES emami_apps.access_requests(id) ON DELETE CASCADE,
            filename text NOT NULL,
            content_type text NOT NULL,
            size_bytes integer NOT NULL,
            sha256 text NOT NULL,
            data bytea,
            storage_path text,
            uploaded_at timestamptz NOT NULL DEFAULT now()
        )`);
    await pool.query('CREATE INDEX IF NOT EXISTS access_request_files_req_idx ON emami_apps.access_request_files (request_id)');
    // First version kept the bytes in the table; move any of those onto disk and empty the column.
    await pool.query('ALTER TABLE emami_apps.access_request_files ADD COLUMN IF NOT EXISTS storage_path text');
    await pool.query('ALTER TABLE emami_apps.access_request_files ALTER COLUMN data DROP NOT NULL');
    const legacy = await pool.query('SELECT id, sha256, data FROM emami_apps.access_request_files WHERE data IS NOT NULL AND storage_path IS NULL');
    for (const r of legacy.rows) {
        const stored = await writeStoredFile(r.sha256, r.data);
        await pool.query('UPDATE emami_apps.access_request_files SET storage_path = $2, data = NULL WHERE id = $1', [r.id, stored]);
    }
    // Which incident a grant came from, next to the grant itself in the Manage Access change history.
    await pool.query(`ALTER TABLE emami_apps.access_change_history
        ADD COLUMN IF NOT EXISTS incident_id bigint, ADD COLUMN IF NOT EXISTS incident_ref text, ADD COLUMN IF NOT EXISTS incident_note text`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS emami_apps.access_request_events (
            id bigserial PRIMARY KEY,
            request_id bigint NOT NULL REFERENCES emami_apps.access_requests(id) ON DELETE CASCADE,
            actor text,
            actor_role text,
            event_type text NOT NULL,
            detail text,
            ip text,
            occurred_at timestamptz NOT NULL DEFAULT now()
        )`);
    await pool.query('CREATE INDEX IF NOT EXISTS access_request_events_req_idx ON emami_apps.access_request_events (request_id, occurred_at)');
    // Append-only audit trail. Best effort: if the DB role cannot create functions/triggers the table still works.
    try {
        await pool.query(`
            CREATE OR REPLACE FUNCTION emami_apps.access_request_events_immutable() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'access_request_events is append-only'; END; $$ LANGUAGE plpgsql`);
        await pool.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'access_request_events_no_change') THEN
                    CREATE TRIGGER access_request_events_no_change BEFORE UPDATE OR DELETE ON emami_apps.access_request_events
                    FOR EACH ROW EXECUTE FUNCTION emami_apps.access_request_events_immutable();
                END IF;
            END $$`);
    } catch (err) {
        console.error('[access-requests] Could not install the append-only trigger (audit table still works):', err.message);
    }
    console.log('[postgres] Access request schema up to date (emami_apps.access_requests*).');
}

const refOf = (r) => `INC-${new Date(r.created_at).getFullYear()}-${String(r.id).padStart(5, '0')}`;
const idFromRef = (ref) => {
    const m = /^(?:INC|AR)-\d{4}-(\d{1,12})$/i.exec(String(ref || '').trim());
    return m ? Number(m[1]) : null;
};
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const clientIp = (req) => {
    const fwd = String(req.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
    return (fwd.length ? fwd[fwd.length - 1] : req.socket?.remoteAddress || '').slice(0, 64);
};

// Tiny per-process throttle for the two public endpoints (the box runs one PM2 process per backend).
const hits = new Map();
function throttled(key, limit, windowMs, record = true) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return true; }
    if (record) recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return false;
}

function sessionEmail(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!m || !JWT_SECRET) return '';
    try {
        return String(jwt.verify(m[1].trim(), JWT_SECRET)?.email || '').trim().toLowerCase();
    } catch {
        return '';
    }
}

/** A session is only as good as the live allow-list: a deactivated user's old token must not raise "verified" requests. */
async function activeSessionUser(req) {
    const email = sessionEmail(req);
    if (!email) return null;
    const { rows } = await pool.query('SELECT email, first_name, last_name, is_active, access_level FROM emami_apps.authorized_users WHERE email = $1', [email]);
    return rows[0] && rows[0].is_active ? rows[0] : null;
}

async function addEvent(db, requestId, { actor = null, actorRole = null, type, detail = null, ip = null }) {
    await db.query(
        'INSERT INTO emami_apps.access_request_events (request_id, actor, actor_role, event_type, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)',
        [requestId, actor, actorRole, type, detail ? String(detail).slice(0, 1500) : null, ip]
    );
}

/** Writes each mail's outcome (who it went to, sent / failed / not sent) into the request's audit trail. */
const mailLogger = (requestId) => async ({ to, subject, status, error }) => {
    const type = status === 'sent' ? 'MAIL_SENT' : status === 'failed' ? 'MAIL_FAILED' : 'MAIL_SKIPPED';
    await addEvent(pool, requestId, { actorRole: 'System', type, detail: `To ${to}: "${subject}"${error ? ` (${error})` : ''}` });
};

/** Validates and decodes the attachments array; returns { files } or { error }. */
function parseFiles(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return { error: 'Attach the supporting mail or document (for example your manager\'s approval e-mail).' };
    if (raw.length > MAX_FILES) return { error: `Attach at most ${MAX_FILES} files.` };
    let total = 0;
    const files = [];
    for (const f of raw) {
        const name = String(f?.name || '').replace(/[\\/]/g, '_').replace(/[\u0000-\u001f<>:"|?*]/g, '').trim().slice(0, 120);
        const ext = (name.split('.').pop() || '').toLowerCase();
        const type = FILE_TYPES[ext];
        if (!name || !type) return { error: 'Supported documents: PDF, PNG, JPG, MSG, EML, DOC, DOCX, TXT.' };
        const buf = Buffer.from(String(f?.data || ''), 'base64');
        if (buf.length === 0) return { error: `"${name}" is empty.` };
        total += buf.length;
        if (total > MAX_FILE_BYTES_TOTAL) return { error: 'Attachments are too large — keep them under 4 MB in total.' };
        if (!type.ok(buf)) return { error: `"${name}" does not look like a real .${ext} file.` };
        files.push({ name, mime: type.mime, buf, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
    }
    return { files };
}

function accessRequestsRouter({ requireAccessManager, validRolesForApp, defaultGrantedApps = [] }) {
    const router = express.Router();
    const ready = ensureSchema().catch((err) => {
        console.error('[access-requests] Schema init failed:', err.message);
        throw err;
    });
    ready.catch(() => {});
    router.use('/access/requests', async (req, res, next) => {
        try { await ready; next(); } catch { res.status(503).json({ success: false, error: 'Access requests are temporarily unavailable.' }); }
    });

    /** Super Admin only (Admins can manage people, but approving authorization is the Super Admin's call). */
    const requireSuperAdmin = (req, res, next) => requireAccessManager(req, res, async () => {
        try {
            const { rows } = await pool.query('SELECT access_level FROM emami_apps.authorized_users WHERE email = $1', [req.verifiedEmail]);
            if (rows[0]?.access_level !== 'Super Admin') {
                return res.status(403).json({ success: false, error: 'Only a Super Admin can review access requests.' });
            }
            next();
        } catch (err) {
            console.error('[access-requests] Super Admin check failed:', err.message);
            res.status(500).json({ success: false, error: 'Could not verify your access.' });
        }
    });

    const loadItems = async (ids) => {
        if (!ids.length) return {};
        const { rows } = await pool.query(
            `SELECT id, request_id, app_id, role, depot, decision, decision_note, decided_by, decided_at, applied_at
             FROM emami_apps.access_request_items WHERE request_id = ANY($1) ORDER BY app_id, role`, [ids]);
        const by = {};
        for (const r of rows) (by[r.request_id] ||= []).push({
            id: Number(r.id), appId: r.app_id, role: r.role, depot: r.depot, decision: r.decision,
            decisionNote: r.decision_note, decidedBy: r.decided_by, decidedAt: r.decided_at, appliedAt: r.applied_at,
        });
        return by;
    };
    const summarize = (r, items, fileCount = 0) => ({
        id: Number(r.id), ref: refOf(r), firstName: r.first_name, lastName: r.last_name, email: r.email,
        requesterVerified: r.requester_verified, existingUser: r.existing_user, status: r.status,
        justification: r.justification, createdAt: r.created_at, decidedAt: r.decided_at, decidedBy: r.decided_by,
        decisionNote: r.decision_note, items: items || [], fileCount,
    });

    // ── Raise ─────────────────────────────────────────────────────────────────────────────
    router.post('/access/requests', async (req, res) => {
        const ip = clientIp(req);
        try {
            const session = await activeSessionUser(req);
            if (!session && throttled(`submit:${ip}`, 10, 60 * 60 * 1000, false)) {
                return res.status(429).json({ success: false, error: 'Too many requests from this network. Please try again in an hour.' });
            }
            let email = String(req.body?.email || '').trim().toLowerCase();
            let firstName = clean(req.body?.firstName);
            let lastName = clean(req.body?.lastName);
            if (session) {
                email = session.email;
                firstName = clean(session.first_name) || firstName;
                lastName = clean(session.last_name) || lastName;
            }
            if (!EMAIL_RE.test(email) || email.length > 160) return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
            if (!firstName || !lastName) return res.status(400).json({ success: false, error: 'First name and last name are both required.' });
            if (firstName.length > 60 || lastName.length > 60 || /[<>]/.test(firstName + lastName)) {
                return res.status(400).json({ success: false, error: 'Names can be at most 60 characters and cannot contain < or >.' });
            }
            if (!session) {
                const { rows } = await pool.query('SELECT is_active FROM emami_apps.authorized_users WHERE email = $1', [email]);
                if (rows[0]?.is_active) return res.status(409).json({ success: false, error: 'This email already has access to Emami Apps. Sign in, then raise the request from Access Requests in the menu.' });
                if (rows[0] && !rows[0].is_active) return res.status(409).json({ success: false, error: 'This account has been deactivated. Please contact IT.' });
            }
            const justification = clean(req.body?.justification);
            if (justification.length < 10 || justification.length > 2000) {
                return res.status(400).json({ success: false, error: 'Explain why you need this access (10 to 2000 characters).' });
            }
            // Lines: unique (app, role); each role must be valid for that app; Audit & CAPA Depot/View need a depot.
            const seen = new Set();
            const items = [];
            for (const it of Array.isArray(req.body?.items) ? req.body.items : []) {
                const appId = String(it?.appId || '').trim();
                const role = String(it?.role || '').trim();
                const depot = clean(it?.depot) || null;
                if (!APP_ID_RE.test(appId)) return res.status(400).json({ success: false, error: 'One of the selected applications is not valid.' });
                if (!validRolesForApp(appId).includes(role)) return res.status(400).json({ success: false, error: `"${role}" is not a valid role for ${appId}.` });
                if (NEEDS_DEPOT(appId, role) && (!depot || depot.length > 80)) return res.status(400).json({ success: false, error: 'Choose the depot for the Audit & CAPA role.' });
                const key = `${appId}\u0000${role}`;
                if (seen.has(key)) continue;
                seen.add(key);
                items.push({ appId, role, depot: NEEDS_DEPOT(appId, role) ? depot : null });
            }
            if (items.length === 0) return res.status(400).json({ success: false, error: 'Select at least one application and role.' });
            if (items.length > MAX_ITEMS) return res.status(400).json({ success: false, error: 'Too many roles selected in one request.' });
            const parsed = parseFiles(req.body?.files);
            if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });

            const stored = [];
            try {
                for (const f of parsed.files) { f.stored = await writeStoredFile(f.sha256, f.buf); stored.push(f.stored); }
            } catch (err) {
                await removeStoredFiles(stored);
                console.error('[access-requests] Could not store the documents:', err.message);
                return res.status(500).json({ success: false, error: 'Could not store your documents. Please try again.' });
            }
            const client = await pool.connect();
            let request;
            try {
                await client.query('BEGIN');
                const open = await client.query(`SELECT id, created_at FROM emami_apps.access_requests WHERE email = $1 AND status = 'Pending' LIMIT 1`, [email]);
                if (open.rows[0]) {
                    await client.query('ROLLBACK');
                    await removeStoredFiles(stored);
                    return res.status(409).json({ success: false, error: `You already have an open request (${refOf(open.rows[0])}). Wait for it to be reviewed before raising another.` });
                }
                const ins = await client.query(
                    `INSERT INTO emami_apps.access_requests (first_name, last_name, email, requester_verified, existing_user, justification, submitted_ip)
                     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                    [firstName, lastName, email, !!session, !!session, justification, ip]);
                request = ins.rows[0];
                for (const it of items) {
                    await client.query('INSERT INTO emami_apps.access_request_items (request_id, app_id, role, depot) VALUES ($1,$2,$3,$4)', [request.id, it.appId, it.role, it.depot]);
                }
                const actorRole = session ? 'Signed-in user' : 'Requester (not signed in, e-mail unverified)';
                await addEvent(client, request.id, {
                    actor: email, actorRole, ip, type: 'SUBMITTED',
                    detail: `${items.length} role(s): ${items.map((i) => `${i.appId}=${i.role}${i.depot ? ` (${i.depot})` : ''}`).join(', ')}. Justification: ${justification}`,
                });
                for (const f of parsed.files) {
                    await client.query(
                        'INSERT INTO emami_apps.access_request_files (request_id, filename, content_type, size_bytes, sha256, storage_path) VALUES ($1,$2,$3,$4,$5,$6)',
                        [request.id, f.name, f.mime, f.buf.length, f.sha256, f.stored]);
                    await addEvent(client, request.id, { actor: email, actorRole, ip, type: 'FILE_ADDED', detail: `${f.name} (${f.buf.length} bytes, sha256 ${f.sha256})` });
                }
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK').catch(() => {});
                await removeStoredFiles(stored);
                throw err;
            } finally {
                client.release();
            }

            if (!session) throttled(`submit:${ip}`, 10, 60 * 60 * 1000); // only saved requests count against the limit
            const ref = refOf(request);
            // Notifications never fail the request: a mail problem must not lose a ticket that is already saved.
            notify({
                email, appId: 'access-requests', kind: 'info', refKey: `access-req:${request.id}:received`,
                title: `Access request ${ref} received`,
                body: `Hi ${firstName}, we have received your request for ${items.length} role(s). A Super Admin will review it and you will get an email with the outcome. Keep this reference: ${ref}.`,
                onMail: mailLogger(request.id),
            });
            // The approval mail goes only to the fixed approvers below, not to every Super Admin.
            try {
                for (const approver of APPROVAL_MAIL_TO) {
                    notify({
                        email: approver, appId: 'access-requests', kind: 'action', refKey: `access-req:${request.id}:new`,
                        title: `Access request ${ref} needs your approval`,
                        body: `${firstName} ${lastName} (${email}${session ? '' : ', not signed in — email unverified'}) asked for ${items.length} role(s): ${items.map((i) => `${i.appId} / ${i.role}`).join(', ')}.`,
                        link: `/manage-access/?tab=requests&request=${request.id}`,
                        onMail: mailLogger(request.id),
                    });
                }
            } catch (err) { console.error('[access-requests] Could not notify approvers:', err.message); }
            res.json({ success: true, id: Number(request.id), ref, status: request.status });
        } catch (err) {
            console.error('[access-requests] Submit failed:', err.message);
            res.status(500).json({ success: false, error: 'Could not submit your request. Please try again.' });
        }
    });

    // ── Requester views ───────────────────────────────────────────────────────────────────
    router.post('/access/requests/status', async (req, res) => {
        if (throttled(`status:${clientIp(req)}`, 30, 60 * 60 * 1000)) return res.status(429).json({ success: false, error: 'Too many lookups. Please try again later.' });
        const id = idFromRef(req.body?.ref);
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!id || !EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'Enter your reference number and the email you used.' });
        try {
            const { rows } = await pool.query('SELECT * FROM emami_apps.access_requests WHERE id = $1 AND email = $2', [id, email]);
            if (!rows[0]) return res.status(404).json({ success: false, error: 'No request found for that reference and email.' });
            const items = (await loadItems([id]))[id] || [];
            const r = summarize(rows[0], items.map((i) => ({ appId: i.appId, role: i.role, depot: i.depot, decision: i.decision, decisionNote: i.decisionNote, decidedAt: i.decidedAt })));
            delete r.decidedBy; // reviewer identity is for admins
            res.json({ success: true, request: r });
        } catch (err) {
            console.error('[access-requests] Status lookup failed:', err.message);
            res.status(500).json({ success: false, error: 'Could not look up the request.' });
        }
    });

    router.get('/access/requests/mine', async (req, res) => {
        try {
            const me = await activeSessionUser(req);
            if (!me) return res.status(401).json({ success: false, error: 'Please sign in again.' });
            const { rows } = await pool.query('SELECT * FROM emami_apps.access_requests WHERE email = $1 ORDER BY created_at DESC LIMIT 100', [me.email]);
            const items = await loadItems(rows.map((r) => r.id));
            const out = rows.map((r) => {
                const s = summarize(r, items[r.id]);
                delete s.decidedBy;
                return s;
            });
            res.json({ success: true, requests: out });
        } catch (err) {
            console.error('[access-requests] Load mine failed:', err.message);
            res.status(500).json({ success: false, error: 'Could not load your requests.' });
        }
    });

    // ── Super Admin inbox ─────────────────────────────────────────────────────────────────
    router.get('/access/requests/pending-count', requireSuperAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM emami_apps.access_requests WHERE status = 'Pending'`);
            res.json({ success: true, pending: rows[0].n });
        } catch {
            res.status(500).json({ success: false, error: 'Could not load the count.' });
        }
    });

    router.get('/access/requests', requireSuperAdmin, async (req, res) => {
        const status = STATUSES.includes(req.query.status) ? req.query.status : null;
        try {
            const { rows } = await pool.query(
                `SELECT r.*, (SELECT COUNT(*) FROM emami_apps.access_request_files f WHERE f.request_id = r.id)::int AS file_count
                 FROM emami_apps.access_requests r WHERE ($1::text IS NULL OR r.status = $1)
                 ORDER BY (r.status = 'Pending') DESC, r.created_at DESC LIMIT 500`, [status]);
            const items = await loadItems(rows.map((r) => r.id));
            res.json({ success: true, requests: rows.map((r) => summarize(r, items[r.id], r.file_count)) });
        } catch (err) {
            console.error('[access-requests] List failed:', err.message);
            res.status(500).json({ success: false, error: 'Could not load access requests.' });
        }
    });

    router.get('/access/requests/:id', requireSuperAdmin, async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ success: false, error: 'Request not found.' });
        try {
            const { rows } = await pool.query('SELECT * FROM emami_apps.access_requests WHERE id = $1', [id]);
            if (!rows[0]) return res.status(404).json({ success: false, error: 'Request not found.' });
            const r = rows[0];
            const [items, files, events, user, current] = await Promise.all([
                loadItems([id]),
                pool.query('SELECT id, filename, content_type, size_bytes, sha256, uploaded_at FROM emami_apps.access_request_files WHERE request_id = $1 ORDER BY id', [id]),
                pool.query('SELECT id, actor, actor_role, event_type, detail, ip, occurred_at FROM emami_apps.access_request_events WHERE request_id = $1 ORDER BY occurred_at, id', [id]),
                pool.query('SELECT is_active, access_level FROM emami_apps.authorized_users WHERE email = $1', [r.email]),
                pool.query('SELECT app_id, role, depot FROM emami_apps.authorized_user_apps WHERE email = $1', [r.email]),
            ]);
            // Record that an approver opened it (at most once per 30 minutes per approver, so refreshes don't flood the trail).
            const seen = await pool.query(
                `SELECT 1 FROM emami_apps.access_request_events WHERE request_id = $1 AND actor = $2 AND event_type = 'VIEWED' AND occurred_at > now() - interval '30 minutes' LIMIT 1`,
                [id, req.verifiedEmail]);
            if (!seen.rows[0]) await addEvent(pool, id, { actor: req.verifiedEmail, actorRole: 'Super Admin', type: 'VIEWED', ip: clientIp(req) });
            res.json({
                success: true,
                request: {
                    ...summarize(r, items[id], files.rows.length),
                    submittedIp: r.submitted_ip,
                    account: user.rows[0] ? { exists: true, isActive: user.rows[0].is_active, accessLevel: user.rows[0].access_level } : { exists: false },
                    currentGrants: current.rows.map((g) => ({ appId: g.app_id, role: g.role, depot: g.depot })),
                    files: files.rows.map((f) => ({ id: Number(f.id), filename: f.filename, contentType: f.content_type, size: f.size_bytes, sha256: f.sha256, uploadedAt: f.uploaded_at })),
                    events: events.rows.map((e) => ({ id: Number(e.id), actor: e.actor, actorRole: e.actor_role, type: e.event_type, detail: e.detail, ip: e.ip, occurredAt: e.occurred_at })),
                },
            });
        } catch (err) {
            console.error('[access-requests] Detail failed:', err.message);
            res.status(500).json({ success: false, error: 'Could not load this request.' });
        }
    });

    router.get('/access/requests/:id/files/:fileId', async (req, res) => {
        // Super Admin, or the requester themselves. A file link in the browser can't carry a header,
        // so the hub fetches this with authFetch and turns the response into a blob.
        try {
            if (![req.params.id, req.params.fileId].every((v) => /^\d{1,15}$/.test(v))) return res.status(404).json({ success: false, error: 'File not found.' });
            const email = sessionEmail(req);
            if (!email) return res.status(401).json({ success: false, error: 'Please sign in again.' });
            const { rows } = await pool.query(
                `SELECT f.filename, f.content_type, f.data, f.storage_path, r.email AS owner
                 FROM emami_apps.access_request_files f JOIN emami_apps.access_requests r ON r.id = f.request_id
                 WHERE f.id = $1 AND f.request_id = $2`, [Number(req.params.fileId), Number(req.params.id)]);
            if (!rows[0]) return res.status(404).json({ success: false, error: 'File not found.' });
            const lvl = await pool.query('SELECT access_level, is_active FROM emami_apps.authorized_users WHERE email = $1', [email]);
            const isSuper = lvl.rows[0]?.is_active && lvl.rows[0]?.access_level === 'Super Admin';
            if (!isSuper && email !== rows[0].owner) return res.status(403).json({ success: false, error: 'You cannot open this file.' });
            await addEvent(pool, Number(req.params.id), { actor: email, actorRole: isSuper ? 'Super Admin' : 'Requester', type: 'FILE_DOWNLOADED', detail: rows[0].filename, ip: clientIp(req) });
            res.set({
                'Content-Type': rows[0].content_type,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(rows[0].filename)}"`,
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'no-store',
            });
            let body = rows[0].data;
            if (rows[0].storage_path) {
                body = await fs.promises.readFile(path.join(FILES_DIR, path.basename(rows[0].storage_path))).catch(() => null);
            }
            if (!body) return res.status(404).json({ success: false, error: 'This document is no longer available on the server.' });
            res.send(body);
        } catch (err) {
            console.error('[access-requests] File download failed:', err.message);
            res.status(500).json({ success: false, error: 'Could not open the file.' });
        }
    });

    // ── Decide ────────────────────────────────────────────────────────────────────────────
    router.post('/access/requests/:id/decision', requireSuperAdmin, async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ success: false, error: 'Request not found.' });
        const admin = req.verifiedEmail;
        const ip = clientIp(req);
        const sendBack = req.body?.sendBack === true;
        const overallNote = clean(req.body?.note).slice(0, 1000);
        const client = await pool.connect();
        const applied = []; // collected inside the transaction, side-effected after COMMIT
        let request;
        let decidedItems;
        let createdUser = false;
        try {
            await client.query('BEGIN');
            const lock = await client.query('SELECT * FROM emami_apps.access_requests WHERE id = $1 FOR UPDATE', [id]);
            request = lock.rows[0];
            if (!request) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Request not found.' }); }
            if (request.status !== 'Pending') { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'This request has already been decided.' }); }
            if (request.email === admin) { await client.query('ROLLBACK'); return res.status(403).json({ success: false, error: 'You cannot decide your own request — another Super Admin must review it.' }); }

            const pending = (await client.query(`SELECT * FROM emami_apps.access_request_items WHERE request_id = $1 AND decision = 'Pending' FOR UPDATE`, [id])).rows;
            const wanted = new Map();
            if (sendBack) {
                if (overallNote.length < 5) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'Tell the requester why it is being sent back.' }); }
                for (const it of pending) wanted.set(Number(it.id), { decision: 'Rejected', note: overallNote });
            } else {
                for (const d of Array.isArray(req.body?.decisions) ? req.body.decisions : []) {
                    const decision = d?.decision === 'Approved' ? 'Approved' : d?.decision === 'Rejected' ? 'Rejected' : null;
                    const note = clean(d?.note).slice(0, 500);
                    if (!decision) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'Each line must be approved or rejected.' }); }
                    if (decision === 'Rejected' && note.length < 5) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'Give a reason for every rejected line.' }); }
                    wanted.set(Number(d.itemId), { decision, note });
                }
                if (wanted.size !== pending.length || pending.some((it) => !wanted.has(Number(it.id)))) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, error: 'Decide every line of the request.' });
                }
            }
            const approved = pending.filter((it) => wanted.get(Number(it.id)).decision === 'Approved');
            const perApp = new Set();
            for (const it of approved) {
                if (perApp.has(it.app_id)) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'A person holds one role per application — approve only one role for each app.' }); }
                perApp.add(it.app_id);
            }

            if (approved.length > 0) {
                const au = (await client.query('SELECT is_active FROM emami_apps.authorized_users WHERE email = $1 FOR UPDATE', [request.email])).rows[0];
                if (au && !au.is_active) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'This account is deactivated. Reactivate it in People first, then approve.' }); }
                if (!au) {
                    // Scenario 2: the person could not sign in. Approving creates the login (Viewer, like Add User) + the same defaults.
                    await client.query(
                        'INSERT INTO emami_apps.authorized_users (email, first_name, last_name) VALUES ($1,$2,$3)',
                        [request.email, request.first_name, request.last_name]);
                    if (defaultGrantedApps.length > 0) {
                        await client.query(
                            `INSERT INTO emami_apps.authorized_user_apps (email, app_id, role)
                             SELECT $1, app_id, 'User' FROM UNNEST($2::text[]) AS app_id ON CONFLICT (email, app_id) DO NOTHING`,
                            [request.email, defaultGrantedApps]);
                    }
                    await client.query('UPDATE emami_apps.users SET name = $2 WHERE email = $1', [request.email, `${request.first_name} ${request.last_name}`]);
                    createdUser = true;
                    await addEvent(client, id, { actor: admin, actorRole: 'Super Admin', type: 'USER_CREATED', detail: `Sign-in enabled for ${request.email}`, ip });
                }
                for (const it of approved) {
                    const before = (await client.query('SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [request.email, it.app_id])).rows[0];
                    await client.query(
                        `INSERT INTO emami_apps.authorized_user_apps (email, app_id, role, depot) VALUES ($1,$2,$3,$4)
                         ON CONFLICT (email, app_id) DO UPDATE SET role = EXCLUDED.role, depot = EXCLUDED.depot,
                           tiles = CASE WHEN emami_apps.authorized_user_apps.role = EXCLUDED.role THEN emami_apps.authorized_user_apps.tiles ELSE NULL END`,
                        [request.email, it.app_id, it.role, it.depot]);
                    applied.push({ appId: it.app_id, role: it.role, depot: it.depot, before: before?.role || null, note: wanted.get(Number(it.id)).note || '' });
                    await client.query('UPDATE emami_apps.access_request_items SET applied_at = now() WHERE id = $1', [it.id]);
                    await addEvent(client, id, { actor: admin, actorRole: 'Super Admin', type: 'GRANT_APPLIED', detail: `${it.app_id}: ${before?.role || 'no access'} -> ${it.role}${it.depot ? ` (${it.depot})` : ''}`, ip });
                }
            }

            for (const it of pending) {
                const d = wanted.get(Number(it.id));
                await client.query(
                    'UPDATE emami_apps.access_request_items SET decision = $2, decision_note = $3, decided_by = $4, decided_at = now() WHERE id = $1',
                    [it.id, d.decision, d.note || null, admin]);
                await addEvent(client, id, {
                    actor: admin, actorRole: 'Super Admin', ip,
                    type: d.decision === 'Approved' ? 'ITEM_APPROVED' : 'ITEM_REJECTED',
                    detail: `${it.app_id} / ${it.role}${d.note ? ` — ${d.note}` : ''}`,
                });
            }
            decidedItems = (await client.query('SELECT app_id, role, decision, decision_note FROM emami_apps.access_request_items WHERE request_id = $1 ORDER BY app_id, role', [id])).rows;
            const nApproved = decidedItems.filter((i) => i.decision === 'Approved').length;
            const status = nApproved === 0 ? 'Rejected' : nApproved === decidedItems.length ? 'Approved' : 'Partially Approved';
            await client.query('UPDATE emami_apps.access_requests SET status = $2, decided_at = now(), decided_by = $3, decision_note = $4 WHERE id = $1', [id, status, admin, overallNote || null]);
            await addEvent(client, id, {
                actor: admin, actorRole: 'Super Admin', ip,
                type: sendBack ? 'SENT_BACK' : 'REQUEST_DECIDED',
                detail: `${status}: ${nApproved} of ${decidedItems.length} approved${overallNote ? `. Note: ${overallNote}` : ''}`,
            });
            await client.query('COMMIT');
            request.status = status;
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('[access-requests] Decision failed:', err.message);
            return res.status(500).json({ success: false, error: 'Could not save the decision. Nothing was changed.' });
        } finally {
            client.release();
        }

        // After COMMIT — same side effects Manage Access has, none of which may fail the (already saved) decision.
        const label = `${request.first_name} ${request.last_name}`;
        const incident = { incidentId: id, incidentRef: refOf(request), incidentNote: `Requested: ${request.justification}`.slice(0, 600) };
        if (createdUser) {
            recordAccessChange({ targetEmail: request.email, changedBy: admin, changeType: 'USER_ADDED', newValue: label, ...incident });
            invalidatePeopleDirectory();
        }
        for (const g of applied) {
            if (g.appId === 'audit-capa') {
                syncAuditCapaAccess(pool, request.email, g.role, g.depot).catch((e) => console.error('[access-requests] Audit & CAPA sync failed for', request.email, ':', e.message));
            }
            if (g.before !== g.role) {
                recordAccessChange({ targetEmail: request.email, changedBy: admin, changeType: 'APP_ROLE', appId: g.appId, oldValue: g.before, newValue: g.role, ...incident, incidentNote: [incident.incidentNote, g.note ? `Approver: ${g.note}` : ''].filter(Boolean).join(' | ').slice(0, 900) });
            }
        }
        const lines = decidedItems.map((i) => `• ${i.app_id} / ${i.role}: ${i.decision}${i.decision_note ? ` — ${i.decision_note}` : ''}`).join('\n');
        const ref = refOf(request);
        const headline = request.status === 'Approved' ? 'approved' : request.status === 'Rejected' ? (sendBack ? 'sent back' : 'rejected') : 'partly approved';
        notify({
            email: request.email, appId: 'access-requests', kind: 'info', refKey: `access-req:${id}:decided`,
            title: `Access request ${ref} ${headline}`,
            body: `${overallNote ? `${overallNote}\n\n` : ''}${lines}\n\n${request.status === 'Rejected' ? 'You can raise a new request with the corrections above.' : `You can sign in at ${APP_URL} to use your access.`}`,
            onMail: mailLogger(id),
        });
        res.json({ success: true, status: request.status });
    });

    return router;
}

module.exports = { accessRequestsRouter };
