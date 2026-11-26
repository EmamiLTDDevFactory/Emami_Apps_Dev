const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const { graphToken, APP_URL } = require('./ccbTeams');

/*
   EMAMI APPS NOTIFICATIONS — one inbox per person, shared by every app. The hub's bell lists all of a
   person's notifications; an app's own bell lists just that app's (?app=dev-tracker). Any backend module
   records one with notify(); each can also go to the person's Outlook as an email.

   Routes (mounted at /api/me/notifications, so they ride the existing /api/me proxy rule):
     GET  /            ?app=<appId>&limit=50   -> { items, unread }
     POST /read        { ids: [..] } | { all: true, app? }

   Email goes through Microsoft Graph (app-only, the same app registration as ccbTeams.js):
     POST /users/{sender}/sendMail — needs the Mail.Send APPLICATION permission (admin consent), ideally
     restricted to the sender mailbox with an Exchange application access policy.
   Env: NOTIFY_EMAIL_ENABLED ('false' turns email off), NOTIFY_MAIL_SENDER (sending mailbox; falls back to
   CCB_TEAMS_ORGANIZER). No sender or no permission = in-app only; an email failure never fails the caller.
*/

const router = express.Router();
const EMAIL_ENABLED = String(process.env.NOTIFY_EMAIL_ENABLED || 'true').toLowerCase() !== 'false';
const SENDER = String(process.env.NOTIFY_MAIL_SENDER || process.env.CCB_TEAMS_ORGANIZER || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;
const APP_NAMES = { 'dev-tracker': 'Change Control Board & CR Tracker', samadhan: 'Samadhan' };

async function initSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS emami_apps.notifications (
            id bigserial PRIMARY KEY,
            email text NOT NULL,
            app_id text NOT NULL,
            kind text NOT NULL DEFAULT 'info',
            title text NOT NULL,
            body text NOT NULL DEFAULT '',
            link text,
            ref_key text,
            emailed_at timestamptz,
            email_error text,
            created_at timestamptz NOT NULL DEFAULT now(),
            read_at timestamptz
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON emami_apps.notifications (email, created_at DESC)');
    // ref_key makes a notification idempotent (e.g. 'ccb:12:dev:User Testing' is only ever sent once).
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS notifications_ref_idx ON emami_apps.notifications (email, ref_key) WHERE ref_key IS NOT NULL');
    console.log('[notifications] Schema up to date (emami_apps.notifications).');
}
const ready = initSchema().catch((err) => { console.error('[notifications] Schema init failed:', err); throw err; });
ready.catch(() => {});

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emailHtml(n) {
    const app = APP_NAMES[n.app_id] || 'Emami Apps';
    const url = n.link ? (/^https?:\/\//.test(n.link) ? n.link : `${APP_URL}${n.link}`) : APP_URL;
    return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f1b33;max-width:560px">
<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4f3fd6;font-weight:700">${esc(app)}</div>
<h2 style="font-size:18px;margin:6px 0 10px">${esc(n.title)}</h2>
${n.body ? `<p style="white-space:pre-wrap;line-height:1.5;margin:0 0 16px">${esc(n.body)}</p>` : ''}
<a href="${esc(url)}" style="display:inline-block;background:#4f3fd6;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:600">Open in Emami Apps</a>
<p style="font-size:11px;color:#6b7280;margin-top:20px">You are receiving this because of your role in ${esc(app)} on Emami Apps.</p></div>`;
}

async function sendEmail(n, onMail) {
    // onMail({ to, subject, status: 'sent' | 'failed' | 'skipped', error }) lets the caller keep its own mail log.
    const report = (status, error = null) => {
        if (typeof onMail === 'function') Promise.resolve().then(() => onMail({ to: n.email, subject: n.title, status, error })).catch((e) => console.error('[notifications] mail log callback failed:', e.message));
    };
    if (!EMAIL_ENABLED || !SENDER || !EMAIL_RE.test(n.email)) {
        const why = !EMAIL_ENABLED ? 'email turned off (NOTIFY_EMAIL_ENABLED=false)' : !SENDER ? 'no sender mailbox (NOTIFY_MAIL_SENDER not set)' : 'invalid address';
        console.log(`[notifications] Email NOT sent to ${n.email} ("${n.title}"): ${why}`);
        report('skipped', why);
        return;
    }
    try {
        const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER)}/sendMail`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: { subject: n.title, body: { contentType: 'HTML', content: emailHtml(n) }, toRecipients: [{ emailAddress: { address: n.email } }] },
                saveToSentItems: false,
            }),
            signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const code = data?.error?.code || '';
            throw new Error(res.status === 403 || code === 'ErrorAccessDenied'
                ? 'Microsoft 365 refused to send: the app registration needs the Mail.Send application permission for the sender mailbox.'
                : `Microsoft Graph ${res.status} ${code}: ${data?.error?.message || 'send failed'}`.slice(0, 400));
        }
        await pool.query('UPDATE emami_apps.notifications SET emailed_at = now(), email_error = NULL WHERE id = $1', [n.id]);
        console.log(`[notifications] Email sent to ${n.email} ("${n.title}")`);
        report('sent');
    } catch (err) {
        console.error(`[notifications] Email to ${n.email} ("${n.title}") failed:`, err.message);
        report('failed', err.message.slice(0, 500));
        await pool.query('UPDATE emami_apps.notifications SET email_error = $2 WHERE id = $1', [n.id, err.message.slice(0, 500)]).catch(() => {});
    }
}

