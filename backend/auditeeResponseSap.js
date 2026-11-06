/*
   SAP side of the Auditee Response app (embedded-apps/auditee-response): OData V2 client of ZIT_MSD_TOOL_INTERNAL_AUDIT_SRV and
   the ONE mapping module between that service and the app's JSON (section "MAPPING" below). Server only: the browser never
   calls SAP and never sees a credential. Replaces the Web Dynpro ZAUDIT_TOOL (identity from a URL parameter, see
   embedded-apps/auditee-response/README.md). Both tracks: AUDIT and MIS.

   Settings (backend .env):
     AUD_SAP_ODATA_BASE   the service URL, e.g. https://<azure gateway>/api/EDS/ZIT_MSD_TOOL_INTERNAL_AUDIT_SRV
                          or https://<host>/sap/opu/odata/sap/ZIT_MSD_TOOL_INTERNAL_AUDIT_SRV                 (required for live mode)
     AUD_SAP_CLIENT       sap-client (sent as URL parameter and header)                                       (optional)
     AUD_SAP_AUTH         gateway (default) | basic
                            gateway : the Azure SAP gateway signs in with its technical user; the verified hub user's e-mail
                                      travels in the header AUD_SAP_USER_HEADER. SAP trusts that header ONLY when the gateway's
                                      SAP user is listed in TVARVC ZAUDIT_HUB_TECH_USER, and maps the e-mail to
                                      ZIT_MSD_USR_MSTR-UNAME (the effective user).
                            basic   : AUD_SAP_USER / AUD_SAP_PASSWORD (development only). The e-mail header is sent as well, so
                                      a dev user listed in ZAUDIT_HUB_TECH_USER behaves like the gateway.
     AUD_SAP_USER_HEADER  header that carries the verified hub user's e-mail (default X-Emami-User)
     AUD_DRAFTS           browser (default, = as built) | sap
                            browser : drafts live only in the user's browser; the only SAP write is "Submit my response"
                                      (an assignee side counts as answered when its comment is non-empty). As built: SAP has no
                                      free field for a per-assignee "submitted" marker, so this is the mode to use.
                            sap     : only for a later SAP build with a per-side submitted marker: "Save draft" stores the comment

   Status: aligned with "SAP OData — as built" of fix/AUDITEE-CONTRACT.md (code ready, not yet deployed on EDS) and the owner update
   (per-assignee submit, MIS track). Everything that still depends on how SAP finally builds that update is marked TODO(sap-contract)
   and lives in the MAPPING section only.
*/
const env = (k, d = '') => String(process.env[k] ?? d).trim();

class SapError extends Error {
    constructor(message, status = 502) { super(message); this.status = status; }
}

const config = () => ({
    base: env('AUD_SAP_ODATA_BASE').replace(/\/+$/, ''),
    client: env('AUD_SAP_CLIENT'),
    mode: env('AUD_SAP_AUTH', 'gateway').toLowerCase(),
    user: env('AUD_SAP_USER'),
    password: env('AUD_SAP_PASSWORD'),
    userHeader: env('AUD_SAP_USER_HEADER', 'X-Emami-User') || 'X-Emami-User',
    drafts: env('AUD_DRAFTS', 'browser').toLowerCase() === 'sap' ? 'sap' : 'browser',
});

const isConfigured = () => !!config().base;

/** The one place that decides how a call authenticates to SAP. caller = { email } (the VERIFIED hub user, never client input). */
function sapAuth(caller) {
    const c = config();
    const h = caller && caller.email ? { [c.userHeader]: caller.email } : {};
    if (c.mode === 'basic' && c.user) h.Authorization = `Basic ${Buffer.from(`${c.user}:${c.password}`).toString('base64')}`;
    return h;
}

function baseUrl() {
    const { base } = config();
    if (!base) throw new SapError('The SAP connection for Auditee Response is not configured on the server (AUD_SAP_ODATA_BASE).', 503);
    return base;
}

/** <base>/<path> with sap-client added as URL parameter when configured. */
function url(path) {
    const { client } = config();
    const u = `${baseUrl()}/${path}`;
    return client ? `${u}${u.includes('?') ? '&' : '?'}sap-client=${encodeURIComponent(client)}` : u;
}

function headersFor(caller, extra = {}) {
    const { client } = config();
    return { Accept: 'application/json', ...(client ? { 'sap-client': client } : {}), ...sapAuth(caller), ...extra };
}

const sessions = new Map(); // email -> { token, cookies, at }
const TTL = 15 * 60 * 1000;

