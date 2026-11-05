'use strict';
const { pool } = require('../db/pool');
const { MIN, q } = require('../constants');

// ---------- Small helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const stripTags = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/** Agent-typed plain text to HTML. */
const textToHtml = (text) => esc(text).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const fmtIst = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '');
const ticketLink = (id) => `/apps/samadhan/?ticket=${id}`;
const intOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);

async function setting(key) {
    const { rows } = await pool.query('SELECT value FROM samadhan.settings WHERE key = $1', [key]);
    return rows.length ? rows[0].value : null;
}

async function audit(actorEmail, action, details = {}) {
    await pool.query('INSERT INTO samadhan.audit_events ("actorEmail", action, details) VALUES ($1, $2, $3)', [actorEmail || null, action, JSON.stringify(details)]);
}

async function logActivity(ticketId, action, details, actorAgentId = null) {
    await pool.query('INSERT INTO samadhan.activities ("ticketId", "actorAgentId", action, details) VALUES ($1, $2, $3, $4)', [ticketId, actorAgentId, action, JSON.stringify(details ?? {})]);
}

/** Last activity shown in the ticket list: what happened (ACTIVITY_KINDS), who did it and a short detail. */
async function touchActivity(ticketId, kind, by, detail = null, at = new Date()) {
    await pool.query(
        'UPDATE samadhan.tickets SET "lastActivityAt" = $2, "lastActivityKind" = $3, "lastActivityBy" = $4, "lastActivityDetail" = $5 WHERE id = $1',
        [ticketId, at, kind, by ? String(by).slice(0, 200) : null, detail ? String(detail).slice(0, 200) : null],
    );
}

/** UPDATE samadhan.<table> SET ... from a plain object of camelCase columns. */
async function updateRow(table, id, data, client = pool) {
    const keys = Object.keys(data);
    if (!keys.length) return;
    const sets = keys.map((k, i) => `${q(k)} = $${i + 2}`);
    await client.query(`UPDATE samadhan.${table} SET ${sets.join(', ')} WHERE id = $1`, [id, ...keys.map((k) => data[k])]);
}

const wrap = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        const status = err.status || (err.code === '23505' ? 409 : ['23503', '22P02', '23514', '22007', '22008', '22003', '22001'].includes(err.code) ? 400 : 500);
        if (status === 500) console.error('[samadhan]', err);
        const msg = err.code === '23505' ? 'That value is already used.' : status === 500 ? 'Something went wrong. Please try again.' : err.message;
        res.status(status).json({ success: false, error: msg });
    }
};
const fail = (status, message) => Object.assign(new Error(message), { status });

/** Start of an IST day as a UTC instant. */
function istDayStart(offsetDays = 0) {
    const ymd = new Date(Date.now() + 330 * MIN).toISOString().slice(0, 10);
    return new Date(new Date(`${ymd}T00:00:00+05:30`).getTime() + offsetDays * 86_400_000);
}

module.exports = { audit, esc, fail, fmtIst, intOrNull, istDayStart, logActivity, setting, stripTags, textToHtml, ticketLink, touchActivity, updateRow, wrap };
