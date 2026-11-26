# Publicity Expenses

ATL / BTL advertisement expenses MIS for Emami on the SAP CDS views from
`Publicity MIS Automation/AMDP and ABAP CDS Views` (`ZC_ATLBTL_EXP_SUMMARY`, `ZC_ATLBTL_EXP_DETAIL`), with A&P dashboards.

- Frontend: this folder. Next.js 14 static export at `/apps/publicity-expenses`, Tailwind with the hub palette (the same
  look as Samadhan: `src/components/ui.tsx` is a copy of Samadhan's), lucide icons, SVG / CSS charts (no chart library).
- Backend: `backend/publicityExpenses/`, mounted at `/api/me/publicity-expenses` (rides the existing nginx `/api/me` rule).
  It reads SAP server side; the browser never sees SAP or its credentials. Read-only.
- Access: hub session (Bearer JWT) + a **Publicity Expenses** grant in Admin Center → Manage Access.

## Screens

| Screen | What it shows |
|---|---|
| Overview | Total A&P (GR Total LR) and MIS spend YTD with YoY, ATL : BTL ratio and its shift, budget utilisation (CY / RB YTD), month spend vs same month PY, full-year run-rate vs RB FY, monthly CY vs PY trend, header groups, top 10 brands, watch list |
| MIS report | The summary layout of the sheet (RB FY, RB YTD, OB FY, OB YTD, CY HO, CY Units, CY Total, PY Total per header group, GR Total MIS, DSR, GR Total LR); click a group heading (or "All G/L columns") for the drill-down layout's G/L columns; click **any** figure - a report row, a sub-total (brand, range, category), the grand total, GR Total MIS / LR - for the drill-down (below); compact layout with **Variance (CY - PY)** and **% Var** per header group and GR Total MIS / LR: a chip with a direction icon and RAG colour (red = more than 10 % above PY, amber = up to 10 % above, green = lower or the same, blue **New** = no spend in PY at all, counted as +100 %; **Stopped** = spend in PY, none now, -100 %), legend above the grid, Excel adds the status in words; Excel export |
| Brands | Category / brand family / brand: share of spend and its shift (pp), YoY, Pareto (how many brands make 80 %), top-5 share, ATL : BTL mix per brand, RB used |
| Media mix | ATL media split (TV, digital, print, radio, cinema, sponsorship) and digital share of ATL, BTL activity split (free issue & sampling, visibility, consumer & trade promotion, e-commerce, research), mix shift vs PY, top G/L accounts |
| Budget vs actual | OB / RB, utilisation, OB → RB revision, projected full year vs RB FY, over-running and under-utilised brands |
| Cost centres | HO vs Units, cost-centre type, mapping rule, top cost centres, profit centres, non-brand and unmapped spend, excluded by rule, G/L = report + excluded |
| Settings (Admin) | Exclusion rules, budget upload (OB / RB versions), mapping overrides, audit log - see below |

## Settings (Manage Access role Admin; role User only views)

Stored in Postgres schema `publicity_expenses` (created on first use, additive only): `exclusion_rule`, `budget_version`,
`budget_line`, `setting`, `audit`. Every change applies to every user at once and is written to the audit log.

- **Exclusion rules** - take items out of the report: G/L account, cost centre, profit centre, cost-centre type (KOSAR),
  company code, product group, mapping rule.
  - Values are **picked from the CDS / AMDP results** of the selected period (multi-select with search, names, CY / PY
    amounts, "already excluded by rule #"); an optional **pattern** (range `508000-508099`, wildcard `EH19*`, lists) catches
    codes that come later. Picked values are exact - never read as a range.
  - Each rule has a **reason** (shown in the report banner) and an **effective period**: it applies to reports whose
    selected period lies in [from, to] and then removes the item from CY and PY alike (like-for-like), on every screen,
    the drill-down, the trend and the reconciliation. A line matched by two rules counts once (first rule).
  - **Impact preview** before saving; rules can be switched off, edited, deleted, uploaded / exported in Excel.
  - Every screen shows what the rules remove; **Show without** displays the report without them (URL `x=0`).
  - G/L rules act on the summary; cost-centre / profit-centre / type / mapping-rule rules use the detail view and are
    subtracted at the summary grain, so G/L = report + excluded always holds (checked on the Cost centres screen).
- **Budget upload** - OB and RB per reporting row x report header (x site, optional), annual or by month (else
  straight-line). Template prefilled with every report line, PY / CY actuals for reference and the active version (for
  round-trip edits); the file is checked first (dry run: unknown headers, months not adding up, duplicates, negatives,
  unknown keys as warnings, totals vs the active version), then saved as a **new version**; earlier versions can be made
  active again (rollback) or switched off (back to mock / SAP). Budget lines show as budget-only rows, so a budget
  appears even where nothing has been spent yet. Exclusions do not change budgets.
- **Mappings** - spend class (ATL / BTL / other) and GR Total MIS membership of each header group, a group for report
  headers SAP sends that the app does not know, and the media / activity bucket of any G/L.
- **Audit log** - who changed what, when.

## Filters (one row above every screen, kept in the URL)

Fiscal year and unit (₹ lakh default, crore, rupees) pick one value; every other filter picks any number of values:

- **Periods** (`pp=1-8`, `pp=4-6,9`): tick any periods of the fiscal year, or a quick pick (this period, YTD, last
  closed, Q1-Q4, full year). Figures are the picked periods **added up**, against the same periods of the previous year;
  P01..Pn is the MIS YTD. The app opens on the **current period only** (one SAP read). SAP is read as few times as
  possible (`backend/publicityExpenses/selection.js`): a run P01..Pn is one read (YTD n), a run Pa..Pb is YTD b - YTD a-1,
  a single period is that period's amount - so a YTD always equals SAP's own YTD. Since the SAP change of 2026-11-26 the
  views also carry each period alone (`CYP01Amount`..`CYP12Amount`, `PYP01Amount`..`PYP12Amount`): then **one read of
  P12 per fiscal year** serves every period selection, the monthly trend and the drill-down period columns (YTD n =
  P01 + .. + Pn, exactly SAP's YTD). The server notices the fields in SAP's answers by itself and falls back to the reads
  above without them (`PUBEXP_SAP_MONTHS=off` forces the fall-back; `/health` shows `monthFields`). Budget "YTD" = the budget of the
  picked months; projections = average of the picked periods x 12. Exclusion rules in force for the latest picked
  period apply. Links from before (`p=7`) still open as YTD up to P07.
- **Company codes** (`cc=1000|EM01`, `cc=all`): default **1000 + EM01** (with the current fiscal year and the current period). SAP is read once per period for all companies and
  filtered on the server, so switching companies does not read SAP again; the list offers every company with data.
- Site, report header, category, brand family, **G/L account** (new; budget-only lines have no G/L, so a G/L filter
  leaves them out).

## Drill-down (the basis behind a figure)

`POST /detail` with the report rows under the figure (one key, or all keys of a sub-total), the header group(s), site and
G/L of the column and the filters in force. One line per G/L x cost centre x profit centre (ZC_ATLBTL_EXP_DETAIL):
G/L and name, cost centre and description, **company code**, profit centre, site, report row, mapping rule / lookup
field, **one column per picked period** (that period alone) and the CY / PY total of the selection. The drawer checks
that the lines add up to the figure clicked (and flags a difference between the period columns and the SAP YTD, e.g.
special periods 13-16); views: posting lines, by G/L, by cost centre, by report row; search; Excel with the selection,
the source and how SAP was read (sheets: lines, by G/L, by cost centre, by report row, SKUs). Each picked period is one
whole-period SAP read the first time (~5 s on NWP), cached 10 minutes.

**ZNET_SALE_MASTER columns** at the end of every posting line (screen and Excel): ZSKUGRCODECRS (`SkuGroupCode`),
Product, Prd_Typ (`ProductType`), Prd_Rng (`ProductRange`), Item_Cat (`ItemCategory`) of the line's SKU group; the
arrow on a line lists its SKUs (material, size, unit, code). The server reads the whole master once (entity set
`ZI_ATLBTL_NETSALEMASTER` of the detail service, ~1,600 rows on NWP; `PUBEXP_SAP_SKU_SET` overrides the name), keeps it
an hour and joins it on the SKU group key (first 9 characters of ZSKUGRCODECRS = `SkuGroupKey` of the line), like the
association `to_NetSaleMaster`. This replaced one SAP call per line (~3 s each through the gateway), so every
drill-down, also of a sub-total, has its SKUs with the lines. If the master cannot be read, the lines still come and
the drawer says so (`skuError`). Older clients sending `skus: true` get the SKUs on each line as before.

## Security and performance (backend/publicityExpenses/guard.js)

All inside this app's router; the shared `server.js` is not changed. Limits are per process (PM2 runs one instance).

- **Access**: hub session (JWT HS256) + Manage Access grant on every route; settings routes need role Admin; every
  change is in the audit log. Input is validated (fiscal year, periods, company codes, reporting keys, G/L, header
  groups, sizes); SQL is parameterised; SAP is read only (GET), its URLs and sign-in never reach the browser.
- **Headers** on every answer (also 401 / 403 / 404 / 429): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store`; `X-Powered-By` removed.
- **Rate limits** (429 + `Retry-After`; env `PUBEXP_RATE_*`): per client IP before the session check 3,000/min (an
  office behind one address shares it); per user 300 requests/min, 90 drill-downs/min, 60 changes/min, 30 Refresh
  reads per 5 min, at most 8 requests at the same time.
- **SAP protection**: at most 6 SAP reads at once for the whole app (`PUBEXP_SAP_MAX_PARALLEL`), the rest queue; a
  full queue (200) answers 503 "SAP is busy". Identical reads share one SAP call (the cache keeps the promise).
- **Errors**: SAP's own error text (program names, dumps) only goes to the server log; the browser gets a plain message.
- **Exclusion patterns**: `*` / `?` are matched in linear time (no regular expression), so a crafted pattern cannot
  hang the server (the old regex took 7.5 s for 8 wildcards and grew exponentially - the whole hub backend would stall).
- **Compression**: JSON over 1 KB is sent brotli or gzip (nginx here compresses HTML only); the summary sends only the
  fields the report uses. A one-period summary went from ~0.8 MB to a fraction of that on the wire.
- **Frontend**: static export (no Next.js server, so the Next.js server advisories - Image Optimizer, Server Actions,
  middleware, rewrites - do not apply); SheetJS 0.20.3 (patched prototype-pollution / ReDoS versions); React escapes
  all text; Excel exports write text cells, never formulas.
- **Left to the server admin (needs root, affects every app on the box)**: nginx `gzip_types application/json`,
  `limit_req` per IP, HSTS, `server_tokens off`; PM2 cluster mode for load balancing (then a shared cache such as Redis
  would be needed for the cache and the limits to be shared).

## Decisions

- **Report header → ATL / BTL** (`backend/publicityExpenses/config.js`): the layout's groups ATL, MODELLING, FILM PROD,
  BTL, BTL SALES, CREATIVE make GR Total MIS; DSR AND OTHER EXP is added for GR Total LR. Spend class: ATL, Modelling,
  Film Prod, Creative = ATL; BTL, BTL Sales = BTL; DSR = other (outside the ATL : BTL ratio). Matching ignores case,
  spaces and punctuation; an unknown header stays visible as its own group and still counts in GR Total LR.
- **Budget (OB / RB)**: mock until the budget table is joined in the AMDP (phase 2). Seeded per reporting row × header
  from the run-rate, phased straight-line. `PUBEXP_BUDGET_SOURCE=sap` switches to the CDS values; nothing changes in the app.
- **A&P as % of net sales**: not shown (expenses only for now).
- Fiscal year April–March: FY 2026 = FY'27, period 7 = Oct'26.

## Configuration (server `.env`, see `backend/.env.example`)

`PUBEXP_SAP_ODATA_ROOT` (or `PUBEXP_SAP_SUMMARY_BASE` + `PUBEXP_SAP_DETAIL_BASE`), `PUBEXP_SAP_CLIENT` (900),
`PUBEXP_SAP_SYSTEM` (EDS), `PUBEXP_SAP_USER` / `PUBEXP_SAP_PASSWORD`, `PUBEXP_SOURCE` (mock | sap),
`PUBEXP_BUDGET_SOURCE`. With no SAP base set, the backend serves **mock data** (the app shows a "Mock data" badge):
structure from the layout sheet (labels only), synthetic amounts, two company codes (1000 and a smaller EM01).

## Develop and test

```bash
npm install
node e2e/mock-server.js 4195            # local backend: mock data, in-memory settings; prints TOKEN= (admin) and VIEWER_TOKEN=
NEXT_PUBLIC_PUBEXP_API_URL=http://127.0.0.1:4195/api/me/publicity-expenses npm run dev   # http://localhost:3260/apps/publicity-expenses/
npm run typecheck && npm run lint
npm run test:unit                       # backend: mapping, OData client, mock, budget, routes (no DB, no SAP)
E2E_TOKEN=<token> E2E_VIEWER_TOKEN=<token> npm run test:e2e   # Edge, desktop + 360 px; E2E_BASE_URL to test a production build
npm run build                           # static export -> dist/
```

Do not run `next build` while `next dev` is running in this folder (both use `.next/`).

Deploy the backend before the frontend: the backend still answers the older requests (`period=n`, `company=`,
`GET /detail?key=`), but the frontend sends `periods` / `companies` and `POST /detail`, which an older backend refuses.
