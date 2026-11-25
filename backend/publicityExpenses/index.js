/*
   Publicity Expenses (embedded-apps/publicity-expenses): ATL / BTL advertisement expenses MIS on the SAP CDS views
   ZC_ATLBTL_EXP_SUMMARY / ZC_ATLBTL_EXP_DETAIL. Mounted at /api/me/publicity-expenses (rides the existing nginx /api/me
   rule). SAP is only read.

   Selection on every data route: fy + periods (any set, "8", "1-8" or "4-6,9"; see selection.js) + companies (comma
   list, empty = all). Figures are the selected periods added up, CY against the same periods of PY; P01..Pn = YTD.
   The older form period=n still works and means YTD up to n. Rules in force for the latest selected period apply.

   Everyone with the app (Manage Access role User or Admin):
     GET  /me                                  { email, role, admin }
     GET  /config                              header groups (overrides applied), classes, media buckets, dimensions
     GET  /summary   ?fy&periods[&companies][&exclusions=off]   summary rows (exclusions + budget applied) + meta
     POST /detail    { fy, periods, companies, keys[], gls[], sites[], groups[], exclusions, skus }   drill-down of any
                     report figure (one row or a sub-total): posting lines (G/L x cost centre) with the amount of every
                     selected period; skus: true (one report row) adds the SKUs - one SAP call per line through the
                     gateway, so the app asks for them in a second call. GET with key / gl / site still works (with SKUs).
     GET  /trend     ?fy&periods[&companies][&exclusions=off]   CY / PY per period 1..latest selected, by header group
     GET  /breakdown ?fy&periods[&companies][&exclusions=off]   detail totals by site, profit centre, type, rule, cost centre
   Admin only (role Admin):
     GET    /exclusions ?fy&periods                  rules + what each removes in the selection
     GET    /exclusions/candidates ?dimension&fy&periods[&companies]   values found in the CDS results, with names and amounts
     POST   /exclusions/preview                       impact of a rule before saving
     POST   /exclusions  PUT /exclusions/:id  DELETE /exclusions/:id
     POST   /exclusions/bulk                          Excel upload of rules ({ rows, dryRun })
     GET    /budget ?fy                               source, active OB / RB versions, version history
     GET    /budget/template ?fy&kind&period          lines to prefill the Excel template
     POST   /budget/upload                            { fy, kind, unit, rows, fileName, note, dryRun }
     GET    /budget/versions/:id/lines                lines of one version (download)
     POST   /budget/versions/:id/activate             make an earlier version active again (rollback)
     POST   /budget/deactivate                        { fy, kind }: no active upload -> back to the default source
     GET    /settings/mapping ?fy&period  PUT /settings/mapping
     GET    /audit
   Exclusions apply to every screen and every user (the meta says what was excluded); ?exclusions=off shows the report
   without them, for checking. Raw SAP answers are cached 10 minutes per fiscal year / period, all companies in one
   read (the company filter is applied here, so switching companies does not read SAP again; ?refresh=1 skips the
   cache); rules, budget and mapping are read on every request, so a change shows at once.
*/
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { JWT_SECRET } = require('../sessionAuth');
const sap = require('./sap');
const mock = require('./mock');
const { headerGroup, medium, publicConfig, isUnmapped, validateMapping } = require('./config');
const { applyMockBudget, envBudgetSource, validateUpload, applyUploadedBudget } = require('./budget');
const R = require('./rules');
const S = require('./selection');
const { getStore } = require('./store');

const APP_ID = 'publicity-expenses';
const TTL = 10 * 60 * 1000;
const router = express.Router();

function source() {
    const forced = (process.env.PUBEXP_SOURCE || '').trim().toLowerCase();
    if (forced === 'mock' || forced === 'sap') return forced;
    return sap.isConfigured() ? 'sap' : 'mock';
}

// ---------------------------------------------------------------- access

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
    if (!email) return res.status(401).json({ success: false, error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    try {
        const [grant, user] = await Promise.all([
            pool.query('SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [email, APP_ID]),
            pool.query('SELECT is_active FROM emami_apps.authorized_users WHERE email = $1', [email]),
        ]);
        if (!grant.rows.length || user.rows[0]?.is_active === false) {
            return res.status(403).json({ success: false, error: 'You do not have access to Publicity Expenses. Ask an Emami Apps admin for it in Admin Center.' });
        }
        req.email = email;
        req.role = grant.rows[0].role === 'Admin' ? 'Admin' : 'User';
        next();
    } catch (e) {
        console.error('[publicity-expenses] access check', e.message);
        res.status(500).json({ success: false, error: 'Could not verify your access.' });
    }
}

function requireAdmin(req, res, next) {
    if (req.role !== 'Admin') return res.status(403).json({ success: false, error: 'Only a Publicity Expenses admin can change settings (Manage Access role Admin).' });
    next();
}

// ---------------------------------------------------------------- input

class BadInput extends Error { constructor(m) { super(m); this.status = 400; } }
const KEY_RE = /^[A-Za-z0-9 _\-/&.()]{1,30}$/;
const GROUP_RE = /^[A-Za-z0-9 _\-/&.()]{1,60}$/;
const MAX_KEYS = 5000;
const MAX_LINES = 25000;
/** A query value or a JSON array -> trimmed, non-empty strings ("a,b" works too). */
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s ?? '').trim()).filter(Boolean);
const uniq = (xs) => [...new Set(xs)];

