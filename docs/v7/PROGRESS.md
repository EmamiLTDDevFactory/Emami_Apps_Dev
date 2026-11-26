# Samadhan v7 — Progress

## 2026-11-26 — ITSM support model (migration 7.11-itsm)
- Branch `feature/samadhan-itsm`. Support model, escalation matrix, vendor scorecard, ticket migration templates, asset master. Details: `ITSM-NOTES.md`.
- Shared files: none changed (Samadhan-owned paths only).

Resume here in a new session: read this file and `docs/SAMADHAN_MASTER_PROMPT_FINAL.md`, then continue at **Next**.

## Status

| Phase | State |
|---|---|
| C (working agreement) | done |
| 0 (discovery, baseline, plan) | done — **approved 2026-11-05** ("approved", no individual answers) |
| 1 (rename + harness) | done, pushed to main, deployed to dev |
| 2 (permissions, cockpit, data scope, attachments) | done, pushed to main, deployed to dev |
| 3 (service desks, applications, references, mail classification) | done, pushed to main, deployed to dev |
| 4 (SAP & Primary Sales desk) | **done 2026-11-07**, gate green in parts, pushed to main (0a577a7); deployed to dev; see PHASE-4-NOTES.md |
| 5 (Digital Apps, Infra & IT, IT details, portal application picker) | **done 2026-11-07**, gate green in parts, pushed to main; see PHASE-5-NOTES.md |
| 6 (change & access: catalogue, approvals, SoD, transports, change calendar, registers) | **done 2026-11-07**, gate green in parts, pushed to main; see PHASE-6-NOTES.md |
| 7 (major incident, PIR, problem / KEDB, detection, service health) | **done 2026-11-07**, gate green in parts, pushed to main, deployed to dev; see PHASE-7-NOTES.md |
| 8 (S/4HANA Programme: details, defect tracker, burn-down, hypercare) | **done 2026-11-08**, gate green in parts, pushed to main, deployed to dev; see PHASE-8-NOTES.md |
| 9 (integrations: Cloud ALM, monitoring, Teams, SolMan import; Assist upgrade; analytics extras) | **done 2026-11-08**, gate green in parts, pushed to main; see PHASE-9-NOTES.md (includes the final report) |

### Decisions taken at the Phase-0 STOP (approval without individual answers → recommended options)
- Q-R1 **Option A** (app id `samadhan`, `setu` kept as alias; one line in access-tracker). Q-R2 redirect stub
  `embedded-apps/setu/` (Amplify rule optional, follow-up). Q-R3 alias «6 months».
- Q-G1 `main` only (no `dev`). Q-G2 direct `--no-ff` merge (no `gh`). Q-G4 quoted camelCase columns.
- Q-B1 remaining baseline builds re-run one at a time, without `CI=true` (Amplify-like plain env), for before/after comparison.
- Q-E1 solved without your password: a separate throwaway Postgres cluster (`initdb`, trust auth, localhost only,
  port 55432) in `%LOCALAPPDATA%\samadhan-test-pg`, using the installed PostgreSQL 18 binaries. The existing service on 5432 is not touched.
- **Q-D1 answered 2026-11-05:** the user confirmed `Devhubfactory` @ `10.17.12.4` is the *Development Environment* DB.
  The read-only APP-MAPPING SELECTs ran from the dev server (this machine is not in `pg_hba.conf`); the counts are in
  APP-MAPPING §2. No credentials were stored anywhere new (they are already in `backend/.env` and the SSH helpers). The
  first **migration** on dev still needs its own "approved" (§C.5).
- **Still open** (needed later, not for Phase 1): Q-S1 storage (Phase 2),
  Q-G3 (does Amplify publish prod from `main`? asked again before the first merge), Q-M1–M6 (Phase 3), Q-P1 (Phase 2).
- Pushes: still asked for every time (standing rule).

Branch: `feature/samadhan-v7` (local only, not pushed; created from `origin/main` @ `4e8a551`; upstream unset on purpose).
Commits (local only, nothing pushed): `43f8640` Phase 0 docs · `9090e09` golden files from v6 code · `3075d8a` pure `git mv` of both folders · next commit = Phase 1 wiring (see `git log`).

## Phase 1 status (2026-11-05)

Done (details: `PHASE-1-NOTES.md`, follow-ups for you: `RENAME-FOLLOWUPS.md`):
- Rename with compatibility layer: `/api/samadhan` + `/api/setu` alias (Deprecation/Sunset/Link headers), schema name in
  `db/pool.js` with legacy `setu` fallback, explicit `db/migrate.js` step `7.0-rename` (up/down, transactional), grants on
  `samadhan` or `setu` (`lib/access.js`), `SAMADHAN_*` → `SETU_*` fallback, frontend `/apps/samadhan` + API-prefix
  fallback, `/apps/setu` redirect stub, deploy/demo/mock scripts, READMEs, `.env.example` names.
