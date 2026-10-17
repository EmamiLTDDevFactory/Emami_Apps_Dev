'use strict';
const crypto = require('crypto');
const express = require('express');
const { ready } = require('../db/ready');
const { pool } = require('../../db');
const { APP_ID } = require('../constants');
const { runJobs } = require('../lib/jobs');
const { fail, wrap } = require('../lib/util');
const { verifiedHubEmail } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Scheduler entry point: Admin, or a scheduler holding HUB_INTERNAL_API_SECRET. Registered before requireAccess.
router.post('/jobs/run', rateLimit, wrap(async (req, res) => {
    const secret = process.env.HUB_INTERNAL_API_SECRET;
    const given = Buffer.from(String(req.get('x-internal-secret') || ''));
    const expected = Buffer.from(String(secret || ''));
    const internal = expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
    if (!internal) {
        const email = verifiedHubEmail(req);
        // An Admin grant, and not deactivated in Setu.
        const grant = email
            ? await pool.query(
                `SELECT g.role FROM emami_apps.authorized_user_apps g
                 LEFT JOIN setu.agents a ON a.email = g.email
                 WHERE g.email = $1 AND g.app_id = $2 AND COALESCE(a.active, true)`,
                [email, APP_ID],
            )
            : { rows: [] };
        if (grant.rows[0]?.role !== 'Admin') throw fail(403, 'Admins only.');
    }
    await ready;
    res.json({ success: true, result: await runJobs({ force: true }) });
}));

module.exports = router;
