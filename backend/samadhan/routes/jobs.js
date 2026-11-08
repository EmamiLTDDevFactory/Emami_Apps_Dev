'use strict';
const crypto = require('crypto');
const express = require('express');
const { ready } = require('../db/ready');
const { pool } = require('../db/pool');
const { APP_ID, APP_IDS } = require('../constants');
const { runJobs } = require('../lib/jobs');
const { fail, wrap } = require('../lib/util');
const { verifiedHubEmail } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Scheduler entry point: Admin, or a scheduler holding HUB_INTERNAL_API_SECRET. Registered before requireAccess.
// Who is calling is checked BEFORE the rate limit: otherwise anonymous junk requests use up the scheduler's allowance.
const allowed = wrap(async (req, res) => {
    const secret = process.env.HUB_INTERNAL_API_SECRET;
    const given = Buffer.from(String(req.get('x-internal-secret') || ''));
    const expected = Buffer.from(String(secret || ''));
    const internal = expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
    if (!internal) {
        const email = verifiedHubEmail(req);
        // An Admin grant, and not deactivated in Samadhan.
        const grant = email
            ? await pool.query(
                `SELECT g.role FROM emami_apps.authorized_user_apps g
                 LEFT JOIN samadhan.agents a ON a.email = g.email
                 WHERE g.email = $1 AND g.app_id = ANY($2::text[]) AND COALESCE(a.active, true)
                 ORDER BY (g.app_id = $3) DESC LIMIT 1`,
                [email, APP_IDS, APP_ID],
            )
            : { rows: [] };
        if (grant.rows[0]?.role !== 'Admin') throw fail(403, 'Admins only.');
        req.verifiedEmail = email; // an Admin's runs count against their own limit, not the scheduler's
    }
    req.jobsAllowed = true;
});

router.post('/jobs/run', (req, res, next) => allowed(req, res).then(() => (req.jobsAllowed ? next() : undefined)), rateLimit, wrap(async (req, res) => {
    await ready;
    res.json({ success: true, result: await runJobs({ force: true }) });
}));

module.exports = router;
