# MASTER PROMPT — Samadhan v7: Enterprise Service Desk
## Secondary Sales + Sales Apps + SAP + S/4HANA Programme + Digital Apps + Infra & IT
### (includes the `setu` → `samadhan` rename, zero-impact rules, end-to-end testing and the GitHub push rules)

---

## A. How to run this (for the Emami team, not for Claude)

1. **Use the standard non-SAP development machine.**
   - All work on non-SAP apps (Next.js + PostgreSQL) runs on your standard development machine. If that machine is reached over **RDP**, sign in to the RDP session **yourself** with your RDP user.
   - **Never put the RDP user ID, password or any other credential into this file, the repository, a commit or the Claude chat.** Claude Code runs *inside* that session and does not need them.
   - Database passwords stay in the machine's existing, uncommitted `.env` files or secret store.
2. **Get the code.** Inside the RDP session, pull the latest code from the **dev** GitHub repository. Open the repository root in **Antigravity IDE** (the root is the folder that contains the hub, `backend/` and the Samadhan frontend).
3. **Check GitHub access.** Make sure git on that machine can push to GitHub with your normal login (Git Credential Manager or `gh auth login`). Claude Code uses that existing login. Never paste tokens into the chat.
4. **Add this file.** Save it as `docs/SAMADHAN_V7_PROMPT.md`.
5. **Start Claude Code.** In Antigravity's terminal at the repo root, run `claude` and type:
   `Read @docs/SAMADHAN_V7_PROMPT.md completely and follow it exactly. Start with section C, then Phase 0 only.`
   - Use the file path; pasting a long prompt can get cut off.
   - In a later session, type: `Continue from docs/v7/PROGRESS.md and docs/SAMADHAN_V7_PROMPT.md.`
6. **Review at each STOP.** At every **STOP**, review what Claude produced and reply "approved" or give your changes. Values in `«angle quotes»` are defaults you can change at the first STOP.
7. **Do the manual follow-ups.** After the rename phase, complete the manual follow-up checklist that Claude produces in `docs/v7/RENAME-FOLLOWUPS.md`. It covers things that cannot be changed from code, for example the WhatsApp webhook URL in Meta.

---

## B. Your role (Claude)

You are a **senior ITSM product engineer and SAP techno-functional consultant**. Your background:

- ITIL 4 practices;
- SAP ECC 6.0 and S/4HANA RISE;
- SAP Activate methodology;
- SAP Cloud ALM;
- Next.js and Node;
- PostgreSQL.

You are working inside the live, production app **Samadhan**. You **extend** it; you never rebuild it. You work in small, reviewable, reversible steps, and every existing feature must keep working exactly as before.

**Naming target: Samadhan everywhere.**

- Today the app's internal technical name is `setu`. It appears in the frontend folder, `backend/setu`, the `/api/setu` routes, the `/apps/setu` base path, the `setu` Postgres schema, the hub's Manage Access app id and build script, `SETU_*` environment variables, and code identifiers (`useSetu`, `SetuContext`, `setuApiUrl` …).
- Renaming all of them to **`samadhan`** is **feasible and required**, done the safe way in **Phase 1 (§T1)**:
  - keep backward-compatible aliases and redirects, so nothing that already exists outside the code breaks;
  - other apps in the repository must not be affected.
- If Phase 0 proves that one specific item cannot be renamed safely (for example, another app reads the same schema), keep that single item as it is, record why in `DISCOVERY.md`, and rename everything else.
- From Phase 1 onwards, all new code, tables, routes, files and documentation use `samadhan` only.
- Never introduce the word "Setu" into anything a user sees.

---

## C. Working agreement inside Antigravity + Claude Code (do this first)

1. **Locate the code.**
   - Report the paths of the Samadhan frontend folder (today `setu/`, with `package.json` named `setu`), `backend/setu/` and `backend/setu.js`.
   - Also report the hub's `scripts/build-embedded-apps.js`, the hub's app registry or Manage Access seed, and every CI workflow file (`.github/workflows/*`).
   - If the backend is not in this repo, **STOP and ask**. Do not invent it.
2. **Git setup.**
   - Run `git status`, `git branch -a` and `git remote -v`. If there are uncommitted changes, **STOP and ask**.
   - Record the default and integration branches: `main`, and whether a `dev` branch exists.
   - Create `feature/samadhan-v7` from the latest **dev** branch (or from `main` if there is no dev).
   - Commit **once per completed step**, with clear messages (`samadhan(v7-phaseN): …`).
   - Pushing and merging follow **§T3** only.
3. **Progress tracking.**
   - Keep `docs/v7/PROGRESS.md` updated after every step: done, next, open questions, how to verify, and the test status.
   - Create or extend `CLAUDE.md` with the project conventions you discover: build commands, CRLF line endings, IST, design tokens, naming, "never delete features", "zero impact on other apps", the test commands and the push rules.
4. **Secrets.**
   - Never read aloud, print, copy, commit or echo the values in `.env` files, keys, tokens or passwords (including the RDP ones). Refer to them by variable name only.
   - Never write credentials into any file.
5. **Databases.**
   - Never connect to or migrate a **production** database.
   - Use only the dev / local PostgreSQL configured on this machine (§C1).
   - Before the first migration on the **dev** DB, tell me the host and database name (not the password) and wait for "approved". After that, migrations on dev may run as part of normal testing.
6. **Verification.** After every step, run typecheck, build, lint and tests (§T). Fix every error before moving on.
7. **Code changes.**
   - Preserve CRLF line endings.
   - Keep diffs minimal: no unrelated reformatting or refactoring.
   - For moves, use `git mv` so history is kept.
   - Explain any deviation from this prompt in `PROGRESS.md`.

## C1. Standard environment for all non-SAP apps (Next.js + PostgreSQL); reuse for future work

**Where work runs.** All non-SAP work (Next.js, Node backend, PostgreSQL) runs on the team's standard development machine, reached by **RDP**. The team signs in; Claude Code runs inside that session.

**Credentials.** Credentials are never part of prompts or the repository. They are already present on the machine as uncommitted `.env` files, the Windows Credential Manager or a secret store. If something is missing, **ask the user to set it**. Do not ask them to paste it into chat.

**Versions.** Use the Node version from `.nvmrc` or `engines` if present; otherwise the version already installed. Do not upgrade Node, npm or global tools.

**Local ports.**
- Samadhan frontend `npm run dev`: port 3250.
- Backend: port 4000 (or as the backend README says).
- The frontend points at the local backend through the API URL environment variable: `NEXT_PUBLIC_SAMADHAN_API_URL` after Phase 1, with `NEXT_PUBLIC_SETU_API_URL` still read as a fallback.
- Add `http://localhost:3250` to `FRONTEND_ORIGIN` only in the local, uncommitted `.env`.

**Hub session for local testing.** Set the hub session keys (`emami_apps_session_token`, `emami_apps_user_email`) in localStorage for local testing, as the README describes. For automated tests, generate test JWTs using the backend's own signing utility with a **test-only** user. Never use a real user's token.

**Databases.**
- PostgreSQL: the dev database or a local PostgreSQL instance. Prefer a **local** instance, or a dedicated `samadhan_test` database, for automated tests, so test data never mixes with dev data.
- SAP HANA is not touched by this work.

**External services during tests.** Mail sending and WhatsApp are **off** (`SAMADHAN_MAIL_ENABLED=false`, `SAMADHAN_WHATSAPP_ENABLED=false`). AI is off or mocked. File storage uses a dev bucket / container, or a local filesystem adapter in test mode only.

---

## D. Business context

- **Company:** Emami.
- **Samadhan today:** the Secondary Support helpdesk for distributors, depots, ASMs and sales apps.
- **New mandate:** one Samadhan for **every kind of issue**:
  - Secondary Sales and every sales app;
  - SAP;
  - the S/4HANA programme;
  - in-house digital apps;
  - **Infrastructure**;
  - generic IT / any other issue.
- **One mailbox for everything.** The **existing support email ID already configured in Samadhan** (Admin > General → support email, and the mail-ingest mailbox) receives **all** issues of every kind. No new mailbox. Classification happens inside Samadhan (§8).
- **Every ticket carries a unique Application / Issue-area identity.** Examples: Secondary Sales, mSFA app, SalesCode MR app, Supervisor app, B2B app, B2C app, Merchandising app, SalesCode DMS app, SAP, Infra… This lets all issues be bifurcated, filtered and reported easily (§7).
- **SAP landscape:**
  - SAP ECC 6.0 EHP 8 on Suite on HANA (SoH 2.0).
  - Modules: SD, MM, PP, QM, FI, CO, HR/HCM, Solution Manager, NetWeaver Portal, Fiori, BTP (partial).
- **Roadmap:**
  - S/4HANA via **RISE with SAP (Private Cloud Edition, latest release)** from **Jan 2027**, over 9–12 months, then hypercare.
  - ECC run-support and S/4 project work run **in parallel**.
- **SolMan end of maintenance:** SAP Solution Manager 7.2 mainstream maintenance ends **31 Dec 2027**, and its ITSM and ChaRM go with it. SAP Cloud ALM is not a full ITSM tool, but it can forward alerts as tickets to an external ITSM through External API Management. **Samadhan becomes Emami's customer-side ITSM for SAP.**
- **RISE shared responsibility:**
  - SAP ECS owns infrastructure, Basis and technical operations, per the Roles & Responsibilities document. ECS service requests are raised in SAP for Me.
  - Emami owns functional support, custom code, governance and change.
  - Samadhan therefore records **who owns** each SAP ticket (Emami / SAP ECS / AMS partner) and the **external reference numbers**.
- **In-house development:** responsive apps in Next.js + OData. SAP-related data lives in SAP HANA, non-SAP data in PostgreSQL. Hosted on AWS + Azure.
- **Locale:** India.
  - IST (Asia/Kolkata), en-IN formats;
  - GST / TDS / e-invoice / e-way bill context;
  - DPDP Act 2023 for personal data.

---

## E. What already exists (verified from the frontend; confirm the backend in Phase 0)

> This section uses **today's** names (`setu`). After Phase 1 they become `samadhan` (§T1).

**Frontend:**

- Next.js 14.2 **static export** (`next build && node scripts/rename-export.js` → `dist/`), served at `/apps/setu`, embedded in the Emami Apps hub.
- React 18, Tailwind 3, `lucide-react`, `xlsx`, `dompurify`.
- **No server code in the frontend.**

**Backend:**