/** Selection from a query string or a JSON body. cell = also the drill-down filters (keys, G/L, sites, header groups). */
function params(q, { cell = false } = {}) {
    const fy = String(q.fy || '');
    if (!/^20\d{2}$/.test(fy)) throw new BadInput('Fiscal year must be a year like 2026.');
    let periods;
    if (q.periods !== undefined && q.periods !== '') {
        try { periods = S.parsePeriods(q.periods); } catch (e) { throw new BadInput(e.message); }
    } else {
        // Older clients send period=n, meaning YTD up to n.
        const period = Number(q.period);
        if (!Number.isInteger(period) || period < 1 || period > 12) throw new BadInput('Period must be 1 to 12.');
        periods = Array.from({ length: period }, (_, i) => i + 1);
    }
    if (!periods.length) throw new BadInput('Pick at least one period.');
    const companies = uniq(list(q.companies ?? q.company).map((c) => c.toUpperCase())).sort();
    if (companies.length > 50 || companies.some((c) => !/^[A-Z0-9]{4}$/.test(c))) throw new BadInput('Company codes must be 4 letters or digits.');
    const out = { fy, periods, period: periods[periods.length - 1], companies, refresh: String(q.refresh ?? '') === '1', exclusions: q.exclusions !== 'off' };
    if (cell) {
        const keys = uniq(list(q.keys ?? q.key));
        if (keys.length > MAX_KEYS || keys.some((k) => !KEY_RE.test(k))) throw new BadInput('Reporting key is missing or not valid.');
        const gls = uniq(list(q.gls ?? q.gl));
        if (gls.length > 2000 || gls.some((g) => !/^\d{1,10}$/.test(g))) throw new BadInput('G/L account must be digits.');
        const sites = uniq(list(q.sites ?? q.site).map((s) => s.toUpperCase()));
        if (sites.some((s) => s !== 'HO' && s !== 'UN')) throw new BadInput('Site must be HO or UN.');
        const groups = uniq(list(q.groups));
        if (groups.length > 100 || groups.some((g) => !GROUP_RE.test(g))) throw new BadInput('Report header group is not valid.');
        Object.assign(out, { keys, gls: gls.map((g) => g.padStart(10, '0')), sites, groups });
    }
    return out;
}

// ---------------------------------------------------------------- raw SAP / mock data (cached)

const cache = new Map();
function cached(key, refresh, load) {
    const hit = cache.get(key);
    if (!refresh && hit && Date.now() - hit.at < TTL) return hit.promise;
    const promise = load();
    cache.set(key, { at: Date.now(), promise });
    promise.catch(() => cache.delete(key));
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return promise;
}

const byCompany = (rows, companies) => (companies?.length ? rows.filter((r) => companies.includes(r.CompanyCode)) : rows);

/** Summary rows of ONE fiscal period as SAP returns them (YTD + period amounts); all companies read once, filtered here. */
function rawSummary({ fy, period, companies, refresh }) {
    const src = source();
    return cached(`s|${src}|${fy}|${period}`, refresh, async () => (src === 'sap' ? sap.fetchSummary(fy, period, {}) : mock.summary(fy, period, {})))
        .then((rows) => byCompany(rows, companies));
}

/**
 * Detail rows of ONE fiscal period. `where` (report rows, G/L, sites) goes to SAP in direct mode when it is short; through
 * the gateway, or for long lists, the whole period is read once (cached) and filtered here. SKUs (expand) only for the
 * lines asked for. Company filter always here.
 */
function rawDetail({ fy, period, companies, refresh }, where = {}, opts = {}) {
    const src = source();
    const ck = `d|${src}|${fy}|${period}|${JSON.stringify(where)}|${opts.expand ? 1 : 0}`;
    const long = Object.values(where).some((v) => Array.isArray(v) && v.length > 25);
    let promise;
    if (src === 'sap' && Object.keys(where).length && (sap.isGateway() || long)) {
        promise = cached(ck, refresh, async () => {
            const all = await rawDetail({ fy, period, refresh }, {}, {});
            const rows = all.filter((r) => sap.matches(r, where));
            return opts.expand && sap.isGateway() ? sap.expandSkus(rows) : rows;
        });
    } else {
        promise = cached(ck, refresh, async () => (src === 'sap' ? sap.fetchDetail(fy, period, where, opts) : mock.detail(fy, period, where, opts)));
    }
    return promise.then((rows) => byCompany(rows, companies));
}

/** Read each needed period at most 3 at a time. */
async function readPeriods(periods, load) {
    const got = await mapLimit(periods, 3, async (q) => [q, await load(q)]);
    return new Map(got);
}

