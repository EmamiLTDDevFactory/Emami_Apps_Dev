'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { env } = require('../constants');

/*
   Attachment storage for Samadhan (v7 Phase 2, master prompt §L; decision Q-S1 = SAP application server).

   One small interface, two adapters:
     sap    - the production adapter: SAP OData service ZSAMADHAN_ATT_SRV (contract: docs/v7/SAP-ATTACHMENT-SERVICE.md)
              through the Azure SAP gateway, the same way backend/auditeeResponseSap.js talks to SAP: JSON with the file
              as base64, CSRF token fetched and cached, delete as a POST with Action 'D' (the gateway does not pass
              DELETE or /$value). SAP writes the bytes to an application-server directory (AL11) and returns a FileId.
     local  - tests and local development only: files in a folder on this machine (SAMADHAN_STORAGE_DIR).
   SAMADHAN_STORAGE = sap | local. Not set = attachments are switched off (the UI hides them and the API says so).
   Nothing is ever stored in Postgres except the metadata row (ticket_attachments).

     put(key, buffer, { fileName, contentType, ticketId }) -> { ref }    ref = what get / del need later
     get(ref) -> Buffer
     del(ref) -> void
*/

const MODE = String(env('STORAGE') || '').trim().toLowerCase();

// ---------- local (tests / development) ----------
function localAdapter() {
    const root = path.resolve(env('STORAGE_DIR') || path.join(require('os').tmpdir(), 'samadhan-files'));
    const full = (ref) => {
        const p = path.resolve(root, ref);
        if (!p.startsWith(root + path.sep)) throw new Error('bad storage reference');
        return p;
    };
    return {
        name: 'local',
        async put(key, buffer) {
            const p = full(key);
            await fs.promises.mkdir(path.dirname(p), { recursive: true });
            await fs.promises.writeFile(p, buffer, { flag: 'wx' });
            return { ref: key };
        },
        get: (ref) => fs.promises.readFile(full(ref)),
        async del(ref) { await fs.promises.rm(full(ref), { force: true }); },
    };
}

// ---------- sap (production) ----------
function sapAdapter() {
    const base = String(env('SAP_ODATA_BASE') || '').replace(/\/+$/, '');
    const client = env('SAP_CLIENT');
    const auth = String(env('SAP_AUTH') || 'gateway').toLowerCase();
    const user = env('SAP_USER');
    const password = env('SAP_PASSWORD');
    const userHeader = env('SAP_USER_HEADER') || 'X-Emami-User';
    const timeoutMs = Number(env('SAP_TIMEOUT_MS') || 60000);
    if (!base) throw new Error('SAMADHAN_SAP_ODATA_BASE is not set');
    const service = `${base}/ZSAMADHAN_ATT_SRV`;
    const withClient = (u) => (client ? `${u}${u.includes('?') ? '&' : '?'}sap-client=${encodeURIComponent(client)}` : u);
    const authHeaders = () => (auth === 'basic' && user ? { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` } : {});
    let csrf = null; // { token, cookie, at }

    async function fetchCsrf() {
        const r = await fetch(withClient(`${service}/`), { headers: { ...authHeaders(), 'x-csrf-token': 'Fetch', Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
        const token = r.headers.get('x-csrf-token');
        if (!token) throw new Error(`SAP did not return a CSRF token (HTTP ${r.status})`);
        const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
        csrf = { token, cookie, at: Date.now() };
        return csrf;
    }
    async function call(method, url, body, actor, retry = true) {
        if (method !== 'GET' && (!csrf || Date.now() - csrf.at > 15 * 60_000)) await fetchCsrf();
        const r = await fetch(withClient(url), {
            method,
            headers: {
                ...authHeaders(), Accept: 'application/json', 'Content-Type': 'application/json',
                ...(actor ? { [userHeader]: actor } : {}),
                ...(method !== 'GET' && csrf ? { 'x-csrf-token': csrf.token, ...(csrf.cookie ? { Cookie: csrf.cookie } : {}) } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (r.status === 403 && retry && /required/i.test(r.headers.get('x-csrf-token') || '')) { csrf = null; return call(method, url, body, actor, false); }
        const text = await r.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
        if (!r.ok) {
            const msg = data?.error?.message?.value || data?.error?.message || `HTTP ${r.status}`;
            const err = new Error(`SAP attachment service: ${msg}`);
            err.status = r.status >= 500 ? 502 : r.status;
            throw err;
        }
        return data?.d ?? data;
    }
    const key = (ref) => `${service}/AttachmentSet('${encodeURIComponent(String(ref).replace(/'/g, "''"))}')`;
    return {
        name: 'sap',
        async put(storageKey, buffer, meta = {}) {
            const d = await call('POST', `${service}/AttachmentSet`, {
                StorageKey: storageKey.slice(0, 255),
                TicketId: String(meta.ticketId ?? ''),
                FileName: String(meta.fileName || 'file').slice(0, 255),
                MimeType: String(meta.contentType || 'application/octet-stream').slice(0, 128),
                FileSize: String(buffer.length),
                Sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
                Value: buffer.toString('base64'),
            }, meta.actor);
            if (!d?.FileId) throw new Error('SAP attachment service did not return a FileId');
            return { ref: d.FileId };
        },
        async get(ref) {
            const d = await call('GET', `${key(ref)}?$format=json`);
            if (!d?.Value) throw Object.assign(new Error('The file is not on the SAP server any more.'), { status: 404 });
            return Buffer.from(d.Value, 'base64');
        },
        async del(ref, actor) {
            await call('POST', `${service}/AttachmentSet`, { FileId: String(ref), Action: 'D' }, actor);
        },
    };
}

let adapter = null;
let reason = '';
try {
    if (MODE === 'sap') adapter = sapAdapter();
    else if (MODE === 'local') adapter = localAdapter();
    else reason = 'Attachments are not switched on for this server (SAMADHAN_STORAGE is not set).';
} catch (err) {
    reason = `Attachments are not available: ${err.message}`;
    console.error('[samadhan] storage:', err.message);
}

const storage = () => adapter;
const storageInfo = () => ({ enabled: Boolean(adapter), adapter: adapter?.name ?? null, reason: adapter ? null : reason });
/** Object key: samadhan/attachments/<yyyy>/<mm>/<ticketId>/<uuid> (§L). */
const objectKey = (ticketId, now = new Date()) =>
    `samadhan/attachments/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${Number(ticketId)}/${crypto.randomUUID()}`;

module.exports = { objectKey, storage, storageInfo };
