# Samadhan v7 — Test report, Phase 1 (rename Setu → Samadhan + test harness)

Branch `feature/samadhan-v7` (local, not pushed). Gate commit: `a864fc7`. Machine: Windows 11, Node v26.13.0,
PostgreSQL 18 (throwaway cluster on localhost:55432), Microsoft Edge (Playwright 1.49.1).

## 1. Gate (`node backend/samadhan/tests/gate.js`, full run incl. E2E)

**Run 5, 2026-11-06: GREEN — 23 of 23 passed in 14 min.** Raw: `docs/v7/test-artifacts/gate-last.json` / `gate-last.log` (git-ignored).

| # | Step | Result |
|---|---|---|
| 1 | Frontend typecheck | pass, 0 errors |
| 2 | Frontend lint | pass, 0 errors, 2 warnings (= pre-existing baseline budget) |
| 3 | Frontend production build | pass |
| 4 | Backend syntax (`node --check`) | pass, 53 files |
| 5 | Samadhan unit + rename tests | **15 / 15** |
| 6 | Shared backend tests (`backend && npm test`) | **40 / 40** (= baseline) |
| 7 | API suite, new path `/api/samadhan`, grants under `samadhan` | **130 / 130** |
| 8 | API suite, old path `/api/setu`, grants under `setu` (compatibility) | **130 / 130** |
| 9 | Golden daily report + export, new database | byte-identical |
| 10 | Golden, v6 database before the rename (legacy schema `setu`) | byte-identical |
| 11–17 | Migration `7.0-rename`: up → golden → down → golden → up → golden (round trip on `upg_test`), down on `legacy_test` | all pass, golden byte-identical after each step |
| 18 | API suite, legacy schema `setu` (rename not run yet), old grants | **130 / 130** |
| 19 | Zero-impact no-DB smoke of every app route | 18 routes = `BASELINE.md` §3; `/api/samadhan/*` = `/api/setu/*` |
| 20 | E2E build (API → local test backend) | pass |
| 21 | Redirect stub build (`embedded-apps/setu`) | pass |
| 22 | E2E (Playwright, Edge, desktop 1366 px + phone 360 px) | **19 passed, 1 skipped** (see below) |
| 23 | Path guard (changes only in allowed paths) | pass, 164 files |

E2E flows, each on desktop and 360 px: every menu screen per role (Agent, Supervisor, Admin) with the menu matching
the role; deep link `/apps/samadhan/?ticket=<id>`; old link `/apps/setu/?ticket=<id>` forwards; portal create + status;
old portal link forwards; old CSAT link forwards and shows the survey; Agent has no Admin menu and the Admin API
answers 403 on both paths; keyboard `?` opens the shortcut list.
The one skip is by design, not a weakened test: the keyboard-shortcut test does not apply to the phone layout
(`test.skip(width < 1024, 'no keyboard on the phone layout')`); it passes on desktop.

## 2. Zero-impact check (§T2)

- Shared-backend no-DB smoke: every other app's route returns the same status as before (gate step 19).
- Path guard: every change is in a Samadhan-owned path or one of the listed shared lines (gate step 23; list in
  `PROGRESS.md` → "Shared-file changes").
- Frontends: `hub-next` is the only other frontend with a changed file (2 lines). Every other embedded app is
  byte-identical to `origin/main`, so a build on this branch is also its baseline.

**Rebuild of every app (2026-11-06, one at a time, no `CI=true`, existing `node_modules` reused when complete):
stopped by Claude Code for low memory after 14 of 26 projects, during `market-rate` (Expo/Metro bundle). Not a build failure.**