/** Summary rows of the selection (see selection.js): the selected periods added up, in as few SAP reads as possible. */
async function selectionSummary(p) {
    const terms = S.termsOf(p.periods, { ytdOnly: envBudgetSource() === 'sap' });
    const reads = await readPeriods(uniq(terms.map((t) => t.period)), (q) => rawSummary({ ...p, period: q }));
    return S.combine(terms.map((t) => ({ term: t, rows: reads.get(t.period) })), S.summaryKey, p.period);
}

/** Detail rows of the selection, added up per posting line. */
async function selectionDetail(p, where = {}) {
    const terms = S.termsOf(p.periods);
    const reads = await readPeriods(uniq(terms.map((t) => t.period)), (q) => rawDetail({ ...p, period: q }, where));
    return S.combine(terms.map((t) => ({ term: t, rows: reads.get(t.period) })), S.lineKey, p.period);
}

// ---------------------------------------------------------------- settings in force

const store = () => getStore();
/*
   The report never fails because the settings store does (e.g. the database refuses CREATE SCHEMA): reads fall back to
   no rules / default mapping / default budget and say so in the log; admin saves still report the error.
*/
let storeWarned = 0;
async function safe(what, fn, fallback) {
    try { return await fn(); } catch (e) {
        if (Date.now() - storeWarned > 60_000) { console.error(`[publicity-expenses] settings store unavailable (${what}):`, e.message); storeWarned = Date.now(); }
        return fallback;
    }
}
async function mappingNow() { return (await safe('mapping', () => store().settings.get('mapping'), null)) || { groups: {}, aliases: {}, glMedia: {} }; }
async function rulesNow() { return safe('rules', () => store().rules.list(), []); }
const activeBudget = (fy) => safe('budget', () => store().budget.active(Number(fy)), {});

/** Copies of the rows with header group, spend class, media bucket, unmapped flag. */
function enrich(rows, mapping) {
    return rows.map((src) => {
        const r = { ...src };
        const g = headerGroup(r.ReportHeader, mapping);
        r.HeaderGroup = g.id; r.HeaderLabel = g.label; r.SpendClass = g.cls; r.InMIS = g.mis;
        r.Medium = medium(r.GLAccount, r.GLAccountName, g, mapping);
        r.Unmapped = isUnmapped(r.ProductGroup);
        return r;
    });
}

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * The report rows of the selection: SAP rows, exclusions (rules in force at asOf, default the latest selected period),
 * budget. Returns { rows, excluded, rules (in force), budget: { source, versions } }.
 */
async function reportRows(p, { asOf, mapping, rules, budget = true } = {}) {
    mapping = mapping || await mappingNow();
    const rows0 = enrich(await selectionSummary(p), mapping);
    let rows = rows0; let excluded = null; let inForce = [];
    if (p.exclusions) {
        const all = rules || await rulesNow();
        inForce = R.activeRules(all, asOf?.fy ?? p.fy, asOf?.period ?? p.period);
        if (inForce.length) {
            const detail = inForce.some((r) => r.level === 'detail') ? await selectionDetail(p) : null;
            const out = R.applyToSummary(rows0, inForce, detail);
            rows = out.rows; excluded = out.excluded;
        }
    }
    let b = { source: envBudgetSource(), versions: {} };
    if (budget) {
        const active = await activeBudget(p.fy);
        if (Object.keys(active).length) {
            rows = applyUploadedBudget(rows, active, p.periods, mapping);
            // Budget-only rows of other companies leave with the company filter (a line without company stays).
            if (p.companies.length) rows = rows.filter((r) => !r.IsBudget || !r.CompanyCode || p.companies.includes(r.CompanyCode));
            b = { source: 'upload', versions: Object.fromEntries(Object.entries(active).map(([k, v]) => [k, { id: v.version.id, version: v.version.version, uploadedBy: v.version.uploadedBy, uploadedAt: v.version.uploadedAt, total: v.version.total }])) };
        } else if (b.source === 'mock') applyMockBudget(rows, p.fy, p.periods);
    }
    return { rows, excluded, rules: inForce, budget: b, mapping, rawCount: rows0.length };
}

function exclusionMeta(excluded, inForce) {
    if (!inForce.length) return { rules: 0, cy: 0, py: 0, lines: 0, byRule: [] };
    return {
        rules: inForce.length, cy: excluded?.cy ?? 0, py: excluded?.py ?? 0, cyP: excluded?.cyP ?? 0, lines: excluded?.lines ?? 0,
        byRule: inForce.map((r) => ({ id: r.id, dimension: r.dimension, reason: r.reason, ...(excluded?.byRule?.[r.id] ?? { cy: 0, py: 0, lines: 0 }) })),
    };
}

function totalBy(rows, keyOf, extra) {
    const m = new Map();
    for (const r of rows) {
        const k = keyOf(r);
        const t = m.get(k) || { key: k, cy: 0, py: 0, rows: 0, ...(extra ? extra(r) : {}) };
        t.cy += r.CYYTDAmount; t.py += r.PYYTDAmount; t.rows += 1;
        m.set(k, t);
    }
    return [...m.values()].map((t) => ({ ...t, cy: r2(t.cy), py: r2(t.py) })).sort((a, b) => b.cy - a.cy);
}

async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
    }));
    return out;
}

// ---------------------------------------------------------------- routes

router.use(requireUser);

