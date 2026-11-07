# Samadhan v7 — Phase 8 notes (S/4HANA Programme)

Master prompt §I (ticket_program_details), §N 3, 5-9, §O (S4_PROGRAM types, programme lists, groups, defect SLA), §P. Done on 2026-11-08.

## What a user sees (S/4HANA Programme desk, switched on in Admin > Service desks)

- **New ticket** offers the tile **Log a test defect**, plus a **Programme** section:
  - main fields: test cycle, defect severity, Activate phase, test case and scenario;
  - "More": release / wave, migration object, mock cycle, cutover step, RICEFW, fit-gap, simplification item, ATC finding.
- **Types carry a record class** (§O):
  - Defect – Unit / SIT / UAT / Regression / Performance, Data Migration Issue and Authorization / Role Issue → DEFECT;
  - Cutover Task, Custom Code Remediation, Training → TASK;
  - Fit-Gap → ENHANCEMENT; Risk → RISK; Issue (RAID) and Hypercare Incident → INCIDENT.
- **Process areas** cover Order to Cash, Procure to Pay, Plan to Produce, Record to Report and Hire to Retire, plus
  Data Migration (by object), Cutover, Custom Code & Integration, Security & Roles, Testing and PMO.
- **Routing:** Data Migration → Data Migration; Cutover → Cutover; PMO → PMO; everything else → Defect Triage.
- **Defect severity sets the priority** (S1 → Urgent ... S4 → Low). The desk's SLA "S/4HANA Programme defects" gives
  **S1 1 · S2 2 · S3 5 · S4 10 business days** to resolve. Changing the severity re-prioritises the ticket.
- **Retest.** The ticket's Programme card has **Passed / Failed** buttons, which record who and when. **Failed** puts
  the ticket back to *Retest*. A defect is **resolved only after its test cycle is set and the retest has passed**.
- **S/4 Programme screen** (in the menu while the desk is on):
  - KPI tiles: open defects, overdue, retest pass rate, **leakage** (defects found in UAT or later), defects logged;
  - **defect burn-down**: open defects and S1 / S2 per day, with found / fixed bars, over 14–90 days, by test cycle;
  - open defects by severity, defect density by process area, and defects by test cycle. Clicking a bar opens the list;
  - **Hypercare today**.
- **Tickets list:** filters for test cycle, severity, Activate phase and retest.
- **Registers:** **S/4 Defect Tracker** and **Hypercare Daily**, bringing the total to 10 registers.

## Backend

- **Migration `7.8-program`:**
  - the `ticket_program_details` table;
  - S4 types and the process-area tree (only if the desk has no lists of its own);
  - 4 groups, the triage default and 3 routing rules;
  - the defect SLA policy (made the desk default);
  - 2 canned responses.

  The manifest is in settings `seed.7.8`. `SCHEMA_VERSION` 16.
- **Code:** `lib/program.js`, `lib/programSeed.js`, `routes/program.js`.
  - `GET/PUT /tickets/:id/program`.
  - `GET /program/overview` (burn-down, KPIs, hypercare).
  - `POST /tickets` accepts `program`; it is validated before the ticket exists.
- **Filters:** `testCycle`, `phase`, `defectSeverity`, `retestStatus`. Meta adds `programLists`.

## Demo (dev)

Run `bash ~/samadhan-demo/run.sh load-v7-program`. It adds about 44 programme tickets over 30 days: defects across
SIT / UAT / mocks / performance with retests, tasks, RAID and hypercare today.

## Tests

- `tests/program.api.test.js` (26 checks). The gate's `program` stage runs 7.8 down, then up, then the suite.
- E2E: "S/4 programme: defect with programme details and retest, programme screen".

## Rollback

Run `node backend/samadhan/db/migrate.js down 7.8-program`.
