# Samadhan v7 — Phase 4 notes (SAP & Primary Sales desk)

Master prompt §N. Done on 2026-11-07, gate green in parts (static + unit 7/7, db 17/17, sap 4/4, e2e 4/4 with 37 browser checks).

## What a user sees

- **New ticket** for a non-sales desk starts with **What do you need?**: Something is broken, I need something,
  Access, A change, A question, and (SAP / S/4 desks) **Track an SAP case**. The tile sets the record class, and the
  record class sets the SLA. Track an SAP case asks for the SAP for Me case or vendor ticket number.
- The SAP desks get an **SAP details** section with typeaheads: system, then client (filtered by system), T-code,
  Fiori app, company code, plant and org data. **Paste error / dump text** reads an SAP message, an ST22 header,
  IDoc / transport / SAP Note numbers or an HTTP status and proposes the values; the agent applies them.
- **Ticket view:**
  - an SAP details card (view and edit);
  - an **External references** card showing ageing, with "no update for N days" highlighted after 2 days, a status
    per reference, and a justification required for "Very High" outside Production;
  - a **Confidential** pill, plus Mark / Remove confidential for people with `ticket.setConfidential`.
- **Canned responses** and **scenarios** only offer the ones for the ticket's desk, plus the ones for every desk.
- **Tickets list:** SAP system, T-code, environment and external-case filters, and a "Confidential only" filter for
  people allowed to see confidential tickets. Search finds case numbers, IDocs, T-codes, dump names and error text.
- **Admin > SAP & Infra masters:** 15 master lists, each with Excel or CSV import (columns Code, Description, Parent,
  Active, in any order), download as Excel, single-row add and delete. Starter rows are seeded: 55 standard T-codes,
  10 Fiori apps, 6 interfaces, and a **sample** landscape (ECD / ECQ / ECP, BW, S/4 and SolMan SIDs, clients
  100–500, 3 batch jobs). Replace the sample rows with the real landscape.

## Backend (commit c3515b0 + this commit)

- **Migration 7.4-sap** (`db/migrate.js`):
  - tables `ref_masters`, `ticket_sap_details`, `ticket_external_refs`;
  - ticket columns `confidential`, `rootCauseCategory`, `resolutionCode`;
  - SAP types and the Module → Sub-process tree;
  - 11 groups and module routing;
  - statuses 100–108 for the non-sales desks;
  - 3 incident SLA policies;
  - canned responses and scenarios;
  - per-desk field rules;
  - the starter masters.

  Down removes exactly what up added (manifest in settings `seed.7.4`).
- **Routes** (`routes/sap.js`):
  - `GET/PUT /tickets/:id/sap`;
  - `/tickets/:id/external-refs` (create, update, delete);
  - `GET /ref-masters`;
  - `/admin/ref-masters` (list, save, `/import`, delete).
- **Engine:**
  - automations are scoped to their desk;
  - confidential by default for SAP HR payroll, tax and PA, and for Infra cyber security;
  - per-desk "required before resolve" (SAP: category, root cause, resolution code; environment for incidents);
  - a job that nudges on external references after 2 business days without an update;
  - data scope hides confidential tickets, including by id.

## Demo (dev)

`bash ~/samadhan-demo/run.sh load-v7-sap` (after `load-v7-apps`) adds the following to the demo SAP tickets:

- SAP details;
- four external cases of different ages;
- one confidential payroll ticket.

`remove` deletes them with the tickets.

## Tests

- **`tests/sap.api.test.js`** (50 checks):
  - SAP details;
  - parser-shaped input;
  - references and the Very High rule;
  - masters and typeaheads;
  - confidential scope;
  - desk routing.
- **Gate:** new `sap` DB stage (7.4 down and up on a fresh database, then the suite).
- **E2E:** "SAP desk: SAP details, external case, confidential and the masters tab" (desktop and 360 px).
