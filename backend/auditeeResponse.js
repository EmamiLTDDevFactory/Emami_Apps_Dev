/*
   Auditee Response (embedded-apps/auditee-response) -> SAP ZIT_MSD_TOOL_INTERNAL_AUDIT_SRV, server side. Mounted at
   /api/me/auditee (rides the existing nginx /api/me rule). Replaces the Web Dynpro ZAUDIT_TOOL: an auditee answers the audit
   observations assigned to them and submits their response. Both tracks: ?track=audit (default) | mis.
   The workpaper moves to "Management Responded" only when the LAST assignee has submitted (SAP decides; owner decision update).

     GET    /health
     GET    /config                                   { draftStorage: 'browser' | 'sap', tracks }
     GET    /observations?track=&fy=YYYY              my workpapers (Send to Auditee / Management Responded / Close)
     GET    /workpapers/:guid?track=                  one workpaper with my observations
     PUT    /workpapers/:guid/responses?track=        { responses: [{ lineItem, ownerLineItem, text }] }  save draft in SAP
                                                      (409 while drafts live in the browser - the as-built SAP side)
     POST   /workpapers/:guid/submit?track=           { responses: [...] }   submit my responses (re-submit allowed while
                                                      the workpaper is still "Send to Auditee")
     GET    /workpapers/:guid/attachments?track=      list (all files of the workpaper; shared by both tracks)
     GET    /workpapers/:guid/attachments/:name/content?track=   download
     POST   /workpapers/:guid/attachments?track=      upload: raw body (Slug = file name) or JSON { fileName, mimeType, contentBase64 }
     DELETE /workpapers/:guid/attachments/:name?track=           delete (own uploads only)

   Identity: the hub session (Bearer JWT, same check as every /api/me module) gives the VERIFIED e-mail; that e-mail - never one
   from the client - goes to SAP in the X-Emami-User header (auditeeResponseSap.js). Access: every active signed-in hub user (the
   app is open to everyone, see OPEN_TO_ALL_APPS in server.js); SAP decides what the user is assigned to.
   Errors: { error: { message } } with a proper HTTP code. Logs: user, route, timing - never texts or files.
*/
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const sap = require('./auditeeResponseSap');

const { map } = sap;
const router = express.Router();

// Transport guards. SAP decides in the end. The comment fields are unlimited strings in SAP; 4000 is the app's own limit.
// Filename is MaxLength 50 in the service.
const MAX_RESPONSE = 4000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'msg', 'eml', 'zip'];
const GUID_RE = /^[A-Za-z0-9-]{1,64}$/;
const FY_RE = /^\d{4}$/;

class HttpError extends Error { constructor(message, status) { super(message); this.status = status; } }
const bad = (m) => new HttpError(m, 400);

