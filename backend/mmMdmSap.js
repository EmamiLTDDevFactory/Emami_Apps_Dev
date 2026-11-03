/*
   OData V2 client of the Material master service ZMM_MDM_SRV (embedded-apps/mm-mdm). Server only: the browser never
   calls SAP and never sees a credential. CSRF token handling, JSON reads, one $batch change set per action, error mapping.

   Settings (backend .env):
     MM_SAP_ODATA_BASE   e.g. https://<azure gateway>/api/NGQ/ZMM_MDM_SRV            (required for live mode)
     MM_SAP_CLIENT       sap-client                                                    (optional)
     MM_SAP_AUTH         gateway (default) | bearer | basic
                           gateway : the Azure SAP gateway signs in itself (same as the other apps); the hub user is passed in
                                     the header named by MM_SAP_USER_HEADER so the SAP side can tell who is calling
                           bearer  : the real user reaches SAP with a token SAP accepts (OIDC / SAML provider, not named yet).
                                     The token is obtained and kept ON THE SERVER by the registered token provider
                                     (setTokenProvider); the browser never sees it. Until a provider is registered every call
                                     answers 503 "Bearer sign-in is not configured".
                           basic   : one technical user from MM_SAP_USER / MM_SAP_PASSWORD (development only, NOT for production:
                                     SAP workflow and field control depend on the real user)
     MM_SAP_USER_HEADER  header that carries the hub user's e-mail (default X-Emami-User)
     MM_SAP_WRITE        batch (default) | sequential
                           batch      : one $batch change set per action, all writes and the function import succeed or none is stored
                           sequential : for a gateway that only passes GET, POST and PUT (the Azure gateway proxy of NGD/NGQ/NWP does
                                        not pass $batch, MERGE or DELETE): single writes one by one (MERGE is sent as PUT: the SAP
                                        update merges the whole row), then the function import. Not atomic, and Validate then
                                        stores the entered values in the draft (staging only, never the status). Removing a
                                        grid row needs DELETE and is refused with a clear message until the gateway passes it.

   Status: written against the contract in embedded-apps/mm-mdm/odata/metadata.xml; the SAP service is not built yet, so
   nothing here has run against a real Gateway.
*/
const env = (k, d = '') => (process.env[k] ?? d).trim();

class SapError extends Error {
    constructor(message, status = 502, messages = []) { super(message); this.status = status; this.messages = messages; }
}

const config = () => ({
    base: env('MM_SAP_ODATA_BASE').replace(/\/+$/, ''),
    client: env('MM_SAP_CLIENT'),
    mode: env('MM_SAP_AUTH', 'gateway'),
    write: env('MM_SAP_WRITE', 'batch').toLowerCase(),
    user: env('MM_SAP_USER'),
    password: env('MM_SAP_PASSWORD'),
    userHeader: env('MM_SAP_USER_HEADER', 'X-Emami-User'),
});

const isConfigured = () => !!config().base;

function sapSystem() {
    const m = /\/api\/([A-Z0-9]{3})\//i.exec(config().base + '/');
    return m ? m[1].toUpperCase() : '';
}

/**
 * Bearer mode: the token of the signed-in user, from the identity provider the project names later. A provider is an async
 * function (caller) => access token string; it owns the exchange, the refresh and the cache. Tokens stay on the server.
 */
let tokenProvider = null;
function setTokenProvider(fn) { tokenProvider = typeof fn === 'function' ? fn : null; }

/**
 * THE one place that decides how a call authenticates to SAP (rule: authentication lives in one function).
 * caller = { user } where user is the signed-in hub user's e-mail. Resolves to the headers for the SAP request.
 */
async function sapAuth(caller) {
    const c = config();
    if (c.mode === 'basic') {
        return c.user ? { Authorization: `Basic ${Buffer.from(`${c.user}:${c.password}`).toString('base64')}` } : {};
    }
    if (c.mode === 'bearer') {
        if (!tokenProvider) throw new SapError('Bearer sign-in is not configured on the server (no token provider registered yet).', 503);
        const token = await tokenProvider(caller);
        if (!token) throw new SapError('SAP sign-in expired. Sign in to Emami Apps again.', 401);
        return { Authorization: `Bearer ${token}` };
    }
    return caller && caller.user ? { [c.userHeader]: caller.user } : {};
}

function baseUrl() {
    const { base } = config();
    if (!base) throw new SapError('The SAP connection for Material master is not configured on the server (MM_SAP_ODATA_BASE).', 503);
    return base;
}

