/*
   SAP client for Order to Cash. Server only: the browser never calls SAP and never sees the credentials.
   Used by orderToCash.js.

   SAP side (EDS, TR EDSK9B0EPL, package ZEMAMI): RFC function module Z_SD_O2C_ACTION (group ZSD_O2C)
     IMPORTING iv_action CHAR30, iv_payload STRING (JSON), iv_requestid CHAR40  EXPORTING ev_result STRING (JSON)
   which calls ZCL_SD_O2C=>HANDLE. It is reached over SAP's standard SOAP-RFC service /sap/bc/soap/rfc, so no Gateway
   service has to be registered. ABAP: embedded-apps/order-to-cash/abap/.

   Env (server .env, never committed):
     O2C_SAP_BASE         https://<host>:<port>        e.g. https://10.17.10.13:4440 (EDS)
     O2C_SAP_CLIENT       sap-client                   e.g. 900
     O2C_SAP_USER / O2C_SAP_PASSWORD                   RFC user (needs S_RFC for group ZSD_O2C and the SD / FI read and
                                                       sales order / delivery authorisations)
     O2C_SAP_SYSTEM       shown in the app (EDS / EQS / EPR); else what PING answers
     O2C_SAP_TLS_VERIFY   "false" to accept the SAP server's self-signed certificate (EDS); default true
     O2C_SAP_TIMEOUT_MS   default 90000
     O2C_SAP_FUNCTION     default Z_SD_O2C_ACTION

   sapAction({ Requestid, Action, Payload }) -> the parsed JSON answer; a JSON { ERROR } from ABAP, a SOAP fault, an
   HTTP error or a timeout becomes SapError.
*/
const https = require('https');
const http = require('http');

const env = (k, d = '') => (process.env[k] || d).trim();
const config = () => ({
    base: env('O2C_SAP_BASE').replace(/\/+$/, ''),
    client: env('O2C_SAP_CLIENT'),
    user: env('O2C_SAP_USER'),
    password: process.env.O2C_SAP_PASSWORD || '',
    fn: env('O2C_SAP_FUNCTION', 'Z_SD_O2C_ACTION').toUpperCase(),
    verify: env('O2C_SAP_TLS_VERIFY', 'true').toLowerCase() !== 'false',
    timeout: Number(env('O2C_SAP_TIMEOUT_MS', '90000')) || 90000,
});

class SapError extends Error {
    constructor(message, status = 502) { super(message); this.status = status; }
}

const isConfigured = () => !!config().base && !!config().user;
const sapSystem = () => env('O2C_SAP_SYSTEM').toUpperCase();

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmlUnescape = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

function buildEnvelope(fn, action, payload, requestId) {
    return '<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:sap-com:document:sap:rfc:functions">'
        + `<soapenv:Body><urn:${fn}><IV_ACTION>${xmlEscape(action)}</IV_ACTION><IV_PAYLOAD>${xmlEscape(payload)}</IV_PAYLOAD>`
        + `<IV_REQUESTID>${xmlEscape(String(requestId || '').slice(0, 40))}</IV_REQUESTID></urn:${fn}></soapenv:Body></soapenv:Envelope>`;
}

/** EV_RESULT of the SOAP answer, parsed; SOAP faults and ABAP { ERROR } become SapError. */
function parseEnvelope(status, body) {
    const fault = /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i.exec(body);
    if (fault) throw new SapError(`SAP: ${xmlUnescape(fault[1]).trim()}`);
    if (status === 401) throw new SapError('SAP refused the Order to Cash RFC user (401). Check O2C_SAP_USER / O2C_SAP_PASSWORD.');
    if (status >= 400) throw new SapError(`SAP answered HTTP ${status}.`);
    const m = /<EV_RESULT>([\s\S]*?)<\/EV_RESULT>/.exec(body);
    if (!m) {
        if (/<EV_RESULT\s*\/>/.test(body)) return {};
        throw new SapError('SAP returned no result.');
    }
    let out;
    try { out = JSON.parse(xmlUnescape(m[1])); } catch { throw new SapError('SAP returned a result that is not valid JSON.'); }
    if (out && typeof out === 'object' && !Array.isArray(out) && typeof out.ERROR === 'string' && out.ERROR) throw new SapError(`SAP: ${out.ERROR}`);
    return out;
}

function post(url, headers, body, { verify, timeout }) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const lib = u.protocol === 'http:' ? http : https;
        const req = lib.request(u, { method: 'POST', headers, rejectUnauthorized: verify, timeout }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('timeout', () => req.destroy(new Error(`timeout after ${timeout} ms`)));
        req.on('error', reject);
        req.end(body);
    });
}

/** One action: { Requestid, Action, Payload (JSON string) } -> parsed JSON answer. */
async function sapAction({ Requestid, Action, Payload }) {
    const c = config();
    if (!isConfigured()) throw new SapError('The SAP connection for Order to Cash is not configured on the server (O2C_SAP_BASE / O2C_SAP_USER).', 503);
    const url = `${c.base}/sap/bc/soap/rfc${c.client ? `?sap-client=${encodeURIComponent(c.client)}` : ''}`;
    const body = Buffer.from(buildEnvelope(c.fn, Action, Payload || '{}', Requestid), 'utf8');
    let res;
    try {
        res = await post(url, {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: `urn:sap-com:document:sap:rfc:functions:${c.fn}`,
            Authorization: `Basic ${Buffer.from(`${c.user}:${c.password}`).toString('base64')}`,
            'Content-Length': body.length,
        }, body, c);
    } catch (e) {
        throw new SapError(`SAP is not reachable: ${e.message}`);
    }
    return parseEnvelope(res.status, res.body);
}

module.exports = { sapAction, isConfigured, sapSystem, SapError, buildEnvelope, parseEnvelope, xmlUnescape };
