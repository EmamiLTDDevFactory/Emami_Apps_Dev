'use strict';
const express = require('express');
const { ready } = require('./db/ready');
const { initSchema } = require('./db/schema');
const { requireAccess } = require('./middleware/auth');
const { rateLimit } = require('./middleware/rateLimit');

/*
   SAMADHAN (formerly Setu) — Emami helpdesk. Frontend: embedded-apps/samadhan. Backend: this folder, mounted at
   /api/samadhan (and, for old clients, at /api/setu - see legacyAlias below), with its own `samadhan` Postgres schema
   (the legacy `setu` schema is used until the v7.0 rename has been run - db/pool.js, db/migrate.js).

     db/          schema.js (tables, indexes), seed.js (base configuration), ready.js (startup promise),
                  pool.js (schema name in one place), migrate.js (v7 migrations with up / down)
     lib/         business logic: business hours, SLA, severity matrix, round robin, automations, tickets,
                  templates and notifications, Microsoft 365 mail, scheduled checks
     middleware/  auth.js (hub session + Samadhan grant + role), rateLimit.js (per-person limits)
     routes/      HTTP endpoints: me & reference data, tickets, board / dashboard / report, admin, scheduler
     tests/       API test suite (runs against a local throwaway Postgres; see tests/README.md)

   Sign-in is the Emami Apps hub session. Access is the Samadhan grant in Manage Access (app id 'samadhan', formerly 'setu'), and its role decides what a
   person can do: Agent (work tickets), Supervisor (+ daily report), Admin (+ Samadhan configuration).

   Each ticket gets a severity from the Category -> Function matrix (which sets its priority), SLA due dates from
   the policy linked to its group (else the default policy) on business hours where the target says so, round-robin
   assignment in round-robin groups (only agents whose status is Available), and the automations on create, update
   and time. Scheduled work (SLA reminders / violations, time automations, mailbox intake) runs from
   POST /api/samadhan/jobs/run (Admin, or the x-internal-secret header for a scheduler) and also at most every few
   minutes on normal traffic, so it works with no long-running worker. Ticket numbers start at 100000.
*/

const router = express.Router();

// Scheduler entry point - authenticates itself (admin session or internal secret), so it sits before requireAccess.
router.use(require('./routes/jobs'));
// Requester portal and WhatsApp webhook: no hub sign-in, their own limits (routes/public.js).
router.use(require('./routes/public'));
router.use(requireAccess, rateLimit);
router.use(require('./routes/me'));
router.use(require('./routes/tickets'));
router.use(require('./routes/work'));
router.use(require('./routes/reports'));
router.use(require('./routes/insights'));
router.use('/admin', require('./routes/admin'));

// ---------- /api/setu: the pre-v7 path, kept as an alias ----------
// Formerly Setu. Old browser tabs, the Meta WhatsApp webhook and any integration still calling /api/setu get the same
// router, plus standard deprecation headers pointing at /api/samadhan. Callers are logged (path and user agent only,
// at most once a minute per path) so we know when nothing uses the old path any more.
const SUNSET = new Date(`${process.env.SAMADHAN_LEGACY_SUNSET || '2027-05-31'}T00:00:00Z`);
const lastLogged = new Map();
function legacyAlias(req, res, next) {
    res.set('Deprecation', 'true');
    if (!Number.isNaN(SUNSET.getTime())) res.set('Sunset', SUNSET.toUTCString());
    res.set('Link', `</api/samadhan${req.path}>; rel="successor-version"`);
    const key = req.path.replace(/\/\d+(?=\/|$)/g, '/:id');
    if (Date.now() - (lastLogged.get(key) || 0) > 60_000) {
        lastLogged.set(key, Date.now());
        if (lastLogged.size > 500) lastLogged.delete(lastLogged.keys().next().value);
        console.info(`[samadhan] legacy path /api/setu${key} ${req.method} ua="${String(req.get('user-agent') || '').slice(0, 80)}"`);
    }
    next();
}

module.exports = router;
module.exports.legacyAlias = legacyAlias;
module.exports.ready = ready;
module.exports.initSchema = initSchema;
