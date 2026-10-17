'use strict';
const express = require('express');
const { ready } = require('./db/ready');
const { initSchema } = require('./db/schema');
const { requireAccess } = require('./middleware/auth');
const { rateLimit } = require('./middleware/rateLimit');

/*
   SETU — Emami Secondary Support helpdesk. Frontend: embedded-apps/setu. Backend: this folder, mounted at /api/setu,
   with its own `setu` Postgres schema.

     db/          schema.js (tables, indexes), seed.js (base configuration), ready.js (startup promise)
     lib/         business logic: business hours, SLA, severity matrix, round robin, automations, tickets,
                  templates and notifications, Microsoft 365 mail, scheduled checks
     middleware/  auth.js (hub session + 'setu' grant + role), rateLimit.js (per-person limits)
     routes/      HTTP endpoints: me & reference data, tickets, board / dashboard / report, admin, scheduler
     tests/       API test suite (runs against a local throwaway Postgres; see tests/README.md)

   Sign-in is the Emami Apps hub session. Access is the 'setu' grant in Manage Access, and its role decides what a
   person can do: Agent (work tickets), Supervisor (+ daily report), Admin (+ Setu configuration).

   Each ticket gets a severity from the Category -> Function matrix (which sets its priority), SLA due dates from
   the policy linked to its group (else the default policy) on business hours where the target says so, round-robin
   assignment in round-robin groups (only agents whose status is Available), and the automations on create, update
   and time. Scheduled work (SLA reminders / violations, time automations, mailbox intake) runs from
   POST /api/setu/jobs/run (Admin, or the x-internal-secret header for a scheduler) and also at most every few
   minutes on normal traffic, so it works with no long-running worker. Ticket numbers start at 100000.
*/

const router = express.Router();

// Scheduler entry point - authenticates itself (admin session or internal secret), so it sits before requireAccess.
router.use(require('./routes/jobs'));
router.use(requireAccess, rateLimit);
router.use(require('./routes/me'));
router.use(require('./routes/tickets'));
router.use(require('./routes/reports'));
router.use(require('./routes/insights'));
router.use('/admin', require('./routes/admin'));

module.exports = router;
module.exports.ready = ready;
module.exports.initSchema = initSchema;
