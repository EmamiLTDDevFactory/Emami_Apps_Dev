# Samadhan — ITSM support model (migration 7.11-itsm), 2026-11-26

Why: Samadhan replaces the ITSM tool of the on-site support vendor (Allied Digital). Emami is the client, Allied Digital
the ITSM support vendor (infra: laptop, desktop, servers, network; software applications), Azure the hyperscaler for
all servers incl. SAP and BW. The vendor and the cloud may change, so all three are lists, not code.

## Gap analysis (Samadhan vs ITIL / the ITSM overview video)

| ITSM area (video + ITIL 4) | Samadhan before | Added now |
|---|---|---|
| Client ↔ service provider, SLA per contract | SLA policies per desk / priority | Client, ITSM support vendor, hyperscaler lists; contract ref, dates, resolution-SLA target per vendor |
| KPIs / monthly "report card" for payment / penalty | Analytics per agent / application | **Support vendors** scorecard: response + resolution SLA, contract target met / missed, first contact resolution, MTTR, open past due, escalations, major incidents, CSAT, contract end warning; Excel report card |
| Incident logging channels (phone, email, chat, portal, app) | Email, Phone, Portal, WhatsApp, Chat | — (present) |
| Categorise, prioritise (impact × urgency), response vs resolution time | Present | Lifecycle strip on the ticket (Logged → Categorised → Prioritised → Assigned → Diagnosing → Resolved → Closed) with the next step |
| Resolved on call vs on-site visit; first call resolution | — | Resolution codes "Resolved on call / remote session", "Deskside / on-site visit"; FCR KPI |
| Escalation: functional (L1/L2/L3) and hierarchical | L3 status, one escalation group | **Escalation matrix** (levels 1–6, vendor / client side, hours after due, per desk / priority); automatic climb when overdue; manual "Escalate" with a reason; history on the ticket; email template `agent.escalation_level` |
| Document the learning (knowledge) | Solutions / KB | "Save the fix as a knowledge article" on resolved tickets (draft) |
| Human error as incident cause | Root-cause list | "Human error (change / patch)" |
| Problem, KEDB, RCA, change, CAB, catalogue, self-service portal, monitoring (NOC/SOC) | Present (Phases 6, 7, 9) | — |
| IT asset management (tag, allocate, register in the tool) | Asset tag text, SERVER / SITE masters | **ASSET** master (asset tag → model / user, site) with typeahead in IT details |
| Hosting / cloud | AWS / Azure only | GCP, OCI, IBM, SAP RISE, Indian DCs ...; Infra categories Google Cloud, OCI, other DC |
| Moving from the old tool | SolMan import (SAP) | **Ticket migration** templates: ITSM (vendor tool) and Secondary Sales open tickets |

## Admin > Support model
- Who is who: client, current ITSM support vendor, current hyperscaler, desks the vendor supports (Infra & IT and Digital
  Apps today), automatic escalation on / off. Changing the vendor offers to move the open tickets (audited, one activity
  line per ticket); history stays.
- Escalation matrix and the lists (21 Indian / global ITSM vendors, 15 hyperscalers / data centres, the client).

## Admin > Ticket migration
1. Download template — xlsx built in the browser from live lists: sheet to fill (header only), Instructions, Example, Lists.
2. Upload & check — every row checked, nothing saved; errors per row, downloadable.
3. Import — tickets keep the old number (`tickets.legacyRef`, searchable, shown on the ticket), logged date, status
   (aliases: New / Assigned → Open, Work in progress → In Progress / WIP, On hold → Pending, vendor → Pending with Vendor),
   group / agent / vendor, IT or sales fields, the old tool's last update as a private note, tag `migrated`, source
   "Migration import". Created quietly: no acknowledgement, assignment mail, major-incident flag or Teams card.
   SLA clock from the import (default) or the original date (overdue ones marked without mails). Re-upload skips
   tickets already moved. Download "old number → Samadhan reference" for user communication.

## Backend
- Migration `7.11-itsm` (start-up, with down): tables `support_partners`, `escalation_contacts`, `ticket_escalations`;
  ticket columns `supportPartnerId`, `legacyRef`, `escalationLevel`, `escalationLevelAt`; settings `itsm.*`; email
  template; Infra cloud categories + routing rules; source "Migration import". Rows added to existing tables are in
  settings `seed.7.11`.
- Code: `lib/itsmSeed.js`, `lib/itsm.js`, `lib/ticketImport.js`, `routes/itsm.js`; hooks in `createTicket` (vendor,
  legacy number, `quiet`), the scheduled jobs (escalations), search (old number), IT hosting validation, `/meta.itsm`.
