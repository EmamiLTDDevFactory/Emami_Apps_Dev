# setu -> samadhan rename: Phase 0 inventory (read-only)

Repo: `D:/OneDrive - Emami Limited/Desktop/Emami Apps Dev/Emami_Apps_Dev`, branch `feature/samadhan-v7`. No files modified. No `.env` values read (only checked `backend/.env` for SETU_* names: none present).

## 1. Counts

| | lines |
|---|---|
| `git grep -n -i setu` raw hits (tracked) | **1431** |
| False positives (setup, setUser(s), setUsage, setUnread, setUnit, setUint, setUploading..., SETUP_PATH, NamespaceSetUp, setuptools, actions/setup-node ...) | **260** |
| Real hits | **1171** |
| - backend/setu/ (owned) | 1025 |
| - embedded-apps/setu/ (owned) | 134 |
| - shared files | 12 (5 files) |

Filter used: content (not path) matches `(?i:setu)(?![a-zP])` (case-insensitive "setu", next char not a lowercase letter and not "P"). This drops setup/setUsage/setUnread/SETUP_ etc. and keeps setu, Setu, SETU_, useSetu, SetuContext, setuApiUrl, preSetu, `/setu`, `setu.`, `'setu'`.

Untracked/config checks:
- `.github/workflows/bom-cost-explorer.yml` only workflow; its hit is `actions/setup-node` (false positive).
- `amplify.yml`: 0 hits. `scripts/build-embedded-apps.js`: 0 hits (generic; folder name drives everything).
- `backend/.env.example`: 0 hits (SETU_* vars are NOT documented there). Other `.env.example` files: 0 real hits.
- No tracked web.config / Dockerfile / PM2 ecosystem. `embedded-apps/sap-agent/server/deploy/nginx-location.conf` unrelated.
- `backend/setu/deploy/*`: covered by git grep (owned, category a).
- Untracked `docs/` folder (repo root): `docs/SAMADHAN_MASTER_PROMPT_FINAL.md` (37 lines mention setu), `docs/v7/DISCOVERY.md` (24) - planning docs, not code.

## 2. (b) Shared files - exact lines that would change

### backend/server.js
- L70 `// Setu (Emami Secondary Support helpdesk: tickets, SLA on business hours, severity matrix, automations, M365 mailbox)` (comment)
- L71 `// — own setu schema, own routes under /setu, self-contained in the backend/setu/ folder. Access is the 'setu' grant; its role` (comment)
- L73 `// Isolated: if Setu ever failed to load, only /setu answers 503 - every other app on this backend is unaffected.` (comment)
- L75 `    apiRouter.use('/setu', require('./setu'));` (**mount path + require**)
- L77 `    console.error('[setu] failed to load, Setu is unavailable:', err.message);` (log)
- L78 `    apiRouter.use('/setu', (req, res) => res.status(503).json({ success: false, error: 'Samadhan is temporarily unavailable.' }));` (**fallback mount path**)
- L165 `const VALID_ROLES_BY_APP = { ..., 'setu': ['Agent', 'Supervisor', 'Admin'] };` (**Manage Access role list keyed by app id**)

### backend/notifications.js
- L27 `const APP_NAMES = { 'dev-tracker': 'Change Control Board & CR Tracker', setu: 'Samadhan' };` (display name for hub inbox / email, keyed by app id)

### hub-next/src/data/mockData.ts (the hub's app registry - code, not DB)
- L51 `  setu: '/apps/setu', // Samadhan (Emami Secondary Support helpdesk)` (EMBEDDED_APP_URLS: id -> URL)
- L81 `  { id: 'setu', name: 'Samadhan', desc: 'Emami Secondary Support helpdesk — ...', cat: 'IT', icon: LifeBuoy, uses: 0, stage: 'IAT' },` (RAW_APPS tile)

### hub-next/src/components/admin/adminShared.tsx
- L40 `  if (appId === 'setu') return ['Agent', 'Supervisor', 'Admin']; // Supervisor: daily report; Admin: Setu configuration` (Manage Access role dropdown)

