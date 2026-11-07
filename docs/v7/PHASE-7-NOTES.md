# Samadhan v7 — Phase 7 notes (major incident, PIR, problem / KEDB, detection, dashboards)

Master prompt §I (post_incident_reviews), §M, §N 5-7, §P. Done on 2026-11-07.

## What a user sees

- **Major incident.**
  - **Flagged automatically** when a ticket outside Secondary Sales is Urgent and its SAP / IT environment is
    Production. Admin setting `major.autoFlag` = false turns this off.
  - **Declared by hand** by someone with `ticket.declareMajor` (Supervisor and up), with a bridge link and a note.
  - When flagged, the desk leads and the team get a bell.
  - A red **banner** on the ticket shows the bridge link, a next-update countdown (every «30» min, setting
    `major.updateMins`), **Post update** (a private note that restarts the clock) and **Stand down**. An overdue update rings the team.
  - A stood-down incident is not flagged again automatically.
- **Post-incident review (PIR).** Fields: summary, business impact, timeline (one line per event), root cause and
  category, contributing factors, corrective and preventive actions, "Save as reviewed". A **major incident cannot be
  resolved** until its summary and root cause are filled in. Editing needs `ticket.pir.edit`.
- **Problems.**
  - From an incident: **Create problem** or **Link** it to problem #n.
  - On a problem record: status (Under investigation / Known error / Fix in progress / Resolved), symptom, workaround,
    root cause, permanent fix, **Publish as a known error (KEDB)** (needs a workaround), and the linked incidents.
  - An incident linked to a known error shows the workaround.
  - Resolving a problem rings the agents of its open incidents; when an incident is unassigned, its group is rung.
- **Possible problems** (detection job): 3 or more incidents in 7 days with the same application + category +
  sub-category and no problem yet. They appear on the Dashboard with **Create problem** (links them all) or dismiss.
- **Duplicate hint** on New ticket: open tickets from the last 24 h for the same application with the same T-code,
  error text, server or subject. Click one to open it instead.
- **Dashboard** (while desks are on): a **service-health** strip. Tiles for major incidents, open problems, known
  errors, awaiting approval, pending external and changes in the next 7 days, plus the major incidents in progress.
- **Registers:** **Problem / KEDB Register** and **Major Incident Register** (with the PIR).
- **Filters:** Major incidents only, and Awaiting approval. The API also takes `problemId`.

## Backend

- **Migration `7.7-problem`:**
  - ticket columns `isMajorIncident`, `majorDeclaredAt`, `majorBridgeUrl`, `majorNextUpdateAt`, `majorRemindedAt`, `problemId`;
  - tables `post_incident_reviews`, `problem_details`, `problem_candidates`;
  - indexes on major / problem / record class.

  `SCHEMA_VERSION` 15.
- **Code:** `lib/problem.js` and `routes/problem.js`.
  - Major incident: `POST/DELETE /tickets/:id/major`, `POST /tickets/:id/major/update`.
  - PIR: `GET/PUT /tickets/:id/pir`.
  - Problems: `GET/POST /tickets/:id/problem`, `PUT /tickets/:id/known-error`, `/problem-candidates` (list, create, dismiss).
  - Other: `/duplicates`, `/service-health`.
- **Hooks:**
  - auto-flag after create, after a priority change, and after SAP / IT details are saved;
  - PIR check before resolve;
  - "problem resolved" bell;
  - jobs: major-update reminders and candidate detection.

## Demo (dev)

Run `bash ~/samadhan-demo/run.sh load-v7-problem`. It adds:

- 1 major incident with a bridge;
- 1 reviewed PIR;
- 1 problem with 3 Infra incidents, published as a known error;
- a candidate detection run.

## Tests

- `tests/problem.api.test.js` (46 checks). The gate's `problem` stage runs 7.7 down, then up, then the suite.
- The permissions baseline records declare / stand down / PIR edit as Supervisor-and-up.
- E2E: "major incident: banner, PIR card, problem card, service health on the dashboard".

## Rollback

Run `node backend/samadhan/db/migrate.js down 7.7-problem`.
