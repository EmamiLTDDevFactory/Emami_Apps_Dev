/*
   SAP OData V2 client for Publicity Expenses (server only: the browser never calls SAP, its URLs or credentials).

   Services: ZC_ATLBTL_EXP_SUMMARY_CDS / ZC_ATLBTL_EXP_DETAIL_CDS (@OData.publish CDS views with parameters
   P_FiscalYear / P_FiscalPeriod). Two ways to reach them:

   direct  (SAP Gateway URL, e.g. https://<host>:<port>/sap/opu/odata/sap/<SERVICE>):
     GET <base>/<VIEW>(P_FiscalYear='2026',P_FiscalPeriod='007')/Set?$format=json&$filter=..&sap-client=..   (+ __next paging)
   gateway (Emami Azure SAP gateway, base https://<gateway>/api/<SYS>/<SERVICE>, e.g. SYS = NGD):
     the gateway forwards ONE path segment after the service and signs in to SAP itself, so the results are read as
     GET <base>/<VIEW>(P_FiscalYear='2026',P_FiscalPeriod='007')?$expand=Set      (all rows of the period in one answer)
     filters are applied here, and the SKUs of a drill-down line as
     GET <base>/<entity of that line, from its __metadata.uri>?$expand=to_NetSaleMaster
   Gateway mode is used when the base looks like .../api/<SYS>/<SERVICE> (or PUBEXP_SAP_MODE=gateway).

   Env (server .env, never committed):
     PUBEXP_SAP_SUMMARY_BASE / PUBEXP_SAP_DETAIL_BASE   service roots (or PUBEXP_SAP_ODATA_ROOT for both, direct mode)
     PUBEXP_SAP_MODE           direct | gateway (default: from the URL)
     PUBEXP_SAP_CLIENT         sap-client, direct mode only (default 900)
     PUBEXP_SAP_USER / PUBEXP_SAP_PASSWORD   Basic auth, direct mode only (falls back to SAP_USER / SAP_PASSWORD)
     PUBEXP_SAP_SYSTEM         label shown in the app (default: <SYS> from a gateway URL)
     PUBEXP_SAP_TIMEOUT_MS     default 90000
   Read-only: GET only, no CSRF token.
*/
const env = (...names) => { for (const n of names) { const v = (process.env[n] || '').trim(); if (v) return v; } return ''; };
const strip = (s) => s.replace(/\/+$/, '');
const GATEWAY_RE = /\/api\/[A-Z0-9]{3}\/[^/]+$/i;