### embedded-apps/access-tracker/src/lib/apps.ts
- L29 `  { id: 'setu', name: 'Samadhan', cat: 'IT' },` (Access Tracker's own app list)

No other shared file (amplify.yml, build script, env examples, workflows) references setu.

## 3. (a) Owned by Samadhan - grouped

Tracked files: 120 under backend/setu + embedded-apps/setu.

### Folder / package names
- `backend/setu/` (folder; `require('./setu')` from server.js)
- `embedded-apps/setu/` (folder; build script merges baseUrl-based output into `dist/apps/<folderName>/`, so folder name MUST equal basePath segment)
- `embedded-apps/setu/package.json` `"name": "setu"`, package-lock.json L2, L8 `"name": "setu"`
- `backend/setu/deploy/add-setu-nginx-route.sh` (file name)
- Server-side paths in deploy scripts: `~/setu-upload`, `~/setu-demo/`, `~/setu-mock/`, `setu-mock-data.json`, backup suffix `.bak-preSetu-<ts>`, `mv setu ...`, `rm -rf setu`

### API prefix `/api/setu` (and `/setu` route base) - 52 lines
- Code: `embedded-apps/setu/src/lib/api.ts:41` `` fetch(`${apiBase()}/setu${path}`...) ``, `:60` `` setuApiUrl = (path) => `${apiBase()}/setu${path}` ``; `backend/setu/lib/whatsapp.js:6` (comment, webhook `/api/setu/whatsapp/webhook`); `backend/setu/index.js:9,26`; tests `api.test.js:9,17` default `http://localhost:4100/api/setu`.
- Deploy: `add-setu-nginx-route.sh` (7: `location /dev-api/api/setu/`, `proxy_pass http://localhost:4001/api/setu/;`, curl check); `deploy-dev-server.sh` (5: injected server.js snippet with `apiRouter.use('/setu', require('./setu'))`, curl `/api/setu/me`).
- Docs: backend/setu/README.md (9), embedded-apps/setu/README.md (6), tests/README.md (4), deploy/README.md (3).

### Base path `/apps/setu` - 10 lines
- `embedded-apps/setu/next.config.mjs:7` `const basePath = '/apps/setu';` (also used as assetPrefix and NEXT_PUBLIC_BASE_PATH) + comment L2
- `backend/setu/lib/util.js:12` `const ticketLink = (id) => `/apps/setu/?ticket=${id}`;` (deep link in hub inbox + emails)
- `backend/setu/lib/ticketOps.js:195` `'csat.url': `${APP_URL}/apps/setu/portal/?csat=${token}`` (CSAT link in emails)
- READMEs (embedded 4, backend 1); hub-next/mockData.ts:51 (shared, above)

### SQL schema `setu.` - 821 lines, 37 files, ALL HARDCODED
There is no schema constant and no `search_path`; every query literally writes `setu.<table>`.
Distinct objects (45): setu.activities, agents, ai_insights, articles, attachments, audit_events, automation_rules, business_hours, call_logs, canned_responses, companies, contacts, conversations, csat_requests, csat_responses, distributors, email_templates, field_choices, field_definitions, group_members, groups, holidays, mail_state, mr_mappings, notifications, parked_mail, saved_views, scenarios, scheduled_jobs, settings, severity_rules, sla_policies, sla_policy_groups, sla_targets, ticket_id_seq (sequence), ticket_links, ticket_presence, ticket_statuses, ticket_watchers, tickets, time_logs, todos, variants (+ `demo.setu.local` email domain, not a table).
Per file: db/install.sql 236, db/schema.js 121, routes/admin.js 66, deploy/mock/load-mock.js 57, routes/work.js 39, routes/reports.js 38, lib/ticketOps.js 30, deploy/demo/load-demo.js 28, deploy/demo/load-pulsedesk.js 24, deploy/demo/remove-demo.js 21, lib/insights.js 19, routes/me.js 19, lib/tickets.js 17, routes/tickets.js 15, db/seed.js 14, routes/public.js 10, lib/mailIngest.js 8, lib/notify.js 8, lib/bell.js 6, lib/jobs.js 6, lib/queries.js 5, lib/whatsappIngest.js 5, lib/util.js 4 (incl. dynamic `UPDATE setu.${table}`), tests/api.test.js 4, lib/assignment.js 3, lib/canned.js 3, lib/sla.js 3, lib/businessHours.js 2, lib/ticketQuery.js 2, and 1 each in README.md, deploy-dev-server.sh, lib/automation.js, lib/config.js, lib/severity.js, middleware/auth.js, routes/jobs.js, (next.config.mjs comment `backend/setu.js`).
Note `nextval('setu.ticket_id_seq')` is baked into the tickets.id column DEFAULT in the live DB (schema.js:246, install.sql:214) - an `ALTER SCHEMA setu RENAME TO samadhan` updates that automatically (regclass reference), but schema.js `CREATE ... IF NOT EXISTS setu.*` would recreate an empty `setu` schema if code and DB are not switched together. db/schema.js is versioned (runs only when its version changes).

### Env vars (every distinct name)
Backend runtime: `SETU_MAIL_ENABLED`, `SETU_MAILBOX`, `SETU_AI_ENABLED`, `SETU_WHATSAPP_ENABLED`, `SETU_WHATSAPP_VERIFY_TOKEN`, `SETU_WHATSAPP_APP_SECRET`, `SETU_WHATSAPP_TOKEN`, `SETU_WHATSAPP_PHONE_NUMBER_ID`, `SETU_WHATSAPP_API_VERSION` (all in backend/setu/constants.js 42-51, ai.js:26).
Tests: `SETU_TEST_ALLOW`, `SETU_TEST_API`, `SETU_TEST_PG`, `SETU_TEST_AI`.
Deploy scripts: `SETU_APP_DIR`.
Frontend build-time: `NEXT_PUBLIC_SETU_API_URL` (api.ts:20).
Also shell var `$SETU` in deploy scripts (local). None of these are in backend/.env.example or in the local backend/.env (names checked only). They live on the dev server's backend .env / PM2 env (external).
Frontend also shows env names to users: App.tsx:267 tooltip "SETU_MAIL_ENABLED is off on the server...", admin/Channels.tsx:164 lists SETU_WHATSAPP_* names.

### Code identifiers (every distinct)
- `useSetu` (90 occurrences, hook; ~34 component files), `SetuContext` (6), `Setu` (TS interface in lib/context.ts:8, used App.tsx:6,133), `setuApiUrl` (3: api.ts:60, Channels.tsx:4,160)
- Backend: `APP_ID = 'setu'` (constants.js:3; used for auth grant check, hub notify appId, jobs)
- DOM custom events: `'setu:shortcuts'` (App.tsx:273, Shortcuts.tsx:44,45), `'setu:insert-reply'` (Insights.tsx:132 INSERT_REPLY_EVENT)
- Notification dedupe key: `refKey: `setu:${t.id}:${template}`` (notify.js:104, stored in emami_apps.notifications.ref_key)
- Demo data domain `DOMAIN = 'demo.setu.local'` (load-demo.js:28, load-pulsedesk.js:27; remove-demo finds demo rows by it)
- Test DB name `setu_test` (tests/README.md)

### localStorage / sessionStorage keys
None contain setu - already `samadhan.dashboard.days` (Dashboard.tsx:21), `samadhan.articleVotes` (Solutions.tsx:13, sessionStorage), `samadhan.exportColumns` (Tickets.tsx:37); hub keys `emami_apps_*`. Hub favorites (`@emami_hub/favorites`, FavoritesContext.tsx:6) store app ids -> a stored `'setu'` id would go stale if the app id changes.

### Job names / cache keys
No job name or cache key contains setu (jobs.js uses generic names; only log tags).

### Log tags `[setu]` - 19 owned lines
db/ready.js:7, lib/insights.js:221,365, lib/jobs.js:88-92 (4), lib/mail.js:23,35, lib/mailIngest.js:109, lib/util.js:49, lib/whatsapp.js:98,101, lib/whatsappIngest.js:42, middleware/auth.js:50, routes/public.js:191,194, deploy-dev-server.sh:45 (injected snippet), deploy/README.md. (+ shared server.js:77)

### User-visible strings containing "Setu"
The UI is already Samadhan (layout.tsx title 'Samadhan', 37 "Samadhan" mentions in src). Remaining "Setu"-visible strings:
- `embedded-apps/setu/package.json:5` description "Samadhan (Setu): ..." (not end-user)
- `embedded-apps/setu/README.md:1` "# Samadhan (internal name: Setu)" (doc)
- Operator-visible echo lines: add-setu-nginx-route.sh:17 "Setu route already present - nothing to do.", :60 "Setu via public URL -> ..."; deploy-dev-server.sh:32 "== 3. server.js: isolated Setu mount + Setu roles", :93 "Setu /api/setu/me -> ..."
- Test output: api.test.js / unit.test.js headers
- server.js:77 console log "Setu is unavailable" (server log, shared)
- Indirectly user-visible (not the word Setu, but `setu` in text the user sees): admin Channels webhook URL shown to admins `.../api/setu/whatsapp/webhook`; env var names in App.tsx:267 tooltip and Channels.tsx:164; email/inbox links `/apps/setu/?ticket=`, `/apps/setu/portal/?csat=`.
- Intentional legacy-migration strings that must NOT be renamed: install.sql:649-650 and schema.js:467-468 (`replace(body, 'Regards,<br>Setu – Emami Secondary Helpdesk', 'Regards,<br>Samadhan – ...')`), deploy-dev-server.sh:50 (`'Setu is temporarily unavailable.'` -> Samadhan), :63-64 (`setu: 'Setu Helpdesk'` -> `setu: 'Samadhan'`). These match OLD text on servers/DB; if rewritten blindly they break.
- No end-user UI string literally says "Setu".

### Comments
~70 lines of "Setu" in comments/docs (index.js header, ai.js, whatsapp.js, rateLimit.js, auth.js:18, jobs.js:22, format.ts:3, api.ts:2,25,59, types.ts:1, schema.js:447, install.sql:1-4, mock/demo headers, all READMEs).

## 4. Blocker check - does anything else depend on setu?

Verdict: **No code blocker.** Nothing outside the two owned folders imports from them or reads the `setu` schema, except the single mount in server.js.
- `require('./setu')`: only backend/server.js:75. No other `require('../setu')` / `from '...setu'` anywhere (mm-mdm `setupData` imports are false positives).
- `setu.<table>` SQL outside backend/setu: **none**.
- hub-next calls **no** `/api/setu/...` endpoint. NotificationBell.tsx uses `/api/me/notifications` (lib/notificationsApi.ts:22,33) and just navigates to the stored `n.link` (NotificationBell.tsx:56) - which for Samadhan rows is `/apps/setu/?ticket=N` stored in DB.
- Dependencies in the other direction (Samadhan -> shared, unaffected by rename): `../../db`, `../../ccbTeams` (graphToken, APP_URL), `../../notifications` (notify), `../../sessionAuth` (JWT_SECRET), `../../accessHistory` (admin.js:620).

Data (not code) keyed by the string 'setu' in OTHER schemas - these are the real coupling and need a DB data migration if the app id changes:
- `emami_apps.authorized_user_apps.app_id = 'setu'` (Manage Access grants + role) - read by middleware/auth.js, routes/admin.js (14 refs), hub Manage Access.
- `emami_apps.notifications` rows: `app_id='setu'`, `link='/apps/setu/?ticket=N'`, `ref_key='setu:...'`.
- `emami_apps.access_change_history` (app id in history entries, accessHistory.js).
- `emami_apps.events` (APP_OPEN app_id='setu' -> usage stats in AppDrawer / UserDrawer / access-tracker).
- `emami_apps.app_stages` (row with app_id 'setu' if a stage was set in Manage Access).
- Browser localStorage favorites/recent (`@emami_hub/favorites`) holding 'setu'.
Simplest de-risk: keep app id 'setu' for Manage Access/data and rename only folder/route/schema; or migrate all the rows above in one transaction.

## 5. hub-next files (requested) - what each reference is

| File | Real setu reference? | What it does |
|---|---|---|
| `app/(shell)/manage-access/page.tsx` | None (hits = setUsers/setUsage/setUserActive) | Generic; app list comes from mockData APPS, roles from adminShared.roleOptionsFor |
| `app/(shell)/settings/page.tsx` | None (setUploadingPhoto/setUploadError) | - |
| `components/NotificationBell.tsx` | None (setUnread) | Hub inbox; follows stored `link` (DB value `/apps/setu/?ticket=`) |
| `components/admin/AppDrawer.tsx` | None (setUsage/setUsageLoading) | Per-app usage from emami_apps.events by app id |
| `components/admin/UserDrawer.tsx` | None (setUserActive/setUserName/setUse...) | - |
| `components/admin/adminShared.tsx` | **L40** | Role list Agent/Supervisor/Admin for app id 'setu' |
| `context/AuthContext.tsx` | None (setUserEmail) | - |
| `data/mockData.ts` | **L51, L81** | THE hub app registry: EMBEDDED_APP_URLS `setu: '/apps/setu'` and the tile `{ id: 'setu', name: 'Samadhan', ..., stage: 'IAT' }` |
| `lib/accessApi.ts` | None (setUserName/setUserActive) | - |

App registry location: code only - `hub-next/src/data/mockData.ts` (EMBEDDED_APP_URLS L24-55, RAW_APPS L57-83, appById L118). No seed SQL for the app list; stage may be overridden from DB `emami_apps.app_stages`. Manage Access "seed" for setu: none in SQL - valid roles are code (`backend/server.js:165` VALID_ROLES_BY_APP, `hub-next adminShared.tsx:40`); grants are rows in `emami_apps.authorized_user_apps` created via Manage Access / Samadhan Admin > Roles & access (routes/admin.js ~617-620), and api.test.js:40 inserts test grants. Access Tracker keeps its own list (`embedded-apps/access-tracker/src/lib/apps.ts:29`).

## 6. Serving `/apps/<appId>` and redirect options

- `hub-next/src/app/apps/[appId]/page.tsx`: `generateStaticParams()` pre-renders one stub per APPS id AND per EMBEDDED_APP_URLS slug. The stub (`components/AppDetailClient.tsx`) checks access for `app.id`, then `window.location.replace(app.url)` (bare URL - **drops `location.search`, hash and any sub-path**).
- amplify.yml: hub export copied to `dist/` first, then `npm run build:embedded` overwrites `dist/apps/<folder>/` with the real app. So today `dist/apps/setu/index.html` is Samadhan's real page.
- Samadhan is a "baseUrl-based" Next export (no `dist/apps/` inside its dist; `scripts/rename-export.js` moves out/ -> dist/), merged to `dist/apps/<folderName>/` -> folder name must equal basePath segment `samadhan`. It has `portal/` + `_next/`, so it is NOT a pure SPA and is **not** listed in `.spa-apps.json` (that file only lists pure SPAs for the local `server/index.js` catch-all; Amplify needs manual rules). No dynamic `[id]` routes.
- build-embedded-apps.js deletes any `embedded-apps/<app>` folder not tracked in git (stale Amplify cache), so the old `embedded-apps/setu/dist` cache is cleaned up automatically after the rename.

Redirect `/apps/setu/*` -> `/apps/samadhan/*`:
- Via the hub stub alone: possible for `/apps/setu/` only if 'setu' is kept as an alias id/slug in generateStaticParams + appById, BUT the stub drops `?ticket=` / `?csat=` (would need a change to append `location.search`), and `/apps/setu/portal/?csat=...` has no file at all (only `dist/apps/setu/index.html` would exist) -> 404. Not sufficient by itself.
- Recommended: either (1) an Amplify Console redirect rule `/apps/setu/<*>` -> `/apps/samadhan/<*>` (301; configured externally in Amplify, not in amplify.yml - verify query string is carried), or (2) static redirect pages written at build time: `dist/apps/setu/index.html` and `dist/apps/setu/portal/index.html` (tiny JS: `location.replace(location.pathname.replace(/^\/apps\/setu/, '/apps/samadhan') + location.search + location.hash)`), e.g. a small `embedded-apps/setu-redirect`-style step or a post-merge step in build-embedded-apps.js. Option (2) keeps it in the repo and preserves ticket/CSAT links.
- Backend API: keep a temporary alias mount `apiRouter.use('/setu', require('./samadhan'))` alongside `/samadhan` so the Meta webhook and old clients keep working during cutover.

## 7. (c) Outside the code (configured externally)

- **Meta WhatsApp webhook URL**: `https://audit-capa-api.emamiapps.in[/dev-api]/api/setu/whatsapp/webhook` registered in the Meta app (shown in Admin > Channels via setuApiUrl). Must be re-registered or kept via alias route.
- **nginx on 172.17.2.21**: `/etc/nginx/sites-available/audit-capa-api.emamiapps.in.conf` has `location /dev-api/api/setu/ { proxy_pass http://localhost:4001/api/setu/; }` (added by add-setu-nginx-route.sh). New `/dev-api/api/samadhan/` block needed (and prod equivalent / API Gateway route if any).
- **Dev server filesystem / PM2**: backend folder `~/apps/emami-apps-hub-backend-dev/setu/`, PM2 process `emami-hub-backend-dev` (port 4001), upload dirs `~/setu-upload`, `~/setu-demo`, `~/setu-mock`; server.js/notifications.js on the server were patched in place by deploy-dev-server.sh.
- **Server env**: SETU_* variables in the backend .env / PM2 env on the server (names above).
- **Postgres**: schema `setu` (dev DB and any prod DB) + app-id rows in emami_apps.* tables (section 4). DB grants for the backend user on schema setu.
- **M365 / Graph**: mailbox `SETU_MAILBOX` (default emami.helpdesk@emamigroup.com) and Graph app permissions - not named setu, only the env var name changes. Email templates in `setu.email_templates` (DB data, already migrated to "Samadhan" signature).
- **Links already delivered**: emails / hub inbox with `/apps/setu/?ticket=N` deep links, CSAT emails `/apps/setu/portal/?csat=<token>`, requester portal link `/apps/setu/portal/` shared with distributors, user bookmarks, PWA shortcuts, hub favorites in localStorage.
- **Amplify Hosting**: any manual rewrite/redirect rules referencing `/apps/setu` (check console); Amplify cache of `embedded-apps/setu/dist` (auto-cleaned).
- **Anthropic / AI**: none setu-specific.
- DNS: none - no setu hostname exists (API host is audit-capa-api.emamiapps.in, hub dev.emamiapps.in).

---

## 8. Proposed rename map (Phase 1) and compatibility layer

Legend: **(a)** owned · **(b)** shared file, Samadhan line only · **(c)** outside the code → `RENAME-FOLLOWUPS.md`.

| # | Item | From | To | Class | Compatibility kept |
|---|---|---|---|---|---|
| 1 | Frontend folder | `embedded-apps/setu/` | `embedded-apps/samadhan/` (`git mv`) | a | New tiny **redirect stub** `embedded-apps/setu/` (see #6) |
| 2 | Frontend package name | `setu` (package.json, lock L2/L8) | `samadhan` | a | — |
| 3 | Backend folder | `backend/setu/` | `backend/samadhan/` (`git mv`) | a | — |
| 4 | Backend mount | `server.js:75,78` `'/setu'` | mount the same router at **both** `'/samadhan'` and `'/setu'` | b | `/api/setu` alias adds `Deprecation: true` + `Sunset` + `Link: </api/samadhan…>; rel="successor-version"` headers and logs caller (path, UA, no PII) at most once a minute per path. Kept ≥ «6 months» and until WhatsApp + integrations moved |
| 5 | Base path | `/apps/setu` (next.config, util.ticketLink, ticketOps CSAT url) | `/apps/samadhan` | a | — |
| 6 | Old URLs | `/apps/setu/…` | redirect to `/apps/samadhan/…` keeping path + `?query` + `#hash` | a | Static pages from the stub `embedded-apps/setu/` (own `package.json`, `build: node build.js`, zero deps — same pattern as `salescode`): `dist/index.html`, `dist/portal/index.html`, `dist/404.html` with `location.replace(pathname.replace(/^\/apps\/setu/,'/apps/samadhan')+search+hash)` and a `<noscript>`/meta-refresh fallback. Optional Amplify Console 301 rule as a follow-up (c) |
| 7 | DB schema | `setu` | `samadhan` | a | `SAMADHAN_DB_SCHEMA` constant (default `samadhan`); at start-up, if `samadhan` is missing but `setu` exists → use `setu` + warn. Migration v7.0 = `ALTER SCHEMA setu RENAME TO samadhan` (down: rename back). Pre-check `pg_proc` / `pg_views` / `pg_trigger` / column defaults for text references (`tickets.id` default is a regclass → follows the rename). The 821 hard-coded `setu.` strings become `${S}.` from the constant |
| 8 | Hub app id / grants | `'setu'` in `authorized_user_apps`, `VALID_ROLES_BY_APP`, `adminShared.tsx`, `mockData.ts`, `notifications.js APP_NAMES`, `access-tracker apps.ts` | `'samadhan'` | b + data | **Decision needed (Q-R1)** — see §9 |
| 9 | Env vars | `SETU_*` (9 runtime, 4 test, `SETU_APP_DIR`), `NEXT_PUBLIC_SETU_API_URL` | `SAMADHAN_*`, `NEXT_PUBLIC_SAMADHAN_API_URL` | a | One helper `env(name)` reads `SAMADHAN_<X>` then `SETU_<X>`. `.env.example`: add the new names (Samadhan lines only). Real `.env` never edited |
| 10 | Identifiers | `useSetu` (90), `SetuContext`, `Setu` type, `setuApiUrl`, DOM events `setu:shortcuts` / `setu:insert-reply` | `useSamadhan`, `SamadhanContext`, `Samadhan`, `samadhanApiUrl`, `samadhan:*` | a | Mechanical; DOM events are in-page only (no stored state) |
| 11 | Notification ref key | `setu:<id>:<template>` | `samadhan:<id>:<template>` | a | De-dupe lookups also match the old prefix |
| 12 | Log tags | `[setu]` (19 + server.js:77) | `[samadhan]` | a / b | — |
| 13 | Advisory lock | `hashtext('setu.scheduled_jobs')` | `hashtext('samadhan.scheduled_jobs')` | a | During the deploy window both copies could take different locks → old and new process might both run jobs once. Mitigation: take **both** locks in v7 (old name first) for the alias period |
| 14 | Deploy scripts | `add-setu-nginx-route.sh`, `~/setu-upload`, `.bak-preSetu-*`, `SETU_APP_DIR` | `samadhan` names | a | Old nginx block stays; new `/dev-api/api/samadhan/` block added by script (c: needs sudo run) |
| 15 | Demo domain / test DB | `demo.setu.local`, `setu_test` | `demo.samadhan.local`, `samadhan_test` | a | `remove-demo.js` removes both domains |
| 16 | Docs | READMEs | updated, "Formerly Setu" note | a | — |
| — | **Not renamed** | legacy migration strings `schema.js:467-468`, `install.sql:649-650`, `deploy-dev-server.sh:50,63-64` | unchanged | — | They match old text in existing data |

## 9. App id `'setu'` → `'samadhan'`: the one real decision (Q-R1)

The id is data in hub-owned tables, not just code: `emami_apps.authorized_user_apps` (grants + role), `notifications`
(`app_id`, `link`, `ref_key`), `access_change_history`, `events` (APP_OPEN usage), `app_stages`, and hub favourites in
each browser's localStorage.

**Option A — rename with aliases (recommended; matches §T1 "Access steps").**
1. v7.0 data step, one transaction, only `WHERE app_id='setu'`:
   `INSERT … SELECT … 'samadhan'` into `authorized_user_apps` (copy, not move) and `app_stages`; old `'setu'` grant rows
   **kept** during the transition (down script deletes the copies). History, events and old notifications are **not
   rewritten** (history stays true to what happened).
2. Backend guard accepts a grant on either id (prefers `samadhan`); Roles & access writes both while the alias lasts.
3. Shared lines: `VALID_ROLES_BY_APP` gets a `'samadhan'` entry (the `'setu'` one stays); `adminShared.tsx` accepts both;
   `mockData.ts` tile id → `samadhan`, URL `/apps/samadhan`, plus `setu` kept in `EMBEDDED_APP_URLS` as an alias slug;
   `notifications.js APP_NAMES` gets `samadhan: 'Samadhan'` (keeps `setu`); `access-tracker/src/lib/apps.ts` adds the id
   (**this is another app's source file** — one line; needs your OK under §T2).
4. Hub favourites holding `'setu'` resolve through the alias slug.
5. Later clean-up (after the alias period, not in v7): drop the `'setu'` grant copies.

**Option B — keep app id `'setu'`** (allowed by §B "keep that single item, record why"). Zero data migration, zero
change to other apps; Manage Access keeps showing the tile id `setu` internally (users only ever see "Samadhan").
Everything else is renamed.

Recommendation: **A**, unless you prefer not to touch `access-tracker` or hub data in Phase 1 — then **B**.
