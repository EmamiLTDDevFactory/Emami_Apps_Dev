/*
   SmarTruck TMS - ULIP (Unified Logistics Interface Platform) adapter. The rules call only this interface:
     validateVehicle(vehicleNo, { phone }) -> { ok, issues[], details, simulated }     RC / fitness / insurance / permit (VAHAN)
     track(vehicleNo, { from, to, departedAt, transitH, now }) -> [{ lat, lon, at, place, speed }]   toll / position events (FASTag)
     simulated() -> true until ULIP credentials are set.
   SIMULATED by default: validation passes (flagged simulated, shown to users), and tracking returns NOTHING - so no invented positions reach a live
   trip; the depot or vendor enters manual checkpoints instead. TMS_ULIP_MOCK=1 (dev/test only) makes track() emit toll-like events along the route.

   Settings: TMS_ULIP_BASE (e.g. https://www.ulipstaging.dpiit.gov.in/ulip/v1.0.0), TMS_ULIP_USER, TMS_ULIP_PASSWORD,
             TMS_ULIP_VAHAN_PATH (default /VAHAN/01), TMS_ULIP_TRACK_PATH (default /FASTAG/01), TMS_ULIP_LOGIN_PATH (default /user/login).
   UNVERIFIED: ULIP approval is not granted yet, so the paths and response field names below are assumptions from the public catalogue. They are
   read defensively (any key containing 'insurance'/'fit'/'permit' + 'upto'); confirm against the granted API list before go-live.
*/
const env = (k, d = '') => String(process.env[k] ?? d).trim();
const base = () => env('TMS_ULIP_BASE').replace(/\/+$/, '');
const simulated = () => !base() || !env('TMS_ULIP_USER');

let tok = { v: '', at: 0 };
async function token() {
    if (tok.v && Date.now() - tok.at < 20 * 60000) return tok.v;
    const r = await fetch(`${base()}${env('TMS_ULIP_LOGIN_PATH', '/user/login')}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ username: env('TMS_ULIP_USER'), password: env('TMS_ULIP_PASSWORD') }) });
    if (!r.ok) throw new Error(`ULIP login failed (HTTP ${r.status})`);
    const j = await r.json();
    tok = { v: String((j.response && j.response.id) || j.token || j.id || ''), at: Date.now() };
    if (!tok.v) throw new Error('ULIP login returned no token');
    return tok.v;
}
async function call(path, body) {
    const t = await token();
    const r = await fetch(`${base()}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`ULIP returned HTTP ${r.status}`);
    return r.json();
}
const flat = (o, out = {}) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === 'object') flat(v, out); else out[k.toLowerCase()] = v; } return out; };
const parseDate = (v) => { const s = String(v || ''); const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s); return Date.parse(m ? `${m[3]}-${m[2]}-${m[1]}` : s); };

async function validateVehicle(vehicleNo) {
    if (simulated()) {
        // Deterministic mock so the failure paths can be exercised: a registration ending 0000 has an expired insurance.
        const bad = /0000$/.test(vehicleNo);
        return { ok: !bad, issues: bad ? ['insurance expired (simulated)'] : [], details: { source: 'simulated' }, simulated: true };
    }
    const f = flat(await call(env('TMS_ULIP_VAHAN_PATH', '/VAHAN/01'), { vehiclenumber: vehicleNo }));
    const issues = [], now = Date.now();
    const check = (label, re) => { const key = Object.keys(f).find((k) => re.test(k) && /upto|valid|expiry|till/.test(k)); if (!key) { issues.push(`${label} validity not returned`); return null; } const t = parseDate(f[key]); if (!(t > now)) issues.push(`${label} expired or invalid`); return f[key]; };
    const details = { rc: check('registration', /regn|rc_/), fitness: check('fitness', /fit/), insurance: check('insurance', /insur/), permit: check('permit', /permit|np_/) };
    return { ok: issues.length === 0, issues, details, simulated: false };
}

async function track(vehicleNo, ctx) {
    if (simulated()) {
        if (env('TMS_ULIP_MOCK') !== '1') return [];
        const { from, to, departedAt, transitH, now } = ctx, t0 = Date.parse(departedAt), out = [];
        for (let i = 1; i <= 8; i++) { const f = i / 9, at = t0 + f * transitH * 3600_000; if (at > now) break; out.push({ lat: from.lat + (to.lat - from.lat) * f, lon: from.lon + (to.lon - from.lon) * f, at: new Date(at).toISOString(), place: `Toll plaza ${i}`, speed: 55 }); }
        return out;
    }
    const j = await call(env('TMS_ULIP_TRACK_PATH', '/FASTAG/01'), { vehiclenumber: vehicleNo });
    const list = (j.response && (j.response.fastagList || j.response.list)) || j.response || [];
    return (Array.isArray(list) ? list : []).map((r) => { const f = flat(r); return { lat: Number(f.latitude ?? f.lat), lon: Number(f.longitude ?? f.lon ?? f.lng), at: new Date(parseDate(f.readertime ?? f.timestamp ?? f.time) || NaN).toISOString(), place: String(f.tollplazaname ?? f.plaza ?? ''), speed: 0 }; }).filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon) && e.at !== 'Invalid Date');
}
module.exports = { validateVehicle, track, simulated };
