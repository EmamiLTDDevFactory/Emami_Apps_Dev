# Samadhan v7 — Progress

Resume here in a new session: read this file and `docs/SAMADHAN_MASTER_PROMPT_FINAL.md`, then continue at **Next**.

## Status

| Phase | State |
|---|---|
| C (working agreement) | done |
| 0 (discovery, baseline, plan) | done — **approved 2026-11-05** ("approved", no individual answers) |
| 1 (rename + harness) | in progress |
| 2 – 9 | not started |

### Decisions taken at the Phase-0 STOP (approval without individual answers → recommended options)
- Q-R1 **Option A** (app id `samadhan`, `setu` kept as alias; one line in access-tracker). Q-R2 redirect stub
  `embedded-apps/setu/` (Amplify rule optional, follow-up). Q-R3 alias «6 months».
- Q-G1 `main` only (no `dev`). Q-G2 direct `--no-ff` merge (no `gh`). Q-G4 quoted camelCase columns.
- Q-B1 remaining baseline builds re-run one at a time, without `CI=true` (Amplify-like plain env), for before/after comparison.
- Q-E1 solved without your password: a separate throwaway Postgres cluster (`initdb`, trust auth, localhost only,
  port 55432) in `%LOCALAPPDATA%\samadhan-test-pg`, using the installed PostgreSQL 18 binaries. The existing service on 5432 is not touched.
- **Still open** (needed later, not for Phase 1): Q-D1 (confirm dev DB is not prod; Phase 3), Q-S1 storage (Phase 2),
  Q-G3 (does Amplify publish prod from `main`? asked again before the first merge), Q-M1–M6 (Phase 3), Q-P1 (Phase 2).
- Pushes: still asked for every time (standing rule).

Branch: `feature/samadhan-v7` (local only, not pushed; created from `origin/main` @ `4e8a551`; upstream unset on purpose).
Commits: Phase 0 docs are committed locally once you approve (see "Next").

## Done

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

1. On "approved" (with answers): commit Phase 0 docs (`samadhan(v7-phase0): discovery, baseline, rename inventory, plan`),
   run Q-D1 queries if allowed and fill APP-MAPPING counts.
2. Phase 1: golden daily-report file from the unchanged v6 code on `samadhan_test`; test harness; then the rename.

## How to verify Phase 0
- Read the docs in `docs/v7/`. `git status` shows only new docs + `embedded-apps/setu/CLAUDE.md`; no code changed.

## Test status
Baseline only (BASELINE.md). No code changed, so no gate run yet.

## Shared-file changes
None yet.
