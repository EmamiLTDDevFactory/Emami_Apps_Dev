# Samadhan v7 — Phase 6 notes (change and access)

Master prompt §I, §M, §N 5-10, §O (service catalog, approval chains), §P (change and access rules). Done on 2026-11-07.

## What a user sees

- **Service catalog.** New ticket, under "I need something / Access / A change", offers 26 requests across the desks
  (§O): new SAP user, role assignment, firefighter, transport to PRD, VPN, laptop, firewall rule, and others. An
  item asks its own questions and presets the class, category and fulfilment group. When the item has an approval
  chain, the request is sent for approval. Portal-visible items also appear on the portal once an application is picked.
- **Approvals.**
  - Six chains are seeded: Access / role (manager → role owner → IT Security), Normal change, Emergency change,
    Transport to PRD, Firefighter and Firewall.
  - The **manager** gets a **one-click email link**, which works once and expires after 7 days. The other steps go to
    people with `approval.decide` and appear under **My approvals**.
  - Each person can Approve, Reject (with a comment), or ask for information (Need info).
  - Segregation of duties: the requester and the assigned (implementing) agent never approve, and no one approves two
    steps of the same approval. Someone with `approval.override` can decide for another approver.
  - Overdue steps get a daily reminder.
  - The ticket waits in "Awaiting Approval". It returns to Open when the approval completes or is rejected.
- **Transports (SAP / S/4 changes).** The card shows each transport as a pipeline: Created → Released → QAS → QAS OK → PRD OK → PRD.
  - The number format is checked: SID + K9 + 5 digits; Admin can change the pattern in setting `transport.regex`.
  - The PRD sign-off needs a QAS test, and must come from someone other than the owner and the tester.
  - A return code of 8 or more marks the transport Failed.
- **Change plan.** Type, risk, planned window, implementation and back-out plan, test evidence, and "transports not
  applicable". Scheduling inside a **FREEZE** window is refused. It needs `change.freezeOverride` plus a reason, which is audited.
- **Before resolving:**
  - every approval must be complete;
  - an SAP / S/4 change needs its transports in PRD (or reverted) and test evidence, or N/A plus test evidence;
  - an access request needs its approval first.

  On resolve, an access request with a validity end date creates a **"Revoke access"** to-do for the assignee.
- **New screens** (shown while the service desks are on):
  - **My approvals**;
  - **Change calendar**: a month view with risk colours and freeze / maintenance windows; a day list on a phone;
  - **Registers**: Change & Transport, Access Request Log, SAP Incident, Infra & IT, Digital Apps, Sales Apps (Phase 7 adds Problem / KEDB and Major Incident).
    Registers have date and application filters and export to Excel. They need the Reports screen (Supervisor and up).
- **Admin:** Service catalog (questions as simple lines), Approval chains (step editor), Change windows.
- **Lists:** filters `hasOpenApproval`, `transportStatus` and `changeType`. Search finds transport numbers.
- **Portal:** when desks are open to it, the header reads "Support for sales apps, SAP, IT and infrastructure".

## Backend

- **Migration `7.6-change`** adds these tables: `ticket_transports`, `ticket_change_details`, `approval_chains`,
  `ticket_approvals`, `service_catalog_items`, `change_windows`. It also seeds the chains and the catalog. Down drops the tables.
- `SCHEMA_VERSION` 14. `approval` is added to the bell events.
- **Engine:** `lib/change.js`. **Routes:** `routes/change.js`.
- **Public routes:** `GET/POST /portal/approval/:token`.
- Catalog requests: `POST /tickets` and `POST /portal/tickets` accept `catalogItemId`, `catalogAnswers` and `managerEmail`.

## Demo (dev)

Run `bash ~/samadhan-demo/run.sh load-v7-change`. It adds:

- a month-end freeze window and a Saturday maintenance window;
- 6 planned changes, with transports at each stage;
- 3 access requests waiting for approval.

## Tests

- `tests/change.api.test.js` (75 checks). The gate's `change` stage runs 7.6 down, then up, then the suite.
- Workspace rollback now takes 7.6 down first.
- The permissions baseline records the registers as Supervisor-and-up.
- E2E: "change & access: transports, approvals, my approvals, calendar, registers, admin catalogue".

## Rollback

Run `node backend/samadhan/db/migrate.js down 7.6-change`.
