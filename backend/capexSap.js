/*
   SAP OData client for the CAPEX Portal (ZCAPEX_PORTAL_SRV). Server only: the browser never calls SAP, never sees the
   proxy secret and cannot choose who it acts as.

   Env (server .env, never committed):
     CAPEX_SAP_ODATA_BASE   gateway: https://<gateway>/api/<SYS>/ZCAPEX_PORTAL_SRV   (or the service root on a SAP host)
     CAPEX_PROXY_SECRET     shared secret = ZCAPEX_CONFIG row PROXY_SECRET on that SAP system. Unset -> every call runs
                            as the technical user (no role, no plants): reads come back empty, writes are refused.
     CAPEX_SAP_CLIENT       sap-client (optional)
     CAPEX_SAP_USER / CAPEX_SAP_PASSWORD   Basic auth, only when the base is a SAP host (the gateway signs in itself)

   Identity: the signed-in person's e-mail travels as two custom query options, zcpxmail + zcpxkey. SAP's
   ZCL_CAPEX_AUTH=>EFFECTIVE_USER maps it to the ZCAPEX_USER row (role, plants, admin) when the key matches.
   The Azure proxy drops the query string of a write, so writes go as an encoded path (Name%3F<encoded query>);
   GETs carry the query normally. Client HTTP headers are not forwarded by the proxy, which is why a query option is used.
*/
const meta = require('./capexMeta.json');

const env = (k) => (process.env[k] || '').trim();
const config = () => ({
    base: env('CAPEX_SAP_ODATA_BASE').replace(/\/+$/, ''),
    secret: env('CAPEX_PROXY_SECRET'),
    client: env('CAPEX_SAP_CLIENT'),
    user: env('CAPEX_SAP_USER'),
    password: env('CAPEX_SAP_PASSWORD'),
});

class SapError extends Error {
    constructor(message, status = 502, code = '') { super(message); this.status = status; this.code = code; }
}

const isConfigured = () => !!config().base;
const sapSystem = () => {
    const m = /\/api\/([A-Z0-9]{3})\//i.exec(config().base + '/');
    return m ? m[1].toUpperCase() : '';
};

const SETS = new Set(meta.sets);
const FUNCTIONS = meta.functions;

const authHeaders = () => {
    const { user, password } = config();
    return user ? { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` } : {};
};

/** OData V2 literal for a function-import parameter, by its EDM type from $metadata. */
function literal(type, v) {
    if (v === null || v === undefined) return "''";
    switch (type) {
        case 'Edm.Boolean': return v === true || v === 'true' || v === 'X' ? 'true' : 'false';
        case 'Edm.Int16': case 'Edm.Int32': case 'Edm.Int64': case 'Edm.Byte': return String(parseInt(v, 10) || 0);
        case 'Edm.Decimal': case 'Edm.Double': case 'Edm.Single': { const n = Number(v); return Number.isFinite(n) ? String(n) : '0'; }
        case 'Edm.DateTime': return `datetime'${String(v).replace(/'/g, '')}'`;
        default: return `'${String(v).replace(/'/g, "''")}'`;
    }
}

function identityQuery(email, admin) {
    const { secret } = config();
    const q = [];
    if (email && secret) q.push(`zcpxmail=${encodeURIComponent(email)}`, `zcpxkey=${encodeURIComponent(secret)}`);
    // zcpxadm: the hub vouches that this person is an Admin of the CAPEX Portal app (maintenance). Only capex.js sets it,
    // after checking the grant; a browser-sent zcpx* option is stripped before this point.
    if (email && secret && admin) q.push('zcpxadm=X');
    return q;
}

function withCommon(parts) {
    const { client } = config();
    return client ? [...parts, `sap-client=${encodeURIComponent(client)}`] : parts;
}

async function errorOf(res) {
    const text = await res.text().catch(() => '');
    try {
        const j = JSON.parse(text);
        const m = j?.error?.message?.value;
        if (m) return new SapError(String(m), res.status === 404 ? 404 : res.status >= 500 ? 502 : 400, String(j.error.code || ''));
    } catch { /* not JSON */ }
    return new SapError(res.statusText || `HTTP ${res.status}`, res.status >= 500 ? 502 : res.status);
}