- Test harness: throwaway Postgres on localhost:55432 (`%LOCALAPPDATA%\samadhan-test-pg`), golden files, `rename.test.js`,
  parametrised API suite, Playwright E2E (Edge, desktop + 360 px), ESLint, gate runner `backend/samadhan/tests/gate.js`.

Verified by hand during the work (not yet as one gate run):
- API suite **130/130** on `/api/samadhan` (samadhan grants) and **130/130** on `/api/setu` (setu grants).
- Golden daily report (2222 bytes) and export **byte-identical** on: a real v6 DB in fallback mode, after `migrate up`,
  after `migrate down`, and on a fresh DB. Golden files re-captured from the v6 code (worktree of `9090e09`) after a
  fixture fix (rows made by the app always have `lastActivityAt`).
- Unit 9/9, rename tests 6/6, frontend typecheck 0 errors, lint 0 errors (2 pre-existing warnings = baseline budget),
  deploy-script `server.js` patch tested on the v6 server.js, today's server.js (no-op) and one without a Setu block.
- Lockfile: only additions (308 packages: eslint 8.57.1, eslint-config-next 14.2.35, @playwright/test 1.49.1).

**Gate run 2 (2026-11-05 ~20:30, stopped by Claude Code for low memory during E2E, 2.5 of 15.7 GB free):**
- PASS: typecheck, lint, production build, backend syntax (53 files), unit 15/15, shared backend 40/40, golden
  byte-identical ×5 (new DB; v6 DB before rename; after up; after down; after up again), migrate up/down ×4, zero-impact
  no-DB smoke (all routes = baseline, `/api/samadhan` = `/api/setu`), E2E build, stub build.
- FAIL (fixed): API suites 129/130 ×3 — the only failure was `jobs/run via internal secret`: the gate started the backend
  with a different scheduler secret than the documented `localtest` the suite sends. Gate config bug, not a Samadhan
  bug; fixed in `gate.js`, the test itself unchanged (verified 130/130 by hand earlier with `localtest`).
- E2E: the first test stopped on the loading spinner while the test Postgres was being killed (backend log: DB
  connection timeouts; Postgres: shared memory segment gone; trace truncated). Environmental — E2E still unproven.

**Gate run 3 (2026-11-05 ~20:45):** interrupted by a network drop of the Claude session after the first API suite
(green). The test Postgres was stopped uncleanly, so `gate.js` now waits up to 5 min for crash recovery (uncommitted
until run 4; in the next commit).

**Gate run 4 (2026-11-05, after resume): every step before E2E PASSED, then Claude Code stopped the gate and the test
Postgres for low memory during the Playwright run (the session was idle at the time).**
- PASS (21): typecheck, lint, production build (94 s), backend syntax 53 files, unit 15/15, shared backend 40/40,
  API suite **130/130 ×3** (new path + samadhan grants; old `/api/setu` path + setu grants; legacy schema `setu` + old
  grants). The run-2 scheduler-secret fix is confirmed. Golden byte-identical ×5, migrate up/down ×4, zero-impact smoke,
  E2E build (284 s), stub build.
- E2E: no result. The run was stopped while Playwright was running. It left 3 headless Edge processes (≈1.1 GB) behind.
  Stopping them was refused to Claude by the permission classifier, so the user stops them, or a reboot clears them.
- Cause in both runs: the machine has 15.7 GB and only ≈3.5–4.5 GB free with the user's normal apps open. The E2E step
  (Next build + backend + Postgres + Edge) does not fit alongside them.

**Gate run 5 (2026-11-06): GREEN, 23 of 23 in 14 min** — E2E 19 passed, 1 skipped by design (keyboard test on the
360 px layout). Gate changes (hung-Postgres restart, backend warm-up before E2E, every result printed) committed in
`a864fc7`. Details: `TEST-REPORT.md`.

**Zero-impact rebuild (2026-11-06):** one app at a time, no `CI=true`. 14 of 26 done, all match the baseline or build
cleanly (hub-next +2 files, expected: `apps/samadhan/` page). `expense` fails to install with the same remote-`xlsx`
EALLOWREMOTE as `cascade-pricing` (environment). Stopped by Claude Code for low memory during `market-rate` (Expo).

**Decision (user, 2026-11-06): do not install, build or otherwise touch other apps — not even git-ignored folders.**
Only Samadhan is tested. Other-app safety = path guard + no-DB route smoke (both in the gate). The partial rebuild was
stopped and every generated folder it left in other apps / hub-next was deleted (TEST-REPORT §2). Never run
`baseline-builds.js` / `zero-impact-builds.js` again.

## Done (Phase 0)

