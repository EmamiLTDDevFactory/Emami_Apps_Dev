# Samadhan v7 — Plan

Inputs: `DISCOVERY.md`, `RENAME-INVENTORY.md`, `APP-MAPPING.md`, `TEST-PLAN.md`, master prompt §H–§W.
Everything is additive; nothing is removed (§F.1). Defaults in «» can be changed at this STOP.

## 1. Branches and CI (§G.6, §T3)

- **No `dev` branch exists.** Integration branch = `main`. Merges go `feature/samadhan-v7` → `main` only (unless you
  want a `dev` branch created — Q-G1).
- Branch protection on `main` cannot be checked: the GitHub CLI (`gh`) is **not installed** on this machine. Other
  people's work lands through PRs (#79, #80); earlier Samadhan work was merged directly. Without `gh`, §T3.4's
  "otherwise" path applies: `git merge --no-ff feature/samadhan-v7`, re-run the gate on `main`, `git push origin main`.
  If you want PRs instead, install `gh` and run `gh auth login` yourself (Q-G2).
- **What a push to `main` does**: AWS Amplify (`amplify.yml`) rebuilds the hub site = hub-next + every embedded app,
  deployed to **dev.emamiapps.in**. No backend deploy, no DB migration, no GitHub Actions run for Samadhan (the only
  workflow is path-filtered to bom-cost-explorer). Whether the same Amplify app also publishes the **production** hub
  from `main` is not visible in the repo → **Q-G3**. Per §T3.2, if it does, I push the feature branch only and stop.
- The backend is deployed **manually** to the dev server (`backend/setu/deploy/deploy-dev-server.sh`, PM2
  `emami-hub-backend-dev`). Note that script patches the server's copy of `server.js` / `notifications.js` in place.
  Phase 1's backend rename changes the mount, so the frontend (Amplify, `/api/samadhan`) and backend (manual) must be
  deployed in the right order → the frontend falls back to `/api/setu` if `/api/samadhan` answers 404 (one retry, cached),
  so either order works.
- Your standing rule (memory): **I ask before every push**, even when the gate is green. §T3 authorises the push; I will
  still show what would be pushed and wait for your "yes".

## 2. Migration mechanism v7 (Phase 1)

Today: `SCHEMA_VERSION` + `upgradeVn()` in `db/schema.js`, no down, no transaction, schema name hard-coded.

v7 adds `backend/samadhan/db/migrations/` with one module per step:

```
v7_0_rename.js        up: ALTER SCHEMA setu RENAME TO samadhan (+ grants, default privileges)    down: rename back
v7_1_workspaces.js    …                                                                           down: DROP only objects v7.1 created
```

- Each `{ id, up(client, S), down(client, S) }` runs inside `BEGIN … COMMIT` with `SET LOCAL lock_timeout = '5s'`.
- Applied ids stored in `<schema>.schema_migrations(id, applied_at, checksum)`; `settings['schema.version']` becomes `7.x`
  for display. The v1–v6 `initSchema()` path is kept as is (it is the base for a fresh DB) and runs first.