| Project | Install | Build | Output files | Baseline (BASELINE.md §1) | Same? |
|---|---|---|---|---|---|
| hub-next | existing | ✔ 89 s | 148 | ✔ 146 | ✔ expected +2: `apps/samadhan/index.html` + `index.txt` (the hub prerenders one page per app URL; the tile URL is now `/apps/samadhan`; `apps/setu` is still generated) |
| access-tracker | existing | ✔ 65 s | 22 | ✔ 22 | ✔ |
| audit-capa | existing | ✔ 145 s | 18 | ✖ only with `CI=true` | ✔ (passes without `CI=true`, Q-B1) |
| audit-tool | existing | ✔ 69 s | 144 | ✔ 144 | ✔ |
| bom-cost-explorer | existing | ✔ 95 s | 138 | ✔ 138 | ✔ |
| cascade-pricing | ✖ EALLOWREMOTE | — | — | ✖ EALLOWREMOTE | ✔ same (environment: remote `xlsx` tarball) |
| cashflow-forecast | existing | ✔ 47 s | 21 | not run | source = `origin/main` |
| credit-risk-advisory | ✔ 147 s | ✔ 48 s | 21 | not run | source = `origin/main` |
| dev-tracker | existing | ✔ 8 s | 49 | ✔ 49 | ✔ |
| dispatch-tracker | ✔ 166 s | ✔ 54 s | 38 | not run | source = `origin/main` |
| expense | ✖ EALLOWREMOTE | — | — | not run | same environment issue as cascade-pricing (remote `xlsx` tarball); source = `origin/main` |
| fm-po-deviation | ✔ 94 s | ✔ 49 s | 30 | not run | source = `origin/main` |
| gate-entry | ✔ 114 s | ✔ 94 s | 22 | not run | source = `origin/main` |
| journal-anomaly-agent | ✔ 171 s | ✔ 79 s | 21 | not run | source = `origin/main` |
| market-rate, mediclaim, mm-mdm, mouldhealthcheck, payment-tracking, po-followup, rate-auction, rc-portal, salescode, sap-agent, shelf-life-deviation, term-policy, timesheet | not run (stopped) | | | | source = `origin/main` |

Every built project matches its baseline or, where no baseline exists, builds cleanly. Script:
`zero-impact-builds.js` (session scratchpad; same method as `baseline-builds.js`).

## 3. Fixed during Phase 1 (test harness and gate, not Samadhan behaviour)

| Problem | Cause | Fix |
|---|---|---|
| `jobs/run via internal secret` failed 129/130 in gate run 2 | the gate started the backend with a scheduler secret other than the documented `localtest` the suite sends | gate uses `localtest`; test unchanged |
| Gate runs 2 and 4 stopped during E2E | machine low on memory (15.7 GB, ~3–4 GB free) | run 5 had enough free memory; no code change |
| Test Postgres hung in crash recovery after an unclean stop | throwaway cluster stopped by the low-memory kill | gate waits up to 5 min, then restarts it once (`pg_ctl`, log in `server.log`) |
| First E2E test timed out on the spinner (cold backend: `/me` 6.7 s) | backend idle during the 1-min E2E build | gate warms up `/me` and `/meta` per persona before Playwright |
| A failing step could show only as "n of m failed" | some steps were recorded without printing | every result goes through one `record()` that prints PASS/FAIL |
| Golden files | fixture rows lacked `lastActivityAt` (rows made by the app always have it) | fixture fixed, golden re-captured from the v6 code (`9090e09`) |

## 4. Known limitations

- None for Samadhan code.
- Zero-impact rebuild incomplete: 13 apps not built yet (low memory on this machine). Their source is byte-identical
  to `origin/main` (path guard), so this branch cannot change their build; building them is still required by §T2 before the push.
- TEST-PLAN §C says the gate writes this report itself; it writes `gate-last.json`/`.log` instead and this file is
  written from them. Planned for Phase 2.
- Environment (pre-existing, not caused by this branch; see `BASELINE.md`): `cascade-pricing` needs npm to allow its
  remote `xlsx` tarball; `audit-capa` fails only with `CI=true`; `expense` has the same remote-`xlsx` issue as `cascade-pricing`.