function config() {
    const root = strip(env('PUBEXP_SAP_ODATA_ROOT'));
    const summaryBase = strip(env('PUBEXP_SAP_SUMMARY_BASE')) || (root ? `${root}/ZC_ATLBTL_EXP_SUMMARY_CDS` : '');
    const detailBase = strip(env('PUBEXP_SAP_DETAIL_BASE')) || (root ? `${root}/ZC_ATLBTL_EXP_DETAIL_CDS` : '');
    const forced = env('PUBEXP_SAP_MODE').toLowerCase();
    return {
        summaryBase, detailBase,
        gateway: forced ? forced === 'gateway' : GATEWAY_RE.test(summaryBase),
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
const isGateway = () => config().gateway;

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

/** The same filter, in memory (gateway mode). */
function matches(row, where) {
    return Object.entries(where || {}).every(([k, v]) => {
        const list = (Array.isArray(v) ? v : [v]).filter((x) => x !== undefined && x !== null && x !== '');
        return !list.length || list.includes(row[k]);
    });
}

const paramsKey = (fy, period) => `P_FiscalYear=${lit(fy)},P_FiscalPeriod=${lit(String(period).padStart(3, '0'))}`;
function entityPath(view, fy, period) {
    return `${view}(${paramsKey(fy, period)})/Set`;
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
    const { user, password, gateway } = config();
    return user && !gateway ? { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` } : {};
}

async function errorText(res) {
    const text = await res.text().catch(() => '');
    try {
        const v = JSON.parse(text)?.error?.message?.value;
        if (v) return String(v).slice(0, 300);
    } catch { /* HTML error page */ }
    return res.statusText || `HTTP ${res.status}`;
}

async function getJson(url) {
    const { timeout } = config();
    let res;
    try {
        res = await fetch(url, { headers: { Accept: 'application/json', ...authHeaders() }, cache: 'no-store', signal: AbortSignal.timeout(timeout) });
    } catch (e) {
        throw new SapError(e.name === 'TimeoutError' ? 'SAP did not answer in time.' : 'SAP is not reachable.');
    }
    if (res.status === 401 || res.status === 403) throw new SapError(`SAP refused the request (${res.status}): ${await errorText(res)}`);
    if (!res.ok) throw new SapError(`SAP error: ${await errorText(res)}`);
    const body = await res.json().catch(() => null);
    if (!body) throw new SapError('SAP answered with something that is not JSON.');
    return body;
}

/** GET all rows of an entity set, following server-side paging (__next). Direct mode. */
async function getAll(url) {
    const rows = [];
    let next = url;
    for (let page = 0; next && page < 200; page++) {
        const d = (await getJson(next))?.d;
        const list = Array.isArray(d?.results) ? d.results : Array.isArray(d) ? d : [];
        rows.push(...list);
        next = typeof d?.__next === 'string' ? d.__next : null;
    }
    return rows;
}

/** All result rows of a period through the gateway: the parameters entity with its Set expanded. */
async function getViaGateway(base, view, fy, period) {
    // The gateway forwards one path segment, and `(params)?$expand=Set` makes SAP run the view with INITIAL parameters
    // (P_FiscalYear='0000' -> always zero rows). `/Set` must reach SAP, so the slash is double-encoded (%252F): the gateway
    // decodes it once and SAP decodes the rest. Checked live on NWP and NGD.
    const d = (await getJson(`${base}/${view}(${paramsKey(fy, period)})%252FSet?$format=json`))?.d;
    const list = Array.isArray(d?.results) ? d.results : [];
    if (d?.__next) throw new SapError('SAP returned a paged answer through the gateway; the period is incomplete.');
    return list;
}

const AMOUNTS = ['CYYTDAmount', 'PYYTDAmount', 'CYPeriodAmount', 'PYPeriodAmount', 'CYvsPYVariance', 'OBAnnualAmount', 'RBAnnualAmount', 'OBYTDAmount', 'RBYTDAmount', 'CYvsRBYTDDeviation'];

/**
 * Drop OData metadata / deferred links, amounts to numbers, strings trimmed. With keepEntity the row keeps the last
 * segment of its own __metadata.uri as `_entity` (to read its SKUs later through the gateway); it is never sent to the browser.
 */
function clean(row, { keepEntity = false } = {}) {
    const out = {};
    for (const [k, v] of Object.entries(row || {})) {
        if (k === '__metadata') {
            if (keepEntity && typeof v?.uri === 'string') { const seg = v.uri.split('?')[0].split('/').pop(); if (seg) out._entity = seg; }
            continue;
        }
        if (v && typeof v === 'object') {
            if (v.__deferred) continue;
            if (Array.isArray(v.results)) { out[k] = v.results.map((x) => clean(x)); continue; }
            out[k] = clean(v);
            continue;
        }
        out[k] = typeof v === 'string' ? v.trim() : v;
    }
    for (const a of AMOUNTS) if (a in out) out[a] = Number(out[a]) || 0;
    return out;
}

function requireBase(which) {
    const c = config();
    const base = which === 'summary' ? c.summaryBase : c.detailBase;
    if (!base) throw new SapError('The SAP connection is not configured on the server (PUBEXP_SAP_SUMMARY_BASE / PUBEXP_SAP_DETAIL_BASE).', 503);
    return { base, gateway: c.gateway };
}

async function fetchSummary(fy, period, where) {
    const { base, gateway } = requireBase('summary');
    if (gateway) return (await getViaGateway(base, 'ZC_ATLBTL_EXP_SUMMARY', fy, period)).map((r) => clean(r)).filter((r) => matches(r, where));
    return (await getAll(buildUrl(base, entityPath('ZC_ATLBTL_EXP_SUMMARY', fy, period), { filter: filterOf(where) }))).map((r) => clean(r));
}

/** Detail rows. Gateway mode: the whole period (filtered here); SKUs are added by expandSkus() for the lines shown. */
async function fetchDetail(fy, period, where, { expand = false } = {}) {
    const { base, gateway } = requireBase('detail');
    if (gateway) {
        const rows = (await getViaGateway(base, 'ZC_ATLBTL_EXP_DETAIL', fy, period)).map((r) => clean(r, { keepEntity: true })).filter((r) => matches(r, where));
        return expand ? expandSkus(rows) : rows;
    }
    return (await getAll(buildUrl(base, entityPath('ZC_ATLBTL_EXP_DETAIL', fy, period), { filter: filterOf(where), expand: expand ? 'to_NetSaleMaster' : '' }))).map((r) => clean(r));
}

/**
 * ZNET_SALE_MASTER in one read: the entity set of CDS ZI_ATLBTL_NETSALEMASTER (target of to_NetSaleMaster, exposed in
 * the detail service; ~1,600 rows on NWP). The drill-down joins it on SkuGroupKey, so no SAP call per posting line.
 * PUBEXP_SAP_SKU_SET overrides the entity set name.
 */
async function fetchSkuMaster() {
    const { base, gateway } = requireBase('detail');
    const set = env('PUBEXP_SAP_SKU_SET') || 'ZI_ATLBTL_NETSALEMASTER';
    if (!/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(set)) throw new SapError('PUBEXP_SAP_SKU_SET is not a valid entity set name.', 500);
    if (gateway) {
        const d = (await getJson(`${base}/${set}?$format=json`))?.d;
        if (d?.__next) throw new SapError('SAP returned a paged answer for the SKU master; it is incomplete.');
        return (Array.isArray(d?.results) ? d.results : []).map((r) => clean(r));
    }
    return (await getAll(buildUrl(base, set))).map((r) => clean(r));
}

/** Gateway mode: read the SKUs (to_NetSaleMaster) of each line through its own entity, 4 at a time, at most 80 lines. */
async function expandSkus(rows) {
    const { base } = requireBase('detail');
    const out = rows.map((r) => ({ ...r }));
    let i = 0;
    const work = out.slice(0, 80);
    await Promise.all(Array.from({ length: Math.min(4, work.length) }, async () => {
        while (i < work.length) {
            const r = work[i++];
            if (!r._entity || !/^[A-Za-z0-9_]+\(.*\)$/.test(r._entity)) continue;
            try {
                // The live service names the navigation toto_NetSaleMaster; the app (and the mock) use to_NetSaleMaster.
                const d = (await getJson(`${base}/${r._entity}?$expand=toto_NetSaleMaster`))?.d;
                const nav = d?.toto_NetSaleMaster ?? d?.to_NetSaleMaster;
                r.to_NetSaleMaster = Array.isArray(nav?.results) ? nav.results.map((x) => clean(x)) : [];
            } catch { r.to_NetSaleMaster = []; }
        }
    }));
    return out;
}

/** Remove internal fields before rows leave the server. */
const publicRow = ({ _entity, ...rest }) => rest; // eslint-disable-line no-unused-vars

/** SAP system label for the app ("NGD", "EDS 900"), from env or the gateway URL .../api/<SYS>/... */
function systemLabel() {
    const c = config();
    const explicit = env('PUBEXP_SAP_SYSTEM');
    const m = /\/api\/([A-Z0-9]{3})\//i.exec(`${c.summaryBase}/`);
    const sys = explicit || (m ? m[1] : '');
    return [sys.toUpperCase(), c.gateway ? '' : c.client].filter(Boolean).join(' ') + (c.gateway ? ' via Azure gateway' : '');
}

module.exports = { fetchSummary, fetchDetail, fetchSkuMaster, expandSkus, isConfigured, isGateway, systemLabel, SapError, filterOf, entityPath, buildUrl, clean, publicRow, matches, AMOUNTS };
