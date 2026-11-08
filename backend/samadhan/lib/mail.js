'use strict';
const { graphToken } = require('../../ccbTeams');
const { MAILBOX, MAIL_ENABLED, deliverable } = require('../constants');

// ---------- Mail (Microsoft 365 helpdesk mailbox via Graph) ----------

async function graph(path, init = {}) {
    const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;
    const res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    if (res.status === 202 || res.status === 204) return undefined;
    if (!res.ok) throw new Error(`Graph ${init.method ?? 'GET'} ${path.slice(0, 80)} failed: ${res.status}`);
    return res.json();
}

/** Sends from the helpdesk mailbox, or logs when mail is switched off (development, shadow mode). */
async function sendMail({ to, cc = [], subject, html, attachments = [] }) {
    const rcpt = (list) => list.filter(deliverable).map((address) => ({ emailAddress: { address } }));
    if (!rcpt(to).length) return;
    if (!MAIL_ENABLED) {
        console.info(`[samadhan] mail disabled - would send "${String(subject).slice(0, 60)}" to ${to.length} recipient(s)${attachments.length ? ` with ${attachments.length} file(s)` : ''}`);
        return;
    }
    // v7: with files, the mail is built as a draft (small files attached directly, larger ones through an upload
    // session - Graph's one-call sendMail only takes about 3 MB) and then sent. Without files nothing changes.
    if (attachments.length) return sendWithFiles({ to: rcpt(to), cc: rcpt(cc), subject, html, attachments });
    try {
        await graph(`/users/${encodeURIComponent(MAILBOX)}/sendMail`, {
            method: 'POST',
            body: JSON.stringify({
                message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: rcpt(to), ccRecipients: rcpt(cc) },
                saveToSentItems: true,
            }),
        });
    } catch (err) {
        console.error('[samadhan] send mail failed:', err.message);
    }
}

async function sendWithFiles({ to, cc, subject, html, attachments }) {
    const box = `/users/${encodeURIComponent(MAILBOX)}`;
    try {
        const draft = await graph(`${box}/messages`, { method: 'POST', body: JSON.stringify({ subject, body: { contentType: 'HTML', content: html }, toRecipients: to, ccRecipients: cc }) });
        for (const a of attachments) {
            if (a.buffer.length < 3 * 1024 * 1024) {
                await graph(`${box}/messages/${draft.id}/attachments`, {
                    method: 'POST',
                    body: JSON.stringify({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.contentType, contentBytes: a.buffer.toString('base64') }),
                });
                continue;
            }
            const session = await graph(`${box}/messages/${draft.id}/attachments/createUploadSession`, {
                method: 'POST', body: JSON.stringify({ AttachmentItem: { attachmentType: 'file', name: a.name, size: a.buffer.length, contentType: a.contentType } }),
            });
            const CHUNK = 4 * 320 * 1024; // multiple of 320 KiB, as Graph requires
            for (let start = 0; start < a.buffer.length; start += CHUNK) {
                const end = Math.min(start + CHUNK, a.buffer.length);
                const r = await fetch(session.uploadUrl, {
                    method: 'PUT',
                    headers: { 'Content-Length': String(end - start), 'Content-Range': `bytes ${start}-${end - 1}/${a.buffer.length}` },
                    body: a.buffer.subarray(start, end),
                });
                if (!r.ok) throw new Error(`Graph attachment upload failed: ${r.status}`);
            }
        }
        await graph(`${box}/messages/${draft.id}/send`, { method: 'POST' });
    } catch (err) {
        console.error('[samadhan] send mail with files failed:', err.message);
    }
}

/** Ticket number from a subject line: "[#100123]", "|| 100123" or "#TICKET No - 100123". */
function ticketNumberFromSubject(subject) {
    if (!subject) return null;
    const m = subject.match(/\[#(\d{5,9})\]/) ?? subject.match(/\|\|\s*(\d{5,9})\b/) ?? subject.match(/TICKET No\s*-\s*(\d{5,9})\b/i);
    const n = m ? Number(m[1]) : null;
    // Ticket ids are Postgres integers: anything larger can never be a ticket (and must not reach a query).
    return n && Number.isSafeInteger(n) && n <= 2147483647 ? n : null;
}

/**
 * Did the sender's domain vouch for this message? Reads Exchange Online's Authentication-Results header.
 * A DMARC fail, or an SPF fail without a DKIM pass, means the From address may be forged.
 */
function senderUnverified(m) {
    const h = (m.internetMessageHeaders ?? [])
        .filter((x) => String(x.name).toLowerCase() === 'authentication-results')
        .map((x) => String(x.value).toLowerCase())
        .join(' ');
    if (!h) return false;
    if (/\bdmarc=fail\b/.test(h)) return true;
    return /\bspf=(fail|softfail)\b/.test(h) && !/\bdkim=pass\b/.test(h);
}

/** Rule-based noise filter: auto-replies, out-of-office and our own notifications coming back. */
function noiseReason(m) {
    const h = new Map((m.internetMessageHeaders ?? []).map((x) => [x.name.toLowerCase(), String(x.value).toLowerCase()]));
    const from = m.from?.emailAddress?.address?.toLowerCase() ?? '';
    const subject = (m.subject ?? '').toLowerCase();
    if (from === MAILBOX) return 'notification_loop';
    if (/^(mailer-daemon|postmaster|no-?reply|donotreply)@/.test(from)) return 'auto_reply';
    const autoSubmitted = h.get('auto-submitted');
    if (autoSubmitted && autoSubmitted !== 'no') return 'auto_reply';
    if (h.has('x-auto-response-suppress') && /all|autoreply|oof/.test(h.get('x-auto-response-suppress'))) return 'auto_reply';
    if (/^(bulk|junk|auto_reply|list)$/.test(h.get('precedence') ?? '')) return 'auto_reply';
    if (/^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|autoreply)/.test(subject)) return 'out_of_office';
    if (/(your )?ticket has been (created|closed|resolved)|^ticket received -/.test(subject)) return 'notification_loop';
    return null;
}

module.exports = { graph, noiseReason, senderUnverified, sendMail, ticketNumberFromSubject };
