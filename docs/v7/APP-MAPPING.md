# Samadhan v7 — Application mapping for existing tickets (proposal, needs approval)

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

The table below will be filled from that result:

| Code | Rule hits (type) | Rule hits (category) | Total |
|---|---|---|---|
| MSFA | … | … | … |
| DMS | … | … | … |
| MR | … | … | … |
| SUP | … | … | … |
| B2B | … | … | … |
| SS | … | … | … (incl. fallback) |

## 3. Questions to confirm

- **Q-M1** Is "mSecSales" (the SAP mobile secure app in the category names) the same app as `MSFA`, or the general `SS`?
- **Q-M2** Rural mSFA → `MSFA`, or its own code (e.g. `RMSFA`)?
- **Q-M3** CDMS (legacy distributor system) → `DMS` (SalesCode DMS), or a separate code `CDMS`?
- **Q-M4** SalesCode SFA = SalesCode MR app? SalesCode Manager App = Supervisor app? SalesCode Portal → DMS?
- **Q-M5** "Salescode B2B App" → `B2B` (Digital Apps desk) or stay in Secondary Sales?
- **Q-M6** Backfilled rows: `classification_source = 'default'` for all (so they appear in "Needs classification"), or a
  distinct value `'backfill'` so 10k+ historic tickets do not flood that view? Recommendation: add `'backfill'` to the
  allowed values and exclude it from "Needs classification".
