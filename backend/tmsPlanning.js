/*
   Trip Trail > Distribution Planning (embedded-apps/smartruck-tms, docs/DISTRIBUTION_PLANNING.md).
   Builds the planning dataset `D` (the input of Sanjoy Paul's dp_engine.js, copy in tmsDpEngine.js) from LIVE SAP (ZTMS_SRV Dp* sets) instead of the
   CCD/HCD console workbooks. Only the forecast (not in SAP) is uploaded; depots, lanes, MT/Ecom splits and planning keys are config seeded
   once from his dp_data.json.

   Layers (top to bottom, only the first and last touch the outside world):
     create()          routes + storage (own tables, NOT tms_state) + refresh job + optional nightly timer
     buildDataset()    PURE: config + raw SAP rows + forecast -> D. Tested without SAP or a database.
     pull()            the SAP reads (per plant chunk, bounded), injectable as deps.fetchSet for tests
*/
const zlib = require('zlib');
const express = require('express');

const CHAN_CODE = { 10: 'GT', 20: 'GT', 25: 'GT', 35: 'GT', 40: 'GT', 30: 'MT', 55: 'Ecom', 57: 'Ecom', 96: 'Ecom', 95: 'GT', 58: 'GT', 45: 'GT', 70: 'GT' };
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const r2 = (x) => Math.round(x * 100) / 100;
const code = (v) => str(v).replace(/\.0$/, '').toUpperCase();
const matCode = (v) => { const s = str(v).replace(/\.0$/, ''); return /^\d+$/.test(s) ? s.replace(/^0+/, '') || '0' : s; };
const siteCode = (v) => code(v).split(/\s+/)[0] || '';
const sapDate = (v) => { const m = /\/Date\((-?\d+)/.exec(str(v)); if (m) return new Date(Number(m[1])).toISOString().slice(0, 10); const s = str(v); if (/^\d{8}$/.test(s) && s !== '00000000') return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; };
const chanOf = (vtweg, ecomGroups, kdgrp) => {
    const s = str(vtweg).replace(/^0+/, '');
    if (ecomGroups && ecomGroups.has(str(kdgrp).toUpperCase())) return 'Ecom';
    if (CHAN_CODE[s]) return CHAN_CODE[s];
    const u = s.toUpperCase();
    return u.startsWith('MT') ? 'MT' : u.startsWith('ECOM') || u.startsWith('E_COM') || u.startsWith('E-COM') ? 'Ecom' : 'GT';
};
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

class PlanError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

// =================================================================================================================== config
/** Config out of his dp_data.json (one-time import). Everything the engine needs that SAP cannot give. */
function configFromDataset(D) {
    if (!D || !Array.isArray(D.sites) || !Array.isArray(D.mats)) throw new PlanError('This is not a Distribution Planning dp_data.json (sites/mats missing).');
    const matKeys = {};
    D.mats.forEach((m) => { matKeys[m.code] = { div: m.div, key: m.key, ukey: m.ukey, cp: m.cp, cw: m.cw, brand: m.brand, rate: m.rate, desc: m.desc }; });
    return {
        sites: D.sites.map((s) => ({ code: s.code, name: s.name, zone: s.zone, type: s.type, mwh: s.mwh, lat: s.lat, lon: s.lon })),
        lanes: D.lanes || [], split: D.split || [], fold: D.fold || {}, matKeys, matOrder: D.mats.map((m) => m.code),
        ecomGroups: ['GROFERS', 'ZEPTO', 'FLIPKART', 'CLOUDTAIL INDIA PVT', 'SWIGGY', 'NYKAA B2B', 'NYKAA', 'MYNTRA', '1MG', 'CITY MALL', 'BIG BASKET - RETAIL', 'BIG BASKET - B2B', 'THEA TECHNOLOGIES PV'],
        spartDiv: {}, trendDays: (D.meta && D.meta.trendDays) || 14, seededAt: new Date().toISOString(),
    };
}
const emptyConfig = () => ({ sites: [], lanes: [], split: [], fold: {}, matKeys: {}, ecomGroups: [], spartDiv: {}, trendDays: 14 });

/** Plants to read from SAP: every planning site plus every old code that folds into one. */
const plantsOf = (cfg) => [...new Set([...(cfg.sites || []).map((s) => code(s.code)), ...Object.keys(cfg.fold || {}).map(code)])].filter(Boolean).sort();

// =================================================================================================================== forecast
const CH_ALIAS = { gt: 'GT', mt: 'MT', ecom: 'Ecom', 'e-com': 'Ecom', 'e com': 'Ecom', zepto: 'Ecom' };
/** rows from the browser: [{material, plant, channel, m0, m1, additional, w1..w4}] -> cleaned rows or an error naming the row. */
function cleanForecast(rows) {
    if (!Array.isArray(rows) || !rows.length) throw new PlanError('The forecast has no rows.');
    if (rows.length > 200000) throw new PlanError('The forecast has more than 200,000 rows.');
    const out = [];
    rows.forEach((r, i) => {
        const material = matCode(r.material), plant = siteCode(r.plant);
        if (!material || !plant) throw new PlanError(`Forecast row ${i + 1}: material and plant are required.`);
        const ch = CH_ALIAS[str(r.channel).toLowerCase()] || (str(r.channel) ? chanOf(r.channel) : 'GT');
        const v = ['m0', 'm1', 'additional', 'w1', 'w2', 'w3', 'w4'].map((k) => num(r[k]));
        if (v.some((x) => x < 0)) throw new PlanError(`Forecast row ${i + 1}: quantities cannot be negative.`);
        out.push({ material, plant, channel: ch, m0: v[0], m1: v[1], additional: v[2], w: [v[3], v[4], v[5], v[6]] });
    });
    return out;
}

// =================================================================================================================== PURE builder
/**
 * raw = { materials, stock, lots, sto, openOrders, sales, transit } (arrays of SAP rows as returned by the Dp* sets)
 * cfg = config (configFromDataset shape), forecast = cleaned rows, today = 'YYYY-MM-DD'
 */
function buildDataset({ cfg, raw = {}, forecast = [], today, builtAt, health = {}, forecastMeta }) {
    const warnings = [];
    const fold = {}; Object.entries(cfg.fold || {}).forEach(([a, b]) => { fold[code(a)] = code(b); });
    const D = { meta: { today, source: 'sap', builtAt: builtAt || new Date().toISOString(), health, trendDays: cfg.trendDays || 14, trendFrom: addDays(today, -(cfg.trendDays || 14)), forecast: forecastMeta || null, warnings }, mats: [], sites: [], stk: [], lots: [], git: [], ship: [], sto: [], fc: [], afc: [], rpp: [], prod: [], sale: [], trend: [], oo: [], split: cfg.split || [], lanes: [], fold };
    const six = new Map(), mix = new Map();
    const unknownSites = new Set();
    const site = (c) => {
        let k = code(c); if (!k) return null; k = fold[k] || k;
        let i = six.get(k);
        if (i === undefined) { i = D.sites.length; six.set(k, i); D.sites.push({ code: k, name: k, zone: '', type: '', mwh: '' }); unknownSites.add(k); }
        return i;
    };
    (cfg.sites || []).forEach((s) => { const k = code(s.code); if (fold[k]) return; const i = site(k); Object.assign(D.sites[i], { name: s.name || k, zone: s.zone || '', type: s.type || 'Depot', mwh: s.mwh || '' }); if (s.lat != null) { D.sites[i].lat = s.lat; D.sites[i].lon = s.lon; } unknownSites.delete(k); });
    (cfg.lanes || []).forEach(([a, b, d]) => { const x = fold[code(a)] || code(a), y = fold[code(b)] || code(b); if (x !== y) D.lanes.push([x, y, d]); });
    const laneDays = new Map(D.lanes.map(([a, b, d]) => [`${a}>${b}`, d]));

    // materials: config keys first, SAP master for the rest / for pack size
    const skippedMats = new Set(), unkeyed = [];
    const sapMat = new Map((raw.materials || []).map((m) => [matCode(m.Matnr), m]));
    const matIdx = (c) => {
        const k = matCode(c); if (!k) return null;
        let i = mix.get(k); if (i !== undefined) return i;
        const cf = (cfg.matKeys || {})[k], sm = sapMat.get(k);
        if (!cf && !(sm && cfg.includeUnknown)) { if (!cf) skippedMats.add(k); return null; }
        const cp = num(sm && sm.CasePack) || (cf && cf.cp) || 1;
        const gm = sm ? (/^kg$/i.test(str(sm.Gewei)) ? num(sm.Brgew) * 1000 : num(sm.Brgew)) : 0;
        const div = (cf && cf.div) || (cfg.spartDiv || {})[str(sm && sm.Spart)] || 'CCD';
        const rec = { code: k, desc: str(sm && sm.Maktx) || (cf && cf.desc) || k, div, key: (cf && cf.key) || k, cp, cw: gm ? r2(gm * cp / 1000) : (cf && cf.cw) || 0, brand: str(sm && sm.Brand) || (cf && cf.brand) || '', rate: (cf && cf.rate) || 0 };
        if (cf && cf.ukey) rec.ukey = cf.ukey;
        i = D.mats.length; mix.set(k, i); D.mats.push(rec);
        if (!cf) unkeyed.push(k);
        return i;
    };

    // keep the material order of the config: the engine breaks ties by index, so a stable order = a reproducible plan (and parity with his tool)
    (cfg.matOrder || []).forEach((c) => matIdx(c));

    // stock + GIT
    const stk = new Map();
    for (const r of raw.stock || []) {
        const mi = matIdx(r.Matnr), si = site(r.Werks); if (mi === null || si === null) continue;
        const a = stk.get(mi * 4096 + si) || [mi, si, 0, 0, 0]; a[2] += num(r.Unr); a[3] += num(r.Git); a[4] += num(r.Qi); stk.set(mi * 4096 + si, a);
    }
    stk.forEach((a) => { if (a[2] || a[3] || a[4]) D.stk.push([a[0], a[1], r2(a[2]), r2(a[3]), r2(a[4])]); if (a[3] > 0) D.git.push([a[0], a[1], r2(a[3])]); });
    for (const r of raw.lots || []) {
        const q = num(r.Unr); if (q <= 0) continue;
        const mi = matIdx(r.Matnr), si = site(r.Werks); if (mi === null || si === null) continue;
        // SAP gives LifePct (0..100, -1 = no expiry date); the engine wants 0..1 and -1
        const pct = r.LifePct !== undefined ? r.LifePct : (r.LifeLeft === null || r.LifeLeft === undefined || str(r.LifeLeft) === '' ? null : num(r.LifeLeft) * 100);
        const life = pct === null || str(pct) === '' || num(pct) < 0 ? -1 : Math.max(0, Math.round(num(pct) * 10) / 1000);
        D.lots.push([mi, si, r2(q), life, sapDate(r.Hsdat)]);
    }
    for (const r of raw.sto || []) {
        const mi = matIdx(r.Matnr), q = num(r.OpenQty); if (mi === null || q <= 0) continue;
        D.sto.push([mi, site(r.Reswk), site(r.Werks), r2(q)]);
    }
    // transit vehicles: from plant -> receiving plant, lead time from the lane table
    for (const r of raw.transit || []) {
        const mi = matIdx(r.Matnr), q = num(r.Qty); if (mi === null || q <= 0) continue;
        const a = site(r.Swerks), b = site(r.Werks); if (a === null || b === null) continue;
        D.ship.push([mi, a, b, r2(q), sapDate(r.Budat), laneDays.get(`${D.sites[a].code}>${D.sites[b].code}`) || 0, str(r.Tknum) || str(r.Vbeln), str(r.Transporter), str(r.Vehicle)]);
    }
    // open orders: only MT / Ecom carry the fresh-stock rule and are planned against orders (his archive read)
    const ecom = new Set((cfg.ecomGroups || []).map((s) => str(s).toUpperCase()));
    const oo = new Map();
    for (const r of raw.openOrders || []) {
        const q = num(r.OpenQty); if (q <= 0) continue;
        const ch = chanOf(r.Vtweg, ecom, r.Kdgrp); if (ch === 'GT') continue;
        const mi = matIdx(r.Matnr), si = site(r.Werks); if (mi === null || si === null) continue;
        const k = `${mi}|${si}|${ch}`; oo.set(k, (oo.get(k) || 0) + q);
    }
    oo.forEach((v, k) => { const [mi, si, ch] = k.split('|'); D.oo.push([+mi, +si, ch, r2(v)]); });
    // sales: month to date, and the last N whole days (today excluded) for the trend
    const sale = new Map(), trend = new Map();
    const monthStart = `${today.slice(0, 7)}-01`, tf = D.meta.trendFrom;
    for (const r of raw.sales || []) {
        const d = sapDate(r.Datum), q = num(r.Qty); if (!d || q === 0 || d >= today) continue;
        const mi = matIdx(r.Matnr), si = site(r.Werks); if (mi === null || si === null) continue;
        const ch = chanOf(r.Vtweg), k = `${mi}|${si}|${ch}`;
        if (d >= monthStart) sale.set(k, (sale.get(k) || 0) + q);
        if (d >= tf) trend.set(k, (trend.get(k) || 0) + q);
    }
    const flat = (m, into) => m.forEach((v, k) => { if (v) { const [mi, si, ch] = k.split('|'); into.push([+mi, +si, ch, r2(v)]); } });
    flat(sale, D.sale); flat(trend, D.trend);
    // forecast (uploaded)
    const fc = new Map(), afc = new Map(), rpp = new Map();
    let fcMiss = 0;
    for (const r of forecast) {
        const mi = matIdx(r.material), si = site(r.plant); if (mi === null || si === null) { fcMiss++; continue; }
        const k = `${mi}|${si}|${r.channel}`;
        const a = fc.get(k) || [0, 0]; a[0] += r.m0; a[1] += r.m1; fc.set(k, a);
        if (r.additional) afc.set(k, (afc.get(k) || 0) + r.additional);
        if (r.w && r.w.some(Boolean)) { const kk = `${mi}|${si}`; const w = rpp.get(kk) || [0, 0, 0, 0]; r.w.forEach((x, i) => { w[i] += x; }); rpp.set(kk, w); }
    }
    fc.forEach((a, k) => { if (a[0] || a[1]) { const [mi, si, ch] = k.split('|'); D.fc.push([+mi, +si, ch, r2(a[0]), r2(a[1])]); } });
    afc.forEach((v, k) => { const [mi, si, ch] = k.split('|'); D.afc.push([+mi, +si, ch, r2(v)]); });
    rpp.forEach((w, k) => { const [mi, si] = k.split('|'); D.rpp.push([+mi, +si, ...w.map(r2), 0]); });
    if (fcMiss) warnings.push(`${fcMiss} forecast row(s) skipped: material not known to SAP or the config.`);
    if (!forecast.length) warnings.push('No forecast uploaded yet: the plan has no block targets, only open orders and the sales trend.');
    if (skippedMats.size) warnings.push(`${skippedMats.size} material(s) with SAP data are not on the planning Master (config) and were left out, like the console's Master sheet. Add them in Settings > config to plan them.`);
    if (unkeyed.length) warnings.push(`${unkeyed.length} material(s) have no planning key in the config and are planned on their own code (e.g. ${unkeyed.slice(0, 5).join(', ')}).`);
    if (unknownSites.size) warnings.push(`Plants not in the depot config (planned as unknown sites): ${[...unknownSites].sort().join(', ')}.`);
    D.meta.counts = { mats: D.mats.length, sites: D.sites.length, stk: D.stk.length, lots: D.lots.length, git: D.git.length, ship: D.ship.length, sto: D.sto.length, fc: D.fc.length, sale: D.sale.length, trend: D.trend.length, oo: D.oo.length };
    return D;
}

// =================================================================================================================== SAP reads
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const orEq = (field, vals) => `(${vals.map((v) => `${field} eq '${String(v).replace(/'/g, "''")}'`).join(' or ')})`;
const odate = (iso) => `datetime'${iso}T00:00:00'`;

