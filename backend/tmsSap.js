/*
   SAP side of SmarTruck TMS (embedded-apps/smartruck-tms): OData V2 client of ZTMS_SRV and the ONE mapping module between that
   service and the app's JSON (section MAPPING). Server only; the browser never calls SAP. Same transport rules as mmMdmSap.js /
   auditeeResponseSap.js: the Azure SAP gateway signs in as its technical user, the verified hub user's e-mail travels in X-Emami-User.
   Contract and ABAP: embedded-apps/smartruck-tms/docs/ZTMS_SAP_BACKEND.md and docs/sap-eds/. NOT yet created on any SAP system.

   Settings (backend .env):
     TMS_SAP_ODATA_BASE   https://<azure gateway>/api/<SID>/ZTMS_SRV  - when empty the client runs SIMULATED (deterministic fake
                          documents, flagged simulated:true) so the whole app works before SAP exists.
     TMS_SAP_CLIENT       sap-client                                   (optional)
     TMS_SAP_AUTH         gateway (default) | basic    TMS_SAP_USER / TMS_SAP_PASSWORD (basic, development only)
     TMS_SAP_USER_HEADER  default X-Emami-User
*/
const env = (k, d = '') => String(process.env[k] ?? d).trim();

class SapError extends Error { constructor(message, status = 502) { super(message); this.status = status; } }

const config = () => ({ base: env('TMS_SAP_ODATA_BASE').replace(/\/+$/, ''), client: env('TMS_SAP_CLIENT'), mode: env('TMS_SAP_AUTH', 'gateway').toLowerCase(), user: env('TMS_SAP_USER'), password: env('TMS_SAP_PASSWORD'), userHeader: env('TMS_SAP_USER_HEADER', 'X-Emami-User') || 'X-Emami-User' });
const isConfigured = () => !!config().base;