const handle = (name, fn) => async (req, res) => {
    const t0 = Date.now();
    try {
        const body = await fn(req);
        console.log(`[publicity-expenses] ${req.email} ${name} ${body.rows ? body.rows.length : ''} ${Date.now() - t0}ms`);
        res.set('Cache-Control', 'no-store').json({ success: true, ...body });
    } catch (e) {
        const status = e.status || 500;
        if (status >= 500) console.error(`[publicity-expenses] ${name}`, e.message);
        res.status(status).json({ success: false, error: status === 500 ? 'Something went wrong while reading the expenses.' : e.message });
    }
};
const audit = (req, action, detail) => store().audit.add(req.email, action, detail);

const meta = (p, extra = {}) => ({
    source: source(), system: source() === 'sap' ? sap.systemLabel() : 'Mock data', fy: p.fy, period: p.period, periods: p.periods,
    companies: p.companies, exclusionsOn: p.exclusions, fetchedAt: new Date().toISOString(), ...extra,
});

router.get('/health', handle('health', async () => ({ ok: true, source: source(), budget: envBudgetSource(), system: source() === 'sap' ? sap.systemLabel() : 'Mock data' })));
router.get('/me', handle('me', async (req) => ({ email: req.email, role: req.role, admin: req.role === 'Admin' })));
router.get('/config', handle('config', async () => ({ config: { ...publicConfig(await mappingNow()), dimensions: Object.entries(R.DIMENSIONS).map(([id, d]) => ({ id, label: d.label, level: d.level })) } })));

router.get('/summary', handle('summary', async (req) => {
    const p = params(req.query);
    const out = await reportRows(p);
    const latest = await rawSummary({ fy: p.fy, period: p.period }); // cached by now
    // Company codes with data in the latest selected period (all companies), for the company filter.
    const companiesInData = uniq(latest.map((r) => r.CompanyCode).filter(Boolean)).sort();
    return { rows: out.rows, meta: meta(p, { sourceRows: out.rawCount, companiesInData, budget: out.budget.source, budgetVersions: out.budget.versions, exclusions: exclusionMeta(out.excluded, out.rules) }) };
}));

/** What a drill-down line sends to the browser: the posting-line fields, the selection totals, one amount per selected period. */
const DRILL_FIELDS = ['CompanyCode', 'ReportingKey', 'GLAccount', 'GLAccountName', 'Site', 'HeaderGroup', 'HeaderLabel', 'CostCenter', 'CostCenterName', 'CostCenterType',
    'ProfitCenter', 'MappingRule', 'LookupField', 'DerivedCostCenterNo', 'ProductHierarchy', 'SalesBrand', 'ProductGroup', 'ItemCategory', 'ProductRange', 'ProductType',
    'MISHeading', 'Product', 'CYYTDAmount', 'PYYTDAmount', 'CYPeriodAmount', 'PYPeriodAmount', 'cy', 'py', 'to_NetSaleMaster', 'ExcludedBy'];
const drillRow = (r) => { const o = {}; for (const f of DRILL_FIELDS) if (r[f] !== undefined && r[f] !== '') o[f] = r[f]; return o; };

/*
   Drill-down of any report figure: one report row (key) or a sub-total (keys of its rows), optionally one G/L, sites,
   header groups. Lines = G/L x cost centre x profit centre with the selection total (read like the summary, so it equals
   the report figure) and the amount of each selected period (cy[i] / py[i] for periods[i]) - the basis to check against
   SAP (FAGLB03 / KSB1). SKUs (ZNET_SALE_MASTER) only when asked for (skus: true) and one report row is drilled: through
   the gateway each line is its own SAP call (~1 s each, 4 at a time), so the app shows the lines first and asks again
   for the SKUs (cached 10 minutes like everything else).
*/
async function drill(req) {
    const src = req.method === 'POST' ? (req.body || {}) : req.query;
    const p = params(src, { cell: true });
    const mapping = await mappingNow();
    const where = { ...(p.keys.length ? { ReportingKey: p.keys } : {}), ...(p.gls.length ? { GLAccount: p.gls } : {}), ...(p.sites.length ? { Site: p.sites } : {}) };
    const terms = S.termsOf(p.periods);
    const expand = p.keys.length === 1 && (req.method === 'GET' || src.skus === true || src.skus === 'true');
    const reads = await readPeriods(uniq([...p.periods, ...terms.map((t) => t.period)]).sort((a, b) => a - b),
        (q) => rawDetail({ ...p, period: q }, where, { expand: expand && q === p.period }));
    const combined = S.combine(terms.map((t) => ({ term: t, rows: reads.get(t.period) })), S.lineKey, p.period);
    const index = new Map(combined.map((r) => [S.lineKey(r), Object.assign(r, { cy: p.periods.map(() => 0), py: p.periods.map(() => 0) })]));
    p.periods.forEach((q, i) => {
        for (const d of reads.get(q)) {
            let o = index.get(S.lineKey(d));
            if (!o) { o = { ...d, CYYTDAmount: 0, PYYTDAmount: 0, cy: p.periods.map(() => 0), py: p.periods.map(() => 0) }; index.set(S.lineKey(d), o); combined.push(o); }
            o.cy[i] = r2(o.cy[i] + (Number(d.CYPeriodAmount) || 0)); o.py[i] = r2(o.py[i] + (Number(d.PYPeriodAmount) || 0));
        }
    });
    let rows = enrich(combined, mapping);
    if (p.groups.length) rows = rows.filter((r) => p.groups.includes(r.HeaderGroup));
    let excluded = [];
    if (p.exclusions) {
        const inForce = R.activeRules(await rulesNow(), p.fy, p.period);
        if (inForce.length) ({ rows, excluded } = R.applyToDetail(rows, inForce));
    }
    // Lines that are zero in every selected period and both totals carry nothing to check.
    const live = (r) => Math.abs(r.CYYTDAmount) >= 0.005 || Math.abs(r.PYYTDAmount) >= 0.005 || r.cy.some((v) => Math.abs(v) >= 0.005) || r.py.some((v) => Math.abs(v) >= 0.005);
    rows = rows.filter(live); excluded = excluded.filter(live);
    if (rows.length > MAX_LINES) throw new BadInput(`${rows.length} posting lines - too many to show at once. Drill into a smaller part of the report or pick fewer periods.`);
    return { rows: rows.map(drillRow), excluded: excluded.map(drillRow), periods: p.periods, reads: { terms, text: S.describe(terms) }, meta: meta(p) };
}
router.get('/detail', handle('detail', drill));
router.post('/detail', handle('detail', drill));