- `S` = `SAMADHAN_DB_SCHEMA` (default `samadhan`) with the start-up fallback to `setu` (RENAME-INVENTORY §8 #7).
- Down scripts only drop what that step created (new tables / columns / indexes / seeded rows tagged `seed_key`);
  never existing data. Tested by the up → down → up round-trip in the API suite.
- Rules: `IF NOT EXISTS`, nullable/defaulted columns, backfill, then constraints (`NOT VALID` + `VALIDATE`).

## 3. Phase split (refines §U)

| Phase | Content | Gate / stop |
|---|---|---|
| **1** | Rename (RENAME-INVENTORY §8) with aliases + redirect stub; migration framework; `SAMADHAN_*` env fallback; test harness (local `samadhan_test`, node:test API suite, golden daily report, Playwright, ESLint, gate runner); `RENAME-FOLLOWUPS.md`. **No feature change.** | gate → push → **STOP** |
| **2** | Permission catalogue + profiles + `requirePermission` on every route + SQL scope filter + `/me.permissions` + `can()` + screen guard + Authorization cockpit (6 tabs); **attachments** (needs Q-S1) | gate → push → **STOP** |
| **3** | v7.1 workspaces, applications, `APPCODE-id`, flag `workspaces.enabled` (off), backfill per approved APP-MAPPING, meta `byWorkspace`, switcher, workspace-aware fields / tree / severity / SLA / groups / statuses / canned / scenarios / views, filters, single-mailbox classification | gate → push → **STOP** |
| 4 | SAP workspace: details table, ref masters, Impact × Urgency, new-ticket flow, paste parser, external refs, seeds | gate → push |
| 5 | Infra & IT + Digital Apps + 2 new sales sub-categories, details, seeds, portal application picker | gate → push |
| 6 | Approvals, catalog, transports, change calendar, SoD, registers | gate → push |
| 7 | Problem, major incident, PIR, detection, KEDB, dashboards | gate → push |
| 8 | S/4HANA Programme | gate → push |
| 9 | Integrations (Cloud ALM, monitoring, Teams, SolMan import), Assist, analytics extras | gate → push → final report |

## 4. Migrations by phase (summary)

- **v7.0** (P1): schema rename; `schema_migrations`; hub grant copy `setu`→`samadhan` (Option A, only `WHERE app_id='setu'`).
- **v7.1** (P2): `auth_profiles`, `auth_profile_permissions`, `auth_user_profiles`, `auth_user_scope`,
  `auth_permission_overrides`, `auth_change_log`; seed 3 system + 8 custom profiles; settings `attachments.*`;
  `ticket_attachments` (the unused v1 `attachments` table is kept, untouched); `tickets.attachment_count`.
- **v7.2** (P3): `workspaces`, `applications`, `priority_matrix`, `status_workspaces`, `field_workspaces`,
  `field_definitions.storage`, `field_choices.workspace_id/meta`, `workspace_id` on groups / sla_policies / severity_rules /
  canned / scenarios / automation_rules / articles / email_templates / saved_views, `application_id` on sla_policies /
  automation_rules; `tickets.workspace_id, application_id, record_class, classification_source, classification_confidence,
  impact, urgency, custom`; mail classification tables (sender rules, learning); backfill; then `application_id NOT NULL`.
- **v7.3+** (P4–P9): detail tables, ref masters, transports, approvals, catalog, external refs, PIR, change windows,
  remaining ticket columns (§I), indexes (§I "Indexes").

Column naming follows the existing convention: **quoted camelCase** (`"workspaceId"`, `"applicationId"`) rather than the
snake_case in §I, so new columns look like the existing ones. New tables use the §I names. (Deviation noted — Q-G4.)

## 5. API and frontend changes (by phase)

Per §M / §N. Highlights where Phase 0 changed the approach:

- **Reference in email subjects**: `Re: <subject> [MSFA-100123] [#100123]` — prefix before the kept token (DISCOVERY §5);
  setting `ref.prefixInSubject` (default on) can turn it off; body always carries the reference.
- **Screen guard** (§N.1) is new: today a non-Admin is only kept out of Admin by the hidden nav + API 403.
- `/meta` already sends all agents (names, emails, roles) to every agent — needed for assignment; kept. Admin-only data
  (settings internals) is not in `/meta` today; stays out.
- Global search / list search accept `MSFA-100123` (strip `^[A-Z0-9]{2,8}-`, then today's numeric logic).

## 6. Attachments storage — **no object storage exists** (§L STOP item, Q-S1)

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. AWS S3** (recommended if the backend is allowed AWS creds) | private bucket `emami-samadhan-<env>`, SSE-S3/KMS, presigned PUT/GET 5 min; add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (exact versions) to `backend/package.json` (additions only) | matches §L exactly; Amplify/Lambda already AWS | new bucket + IAM user/role by your cloud team; one shared-package addition |
| B. Azure Blob | private container, SAS URLs 5 min; `@azure/storage-blob` | same as A on Azure | same as A |
| C. Server filesystem (dev server disk, e.g. `/home/emamiadmin/samadhan-files`), streamed through the backend with short-lived signed tokens | no new cloud resource, no new package | not object storage; no SSE (needs disk encryption); breaks if the backend runs as several copies / Lambda; backups by you |

Until decided, Phase 2 builds a `storage` adapter interface + a `local` adapter used in tests; the production adapter is
chosen by `SAMADHAN_STORAGE=s3|azure|fs`. Nothing is stored in Postgres.

## 7. Permission catalogue — baseline mapping (§9.2; reproduces today exactly)

✔ = granted in the seeded system profile. Keys marked *new* guard features that do not exist yet; their default is my
proposal (Q-P1). Two keys are **added** to §9.2 because today's code has checks they would otherwise not cover:
`company.create` (POST /companies is Supervisor+) and `insights.refresh` (dashboard refresh is Supervisor+).

| Key | AGENT | SUPERVISOR | ADMIN | Today's source |
|---|---|---|---|---|
| screen.dashboard / helpdesk / tickets / board / newTicket / contacts / solutions | ✔ | ✔ | ✔ | NAV (no `show`) |
| screen.analytics, screen.reports | — | ✔ | ✔ | NAV `s.sup`; `/analytics`, `/reports/daily` requireSupervisor |
| screen.changeCalendar, screen.approvals *(new)* | ✔ | ✔ | ✔ | — |
| ticket.view / create / edit / reply / note / forward / assign / bulk / merge / link / child / spam / trash | ✔ | ✔ | ✔ | no role check |
| ticket.purge | — | — | ✔ | tickets.js:232 isAdmin |
| ticket.export | — | ✔ | ✔ | tickets.js:69 requireSupervisor |
| ticket.changeApplication *(new)* | ✔ | ✔ | ✔ | — |
| ticket.moveWorkspace, ticket.overridePriority, ticket.declareMajor, ticket.setConfidential, ticket.pir.edit *(new)* | — | ✔ | ✔ | — (manual priority is open to Agents today → `ticket.edit` keeps covering it; `overridePriority` applies only to matrix-derived priority, new) |
| ticket.viewConfidential *(new)* | — | ✔ | ✔ | — |
| ticket.classify *(new)* | ✔ | ✔ | ✔ | — |
| attachment.upload / download *(new, on by default §F.3)* | ✔ | ✔ | ✔ | — |
| attachment.delete *(new)* | own uploads | ✔ | ✔ | — |
| transport.manage, externalRef.manage, problem.manage, change.schedule *(new)* | ✔ | ✔ | ✔ | — |
| approval.decide, approval.override, change.freezeOverride *(new)* | — | — | ✔ (+ Approver/CAB profile) | — |
| article.edit, article.publish | — | ✔ | ✔ | work.js:317, 346 requireSupervisor |
| (drafts visible in Solutions / search) | — | ✔ | ✔ | work.js:165, 293, 310 → covered by `article.edit` |
| canned.personal | ✔ | ✔ | ✔ | me.js /me/canned |
| canned.shared.manage | — | — | ✔ | admin.js /canned |
| scenario.run | ✔ | ✔ | ✔ | tickets.js:294 |
| views.share, report.variants.share | — | ✔ | ✔ | work.js:79, 121 |
| (delete others' views / variants) | — | — | ✔ | work.js:94, 144 isAdmin → `admin.general` |
| insights.dashboard, insights.ticket, insights.ai | ✔ | ✔ | ✔ | insights.js |
| insights.refresh *(added)* | — | ✔ | ✔ | insights.js:12 |
| contact.edit | ✔ | ✔ | ✔ | work.js:219 (no check) |
| company.create *(added)* | — | ✔ | ✔ | work.js:268 |
| contact.anonymize | — | — | ✔ | admin.js /contacts/anonymize |
| admin.* (21 keys incl. admin.authorization, admin.jobs) | — | — | ✔ locked | admin.js:17; jobs.js:31 |

Seeded custom profiles (§9.4.2) start as copies of AGENT or SUPERVISOR with scope presets; e.g. *Sales Apps Agent* =
AGENT scoped to SEC_SALES; *Auditor* = view-only keys + `screen.analytics/reports` without `ticket.edit`.

## 8. Seeds (§O)

Append-only, idempotent, each row tagged `seed_key` so the down script removes exactly what it inserted. SEC_SALES choices
are never altered except `meta.recordClass = 'INCIDENT'` on existing type choices. Sales sub-categories: only
**Attendance / GPS** and **App Crash / Performance** are new (DISCOVERY §9.1).

## 9. Risks

| Risk | Mitigation |
|---|---|
| Frontend (Amplify) and backend (manual) deployed at different times after the rename | `/api/setu` alias + frontend fallback; schema-name fallback; both job locks taken |
| `build-embedded-apps.js` deletes untracked app folders | commit the `git mv` before any local hub build |
| Old deep / CSAT links in sent emails | redirect stub at `/apps/setu/` incl. `portal/` and `404.html`, query + hash kept; Playwright test |
| App-id change breaks Manage Access / usage stats | Option A copies grants, keeps old rows; guard accepts both |
| Permission refactor changes behaviour | baseline profiles + old-vs-new access test for every route and screen before any `can()` replacement |
| 821 hard-coded `setu.` strings | mechanical replacement to `${S}.` + a lint check that fails on any new bare `setu.`/`samadhan.` literal in SQL |
| No object storage | Q-S1; adapter interface; Phase 2 attachments blocked until chosen |
| Local test DB password missing | Q-E1 |
| OneDrive path makes `npm ci` slow (~13 min per app) | gate runs builds in parallel; caches `node_modules` between runs |
| Daily report byte-identity | golden file captured from v6 code before Phase 1 changes |
| Shared-file edits | only the lines listed in RENAME-INVENTORY §2 / §8; each diff listed in PROGRESS.md |