- `backend/setu/` at `/api/setu` on the shared Emami Apps backend.
- Postgres schema `setu`, currently **v6**.
- Read `backend/setu/README.md`.

**Authentication and roles:**

- Hub JWT, sent as a Bearer token.
- The `setu` grant in Manage Access carries the role: **Agent / Supervisor / Admin**.
- Today, role checks are scattered as `isSupervisor` / `isAdmin` flags (about 31 places in `components/`). `NAV` entries use `show: (s) => s.sup / s.admin`. Analytics, Daily report and Export are Supervisor+; Admin is Admin-only.
- **Admin > Roles & access** already sets Agent / Supervisor / Admin through the hub grant, always keeps one Admin, and records access history.

**Key files:**

- `src/lib/types.ts`: shapes, plus the `EDITABLE_FIELDS` whitelist mirrored on the backend.
- `src/lib/api.ts`: every backend call.
- `src/lib/context.ts`: `Screen`, `useSetu()`.
- `components/App.tsx`: `NAV`, routing, deep link `?ticket=<id>`.
- Ticket screens:
  - `NewTicket.tsx`;
  - `TicketView.tsx`, with its Properties panel and `expectedUpdatedAt` conflict check;
  - `TicketFields.tsx`, which renders `meta.fields`. Type `nested` is Category → Function. It also does the distributor lookup.
- Lists and analysis:
  - `Tickets.tsx`: views, filters, bulk actions, export.
  - `Board.tsx`.
  - `Dashboard.tsx` and `dashboard/*`: customisable widgets, `DASHBOARD_WIDGETS`.
  - `Helpdesk.tsx`, `Analytics.tsx`.
  - `Reports.tsx`: the **36-column daily report** and its variants.
  - `Insights.tsx`: AI / rules Assist.
- Requester-facing and reference screens:
  - `Portal.tsx`: requester portal and CSAT. Its header currently says "Support for mSecSales, SalesCode DMS / SFA and distributor systems".
  - `Solutions.tsx`, `Contacts.tsx`.
- `admin/*`: General, Agents, Roles & access, Groups, SLA, Business hours, Severity matrix, Statuses, Fields, Email templates, Canned, Scenarios, Distributor master, Settings, Channels & bell, Automations, Contacts, Audit log, Parked mail.
  - Statuses: core ids 2, 4, 5; custom ids ≥ 100.
- `components/ui.tsx` is the **only** UI kit to use: `Button`, `Card`, `Field`, `Pill`, `Kpi`, `Select`, `MultiSelect`, `Tabs`, `Modal`, `Drawer`, `Table`, `Notice`, `Skeleton`, `Empty`, `inputCls`, `textareaCls`.
- `lib/format.ts`: priority 1–4 = Low / Medium / High / Urgent; severity FATAL / SERIOUS / NORMAL; IST helpers.

**Gaps to close:**

1. Fields, the category tree and the severity matrix are global and secondary-sales-only.
2. There is no application identity.
3. **There are no attachments.**
4. There is no granular authorization: only 3 hard-coded roles.
5. There are no approvals, change control, transports, problem management or external references.
6. The portal has a single distributor form.

---

## F. Non-negotiable rules

1. **Nothing is removed.** No existing feature, screen, route, column, table, API field, setting, shortcut, report column or dropdown value may be deleted.
   - The **only** renames allowed are the `setu` → `samadhan` technical renames in §T1, and only with compatibility aliases.
   - The 36-column daily report keeps its **default output byte-identical**.
2. **Migrations are additive, idempotent and reversible.**
   - Use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, nullable or defaulted columns, backfill, then constraints.
   - Each migration runs in a transaction and has a tested **down** script.
   - No `DROP` of data, no type narrowing, no destructive `UPDATE`. The single exception is `ALTER SCHEMA … RENAME` in §T1, with its down script.
   - Schema version goes to **v7** (v7.0 = rename, then v7.1, v7.2 …), using the existing migration mechanism.
3. **Today's behaviour is the default.**
   - Every existing ticket is backfilled to workspace `SEC_SALES` and application `SS`, unless the approved mapping in §7.4 says otherwise.
   - New **desks** are behind the flag `workspaces.enabled`, which is off by default in prod.
   - With the flag off, the agent UI looks as it does today, except for two additive features that are on by default: Attachments (§10) and the Application field (§7).
4. **Zero impact on other apps** in the repository (§T2).
5. **Keep the design.**
   - Same layout, tokens (`bg-plum`, `accent`, `panel`, `line`, `muted`, `sunken`…), typography, spacing, `ui.tsx` components and lucide icons.
   - No new UI, CSS or state library.
   - New screens must look native.
6. **Keep the architecture.**
   - Static-export frontend and shared Emami Apps backend.
   - Same API base logic (`/dev-api` on dev hosts) and hub auth.
   - Postgres (schema `samadhan` after §T1).
   - Do not move Samadhan data to HANA.
7. **Dropdowns are data-driven.** New choices are seeded into the existing field / choice tables, extended per workspace.
   - **Append** after the existing choices, de-duplicating case-insensitively.
   - Never replace existing choices.
   - Hard-code only the enums that logic depends on.
8. **Server-side enforcement.**
   - Permissions and validation are enforced in the backend (§K); hiding something in the UI is never enough.
   - Every new editable field goes into the backend whitelist and `EDITABLE_FIELDS`, with validation, a permission check and an audit entry.
9. **Security.**
   - Parameterised SQL only.
   - DOMPurify for HTML.
   - Neutralise spreadsheet formulas in exports (`safeCell`).
   - No secrets in the frontend or in any committed file.
   - **Ticket ids stay numeric and stable.**
10. **Error-free before every push.** Work in phases and wait at every **STOP**. Nothing is pushed unless the full test gate in §T is green.

---

## G. Phase 0: discovery and plan (no code changes). **STOP at the end.**

1. **Read the code.** Read the frontend README and **every** file in `backend/setu` and `backend/setu.js`:
   - routes, services, SQL / migrations, seeders;
   - mail ingest (M365) and threading, with the exact subject token and parser;
   - jobs, automation engine, SLA, severity;
   - export and daily report;
   - insights, portal, WhatsApp webhook;
   - the role / guard middleware;
   - file / blob storage.
2. **Run a baseline.** Before changing anything, record:
   - the result of building **every** embedded app and the hub;
   - the backend tests (if any);
   - a start-up smoke check of the backend.

   Save it in `docs/v7/BASELINE.md`. This is the reference that proves zero impact later (§T2).
3. **Write `docs/v7/DISCOVERY.md`.** It must cover:
   - **Schema:** the real tables and columns, with a Mermaid ERD; how fields map to columns; how choices, the category tree, severity and SLA are stored.
   - **Mail:** the mail threading token.
   - **Access:** how roles are checked.
   - **Storage and hosting:** which file storage exists, and which cloud the backend runs on.
   - **Current values:** the existing `type` choices, sources and the full category tree.
4. **Write `docs/v7/RENAME-INVENTORY.md`.**
   - Run `git grep -n -i "setu"` over the **whole repository**, plus the CI workflows, web-server / reverse-proxy configs (nginx, IIS `web.config`, Docker, PM2 / ecosystem files), `.env.example` files and infrastructure scripts.
   - Classify every hit:
     - **(a)** owned by Samadhan;
     - **(b)** shared file — only the Samadhan line changes;
     - **(c)** outside the code: Meta WhatsApp webhook URL, M365 / Graph settings, DNS / proxy, links in emails already sent, bookmarks, CSAT links.
   - Check whether **any other app or schema** reads the `setu` schema or imports `setu` code. If one does, that item is a blocker.
   - Propose the exact rename map and the compatibility layer.
5. **Write `docs/v7/APP-MAPPING.md`.**
   - From the existing category / function / type / tag / subject data, propose which Application code (§7.2) each existing ticket should get, with counts per code and the rule used.
   - List the questions to confirm, for example whether "mSecSales" is the same as `SS` or `MSFA`.
6. **Write `docs/v7/TEST-PLAN.md`** (§T) **and `docs/v7/PLAN.md`.** PLAN.md contains:
   - migrations, API and frontend changes;
   - seeds;
   - the permission catalogue with the baseline mapping;
   - risks;
   - the phase split;
   - whether a `dev` branch exists and should receive merges together with `main` (§T3);
   - what the CI does when `main` is pushed (deploy? migrations?).
7. **STOP.**

---

## H. Target concept

### 6. Workspaces (service desks)

| Key | Display name | Scope | Default |
|---|---|---|---|
| `SEC_SALES` | Secondary Sales | Today's Samadhan + all sales apps | Enabled, default |
| `SAP` | SAP Support | ECC run-support now; S/4HANA after go-live | On when flag on |
| `S4_PROGRAM` | S/4HANA Programme | Defects, data migration, cutover, RAID, hypercare | On from «Jan 2027» |
| `DIGITAL_APPS` | Digital Apps | B2B / B2C and other in-house Next.js / OData / BTP apps | On when flag on |
| `INFRA_IT` | Infra & IT | Servers, cloud (AWS / Azure), network, DB administration, backup / DR, security, end-user IT, M365, any other issue | On when flag on |

**Workspace properties.** Workspaces are Admin-managed. Each has:

- name, short code, lucide icon, colour token, description;
- enabled flag, position, portal visibility;
- default group and default SLA;
- priority mode;
- the labels for Category / Function.

**What is scoped and what is shared.**

- *Scoped per workspace:* fields, category tree, types, groups, SLA, statuses subset, canned responses, scenarios, solutions categories and reports.
- *Shared:* agents, contacts, bell, CSAT, audit and the single mailbox.

**Reuse of `category` / `function`.** These columns are reused per workspace:

- SAP: **Module → Sub-process**;
- Infra & IT: **Category → Sub-category**.

All existing filters, analytics, heat-maps, the severity matrix, saved views, exports and the AI category suggestion then work immediately. The UI shows workspace-specific labels.

**Record class.** Add `record_class`: `INCIDENT | SERVICE_REQUEST | ACCESS_REQUEST | CHANGE | PROBLEM | QUERY | ENHANCEMENT | DEFECT | TASK | RISK`.

- The visible `type` dropdown stays as it is.
- Each type choice gets metadata `{recordClass}`.
- Existing types default to `INCIDENT`.

**Priority mode per workspace.**

- `SEVERITY_MATRIX`: today's behaviour; the default for `SEC_SALES`.
- `IMPACT_URGENCY`: an ITIL matrix gives priority 1–4. Severity is derived from it (Urgent → FATAL, High → SERIOUS, else NORMAL).
- `BOTH`: a matrix rule wins if one exists; otherwise Impact × Urgency applies.
- Manual override is kept.

