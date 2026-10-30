'use strict';
const { JWT_SECRET } = require('../../sessionAuth');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db');
const { APP_ID, EMAIL_RE, ROLES } = require('../constants');
const { ready } = require('../db/ready');
const { jobsDue, runJobs } = require('../lib/jobs');
const { fail } = require('../lib/util');

// ---------- Access ----------

function verifiedHubEmail(req) {
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match || !JWT_SECRET) return '';
    try {
        const claims = jwt.verify(match[1].trim(), JWT_SECRET, { algorithms: ['HS256'] });
        // Only plain hub session tokens. Purpose-bound tokens signed with the same secret (e.g. the emailed
        // magic sign-in link) must never work as a Setu session.
        if (!claims || typeof claims !== 'object' || claims.purpose) return '';
        const email = String(claims.email || '').trim().toLowerCase();
        return EMAIL_RE.test(email) ? email : '';
    } catch {
        return '';
    }
}

async function requireAccess(req, res, next) {
    const email = verifiedHubEmail(req);
    if (!email) return res.status(401).json({ success: false, error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    try {
        await ready;
        const grant = await pool.query('SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [email, APP_ID]);
        if (!grant.rows.length) return res.status(403).json({ success: false, error: 'You do not have access to Samadhan. Ask an admin to grant it in Manage Access.' });
        // The grant's role is the source of truth; older 'User' grants count as Agent.
        const role = ROLES.includes(grant.rows[0].role) ? grant.rows[0].role : 'Agent';
        const user = await pool.query('SELECT name FROM emami_apps.users WHERE lower(email) = $1 LIMIT 1', [email]);
        const fallbackName = user.rows[0]?.name || email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const { rows } = await pool.query(
            `INSERT INTO setu.agents (email, name, role, "lastSeenAt") VALUES ($1, $2, $3, now())
             ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, "lastSeenAt" = now()
             RETURNING id, name, email, role, active, availability`,
            [email, fallbackName, role],
        );
        if (!rows[0].active) return res.status(403).json({ success: false, error: 'Your Samadhan agent account is deactivated. Ask a Samadhan admin to reactivate it.' });
        req.agent = rows[0];
        req.verifiedEmail = email;
        if (jobsDue()) runJobs().catch(() => {});
        next();
    } catch (err) {
        console.error('[setu]', err);
        res.status(500).json({ success: false, error: 'Could not verify your access.' });
    }
}

const isSupervisor = (req) => req.agent.role === 'Supervisor' || req.agent.role === 'Admin';
const isAdmin = (req) => req.agent.role === 'Admin';
const requireSupervisor = (req) => { if (!isSupervisor(req)) throw fail(403, 'Supervisors and admins only.'); };

module.exports = { isAdmin, requireAccess, requireSupervisor, verifiedHubEmail };