- §C.1 Located code (DISCOVERY §1). No `backend/setu.js`; mount is inline in `backend/server.js`.
- §C.2 Git: clean tree; no `dev` branch; `feature/samadhan-v7` created.
- §C.3 `docs/v7/PROGRESS.md` (this file) and `embedded-apps/setu/CLAUDE.md` (app-local conventions; moves with the folder in Phase 1).
- §G.1 Read the backend (`backend/setu/**`) and the frontend structure, mail ingest/threading, jobs, SLA, severity,
  automations, export, daily report, insights, portal, WhatsApp, guards, storage.
- §G.2 Baseline: `docs/v7/BASELINE.md`.
- §G.3 `docs/v7/DISCOVERY.md`. §G.4 `docs/v7/RENAME-INVENTORY.md`. §G.5 `docs/v7/APP-MAPPING.md` (counts pending Q-D1).
  §G.6 `docs/v7/TEST-PLAN.md`, `docs/v7/PLAN.md`.

## Deviations from the prompt (and why)

- Prompt file is at `docs/SAMADHAN_MASTER_PROMPT_FINAL.md` (not `docs/SAMADHAN_V7_PROMPT.md`); used as is.
- `CLAUDE.md` is app-local (`embedded-apps/setu/CLAUDE.md`), following `embedded-apps/bom-cost-explorer/CLAUDE.md`,
  so other apps' sessions are not affected. No root `CLAUDE.md` exists.
- Baseline installs use `npm ci` (never rewrites lockfiles) instead of the build script's `npm install`, so the working tree stays clean.
- Backend start-up smoke runs with the DB pointed at a closed local port, so no database was touched in Phase 0.
- New v7 columns will use the existing quoted camelCase convention, not §I's snake_case (PLAN §4, Q-G4).
- App-mapping counts not yet computed: needs a read-only query on the dev DB (Q-D1).

## Open questions (answer at this STOP)

**Environment**
- **Q-D1** May I run **read-only SELECTs** on the dev DB `10.17.12.4` / `Devhubfactory` (from `backend/.env`;
  `backend/db.js` calls it the "Development Environment DB") to get the live category tree and the APP-MAPPING counts?
  Please confirm it is not production. (No migration — that needs its own approval later.)
- **Q-E1** Local test DB: PostgreSQL 18 runs on `localhost:5432` but needs a password. Please add one for a local
  superuser in `%APPDATA%\postgresql\pgpass.conf` (format `localhost:5432:*:postgres:<password>`) — or tell me another
  local role/DB to use. I will only create/drop `samadhan_test` there.
- **Q-E2** Hosting: is the backend server 172.17.2.21 (`emdcindpawebser`) in the Emami data centre, AWS or Azure? (Affects the storage choice.)

**Git / CI**
- **Q-G1** No `dev` branch exists — merge to `main` only? (Recommended: yes.)
- **Q-G2** `gh` is not installed. Direct `--no-ff` merge to `main` (§T3.4 "otherwise"), or will you install `gh` for PRs?
- **Q-G3** Does the Amplify app build **production** (not just dev.emamiapps.in) from `main`? If yes, I push the feature
  branch only and stop before `main` (§T3.2).
- **Q-G4** OK to use quoted camelCase for new columns (matches the existing schema) instead of §I snake_case?

**Rename**
- **Q-R1** App id: **Option A** (rename to `samadhan`, copy grants, keep `setu` alias; touches one line in
  `embedded-apps/access-tracker/src/lib/apps.ts`) or **Option B** (keep app id `setu`)? See RENAME-INVENTORY §9. Recommended: A.
- **Q-R2** Old `/apps/setu/…` links: static redirect stub `embedded-apps/setu/` (in repo, recommended) — and do you also
  want an Amplify Console 301 rule (manual follow-up)?
- **Q-R3** `/api/setu` alias period: «6 months» from the Phase-1 release?

**Storage (blocks Phase 2 attachments — §L STOP item)**
- **Q-S1** No object storage exists. Choose: **A** AWS S3 (recommended), **B** Azure Blob, **C** server filesystem.
  A/B need a private bucket/container and credentials set on the server by your team (PLAN §6).

**Application mapping** — Q-M1 … Q-M6 in APP-MAPPING.md §3 (mSecSales = MSFA? Rural mSFA, CDMS, SalesCode SFA /
Manager / Portal / B2B, backfill classification source).

**Permissions**
- **Q-P1** Defaults for the *new* permission keys (PLAN §7, rows marked *new*), and the two added keys `company.create`, `insights.refresh`.

**Baseline**
- **Q-B1** The baseline build run was stopped by Claude Code (machine low on memory) after 7 of 28 projects. May I re-run
  the remaining 21 one at a time? Should the comparison run without `CI=true` (audit-capa fails only with it)? And
  cascade-pricing needs npm to allow its remote `xlsx` tarball. Should I leave it as a known baseline failure?

