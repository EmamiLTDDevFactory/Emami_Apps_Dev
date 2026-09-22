# Functional Specification (FS)
## CashFlow Intelligence – AI-Assisted Cash Flow Forecasting
Document ID: FS-CFI-001 · Traceability: each section maps to BRD IDs.

---

## 1. Application Map
| UI Section | Function | BRD |
|---|---|---|
| Sidebar navigation | Overview, Forecast, Risk, Explainability, Action Center, Line Items, Data Health | BR-01 |
| Topbar | Refresh (re-query), Export CSV, data-mode chip (Mock / OData) | BR-09 |
| Attention banner | Highest-severity alert + one-click mitigation action creation | BR-01, BR-07 |
| Filters | Scenario segmented control, company code, horizon | BR-03, BR-04 |
| KPI grid (8 cards) | Primary liquidity KPIs with icons & RAG tones | BR-01 |
| Efficiency strip (4 cards) | CCC, DSO, DPO, FX exposure | BR-01 |
| Forecast chart | Composed bars (in/out), closing-cash line, P10–P90 band, policy-buffer reference line | BR-02 |
| Risk dashboard | Risk cards: severity pill, score bar, mitigation, owner, due, status | BR-05 |
| Explainability | Waterfall of factor contributions + rationale list with source lineage | BR-06 |
| Action Center | Governed recommendation table + create action | BR-07 |
| Line items | Top cash-flow lines with probability bars and planning levels | BR-08 |

## 2. KPI Definitions (with icons)
| KPI | Icon | Definition / Formula | Tone rule |
|---|---|---|---|
| Opening Cash | Wallet | Bank + treasury opening balances (FDSB, FEBKO) as of run date | vs prior week Δ |
| 13-Week Net Cash Flow | TrendingUp | Σ inflows − Σ outflows over horizon | >0 blue, <0 red |
| Lowest Liquidity Point | OctagonAlert | MIN(weekly closing cash) and its week | < buffer amber/red |
| Expected Receipts | HandCoins | Σ weighted open AR + SD order pipeline | — |
| Expected Payments | ReceiptText | Σ AP maturities + payroll + statutory + capex | — |
| At-Risk Receivables | UserX | Open AR where behaviour model flags delay ≥ 7 days | >5% of AR amber |
| Days Cash on Hand | CalendarClock | Closing cash ÷ average daily outflow | < target amber |
| Forecast Confidence | Gauge | Model confidence (blend of data freshness + volatility) | <80% amber |
| Cash Conversion Cycle | Timer | DSO + DIO − DPO (compact strip) | trend |
| DSO | Activity | AR × horizon ÷ credit sales | vs sector median |
| DPO | Banknote | AP × horizon ÷ purchases | vs terms |
| FX Exposure | Globe | Net open FX position by currency within horizon | cluster warning |

## 3. Screen Behaviour
### 3.1 Filters (BR-03/04)
- Scenario: Base/Optimistic/Stress radio group. Optimistic applies ×1.12 closing cash (×1.05 inflows, ×0.98 outflows); Stress ×0.82 (×0.90 inflows, ×1.05 outflows). Server returns BASE figures; scenario rules applied per contract (and identically in ABAP `ZCL_CF_FORECAST`).
- View granularity: Weekly / Monthly radio. Monthly buckets weeks by the month of their start date (sums in/outflows, last closing, min/max band, min confidence).
- Company code: value list from `FilterValueSet` (dimension COMPANY_CODE) — restricted to codes the user is authorized for.
- Horizon: 8/13/26 weeks — trims the series **and dynamically recomputes affected KPI cards** (net cash flow label/value, receipts/payments, lowest liquidity point and its buffer status).
- From date: first day of the forecast window; drives week labels, tooltips and month grouping.
- Display currency: INR/USD/EUR **display convenience only** — transaction currency and official rates are resolved server-side (TCURR via `BAPI_EXCHRATE_GETEXCHANGERATE` in the ABAP facade). The selector converts display values only and never re-queries different source data.
- Chart layers (checkboxes): confidence band (P10–P90), policy buffer line, **PO/capex commitments** (COOI/EKKO-EKET, orange bars; also added into payments KPI and net cash flow), **SD sales pipeline** (VBEP confirmed, teal bars; also added into receipts KPI and net cash flow), confidence % line (right axis).