/**
 * Records a notification (skipped if `refKey` was already sent to this person) and emails it in the
 * background. Never throws — a notification problem must not break the action that caused it.
 */
async function notify({ email, appId, kind = 'info', title, body = '', link = null, refKey = null, sendMail = true, onMail = null }) {
    const to = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(to) || !title) return null;
    try {
        await ready;
        const { rows } = await pool.query(
            `INSERT INTO emami_apps.notifications (email, app_id, kind, title, body, link, ref_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING *`,
            [to, appId, kind, String(title).slice(0, 300), String(body || '').slice(0, 2000), link, refKey]
        );
        if (rows[0] && sendMail) sendEmail(rows[0], onMail);
        return rows[0] || null;
    } catch (err) {
        console.error('[notifications] notify failed:', err.message);
        return null;
    }
}

function verifiedHubEmail(req) {
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match || !JWT_SECRET) return '';
    try {
        return String(jwt.verify(match[1].trim(), JWT_SECRET)?.email || '').trim().toLowerCase();
    } catch {
        return '';
    }
}

router.use(async (req, res, next) => {
    const email = verifiedHubEmail(req);
    if (!email) return res.status(401).json({ success: false, error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    req.verifiedEmail = email;
    try { await ready; next(); } catch { res.status(500).json({ success: false, error: 'Notifications are unavailable.' }); }
});

router.get('/', async (req, res) => {
    const app = typeof req.query.app === 'string' && req.query.app ? req.query.app : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    try {
        const params = [req.verifiedEmail, app];
        const where = `email = $1 AND ($2::text IS NULL OR app_id = $2) AND created_at > now() - interval '90 days'`;
        const [items, unread] = await Promise.all([
            pool.query(`SELECT id, app_id AS "appId", kind, title, body, link, created_at AS "createdAt", read_at AS "readAt"
                          FROM emami_apps.notifications WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`, params),
            pool.query(`SELECT COUNT(*)::int AS n FROM emami_apps.notifications WHERE ${where} AND read_at IS NULL`, params),
        ]);
        res.json({ success: true, items: items.rows.map((n) => ({ ...n, appName: APP_NAMES[n.appId] || n.appId })), unread: unread.rows[0].n });
    } catch (err) {
        console.error('[notifications]', err);
        res.status(500).json({ success: false, error: 'Could not load notifications.' });
    }
});

router.post('/read', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 500) : [];
    const all = req.body?.all === true;
    const app = typeof req.body?.app === 'string' && req.body.app ? req.body.app : null;
    if (!ids.length && !all) return res.status(400).json({ success: false, error: 'Nothing to mark as read.' });
    try {
        const r = all
            ? await pool.query('UPDATE emami_apps.notifications SET read_at = now() WHERE email = $1 AND read_at IS NULL AND ($2::text IS NULL OR app_id = $2)', [req.verifiedEmail, app])
            : await pool.query('UPDATE emami_apps.notifications SET read_at = now() WHERE email = $1 AND read_at IS NULL AND id = ANY($2)', [req.verifiedEmail, ids]);
        res.json({ success: true, updated: r.rowCount });
    } catch (err) {
        console.error('[notifications]', err);
        res.status(500).json({ success: false, error: 'Could not update notifications.' });
    }
});

module.exports = { router, notify };