### 7. Application / Issue-area identity (mandatory on every ticket)

#### 7.1 Model

`samadhan.applications` is a single master for **every** issue area: apps, systems and infrastructure domains. Each entry has:

- `code` (UNIQUE, uppercase A–Z 0–9, 2–8 characters, **immutable once used**), `name`, `workspace_id`, `description`, `icon`;
- `aliases text[]` (keywords and alternative names used by email classification), `tech_stack text[]`, `hosting text[]`, `database text[]`;
- `criticality`, `business_owner`, `it_owner_agent_id`, `support_group_id`, `default_sla_policy_id`;
- `portal_visible`, `active`, `position`.

The ticket gets `application_id` (NOT NULL after backfill). **The workspace is derived from the application**, so picking the app picks the desk.

**Unique, readable reference.** Every ticket shows **`<APPCODE>-<ticket id>`**, for example `MSFA-10452`, `SAP-10453`, `INFRA-10460`.

- The number is the existing numeric id, so references stay unique and stable.
- The prefix comes from the current application.
- Show it everywhere a ticket number appears: lists, board, ticket header, bell, emails, portal status, exports, reports.
- Global search and the ticket-list search accept either `MSFA-10452` or `10452`.
- Keep the existing `#id` token wherever email threading depends on it. Only add the reference in a way the Phase-0 parser analysis proves is safe, for example a prefix before the existing token. Otherwise, put it only in the email body.

Changing the application to one in another workspace counts as a **workspace move** and needs the `ticket.moveWorkspace` permission. The reference updates, history is kept, and an audit entry is written.

#### 7.2 Seed applications (Admin can rename labels, add more or deactivate; codes are fixed)

| Code | Name | Workspace |
|---|---|---|
| `SS` | Secondary Sales – General | SEC_SALES |
| `MSFA` | mSFA App | SEC_SALES |
| `MR` | SalesCode MR App | SEC_SALES |
| `SUP` | Supervisor App | SEC_SALES |
| `MERCH` | Merchandising App | SEC_SALES |
| `DMS` | SalesCode DMS App | SEC_SALES |
| `B2B` | B2B App | DIGITAL_APPS |
| `B2C` | B2C App | DIGITAL_APPS |
| `SMD` | Samadhan | DIGITAL_APPS |
| `HUB` | Emami Apps Hub | DIGITAL_APPS |
| `CUST` | Other Custom App | DIGITAL_APPS |
| `SAP` | SAP ECC (current) | SAP |
| `S4H` | SAP S/4HANA (inactive until go-live) | SAP |
| `FIORI` | SAP Fiori Apps | SAP |
| `BTP` | SAP BTP | SAP |
| `ALM` | SolMan / Cloud ALM | SAP |
| `NWP` | SAP NetWeaver Portal | SAP |
| `S4P` | S/4HANA Programme | S4_PROGRAM |
| `INFRA` | Servers, Storage & Data Centre | INFRA_IT |
| `CLOUD` | Cloud – AWS / Azure | INFRA_IT |
| `NET` | Network & Connectivity | INFRA_IT |
| `DB` | Database Administration (HANA / PostgreSQL) | INFRA_IT |
| `SEC` | Cyber Security | INFRA_IT |
| `EUC` | End-user IT (laptop, printer, mobile) | INFRA_IT |
| `M365` | Email & Microsoft 365 | INFRA_IT |
| `GEN` | General / Other | INFRA_IT |

Seed sensible `aliases` for each entry, for example:

- `MSFA`: msfa, sfa app;
- `MR`: mr app, medical rep;
- `DMS`: dms, distributor management;
- `SAP`: sap, t-code, tcode, idoc, short dump.

Add a **«confirm»** note on any seed where the code was guessed. (For example, mSecSales may already equal `SS` or `MSFA` — ask at the Phase-0 STOP.)

#### 7.3 Where the Application field appears

- **New ticket:** the first field. A searchable tile / grid grouped by workspace, recent apps first.
- **Portal:** the first question, "Which app or area is this about?".
- **Properties panel**, all list filters (MultiSelect), the board filter, saved views and bulk update ("Set application").
- **Export:** a new appended column.
- **Analytics and dashboards:** "By application" breakdowns.
- **Daily report:** an **optional** extra column, appended last and not in the default template.
- **Automations:** as a condition.
- **SLA policies:** as a selector.

#### 7.4 Backfill

Apply only the **approved** `APP-MAPPING.md`. Every unmapped existing ticket gets `SS`. **Never change existing category / function / type values.**

---

## I. Data model (additive; adapt names to the conventions found in Phase 0)

### Workspaces, applications and reference data

```sql
samadhan.workspaces(id, key UNIQUE, name, short_code, icon, color, description, enabled, portal_enabled, position,
  priority_mode, category_label, function_label, default_group_id, default_sla_policy_id, settings jsonb, created_at, updated_at)
samadhan.applications(...)   -- §7.1
samadhan.priority_matrix(id, workspace_id, impact smallint, urgency smallint, priority smallint, UNIQUE(workspace_id, impact, urgency))
samadhan.ref_masters(id, kind, code, description, parent_code, attrs jsonb, active, updated_at, UNIQUE(kind, code))
  -- kinds: SAP_SYSTEM, SAP_CLIENT, COMPANY_CODE, PLANT, STORAGE_LOCATION, SALES_ORG, PURCH_ORG, TCODE, FIORI_APP,
  --        SAP_ROLE, INTERFACE, BATCH_JOB, SERVER, CLOUD_ACCOUNT, SITE  (Excel import / export like the distributor master)
```

### Ticket detail tables (1:1 with the ticket)

```sql
samadhan.ticket_sap_details(ticket_id PK, landscape, sap_system, sap_client, environment, tcode, fiori_app_id, program_name,
  error_message_class, error_message_no, error_text, short_dump_id, idoc_number, idoc_message_type, batch_job, company_code,
  plant, sales_org, purch_org, document_numbers jsonb, users_affected, business_process, workaround_available, workaround_text,
  reproducible, steps_to_reproduce, expected_result, actual_result, sap_notes text[], sap_component, rise_owner, updated_at)
samadhan.ticket_it_details(ticket_id PK, layer, environment, platform, device_model, os, browser, app_version, url, api_endpoint,
  odata_service, http_status, correlation_id, database, hosting, server_name, ip_or_host, asset_tag, site_location,
  users_affected, updated_at)
samadhan.ticket_program_details(ticket_id PK, activate_phase, release_wave, test_cycle, test_case_id, test_scenario, process_area,
  defect_severity, migration_object, mock_cycle, cutover_step_id, planned_start, planned_end, simplification_item, atc_finding,
  ricefw_id, fit_gap_id, retest_status, retest_by, retest_at, updated_at)
```

### Change, approvals, catalogue, external references and reviews

```sql
samadhan.ticket_transports(id, ticket_id, tr_number, description, tr_type, owner, source_system, status, target_systems text[],
  imported_qas_at, tested_ok_by, approved_for_prd_by, imported_prd_at, return_code, notes, created_by, created_at, updated_at)
  -- tr_number regex (configurable): ^[A-Z][A-Z0-9]{2}K9\d{5}$
samadhan.approval_chains(id, workspace_id, application_id NULL, name, applies_to jsonb, steps jsonb, active)
samadhan.ticket_approvals(id, ticket_id, chain_id, step_no, approver_type, approver_agent_id, approver_email, decision, comment,
  decided_at, due_at, token_hash, created_at)
samadhan.service_catalog_items(id, workspace_id, application_id NULL, name, description, icon, record_class, default_type, category,
  function, form_schema jsonb, approval_chain_id, fulfil_group_id, sla_policy_id, portal_visible, active, position)
samadhan.ticket_external_refs(id, ticket_id, system, ref, status, priority, url, owner, opened_at, last_update_at, notes)
samadhan.post_incident_reviews(ticket_id PK, summary, timeline jsonb, root_cause, root_cause_category, contributing_factors,
  corrective_actions jsonb, preventive_actions jsonb, problem_ticket_id, reviewed_by, reviewed_at)
samadhan.change_windows(id, workspace_id, kind, name, starts_at, ends_at, systems text[], note)
```

### Attachments and authorization (§10, §9)

```sql
samadhan.ticket_attachments(id, ticket_id, conversation_id NULL, file_name, mime, size_bytes, storage_key, sha256, width, height,
  uploaded_by_agent_id NULL, uploaded_by_contact_id NULL, source ('agent'|'portal'|'email'|'integration'), is_inline,
  scan_status, created_at, deleted_at)
samadhan.auth_profiles(id, key UNIQUE, name, description, base_role, is_system, active, created_at, updated_at)
samadhan.auth_profile_permissions(profile_id, permission_key, PRIMARY KEY(profile_id, permission_key))
samadhan.auth_user_profiles(id, agent_id, profile_id, valid_from, valid_to, reason, granted_by, granted_at, revoked_at)
samadhan.auth_user_scope(agent_id PK, workspace_ids int[] NULL, application_ids int[] NULL, group_scope ('own'|'groups'|'all'),
  can_view_confidential bool, updated_by, updated_at)
samadhan.auth_permission_overrides(id, agent_id, permission_key, effect ('grant'|'deny'), valid_to, reason, granted_by, granted_at)
samadhan.auth_change_log(id, actor_agent_id, target_agent_id NULL, profile_id NULL, action, before jsonb, after jsonb, reason, created_at)
```

### Columns added to existing tables

- **`tickets`:**
  - `workspace_id`, `application_id`, `record_class`;
  - `impact`, `urgency`, `is_major_incident`, `confidential`, `problem_id`;
  - change fields: `change_type`, `change_risk`, `planned_start`, `planned_end`, `implementation_plan`, `rollback_plan`, `test_evidence`;
  - closure fields: `resolution_code`, `root_cause_category`;
  - classification fields: `classification_source` (`'manual'|'subject_tag'|'keyword'|'sender_rule'|'ai'|'default'`), `classification_confidence`;
  - `catalog_item_id`, `attachment_count`, `custom` jsonb.
