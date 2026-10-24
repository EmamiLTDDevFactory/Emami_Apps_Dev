/*
   SAP OData client for Cascade Pricing (ZMM_CASCADE_SRV). Server only: the browser never calls SAP and never sees the
   credentials. Used by cascadePricing.js.

   Env (server .env, never committed):
     CASCADE_SAP_ODATA_BASE  e.g. https://<host>:<port>/sap/opu/odata/sap/ZMM_CASCADE_SRV   (or SAP_ODATA_BASE)
     CASCADE_SAP_CLIENT      sap-client                                                    (or SAP_CLIENT)
     CASCADE_SAP_USER / CASCADE_SAP_PASSWORD  service user, Basic auth                     (or SAP_USER / SAP_PASSWORD)
   With no user set (e.g. the Azure SAP gateway as base, which signs in itself) no Authorization header is sent.

   sapGet(set)         GET  <base>/<set>?$format=json&sap-client=..  -> body.d.results
   sapAction(payload)  POST <base>/ActionRequestSet with X-CSRF-Token + the CSRF cookies -> JSON.parse(body.d.Result)
   CSRF: GET <base>/ with "X-CSRF-Token: Fetch", token from x-csrf-token, cookies from set-cookie (name=value only),
   cached in memory; a 403 on POST fetches a new token once and retries. Every fetch is uncached.
   Through the Azure SAP gateway (base https://<gateway>/api/<SYS>/<SERVICE>) the gateway does the CSRF handshake
   itself and has no service-root route: when no token comes back the POST goes without one.
*/
const env = (a, b) => (process.env[a] || process.env[b] || '').trim();
const config = () => ({
    base: env('CASCADE_SAP_ODATA_BASE', 'SAP_ODATA_BASE').replace(/\/+$/, ''),
    client: env('CASCADE_SAP_CLIENT', 'SAP_CLIENT'),
    user: env('CASCADE_SAP_USER', 'SAP_USER'),
    password: env('CASCADE_SAP_PASSWORD', 'SAP_PASSWORD'),
});

class SapError extends Error {
    constructor(message, status = 502) { super(message); this.status = status; }
}

function isConfigured() {
    return !!config().base;
}

function withClient(url) {
    const { client } = config();
    if (!client) return url;
    return `${url}${url.includes('?') ? '&' : '?'}sap-client=${encodeURIComponent(client)}`;
}

function authHeaders() {
    const { user, password } = config();
    return user ? { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` } : {};
}

async function errorText(res) {
    const text = await res.text().catch(() => '');
    try {
        const body = JSON.parse(text);
        const v = body?.error?.message?.value;
        if (v) return String(v);
    } catch { /* not JSON (HTML error page) */ }
    return res.statusText || `HTTP ${res.status}`;
}

function requireConfig() {
    if (!isConfigured()) throw new SapError('The SAP connection for Cascade Pricing is not configured on the server (CASCADE_SAP_ODATA_BASE).', 503);
    return config();
}

/** GET an entity set; returns body.d.results. */
async function sapGet(set) {
    const { base } = requireConfig();
    let res;
    try {
        res = await fetch(withClient(`${base}/${encodeURIComponent(set)}?$format=json`), { headers: { Accept: 'application/json', ...authHeaders() }, cache: 'no-store' });
    } catch (e) {
        throw new SapError(`SAP is not reachable: ${e.message}`);
    }
    if (!res.ok) throw new SapError(await errorText(res));
    const body = await res.json();
    return Array.isArray(body?.d?.results) ? body.d.results : [];
}

let csrf = null; // { token, cookie }

async function fetchCsrf() {
    const { base } = requireConfig();
    let res;
    try {
        res = await fetch(withClient(`${base}/`), { headers: { 'X-CSRF-Token': 'Fetch', Accept: 'application/json', ...authHeaders() }, cache: 'no-store' });
    } catch (e) {
        throw new SapError(`SAP is not reachable: ${e.message}`);
    }
    await res.arrayBuffer().catch(() => null); // drain
    const token = res.headers.get('x-csrf-token');
    if (!token) { csrf = { token: '', cookie: '' }; return csrf; } // gateway mode: it handles CSRF itself
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    csrf = { token, cookie: cookies.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ') };
    return csrf;
}

/** POST one ActionRequest; returns the parsed body.d.Result. */
async function sapAction(payload) {
    const { base } = requireConfig();
    const post = async (t) => fetch(withClient(`${base}/ActionRequestSet`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(t.token ? { 'X-CSRF-Token': t.token } : {}), ...(t.cookie ? { Cookie: t.cookie } : {}), ...authHeaders() },
        body: JSON.stringify(payload),
        cache: 'no-store',
    });
    let res;
    try {
        res = await post(csrf || (await fetchCsrf()));
        if (res.status === 403) res = await post(await fetchCsrf()); // expired token: once
    } catch (e) {
        if (e instanceof SapError) throw e;
        throw new SapError(`SAP is not reachable: ${e.message}`);
    }
    if (!res.ok) throw new SapError(await errorText(res));
    const body = await res.json();
    const raw = body?.d?.Result;
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
        return JSON.parse(raw);
    } catch {
        throw new SapError('SAP returned a result that is not valid JSON.');
    }
}

/** Test seam: forget the cached CSRF token. */
const resetCsrf = () => { csrf = null; };

module.exports = { sapGet, sapAction, isConfigured, SapError, resetCsrf };
