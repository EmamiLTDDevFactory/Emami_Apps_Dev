/*
   SAP OData V2 client for Publicity Expenses (server only: the browser never calls SAP or sees credentials).

   Services (registered on SAP dev EDS, client 900):
     ZC_ATLBTL_EXP_SUMMARY_CDS  ZC_ATLBTL_EXP_SUMMARY(P_FiscalYear='2026',P_FiscalPeriod='007')/Set
     ZC_ATLBTL_EXP_DETAIL_CDS   ZC_ATLBTL_EXP_DETAIL(P_FiscalYear='2026',P_FiscalPeriod='007')/Set  (+ $expand=to_NetSaleMaster)

   Env (server .env, never committed):
     PUBEXP_SAP_ODATA_ROOT      e.g. https://<host>:<port>/sap/opu/odata/sap   (both services below it)
     PUBEXP_SAP_SUMMARY_BASE    full service root of the summary service (overrides ROOT for it, e.g. an Azure gateway URL)
     PUBEXP_SAP_DETAIL_BASE     full service root of the detail service
     PUBEXP_SAP_CLIENT          sap-client, default 900
     PUBEXP_SAP_USER / PUBEXP_SAP_PASSWORD   service user, Basic auth (falls back to SAP_USER / SAP_PASSWORD; none = no header,
                                for a gateway that signs in itself)
     PUBEXP_SAP_TIMEOUT_MS      default 90000
   Read-only: only GET requests, so no CSRF token is needed.
*/
const env = (...names) => { for (const n of names) { const v = (process.env[n] || '').trim(); if (v) return v; } return ''; };
const strip = (s) => s.replace(/\/+$/, '');

function config() {
    const root = strip(env('PUBEXP_SAP_ODATA_ROOT'));
    return {
        summaryBase: strip(env('PUBEXP_SAP_SUMMARY_BASE')) || (root ? `${root}/ZC_ATLBTL_EXP_SUMMARY_CDS` : ''),
        detailBase: strip(env('PUBEXP_SAP_DETAIL_BASE')) || (root ? `${root}/ZC_ATLBTL_EXP_DETAIL_CDS` : ''),
        client: env('PUBEXP_SAP_CLIENT') || '900',
        user: env('PUBEXP_SAP_USER', 'SAP_USER'),
        password: env('PUBEXP_SAP_PASSWORD', 'SAP_PASSWORD'),
        timeout: Number(env('PUBEXP_SAP_TIMEOUT_MS')) || 90000,
    };
}

class SapError extends Error {
    constructor(message, status = 502) { super(message); this.status = status; }
}

const isConfigured = () => { const c = config(); return !!(c.summaryBase && c.detailBase); };

/** OData string literal: single quotes doubled. */
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** $filter from { Field: value | value[] } - equal / or-of-equals, joined with and. Empty values are skipped. */
function filterOf(where) {
    const parts = [];
    for (const [field, v] of Object.entries(where || {})) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(field)) throw new SapError(`Bad filter field ${field}`, 400);
        const list = (Array.isArray(v) ? v : [v]).filter((x) => x !== undefined && x !== null && x !== '');
        if (!list.length) continue;
        const ors = list.map((x) => `${field} eq ${lit(x)}`);
        parts.push(ors.length === 1 ? ors[0] : `(${ors.join(' or ')})`);
    }
    return parts.join(' and ');
}

function entityPath(view, fy, period) {
    return `${view}(P_FiscalYear=${lit(fy)},P_FiscalPeriod=${lit(String(period).padStart(3, '0'))})/Set`;
}

function buildUrl(base, path, { filter, expand, select } = {}) {
    const q = ['$format=json'];
    if (filter) q.push(`$filter=${encodeURIComponent(filter)}`);
    if (expand) q.push(`$expand=${encodeURIComponent(expand)}`);
    if (select) q.push(`$select=${encodeURIComponent(select)}`);
    const { client } = config();
    if (client) q.push(`sap-client=${encodeURIComponent(client)}`);
    return `${base}/${path}?${q.join('&')}`;
}