### 3.2 Forecast (BR-02)
- X: week W1..Wn. Bars: inflows (green), outflows (red). Line: closing cash. Shaded band: P10–P90. Dashed amber reference line: policy buffer.
- Y-axis auto-scales with policy buffer in view. Tooltip shows all series.

### 3.3 Risk dashboard (BR-05)
Severity classes: Critical (score ≥ 75), High 60–74, Medium 40–59, Low < 40. Each risk card shows alert, financial impact (₹ Cr), mitigation, owner, due date, status.

### 3.4 Explainability (BR-06)
Waterfall bridges opening cash → projected W13 close via ranked signed factor contributions; negative drivers listed with SAP source tags (e.g., BSIK/EKET, HR+TDS/GST, BSID/VBEP).

### 3.5 Action Center (BR-07)
- "Create mitigation action" POSTs `{Type, Scenario, CompanyCode}` to `ActionSet` (CSRF-protected, rate-limited). Response: ActionId + status.
- Allowed types (allowlist): LIQUIDITY_MITIGATION, PAYMENT_RESEQUENCE, HEDGE_PROPOSAL, COLLECTION_WORKLIST.
- Result appears as a Proposed row; workflow approval moves it to Approved. **No posting, payment, or clearing is performed by the app.**

### 3.7 AI Insights & Recommended Actions (BR-13)
- The agent derives insights deterministically from the forecast run (rules + collection-behaviour model) and ranks them by financial impact: Week-3 policy breach (Critical), collection slowdown (High), discount-safe re-sequencing (High), FX cluster (Medium), DSO gap (Medium), data freshness (Info).
- Each insight card shows: priority pill, detail, impact (₹ Cr), confidence bar, SAP source lineage tags, recommended action, and a **one-click "Create action"** button (posts to `ActionSet` with `InsightId` for traceability).
- After creation the card shows the returned ActionId; the audit trail links insight → action → approval (ZCF_AUDIT).

### 3.6 Line items (BR-08)
Columns: due date, type chip (in/out), partner, company code, planning level, probability bar, signed amount. Filtered by company code; server-side paging ($top/$skip) beyond 200 rows.

## 4. States
- Loading: skeleton KPI grid + "Loading…" status (aria-live).
- Error: retry panel with message (502 from BFF surfaces upstream detail).
- Empty: friendly message when a company code has no forecast data.
- Data mode chip in sidebar distinguishes Demo vs Live OData.

## 5. Non-Functional (summary; details in TS)
- Responsive breakpoints: ≥1200 (4-col), 768–1200 (2-col), <900 (hamburger sidebar), <560 (1-col).
- Accessibility: aria labels on chart and nav, role=status/alert states, focus-visible, reduced-motion support.
- Performance: BFF TTL cache (60 s), gzip, single composite `/api/dashboard` call, lazy rendering via virtualized table beyond 200 rows (phase 2).
- Security: CSP, HSTS, no credentials in browser, CSRF relay, rate limits (120 rpm read / 10 rpm mutation), allowlisted action types.

## 6. Validation Rules
| Rule | Where |
|---|---|
| Company code must be authorized | ABAP DPC_EXT (AUTHORITY-CHECK F_BKPF_BUK) |
| Horizon ∈ {8,13,26}; Scenario ∈ {BASE,BEST,STRESS} | BFF validateFilters + ABAP allowlist |
| Action type ∈ allowlist | BFF + ABAP ZCL_CF_ACTION |
| Currency of KPI values = company code currency | ABAP facade |