router.get('/trend', handle('trend', async (req) => {
    const p = params(req.query);
    const [mapping, rules] = await Promise.all([mappingNow(), rulesNow()]);
    const periods = Array.from({ length: p.period }, (_, i) => i + 1);
    const months = await mapLimit(periods, 3, async (period) => {
        // Rules in force for the latest selected period apply to every month, so the months add up to the figures shown.
        const { rows } = await reportRows({ ...p, periods: [period], period }, { asOf: p, mapping, rules, budget: false });
        const byGroup = {};
        let cy = 0; let py = 0;
        for (const r of rows) {
            cy += r.CYPeriodAmount; py += r.PYPeriodAmount;
            const g = (byGroup[r.HeaderGroup] ||= { cy: 0, py: 0 });
            g.cy += r.CYPeriodAmount; g.py += r.PYPeriodAmount;
        }
        for (const g of Object.values(byGroup)) { g.cy = r2(g.cy); g.py = r2(g.py); }
        return { period, cy: r2(cy), py: r2(py), byGroup };
    });
    return { months, periods: p.periods, meta: meta(p) };
}));

router.get('/breakdown', handle('breakdown', async (req) => {
    const p = params(req.query);
    const mapping = await mappingNow();
    const [detail0, summary0] = await Promise.all([selectionDetail(p), selectionSummary(p)]);
    let rows = enrich(detail0, mapping);
    const glTotal = r2(summary0.reduce((s, r) => s + r.CYYTDAmount, 0));
    let excludedRows = [];
    const inForce = p.exclusions ? R.activeRules(await rulesNow(), p.fy, p.period) : [];
    if (inForce.length) ({ rows, excluded: excludedRows } = R.applyToDetail(rows, inForce));
    const { rows: summary } = await reportRows(p, { mapping, budget: false });
    const detailCy = r2(rows.reduce((s, r) => s + r.CYYTDAmount, 0));
    const summaryCy = r2(summary.reduce((s, r) => s + r.CYYTDAmount, 0));
    const excludedCy = r2(excludedRows.reduce((s, r) => s + r.CYYTDAmount, 0));
    const unmapped = rows.filter((r) => r.Unmapped);
    return {
        bySite: totalBy(rows, (r) => r.Site || '-'),
        byProfitCenter: totalBy(rows, (r) => r.ProfitCenter || '-').slice(0, 25),
        byCostCenterType: totalBy(rows, (r) => r.CostCenterType || '-'),
        byRule: totalBy(rows, (r) => r.MappingRule || '-', (r) => ({ lookup: r.LookupField || '' })),
        byProductGroup: totalBy(rows.filter((r) => !r.SerialNo), (r) => r.ProductGroup || '-'),
        topCostCenters: totalBy(rows, (r) => r.CostCenter || '-', (r) => ({ name: r.CostCenterName || '', site: r.Site || '', type: r.CostCenterType || '' })).slice(0, 25),
        unmapped: { cy: r2(unmapped.reduce((s, r) => s + r.CYYTDAmount, 0)), rows: unmapped.length, byGroup: totalBy(unmapped, (r) => r.ProductGroup) },
        reconciliation: { detailCy, summaryCy, difference: r2(detailCy - summaryCy), glTotal, excludedCy, glCheck: r2(glTotal - summaryCy - excludedCy), costCenters: new Set(rows.map((r) => r.CostCenter)).size, lines: rows.length },
        excludedByRule: totalBy(excludedRows, (r) => String(r.ExcludedBy)),
        meta: meta(p),
    };
}));

// ---------------------------------------------------------------- admin: exclusions