- **Workspace scoping:** `workspace_id` (NULL = all) on `groups`, `sla_policies`, `severity_rules`, `canned_responses`, `scenarios`, `automation_rules`, `articles`, `email_templates` (optional override) and `saved_views`. `application_id` (NULL = all) on `sla_policies` and `automation_rules`. Plus a `status_workspaces` mapping table.
- **Fields:** a `field_workspaces` mapping (`label_override`, `required_on_create`, `required_before_resolve`, `visible`, `position`, `section`, `help_text`, `visible_when` jsonb, `portal_visible`) and a `storage` column (`column|sap|it|program|custom`).
- **Field choices:** `workspace_id` (NULL = shared) and `meta` jsonb.
- **Settings keys:**
  - attachment limits (§10);
  - `workspaces.enabled`;
  - `mail.classification.*` (§8);
  - `ref.prefixInSubject`.

### Indexes

- On `tickets`: `(workspace_id, status_id)`, `(workspace_id, created_at)`, `(application_id, status_id)`, `(application_id, created_at)`, `(workspace_id, agent_id)`, `(record_class)`, `(problem_id)`, and a GIN index on `custom`.
- `ticket_attachments(ticket_id)`.
- `ticket_transports(tr_number)`.
- `ticket_external_refs(system, ref)`.
- `ref_masters(kind, code)`.
- `ticket_sap_details(sap_system, tcode)`.
- `auth_user_profiles(agent_id)`.

---

## J. One mailbox, automatic classification (§8)

All email keeps arriving at the **existing** Samadhan support mailbox, through the existing ingest, threading and parking.

**Classification at creation (new tickets only; replies keep their ticket).** The rules below are evaluated in order. The **first match wins**:

1. **Subject tag:** `[MSFA]`, `MSFA:` or `MSFA -` at the start of the subject → that application. Any active application code or exact name counts.
2. **Sender rules:** Admin-managed. Examples: a sender domain or address → application; a contact linked to a distributor → `SS`.
3. **Keyword dictionary:** application `aliases`, plus SAP patterns (T-codes, `IDoc`, `ST22`, `short dump`, transport-number regex) → SAP. Infrastructure words (`server down`, `VPN`, `firewall`, `AWS`, `Azure`, `backup`) → the matching INFRA_IT application.
4. **AI suggestion** (only when the backend has an AI key and `mail.classification.ai` is on): accepted only above a confidence threshold of «0.8».
5. **Fallback:** `mail.classification.default`, default **`SS`**, which preserves today's behaviour. The ticket is flagged `classification_source='default'`.

**Visibility and correction.**

- Store `classification_source` and `confidence` on the ticket.
- Show a small "auto-classified" hint in the ticket header, with a one-click **Confirm / Change application**.
- Add the list view **"Needs classification"**: tickets where the source is `default` or `ai`, or the confidence is below the threshold.
- Changes are audited, and they feed a simple learning table: the top keywords for each final application are suggested to the Admin as new aliases. **Never** apply them automatically.

**Acknowledgement and examples.**

- The acknowledgement email includes the reference (`MSFA-10452`) and the application name.
- Admin > Channels shows an "Email subject tags" help text the team can share with users. Example: "Start your subject with [SAP], [MSFA], [DMS], [INFRA]… for faster routing."
- The portal, WhatsApp and New ticket ask for the application explicitly, so no guessing is needed there.

---

## K. Authorization cockpit (Admin only) (§9)

### 9.1 Principles

**Who sees the cockpit.**

- **Admin > Authorization cockpit** is a new Admin tab. It is visible and usable **only by users whose hub role is Admin**.
- The cockpit cannot be delegated to other roles, and the `admin.authorization` permission can never be granted to Agent or Supervisor.
- **All Admin screens remain Admin-only.**

**Agents see only their part.**

