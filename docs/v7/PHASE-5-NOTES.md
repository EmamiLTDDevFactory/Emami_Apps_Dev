# Samadhan v7 — Phase 5 notes (Digital Apps, Infra & IT, Sales-app sub-categories, portal application picker)

Master prompt §I (ticket_it_details), §N, §O. Done on 2026-11-07. The gate was run in parts and every part was green:

| Gate part | Result |
|---|---|
| static + unit | 7/7 |
| db | 23/23 (includes the new `it` stage) |
| e2e | 4/4 (39 browser checks) |

## What a user sees

- **Digital Apps and Infra & IT have their own lists.** They no longer fall back to the Secondary Sales categories.
  - Types carry a record class: Incident, Service Request, Access Request, Change Request, Defect / Bug (Digital),
    Enhancement (Digital), Problem, Query / How-to.
  - Category → Sub-category trees follow §O: Frontend / API / OData / HANA / PostgreSQL ... and Servers & Storage /
    Cloud AWS / Azure / Network / Database Admin / Cyber Security / End-user IT / M365 / Identity ...
- **Routing:**
  - Digital: Apps Support (triage), Frontend, Backend / API, Data.
  - Infra: IT Service Desk (triage), Server & Storage, Cloud Ops, Network & Security, M365, End-user Support.
  - A category routes to its group. Anything unknown goes to the desk's triage group.
- **Cyber Security** tickets start **Urgent** and **confidential**, and go to Network & Security.
- **App details / IT details** appear on New ticket and as a card on the ticket.
  - Digital: layer, environment, platform, browser, app version, page URL, API endpoint, OData service, HTTP status,
    correlation id, database, hosting.
  - Infra: server (typeahead from the SERVER master), IP / host, asset tag, site (SITE master), device, OS.
  - "Paste error text / response" picks up the HTTP status, a correlation id, the URL and an IP.
- **Tickets list:** Layer, Platform and Hosting filters. Search finds correlation ids, server names, asset tags, IPs,
  URLs and API endpoints.
- **Secondary Sales:** a new category, **Sales App (any)**, with **Attendance / GPS** and **App Crash / Performance**.
  These are the two §O sub-categories that had no equivalent (DISCOVERY §9.1). Nothing else in the Sales tree changed.
- **Portal:**
  - **Which app or area?** appears when service desks are on and a desk is open to the portal (Admin > Service desks
    > Visible on the portal).
  - The picker is searchable and grouped by desk.
  - The categories follow the chosen desk, and the distributor field shows only for Secondary Sales.
  - "Not sure" keeps today's automatic classification.
- **Fixes:**
  - The portal category list no longer shows other desks' categories. Since Phase 4 it had been showing the SAP modules.
  - The Digital Apps Agent profile is now scoped to `DIGITAL_APPS`. Its scope preset named a desk code that does not exist.

## Backend

- **Migration `7.5-it`:**
  - adds the `ticket_it_details` table;
  - seeds types and trees, but only for desks that do not have their own lists yet;
  - seeds 10 groups and the desks' default groups;
  - adds 14 routing rules ("Digital: …", "Infra: …");
  - adds the Sales-app category;
  - adds 4 canned responses;
  - fixes the Digital Apps Agent profile.

  Down removes exactly what up added; the manifest is in settings `seed.7.5`. `SCHEMA_VERSION` is now 13.
- **Routes:** `GET/PUT /tickets/:id/it` (permissions `ticket.view` / `ticket.edit`).
  - `POST /tickets` accepts `it`, which is validated before the ticket is created.
  - The ticket detail includes `it`.
- **Filters:** `layer`, `platform`, `hosting`.
- **Meta:** `itLists`.
- **Portal config:** `applications` and `categoriesByWorkspace` (only when relevant). `POST /portal/tickets` accepts
  `applicationId`; only applications from that list are accepted.

## Demo (dev)

`bash ~/samadhan-demo/run.sh load-v7-it` adds IT details to the demo Digital and Infra tickets. Run it after `load-v7-apps`.

## Tests

- **`tests/it.api.test.js`** (33 checks): trees, record classes, routing, cyber security, IT details validation, create,
  update, filter and search, the portal picker and the category leak, and the profile fix.
- **Gate:** a new `it` DB stage, which runs 7.5 down, then up, then the suite.
- **E2E:** "IT desks: app details on the ticket, portal application picker", on desktop and at 360 px.

## Rollback

Run `node backend/samadhan/db/migrate.js down 7.5-it`. A step rolled back by hand stays down until it is applied again.