async function headersFor(caller, extra = {}) {
    const { client } = config();
    return { Accept: 'application/json', ...(client ? { 'sap-client': client } : {}), ...(await sapAuth(caller)), ...extra };
}

const sessions = new Map(); // user -> { token, cookies, at }
const TTL = 15 * 60 * 1000;

async function csrf(caller, force = false) {
    const key = caller.user;
    const cur = sessions.get(key);
    if (!force && cur && Date.now() - cur.at < TTL) return cur;
    let res;
    try {
        res = await fetch(`${baseUrl()}/`, { method: 'GET', headers: await headersFor(caller, { 'x-csrf-token': 'Fetch' }), cache: 'no-store' });
    } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    await res.arrayBuffer().catch(() => null);
    const token = res.headers.get('x-csrf-token') || '';
    const cookies = (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []).map((x) => x.split(';')[0]).join('; ');
    const s = { token, cookies, at: Date.now() };
    sessions.set(key, s);
    return s;
}

const safeJson = (t) => { try { return JSON.parse(t); } catch { return { raw: t }; } };

/** Maps an SAP Gateway error body to messages. One error with several details becomes several messages. */
function mapError(body, status) {
    const e = body && body.error;
    const details = (e && e.innererror && e.innererror.errordetails) || [];
    const sev = (s) => { const x = String(s || 'error').toLowerCase(); return x.startsWith('w') ? 'W' : x.startsWith('i') ? 'I' : 'E'; };
    const messages = details.filter((d) => d.message).map((d) => ({ code: d.code || '', message: d.message, severity: sev(d.severity), target: d.target || '' }));
    const given = e && e.message && e.message.value;
    // SAP sometimes fails inside its own code with an empty text: give the SAP team what they need to find it (/IWFND/ERROR_LOG).
    const ref = e && e.innererror && e.innererror.transactionid ? ` (SAP transaction ${e.innererror.transactionid}${e.innererror.timestamp ? `, ${e.innererror.timestamp}` : ''})` : '';
    const text = given || `SAP returned HTTP ${status} without a message${ref}. The error is inside SAP's service: see /IWFND/ERROR_LOG on the Gateway.`;
    if (!messages.length) messages.push({ code: (e && e.code) || '', message: text, severity: 'E' });
    return { text, messages };
}

function fail(status, json) {
    const m = mapError(json, status);
    return new SapError(m.text, status === 401 || status === 403 ? status : status >= 500 ? 502 : status, m.messages);
}

async function request(caller, method, path, body, retry = true) {
    const write = method !== 'GET';
    const s = write ? await csrf(caller) : undefined;
    const headers = await headersFor(caller, { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(s ? { ...(s.token ? { 'x-csrf-token': s.token } : {}), ...(s.cookies ? { Cookie: s.cookies } : {}) } : {}) });
    let res;
    try {
        res = await fetch(`${baseUrl()}/${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    if (res.status === 403 && write && retry && (res.headers.get('x-csrf-token') || '').toLowerCase() === 'required') {
        await res.arrayBuffer().catch(() => null);
        await csrf(caller, true);
        return request(caller, method, path, body, false);
    }
    const text = await res.text();
    const json = text ? safeJson(text) : {};
    if (!res.ok) throw fail(res.status, json);
    return json;
}

/** Upload a file as the media resource of an entity set (AtomPub convention: body = the bytes, Slug = file name). Returns the created entry. */
async function postStream(caller, path, bytes, { fileName, mimeType }, retry = true) {
    const s = await csrf(caller);
    const headers = await headersFor(caller, { 'Content-Type': mimeType || 'application/octet-stream', Slug: encodeURIComponent(fileName), 'x-csrf-token': s.token, ...(s.cookies ? { Cookie: s.cookies } : {}) });
    let res;
    try {
        res = await fetch(`${baseUrl()}/${path}`, { method: 'POST', headers, body: bytes, cache: 'no-store' });
    } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    if (res.status === 403 && retry && (res.headers.get('x-csrf-token') || '').toLowerCase() === 'required') {
        await res.arrayBuffer().catch(() => null);
        await csrf(caller, true);
        return postStream(caller, path, bytes, { fileName, mimeType }, false);
    }
    const text = await res.text();
    const json = text ? safeJson(text) : {};
    if (!res.ok) throw fail(res.status, json);
    return json;
}

/** Download the media resource of an entity (GET .../$value). Returns { bytes: Buffer, mimeType }. */
async function getStream(caller, path) {
    let res;
    try {
        res = await fetch(`${baseUrl()}/${path}`, { method: 'GET', headers: await headersFor(caller, { Accept: '*/*' }), cache: 'no-store' });
    } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    if (!res.ok) throw fail(res.status, safeJson(await res.text()));
    return { bytes: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get('content-type') || 'application/octet-stream' };
}

const results = (json) => (json && json.d && json.d.results) || [];

const odata = {
    get: (caller, path) => request(caller, 'GET', path),
    post: (caller, path, body) => request(caller, 'POST', path, body),
    del: (caller, path) => request(caller, 'DELETE', path),
    /** Function import with primitive parameters, e.g. fn(c, 'Submit', { TransId: '0000000001' }). */
    fn: (caller, name, params) => {
        const q = Object.entries(params).map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v}`).join('&');
        return request(caller, 'POST', `${name}${q ? `?${q}` : ''}`);
    },
};