/** Values of a dimension found in the CDS results of the period (CY or PY postings), with names and amounts. */
async function candidates(p, dimension) {
    const d = R.DIMENSIONS[dimension];
    if (!d) throw new BadInput('Unknown dimension.');
    const rows = d.level === 'summary' ? await selectionSummary(p) : await selectionDetail(p);
    const m = new Map();
    for (const r of rows) {
        const v = String(r[d.field] ?? '').trim();
        if (!v) continue;
        const k = R.norm(v);
        let c = m.get(k);
        if (!c) {
            c = { value: v, name: '', info: new Set(), cy: 0, py: 0, lines: 0 };
            if (dimension === 'GL') c.name = r.GLAccountName || '';
            if (dimension === 'COST_CENTER') c.name = r.CostCenterName || '';
            if (dimension === 'MAPPING_RULE') c.name = r.LookupField ? `looked up in ${r.LookupField}` : '';
            m.set(k, c);
        }
        if (dimension === 'GL') c.info.add(r.ReportHeader);
        if (dimension === 'COST_CENTER') { c.info.add(r.Site); if (r.CostCenterType) c.info.add(`type ${r.CostCenterType}`); }
        if (dimension === 'PROFIT_CENTER' || dimension === 'CC_TYPE') c.info.add(r.Site);
        if (dimension === 'PRODUCT_GROUP') c.info.add(r.SerialNo ? 'brand rows' : 'non-brand');
        c.cy += r.CYYTDAmount; c.py += r.PYYTDAmount; c.lines += 1;
    }
    return [...m.values()].map((c) => ({ value: c.value, name: c.name, info: [...c.info].filter(Boolean).join(' · '), cy: r2(c.cy), py: r2(c.py), lines: c.lines }))
        .sort((a, b) => Math.abs(b.cy) - Math.abs(a.cy) || a.value.localeCompare(b.value));
}

/** What one rule would remove from the selected period on its own (ignores other rules), with the biggest lines. */
async function impactAlone(p, rule) {
    const [compiled] = R.activeRules([{ ...rule, id: rule.id || 0, active: true, fromFy: 2000, fromPeriod: 1, toFy: null, toPeriod: null }], p.fy, p.period);
    if (compiled.level === 'summary') {
        const summary = await selectionSummary(p);
        const hit = summary.filter((r) => compiled.match(r[compiled.field]));
        return { cy: r2(hit.reduce((s, r) => s + r.CYYTDAmount, 0)), py: r2(hit.reduce((s, r) => s + r.PYYTDAmount, 0)), lines: hit.length, matched: new Set(hit.map((r) => R.norm(r[compiled.field]))).size };
    }
    const detail = await selectionDetail(p);
    const hit = detail.filter((r) => compiled.match(r[compiled.field]));
    return { cy: r2(hit.reduce((s, r) => s + r.CYYTDAmount, 0)), py: r2(hit.reduce((s, r) => s + r.PYYTDAmount, 0)), lines: hit.length, matched: new Set(hit.map((r) => R.norm(r[compiled.field]))).size };
}

router.get('/exclusions', requireAdmin, handle('exclusions', async (req) => {
    const p = params(req.query);
    const rules = await rulesNow();
    const { excluded, rules: inForce } = await reportRows({ ...p, exclusions: true }, { rules, budget: false });
    const summaryTotal = r2((await selectionSummary(p)).reduce((s, r) => s + r.CYYTDAmount, 0));
    const inForceIds = new Set(inForce.map((r) => r.id));
    const list = await Promise.all(rules.map(async (r) => ({
        ...r,
        inForce: inForceIds.has(r.id),
        impact: inForceIds.has(r.id) ? (excluded?.byRule?.[r.id] ?? { cy: 0, py: 0, lines: 0 }) : await impactAlone(p, r),
    })));
    return { rules: list, total: exclusionMeta(excluded, inForce), reportTotal: summaryTotal, dimensions: Object.entries(R.DIMENSIONS).map(([id, d]) => ({ id, label: d.label, level: d.level })) };
}));

router.get('/exclusions/candidates', requireAdmin, handle('candidates', async (req) => {
    const p = params(req.query);
    const dimension = String(req.query.dimension || '').toUpperCase();
    const list = await candidates(p, dimension);
    const rules = (await rulesNow()).filter((r) => r.dimension === dimension);
    const compiled = rules.map((r) => ({ id: r.id, active: r.active, match: R.compile(r) }));
    return { values: list.map((c) => ({ ...c, ruleIds: compiled.filter((r) => r.match(c.value)).map((r) => r.id) })) };
}));

router.post('/exclusions/preview', requireAdmin, handle('rule-preview', async (req) => {
    const p = params(req.body || {});
    // Impact on the selected period only: the effective dates do not matter here.
    const v = R.validateRule({ ...(req.body?.rule || {}), fromFy: Number(p.fy), fromPeriod: 1, toFy: null, toPeriod: null, reason: 'preview' });
    if (v.error) throw new BadInput(v.error);
    return { impact: await impactAlone(p, v.rule) };
}));

router.post('/exclusions', requireAdmin, handle('rule-create', async (req) => {
    const v = R.validateRule(req.body);
    if (v.error) throw new BadInput(v.error);
    const rule = await store().rules.create(v.rule, req.email);
    await audit(req, 'exclusion.create', { rule });
    return { rule };
}));

