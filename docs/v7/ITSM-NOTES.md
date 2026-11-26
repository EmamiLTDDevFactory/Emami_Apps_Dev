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