// ------------------------------------------------------------------ input validation (pure, unit tested)
function parseTrack(v) {
    if (v === undefined || v === '') return 'audit';
    const s = String(v).trim().toLowerCase();
    if (!map.TRACKS.includes(s)) throw bad('track must be audit or mis.');
    return s;
}
function parseFy(v) {
    if (v === undefined || v === '') return '';
    const s = String(v).trim();
    if (!FY_RE.test(s)) throw bad('The financial year must be four digits, for example 2025.');
    return s;
}
function parseGuid(v) {
    const s = String(v || '').trim();
    if (!GUID_RE.test(s)) throw bad('The workpaper id is not valid.');
    return s;
}
/** { responses: [{ lineItem, ownerLineItem, text }] } -> Map "<line>|<ownerLine>" -> trimmed text. */
function parseResponses(body) {
    const list = body && body.responses;
    if (!Array.isArray(list)) throw bad('responses must be a list.');
    if (list.length > 500) throw bad('Too many responses in one request.');
    const out = new Map();
    for (const r of list) {
        if (!r || typeof r !== 'object') throw bad('Each response needs lineItem, ownerLineItem and text.');
        const line = map.normLine(r.lineItem);
        const owner = map.normLine(r.ownerLineItem);
        if (!/^\d{1,10}$/.test(line) || !/^\d{1,10}$/.test(owner)) throw bad('Each response needs a numeric lineItem and ownerLineItem.');
        if (typeof r.text !== 'string') throw bad(`The response to observation ${line} must be text.`);
        const text = r.text.replace(/\r\n/g, '\n').trim();
        if (text.length > MAX_RESPONSE) throw bad(`The response to observation ${line} is longer than ${MAX_RESPONSE} characters.`);
        out.set(`${line}|${owner}`, text);
    }
    return out;
}
const extOf = (n) => (n.lastIndexOf('.') < 0 ? '' : n.slice(n.lastIndexOf('.') + 1).toLowerCase());
function parseFileName(v) {
    const n = String(v || '').replace(/[\u0000-\u001f]/g, '').trim();
    if (!n || n.length > 50 || /[\\/:*?"<>|]/.test(n) || n.includes('..')) throw bad('The file name is not valid.');
    return n;
}
function checkUpload(fileName, size) {
    if (!size) throw bad('The file is empty.');
    if (size > MAX_UPLOAD_BYTES) throw new HttpError(`The file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`, 413);
    if (!ALLOWED_EXTENSIONS.includes(extOf(fileName))) throw new HttpError(`This file type is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`, 415);
}

// ------------------------------------------------------------------ the service
// The user directory (SAP user name of the caller + display names) is read once and kept for 10 minutes.
let directory = { at: 0, data: null };
const DIRECTORY_TTL = 10 * 60 * 1000;
async function dir(c) {
    if (directory.data && Date.now() - directory.at < DIRECTORY_TTL) return directory.data;
    const data = map.toDirectory(sap.results(await sap.odata.get(c, map.SET.users)));
    directory = { at: Date.now(), data };
    return data;
}
function resetDirectory() { directory = { at: 0, data: null }; }

/** Context for the mapping: my SAP user name and the display names. */
async function ctxOf(c) {
    let d = { byEmail: new Map(), byUname: new Map() };
    try { d = await dir(c); } catch (e) { console.error(`[auditee] user directory unavailable: ${e.message}`); }
    return { email: c.email, me: d.byEmail.get(c.email) || '', names: d.byUname, drafts: sap.config().drafts };
}

async function listRaw(c, track, fy) {
    return sap.results(await sap.odata.get(c, map.listPath(track, fy)));
}
async function loadRaw(c, track, guid) {
    // No keyed read by GUID: the workpaper is found in the user's own list, which SAP restricts to workpapers where the user is an assignee.
    const raw = (await listRaw(c, track, '')).find((w) => map.guidOf(w) === guid);
    if (!raw) throw new HttpError('This workpaper was not found, or it is not assigned to you.', 404);
    return raw;
}
async function attachmentsRaw(c, raw) {
    return sap.results(await sap.odata.get(c, map.attachmentListPath(raw)));
}

/** Checks the responses against MY observations of this workpaper and returns them merged with what SAP has. */
function mergeResponses(wp, byKey) {
    const mine = new Map(wp.observations.map((o) => [`${o.lineItem}|${o.ownerLineItem}`, o]));
    for (const k of byKey.keys()) if (!mine.has(k)) throw new HttpError(`Observation ${k.split('|')[0]} is not one of your observations in this workpaper.`, 403);
    const merged = new Map();
    for (const [k, o] of mine) merged.set(k, byKey.has(k) ? byKey.get(k) : o.myResponse.trim());
    return merged;
}

function noMine(wp) {
    if (!wp.observations.length) throw new HttpError('None of the observations of this workpaper could be matched to your SAP user. Ask the audit team to check your user master entry (ZIT_MSD_USR_MSTR).', 403);
}

const service = {
    config: () => ({ draftStorage: sap.config().drafts, tracks: map.TRACKS }),
    async list(c, track, fy) {
        const ctx = await ctxOf(c);
        return (await listRaw(c, track, fy)).map((w) => map.toWorkpaper(w, track, ctx)).filter((w) => w.guid);
    },
    async get(c, track, guid) {
        const raw = await loadRaw(c, track, guid);
        const ctx = await ctxOf(c);
        try { ctx.attachmentsCount = (await attachmentsRaw(c, raw)).length; } catch { /* the count is a hint only */ }
        return map.toWorkpaper(raw, track, ctx);
    },
    async save(c, track, guid, byKey) {
        if (sap.config().drafts !== 'sap') throw new HttpError('Drafts are kept in your browser for this app; only "Submit my response" is stored in SAP.', 409);
        const raw = await loadRaw(c, track, guid);
        const ctx = await ctxOf(c);
        const wp = map.toWorkpaper(raw, track, ctx);
        noMine(wp);
        if (!wp.canRespond) throw new HttpError(`This workpaper is "${wp.statusText}": responses can no longer be changed.`, 409);
        await sap.odata.post(c, map.SET.workpaper, map.savePayload(raw, track, mergeResponses(wp, byKey), ctx.me, wp.status));
        return service.get(c, track, guid);
    },
    async submit(c, track, guid, byKey) {
        const raw = await loadRaw(c, track, guid);
        const ctx = await ctxOf(c);
        const wp = map.toWorkpaper(raw, track, ctx);
        noMine(wp);
        if (wp.status !== map.STATUS.toAuditee) throw new HttpError(`This workpaper is "${wp.statusText}": responses can only be submitted while it is awaiting the auditees' response.`, 409);
        const merged = mergeResponses(wp, byKey);
        const missing = wp.observations.filter((o) => !merged.get(`${o.lineItem}|${o.ownerLineItem}`)).map((o) => o.lineItem);
        if (missing.length) throw bad(`Please write a response to every observation assigned to you before submitting. Missing: observation ${[...new Set(missing)].join(', ')}.`);
        // SAP sets "Management Responded" only when every assignee side is answered after this write (as built, update).
        await sap.odata.post(c, map.SET.workpaper, map.savePayload(raw, track, merged, ctx.me, map.STATUS.responded));
        return service.get(c, track, guid);
    },
    async attachments(c, track, guid) {
        const raw = await loadRaw(c, track, guid);
        return (await attachmentsRaw(c, raw)).map((a) => map.toAttachment(a, c.email));
    },
    async readAttachment(c, track, guid, name) {
        const raw = await loadRaw(c, track, guid);
        let row = (await attachmentsRaw(c, raw)).find((a) => String(a.Filename) === name);
        if (!row) throw new HttpError('Attachment not found.', 404);
        if (!row.Value) row = (await sap.odata.get(c, map.attachmentPath(raw, name))).d || row; // keyed read when the list has no content
        const bytes = map.decodeContent(row.Value);
        if (!bytes.length) throw new HttpError('The file is empty or could not be read from SAP.', 502);
        return { fileName: name, mimeType: String(row.Mimetype || 'application/octet-stream'), bytes };
    },
    async upload(c, track, guid, fileName, mimeType, bytes) {
        checkUpload(fileName, bytes.length);
        const raw = await loadRaw(c, track, guid);
        // The status rule is SAP's: attachments are shared by both tracks and allowed while either is "Send to Auditee".
        const existing = await attachmentsRaw(c, raw);
        if (existing.some((a) => String(a.Filename).toLowerCase() === fileName.toLowerCase())) throw new HttpError('A file with this name is already attached. Rename the file and try again.', 409);
        await sap.odata.post(c, map.SET.attachment, map.uploadPayload(raw, fileName, mimeType, bytes));
        return (await attachmentsRaw(c, raw)).map((a) => map.toAttachment(a, c.email));
    },
    async remove(c, track, guid, name) {
        const raw = await loadRaw(c, track, guid);
        const row = (await attachmentsRaw(c, raw)).find((a) => String(a.Filename) === name);
        if (!row) throw new HttpError('Attachment not found.', 404);
        if (!map.toAttachment(row, c.email).mine) throw new HttpError('You can only delete attachments that you uploaded yourself.', 403);
        await sap.odata.post(c, map.SET.attachment, map.deletePayload(raw, name));
        return (await attachmentsRaw(c, raw)).map((a) => map.toAttachment(a, c.email));
    },
};

// ------------------------------------------------------------------ hub session (open to every active signed-in user)
function verifiedEmail(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!m || !JWT_SECRET) return '';
    try {
        const p = jwt.verify(m[1].trim(), JWT_SECRET, { algorithms: ['HS256'] });
        return p && !p.purpose ? String(p.email || '').trim().toLowerCase() : '';
    } catch { return ''; }
}

const fail = (res, status, message) => res.status(status).json({ error: { message } });

async function requireUser(req, res, next) {
    const email = verifiedEmail(req);
    if (!email) return fail(res, 401, 'Your Emami Apps session has expired or is missing. Please sign in again.');
    try {
        // No Manage Access grant needed (open to all); a deactivated hub user is still refused.
        const user = await pool.query('SELECT is_active FROM emami_apps.authorized_users WHERE email = $1', [email]);
        if (!user.rows.length || user.rows[0].is_active === false) return fail(res, 403, 'Your Emami Apps account is not active. Ask an Emami Apps admin.');
        req.caller = { email };
        next();
    } catch (e) {
        console.error('[auditee] access check', e.message);
        fail(res, 500, 'Could not verify your access.');
    }
}

router.use(requireUser);
router.use(express.json({ limit: '6mb' }));

const handle = (name, fn) => async (req, res) => {
    const t0 = Date.now();
    try {
        const out = await fn(req, res);
        console.info(`[auditee] ${req.caller.email} ${name} ms=${Date.now() - t0}`);
        if (!res.headersSent) res.status(out && out.__status ? out.__status : 200).json(out && out.__status ? out.body : out);
    } catch (e) {
        const known = e instanceof sap.SapError || e instanceof HttpError;
        const status = known ? e.status : 500;
        console.error(`[auditee] ${req.caller.email} ${name} failed (${status}): ${e.message}`);
        if (!res.headersSent) fail(res, status, known ? e.message : 'Unexpected error.');
    }
};
const T = (req) => parseTrack(req.query.track);
const G = (req) => parseGuid(req.params.guid);

router.get('/health', handle('health', async () => {
    if (!sap.isConfigured()) throw new HttpError('The SAP connection for Auditee Response is not configured on the server.', 503);
    return { ok: true };
}));
router.get('/config', handle('config', async () => service.config()));
router.get('/observations', handle('list', (req) => service.list(req.caller, T(req), parseFy(req.query.fy))));
router.get('/workpapers/:guid', handle('get', (req) => service.get(req.caller, T(req), G(req))));
router.put('/workpapers/:guid/responses', handle('save', (req) => service.save(req.caller, T(req), G(req), parseResponses(req.body))));
router.post('/workpapers/:guid/submit', handle('submit', (req) => service.submit(req.caller, T(req), G(req), parseResponses(req.body))));
router.get('/workpapers/:guid/attachments', handle('attachments', (req) => service.attachments(req.caller, T(req), G(req))));
router.get('/workpapers/:guid/attachments/:name/content', handle('attachment-get', async (req, res) => {
    const f = await service.readAttachment(req.caller, T(req), G(req), parseFileName(req.params.name));
    res.set({ 'Content-Type': f.mimeType, 'Content-Length': String(f.bytes.length), 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`, 'X-Content-Type-Options': 'nosniff' });
    res.send(f.bytes);
}));
// Upload, two forms:
//  - raw bytes (what the app sends): body = the file, Content-Type = its MIME type, Slug = URL-encoded file name. The app sends JSON,
//    form and multipart file types as application/octet-stream (the server's global parsers would read them).
//  - JSON { fileName, mimeType, contentBase64 } (scripts / small files; the global JSON parser of server.js caps it at 6 MB).
const cleanMime = (v) => (typeof v === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(v.split(';')[0].trim()) ? v.split(';')[0].trim() : 'application/octet-stream');
router.post('/workpapers/:guid/attachments', express.raw({ type: (r) => !/json/i.test(r.headers['content-type'] || ''), limit: MAX_UPLOAD_BYTES + 1 }), handle('attachment-add', async (req) => {
    const track = T(req);
    const guid = G(req);
    if (Buffer.isBuffer(req.body)) {
        const name = parseFileName((() => { try { return decodeURIComponent(req.get('slug') || ''); } catch { return ''; } })());
        return { __status: 201, body: await service.upload(req.caller, track, guid, name, cleanMime(req.get('content-type')), req.body) };
    }
    const b = req.body || {};
    const name = parseFileName(b.fileName);
    if (typeof b.contentBase64 !== 'string' || !/^[A-Za-z0-9+/=\s]*$/.test(b.contentBase64)) throw bad('contentBase64 must be the file as base64.');
    return { __status: 201, body: await service.upload(req.caller, track, guid, name, cleanMime(b.mimeType), Buffer.from(b.contentBase64, 'base64')) };
}));
router.delete('/workpapers/:guid/attachments/:name', handle('attachment-delete', (req) => service.remove(req.caller, T(req), G(req), parseFileName(req.params.name))));

// Body parser errors (file above the limit, broken JSON) as the same clean JSON as everything else.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
    const status = Number(err.status || err.statusCode) || 500;
    if (status === 413) return fail(res, 413, `The file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
    console.error(`[auditee] ${req.caller ? req.caller.email : '-'} request failed (${status}): ${err.message}`);
    fail(res, status < 500 ? 400 : 500, status < 500 ? 'The request could not be read.' : 'Unexpected error.');
});

module.exports = router;
module.exports._test = { parseTrack, parseFy, parseGuid, parseResponses, parseFileName, checkUpload, mergeResponses, service, HttpError, MAX_RESPONSE, resetDirectory };