const enc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const isX = (v) => v === true || v === 'X' || v === 'x';
const sapDate = (v) => { const m = /\/Date\((-?\d+)/.exec(str(v)); if (m) return new Date(Number(m[1])).toISOString().slice(0, 10); const s = str(v); return /^\d{8}$/.test(s) && s !== '00000000' ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''; };
const toSapDate = (iso) => `/Date(${Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)})/`;

function url(path, caller) {
    const { base, client } = config();
    if (!base) throw new SapError('The SAP connection for Trip Trail is not configured (TMS_SAP_ODATA_BASE).', 503);
    let u = `${base}/${path}`;
    const add = (k, v) => { u += `${u.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(v)}`; };
    if (client) add('sap-client', client);
    if (caller && caller.email) add('emamiuser', caller.email);
    return u;
}
function headersFor(caller, extra = {}) {
    const c = config();
    const h = { Accept: 'application/json', ...(c.client ? { 'sap-client': c.client } : {}), ...(caller && caller.email ? { [c.userHeader]: caller.email } : {}), ...extra };
    if (c.mode === 'basic' && c.user) h.Authorization = `Basic ${Buffer.from(`${c.user}:${c.password}`).toString('base64')}`;
    return h;
}
const sessions = new Map();
async function csrf(caller, force = false) {
    const key = (caller && caller.email) || '-';
    const cur = sessions.get(key);
    if (!force && cur && Date.now() - cur.at < 15 * 60000) return cur;
    let res;
    try { res = await fetch(url('', caller), { headers: headersFor(caller, { 'x-csrf-token': 'Fetch' }), cache: 'no-store' }); } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    await res.arrayBuffer().catch(() => null);
    const s = { token: res.headers.get('x-csrf-token') || '', cookies: (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []).map((x) => x.split(';')[0]).join('; '), at: Date.now() };
    sessions.set(key, s); return s;
}
function mapError(body, status) {
    const e = body && body.error;
    const given = (e && e.message && (typeof e.message === 'string' ? e.message : e.message.value)) || '';
    const message = given || `SAP returned HTTP ${status} without a message.`;
    const code = /already (posted|exists)|duplicate/i.test(message) ? 409 : /blocked|not authori[sz]ed/i.test(message) ? 403 : /not found/i.test(message) ? 404 : status >= 500 ? 502 : status === 401 || status === 403 ? status : 400;
    return { status: code, message };
}
async function request(caller, method, path, body, retry = true) {
    const write = method !== 'GET';
    const s = write ? await csrf(caller) : undefined;
    const headers = headersFor(caller, { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(s && s.token ? { 'x-csrf-token': s.token } : {}), ...(s && s.cookies ? { Cookie: s.cookies } : {}) });
    let res;
    try { res = await fetch(url(path, caller), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' }); } catch (e) { throw new SapError(`SAP is not reachable: ${e.message}`); }
    if (res.status === 403 && write && retry && (res.headers.get('x-csrf-token') || '').toLowerCase() === 'required') { await res.arrayBuffer().catch(() => null); await csrf(caller, true); return request(caller, method, path, body, false); }
    const text = await res.text();
    let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!res.ok) { const m = mapError(json, res.status); throw new SapError(m.message, m.status); }
    return json;
}
const results = (j) => (j && j.d && (j.d.results || (Array.isArray(j.d) ? j.d : null))) || [];

// ===================================================================================================================== MAPPING
// Everything below knows the SAP names. Adjust here (and only here) when the contract changes.
const SET = { vendor: 'VendorSet', customer: 'CustomerSet', poso: 'PoSoCheckSet', invoice: 'FreightInvoiceSet', payment: 'PaymentStatusSet', outDelivery: 'OutDeliverySet', outShipment: 'OutShipmentSet', lane: 'LaneSet' };

const map = {
    vendor: (r) => ({ code: str(r.Lifnr), name: str(r.Name1), paymentTerms: str(r.Zterm) ? `Net ${parseInt(str(r.Zterm).replace(/\D/g, ''), 10) || 30}` : '', blocked: isX(r.Sperr) || isX(r.Loevm) }),
    customer: (r) => ({ code: str(r.Kunnr), name: str(r.Name1), zone: str(r.Zone) }),
    /** The app's invoice -> FreightInvoiceSet. ExtRef is the idempotency key: SAP returns the existing document for a repeat. */
    invoiceBody: (i) => ({ ExtRef: str(i.extRef), Lifnr: str(i.vendor), Amount: Number(i.amount).toFixed(2), Waers: 'INR', InvDate: toSapDate(i.invoiceDate), Werks: str(i.unit), Sin: str(i.sin), Miro: str(i.miro) }),
    invoiceResult: (r) => ({ docNo: str(r.BelnrFi || r.Belnr), fiscalYear: str(r.Gjahr), companyCode: str(r.Bukrs) }),
    /** Outbound delivery with carton data and e-invoice / e-way bill status (read only). */
    outDelivery: (r) => ({ no: str(r.Vbeln), plant: str(r.Werks), shipTo: str(r.ShipToName) || str(r.Kunnr), cartons: Number(r.Cartons) || 0, weightKg: Number(r.GrossWeightKg) || 0, volumeM3: Number(r.VolumeM3) || 0, pgi: isX(r.Pgi), irn: str(r.Irn), ewbNo: str(r.EwbNo), ewbValid: sapDate(r.EwbValid) }),
    outShipment: (r) => ({ no: str(r.Tknum), type: str(r.Shtyp), serviceAgent: str(r.Tdlnr), deliveries: str(r.Vbelns).split(',').map((x) => x.trim()).filter(Boolean), cost: { net: Number(r.CostNet) || 0, tax: Number(r.CostTax) || 0, currency: str(r.Waers) || 'INR', status: str(r.CostStatus) } }),
    // ZB00 freight condition record (CDS ZI_TMS_LANERATE): lane = SAP route, mode = shipping type (Vsart) + ADD01 (vehicle type or rate method).
    lane: (r) => ({ fromLoc: str(r.FromLoc), toLoc: str(r.ToLoc), vendor: str(r.Lifnr), vendorName: str(r.VendorName), rate: Number(r.Rate) || 0, distanceKm: Number(r.Distance) || 0, transitH: Number(r.TransitH) || 0, priority: Number(r.Priority) || 0,
        route: str(r.Route), routeText: str(r.RouteText), sapVehicle: str(r.VehicleType), vehicleText: str(r.VehicleText), rateBasis: str(r.RateBasis), shippingType: str(r.Vsart), shippingText: str(r.VsartText),
        sdabw: str(r.Sdabw), shtyp: str(r.Shtyp), zdays: str(r.ZDays), currency: str(r.Waers) || 'INR', perQty: Number(r.PerQty) || 1, perUnit: str(r.PerUnit), condTable: str(r.CondTable), condRecord: str(r.Knumh), validTo: sapDate(r.ValidTo) }),
    payment: (r) => ({ doc: str(r.Belnr), cleared: isX(r.Cleared) || !!str(r.Augbl), clearingDoc: str(r.Augbl), clearedOn: sapDate(r.Augdt) }),
};

// ===================================================================================================================== SIMULATED
const sim = {
    vendors: [['100200', 'Elite Roadways Pvt. Ltd.'], ['100207', 'Gati Freight Carriers'], ['100214', 'Shree Maruti Courier']],
    docNo: (extRef) => `19${String([...String(extRef)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)).padStart(8, '0').slice(-8)}`,
};

// ===================================================================================================================== service (what tmsEngine calls as deps.sap)
const service = {
    simulated: () => !isConfigured(),
    async vendors(caller) {
        if (!isConfigured()) return sim.vendors.map(([code, name]) => ({ code, name, paymentTerms: 'Net 30', blocked: false }));
        return results(await request(caller, 'GET', `${SET.vendor}?$filter=${encodeURIComponent("Transporter eq 'X'")}`)).map(map.vendor).filter((v) => v.code);
    },
    async customers(caller) {
        if (!isConfigured()) return [{ code: 'R40010', name: 'Reliance Retail', zone: 'West' }];
        return results(await request(caller, 'GET', SET.customer)).map(map.customer).filter((k) => k.code);
    },
    async checkPoSo(q, caller) {
        if (!isConfigured()) return { valid: true, simulated: true, message: 'SAP not connected - PO/SO not verified.' };
        const f = [q.po && `Po eq ${enc(q.po)}`, q.so && `So eq ${enc(q.so)}`].filter(Boolean).join(' and ');
        if (!f) return { valid: true, message: '' };
        const r = results(await request(caller, 'GET', `${SET.poso}?$filter=${encodeURIComponent(f)}`))[0];
        return { valid: !r || isX(r.Valid), message: str(r && r.Message) };
    },
    /** Idempotent by extRef on the SAP side too; here a repeat call returns whatever SAP returns for it. */
    async postFreightInvoice(inv, caller) {
        if (!isConfigured()) return { docNo: sim.docNo(inv.extRef), simulated: true };
        const r = map.invoiceResult(((await request(caller, 'POST', SET.invoice, map.invoiceBody(inv))) || {}).d || {});
        if (!r.docNo) throw new SapError('SAP accepted the invoice but returned no document number.');
        return r;
    },
    /** Outbound deliveries by number -> { simulated, rows[] }. Simulated (no rows) until SAP is connected: the caller then asks the depot for the figures by hand. */
    async deliveries(nos, caller) {
        if (!isConfigured()) return { simulated: true, rows: [] };
        const rows = [];
        for (let i = 0; i < nos.length; i += 20) {
            const f = nos.slice(i, i + 20).map((n) => `Vbeln eq ${enc(n)}`).join(' or ');
            rows.push(...results(await request(caller, 'GET', `${SET.outDelivery}?$filter=${encodeURIComponent(f)}`)).map(map.outDelivery));
        }
        return { simulated: false, rows };
    },
    /** ECC shipment (header, linked deliveries, cost) -> object, or { simulated: true }. */
    async shipment(no, caller) {
        if (!isConfigured()) return { simulated: true };
        const r = results(await request(caller, 'GET', `${SET.outShipment}?$filter=${encodeURIComponent(`Tknum eq ${enc(no)}`)}`))[0];
        if (!r) throw new SapError(`Shipment ${no} was not found in SAP.`, 404);
        return map.outShipment(r);
    },
    /** Lane freight master -> rows[] (or { simulated: true }). */
    async lanes(caller) {
        if (!isConfigured()) return { simulated: true };
        return results(await request(caller, 'GET', SET.lane)).map(map.lane);
    },
    /** docs[] -> { [doc]: { cleared, clearingDoc } } */
    async paymentStatus(docs, caller) {
        if (!isConfigured()) return {};
        const out = {};
        for (let i = 0; i < docs.length; i += 20) {
            const f = docs.slice(i, i + 20).map((d) => `Belnr eq ${enc(d)}`).join(' or ');
            for (const r of results(await request(caller, 'GET', `${SET.payment}?$filter=${encodeURIComponent(f)}`)).map(map.payment)) out[r.doc] = r;
        }
        return out;
    },
};

module.exports = { ...service, service, map, SapError, isConfigured, mapError, _test: { url, headersFor, enc, sim } };
