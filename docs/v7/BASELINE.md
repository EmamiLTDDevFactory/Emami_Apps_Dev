# Samadhan v7 — Baseline (before any change)

Taken 2026-11-05 on `feature/samadhan-v7` = `origin/main` @ `4e8a551`, Node v26.13.0, npm 12.0.1, Windows 11.
This is the reference for the zero-impact check (§T2). **Status: partial** — see §1.

## 1. Builds of every embedded app and the hub

Method (`baseline-builds.js`, scratchpad): per project `npm ci --legacy-peer-deps` (never rewrites lockfiles; fallback
`npm install --package-lock=false`), then `npm run build`, 3 at a time, env `CI=true`, own `TMPDIR`.

The run was **stopped by Claude Code because the machine ran low on memory** after 7 of 28 projects. This was not a
build failure. It was not restarted. The remaining 21 need a re-run, ideally 1–2 at a time (`node baseline-builds.js
<repo> <out.json> 1`), when you say so.

| Project | Install | Build | Output files | Note |
|---|---|---|---|---|
| hub-next | ✔ 800 s | ✔ 89 s | 146 (`out/`) | |
| access-tracker | ✔ 799 s | ✔ 88 s | 22 | |
| audit-tool | ✔ 211 s | ✔ 88 s | 144 | |
| bom-cost-explorer | ✔ 228 s | ✔ 150 s | 138 | |
| dev-tracker | ✔ 26 s | ✔ 9 s | 49 | |
| audit-capa | ✔ 1170 s | ✖ exit 1 | 18 (partial) | **environment**: with `CI=true`, react-scripts turns existing `no-unused-vars` warnings into errors. Pre-existing; untouched code. Re-run without `CI=true` to compare like for like |
| cascade-pricing | ✖ exit 1 | — | — | **environment**: local npm config refuses remote tarballs (`EALLOWREMOTE`, `xlsx@https://cdn.sheetjs.com/…`). Pre-existing |
| cashflow-forecast, credit-risk-advisory, dispatch-tracker | started, not finished | | | killed |
| expense, fm-po-deviation, gate-entry, journal-anomaly-agent, market-rate, mediclaim, mm-mdm, mouldhealthcheck, payment-tracking, po-followup, rate-auction, rc-portal, salescode, sap-agent, setu (Samadhan), shelf-life-deviation, term-policy, timesheet | not run | | | |

Installs are slow because the repo is inside OneDrive (about 13 min for a Next.js app).
The working tree stayed clean: `dist/`, `out/` and `node_modules/` are git-ignored.

## 2. Backend tests

| Suite | Command | Result |
|---|---|---|
| Shared backend | `cd backend && npm test` (`backend/test/*.test.js`) | **40 / 40 pass** |
| Samadhan unit | `node --test backend/setu/tests/unit.test.js` | **9 / 9 pass** |
| Samadhan API | `backend/setu/tests/api.test.js` | not run: needs the local test DB (Q-E1) |

## 3. Backend start-up smoke (no database)

`smoke-backend.js` (scratchpad) starts `node backend/server.js` on port 4191 with `PGHOST=127.0.0.1 PGPORT=1`, so **no
real database is touched**. Mail, WhatsApp and AI are off. Every module logs its own "schema init failed: ECONNREFUSED"
and keeps serving. Port 4190 cannot be used on this machine (connections fail).

| Route | Status |
|---|---|
| GET /api/health | 200 |
| GET /api/access/me | 400 |
| GET /api/admin/apps | 401 |
| GET /api/me/notifications | 401 |
| GET /api/dev-tracker/ | 404 |
| GET /api/salescode/ | 404 |
| GET /api/change-control/ | 401 |
| GET /api/me/cost-watch | 401 |
| GET /api/me/cascade-pricing | 401 |
| GET /api/me/mm-mdm | 401 |
| GET /api/setu/me | 401 |
| GET /api/setu/meta | 401 |
| GET /api/setu/whatsapp/webhook | 403 |
| POST /api/setu/jobs/run | 403 |

After Phase 1 the same table must match, with `/api/samadhan/*` added (same statuses) and `/api/setu/*` unchanged.

## 4. Not yet captured (Phase 1, before the first code change)
- Golden daily report (`/reports/daily` JSON + sheet XML), export, `/meta`, counts on a seeded `samadhan_test` (needs Q-E1).
- Frontend `typecheck` / `build` for Samadhan (in the unfinished build run).
