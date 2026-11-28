/*
   Trip Trail > Plants (embedded-apps/smartruck-tms). SAP plants (ZTMS_SRV PlantSet = T001W + ADRC) merged with the coordinates the Plant Map needs.
   The frontend's public/plant-locations.json is not readable here, so the coordinates live server-side in emami_apps.tms_plant_geo (seeded once by an
   admin through POST /plants/seed-geo, corrected one by one through POST /plants/geo). Own table, NOT tms_state.

     GET  /plants           any TMS user   -> { plants:[{code,name,city,state,pincode,lat,lon,source,confidence,fromSap,hasCoordinates,...}], newInSap:[codes], simulated }
     POST /plants/seed-geo  Admin          body { plants:[{code,name,type,city,state,pincode,lat,lon,source,confidence,note}] } (or the file's whole JSON) -> { seeded, skipped, invalid }
     POST /plants/geo       Admin          body { code, lat, lon, confidence? } -> { plant }   (India bounding box lat 6-37, lon 68-98; source becomes 'manual')

   mergePlants() is PURE (tested without SAP or a database); create() adds routes + storage.
*/
const express = require('express');

class PlantError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const str = (v, max = 200) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));
const LAT = [6, 37], LON = [68, 98];
const SOURCES = new Set(['sanjoy-dp', 'pincode', 'city', 'manual']);
const CONF = new Set(['high', 'medium', 'low']);
const inIndia = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= LAT[0] && lat <= LAT[1] && lon >= LON[0] && lon <= LON[1];
const codeOk = (c) => /^[A-Z0-9]{1,6}$/.test(c);
const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** Clean one seed/edit row; returns { row } or { error }. */
function cleanGeo(r) {
    const code = str(r && r.code, 6).toUpperCase();
    if (!codeOk(code)) return { error: `Invalid plant code "${str(r && r.code, 12)}".` };
    const lat = num(r.lat), lon = num(r.lon);
    if (!inIndia(lat, lon)) return { error: `${code}: coordinates are outside India (lat ${LAT[0]}-${LAT[1]}, lon ${LON[0]}-${LON[1]}).` };
    const source = SOURCES.has(r.source) ? r.source : 'manual';
    const confidence = CONF.has(r.confidence) ? r.confidence : 'low';
    return { row: { code, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, source, confidence, name: str(r.name, 80), city: str(r.city, 60), state: str(r.state, 40), pincode: str(r.pincode, 10), type: str(r.type, 10), note: str(r.note, 120) } };
}

/** PURE. sapRows = tmsSap map.plant rows (or null when SAP is not configured), geoRows = tms_plant_geo rows -> response of GET /plants. */
function mergePlants(sapRows, geoRows) {
    const geo = new Map((geoRows || []).map((g) => [String(g.code).toUpperCase(), g]));
    const has = (g) => !!g && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lon));
    const view = (code, sap, g) => ({
        code, name: str((sap && sap.name) || (g && g.name)), city: str((sap && sap.city) || (g && g.city)), state: str((g && g.state) || (sap && sap.region)),
        pincode: str((sap && sap.pincode) || (g && g.pincode)), type: str(g && g.type), lat: has(g) ? Number(g.lat) : null, lon: has(g) ? Number(g.lon) : null,
        source: g ? g.source : '', confidence: g ? g.confidence : '', fromSap: !!sap, hasCoordinates: has(g),
        ...(sap ? { country: sap.country, region: sap.region, street: sap.street, timeZone: sap.timeZone } : {}),
    });
    if (!sapRows) return { plants: [...geo.values()].map((g) => view(String(g.code).toUpperCase(), null, g)).sort((a, b) => a.code.localeCompare(b.code)), newInSap: [], simulated: true };
    const seen = new Set(), plants = [], newInSap = [];
    for (const s of sapRows) {
        if (!s.code || seen.has(s.code)) continue;
        seen.add(s.code);
        const g = geo.get(s.code);
        plants.push(view(s.code, s, g));
        if (!has(g)) newInSap.push(s.code);
    }
    for (const [code, g] of geo) if (!seen.has(code)) plants.push(view(code, null, g)); // known to the map, no longer / not (yet) in SAP
    plants.sort((a, b) => a.code.localeCompare(b.code));
    return { plants, newInSap: newInSap.sort(), simulated: false };
}

