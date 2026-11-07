'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { env } = require('../constants');

/*
   Attachment storage for Samadhan (v7 Phase 2, master prompt §L; decision Q-S1 = an SFTP server, host-to-host).

   One small interface, two adapters:
     sftp   - production: files on an SFTP server reached host-to-host from the backend server. The client library
              (ssh2-sftp-client) is Samadhan's own dependency (backend/samadhan/package.json), not the shared backend's.
              The server's host key is pinned (SAMADHAN_SFTP_HOST_FINGERPRINT) so files only ever go to that server.
     local  - tests and local development only: files in a folder on this machine (SAMADHAN_STORAGE_DIR).
   SAMADHAN_STORAGE = sftp | local. Not set = attachments are switched off (the UI hides them and the API says so).
   Nothing is ever stored in Postgres except the metadata row (ticket_attachments).

     put(key, buffer, meta) -> { ref }    ref = the path below the base folder (what get / del need later)
     get(ref) -> Buffer
     del(ref) -> void

   SFTP settings (server .env / PM2 env; credentials never in the repository):
     SAMADHAN_SFTP_HOST, SAMADHAN_SFTP_PORT (22), SAMADHAN_SFTP_USER,
     SAMADHAN_SFTP_PASSWORD  or  SAMADHAN_SFTP_PRIVATE_KEY_PATH (+ SAMADHAN_SFTP_PASSPHRASE),
     SAMADHAN_SFTP_BASE_DIR (folder for Samadhan's files, e.g. /samadhan),
     SAMADHAN_SFTP_HOST_FINGERPRINT (SHA256:... of the server's host key - required),
     SAMADHAN_SFTP_TIMEOUT_MS (20000).
*/

const MODE = String(env('STORAGE') || '').trim().toLowerCase();

/** A storage reference is a relative path of safe segments (no "..", no absolute paths). */
function safeRef(ref) {
    const r = String(ref || '');
    if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(r) || r.split('/').some((s) => s === '.' || s === '..')) throw new Error('bad storage reference');
    return r;
}

// ---------- local (tests / development) ----------
function localAdapter() {
    const root = path.resolve(env('STORAGE_DIR') || path.join(require('os').tmpdir(), 'samadhan-files'));
    const full = (ref) => path.join(root, ...safeRef(ref).split('/'));
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

// ---------- sftp (production) ----------
/** "SHA256:abc..." (as printed by ssh-keygen -lf) or plain base64 / hex of the SHA-256 of the host key. */
/** Several fingerprints may be given, comma separated (the server may offer an ED25519, ECDSA or RSA key). */
function fingerprintMatcher(want) {
    const list = String(want || '').split(/[,\s]+/).map((w) => w.trim().replace(/^SHA256:/i, '').replace(/=+$/, '')).filter(Boolean);
    if (!list.length) return null;
    return (key) => {
        const h = crypto.createHash('sha256').update(key).digest();
        const b64 = h.toString('base64').replace(/=+$/, '');
        const hex = h.toString('hex');
        return list.some((w) => w === b64 || w.toLowerCase().replace(/:/g, '') === hex);
    };
}

function sftpAdapter() {
    let SftpClient;
    try {
        SftpClient = require('ssh2-sftp-client');
    } catch {
        throw new Error('the SFTP library is not installed - run "npm ci --omit=optional" in backend/samadhan');
    }
    const host = env('SFTP_HOST');
    const user = env('SFTP_USER');
    const base = String(env('SFTP_BASE_DIR') || '').replace(/\/+$/, '');
    const keyPath = env('SFTP_PRIVATE_KEY_PATH');
    const password = env('SFTP_PASSWORD');
    const verify = fingerprintMatcher(env('SFTP_HOST_FINGERPRINT'));
    const missing = [!host && 'SAMADHAN_SFTP_HOST', !user && 'SAMADHAN_SFTP_USER', !base && 'SAMADHAN_SFTP_BASE_DIR',
        !keyPath && !password && 'SAMADHAN_SFTP_PASSWORD or SAMADHAN_SFTP_PRIVATE_KEY_PATH', !verify && 'SAMADHAN_SFTP_HOST_FINGERPRINT'].filter(Boolean);
    if (missing.length) throw new Error(`SFTP is not configured: set ${missing.join(', ')}`);
    if (!base.startsWith('/')) throw new Error('SAMADHAN_SFTP_BASE_DIR must be an absolute folder, e.g. /samadhan');
    const config = {
        host,
        port: Number(env('SFTP_PORT') || 22),
        username: user,
        ...(keyPath ? { privateKey: fs.readFileSync(keyPath), ...(env('SFTP_PASSPHRASE') ? { passphrase: env('SFTP_PASSPHRASE') } : {}) } : { password }),
        readyTimeout: Number(env('SFTP_TIMEOUT_MS') || 20000),
        hostVerifier: verify,
        retries: 1,
    };
    const remote = (ref) => `${base}/${safeRef(ref)}`;

    // One connection, opened on first use, re-opened after an error, closed after 5 idle minutes.
    let client = null;
    let connecting = null;
    let idle = null;
    async function conn() {
        clearTimeout(idle);
        idle = setTimeout(() => { const c = client; client = null; c?.end().catch(() => {}); }, 5 * 60_000);
        idle.unref?.();
        if (client) return client;
        if (!connecting) {
            connecting = (async () => {
                const c = new SftpClient('samadhan');
                c.on('error', () => { client = null; });
                c.on('end', () => { client = null; });
                await c.connect(config);
                client = c;
                return c;
            })().finally(() => { connecting = null; });
        }
        return connecting;
    }
    async function op(fn) {
        try {
            return await fn(await conn());
        } catch (err) {
            // A dropped connection gets one fresh retry; anything else is reported.
            if (/not connected|no response|ECONNRESET|socket|closed/i.test(err.message)) {
                client = null;
                return fn(await conn());
            }
            throw err;
        }
    }
    const fail = (what, err) => Object.assign(new Error(`File storage (SFTP) could not ${what}: ${err.message}`), { status: err.code === 2 || /no such file/i.test(err.message) ? 404 : 502 });

    return {
        name: 'sftp',
        async put(key, buffer) {
            const target = remote(key);
            const tmp = `${target}.part-${crypto.randomUUID()}`;
            try {
                await op(async (c) => {
                    await c.mkdir(target.slice(0, target.lastIndexOf('/')), true);
                    await c.put(buffer, tmp);
                    await c.rename(tmp, target); // a half-written file is never visible under its real name
                });
            } catch (err) {
                await op((c) => c.delete(tmp, true)).catch(() => {});
                throw fail('save the file', err);
            }
            return { ref: key };
        },
        async get(ref) {
            try { return await op((c) => c.get(remote(ref))); } catch (err) { throw fail('read the file', err); }
        },
        async del(ref) {
            try { await op((c) => c.delete(remote(ref), true)); } catch (err) { throw fail('delete the file', err); }
        },
        /** Connection check for Admin > General ("Test file storage"). */
        async check() {
            return op(async (c) => {
                await c.mkdir(base, true);
                const probe = `${base}/.samadhan-check-${crypto.randomUUID()}`;
                await c.put(Buffer.from('ok'), probe);
                await c.delete(probe);
                return { ok: true, host, base };
            });
        },
    };
}

let adapter = null;
let reason = '';
try {
    if (MODE === 'sftp') adapter = sftpAdapter();
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

module.exports = { fingerprintMatcher, objectKey, safeRef, storage, storageInfo };
