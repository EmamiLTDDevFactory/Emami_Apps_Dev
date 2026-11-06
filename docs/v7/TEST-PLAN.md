# Samadhan v7 — Test plan (§T)

The gate (§T.0) must be 100 % green before any push. The loop (§T.1): on any failure find the root cause, fix, re-run the
**whole** gate; never skip / weaken / `.only` a test; after 3 failed attempts on the same problem, STOP and report.

Paths below use the post-rename names (`embedded-apps/samadhan`, `backend/samadhan`). Phase 1 creates the harness.

## A. Environments

| Thing | Value |
|---|---|
| Test DB | **local** PostgreSQL 18 on `localhost:5432`, database `samadhan_test` (created/dropped by the runner). Never the dev DB, never prod. Needs a local password for `postgres` set by you in `%APPDATA%\postgresql\pgpass.conf` or a git-ignored `backend/samadhan/tests/.env.test` (Q-E1) |
| Hub tables in the test DB | the runner creates `emami_apps.authorized_users`, `authorized_user_apps`, `users`, `notifications`, `access_change_history`, `events`, `app_stages` with the minimal columns the backend reads |
| Backend under test | `node backend/server.js` with `PORT=4191`, `PG*` → local test DB, `SAMADHAN_MAIL_ENABLED=false`, `SAMADHAN_WHATSAPP_ENABLED=false`, `ANTHROPIC_BASE_URL` → `tests/mock-anthropic.js`, a test-only `HUB_AUTH_JWT_SECRET` generated per run (never the real one) |
| Tokens | signed by the runner with that test secret, test users `*@test.samadhan.local` only |
| Frontend under test | `next build` with `NEXT_PUBLIC_SAMADHAN_API_URL=http://localhost:4191/api`, served from `dist/` by a tiny static server on `localhost:3250` under `/apps/samadhan/` (and the redirect stub under `/apps/setu/`) |
| Storage (Phase 2) | local filesystem adapter in test mode only (pending the storage decision, Q-S1) |

Note: Windows port 4190 is reserved on this machine (connections fail) — use 4191+.

## B. Suites

### B.1 Static checks
- Frontend: `npm run typecheck`, `npm run build`, `npm run lint` (ESLint `next/core-web-vitals`, frontend devDependency only — new in Phase 1; existing code must pass or the rules are scoped so today's code passes without reformatting).
- Backend: `node --check` on every `backend/samadhan/**/*.js` + `backend/server.js`; a small script forbids a bare `setu.` in SQL outside the compatibility layer after Phase 1.
- 0 errors; new warnings fixed.

### B.2 Backend unit tests (`node --test backend/samadhan/tests/unit/*.test.js`, no DB)
Existing 9 tests kept, plus: subject parser with the `[MSFA-100123] [#100123]` form (still threads on `#100123`, never on
the prefix), env fallback `SAMADHAN_X` → `SETU_X`, schema-name resolution, classification rules (Phase 3), priority matrix
(Phase 4), regex validators (T-code, transport `^[A-Z][A-Z0-9]{2}K9\d{5}$`, IDoc 16 digits, SAP Note numeric).

### B.3 Backend API tests (`node --test backend/samadhan/tests/api/*.test.js`, local `samadhan_test`)
- Start from an **empty** DB → migrate up → seed → run → **down / up round-trip** at the end (data preserved).
- The existing `api.test.js` scenarios ported to `node:test` (kept 1:1, none dropped).
- **Access matrix**: for every route × {Agent, Supervisor, Admin, no grant, deactivated, bad token, purpose token} the
  expected status from DISCOVERY §6; from Phase 2 also every seeded profile and a scoped agent.
- **Rename compatibility** (Phase 1): every request run on `/api/samadhan/*` **and** `/api/setu/*` with identical bodies;
  `/api/setu` responses carry `Deprecation`; grant on `setu` or `samadhan` id both work (Option A); schema fallback when
  only `setu` exists; WhatsApp webhook GET/POST on both paths.
- Later phases: validation, scope filters in lists / counts / board / search / export / dashboards / analytics / insights /
  reports / bell, SLA (policy selection, pause/resume), severity and priority modes, classification, attachments
  (limits, blocked types incl. a renamed `.exe`, presigned expiry), approvals, transports, integrations (mocked).

### B.4 Regression / golden files
- **Daily report**: the JSON `{columns, rows}` of `GET /reports/daily?from=…&to=…` on a fixed seeded data set, saved as
  `backend/samadhan/tests/golden/daily-report.json` **before** any change (Phase 1, from the unchanged v6 code), and
  compared byte-for-byte after every step. Same for the generated `.xlsx` sheet XML (frontend `Reports.tsx` builder run in Node).
- Export (default columns), `/meta` (keys + `fields` + `categoryTree`), `/tickets/counts`, `/analytics` CSV: golden files;
  later phases may only **append** keys/columns.

### B.5 End-to-end UI (Playwright, frontend devDependency only)
- Headless Chromium; viewports 1366×768 and 360×740.
- Personas: Agent, Supervisor, Admin, scoped agent (one application, Phase 2+), portal requester (no login).
- Fails on any `console.error`, page error, or failed request (except deliberate 403 checks).
- Screenshots + traces on failure → `docs/v7/test-artifacts/` (git-ignored).
- Flows (flag OFF and ON from Phase 3): load, every nav screen, deep link `/apps/samadhan/?ticket=<id>` and the old
  `/apps/setu/?ticket=<id>` redirect, portal create/status, CSAT link old + new, new ticket incl. distributor lookup,
  properties save + `expectedUpdatedAt` 409, reply/note/forward, scenarios, merge, link, child, watch, spam/trash/restore/
  purge, bulk, saved views, export, daily report download, dashboard Customise, Helpdesk, Analytics CSV, bell, prefs,
  calls, time log, canned (shared + personal), Solutions, global search, Insights (mock AI), Admin tabs incl. Roles &
  access, Audit, Parked mail, keyboard shortcuts `/ N D T B ? w j k`; Agent typing `?screen=admin` or calling admin APIs → redirect + 403.

### B.6 Zero-impact check (§T2)
- Rebuild every embedded app + hub (`docs/v7/BASELINE.md` method), compare exit codes and output file counts.
- Shared-backend no-DB smoke (`docs/v7/BASELINE.md` §3): same status for every other app's route.
- Path guard: `git diff --name-only origin/main...HEAD` ⊆ allowed paths (§T2.1), checked by script.

### B.7 Performance (Phase 3+)
- Seed 100k tickets in `samadhan_test`; `EXPLAIN (ANALYZE, BUFFERS)` for list, counts, board, export, search with and
  without the scope filter; budget = baseline timing measured on the same data before the change (+10 %).

## C. Runner
One command, `npm run test:gate` in `embedded-apps/samadhan` (script added in Phase 1), runs B.1 → B.6 in order, writes
`docs/v7/TEST-REPORT.md` (counts per suite, fixes, known limitations) and exits non-zero on any failure.