- Permissions: `admin.supportModel`, `admin.migration` (Admin only); ticket routes use `ticket.view` / `ticket.edit`;
  scorecard `screen.analytics`.

## Tests
- `tests/itsm.api.test.js`; gate stage `itsm` (7.11 down → up → suite). The `ws` and `it` stages take 7.11 down first.
- Demo (dev): `bash ~/samadhan-demo/run.sh load-v7-itsm` — DEMO contract, 4 demo escalation levels, 8 demo assets,
  6 ITSM + 4 Secondary Sales migrated tickets (`DEMO-…`), escalated overdue Infra tickets. `run.sh remove` removes it.

## Rollback
`node backend/samadhan/db/migrate.js down 7.11-itsm --yes`

---

# Update 2026-11-27 — CMDB, ITSM overview, ITSM practice tags (migration 7.12-cmdb)

## ITIL 4 coverage after this update

| ITIL practice | Where in Samadhan |
|---|---|
| Service desk | Channels (email, phone, portal, WhatsApp, chat), groups L1 / L2 / L3, Dashboard |
| Incident management | Tickets (record class Incident), impact × urgency, SLA, lifecycle strip, escalation |
| Major incident | Banner, bridge, update clock, post-incident review |
| Service request management | Service catalogue, approval chains, fulfilment, access revoke to-do |
| Problem management | Problem records, root cause, workaround, KEDB, candidate detection, repeat incidents per CI |
| Change enablement | Change plan, risk, CAB approvals, freeze windows, change calendar, post-change review |
| Release management | SAP transports DEV → QAS → PRD with sign-off |
| **Service configuration management** | **New: Configuration (CMDB)** - identification, control (history), status accounting, relationships, verification / audit, CIs on tickets |
| **IT asset management** | **New: asset register in the CMDB** - tag, allocation to a user, lifecycle stock → in use → repair → retired → disposed, warranty, Excel import |
| Knowledge management | Solutions, known errors, "Save the fix as a knowledge article" |
| Service level management | SLA policies, business hours, reminders, breaches, analytics |
| Supplier management | Support model, vendor scorecard, report card, contract target |
| Escalation | Functional (groups / L3) and hierarchical (escalation matrix) |
| Workflow & automation | Routing rules, approval chains, time automations, scenarios, statuses |
| Monitoring & event management | Monitoring / Cloud ALM integrations |
| Measurement & reporting | Analytics, registers, daily report, Excel exports |
| Availability / service health | Service-health strip on the Dashboard |

Not built (outside a service-desk tool, or later): capacity management, IT continuity / DR plans, financial management of IT
assets (depreciation). DR is recorded as an environment and in post-incident reviews.

## What a user sees
- **ITSM overview** (menu, after Dashboard): who is who (client / vendor / hyperscaler), a tile per practice with plain
  words, live numbers and a button to where it lives, and the step-by-step workflows (incident, request, problem,
  change, configuration).
- **ITSM practice tags** ("ITSM · Incident", "ITSM · Change" ...) under every menu item, on screen headings, on the ticket
  cards (Properties, Lifecycle, Problem, PIR, Change plan, Approvals, Transports, IT details, External references,
  Support & escalation, Configuration items) and above each Admin section. Hover a tag for its meaning.
- **Configuration (CMDB)** (menu): KPIs (items, in repair, not verified 180 days, warranty ending, repeat incidents),
  search and filters, item drawer (facts, relationships, tickets on the item, history), add / edit (Supervisor and up,
  permission `cmdb.manage`), "Verified" (audit), Excel template + import.
- **Ticket > Configuration items** card: linked CIs, suggestions from the asset tag / server / application, search to link.

## Backend
- Migration `7.12-cmdb` (start-up, with down): `config_items`, `ci_relations`, `ci_history`, `ticket_cis`; seeded with
  copies of the ASSET / SERVER masters and one "Application / Service" CI per active application.
- `lib/cmdbSeed.js`, `lib/cmdb.js`, `routes/cmdb.js` (CMDB routes and `GET /itsm/overview`, scoped).
- Permission `cmdb.manage` (Supervisor and Admin); view / link with `ticket.view` / `ticket.edit`; import is a heavy call.
- Tests: the `itsm` suite now also covers the CMDB and the overview (86 checks); every 7.11 rollback in the gate also
  rolls 7.12. E2E "ITSM overview, CMDB and ITSM practice tags". Demo: `run.sh load-v7-cmdb`.

Rollback: `node backend/samadhan/db/migrate.js down 7.12-cmdb --yes`
