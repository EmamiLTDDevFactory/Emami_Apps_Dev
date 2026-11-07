'use strict';
const express = require('express');
const { ready } = require('./db/ready');
const { initSchema } = require('./db/schema');
const { requireAccess } = require('./middleware/auth');
const { permissionGate } = require('./middleware/permission');
const { rateLimit } = require('./middleware/rateLimit');

/*
   SAMADHAN — Emami service desk (SAP / primary sales, secondary sales apps, digital apps, IT). Frontend: embedded-apps/samadhan. Backend: this folder, mounted at
   /api/samadhan (and on TRANSPORT_PATH below, the route the web server forwards today), with its own `samadhan`
   Postgres schema (db/pool.js) and migrations (db/migrate.js).

     db/          schema.js (tables, indexes), seed.js (base configuration), ready.js (startup promise),
                  pool.js (schema name in one place), migrate.js (v7 migrations with up / down)
     lib/         business logic: business hours, SLA, severity matrix, round robin, automations, tickets,
                  templates and notifications, Microsoft 365 mail, scheduled checks
     middleware/  auth.js (hub session + Samadhan grant + role), rateLimit.js (per-person limits)
     routes/      HTTP endpoints: me & reference data, tickets, board / dashboard / report, admin, scheduler
     tests/       API test suite (runs against a local throwaway Postgres; see tests/README.md)

   Sign-in is the Emami Apps hub session. Access is the Samadhan grant in Manage Access (app id 'samadhan'), and its role decides what a
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
// Signed 5-minute file links and the portal upload (routes/attachments.js) - checked by their own tokens.
router.use(require('./routes/attachments').publicRouter);
// Every signed-in route also passes the permission gate (middleware/permission.js: one rule per route, v7 Phase 2).
router.use(requireAccess, rateLimit, permissionGate);
router.use(require('./routes/me'));
router.use(require('./routes/tickets'));
router.use(require('./routes/work'));
router.use(require('./routes/reports'));
router.use(require('./routes/insights'));
router.use(require('./routes/attachments').router);
router.use('/admin', require('./routes/admin'));
router.use('/admin/authz', require('./routes/authz'));
// v7 Phase 3: workspaces, applications, priority matrix, mail classification (Admin; routes/workspaces.js).
router.use('/admin', require('./routes/workspaces'));
// v7 Phase 4: SAP details, external references, reference masters (routes/sap.js).
router.use(require('./routes/sap'));
// v7 Phase 5: IT details (routes/it.js).
router.use(require('./routes/it'));
// v7 Phase 6: transports, change planning, approvals, calendar, catalogue, registers (routes/change.js).
router.use(require('./routes/change'));
// v7 Phase 7: major incident, PIR, problem / KEDB, candidates, duplicates, service health (routes/problem.js).
router.use(require('./routes/problem'));

// ---------- Transport route ----------
// The dev web server forwards only one older route name to this backend until its own /api/samadhan block is added
// (deploy/add-samadhan-nginx-route.sh, needs root). server.js mounts the same router there; the app switches to it
// by itself. Nothing a user sees carries that name. No headers or logging - it is the same API.
// Removed (set to null) once the web server forwards /api/samadhan - see deploy/add-samadhan-nginx-route.sh.
const TRANSPORT_PATH = '/setu';
function transportRoute(req, res, next) { next(); }

module.exports = router;
module.exports.TRANSPORT_PATH = TRANSPORT_PATH;
module.exports.legacyAlias = transportRoute; // server.js written by an older deploy script calls this
module.exports.ready = ready;
module.exports.initSchema = initSchema;
