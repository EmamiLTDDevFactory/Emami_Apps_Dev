/*
   Publicity Expenses (embedded-apps/publicity-expenses): ATL / BTL advertisement expenses MIS on the SAP CDS views
   ZC_ATLBTL_EXP_SUMMARY / ZC_ATLBTL_EXP_DETAIL. Mounted at /api/me/publicity-expenses (rides the existing nginx /api/me
   rule). Read-only.

     GET /health                                    { ok, source, budget, system }
     GET /config                                    header groups, spend classes, totals, non-brand groups
     GET /summary   ?fy=2026&period=7[&company=1000]  summary rows + HeaderGroup / SpendClass / Medium, mock budget
     GET /detail    ?fy&period&company&gl&key&site   cost-centre rows of one report cell, SKUs in to_NetSaleMaster
     GET /trend     ?fy&period[&company]              CY / PY amount of each period 1..period, by header group
     GET /breakdown ?fy&period[&company]              detail rows totalled by site, profit centre, cost-centre type,
                                                     mapping rule, top cost centres + reconciliation to the summary
   Every call needs a hub session (Bearer JWT) and a Publicity Expenses grant in Manage Access.
   Data source: SAP when PUBEXP_SAP_ODATA_ROOT (or both service bases) is set, else mock; PUBEXP_SOURCE=mock|sap forces it.
   Answers are cached in memory for 10 minutes per query (?refresh=1 skips the cache). Logs: user, route, rows, ms.
*/
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { JWT_SECRET } = require('../sessionAuth');
const sap = require('./sap');
const mock = require('./mock');
const { headerGroup, medium, publicConfig, isUnmapped } = require('./config');
const { applyMockBudget, budgetSource } = require('./budget');

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
        next();
    } catch (e) {
        console.error('[publicity-expenses] access check', e.message);
        res.status(500).json({ success: false, error: 'Could not verify your access.' });
    }
}

// ---------------------------------------------------------------- input

class BadInput extends Error { constructor(m) { super(m); this.status = 400; } }

function params(q, { cell = false } = {}) {
    const fy = String(q.fy || '');
    if (!/^20\d{2}$/.test(fy)) throw new BadInput('Fiscal year must be a year like 2026.');
    const period = Number(q.period);
    if (!Number.isInteger(period) || period < 1 || period > 12) throw new BadInput('Period must be 1 to 12.');
    const company = String(q.company || '').trim().toUpperCase();
    if (company && !/^[A-Z0-9]{4}$/.test(company)) throw new BadInput('Company code must be 4 letters or digits.');
    const out = { fy, period, company, refresh: q.refresh === '1' };
    if (cell) {
        const gl = String(q.gl || '').trim();
        const key = String(q.key || '').trim();
        const site = String(q.site || '').trim().toUpperCase();
        if (gl && !/^\d{1,10}$/.test(gl)) throw new BadInput('G/L account must be digits.');
        if (!/^[A-Za-z0-9 _\-/&.()]{1,30}$/.test(key)) throw new BadInput('Reporting key is missing or not valid.');
        if (site && site !== 'HO' && site !== 'UN') throw new BadInput('Site must be HO or UN.');
        Object.assign(out, { gl: gl ? gl.padStart(10, '0') : '', key, site });
    }
    return out;
}

// ---------------------------------------------------------------- data

const cache = new Map();
function cached(key, refresh, load) {
    const hit = cache.get(key);
    if (!refresh && hit && Date.now() - hit.at < TTL) return hit.promise;
    const promise = load();
    cache.set(key, { at: Date.now(), promise });
    promise.catch(() => cache.delete(key));
    if (cache.size > 80) cache.delete(cache.keys().next().value);
    return promise;
}

/** Report header group, spend class and media bucket on each row. */
function enrich(rows) {
    for (const r of rows) {
        const g = headerGroup(r.ReportHeader);
        r.HeaderGroup = g.id;
        r.HeaderLabel = g.label;
        r.SpendClass = g.cls;
        r.InMIS = g.mis;
        r.Medium = medium(r.GLAccount, r.GLAccountName, g);
        r.Unmapped = isUnmapped(r.ProductGroup);
    }
    return rows;
}