function authHeaders() {
    const { user, password } = config();
    return user ? { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` } : {};
}

async function errorText(res) {
    const text = await res.text().catch(() => '');
    try {
        const v = JSON.parse(text)?.error?.message?.value;
        if (v) return String(v).slice(0, 300);
    } catch { /* HTML error page */ }
    return res.statusText || `HTTP ${res.status}`;
}

/** GET all rows of an entity set, following server-side paging (__next). */
async function getAll(url) {
    const { timeout } = config();
    const rows = [];
    let next = url;
    for (let page = 0; next && page < 200; page++) {
        let res;
        try {
            res = await fetch(next, { headers: { Accept: 'application/json', ...authHeaders() }, cache: 'no-store', signal: AbortSignal.timeout(timeout) });
        } catch (e) {
            throw new SapError(e.name === 'TimeoutError' ? 'SAP did not answer in time.' : 'SAP is not reachable.');
        }
        if (res.status === 401 || res.status === 403) throw new SapError('SAP refused the service user (check PUBEXP_SAP_USER / its roles).');
        if (!res.ok) throw new SapError(`SAP error: ${await errorText(res)}`);
        const body = await res.json().catch(() => null);
        const d = body?.d;
        const list = Array.isArray(d?.results) ? d.results : Array.isArray(d) ? d : [];
        rows.push(...list);
        next = typeof d?.__next === 'string' ? d.__next : null;
    }
    return rows;
}

const AMOUNTS = ['CYYTDAmount', 'PYYTDAmount', 'CYPeriodAmount', 'PYPeriodAmount', 'CYvsPYVariance', 'OBAnnualAmount', 'RBAnnualAmount', 'OBYTDAmount', 'RBYTDAmount', 'CYvsRBYTDDeviation'];

/** Drop OData metadata / deferred links, amounts to numbers, strings trimmed. */
function clean(row) {
    const out = {};
    for (const [k, v] of Object.entries(row || {})) {
        if (k === '__metadata') continue;
        if (v && typeof v === 'object') {
            if (v.__deferred) continue;
            if (Array.isArray(v.results)) { out[k] = v.results.map(clean); continue; }
            out[k] = clean(v);
            continue;
        }
        out[k] = typeof v === 'string' ? v.trim() : v;
    }
    for (const a of AMOUNTS) if (a in out) out[a] = Number(out[a]) || 0;
    return out;
}

async function fetchSummary(fy, period, where) {
    const { summaryBase } = config();
    if (!summaryBase) throw new SapError('The SAP connection is not configured on the server (PUBEXP_SAP_ODATA_ROOT).', 503);
    const rows = await getAll(buildUrl(summaryBase, entityPath('ZC_ATLBTL_EXP_SUMMARY', fy, period), { filter: filterOf(where) }));
    return rows.map(clean);
}

async function fetchDetail(fy, period, where, { expand = false } = {}) {
    const { detailBase } = config();
    if (!detailBase) throw new SapError('The SAP connection is not configured on the server (PUBEXP_SAP_ODATA_ROOT).', 503);
    const rows = await getAll(buildUrl(detailBase, entityPath('ZC_ATLBTL_EXP_DETAIL', fy, period), { filter: filterOf(where), expand: expand ? 'to_NetSaleMaster' : '' }));
    return rows.map(clean);
}

/** SAP system label for the header ("EDS 900"), from env or the gateway URL .../api/<SYS>/... */
function systemLabel() {
    const c = config();
    const explicit = env('PUBEXP_SAP_SYSTEM');
    const m = /\/api\/([A-Z0-9]{3})\//i.exec(`${c.summaryBase}/`);
    const sys = explicit || (m ? m[1] : '');
    return [sys.toUpperCase(), c.client].filter(Boolean).join(' ');
}

module.exports = { fetchSummary, fetchDetail, isConfigured, systemLabel, SapError, filterOf, entityPath, buildUrl, clean, AMOUNTS };
