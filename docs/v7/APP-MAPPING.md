# Samadhan v7 — Application mapping for existing tickets (**APPROVED 2026-11-07**)

## 0. Approved mapping (user answers to Q-M1 … Q-M6, 2026-11-07) — this section wins over the proposal below

| Question | Decision |
|---|---|
| Q-M1 | `mSecSales …` categories → `MSFA` |
| Q-M2 | `Rural mSFA` gets its **own** application **`RMSFA`** (Rural mSFA App, SEC_SALES) |
| Q-M3 | `CDMS` gets its **own** application **`CDMS`** (CDMS – legacy distributor system, SEC_SALES) |
| Q-M4 | `SalesCode SFA` → `MR`, `SalesCode Manager App` → `SUP`, `SalesCode Portal` → `DMS` |
| Q-M5 | `Salescode B2B App` stays in Secondary Sales as **`SCB2B`** (SalesCode B2B App, SEC_SALES); `B2B` stays a Digital Apps code |
| Q-M6 | backfilled rows get `classificationSource = 'backfill'` (not shown in "Needs classification") |

Rule actually applied (first match wins):

1. By `type` (case-insensitive, trimmed): `mSFA` → MSFA · `Rural mSFA` → RMSFA · `SalesCode DMS` → DMS · `CDMS` → CDMS ·
   `SalesCode SFA` → MR · `SalesCode Supervisor App` → SUP · `SalesCode Manager App` → SUP · `Salescode B2B App` → SCB2B ·
   `SalesCode Portal` → DMS · `Wrong ticket` → SS.
2. By category, when `type` is empty or unknown: starts with `mSecSales` or equals `mSFA Reports` → MSFA · starts with
   `Rural mSFA` → RMSFA · starts with `CDMS` → CDMS · `MR Expense` → MR · starts with `SalesCode` → DMS.
3. Fallback `SS`. Every mapped code is in SEC_SALES, so no existing ticket changes desk.

Expected on dev (from the counts in §2): MSFA 448, RMSFA 156, CDMS 400, DMS 26, MR 11, SS 292 (+ demo tickets loaded since).

---

_Original proposal (kept for reference):_


§7.4: only the **approved** version of this file is applied. Every unmapped ticket gets `SS`. Category / function / type
values are **never** changed — the backfill only sets the new `application_id`, the derived `workspace_id`, and
`classification_source` (value to be confirmed in Q-M6).

## 1. Rule (evaluated in order, first match wins)

1. **By `type`** (the strongest signal — it names the app):

| Existing `type` value (case-insensitive, trimmed) | → Application | Confidence |
|---|---|---|
| `mSFA` | `MSFA` | high |
| `Rural mSFA` | `MSFA` | «confirm» Q-M2 |
| `SalesCode DMS` | `DMS` | high |
| `CDMS` | `DMS` | «confirm» Q-M3 (legacy CDMS vs SalesCode DMS) |
| `SalesCode SFA` | `MR` | «confirm» Q-M4 (is SalesCode SFA the MR app?) |
| `SalesCode Supervisor App` | `SUP` | high |
| `SalesCode Manager App` | `SUP` | «confirm» Q-M4 |
| `Salescode B2B App` | `B2B` | «confirm» Q-M5 (B2B is seeded in DIGITAL_APPS — a SalesCode B2B ticket would then leave the Secondary Sales desk) |
| `SalesCode Portal` | `DMS` | «confirm» Q-M4 |
| `Wrong ticket` | `SS` | high |

2. **By category prefix**, only when `type` is empty or unknown:

| Category starts with / equals | → Application |
|---|---|
| `mSecSales …`, `Rural mSFA …`, `mSFA Reports` | `MSFA` «confirm» Q-M1 |
| `CDMS …`, `CDMS Reports`, `CDMS Purchase Issue`, `CDMS-End User …` | `DMS` «confirm» Q-M3 |
| `MR Expense` | `MR` «confirm» |
| `SalesCode` | `DMS` «confirm» |
| anything else (E Invoice, TCS, Masters, Inventory, Secondary Sales, Finance, Purchase, Schemes & Claims, Printer, Application, User Management, …) | `SS` |