router.put('/exclusions/:id', requireAdmin, handle('rule-update', async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new BadInput('Bad rule id.');
    const v = R.validateRule(req.body);
    if (v.error) throw new BadInput(v.error);
    const before = (await rulesNow()).find((r) => r.id === id);
    if (!before) { const e = new Error('Rule not found.'); e.status = 404; throw e; }
    const rule = await store().rules.update(id, v.rule, req.email);
    await audit(req, 'exclusion.update', { before, after: rule });
    return { rule };
}));

router.delete('/exclusions/:id', requireAdmin, handle('rule-delete', async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new BadInput('Bad rule id.');
    const rule = await store().rules.remove(id);
    if (!rule) { const e = new Error('Rule not found.'); e.status = 404; throw e; }
    await audit(req, 'exclusion.delete', { rule });
    return { rule };
}));

router.post('/exclusions/bulk', requireAdmin, handle('rule-bulk', async (req) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length || rows.length > 500) throw new BadInput('Upload 1 to 500 rules.');
    const errors = []; const ok = [];
    rows.forEach((r, i) => { const v = R.validateRule(r); if (v.error) errors.push({ row: Number(r?.row) || i + 2, message: v.error }); else ok.push(v.rule); });
    if (req.body?.dryRun || errors.length) return { errors, valid: ok.length, created: [] };
    const created = [];
    for (const r of ok) created.push(await store().rules.create(r, req.email));
    await audit(req, 'exclusion.bulk', { count: created.length, ids: created.map((r) => r.id), fileName: String(req.body?.fileName || '').slice(0, 120) });
    return { errors: [], valid: ok.length, created };
}));

// ---------------------------------------------------------------- admin: budget

router.get('/budget', requireAdmin, handle('budget', async (req) => {
    const fy = Number(req.query.fy);
    if (!Number.isInteger(fy)) throw new BadInput('Fiscal year must be a year like 2026.');
    const [active, versions] = await Promise.all([store().budget.active(fy), store().budget.versions(fy)]);
    const byHeader = (lines) => { const o = {}; for (const l of lines) o[l.headerGroup] = r2((o[l.headerGroup] || 0) + l.annual); return o; };
    return {
        source: Object.keys(active).length ? 'upload' : envBudgetSource(),
        active: Object.fromEntries(Object.entries(active).map(([k, v]) => [k, { ...v.version, byHeader: byHeader(v.lines) }])),
        versions,
    };
}));

router.get('/budget/template', requireAdmin, handle('budget-template', async (req) => {
    const p = params(req.query);
    const kind = String(req.query.kind || 'RB').toUpperCase() === 'OB' ? 'OB' : 'RB';
    const mapping = await mappingNow();
    const rows = enrich(await selectionSummary(p), mapping);
    const active = await store().budget.active(Number(p.fy));
    const current = new Map((active[kind]?.lines || []).map((l) => [`${l.reportingKey}|${l.headerGroup}|${l.site}`, l]));
    const m = new Map();
    for (const r of rows) {
        const k = `${r.ReportingKey}|${r.HeaderGroup}|`;
        const t = m.get(k) || {
            key: r.ReportingKey, company: r.CompanyCode, header: r.HeaderGroup, headerLabel: r.HeaderLabel, site: '',
            category: r.ItemCategory || r.ProductGroup, range: r.ProductRange, brand: r.ProductType, line: r.MISHeading || r.Product || r.ProductGroup,
            serial: r.SerialNo, t1: r.T1, t2: r.T2, t3: r.T3, cy: 0, py: 0,
        };
        t.cy += r.CYYTDAmount; t.py += r.PYYTDAmount;
        m.set(k, t);
    }
    for (const l of current.values()) {
        const k = `${l.reportingKey}|${l.headerGroup}|${l.site}`;
        if (!m.has(k)) m.set(k, { key: l.reportingKey, company: l.companyCode, header: l.headerGroup, headerLabel: headerGroup(l.headerGroup, mapping).label, site: l.site, category: l.labels?.category || '', range: l.labels?.range || '', brand: l.labels?.brand || '', line: l.labels?.line || '', serial: '', cy: 0, py: 0 });
    }
    const lines = [...m.values()].map((t) => {
        const c = current.get(`${t.key}|${t.header}|${t.site}`);
        return { ...t, cy: r2(t.cy), py: r2(t.py), annual: c ? c.annual : null, months: c ? c.months : null };
    }).sort((a, b) => `${(a.serial || '9999').padStart(4, '0')}|${a.t1 || ''}|${a.t2 || ''}|${a.t3 || ''}|${a.key}|${a.header}`.localeCompare(`${(b.serial || '9999').padStart(4, '0')}|${b.t1 || ''}|${b.t2 || ''}|${b.t3 || ''}|${b.key}|${b.header}`));
    return { kind, lines, activeVersion: active[kind]?.version ?? null };
}));

