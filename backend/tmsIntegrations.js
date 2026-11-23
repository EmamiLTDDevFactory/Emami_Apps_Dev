/*
   SmarTruck TMS integrations other than SAP, behind small interfaces so a provider can be swapped without touching the rules.
   Each runs SIMULATED (and says so) until its setting is present:
     TMS_CONSENT_URL / TMS_CONSENT_KEY   telecom SIM-consent gateway (Jio / Airtel / Vi aggregator): POST { phone, provider } -> { requested }
     TMS_EWAY_BASE / TMS_EWAY_KEY        GST e-way bill (GSP) API: GET <base>/<ewbNo> -> { validUpto, status }
     TMS_NOTIFY_URL / TMS_NOTIFY_KEY     e-mail/SMS provider: POST { to, channel, text }
   Provider contracts are NOT known yet (open question in the rebuild plan); adjust the request functions below.
*/
const env = (k) => String(process.env[k] ?? '').trim();
async function post(url, key, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => ({}));
}
const consent = {
    async request({ phone, provider }) {
        if (!env('TMS_CONSENT_URL')) return { requested: true, simulated: true };
        try { const r = await post(env('TMS_CONSENT_URL'), env('TMS_CONSENT_KEY'), { phone, provider }); return { requested: r.requested !== false }; } catch (e) { return { requested: false, error: e.message }; }
    },
};
const eway = {
    async status(ewbNo, shipment) {
        if (!env('TMS_EWAY_BASE')) return { simulated: true, status: ewbNo ? 'ACTIVE' : 'NOT_GENERATED', validUpto: shipment && shipment.ewayExpiry };
        const res = await fetch(`${env('TMS_EWAY_BASE').replace(/\/+$/, '')}/${encodeURIComponent(ewbNo)}`, { headers: env('TMS_EWAY_KEY') ? { Authorization: `Bearer ${env('TMS_EWAY_KEY')}` } : {} });
        if (!res.ok) throw new Error(`E-way bill service returned HTTP ${res.status}`);
        const j = await res.json();
        return { status: j.status, validUpto: j.validUpto };
    },
};
const notify = {
    async send(to, channel, text) {
        if (!env('TMS_NOTIFY_URL')) return { sent: false, simulated: true };
        try { await post(env('TMS_NOTIFY_URL'), env('TMS_NOTIFY_KEY'), { to, channel, text }); return { sent: true }; } catch (e) { return { sent: false, error: e.message }; }
    },
};
/** Invoice mail: TMS_MAIL_URL / TMS_MAIL_KEY  POST { to, subject, text, attachment: { name, mime, dataBase64 } }. Simulated (not sent, flagged) until set. */
const mail = {
    async send({ to, subject, text, attachment }) {
        if (!env('TMS_MAIL_URL')) return { sent: false, simulated: true };
        try { await post(env('TMS_MAIL_URL'), env('TMS_MAIL_KEY'), { to, subject, text, attachment }); return { sent: true }; } catch (e) { return { sent: false, error: e.message }; }
    },
};
module.exports = { consent, eway, notify, mail };