/** Pull every source. fetchSet(setName, filter) -> raw rows. Failures of one source are reported in `health` and do not stop the others. */
async function pull({ fetchSet, cfg, today, onStep = () => {}, chunkSize = 12 }) {
    const plants = plantsOf(cfg);
    if (!plants.length) throw new PlanError('The depot config is empty. Import Sanjoy\'s dp_data.json once (Settings > Seed) before refreshing.', 409);
    const raw = {}, health = {};
    const since = addDays(today, -Math.max(cfg.trendDays || 14, 0)) < `${today.slice(0, 7)}-01` ? addDays(today, -(cfg.trendDays || 14)) : `${today.slice(0, 7)}-01`;
    const perPlant = async (name, set, build, key) => {
        const t0 = Date.now(); const rows = []; let err = '';
        for (const ps of chunk(plants, chunkSize)) {
            onStep(`${name}: ${rows.length} rows`);
            try { rows.push(...await fetchSet(set, build(ps))); } catch (e) { err = e.message; break; }
        }
        raw[key] = rows; health[name] = { set, rows: rows.length, ms: Date.now() - t0, ok: !err, error: err || undefined };
    };
    await perPlant('Stock', 'DpStockSet', (ps) => orEq('Werks', ps), 'stock');
    await perPlant('Batches', 'DpLotSet', (ps) => orEq('Werks', ps), 'lots');
    await perPlant('Pending STO', 'DpStoSet', (ps) => orEq('Werks', ps), 'sto');
    await perPlant('Open orders', 'DpOpenOrderSet', (ps) => `${orEq('Werks', ps)} and (Vtweg eq '30' or Vtweg eq '55' or Vtweg eq '57' or Vtweg eq '96')`, 'openOrders');
    await perPlant('Sales', 'DpSaleSet', (ps) => `${orEq('Werks', ps)} and Datum ge ${odate(since)}`, 'sales');
    await perPlant('Transit', 'DpTransitSet', (ps) => orEq('Werks', ps), 'transit');
    // material master only for materials we hold data for and the config does not know
    const seen = new Set();
    ['stock', 'lots', 'sto', 'openOrders', 'sales', 'transit'].forEach((k) => (raw[k] || []).forEach((r) => seen.add(matCode(r.Matnr))));
    const t0 = Date.now(); const mats = []; let err = '';
    const need = cfg.includeUnknown ? [...seen].filter((m) => m && !(cfg.matKeys || {})[m]) : [];
    for (const ms of chunk(need, 40)) { onStep(`Material master: ${mats.length}/${need.length}`); try { mats.push(...await fetchSet('DpMaterialSet', orEq('Matnr', ms))); } catch (e) { err = e.message; break; } }
    raw.materials = mats; health['Material master'] = { set: 'DpMaterialSet', rows: mats.length, wanted: need.length, ms: Date.now() - t0, ok: !err, error: err || undefined };
    return { raw, health };
}