async function csrf(caller, force = false) {
    const cur = sessions.get(caller.email);
    if (!force && cur && Date.now() - cur.at < TTL) return cur;
    let res;
    try {
        res = await fetch(url(''), { method: 'GET', headers: headersFor(caller, { 'x-csrf-token': 'Fetch' }), cache: 'no-store' });
    } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    await res.arrayBuffer().catch(() => null);
    const s = {
        token: res.headers.get('x-csrf-token') || '',
        cookies: (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []).map((x) => x.split(';')[0]).join('; '),
        at: Date.now(),
    };
    sessions.set(caller.email, s);
    return s;
}

const safeJson = (t) => { try { return JSON.parse(t); } catch { return { raw: t }; } };

/**
 * SAP Gateway error body -> { status, message } for the app. SAP's business exceptions are all HTTP 400 with a plain-English text
 * (passed on as is); known texts get a more precise HTTP code: 403 not an auditee / not mine, 409 wrong status / locked /
 * changed meanwhile. 5xx from SAP become 502 (the hub backend is fine, SAP is not).
 */
function mapError(body, status) {
    const e = body && body.error;
    const given = (e && e.message && (typeof e.message === 'string' ? e.message : e.message.value)) || '';
    const ref = e && e.innererror && e.innererror.transactionid ? ` (SAP transaction ${e.innererror.transactionid})` : '';
    const message = given || `SAP returned HTTP ${status} without a message${ref}.`;
    let code;
    if (/not set up as an auditee|no user master|only respond to observations assigned to you|not assigned to you|not authori[sz]ed|only delete attachments that you uploaded|you are not the performer|you are not an assignee/i.test(message)) code = 403;
    else if (/being edited by|changed by another user|can only respond while|can only be added or removed while/i.test(message)) code = 409;
    else if (/was not found/i.test(message)) code = 404;
    else if (status === 401 || status === 403 || status === 404) code = status;
    else if (status >= 500 || status < 400) code = 502;
    else code = 400;
    return { status: code, message };
}