function summaryRows({ fy, period, company, refresh }) {
    const src = source();
    return cached(`s|${src}|${fy}|${period}|${company}`, refresh, async () => {
        const where = company ? { CompanyCode: company } : {};
        const rows = enrich(src === 'sap' ? await sap.fetchSummary(fy, period, where) : mock.summary(fy, period, where));
        if (budgetSource() === 'mock') applyMockBudget(rows, fy, period);
        return rows;
    });
}

function detailRows({ fy, period, company, refresh }, where = {}, opts = {}) {
    const src = source();
    const w = { ...(company ? { CompanyCode: company } : {}), ...where };
    return cached(`d|${src}|${fy}|${period}|${JSON.stringify(w)}|${opts.expand ? 1 : 0}`, refresh, async () =>
        enrich(src === 'sap' ? await sap.fetchDetail(fy, period, w, opts) : mock.detail(fy, period, w, opts)));
}

const r2 = (x) => Math.round(x * 100) / 100;

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

const meta = (p) => ({ source: source(), budget: budgetSource(), system: source() === 'sap' ? sap.systemLabel() : 'Mock data', fy: p.fy, period: p.period, company: p.company, fetchedAt: new Date().toISOString() });

router.get('/health', handle('health', async () => ({ ok: true, source: source(), budget: budgetSource(), system: source() === 'sap' ? sap.systemLabel() : 'Mock data' })));

router.get('/config', handle('config', async () => ({ config: publicConfig() })));

router.get('/summary', handle('summary', async (req) => {
    const p = params(req.query);
    return { rows: await summaryRows(p), meta: meta(p) };
}));

router.get('/detail', handle('detail', async (req) => {
    const p = params(req.query, { cell: true });
    const where = { ReportingKey: p.key, ...(p.gl ? { GLAccount: p.gl } : {}), ...(p.site ? { Site: p.site } : {}) };
    return { rows: await detailRows(p, where, { expand: true }), meta: meta(p) };
}));

router.get('/trend', handle('trend', async (req) => {
    const p = params(req.query);
    const periods = Array.from({ length: p.period }, (_, i) => i + 1);
    const months = await mapLimit(periods, 3, async (period) => {
        const rows = await summaryRows({ ...p, period });
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
    return { months, meta: meta(p) };
}));

router.get('/breakdown', handle('breakdown', async (req) => {
    const p = params(req.query);
    const [rows, summary] = await Promise.all([detailRows(p), summaryRows(p)]);
    const detailCy = r2(rows.reduce((s, r) => s + r.CYYTDAmount, 0));
    const summaryCy = r2(summary.reduce((s, r) => s + r.CYYTDAmount, 0));
    const unmapped = rows.filter((r) => r.Unmapped);
    return {
        bySite: totalBy(rows, (r) => r.Site || '-'),
        byProfitCenter: totalBy(rows, (r) => r.ProfitCenter || '-').slice(0, 25),
        byCostCenterType: totalBy(rows, (r) => r.CostCenterType || '-'),
        byRule: totalBy(rows, (r) => r.MappingRule || '-', (r) => ({ lookup: r.LookupField || '' })),
        byProductGroup: totalBy(rows.filter((r) => !r.SerialNo), (r) => r.ProductGroup || '-'),
        topCostCenters: totalBy(rows, (r) => r.CostCenter || '-', (r) => ({ name: r.CostCenterName || '', site: r.Site || '', type: r.CostCenterType || '' })).slice(0, 25),
        unmapped: { cy: r2(unmapped.reduce((s, r) => s + r.CYYTDAmount, 0)), rows: unmapped.length, byGroup: totalBy(unmapped, (r) => r.ProductGroup) },
        reconciliation: { detailCy, summaryCy, difference: r2(detailCy - summaryCy), costCenters: new Set(rows.map((r) => r.CostCenter)).size, lines: rows.length },
        meta: meta(p),
    };
}));

router.use((req, res) => res.status(404).json({ success: false, error: 'Not found.' }));

module.exports = router;
module.exports._test = { params, enrich, totalBy, source };