// =================================================================================================================== service
function create({ pool, fetchSet, getUser, now = () => new Date() }) {
    let ready; const job = { running: false, step: '', startedAt: null, error: '', lastId: null };
    const init = () => ready || (ready = (async () => {
        await pool.query(`CREATE TABLE IF NOT EXISTS emami_apps.tms_dp_config (key text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), by_user text)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS emami_apps.tms_dp_forecast (id bigserial PRIMARY KEY, uploaded_at timestamptz NOT NULL DEFAULT now(), by_user text NOT NULL, row_count integer NOT NULL, data jsonb NOT NULL)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS emami_apps.tms_dp_snapshot (id bigserial PRIMARY KEY, built_at timestamptz NOT NULL DEFAULT now(), by_user text NOT NULL, stats jsonb NOT NULL, data bytea NOT NULL)`);
    })().catch((e) => { ready = undefined; throw e; }));
    const getConfig = async () => { await init(); const r = await pool.query(`SELECT data FROM emami_apps.tms_dp_config WHERE key = 'main'`); return r.rows[0] ? r.rows[0].data : emptyConfig(); };
    const putConfig = async (cfg, by) => { await init(); await pool.query(`INSERT INTO emami_apps.tms_dp_config(key, data, by_user) VALUES ('main', $1, $2) ON CONFLICT (key) DO UPDATE SET data = $1, by_user = $2, updated_at = now()`, [JSON.stringify(cfg), by]); };
    const latestForecast = async () => { await init(); const r = await pool.query(`SELECT id, uploaded_at, by_user, row_count, data FROM emami_apps.tms_dp_forecast ORDER BY id DESC LIMIT 1`); return r.rows[0] || null; };
    const latestSnapshot = async (withData) => { await init(); const r = await pool.query(`SELECT id, built_at, by_user, stats${withData ? ', data' : ''} FROM emami_apps.tms_dp_snapshot ORDER BY id DESC LIMIT 1`); return r.rows[0] || null; };

    const need = (u, perm) => { if (!u.roles.includes('Admin') && !(u.perms && u.perms.has(perm))) throw new PlanError('Your role does not have permission to do this.', 403); };
    const user = async (caller, perm) => { const u = await getUser(caller); need(u, perm); return u; };

    async function refresh(caller) {
        if (job.running) throw new PlanError('A refresh is already running.', 409);
        const cfg = await getConfig();
        if (!plantsOf(cfg).length) throw new PlanError('The depot config is empty. Import Sanjoy\'s dp_data.json once (Seed) before refreshing.', 409);
        job.running = true; job.step = 'starting'; job.startedAt = Date.now(); job.error = '';
        (async () => {
            try {
                const today = now().toISOString().slice(0, 10);
                const fcRow = await latestForecast();
                const { raw, health } = await pull({ fetchSet: (set, filter) => fetchSet(caller, set, filter), cfg, today, onStep: (s) => { job.step = s; } });
                job.step = 'building';
                const D = buildDataset({ cfg, raw, forecast: fcRow ? fcRow.data.rows : [], today, health, forecastMeta: fcRow ? { uploadedAt: fcRow.uploaded_at, by: fcRow.by_user, rows: fcRow.row_count } : null });
                const failed = Object.entries(health).filter(([, h]) => !h.ok).map(([k, h]) => `${k}: ${h.error}`);
                if (failed.length) D.meta.warnings.unshift(`SAP source(s) failed - the plan is incomplete: ${failed.join('; ')}`);
                const gz = zlib.gzipSync(Buffer.from(JSON.stringify(D)));
                await init();
                const ins = await pool.query(`INSERT INTO emami_apps.tms_dp_snapshot(by_user, stats, data) VALUES ($1, $2, $3) RETURNING id`, [caller.email, JSON.stringify({ counts: D.meta.counts, health, warnings: D.meta.warnings, ms: Date.now() - job.startedAt }), gz]);
                job.lastId = ins.rows[0].id;
                await pool.query(`DELETE FROM emami_apps.tms_dp_snapshot WHERE id NOT IN (SELECT id FROM emami_apps.tms_dp_snapshot ORDER BY id DESC LIMIT 7)`);
                job.step = 'done';
            } catch (e) { job.error = e.message; job.step = 'failed'; console.error('[tms-dp] refresh failed:', e.message); } finally { job.running = false; }
        })();
        return { started: true };
    }

    const api = {
        async status(caller) {
            await user(caller, 'plan.view');
            const [cfg, fc, snap] = await Promise.all([getConfig(), latestForecast(), latestSnapshot(false)]);
            return {
                job: { running: job.running, step: job.step, error: job.error, startedAt: job.startedAt },
                config: { seeded: plantsOf(cfg).length > 0, sites: (cfg.sites || []).length, lanes: (cfg.lanes || []).length, materials: Object.keys(cfg.matKeys || {}).length, seededAt: cfg.seededAt || null },
                forecast: fc ? { uploadedAt: fc.uploaded_at, by: fc.by_user, rows: fc.row_count } : null,
                snapshot: snap ? { id: String(snap.id), builtAt: snap.built_at, by: snap.by_user, ...snap.stats } : null,
                sapLive: !!fetchSet.live,
            };
        },
        async dataset(caller) { await user(caller, 'plan.view'); const s = await latestSnapshot(true); if (!s) throw new PlanError('No plan data yet. Press Refresh from SAP first.', 404); return s.data; },
        refresh: async (caller) => { await user(caller, 'plan.run'); return refresh(caller); },
        async forecast(caller, body) {
            const u = await user(caller, 'plan.run');
            const rows = cleanForecast(body && body.rows);
            await init();
            await pool.query(`INSERT INTO emami_apps.tms_dp_forecast(by_user, row_count, data) VALUES ($1, $2, $3)`, [u.email, rows.length, JSON.stringify({ rows })]);
            await pool.query(`DELETE FROM emami_apps.tms_dp_forecast WHERE id NOT IN (SELECT id FROM emami_apps.tms_dp_forecast ORDER BY id DESC LIMIT 5)`);
            return { rows: rows.length, plants: new Set(rows.map((r) => r.plant)).size, materials: new Set(rows.map((r) => r.material)).size };
        },
        async getConfig(caller) { await user(caller, 'plan.run'); const c = await getConfig(); return { ...c, matKeys: undefined, materials: Object.keys(c.matKeys || {}).length }; },
        async setConfig(caller, body) {
            const u = await user(caller, 'plan.admin');
            const cur = await getConfig();
            const next = { ...cur };
            if (body.sites) { if (!Array.isArray(body.sites)) throw new PlanError('sites must be a list.'); next.sites = body.sites.map((s) => ({ code: code(s.code), name: str(s.name), zone: str(s.zone), type: str(s.type), mwh: code(s.mwh), lat: s.lat, lon: s.lon })).filter((s) => s.code); }
            if (body.lanes) next.lanes = body.lanes; if (body.split) next.split = body.split;
            if (body.fold && typeof body.fold === 'object') next.fold = body.fold;
            if (body.ecomGroups) next.ecomGroups = body.ecomGroups.map((s) => str(s).toUpperCase());
            if (body.spartDiv) next.spartDiv = body.spartDiv;
            if (typeof body.includeUnknown === 'boolean') next.includeUnknown = body.includeUnknown;
            if (body.matKeys) { next.matKeys = { ...cur.matKeys, ...body.matKeys }; next.matOrder = [...(cur.matOrder || []), ...Object.keys(body.matKeys).filter((k) => !(cur.matKeys || {})[k])]; }
            await putConfig(next, u.email);
            return { ok: true };
        },
        async seed(caller, D) { const u = await user(caller, 'plan.admin'); const cfg = configFromDataset(D); await putConfig(cfg, u.email); return { sites: cfg.sites.length, lanes: cfg.lanes.length, split: cfg.split.length, folds: Object.keys(cfg.fold).length, materials: Object.keys(cfg.matKeys).length }; },
    };

    const handle = (fn) => async (req, res) => {
        try { const out = await fn(req, res); if (out !== undefined) res.json(out); }
        catch (e) { const st = e instanceof PlanError ? e.status : (e && e.status) || 500; if (st >= 500) console.error('[tms-dp]', e.message); res.status(st).json({ error: st >= 500 && !(e && e.status) ? 'Unexpected error.' : e.message }); }
    };
    const router = express.Router();
    router.use(express.json({ limit: '12mb' }));
    router.get('/status', handle((req) => api.status(req.caller)));
    router.get('/dataset', handle(async (req, res) => { const gz = await api.dataset(req.caller); res.set({ 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' }); res.send(gz); }));
    router.post('/refresh', handle((req) => api.refresh(req.caller)));
    router.post('/forecast', handle((req) => api.forecast(req.caller, req.body)));
    router.get('/config', handle((req) => api.getConfig(req.caller)));
    router.post('/config', handle((req) => api.setConfig(req.caller, req.body || {})));
    router.post('/seed', handle((req) => api.seed(req.caller, req.body)));

    // optional nightly refresh on ONE process: TMS_DP_NIGHTLY=HH:MM (server time) and TMS_DP_NIGHTLY_USER=<hub email whose identity SAP sees>
    let timer;
    const nightly = String(process.env.TMS_DP_NIGHTLY || '').trim(), nu = String(process.env.TMS_DP_NIGHTLY_USER || '').trim().toLowerCase();
    if (/^\d{2}:\d{2}$/.test(nightly) && nu && process.env.NODE_ENV !== 'test' && !process.env.LAMBDA_TASK_ROOT) {
        let last = '';
        timer = setInterval(() => { const d = now(); const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; const day = d.toISOString().slice(0, 10); if (hm === nightly && last !== day) { last = day; refresh({ email: nu }).catch((e) => console.error('[tms-dp] nightly', e.message)); } }, 30_000);
        if (timer.unref) timer.unref();
    }
    return { router, api, job, _timer: timer };
}

module.exports = { create, buildDataset, pull, configFromDataset, cleanForecast, plantsOf, emptyConfig, PlanError, _test: { chanOf, matCode, siteCode, orEq, sapDate } };