async function request(caller, method, path, body, retry = true) {
    const write = method !== 'GET';
    const s = write ? await csrf(caller) : undefined;
    const headers = headersFor(caller, {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(s && s.token ? { 'x-csrf-token': s.token } : {}),
        ...(s && s.cookies ? { Cookie: s.cookies } : {}),
    });
    let res;
    try {
        res = await fetch(url(path), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    if (res.status === 403 && write && retry && (res.headers.get('x-csrf-token') || '').toLowerCase() === 'required') {
        await res.arrayBuffer().catch(() => null);
        await csrf(caller, true);
        return request(caller, method, path, body, false);
    }
    const text = await res.text();
    const json = text ? safeJson(text) : {};
    if (!res.ok) {
        const m = mapError(json, res.status);
        throw new SapError(m.message, m.status);
    }
    return json;
}

const results = (json) => (json && json.d && (json.d.results || (Array.isArray(json.d) ? json.d : null))) || [];
const odata = {
    get: (caller, path) => request(caller, 'GET', path),
    post: (caller, path, body) => request(caller, 'POST', path, body),
};

// ===================================================================================================================== MAPPING
// Everything below knows the SAP names. Adjust here (and only here) when the contract's "SAP OData — as built" changes.

const TRACKS = ['audit', 'mis'];
const SET = { workpaper: 'ZSTR_MSD_PROCESS_AUDITSet', attachment: 'ObservationAttachementSet', users: 'ZUSER_MASTERSet' };
const NAV = { items: 'OBSERVATION', assignees: 'EmailTable' };
const STATUS = { toAuditee: 'Send to Auditee', responded: 'Management Responded', closed: 'Close', misClosed: 'MIS Close' };
const STATUS_TEXT = { [STATUS.toAuditee]: 'Awaiting response', [STATUS.responded]: 'Management responded', [STATUS.closed]: 'Closed', [STATUS.misClosed]: 'Closed' };
// As built (update, not yet verified on EDS): list Action 'A' = AUDIT, 'B' = MIS; submit Action 'T' = AUDIT, 'M' = MIS.
const READ_ACTION = { audit: 'A', mis: 'B' };
const WRITE_ACTION = { audit: 'T', mis: 'M' };

const enc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const str = (v) => (v === null || v === undefined ? '' : String(v));
const lower = (v) => str(v).trim().toLowerCase();
const isX = (v) => v === true || v === 'X' || v === 'x';
/** Line item numbers come as '0001' or '1': compare without leading zeros. */
const normLine = (v) => str(v).trim().replace(/^0+(?=.)/, '');
const trackOf = (t) => (TRACKS.includes(t) ? t : 'audit');

/** Edm.DateTime "/Date(ms)/", "YYYYMMDD" or ISO -> "YYYY-MM-DD" ('' when empty / 00000000). */
function isoDate(v) {
    const s = str(v).trim();
    const m = /\/Date\((-?\d+)/.exec(s);
    if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
    if (/^\d{8}$/.test(s)) return s === '00000000' ? '' : `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return '';
}

/** GET of my workpapers of one track: the deep read with the auditee action and optional FY (as built, section 1). */
function listPath(track, fy) {
    const f = [`Action eq ${enc(READ_ACTION[trackOf(track)])}`];
    if (fy) f.push(`Gjahr eq ${enc(fy)}`);
    return `${SET.workpaper}?$filter=${encodeURIComponent(f.join(' and '))}&$expand=${NAV.items}/${NAV.assignees}`;
}

/** Workpaper GUID = OBSERVATION[].ObsrvnGuid (as built); the header's own field if SAP ever sends one. */
function guidOf(raw) {
    const items = (raw[NAV.items] && raw[NAV.items].results) || [];
    return str(raw.ObsrvnGuid || (items[0] && items[0].ObsrvnGuid)).trim();
}

/**
 * User master (ZIT_MSD_USR_MSTR via ZUSER_MASTERSet) -> { byEmail, byUname }. Needed because SAP returns every assignee row of my
 * observations and my role is "PersonResUname = me / OwnerUname = me" (as built), so the backend must know my SAP user name.
 * TODO(sap-contract): field names Email / Uname / Fname / Lname of ZUSER_MASTERSet (Uname is used by the audit tool; Email assumed).
 * Simpler for everyone: SAP adds MyRole ('P' / 'O' / 'B') on each assignee row; rolesOf already prefers it.
 */
function toDirectory(rows) {
    const byEmail = new Map();
    const byUname = new Map();
    for (const u of rows) {
        const uname = str(u.Uname).trim().toUpperCase();
        const name = [str(u.Fname || u.FirstName), str(u.Lname || u.LastName)].join(' ').trim() || str(u.FullName || u.Name).trim() || uname;
        if (uname) byUname.set(uname, name);
        const mail = lower(u.Email || u.EmailId || u.Mail);
        if (mail && uname) byEmail.set(mail, uname);
    }
    return { byEmail, byUname };
}

/**
 * My role on one assignee row: { pr, owner } (both true = I am both on the same row, WD-14). Order: an explicit MyRole on the row,
 * then my SAP user name against PersonResUname / OwnerUname (as built).
 */
function rolesOf(row, me) {
    if (row.MyRole) {
        const r = lower(row.MyRole);
        return { pr: r.startsWith('p') || r === 'b', owner: r.startsWith('o') || r === 'b' };
    }
    const u = str(me).trim().toUpperCase();
    return { pr: !!u && str(row.PersonResUname).trim().toUpperCase() === u, owner: !!u && str(row.OwnerUname).trim().toUpperCase() === u };
}

/**
 * Has one side (pr / owner) of an assignee row been SUBMITTED? As built: drafts live in the browser, so a non-empty comment means
 * submitted. The marker fields (PersonResSubmitted / OwnerSubmitted) exist only for a possible later SAP build with drafts in SAP.
 */
function sideSubmitted(row, side, drafts) {
    const marker = side === 'pr' ? row.PersonResSubmitted : row.OwnerSubmitted;
    if (marker !== undefined && marker !== null && marker !== '') return isX(marker);
    if (drafts === 'sap') return false;
    return str(side === 'pr' ? row.PersonResComment : row.OwnerComment).trim() !== '';
}

const CATEGORIES = [['OsrvtnCatProc', 'Process'], ['OsrvtnCatCost', 'Cost savings'], ['OsrvtnCatRegu', 'Regulatory compliance'], ['OsrvtnCatOthr', 'Others'], ['OsrvtnScatP1', 'P1'], ['OsrvtnScatP2', 'P2'], ['OsrvtnScatP3', 'P3']];

/**
 * One SAP workpaper (deep) -> the app's workpaper JSON (contract shape + track, mySubmitted, waitingFor, draftStorage).
 * ctx = { email, me (SAP user name), names (Map uname -> name), drafts, attachmentsCount }.
 */
function toWorkpaper(raw, track, ctx) {
    const drafts = ctx.drafts || config().drafts;
    const status = str(raw.Status).trim();
    const items = (raw[NAV.items] && raw[NAV.items].results) || [];
    const observations = [];
    const waiting = new Set();
    let mineAll = true;
    const nameOf = (uname, given) => str(given).trim() || (ctx.names && ctx.names.get(str(uname).trim().toUpperCase())) || str(uname).trim();
    for (const it of items) {
        const rows = (it[NAV.assignees] && it[NAV.assignees].results) || [];
        for (const row of rows) {
            const role = rolesOf(row, ctx.me);
            // other assignees: who has not submitted yet
            if (!role.pr && str(row.PersonResUname).trim() && !sideSubmitted(row, 'pr', drafts)) waiting.add(nameOf(row.PersonResUname, row.PersonResponsible));
            if (!role.owner && str(row.OwnerUname).trim() && !sideSubmitted(row, 'owner', drafts)) waiting.add(nameOf(row.OwnerUname, row.OwnerName));
            if (!role.pr && !role.owner) continue;
            const side = role.pr ? 'pr' : 'owner';
            if (!sideSubmitted(row, side, drafts) || (role.pr && role.owner && !sideSubmitted(row, 'owner', drafts))) mineAll = false;
            observations.push({
                lineItem: normLine(it.Lineitem),
                ownerLineItem: normLine(row.OwLineitem),
                myRole: role.pr ? 'PERSON_RESPONSIBLE' : 'OWNER',
                title: str(it.ObservationTitle),
                observation: str(it.Observation),
                rootCause: str(it.RootCause),
                businessImplication: str(it.BusinessImplication),
                recommendation: str(it.Recommendation),
                managementResponse: str(it.ManagementResponse),
                financialImpact: str(it.FinancialImpact).trim(),
                risk: str(it.GrossRisk),
                residualRisk: str(it.ResidualRisk),
                timeline: isoDate(it.Timeline),
                categories: CATEGORIES.filter(([k]) => isX(it[k])).map(([, label]) => label),
                myResponse: role.pr ? str(row.PersonResComment) : str(row.OwnerComment),
                attachmentsCount: Number(it.AttachmentsCount ?? 0) || 0, // attachments belong to the workpaper; per observation only if SAP sends it
            });
        }
    }
    observations.sort((a, b) => Number(a.lineItem) - Number(b.lineItem) || Number(a.ownerLineItem) - Number(b.ownerLineItem));
    // As built (update): an assignee side counts as answered when its comment is non-empty; re-submitting while the workpaper is still
    // "Send to Auditee" overwrites my own text, so I can keep responding until the last assignee has submitted.
    const mySubmitted = observations.length > 0 && mineAll;
    const canRespond = status === STATUS.toAuditee;
    // As built (update): header MailText = display names of every assignee side still pending, separated by "; ". The computed list
    // is only a fallback for a build without it (other people's comments come back empty, so it can over-report).
    const waitingFor = status !== STATUS.toAuditee ? [] : raw.MailText !== undefined && raw.MailText !== null
        ? str(raw.MailText).split(';').map((s) => s.trim()).filter(Boolean)
        : [...waiting].sort();
    return {
        guid: guidOf(raw),
        track: trackOf(track),
        fy: str(raw.Gjahr),
        scheduling: str(raw.Scheduling),
        period: str(raw.Period),
        legalEntity: str(raw.LglEnt),
        location: str(raw.SubLglEntL1),
        city: str(raw.SubLglEntL2),
        process: str(raw.Process),
        subProcess: str(raw.SubProcess),
        status,
        statusText: STATUS_TEXT[status] || status,
        performer: nameOf(raw.PerformerU, raw.PerformerName),
        reviewer: nameOf(raw.ReviewerU, raw.ReviewerName),
        canRespond,
        canSubmit: canRespond && observations.length > 0 && observations.every((o) => o.myResponse.trim() !== ''),
        mySubmitted,
        waitingFor,
        draftStorage: drafts,
        attachmentsCount: ctx.attachmentsCount || 0,
        observations,
    };
}

const HEADER_FIELDS = ['ControlNumber', 'Gjahr', 'LglEnt', 'SubLglEntL1', 'SubLglEntL2', 'BpGud', 'Process', 'SubProcess', 'Scheduling', 'Period'];

/**
 * Deep create for save draft (status unchanged) or submit ("Management Responded"; with the owner update SAP moves the workpaper only
 * when the last assignee has submitted). As built, section 2/3: the header keys from the list row SAP just returned to this user, and
 * ONLY my own assignee rows with my comment side(s). byKey: Map "<lineItem>|<ownerLineItem>" -> text.
 */
function savePayload(raw, track, byKey, me, newStatus) {
    const items = [];
    for (const it of (raw[NAV.items] && raw[NAV.items].results) || []) {
        const rows = [];
        for (const row of (it[NAV.assignees] && it[NAV.assignees].results) || []) {
            const role = rolesOf(row, me);
            if (!role.pr && !role.owner) continue;
            const k = `${normLine(it.Lineitem)}|${normLine(row.OwLineitem)}`;
            const r = { Lineitem: str(row.Lineitem) || str(it.Lineitem), OwLineitem: str(row.OwLineitem) };
            const text = byKey.has(k) ? byKey.get(k) : null;
            if (role.pr) r.PersonResComment = text ?? str(row.PersonResComment);
            if (role.owner) r.OwnerComment = text ?? str(row.OwnerComment);
            rows.push(r);
        }
        if (rows.length) items.push({ ObsrvnGuid: str(it.ObsrvnGuid), Lineitem: str(it.Lineitem), FinancialYear: str(it.FinancialYear || raw.Gjahr), [NAV.assignees]: rows });
    }
    const head = Object.fromEntries(HEADER_FIELDS.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
    return { Action: WRITE_ACTION[trackOf(track)], ...head, Status: newStatus, EmailId: '', UserType: 'A', [NAV.items]: items };
}

// ---- attachments (ObservationAttachementSet, keyed by the workpaper's control number / FY / org / process / period; as built, section 4)
// TODO(sap-contract): the MIS track is assumed to use the same entity set and keys.
const ATT_KEYS = ['ControlNumber', 'Gjahr', 'SubLglEntL1', 'SubLglEntL2', 'Process', 'Scheduling', 'Period', 'SubProcess'];
const attKey = (raw) => Object.fromEntries(ATT_KEYS.map((k) => [k, str(raw[k])]));
function attachmentListPath(raw) {
    const f = ATT_KEYS.map((k) => `${k} eq ${enc(str(raw[k]))}`).join(' and ');
    return `${SET.attachment}?$filter=${encodeURIComponent(f)}`;
}
/** Keyed read of one file (as built). */
function attachmentPath(raw, fileName) {
    const k = { Action: '', ControlNumber: raw.ControlNumber, Gjahr: raw.Gjahr, Scheduling: raw.Scheduling, Period: raw.Period, SubLglEntL1: raw.SubLglEntL1, SubLglEntL2: raw.SubLglEntL2, Process: raw.Process, SubProcess: raw.SubProcess, Filename: fileName };
    return `${SET.attachment}(${Object.entries(k).map(([n, v]) => `${n}=${encodeURIComponent(enc(str(v)))}`).join(',')})`;
}

/** One attachment row -> app JSON. Action 'O' marks files uploaded by me (as built); e-mail fallback for older builds. */
function toAttachment(a, email) {
    const uploader = lower(a.Email || a.UploadedBy);
    return {
        name: str(a.Filename),
        mimeType: str(a.Mimetype) || 'application/octet-stream',
        annexure: isX(a.Annexture),
        byAuditee: isX(a.PersonResFlg) || str(a.Action) === 'O',
        uploadedBy: uploader,
        mine: str(a.Action) === 'O' || (!!uploader && uploader === lower(email)),
    };
}

/**
 * File content of a row. The stored content is the base64 text the UI sent (the audit tool posts base64 of the base64), returned as
 * Edm.Binary (base64 again on the wire): decode, and decode again while the result is clean base64 (as built, section 4).
 */
function decodeContent(value) {
    let buf = Buffer.from(str(value).replace(/^data:[^;]*;base64,/, '').trim(), 'base64');
    for (let i = 0; i < 2 && buf.length; i += 1) {
        const text = buf.toString('latin1').replace(/^data:[^;]*;base64,/, '').replace(/[\r\n]/g, '');
        if (!text || !/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) break;
        buf = Buffer.from(text, 'base64');
    }
    return buf;
}

/** Upload body: Value = base64(base64(fileBytes)) (as built). */
function uploadPayload(raw, fileName, mimeType, bytes) {
    return { ...attKey(raw), Filename: fileName, Mimetype: mimeType, Value: Buffer.from(bytes.toString('base64'), 'latin1').toString('base64'), Annexture: '' };
}
/** Delete = POST with Action 'D' (the gateway passes no DELETE). */
function deletePayload(raw, fileName) {
    return { ...attKey(raw), Filename: fileName, Value: '', Mimetype: '', Annexture: '', Action: 'D' };
}

const map = { TRACKS, SET, STATUS, STATUS_TEXT, READ_ACTION, WRITE_ACTION, trackOf, listPath, guidOf, toDirectory, rolesOf, sideSubmitted, toWorkpaper, savePayload, attachmentListPath, attachmentPath, toAttachment, decodeContent, uploadPayload, deletePayload, isoDate, normLine };

module.exports = { SapError, isConfigured, sapAuth, mapError, odata, results, map, config, url };