function create({ pool, sapPlants, getUser, sapConfigured = () => true }) {
    let ready;
    const init = () => (ready ||= pool.query(`CREATE TABLE IF NOT EXISTS emami_apps.tms_plant_geo (werks text PRIMARY KEY, lat double precision NOT NULL, lon double precision NOT NULL, source text NOT NULL, confidence text NOT NULL,
        name text, city text, state text, pincode text, type text, note text, updated_by text, updated_at timestamptz NOT NULL DEFAULT now())`).catch((e) => { ready = undefined; throw e; }));
    const geoRows = async () => { await init(); return (await pool.query('SELECT werks, lat, lon, source, confidence, name, city, state, pincode, type, note FROM emami_apps.tms_plant_geo ORDER BY werks')).rows.map((r) => ({ ...r, code: r.werks })); };
    const admin = async (caller) => { const u = await getUser(caller); if (!(u.roles || []).includes('Admin')) throw new PlantError('Only a Trip Trail administrator can do this.', 403); return u; };
    const api = {
        async list(caller) {
            await getUser(caller);
            const geo = await geoRows();
            const sap = sapConfigured() ? await sapPlants(caller, {}) : null;
            return mergePlants(sap && !sap.simulated ? sap.rows : null, geo);
        },
        /** One-time load of the geocoded file. Never overwrites a coordinate an admin corrected by hand (source 'manual'). */
        async seedGeo(caller, body) {
            const u = await admin(caller);
            const list = Array.isArray(body) ? body : body && Array.isArray(body.plants) ? body.plants : null;
            if (!list || !list.length) throw new PlantError('Send { plants: [...] } (the content of public/plant-locations.json).');
            if (list.length > 2000) throw new PlantError('At most 2000 plants per request.');
            await init();
            let seeded = 0, skipped = 0; const invalid = [];
            for (const r of list) {
                const c = cleanGeo(r);
                if (c.error) { invalid.push(c.error); continue; }
                const x = c.row;
                const res = await pool.query(`INSERT INTO emami_apps.tms_plant_geo (werks, lat, lon, source, confidence, name, city, state, pincode, type, note, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                    ON CONFLICT (werks) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, source = EXCLUDED.source, confidence = EXCLUDED.confidence, name = EXCLUDED.name, city = EXCLUDED.city, state = EXCLUDED.state,
                    pincode = EXCLUDED.pincode, type = EXCLUDED.type, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now() WHERE emami_apps.tms_plant_geo.source <> 'manual'`,
                    [x.code, x.lat, x.lon, x.source, x.confidence, x.name, x.city, x.state, x.pincode, x.type, x.note, u.email]);
                if (res.rowCount === 0) skipped++; else seeded++;
            }
            return { seeded, skipped, invalid: invalid.slice(0, 50), invalidCount: invalid.length };
        },
        /** Save one corrected coordinate (admin drag edit). The plant must be known: in the geo table or in SAP. */
        async saveGeo(caller, body) {
            const u = await admin(caller);
            const c = cleanGeo({ ...(body || {}), source: 'manual', confidence: CONF.has(body && body.confidence) ? body.confidence : 'high' });
            if (c.error) throw new PlantError(c.error);
            const x = c.row;
            await init();
            const cur = (await pool.query('SELECT werks FROM emami_apps.tms_plant_geo WHERE werks = $1', [x.code])).rows[0];
            let sap = null;
            if (!cur) {
                const r = sapConfigured() ? await sapPlants(caller, { codes: [x.code] }) : null;
                sap = r && !r.simulated ? r.rows.find((p) => p.code === x.code) : null;
                if (!sap) throw new PlantError(`Plant ${x.code} is not known (not in SAP and not on the map).`, 404);
            }
            await pool.query(`INSERT INTO emami_apps.tms_plant_geo (werks, lat, lon, source, confidence, name, city, state, pincode, type, note, updated_by) VALUES ($1,$2,$3,'manual',$4,$5,$6,$7,$8,'','Set by an administrator',$9)
                ON CONFLICT (werks) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, source = 'manual', confidence = EXCLUDED.confidence, note = 'Set by an administrator', updated_by = EXCLUDED.updated_by, updated_at = now()`,
                [x.code, x.lat, x.lon, x.confidence, sap ? sap.name : '', sap ? sap.city : '', '', sap ? sap.pincode : '', u.email]);
            const row = (await geoRows()).find((g) => g.code === x.code);
            return { plant: mergePlants(null, [row]).plants[0] };
        },
    };
    const router = express.Router();
    const handle = (fn) => async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json(await fn(req)); }
        catch (e) {
            const status = e instanceof PlantError || (e && Number.isInteger(e.status)) ? e.status : 500;
            if (status === 500) console.error('[tms] plants', e.message);
            res.status(status).json({ error: status === 500 ? 'Unexpected error.' : e.message });
        }
    };
    router.get('/', handle((req) => api.list(req.caller)));
    router.post('/seed-geo', handle((req) => api.seedGeo(req.caller, req.body)));
    router.post('/geo', handle((req) => api.saveGeo(req.caller, req.body)));
    return { router, api };
}

module.exports = { create, mergePlants, cleanGeo, PlantError, inIndia };