let csrf = null;
async function fetchCsrf() {
    const { base, client } = config();
    const url = `${base}/${client ? `?sap-client=${encodeURIComponent(client)}` : ''}`;
    const res = await fetch(url, { headers: { 'X-CSRF-Token': 'Fetch', Accept: 'application/json', ...authHeaders() }, cache: 'no-store' });
    await res.arrayBuffer().catch(() => null);
    const token = res.headers.get('x-csrf-token');
    if (!token) { csrf = { token: '', cookie: '' }; return csrf; } // gateway mode: it handles CSRF itself
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    csrf = { token, cookie: cookies.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ') };
    return csrf;
}

async function send(method, path, queryParts, email, body, admin) {
    const { base } = config();
    if (!base) throw new SapError('The SAP connection for the CAPEX Portal is not configured on the server (CAPEX_SAP_ODATA_BASE).', 503);
    const query = withCommon([...queryParts, ...identityQuery(email, admin)]).join('&');
    const write = method !== 'GET';
    // Through the Azure gateway a write's query string is dropped, so it travels as an encoded path (the proxy turns it back).
    // A direct SAP host (local testing) needs the plain query.
    const viaGateway = /\/api\/[A-Z0-9]{3}\//i.test(`${base}/`);
    const url = write && viaGateway ? `${base}/${path}%3F${encodeURIComponent(query)}` : `${base}/${path}${query ? `?${query}` : ''}`;
    const once = async (t) => fetch(url, {
        method,
        headers: {
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(write && t?.token ? { 'X-CSRF-Token': t.token } : {}),
            ...(write && t?.cookie ? { Cookie: t.cookie } : {}),
            ...authHeaders(),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
    });
    let res;
    try {
        res = await once(write ? (csrf || (await fetchCsrf())) : null);
        if (res.status === 403 && write) res = await once(await fetchCsrf()); // expired token: once
    } catch (e) {
        if (e instanceof SapError) throw e;
        throw new SapError(`SAP is not reachable: ${e.message}`);
    }
    if (!res.ok) throw await errorOf(res);
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new SapError('SAP returned an answer that is not valid JSON.'); }
}

/** d.results (list) or d (single entity / function result). */
const unwrap = (j) => (j && j.d ? (Array.isArray(j.d.results) ? j.d.results : j.d.results === undefined && j.d.__count === undefined ? j.d : j.d) : j);

/** GET <set>[(key)][/nav] with the caller's OData options. Returns { rows | row, count? }. */
async function read(path, options, email, admin) {
    const q = [];
    for (const [k, v] of Object.entries(options || {})) {
        if (/^zcpx/i.test(k) || /^sap-/i.test(k) || /^\$format$/i.test(k)) continue;
        if (v !== undefined && v !== '') q.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    q.push('$format=json');
    const j = await send('GET', path, q, email, undefined, admin);
    const d = j?.d;
    if (d && Array.isArray(d.results)) return { rows: d.results, count: d.__count !== undefined ? Number(d.__count) : undefined };
    return { row: d ?? null };
}

/** POST a function import. Params are typed from the live $metadata. */
async function callFunction(name, params, email, admin) {
    const f = FUNCTIONS[name];
    if (!f) throw new SapError(`Unknown function ${name}`, 404);
    const q = [];
    for (const [p, t] of Object.entries(f.params)) {
        if (params && params[p] !== undefined && params[p] !== null) q.push(`${p}=${encodeURIComponent(literal(t, params[p]))}`);
    }
    if (f.method === 'GET') q.push('$format=json'); // a POST takes JSON from the Accept header; $format is refused there
    const j = await send(f.method === 'GET' ? 'GET' : 'POST', name, q, email, undefined, admin);
    // OData V2 answers a function import as { d: { <FunctionName>: {...result...} } }: hand the screens the result itself.
    const d = j && j.d ? j.d : j;
    if (d && typeof d === 'object' && d[name] !== undefined) return d[name];
    return unwrap(j);
}

/** POST / PUT an entity (deep inserts included). path: "BudgetSet" or "BudgetSet('B-1')". */
async function write(method, path, body, email) {
    const j = await send(method, path, [], email, body); // JSON via the Accept header: SAP refuses $format on a write
    return unwrap(j);
}

module.exports = { SapError, isConfigured, sapSystem, SETS, FUNCTIONS, read, callFunction, write };
