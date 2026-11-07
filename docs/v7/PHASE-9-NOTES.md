# Samadhan v7 — Phase 9 notes (integrations, Assist upgrade, analytics extras) and final report

Master prompt §Q, §M (Insights / Assist), §N 9. Done on 2026-11-08. **Every integration ships switched off.**

## Integrations (Admin > Integrations)

| Integration | What it does | How it is secured |
|---|---|---|
| **SAP Cloud ALM → Samadhan** | `POST /api/samadhan/integrations/calm/tickets` with `{ eventSituationId, title, description, priority, system, environment, serviceName, link }` | API key in `x-api-key` (or Bearer), made / rotated in Admin, stored hashed, shown once |

Cloud ALM behaviour:

- A situation creates a ticket in the mapped application (default SAP), with source "SAP Cloud ALM" and SAP details.
- It is **idempotent** on the event-situation id: a repeat returns the same ticket.
- The ticket id and reference are **returned synchronously**.

| Integration | What it does | How it is secured |
|---|---|---|
| **Monitoring → Samadhan** | `POST /api/samadhan/integrations/monitoring/<sourceId>/alerts` with `{ alertKey, title, severity, host, description, status }` | One token per source (Zabbix, PRTG, Azure Monitor ...), hashed, rotatable |

Monitoring behaviour:

- An alert creates a ticket in the source's application. Severity maps to priority (critical → Urgent), and the host goes into the IT details.
- The same `alertKey` while the ticket is open adds a note; `status: resolved` notes that the alert cleared.

| Integration | What it does | How it is secured |
|---|---|---|
| **Teams** | A card in a channel for major incidents, new Urgent tickets (outside Secondary Sales) and approvals needed | Only Teams / Power Automate webhook hosts are accepted; the URL is not echoed back in full |
| **SolMan ITSM import** | One-off Excel import of the SolMan backlog: column mapper (with guesses), **dry run** with a line-by-line error report, then import | Admin only. Re-importing skips tickets already in. The original created date is kept and the status is mapped. |

Common to all four:

- The **last 50 calls** (OK and refused) are listed in Admin > Integrations; the log keeps 500 per integration.
- The inbound endpoints are rate-limited (120 per minute per address) and answer **404 while switched off**.
- On dev, outside callers reach the API through the forwarded route until the web server forwards `/api/samadhan`
  (`deploy/add-samadhan-nginx-route.sh`, needs root).

## Assist (Insights) upgrade

- The category list given to the AI is now the **ticket's own desk** tree. Before this, every desk's categories were
  mixed, so SAP modules could be suggested for a sales ticket. The rule-based fallback uses the same tree.
- The AI receives the desk, the application, the record class, and the SAP / IT details.
- **Desk guidance**, all with "never invent SAP Note / KBA numbers":
  - SAP: likely T-codes, SAP for Me search keywords, a missing-information checklist (SID / client / T-code / message / screenshot / steps / users), and the RISE owner;
  - S/4 programme: test cycle, work stream and retest;
  - Infra: containment first for security incidents;
  - Digital: URL, HTTP status, correlation id, likely layer.
- **Confidential tickets never go to the AI**: the built-in suggestions are shown with a note. The dashboard's
  "oldest open tickets" list given to the AI leaves out confidential tickets.

## Analytics extras (Analytics > "SAP, change & infra", while desks are on)

- KPI tiles: change success rate (resolved changes with no failed / reverted transport), emergency-change share, open Infra P1, SAP cases waiting.
- **SAP module heat-map**: tickets per module, with open and SLA-breached counts. Clicking a module opens the list.
- Top T-codes, top error messages, and **external-case ageing** (0-2 / 3-5 / 6-10 / over 10 days without an update).
- Infra **mean time to resolve by domain**.
- Per-application KPIs (volume, SLA %, MTTR, reopen %, CSAT) have been on the "By application" tab since Phase 3.

## Backend

- **Migration `7.9-integrations`:**
  - tables `integrations`, `integration_sources`, `integration_calls`, `integration_events`;
  - the four integrations are seeded **off**;
  - the sources SAP Cloud ALM, Monitoring alert, Teams, Walk-in and SolMan import are added to `sources.extra` (down removes only those).

  `SCHEMA_VERSION` 17.
- **Code:** `lib/integrations.js`, `routes/integrations.js` (inbound router before sign-in; Admin router), `routes/analyticsDesks.js`.
- **Teams hooks** live in `problem.declareMajor`, `change.notifyStep` and `tickets.createTicket` (Urgent outside Secondary Sales).
  They are fire-and-forget: a failed post is logged and never blocks the ticket.
- `createTicket` accepts `allowAnyDesk` for records made by the system (integrations, problems, imports) into a desk that is switched off.

## Tests

- `tests/integrations.api.test.js` (38 checks). The gate's `integrations` stage runs 7.9 down, then up, then the suite.
- E2E: "Admin > Integrations (all off) and the SAP / change / infra analytics".

## Rollback

Run `node backend/samadhan/db/migrate.js down 7.9-integrations`.

---

# Final report — Samadhan v7 (Phases 0–9)

| Phase | Scope | Migration |
|---|---|---|
| 1 | Rename setu → samadhan, test harness | 7.0-rename (historical) |
| 2 | Authorization cockpit, permissions, data scope, attachments | 7.1-auth, 7.1-attachments |
| 3 | Service desks, applications, `APPCODE-id` references, single-mailbox classification | 7.2-workspaces, 7.3-generic |
| 4 | SAP & Primary Sales desk: SAP details, masters, paste parser, external refs, confidential | 7.4-sap |
| 5 | Digital Apps, Infra & IT, IT details, portal application picker | 7.5-it |
| 6 | Change & access: catalogue, approvals (one-click, SoD), transports, change calendar, registers | 7.6-change |
| 7 | Major incident, PIR, problem / KEDB, candidates, duplicate hints, service health | 7.7-problem |
| 8 | S/4HANA Programme: details, defect SLA, retest, burn-down, KPIs, hypercare | 7.8-program |
| 9 | Integrations (Cloud ALM, monitoring, Teams, SolMan import), Assist upgrade, analytics extras | 7.9-integrations |

- **Test gate** (`backend/samadhan/tests/gate.js`):
  - static: typecheck, lint, build, backend syntax;
  - unit tests;
  - DB suites: API, authz, attachments, workspaces, SAP, IT, change, problem, programme, integrations, each with its migration rolled down and up again;
  - golden byte-identical daily report / export;
  - zero-impact smoke test on other apps;
  - E2E in Edge at desktop and 360 px;
  - path guard.

  Every phase was pushed only on a green gate.
- **Dev:** every phase is deployed to the dev backend, with clearly tagged demo data (`run.sh load-v7-*`; `run.sh remove` deletes it).
  The new desks stay **off** until Admin switches them on (Admin > Service desks), so Secondary Sales users see what they saw before.

**Still to do outside the code:**

1. The server admin runs `deploy/add-samadhan-nginx-route.sh` (root) so `/api/samadhan` is forwarded on dev. Then
   `FALLBACK_ROUTE` / `TRANSPORT_PATH` can be set to null and the last internal trace of the old name goes.
2. Rotate the server and database passwords that were shared in chat.
3. For UAT, switch the desks on (Admin > Service desks), assign the desk profiles (Admin > Authorization cockpit), and
   replace the sample SAP landscape rows in Admin > SAP & Infra masters.
4. Production: not touched. Promote when UAT signs off.