3. **Fallback**: `SS` (Secondary Sales – General).

All mapped applications are in workspace `SEC_SALES` **except** `B2B` (DIGITAL_APPS). If Q-M5 is "no", `Salescode B2B App`
maps to `SS` (or a new SEC_SALES code such as `SCB2B`) so no existing ticket changes desk.

## 2. Counts per code

**Pending.** The counts need one read-only query on the dev database (host `10.17.12.4`, database `Devhubfactory`),
which Phase 0 has not connected to (see questions in PROGRESS.md). Query to be run on approval (SELECT only):

```sql
SELECT coalesce(nullif(trim(type), ''), '(empty)') AS type,
       split_part(coalesce(category, '(empty)'), ' - ', 1) AS category_head,
       count(*) AS tickets,
       count(*) FILTER (WHERE spam OR "deletedAt" IS NOT NULL) AS hidden
FROM setu.tickets GROUP BY 1, 2 ORDER BY 3 DESC;
-- plus the live category tree:
SELECT p.value AS category, array_agg(c.value ORDER BY c.position) FILTER (WHERE c.id IS NOT NULL) AS functions
FROM setu.field_choices p JOIN setu.field_definitions d ON d.id = p."fieldId" AND d.key = 'category'
LEFT JOIN setu.field_choices c ON c."parentId" = p.id
WHERE p."parentId" IS NULL GROUP BY p.value, p.position ORDER BY p.position;
```

**Result (2026-11-05, dev DB `Devhubfactory` @ `10.17.12.4`, schema `setu`, read-only transaction).** Run from the dev
server (172.17.2.21) with the dev hub backend's own config. This machine is not in the DB's `pg_hba.conf`. These are
**dev** figures. Prod counts will differ, so re-run the same SELECT on prod before the Phase-3 backfill (by the release
process, not by Claude).

1,333 tickets, 0 spam or deleted.

| Code | Rule hits (type) | Rule hits (category) | Fallback | Total | Rows behind open questions |
|---|---|---|---|---|---|
| MSFA | 604 (`mSFA` 448, `Rural mSFA` 156) | 0 | 0 | **604** | Q-M2: 156 |
| DMS | 424 (`CDMS` 400, `SalesCode DMS` 24) | 2 | 0 | **426** | Q-M3: 400 |
| MR | 11 (`SalesCode SFA`) | 0 | 0 | **11** | Q-M4: 11 |
| SUP | 0 | 0 | 0 | **0** | — |
| B2B | 0 | 0 | 0 | **0** | Q-M5: 0 (no `Salescode B2B App` tickets yet) |
| SS | 287 (`Wrong ticket`) | 0 | 5 | **292** | — |

`type` values present: `mSFA` 448, `CDMS` 400, `Wrong ticket` 287, `Rural mSFA` 156, `SalesCode DMS` 24, `SalesCode SFA` 11,
empty 7. Of the 7 empty-type rows, 2 map by category (`SalesCode …` → DMS) and 5 fall back to SS. No ticket would leave
the Secondary Sales desk. The live category tree has 48 top-level categories and matches §1. The `mSecSales Asset
Missing /Stolen Issues` category exists twice, once with a double space; both are under "mSecSales" and map the same way.

## 3. Questions to confirm

- **Q-M1** Is "mSecSales" (the SAP mobile secure app in the category names) the same app as `MSFA`, or the general `SS`?
- **Q-M2** Rural mSFA → `MSFA`, or its own code (e.g. `RMSFA`)?
- **Q-M3** CDMS (legacy distributor system) → `DMS` (SalesCode DMS), or a separate code `CDMS`?
- **Q-M4** SalesCode SFA = SalesCode MR app? SalesCode Manager App = Supervisor app? SalesCode Portal → DMS?
- **Q-M5** "Salescode B2B App" → `B2B` (Digital Apps desk) or stay in Secondary Sales?
- **Q-M6** Backfilled rows: `classification_source = 'default'` for all (so they appear in "Needs classification"), or a
  distinct value `'backfill'` so 10k+ historic tickets do not flood that view? Recommendation: add `'backfill'` to the
  allowed values and exclude it from "Needs classification".