- No Admin menu, no Authorization cockpit.
- No admin-only API data in `/meta` or `/me` (for example, no other agents' preferences, no settings internals).
- Only the screens, actions, workspaces and applications their permissions allow.
- Typing a URL or deep link does not bypass this. The screen guard in `App.tsx` redirects to the Dashboard with a friendly "You don't have access to this screen" `Notice`, and the API returns **403**.

**Enforcement and compatibility.**

- **The server decides.** Add a backend middleware `requirePermission(key)` on **every** route, plus a data-scope filter applied in SQL to lists, counts, board, search, export, dashboards, analytics, insights, reports and the bell.
- `/me` returns `permissions: string[]` and `scope`. The frontend gets a `can(key)` helper in `useSetu()`. Gradually replace the scattered `isSupervisor` / `isAdmin` checks with `can(...)` **only where the baseline mapping proves identical behaviour**.
- The **baseline is unchanged.** The three built-in profiles (`AGENT`, `SUPERVISOR`, `ADMIN`) are seeded so that today's behaviour is reproduced **exactly**. Write a test that compares old vs new access for each screen and action.
- **The hub stays the source of the base role.** The hub's Manage Access grant still decides whether someone can open Samadhan and their base role. The cockpit adds profiles, scope and overrides **on top**.
- The existing **Roles & access** and **Agents** tabs stay. The cockpit links to them.

### 9.2 Permission catalogue (seed; `key` = `area.action`)

- **Screens:**
  - `screen.dashboard`, `screen.helpdesk`, `screen.tickets`, `screen.board`, `screen.newTicket`;
  - `screen.contacts`, `screen.solutions`;
  - `screen.analytics`, `screen.reports`, `screen.changeCalendar`, `screen.approvals`.
- **Tickets:**
  - `ticket.view`, `ticket.create`, `ticket.edit`, `ticket.reply`, `ticket.note`, `ticket.forward`;
  - `ticket.assign`, `ticket.bulk`, `ticket.merge`, `ticket.link`, `ticket.child`;
  - `ticket.spam`, `ticket.trash`, `ticket.purge`, `ticket.export`;
  - `ticket.moveWorkspace`, `ticket.changeApplication`, `ticket.overridePriority`;
  - `ticket.declareMajor`, `ticket.viewConfidential`, `ticket.setConfidential`;
  - `ticket.pir.edit`, `ticket.classify`.
- **Attachments:** `attachment.upload`, `attachment.download`, `attachment.delete`.
- **Change / SAP:**
  - `transport.manage`, `externalRef.manage`;
  - `approval.decide`, `approval.override`;
  - `change.schedule`, `change.freezeOverride`;
  - `problem.manage`.
- **Knowledge / content:**
  - `article.edit`, `article.publish`;
  - `canned.personal`, `canned.shared.manage`;
  - `scenario.run`, `views.share`, `report.variants.share`.
- **Insights:** `insights.dashboard`, `insights.ticket`, `insights.ai`.
- **Contacts:** `contact.edit`, `contact.anonymize`.
- **Admin (Admin role only; listed so they can be audited):**
  - `admin.general`, `admin.people`, `admin.groups`, `admin.sla`, `admin.fields`, `admin.statuses`;
  - `admin.templates`, `admin.canned`, `admin.scenarios`, `admin.masters`, `admin.applications`, `admin.workspaces`;
  - `admin.catalog`, `admin.approvalChains`, `admin.automations`, `admin.channels`, `admin.integrations`;
  - `admin.audit`, `admin.parkedMail`, `admin.jobs`;
  - `admin.authorization`.

### 9.3 Data scope (per user)

- **Workspaces:** which ones (all / selected).
- **Applications:** which ones (all / selected within those workspaces). For example, an mSFA support agent sees only `MSFA` and `SS`.
- **Ticket visibility:**
  - `own`: assigned to me, or I am a watcher;
  - `groups`: my groups' tickets plus `own`;
  - `all`: everything within the workspace / application scope.
- **Confidential:** visible only with `ticket.viewConfidential` **and** membership of the assigned group (Admins always).
- **Defaults:** an Agent keeps today's visibility, unless the Admin narrows it.

### 9.4 Cockpit screens (built from existing `ui.tsx` components, as tabs inside the cockpit)

1. **Overview**
   - KPIs: users by base role, custom profiles, temporary grants expiring in 7 days, users with confidential access, open SoD warnings, last 10 changes.
2. **Role profiles**
   - List seeded and custom profiles. Create / copy / deactivate custom ones (system profiles are read-only but can be copied).
   - Seeded custom profiles:
     - *Sales Apps Agent*;
     - *SAP Functional Agent*;
     - *SAP Basis / Security Agent*;
     - *Infra Agent*;
     - *Digital Apps Agent*;
     - *Workspace Lead* (a Supervisor-like role inside its scope);
     - *Approver / CAB*;
     - *Auditor (read-only)*.
3. **Permission matrix**
   - Rows: permissions, grouped and collapsible, with a search box.
   - Columns: profiles.
   - Cells: checkboxes. The Admin column is locked to everything.
   - "Diff vs base role" highlighting.
   - Save with a mandatory **reason**.
4. **User access**
   - Search users (from the existing agents and access lists).
   - Per user:
     - base role (read-only here, with a link to Roles & access);
     - assigned profiles with **valid from / to** (temporary access);
     - scope (§9.3);
     - individual grant / deny overrides with an expiry and a reason.
   - **Effective access preview**: the menu items they will see, the allowed actions and their data scope, computed by the same server function the middleware uses.
5. **Access review**
   - Table: user, base role, profiles, scope, last seen, expiring grants, unused permissions (not exercised in 90 days, from the audit log).
   - Bulk "revoke expired".
   - Export to Excel.
   - A quarterly recertification reminder to Admins via the bell.
6. **Change log**
   - Every cockpit change with before / after JSON, actor, reason and time. Filterable and exportable. Also written to the existing Audit log.

### 9.5 Guardrails

- Samadhan always keeps at least one active Admin (existing rule).
- An Admin cannot remove their own Admin access.
- `admin.*` permissions can only exist on the Admin base role.
- **SoD warnings** appear when one user would hold conflicting rights, for example `ticket.create` + `approval.decide` on the same change chain, or `transport.manage` + `approval.decide` for PRD moves. The Admin must give a reason to proceed. Warnings are listed on the Overview.
- Temporary grants auto-expire through the scheduler. Expiry is logged and the bell notifies.
- Permission changes take effect on the user's next API call. Cache `/me` permissions for at most 60 s.

---

## L. Attachments (enabled by default for all workspaces) (§10)

**Limits.** Admin-editable in Admin > General, within the hard ceilings:

| Channel | Per file | Files per action | Per ticket total | Hard ceiling per file |
|---|---|---|---|---|
| Agent (new ticket, reply, note, properties) | **10 MB** | 10 | **100 MB** | 25 MB |
| Portal (no sign-in) | **5 MB** | 5 | 25 MB | 10 MB |
| Inbound email | **20 MB** | all attachments of the mail | 100 MB | 25 MB |
| Outbound reply email | total **20 MB** per email | — | — | — |

- Larger outbound attachments are sent as secure links that need a Samadhan sign-in.
- Files that exceed a limit on inbound email are not stored. The system adds a private note listing the skipped files and asks the requester to share them through the portal.

**Allowed types (allow-list, checked by extension *and* content sniffing):**

- Images: png, jpg/jpeg, gif, webp, bmp, heic.
- Documents: pdf, txt, log, csv, xls/xlsx, doc/docx, ppt/pptx, json, xml.
- Email: msg, eml.
- Archives: zip.

**Blocked:** executables and scripts (exe, msi, bat, cmd, ps1, sh, js, vbs, jar), html/htm, **svg** (XSS risk), and macro files (xlsm, docm).

**Screenshots.**

- Paste from the clipboard (**Ctrl+V**) in the reply box, new ticket and portal. Drag and drop is supported too.
- Images larger than 2 MB or 2,000 px on the long edge are compressed **client-side** to JPEG/WebP at about 85% quality before upload.
- Show the original vs compressed size, with an "Upload original" option.

**Storage.**

- Use the object storage the backend already uses (S3 or Azure Blob, per Phase 0), in a **private** container with server-side encryption.
- Keys look like `samadhan/attachments/<yyyy>/<mm>/<ticketId>/<uuid>`.
- Upload and download use **short-lived pre-signed URLs** (5 minutes), issued only after a permission and scope check.
- Images and PDFs are previewed in a `Modal`. Every other type is download-only.
- If no object storage exists, **STOP** and propose options. Do not store files in Postgres.

**Lifecycle.**

- Inbound email attachments, including inline `cid:` images, are saved and linked to the conversation.
- Purging a trashed ticket deletes its files.
- Contact anonymisation deletes that contact's uploads.
- Merging moves attachments to the primary ticket.
- `attachment_count` is updated on every change.
- If an existing virus-scan hook is present, use it and set `scan_status`; files that are not clean are blocked from download.

**Where attachments appear.**

- An Attachments card on the ticket.
- A paperclip on conversation items.
- An attachment count in the list (an icon) and in exports.
- A "Has attachments" filter.

---

## M. Backend changes (summary)

**Meta and me.**

- `/meta` adds:
  - `workspaces`, `applications` (active, in scope), `priorityMatrix`, `recordClasses`;
  - `catalogItems`, `attachmentLimits`;
  - a `byWorkspace` map for `fields` and `categoryTree`.
- **Keep** the old top-level `fields` / `categoryTree` as `SEC_SALES`, for compatibility.
- `/me` adds `permissions` and `scope`.

**Tickets.**

- New properties:
  - classification: `workspaceId`, `applicationId`, `ref`, `recordClass`;
  - priority: `impact`, `urgency`;
  - detail objects: `sap`, `it`, `program`, `custom`;
  - related records: `transports`, `approvals`, `externalRefs`, `attachments`, `pir`;
  - `classificationSource`.
- New list filters:
  - classification: `workspace`, `application`, `recordClass`;
  - priority and environment: `impact`, `urgency`, `environment`;
  - SAP: `sapSystem`, `tcode`;
  - flags: `majorIncident`, `confidential`, `hasAttachments`, `needsClassification`;
  - change and external refs: `externalSystem`, `hasOpenApproval`, `transportStatus`;
  - programme: `testCycle`, `phase`.
- These work everywhere: counts, saved views, board, bulk, export (new columns appended) and global search. Search also covers the reference, T-code, transport number, SAP case number, IDoc number and error text.

**Workspace- and application-aware engines.**

- SLA selection: application → workspace + record class + priority → today's group logic as the fallback.
- Severity / priority per priority mode.
- Required-before-resolve per workspace.
- Automations get new conditions and actions: `setApplication`, `setRecordClass`, `startApproval`, `flagMajorIncident`, `addExternalRef`.
- Round-robin is unchanged.

**New routes.**

- On a ticket:
  - `/tickets/:id/attachments`;
  - `/tickets/:id/transports`;
  - `/tickets/:id/approvals`;
  - `/tickets/:id/external-refs`;
  - `/tickets/:id/pir`;
  - `/tickets/:id/classify`;
  - `/tickets/:id/problem`.
- Elsewhere:
  - `/approvals/mine`;
  - one-click approval links (single-use token with expiry, like the CSAT pattern);
  - `/catalog`, `/applications`, `/ref-masters`, `/change-calendar`.
- `/admin/*` CRUD for workspaces, applications, the priority matrix, ref masters (Excel import), catalogue, approval chains, change windows, mail classification rules and integrations.
- `/admin/authorization/*` (Admin only): profiles, matrix, user access, effective preview, review, log.

**Jobs.**

- approval reminders;
- major-incident update reminders;
- external-ref ageing nudges;
- change-window conflict checks;
- problem-candidate detection;
- temporary-access expiry;
- quarterly access-review reminders;
- orphan attachment clean-up.

**Insights / Assist.**

- Pass workspace and application context to the AI.
- For SAP, it suggests the module / sub-process, likely T-codes, keywords to search in SAP for Me, a missing-information checklist and the RISE owner.
- **Never** invent SAP Note numbers.
- Exclude confidential tickets.
- Keep the rules fallback.

---

## N. Frontend changes (keep every current screen intact)

1. **Navigation and guards.**
   - `NAV` and the Admin tabs are filtered by `can(...)`.
   - A screen guard in `App.tsx` covers `setScreen`, `go`, deep links and browser history.
   - Admin and Authorization cockpit are never rendered for non-Admins, not even as a lazy chunk triggered by the UI.
2. **Workspace switcher.**
   - A compact segmented control at the top of the sidebar ("All" plus the workspaces in the user's scope), stored in `AgentPrefs.workspace`.
   - Hidden while the flag is off.
   - An application filter chip sits next to the list search.
   - Each workspace has a colour chip; the `APPCODE-id` reference is shown everywhere.
3. **New ticket** (one screen, progressive):
   - **(a)** "Which app or area?" — a searchable application grid grouped by workspace, recent first. This sets the workspace.
   - **(b)** "What do you need?" — five tiles mapped to record class:
     - *Something is broken*;
     - *I need something* (catalog);
     - *I need access*;
     - *I want a change*;
     - *I have a question*.

     SAP adds *Track an SAP case*. The Programme adds *Log a test defect*.
   - **(c)** A dynamic form in `Card` sections, showing only the relevant fields (`visible_when`). Required-at-create fields stay minimal.
   - An attachments dropzone with clipboard paste.
   - Keep the requester lookup, the distributor lookup (only for Secondary Sales apps), "Create another", "Email requester" and child presets.
4. **Smart helpers.**
   - SID → client cascade.
   - T-code and Fiori app typeahead.
   - Server / site typeahead for Infra.
   - **"Paste error / dump text"**: a client-side regex parser for message class + number, T-codes, ST22 dump names, transports, SAP Note numbers, 16-digit IDocs and HTTP status. Fields are prefilled and the user confirms them.
   - A live Impact × Urgency → priority display.
   - A "Very High" guard: non-production environments need a justification.
5. **Ticket view.** Keep everything that exists and add:
   - an "auto-classified" hint with Confirm / Change;
   - an Attachments card;
   - collapsible SAP / App / Infra / Programme details;
   - Transports (pipeline chips);
   - Approvals (stepper with Approve / Reject);
   - External references with ageing;
   - linked Problem / incidents;
   - a **Major incident** banner (bridge link, next-update countdown);
   - a PIR form, mandatory before closing a P1 / major incident.

   The Properties panel adds Application (with a move confirmation), Record class, Impact and Urgency.
6. **Lists and board.**
   - New filters (§M) are shown only when relevant.
   - New views:
     - *Needs classification*;
     - *My approvals*;
     - *Pending with SAP*;
     - *Major incidents*;
     - *Changes this week*;
     - *Awaiting PRD move*;
     - *Open defects (my module)*;
     - *Infra – P1/P2 open*;
     - *Hypercare today*.
   - All existing views remain.
7. **Dashboard.** Opt-in widgets:
   - `byApplication`, `workspaceMix`, `sapModuleHeat`, `majorIncidents`, `pendingExternal`;
   - `approvalsPending`, `transportPipeline`, `changeCalendar`, `problemsOpen`;
   - `defectBurndown`, `hypercare`, `infraHealth` (open P1 / P2 by Infra application).

   The existing defaults are unchanged.
8. **Reports.** The Daily report stays unchanged by default. Add a template selector using the same variant machinery:
   - SAP Incident Register;
   - Change & Transport Register;
   - Access Request Log;
   - Problem / KEDB Register;
   - S/4 Defect Tracker;
   - Hypercare Daily;
   - Sales Apps Register (per application);
   - Digital Apps Register;
   - Infra & IT Register.
9. **Analytics.**
   - Application and workspace filters.
   - By-application KPIs: volume, SLA %, MTTR, reopen %, CSAT.
   - SAP: module heat-map, top T-codes and error messages, external-case ageing.
   - Change: success rate, emergency %.
   - Programme: defect density, leakage, retest pass %.
   - Infra: P1 count, MTTR by domain.
10. **Admin.**
    - New tabs: **Workspaces**, **Applications**, **Priority matrix**, **SAP & Infra masters**, **Service catalog**, **Approval chains**, **Change calendar**, **Mail classification**, **Integrations**, **Authorization cockpit**.
    - Existing tabs get a workspace (and, where useful, application) selector: Fields, Severity matrix, SLA, Groups, Statuses, Canned, Scenarios, Automations, Templates.
    - General gets the attachment limits.
11. **Portal.**
    - The first question is the application picker (portal-visible apps grouped by area), then that workspace's form, article search filtered by application, attachments (portal limits), and portal-visible catalog items.
    - The status check accepts `MSFA-10452` or `10452` together with the email.
    - Make the header subtitle generic: "Support for sales apps, SAP, IT and infrastructure", editable in Admin > General.
    - The existing form flow is unchanged when only `SEC_SALES` is portal-enabled. The application picker shows only Secondary Sales apps.
12. **Keyboard.** Keep `/`, `N`, `D`, `T`, `B`, `?`, `w`, `j`, `k`. Do not reuse `w`. Add new shortcuts only if they are conflict-free and listed in `Shortcuts.tsx`.
13. **Mobile.** Every new card and form works at 360 px. Accessible labels, `aria-label`s and focus states, as in the current code.

---

## O. Seed data (append-only; Admin can edit or deactivate everything)

Write seeds as idempotent SQL / JSON. Never alter `SEC_SALES` choices except to add `meta.recordClass`.

### Types → record class

- **SAP:**
  - Incident; Service Request; Access / Authorization Request; Master Data Request; Report / Data Extract; Batch Job Request → mapped to their classes.
  - Transport Movement and Change Request → CHANGE.
  - Enhancement → ENHANCEMENT. Problem → PROBLEM. Query / How-to → QUERY.
- **S4_PROGRAM:**
  - Defect – Unit / SIT / UAT / Regression / Performance → DEFECT.
  - Data Migration Issue and Authorization / Role Issue → DEFECT.
  - Cutover Task, Custom Code Remediation and Training / Documentation → TASK.
  - Fit-Gap / Delta → ENHANCEMENT. Risk → RISK.
  - Issue (RAID) and Hypercare Incident → INCIDENT.
- **DIGITAL_APPS:**
  - Bug / Incident; Service Request; Access Request; Data Correction → mapped to their classes.
  - Enhancement / Feature → ENHANCEMENT. Change / Release → CHANGE.
  - Security Vulnerability → INCIDENT. Problem → PROBLEM. Query → QUERY.
- **INFRA_IT:**
  - Incident; Service Request; Access Request; Asset / Procurement Request → mapped to their classes.
  - Change Request → CHANGE. Planned Maintenance → CHANGE.
  - Monitoring Alert → INCIDENT. Problem → PROBLEM. Query → QUERY.

### SAP Module → Sub-process

- **SD:** Sales Order; Pricing & Conditions; Credit Management; Delivery & Shipping; Billing / Invoicing; Returns, Credit & Debit Memo; Output / Printing; Schemes, Rebates & Settlement; ATP; Customer / BP Master; STO; Intercompany; GST e-Invoice / e-Way Bill; Consignment; Reports
- **MM:** Purchase Requisition; Purchase Order; Release Strategy; Goods Receipt; Goods Issue / Transfer Posting; Physical Inventory; Invoice Verification (MIRO); Vendor / BP Master; Material Master; Batch Management; Subcontracting / Job Work; Service Entry Sheet; Inventory Valuation; Reports
- **PP:** BOM; Master Recipe / Routing; Process / Production Order; MRP Run; Planned Orders; Confirmation; Backflush / Goods Movement; Capacity Planning; Demand Management / PIR; Batch Determination; Co / By-product; Reports
- **QM:** Inspection Lot; Results Recording; Usage Decision; Quality Info Record; Certificate / COA; Quality Notification; Sampling Procedure; Shelf Life / Batch Classification; Stability Study; Reports
- **FI:** General Ledger; Accounts Payable; Accounts Receivable; Asset Accounting; Payment Run (F110); Bank Reconciliation / EBS; GST / TDS / Tax; Period-end Closing; Posting Error; Intercompany; Financial Statements / Reports
- **CO:** Cost Center Accounting; Profit Center Accounting; Internal Orders; Product Costing; CO-PA; Material Ledger / Actual Costing; Settlement; Assessment / Distribution; Month-end Closing; Reports
- **HR / HCM:** Organisational Management; Personnel Administration; Time Management; Payroll (India); Income Tax / Form 16; Reimbursements / Benefits; ESS / MSS; Recruitment; Travel; Reports
  - Payroll, Income Tax and Personnel Administration default to `confidential`.
- **Basis:** System Down; Performance; Background Job Failure; Transport Management (STMS); System Refresh / Client Copy; Printer / Spool; RFC / Connectivity; Kernel / Patch / Support Package; HANA Database; Short Dump (ST22); Licence; Backup / Restore
- **Security & GRC:** User Creation; Lock / Unlock; Password Reset; Role Assignment; New / Changed Role; SoD Conflict; Firefighter Access; Authorization Error (SU53); Audit / Compliance
- **ABAP / RICEFW:** Report; Interface; Conversion; Enhancement / BAdI / Exit; Form (Smart / Adobe); Workflow; Custom Code Dump; Custom Program Performance
- **Fiori / UI5:** Launchpad / Tile Missing; App Error; Catalog / Space / Page; Role Mapping; Performance; Mobile Access
- **BTP & Integration:** CPI iFlow; PI / PO Interface; IDoc Error; OData Service; Workflow / Process Automation; Destination / Connectivity; Event Mesh; Custom BTP App
- **SolMan / Cloud ALM:** ChaRM; ITSM; Monitoring / Alerts; Test Suite; Documentation
- **NetWeaver Portal:** Login / SSO; iView / Page; Role / Workset
- **Analytics:** Standard Report; BW / BI; Embedded Analytics / CDS; SAC; ALV / Excel Export
- **Master Data:** Material; Customer / BP; Vendor / BP; Pricing; GL / Cost Center; BOM / Recipe
- **Other / Not sure**
- Inactive extras: PM, PS, WM / EWM, TM, GTS, MDG, Ariba, SuccessFactors, Concur, IBP.

### Sales Apps (SEC_SALES, for the new application codes)

Add these generic sub-categories **only if the existing tree has no equivalent** (report the overlap in Phase 0):

Login / OTP; Sync / Data Upload; Order Booking; Scheme / Discount; Beat / Route Plan; Attendance / GPS; Outlet / Retailer Master; Stock / Inventory; Claims; Reports / Dashboard; App Crash / Performance; Device / Version.

### Digital Apps (Category → Sub-category)

- Frontend (Next.js): UI / Layout; Login / Session; Performance; Mobile / Responsive; PWA
- API / Backend: 5xx Error; Timeout; Validation; Auth / Token
- OData Service: Metadata; Read; Create / Update; $batch
- DB – SAP HANA: Query / Performance; Data Issue; Connection
- DB – PostgreSQL: Query / Performance; Data Issue; Connection; Migration
- Integration (SAP ↔ App); Release / Deployment; Security / Vulnerability; Payment / Order (B2B / B2C); Other

Also:

- **Layer:** Frontend · API · OData · HANA DB · PostgreSQL DB · Auth / SSO · AWS · Azure · BTP
- **Platform:** Desktop browser · Android · iOS · PWA
- **Browser:** Chrome · Edge · Safari · Firefox · Other

### Infra & IT (Category → Sub-category)

- Servers & Storage: Windows Server; Linux Server; Virtual Machine; Storage / NAS / SAN; Backup & Restore; Disaster Recovery; Patching
- Cloud – AWS: EC2; S3; RDS; IAM; VPC / Network; Load Balancer; Cost / Billing
- Cloud – Azure: Virtual Machine; App Service; Blob Storage; Entra ID; VNet; Cost / Billing
- Network: LAN; WAN / MPLS / SD-WAN; Wi-Fi; Firewall; VPN; Internet / ISP; DNS; SSL Certificate
- Database Admin: HANA; PostgreSQL; Backup; Performance; Access
- Cyber Security: Phishing; Malware; Vulnerability; Suspicious Login; Data Leak / DLP
  - All Cyber Security defaults to Urgent + `confidential`.
- Monitoring & Alerts; Data Centre / Power / UPS
- End-user IT: Laptop / Desktop; Printer / Scanner; Mobile; Software Install / Licence
- Email & M365: Outlook; Teams; OneDrive / SharePoint; Licence
- Identity: AD / Entra ID; MFA; Password
- Telephony; CCTV / Biometric; Other

### Common lists

- **Landscape:** ECC 6.0 EHP8 on HANA (current) · S/4HANA RISE PCE (target) · SAP BTP · Fiori Front-end Server · SolMan 7.2 · Cloud ALM · NetWeaver Portal · PI/PO / CPI · BW / BI · Other
- **Environment:** Production · Quality / Test · Development · Sandbox · Pre-production · Training · DR
- **Impact:**
  1. Enterprise-wide
  2. Department / Plant / Region
  3. Multiple users
  4. Single user
- **Urgency:**
  1. Critical – work stopped, no workaround
  2. High – severely impaired
  3. Medium – workaround available
  4. Low – can wait
- **Matrix (impact × urgency):** 1×1, 1×2, 2×1 → Urgent · 1×3, 2×2, 3×1 → High · 1×4, 2×3, 3×2, 4×1 → Medium · else Low
- **RISE owner:** Emami internal · SAP ECS · AMS partner · Shared · TBD
- **External system:** SAP for Me Case · SAP ECS SR · AMS Partner Ticket · Cloud ALM Event · App Vendor (SalesCode etc.) · Microsoft · AWS · Azure · ISP / Telecom · Other
- **SAP case priority:** Very High · High · Medium · Low
- **Transports:**
  - Type: Workbench · Customizing · Transport of Copies · Relocation
  - Status: Created · Released · Imported to QAS · Tested OK in QAS · Approved for PRD · Imported to PRD · Failed (RC ≥ 8) · Reverted
- **Change:**
  - Type: Standard · Normal · Emergency
  - Risk: Low · Medium · High
- **Approval:** Pending · Approved · Rejected · Need info
- **Programme:**
  - SAP Activate phase: Prepare · Explore · Realize · Deploy · Hypercare · Run
  - Test cycle: Unit · SIT-1 · SIT-2 · UAT · Regression · Performance · Mock Cutover 1 / 2 / 3 · Dress Rehearsal · Hypercare
  - Defect severity: S1 Critical · S2 High · S3 Medium · S4 Low
  - Retest status: Not started · Passed · Failed · Blocked
- **Root cause:** Configuration · Custom code · Standard SAP bug (Note) · Master data · User / transactional error · Authorization · Interface · Infrastructure / Basis · Network · Cloud provider · Third-party vendor · Training gap · Requirement gap · Duplicate / not an issue
- **Resolution code:** Fixed – configuration · Fixed – code · SAP Note applied · Data corrected · Workaround provided · User guided · Access granted · Hardware replaced · Restarted / restored · Vendor fix · No fault found · Duplicate · Cancelled
- **Sources** (append to `sources.extra`): SAP Cloud ALM · Monitoring alert · Teams · Walk-in

### New custom statuses (id ≥ 100, mapped to workspaces)

| Status | SLA paused |
|---|---|
| Awaiting Approval | yes |
| Pending with SAP | yes |
| Pending with Vendor / AMS | yes (configurable) |
| In Development | no |
| In Testing (QAS) | no |
| Awaiting PRD Move | no |
| Scheduled | yes |
| Pending User Confirmation | yes |
| Retest | no |

### Groups

- **SAP:** SAP Service Desk (L1 triage), SAP SD, SAP MM, SAP PP-QM, SAP FICO, SAP HCM, SAP Basis & ECS liaison, SAP Security & GRC, SAP ABAP, SAP Fiori & BTP, SAP Integration.
- **Programme:** PMO, Defect Triage, Data Migration, Cutover.
- **Digital:** Apps Support, Frontend, Backend / API, Data.
- **Infra & IT:** IT Service Desk, Server & Storage, Cloud Ops (AWS / Azure), Network & Security, M365, End-user Support.
- **Secondary Sales:** keep the existing groups.
- **Routing:** automation rules route application / module → group; unknown goes to the triage group.

### SLA defaults (new policies; Secondary Sales unchanged)

- **SAP / Infra / Digital incidents:**

| Priority | First response | Resolution | Clock |
|---|---|---|---|
| Urgent | 15 min | 4 h | 24×7 |
| High | 30 min | 8 business h | business hours |
| Medium | 4 business h | 3 business days | business hours |
| Low | 8 business h | 5 business days | business hours |

- **Requests:** First response 4 h. Fulfilment per catalog item (default 2 business days).
- **Programme defects:** S1 1 · S2 2 · S3 5 · S4 10 business days.

### Service catalog (P = portal-visible)

- **SAP:**
  - New SAP user (P)
  - Unlock / password reset (P)
  - Role assignment (P) — SID, client, role, validity, justification. Approvals: manager → role owner → Security, with an SoD acknowledgement.
  - Firefighter access — time-bound; IT Head approval; log-review task on expiry
  - Master data create / change (P)
  - Transport to PRD
  - Batch job
  - Output device
  - Report / data extract (P)
  - New org element → Change
- **Sales apps:** New app user / device mapping (P) · App reinstall / version upgrade (P) · Data correction
- **Digital:** App access (P) · Data correction · DB read access (HANA / PostgreSQL) · New environment / deployment
- **Infra & IT:**
  - Laptop / device (P)
  - Software install (P)
  - VPN (P)
  - Shared mailbox / Teams (P)
  - New joiner IT kit (P)
  - Server / VM request
  - Firewall rule / port opening — approval by Network & Security
  - Cloud resource request
  - Backup restore request

### Approval chains

- **Access / role:** manager → role owner → IT Security
- **Normal change:** module / domain lead → IT Head (CAB)
- **Emergency change:** IT Head now; retrospective CAB within 2 business days
- **Transport to PRD:** QA sign-off with test evidence → module lead
- **Firefighter:** IT Head
- **Firewall / port opening:** Network & Security lead → IT Head

### Canned responses and scenarios (per workspace)

- **Canned responses:**
  - SAP: "Please share SID / client / T-code / error / screenshot"; "SAP case raised"; "Transport in PRD — please verify"; "Workaround".
  - Sales apps: "Please share app version, device model and a screenshot".
  - Infra: "Planned maintenance notice"; "Password reset steps".
- **Scenarios:**
  - "Send to SAP (log case)";
  - "Move to QAS testing";
  - "Request user confirmation";
  - "Declare major incident";
  - "Escalate to app vendor".

---

## P. Business rules

- **Major incident:** triggered by Urgent + Production, or declared by someone with `ticket.declareMajor`.
  - Bell + email to the workspace leads.
  - Update reminders every «30» min.
  - A banner on the ticket.
  - A PIR is required before closing.
  - A problem ticket is suggested on close.
- **Problem detection:** ≥ «3» incidents in 7 days with the same application + category + function (+ T-code / error / server) trigger an insight and an Assist check. Creating the problem links the incidents.
- **Duplicate hint on create:** same application + SID / T-code / error, or the same server, open within 24 h → offer to link / watch instead.
- **Changes:**
  - cannot resolve until all transports are `Imported to PRD` (or marked N/A) and approvals are complete;
  - scheduling inside a FREEZE window warns, and needs `change.freezeOverride` plus a reason;
  - the requester, approver and implementer must be different (SoD).
- **Access requests:**
  - no fulfilment before approval;
  - the validity end date creates a revoke to-do.
- **External references:** "Pending with SAP / Vendor" should have a reference number (soft warning). Nudge after «2» business days without an update.
- **Validation:**
  - T-codes are uppercased;
  - transport numbers match the regex;
  - SAP Notes are numeric;
  - IDoc numbers have 16 digits;
  - Very High in non-production needs a justification.
- **Required before resolve, per workspace:**
  - SAP incident: module, sub-process, environment, root cause, resolution code.
  - Change: transports or N/A, plus test evidence.
  - Defect: test cycle, plus retest Passed.
  - Infra incident: category, environment, resolution code.

---

## Q. Integrations (hooks built; all off by default)

1. **SAP Cloud ALM → Samadhan.**
   - Endpoint: `POST /api/samadhan/integrations/calm/tickets`.
   - Auth: API key or OAuth client credentials, stored server-side.
   - Idempotent on the event-situation id. Creates the ticket in the SAP workspace with source "SAP Cloud ALM".
   - **Returns the ticket id / reference synchronously.**
   - Every call is logged. Admin > Integrations shows the URL, key rotation and the last 50 calls.
2. **Monitoring tools → Samadhan** (Infra alerts). A generic inbound webhook with per-source token, application mapping and de-duplication by alert key.
3. **Teams.** An outbound webhook for Major incident / Urgent / approval-needed events.
4. **SAP lookups (optional, later).** OData through a BTP destination to validate T-codes, users and documents. Until then, `ref_masters` is used.
5. **SolMan ITSM backlog import.** A one-off Excel import with a column mapper, dry-run and error report, done before SolMan's 2027 end of maintenance.

---

## R. Security and privacy

- Workspace and application scope plus confidential rules are enforced in SQL everywhere (§K).
- Every sensitive action is written to the audit log:
  - authorization changes, approvals;
  - workspace / application moves, confidential toggles;
  - priority, freeze and SoD overrides;
  - integration calls;
  - attachment deletes.
- DPDP: anonymisation also clears the detail tables and attachments of that contact.

---

## S. UX principles

- Pick the app first, then the need, then a short form. Ask for more at resolve time.
- Sensible defaults: last application, last SID / client, Production.
- Plain language, with SAP terms in hints.
- Searchable dropdowns when a list has more than 10 items, using existing patterns.
- `Empty` states that say what to do next; `Notice` feedback on every action.
- Presence, Previous / Next, Watch, Scenarios, Merge, Link, Child tickets and CSAT work in every workspace.

---

## T. Testing: end to end, repeated until error-free (§16)

### T.0 The test gate (must be 100% green before any push)

1. **Static checks.** Typecheck, build and lint for the Samadhan frontend and backend: 0 errors. New warnings are fixed.
2. **Backend API tests.**
   - Use Node's built-in `node:test` (no new shared dependency), or the runner the backend already uses.
   - Tests live in `backend/samadhan/tests/` and run against the `samadhan_test` database (§C1). They migrate up from an empty schema, seed, and finish with a down / up round-trip.
   - Cover every route for **each role / profile** (allowed and 403), validation, scope filters, SLA, severity / priority modes, classification, attachments, approvals, transports and integrations (mocked).
3. **End-to-end UI tests.**
   - Add **Playwright** as a devDependency of the **Samadhan frontend only**.
   - Run headless against the local frontend and backend, at desktop size and at a 360 px mobile viewport.
   - Personas: Agent, Supervisor, Admin, scoped agent (one application only), portal requester (no login).
   - Fail the test on any browser console error or failed network request.
   - Save screenshots and traces on failure under `docs/v7/test-artifacts/` (git-ignored).
4. **Regression suite.** Every existing feature, with the flag OFF and ON:
   - **Channels:**
     - email ingest and threading (an old `#id` subject still threads; `/api/setu` aliases still work);
     - portal create / status / CSAT (old `/apps/setu/portal/?csat=` links redirect and work);
     - WhatsApp webhook on both the old and new paths.
   - **Ticket creation and editing:**
     - new ticket (including the distributor lookup);
     - the Properties `expectedUpdatedAt` conflict check.
   - **SLA and routing:** SLA timers and pause; severity matrix; round robin; automations.
   - **Ticket actions:** scenarios, merge, link, child, watch, spam, trash, restore, purge.
   - **Bulk and export:** bulk actions; saved views and counts; export.
   - **Reports:** the **36-column daily report produces byte-identical default output**, compared with the baseline file for the same date range; variants.
   - **Dashboards and analytics:** widgets and Customise; Helpdesk dashboard; Analytics CSV.
   - **Agent tools:** bell and preferences; calls and time logs; canned responses (shared and personal); Solutions; global search; Insights / Assist.
   - **Admin:** Roles & access; Audit; Parked mail.
   - **Navigation:**
     - deep links on both `/apps/setu/?ticket=` (redirect) and `/apps/samadhan/?ticket=`;
     - keyboard shortcuts.
5. **New features.**
   - **Authorization:** the old vs new access comparison for every screen, route and action; Agents get 403 / redirect for every Admin screen, by URL and by API; scope applies to lists, counts, board, search, export, analytics, insights and bell; confidential tickets; temporary-grant expiry.
   - **Attachments:** limits per channel; blocked types (including a renamed `.exe`); clipboard paste and compression; pre-signed URL expiry; inbound email and inline images; purge, merge and anonymise.
   - **Classification:** subject tag, sender rule, keyword, fallback, "Needs classification", correction audit.
   - **End-to-end per workspace:** create → route → SLA → approve → transport → resolve → CSAT → report.
6. **Zero-impact check (§T2).** Every other embedded app and the hub still build, and the shared backend starts and serves every other app's routes. The results must match `BASELINE.md`.
7. **Performance.** Lists and counts on a seeded set of 100k tickets stay within today's response times. Check with `EXPLAIN`.

### T.1 The loop

Run the full gate. If anything fails:

1. Find the root cause.
2. Fix it.
3. Re-run the **whole** gate, not just the failed test.
4. Repeat until it is **completely green**.

Rules for the loop:

- Never skip, delete, weaken or `.only` a test to make it pass.
- A flaky test is fixed at its cause.
- After **3 failed attempts on the same problem**, **STOP** and report the analysis.

At the end of each phase, write `docs/v7/TEST-REPORT.md`: the counts per suite, what was fixed, and the remaining known limitations (must be none for a push).

### T.2 Rollout

1. Push and merge per §T3. The flag is off, so attachments, the Application field, the rename and the authorization cockpit go live.
2. UAT on the dev environment.
3. Enable SAP + Digital + Infra & IT in prod (Admin toggle).
4. Enable the S/4HANA Programme at kick-off «Jan 2027».

## T1. Rename `setu` → `samadhan` (Phase 1, by itself, before any feature work)

**Rename map** (adjust from `RENAME-INVENTORY.md`):

| Item | From | To | Compatibility kept |
|---|---|---|---|
| Frontend folder | `setu/` | `samadhan/` (`git mv`) | — |
| Frontend package name | `setu` | `samadhan` | — |
| Backend folder / mount | `backend/setu/`, `backend/setu.js` | `backend/samadhan/`, `backend/samadhan.js` (`git mv`) | — |
| API prefix | `/api/setu` (and `/dev-api/api/setu`) | `/api/samadhan` | **`/api/setu` stays as an alias to the same router.** It adds a `Deprecation` header and logs callers. Keep it at least «6 months», and at minimum until the WhatsApp webhook and every integration have moved. |
| Base path | `/apps/setu` | `/apps/samadhan` | **`/apps/setu/…` redirects to `/apps/samadhan/…`, keeping the path, query (`?ticket=`, `?csat=`) and hash.** Do this in the web-server / proxy config if one exists. Otherwise ship tiny static redirect pages at the old paths (`index.html`, `portal/index.html`) in the hub build. Links in emails already sent keep working. |
| DB schema | `setu` | `samadhan` | See the schema steps below. |
| Hub app id / Manage Access grant | `setu` | `samadhan` | See the access steps below. |
| Env vars | `SETU_*`, `NEXT_PUBLIC_SETU_API_URL` | `SAMADHAN_*`, `NEXT_PUBLIC_SAMADHAN_API_URL` | **Read the new name first, then fall back to the old one.** Update `.env.example` only. Never edit real `.env` values; list the new names for the team in `RENAME-FOLLOWUPS.md`. |
| Code identifiers | `useSetu`, `SetuContext`, `setuApiUrl`, `Setu` types / comments | `useSamadhan`, `SamadhanContext`, `samadhanApiUrl` … | Rename mechanically. No logic changes. |
| Storage prefixes, job names, log tags, cache keys | `setu…` | `samadhan…` | Existing stored keys stay readable. |
| Docs | READMEs | Updated | Add a "Formerly Setu" note. |

**Schema steps.**

1. Centralise the schema name in one constant: `SAMADHAN_DB_SCHEMA`, default `samadhan`. Every query uses it. At startup, if `samadhan` does not exist but `setu` does, use `setu` and log a warning. This keeps the deploy safe in any order.
2. Before renaming, scan for text references to `setu.` in function bodies, views, triggers and defaults (`pg_proc`, `pg_views`, `pg_trigger`, `information_schema.columns.column_default`). Recreate them so they no longer depend on the old name.
3. Rename with `ALTER SCHEMA setu RENAME TO samadhan`, then re-apply grants, default privileges and `search_path`. The down script renames it back.
4. This is a metadata-only change and runs in seconds. Do it on dev first; prod is handled by the normal release process, never by you.

**Access steps.**

1. Change the Manage Access entry and the grants for **this app only** from `setu` to `samadhan`, keeping all access history.
2. During the transition, the backend guard accepts either app id.
3. Update the hub registry / tile and `scripts/build-embedded-apps.js` entry for this app only.
4. The Samadhan migration only touches hub tables with `WHERE app_id='setu'`.

**What the team does by hand.** List everything that cannot be changed from code in `docs/v7/RENAME-FOLLOWUPS.md`, with exact steps. For example:

- the Meta WhatsApp webhook URL;
- reverse-proxy / CDN rules;
- monitoring checks;
- bookmarks;
- the Cloud ALM destination, later.

**Gate.** Phase 1 ends only when the full §T gate is green, with **no feature changes** mixed in.

## T2. Zero impact on other applications in the repository

1. **Allowed paths.**
   - Samadhan-owned: the Samadhan frontend folder, `backend/samadhan/**`, `backend/samadhan.js`, Samadhan migrations / seeds / tests, `docs/v7/**`, and the Samadhan section of `CLAUDE.md`.
   - Shared files, **only the lines for this app**: the hub registry entry, the `build-embedded-apps.js` entry, the backend route mount, the scheduler registration, the Manage Access seed, web-server redirect rules and `.env.example`.
   - List every shared-file change with its diff in `PROGRESS.md`. Never refactor shared code.
2. **Dependencies.**
   - Prefer what is already installed.
   - New dependencies go into the Samadhan frontend `package.json` only, for example Playwright as a devDependency.
   - If the backend shares one `package.json`, add new packages with an exact version only when unavoidable. Never upgrade or remove existing packages. The lockfile diff must contain only additions.
3. **Database.** Only the `samadhan` (formerly `setu`) schema, plus hub access rows where `app_id` is this app. Never read or write other apps' schemas or rows.
4. **Proof.**
   - Before every push, rebuild every embedded app and the hub, start the shared backend and smoke-test each other app's main route / health.
   - Compare the results with `BASELINE.md`. Any difference is a failure that must be fixed or reverted.
5. **Path guard before pushing.** `git diff --name-only <base>...HEAD` must list only allowed paths. Anything else → **STOP**.

## T3. Git: push this app only, to its branch and to `main`

You are authorised to push **once the full gate (§T) is green** and the phase has passed its STOP review where one is required.

1. **Prepare.**
   - `git fetch --all`.
   - Rebase `feature/samadhan-v7` on the latest `origin/main`, and also on `origin/dev` if it exists.
   - Resolve conflicts only in allowed paths.
   - **Re-run the whole gate after the rebase.**
2. **Check CI.**
   - Read `.github/workflows/*`.
   - If pushing to `main` triggers an **automatic production deployment or production DB migration**, push the feature branch only, then **STOP** and ask before merging to `main`. Say exactly what would run.
3. **Push.**
   - `git push -u origin feature/samadhan-v7`.
   - Stage files by explicit path only. **Never** `git add -A` at the repo root.
4. **Merge to `main`.**
   - If `main` is protected or PRs are the norm: create a PR with `gh pr create`. The PR body includes `TEST-REPORT.md` and the shared-file diff list. Merge once its checks pass.
   - Otherwise:
     - `git checkout main && git pull --ff-only`;
     - `git merge --no-ff feature/samadhan-v7 -m "Samadhan v7 phase N: …"`;
     - re-run the gate on `main`;
     - `git push origin main`.
   - If a `dev` branch is the team's integration branch, merge into `dev` the same way, as confirmed at the Phase-0 STOP.
5. **Never:**
   - `--force` or force-with-lease;
   - rewriting history;
   - pushing other apps' changes;
   - committing `.env` files, test artefacts or credentials;
   - skipping hooks (`--no-verify`).
6. **Report.** Tag the release `samadhan-v7.<phase>` and report the commit SHAs, branch / PR links and CI status in `PROGRESS.md`.

---

## U. Phases (refine in PLAN.md)

| Phase | Scope | Gate |
|---|---|---|
| 0 | Discovery, baseline, rename inventory, APP-MAPPING, test plan, plan | **STOP** |
| 1 | **Rename `setu` → `samadhan`** with the compatibility layer (§T1); test harness set up (§T.0) | Full gate → push branch + `main` (§T3) → **STOP** (I complete `RENAME-FOLLOWUPS.md`) |
| 2 | **Authorization cockpit + permission middleware** (baseline-identical) and **attachments** | Full gate → push → **STOP for review** |
| 3 | Workspaces + Applications foundation: tables, backfill (approved mapping), `APPCODE-id` references, flag, meta, switcher, workspace-aware fields / categories / severity / SLA / groups / statuses, filters, **single-mailbox classification** | Full gate → push → **STOP** |
| 4 | SAP workspace: details, ref masters, Impact × Urgency, new-ticket flow, paste parser, external refs, seeds | Full gate → push |
| 5 | Infra & IT + Digital Apps + Sales-app sub-categories: details, seeds, portal application picker | Full gate → push |
| 6 | Change & access: approvals, catalog, transports, change calendar, SoD rules, registers | Full gate → push |
| 7 | Problem & major incident: PIR, detection, KEDB, dashboards | Full gate → push |
| 8 | S/4HANA Programme: details, defect tracker, burn-down, hypercare | Full gate → push |
| 9 | Integrations: Cloud ALM, monitoring webhook, Teams, SolMan import, Assist upgrades, analytics extras | Full gate → push → final report |

Phases without a STOP continue automatically once their gate is green and the push is done.

Each phase ends with:

- migrations with up / down;
- updated READMEs (frontend and `backend/samadhan`, section "Samadhan v7 (schema v7)");
- `CHANGELOG.md`;
- seeds;
- `docs/v7/PHASE-n-NOTES.md` (what changed, how to test, how to roll back);
- `TEST-REPORT.md`;
- `PROGRESS.md`;
- commits and pushes per §T3.

## V. Definition of done

- The name is **Samadhan** everywhere: UI, code, folders, routes, schema, hub id, env vars and docs.
  - Old `setu` links, routes and integrations still work through aliases and redirects.
  - The manual follow-ups are documented.
- All existing features work unchanged, and the full test gate is green with zero errors.
- Other apps in the repository build and run exactly as in `BASELINE.md`.
- Every ticket has a unique `APPCODE-id` reference and can be filtered and reported by application everywhere.
- One mailbox handles everything, with visible, correctable classification.
- An agent can log an SAP incident, an access request with approvals, a change with transports, a sales-app bug, a B2B / B2C issue and an infra incident — each in under 60 seconds of form filling, with screenshots attached.
- Only Admins see Admin and the Authorization cockpit. Agents see only their permitted screens and data, enforced by the server.
- Admins configure every list, matrix, chain, application, permission and workspace without code.
- No secrets in any committed file, no destructive data migration, and a full audit trail.
- The changes are on `feature/samadhan-v7` and merged into `main` (and `dev` if confirmed), with tags and reports.

## W. Do not

- Do not change ticket ids or the email-threading token. Do not remove the `/api/setu` alias or the `/apps/setu` redirects before the agreed period.
- Do not add a new mailbox or change the existing support email.
- Do not touch other apps' code, schemas, data or dependencies beyond the Samadhan lines in shared files (§T2).
- Do not rewrite or reformat unrelated code, or add new UI / CSS / state frameworks.
- Do not store files in Postgres, or store SAP / cloud / RDP credentials anywhere.
- Do not fabricate SAP Note numbers, component codes or customer data.
- Do not enable new workspaces in production by default.
- Do not connect to production systems or run production migrations.
- Do not force-push. Do not push with a red gate. Do not pass a **STOP** without approval.

**Start now with section C, then Phase 0.**

---

