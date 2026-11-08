'use strict';
const crypto = require('crypto');

/*
   Email check before a portal ticket (2026-11-08 security review): without it anyone could make the helpdesk mailbox
   email any address. The requester asks for a 6-digit code, it is emailed to them, and the ticket is only created with
   it. Codes: 10 minutes, single use, 5 wrong tries, stored as SHA-256. At most one code a minute and 5 an hour per
   address. Kept in memory per backend copy (like the rate limits): after a restart the requester asks for a new code.
*/
const TTL_MS = 10 * 60_000;
const MAX_TRIES = 5;
const PER_HOUR = 5;
const codes = new Map(); // email -> { hash, expires, tries, sent: number[] }
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function prune(now) {
    if (codes.size < 5000) return;
    for (const [k, v] of codes) if (v.expires < now && !v.sent.some((t) => now - t < 3_600_000)) codes.delete(k);
}

/** A new code for this address, or { wait } in seconds when asked too often. */
function issue(email, now = Date.now()) {
    const key = String(email).trim().toLowerCase();
    const cur = codes.get(key);
    const sent = (cur?.sent ?? []).filter((t) => now - t < 3_600_000);
    if (sent.length && now - sent[sent.length - 1] < 60_000) return { wait: Math.ceil((60_000 - (now - sent[sent.length - 1])) / 1000) };
    if (sent.length >= PER_HOUR) return { wait: Math.ceil((3_600_000 - (now - sent[0])) / 1000) };
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    codes.set(key, { hash: sha(`${key}|${code}`), expires: now + TTL_MS, tries: 0, sent: [...sent, now] });
    prune(now);
    return { code };
}

/** True once for the right code (then it is used up); wrong tries count, and the 5th wrong one ends the code. */
function verify(email, code, now = Date.now()) {
    const key = String(email).trim().toLowerCase();
    const cur = codes.get(key);
    if (!cur || !cur.hash || cur.expires < now || !/^\d{6}$/.test(String(code ?? '').trim())) return false;
    const ok = crypto.timingSafeEqual(cur.hash, sha(`${key}|${String(code).trim()}`));
    if (ok) {
        cur.hash = null;
        return true;
    }
    cur.tries += 1;
    if (cur.tries >= MAX_TRIES) cur.hash = null;
    return false;
}

module.exports = { issue, verify };
