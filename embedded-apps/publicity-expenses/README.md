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
| MIS report | The summary layout of the sheet (RB FY, RB YTD, OB FY, OB YTD, CY HO, CY Units, CY Total, PY Total per header group, GR Total MIS, DSR, GR Total LR); click a group heading (or "All G/L columns") for the drill-down layout's G/L columns; click a figure for the cost-centre / SKU drill-down; compact layout; Excel export |
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

Filters (one row above every screen, kept in the URL): fiscal year, YTD period, company, site, report header, category,
brand family, unit (₹ lakh default, crore, rupees).

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
structure from the layout sheet (labels only), synthetic amounts.

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