**Defaults («»)** — confirm or change: S/4 Programme on from «Jan 2027»; AI confidence threshold «0.8»; major-incident
update reminder «30» min; problem detection «3» incidents / 7 days; external-ref nudge «2» business days; `/api/setu` alias «6 months».

## Next

**2026-11-06:** merged latest `origin/main` twice (7 commits, no conflicts), gate GREEN 23/23 on the merged code (shared
backend tests 51/51), pushed `Feature/Animesh` (fast-forward `d3d2d72..9cda884`) and `main` (`--no-ff`, `4b5a1f3..51e246e`).
Dev backend deployed (RENAME-FOLLOWUPS §1, first box): `/api/samadhan` and `/api/setu` both live on port 4001, legacy
schema `setu` in use, only `emami-hub-backend-dev` restarted. Production untouched (user: "do not push production").

Dev DB schema rename `7.0-rename` applied 2026-11-06 (approved): schema `samadhan`, 1333 tickets intact.
nginx route: not done — `emamiadmin` has no sudo rights; the server admin runs `sudo bash /home/emamiadmin/add-samadhan-nginx-route.sh`
(public `/dev-api/api/samadhan/` is 404 until then; the app falls back to `/api/setu`).
Master prompt `docs/SAMADHAN_MASTER_PROMPT_FINAL.md` added to git (user).

**Phase 2 (2026-11-06 → 07; Q-P1 = PLAN §7 defaults; Q-S1 = SFTP server, host-to-host): code done, gate GREEN.**
- Commits (local): `8675596` permissions + cockpit + scope, `926637d` attachments WIP, `9d23b4e` SFTP adapter +
  Samadhan-only `package.json` (user chose option 1), `3957f01` attachments UI, `3d70706` gate `--stages`, then docs.
- Notes: `PHASE-2-NOTES.md`. Test report: `TEST-REPORT.md` (Phase 2, 31/31).
- Next: merge the latest `origin/main`, re-run the gate parts touched by the merge, **ask** before pushing
  `Feature/Animesh` then `main` (never production); then the dev backend deploy (ask). Attachments stay off on dev until
  the admin team sets `SAMADHAN_STORAGE=sftp` and the `SAMADHAN_SFTP_*` values on the server.
- Still with the server admin: nginx route (Phase 1). User: rotate the `emamiadmin` password.
- After Phase 2: STOP for review.

**Phase 3 (started 2026-11-07, user: "start phase 3"): code done, gate GREEN.**
- Mapping answers (user, 2026-11-07): Q-M1 mSecSales → MSFA; Q-M2 Rural mSFA → own RMSFA; Q-M3 CDMS → own CDMS;
  Q-M4 SFA → MR, Manager → SUP, Portal → DMS; Q-M5 B2B stays in Secondary Sales as SCB2B; Q-M6 recommendation
  ('backfill', not in Needs classification). Recorded in `APP-MAPPING.md` §0.
- Notes: `PHASE-3-NOTES.md`. Test report: `TEST-REPORT.md` (Phase 3). Demo: `run.sh load-v7-apps`.
- Next: merge the latest `origin/main`, **ask** before pushing `Feature/Animesh` then `main`; then ask before the dev
  deploy (migration 7.2 runs at start-up: backfill of every dev ticket) and the demo load. Desks stay OFF on dev until
  the user decides to switch them on for UAT. Then STOP for review (Phase 4 = SAP workspace).

Earlier plan (kept for reference):

1. On "approved" (with answers): commit Phase 0 docs (`samadhan(v7-phase0): discovery, baseline, rename inventory, plan`),
   run Q-D1 queries if allowed and fill APP-MAPPING counts.
2. Phase 1: golden daily-report file from the unchanged v6 code on `samadhan_test`; test harness; then the rename.

## How to verify Phase 0
- Read the docs in `docs/v7/`. `git status` shows only new docs + `embedded-apps/setu/CLAUDE.md`; no code changed.

## Test status
Phase 1: full gate green (run 5, 2026-11-06) — `TEST-REPORT.md`.

## Shared-file changes (Phase 1, Samadhan lines only)
- `backend/server.js`: the Setu mount block → Samadhan mount at `/samadhan` + `/setu` alias (12 lines); `VALID_ROLES_BY_APP` gains `'samadhan'` (keeps `'setu'`).
- `backend/notifications.js`: `APP_NAMES` gains `samadhan: 'Samadhan'`.
- `backend/.env.example`: 13 new lines, `SAMADHAN_*` names with empty values.
- `hub-next/src/data/mockData.ts`: `setu: '/apps/setu'` → `setu: '/apps/samadhan'` (tile id unchanged).
- `hub-next/src/components/admin/adminShared.tsx`: role list also for app id `samadhan`.
- Not changed (needs your OK at the app-id switch): `embedded-apps/access-tracker/src/lib/apps.ts`.
