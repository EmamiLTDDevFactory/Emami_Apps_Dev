# Samadhan v7 — Phase 3 notes: service desks (workspaces), applications, references, mail classification

Branch `feature/samadhan-v7`. Scope: master prompt §U row 3 (§H 6 / 7, §I, §J, §M, §N 2–11). Application mapping as
approved by the user on 2026-11-07 (`APP-MAPPING.md` §0): Rural mSFA → own code **RMSFA**, CDMS → own code **CDMS**,
SalesCode SFA → MR, Manager App → SUP, Portal → DMS, Salescode B2B App stays in Secondary Sales as **SCB2B**.
Backfilled rows are marked `backfill` (Q-M6) and do not appear in "Needs classification".

## 1. What changed

### Service desks (workspaces) — off by default
- Five desks: **Secondary Sales** (today's Samadhan, always on), **SAP Support**, **S/4HANA Programme**, **Digital Apps**,
  **Infra & IT**. The others receive tickets only while **Admin > Service desks** is switched on *and* the desk itself is
  enabled. With the switch off, Samadhan looks and works as before (no switcher, only Secondary Sales applications).
- Per desk: name, short code, colour, description, priority mode (severity matrix / Impact × Urgency / both), Category /
  Function labels (SAP: Module / Sub-process), default group, portal visibility. Impact × Urgency matrix editable per desk.
- Workspace-aware: fields and choices (`field_workspaces`, `field_choices."workspaceId"`), category tree, severity rules,
  SLA policies (application → desk → today's group logic → default), statuses (`status_workspaces`; a status without a
  mapping is offered everywhere), groups, canned responses, scenarios, automations, articles, templates and saved views
  (`"workspaceId"` columns, NULL = all). Seeds for the SAP / Infra / Digital trees come in Phases 4–5.
- **Desk switcher** at the top of the sidebar ("All" + the desks in the person's scope; remembered in My preferences);
  narrows the ticket list, the board, the helpdesk dashboard and analytics.

### Applications and references
- 29 applications (§H 7.2 plus RMSFA, CDMS, SCB2B), each with keywords used by mail classification. Every ticket has one
  (NOT NULL, default SS); the desk follows the application. Admin > Applications: create, rename, keywords, owners,
  support group, active, portal visibility; **the code is fixed once a ticket uses it**.
- **`APPCODE-id`** (e.g. `MSFA-100123`) wherever a ticket number appears: list, board, ticket header, bell, global search,
  contacts, dashboards, related tickets, portal, optional export / report columns. Search accepts `MSFA-100123`,
  `#100123` or `100123`; the portal status check accepts the reference too.
- Outbound subjects: `Re: <subject> [MSFA-100123] [#100123]` — the reference goes **before** the kept `[#id]` token, so
  threading is unchanged (a reference on its own never threads; Phase 1 test). Admin can turn the prefix off.
  The acknowledgement mail names the reference and the application.
- Changing the application to one in **another desk** is a move: needs `ticket.moveWorkspace` (Supervisor / Admin by
  default), asks for confirmation in the UI, is written to the ticket history and the audit log.
- New ticket: **"Which app or area?"** first — searchable tiles grouped by desk, recently used first (default: the last
  one used, else Secondary Sales – General). Child tickets keep the parent's application unless changed.
- Properties: Application, Record class (INCIDENT, SERVICE_REQUEST, … from the type's `meta.recordClass`), Impact and
  Urgency (desks in that priority mode) with a live "Priority: High" hint. Bulk action "Set application".
- Filters: Application (chip next to the search), record class, desk; view **Needs classification**.

### One mailbox, automatic classification (§J)
- New mail tickets only (replies keep their ticket): **subject tag** (`[MSFA] …`, `MSFA: …`, `[Rural mSFA App] …`) →
  **sender rule** (Admin: address or domain → application) → **keywords** (application keywords; SAP patterns: T-code,
  ST22 / short dump, IDoc, transport numbers) → **AI** (only with a key on the server and the setting on, above the
  threshold «0.8») → **default** (SS). Never into a desk that is switched off.
- Source and confidence are stored; the ticket header shows **"Auto-classified as …"** with **Confirm / Change** for
  default, AI or weak keyword results. Corrections teach a learning table; Admin > Mail classification lists keyword
  **suggestions**, which are only added when an Admin clicks them.
- Portal and agent-created tickets without an application go through the same classification.

### Data scope by desk / application (deferred from Phase 2)
- Cockpit > User access: "Service desks" and "Applications" (none = all) on top of all / groups / own. Applied in SQL to
  every list, count, board, search, dashboard, report and the bell; a ticket outside answers 404; queue-wide insights
  hidden for a narrowed scope.

### Reports and analytics
- Analytics: application filter and a **By application** tab (volume, open, resolved, resolution SLA %, mean time to
  resolve, reopen %, CSAT positive) plus a by-desk chart. Helpdesk dashboard: "Application wise".
- Daily report: optional **Reference / Application / Workspace** columns (Columns picker), appended after the 36; the
  default report is byte-identical (golden test).
- Export: optional Reference, Application, Workspace, Record class, Classification columns (default export unchanged).

### Database — migration `7.2-workspaces` (runs at start-up; down step available)
- New: `workspaces`, `applications`, `priority_matrix`, `status_workspaces`, `field_workspaces`, `mail_sender_rules`,
  `classification_learning`. New columns: `tickets."workspaceId" / "applicationId"` (NOT NULL, default SS),
  `"recordClass"`, `"classificationSource"`, `"classificationConfidence"`, `impact`, `urgency`, `custom`;
  `"workspaceId"` on groups, SLA policies, severity rules, canned, scenarios, automations, articles, templates, saved
  views; `"applicationId"` on SLA policies and automations; `field_definitions.storage`; `field_choices."workspaceId" / meta`.
- Backfill of every existing ticket per §0 (category / function / type never changed). Expected on dev: MSFA 448,
  RMSFA 156, CDMS 400, DMS 26, MR 11, SS 292 (plus the demo tickets).
- Settings: `workspaces.enabled` (false), `mail.classification` ({ai: false, threshold: 0.8, defaultCode: 'SS'}),
  `ref.prefixInSubject` (true).

## 2. How to test
- Gate (`node backend/samadhan/tests/gate.js`, or in parts with `--stages=`): unit incl. `workspaces.unit.test.js`; part
  `ws` = `7.2-workspaces` down → up on a new database, then `workspaces.api.test.js` (97 checks); E2E incl. references,
  the application picker, Confirm on an auto-classified ticket, Admin > Service desks + switcher.
- By hand on dev: Admin > Service desks → switch on, enable SAP and Infra; the switcher appears. Raise a ticket with
  subject `[SAP] user locked` (or from the portal) and see `SAP-<id>`; `VPN not connecting` goes to NET. Open
  Tickets > More views > Needs classification and confirm or change one.
- Demo data: `bash ~/samadhan-demo/run.sh load-v7-apps` (after `load-v7`).

## 3. Roll back
- Code: redeploy the previous backend folder (`samadhan.bak-preSamadhan-<ts>`) and the previous site build.
- Database: `node samadhan/db/migrate.js down 7.2-workspaces --yes`, then restart — drops the new tables and columns
  (ticket category / function / type were never changed; the readable references disappear with the columns).
- Only the desks: switch **Admin > Service desks** off — tickets stay in their application, nothing else changes.