router.post('/budget/upload', requireAdmin, handle('budget-upload', async (req) => {
    const b = req.body || {};
    const fy = Number(b.fy);
    const mapping = await mappingNow();
    // Reporting keys known in SAP for the year (period 12 = every row that has postings in the year so far or last year).
    const known = new Map();
    if (Number.isInteger(fy)) {
        for (const r of await rawSummary({ fy: String(fy), period: 12 }).catch(() => [])) {
            if (!known.has(r.ReportingKey)) known.set(r.ReportingKey, { key: r.ReportingKey, companyCode: r.CompanyCode });
            if (!known.has(r.ReportingKey.toUpperCase())) known.set(r.ReportingKey.toUpperCase(), { key: r.ReportingKey, companyCode: r.CompanyCode });
        }
    }
    const v = validateUpload(b, known, mapping);
    const active = Number.isInteger(fy) ? await store().budget.active(fy) : {};
    const kind = String(b.kind || '').toUpperCase();
    const prev = active[kind];
    const previous = prev ? { version: prev.version.version, total: prev.version.total, byHeader: prev.lines.reduce((o, l) => { o[l.headerGroup] = r2((o[l.headerGroup] || 0) + l.annual); return o; }, {}) } : null;
    const summary = { errors: v.errors.slice(0, 500), errorCount: v.errors.length, warnings: v.warnings, lineCount: v.lines.length, skipped: v.skipped, totals: v.totals, phasing: v.phasing, previous };
    if (b.dryRun || v.errors.length) return { ...summary, saved: null };
    const note = String(b.note || '').trim().slice(0, 300);
    const version = await store().budget.create({ fy, kind, note, fileName: String(b.fileName || '').slice(0, 120), unit: String(b.unit).toLowerCase(), phasing: v.phasing }, v.lines, req.email);
    await audit(req, 'budget.upload', { fy, kind, version: version.version, id: version.id, lines: v.lines.length, total: v.totals.total, fileName: version.fileName, note });
    return { ...summary, saved: version };
}));

router.get('/budget/versions/:id/lines', requireAdmin, handle('budget-lines', async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new BadInput('Bad version id.');
    return { lines: await store().budget.lines(id) };
}));

router.post('/budget/versions/:id/activate', requireAdmin, handle('budget-activate', async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new BadInput('Bad version id.');
    const v = await store().budget.activate(id);
    if (!v) { const e = new Error('Version not found.'); e.status = 404; throw e; }
    await audit(req, 'budget.activate', { id, fy: v.fy, kind: v.kind, version: v.version });
    return { version: v };
}));

router.post('/budget/deactivate', requireAdmin, handle('budget-deactivate', async (req) => {
    const fy = Number(req.body?.fy); const kind = String(req.body?.kind || '').toUpperCase();
    if (!Number.isInteger(fy) || (kind !== 'OB' && kind !== 'RB')) throw new BadInput('Give fy and kind OB or RB.');
    const versions = await store().budget.deactivate(fy, kind);
    await audit(req, 'budget.deactivate', { fy, kind, versions: versions.map((v) => v.version) });
    return { versions };
}));

// ---------------------------------------------------------------- admin: mapping, audit

router.get('/settings/mapping', requireAdmin, handle('mapping', async (req) => {
    const p = params(req.query);
    const mapping = await mappingNow();
    const raw = await selectionSummary(p);
    const headers = new Map(); const gls = new Map();
    for (const r of raw) {
        const g = headerGroup(r.ReportHeader, mapping);
        const h = headers.get(r.ReportHeader) || { header: r.ReportHeader, groupId: g.id, cls: g.cls, cy: 0 };
        h.cy += r.CYYTDAmount; headers.set(r.ReportHeader, h);
        const n = String(r.GLAccount).replace(/^0+/, '');
        const x = gls.get(n) || { gl: n, name: r.GLAccountName, groupId: g.id, header: g.label, bucket: medium(r.GLAccount, r.GLAccountName, g, mapping), defaultBucket: medium(r.GLAccount, r.GLAccountName, g, null), overridden: !!mapping.glMedia?.[n], cy: 0 };
        x.cy += r.CYYTDAmount; gls.set(n, x);
    }
    return {
        mapping, config: publicConfig(mapping),
        headersSeen: [...headers.values()].map((h) => ({ ...h, cy: r2(h.cy) })).sort((a, b) => b.cy - a.cy),
        gls: [...gls.values()].map((g) => ({ ...g, cy: r2(g.cy) })).sort((a, b) => a.gl.localeCompare(b.gl)),
    };
}));

router.put('/settings/mapping', requireAdmin, handle('mapping-save', async (req) => {
    const v = validateMapping(req.body?.mapping);
    if (v.error) throw new BadInput(v.error);
    const before = await mappingNow();
    await store().settings.set('mapping', v.mapping, req.email);
    await audit(req, 'mapping.save', { before, after: v.mapping });
    return { mapping: v.mapping };
}));

router.get('/audit', requireAdmin, handle('audit', async () => ({ entries: await store().audit.list(300) })));

router.use((req, res) => res.status(404).json({ success: false, error: 'Not found.' }));

module.exports = router;
module.exports._test = { params, enrich, totalBy, source, reportRows, selectionSummary, selectionDetail };