/** One change set: all operations succeed or none is stored (the Gateway rolls the whole set back). ops: [{ method, path, body? }] */
async function batchChangeSet(caller, ops, extraHeaders = {}) {
    const s = await csrf(caller);
    const stamp = Date.now().toString(16);
    const b = `batch_${stamp}`;
    const cs = `changeset_${stamp}`;
    let body = `--${b}\r\nContent-Type: multipart/mixed; boundary=${cs}\r\n\r\n`;
    ops.forEach((op, i) => {
        body += `--${cs}\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\nContent-ID: ${i + 1}\r\n\r\n`;
        body += `${op.method} ${op.path} HTTP/1.1\r\nAccept: application/json\r\n`;
        if (op.body !== undefined) body += `Content-Type: application/json\r\n\r\n${JSON.stringify(op.body)}\r\n`; else body += '\r\n';
    });
    body += `--${cs}--\r\n--${b}--\r\n`;
    let res;
    try {
        res = await fetch(`${baseUrl()}/$batch`, {
            method: 'POST',
            headers: await headersFor(caller, { 'Content-Type': `multipart/mixed; boundary=${b}`, ...(s.token ? { 'x-csrf-token': s.token } : {}), ...(s.cookies ? { Cookie: s.cookies } : {}), ...extraHeaders }),
            body,
            cache: 'no-store',
        });
    } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    const text = await res.text();
    if (!res.ok) throw fail(res.status, safeJson(text));
    return parseBatch(text);
}

/**
 * Runs the writes of one action, then its function import (the last op). ops: [{ method, path, body? }]; returns [{ status, json }].
 * batch mode = one change set (atomic). sequential mode = one call per op, for a gateway without $batch / MERGE / DELETE.
 */
async function runWrites(caller, ops, extraHeaders = {}) {
    if (config().write !== 'sequential') return batchChangeSet(caller, ops, extraHeaders);
    const del = ops.find((o) => o.method === 'DELETE');
    if (del) {
        throw new SapError('Removing a row is not possible through this SAP gateway yet (it does not pass DELETE requests).', 501,
            [{ code: 'MM501', message: 'Removing a row is not possible through this SAP gateway yet (it does not pass DELETE requests). Ask the gateway team to allow DELETE, or keep the row.', severity: 'E', target: '' }]);
    }
    const out = [];
    for (const op of ops) {
        const method = op.method === 'MERGE' ? 'PUT' : op.method;
        const json = await request(caller, method, op.path, op.body);
        out.push({ status: 200, json });
    }
    return out;
}

function parseBatch(text) {
    const out = [];
    const re = /HTTP\/1\.1 (\d{3})[^\r\n]*\r?\n([\s\S]*?)(?=\r?\n--)/g;
    let m;
    while ((m = re.exec(text))) {
        const part = m[2];
        const at = part.search(/\r?\n\r?\n/);
        const raw = at >= 0 ? part.slice(at).trim() : '';
        out.push({ status: Number(m[1]), json: raw.startsWith('{') ? safeJson(raw) : {} });
    }
    const failed = out.find((o) => o.status >= 400);
    if (failed) throw fail(failed.status, failed.json);
    return out;
}

module.exports = { SapError, runWrites, writeMode: () => config().write, isConfigured, sapSystem, sapAuth, setTokenProvider, mapError, odata, results, batchChangeSet, parseBatch, postStream, getStream };
