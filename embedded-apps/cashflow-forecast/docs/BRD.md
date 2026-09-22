# Business Requirements Document (BRD)
## CashFlow Intelligence – AI-Assisted Cash Flow Forecasting

| Item | Detail |
|---|---|
| Document ID | BRD-CFI-001 |
| Version | 1.0 |
| Landscape | SAP ECC 6.0 EHP8, Suite on HANA 2.0 (SoH), SAP Gateway (OData V2) |
| Application stack | React 19 + TypeScript + Vite (responsive web), React Native (optional mobile reuse), Node.js BFF, SAP Gateway OData V2 |
| Author | Finance IT / Treasury Digital |

---

## 1. Background
Treasury and FP&A teams forecast cash on spreadsheets refreshed manually from SAP (AR/AP open items, cash management forecasts, payment runs, bank statements). Forecast cycles are slow, error-prone, and cannot react to collection behaviour, statutory calendars or FX clusters. This initiative delivers a responsive, AI-assisted Cash Flow Forecast application that reads governed SAP data in near-real time and proposes explainable, approval-governed mitigation actions.

## 2. Business Objectives
1. **Liquidity assurance** – never breach the corporate liquidity policy buffer (₹40 Cr) unnoticed; earliest-breach week surfaced on the executive dashboard.
2. **Forecast speed** – 13-week rolling forecast available in seconds, refreshed on demand; no manual spreadsheet assembly.
3. **Working capital** – reduce DSO and the cash conversion cycle through prioritized collection worklists and payment re-sequencing.
4. **Explainability & trust** – every KPI, forecast value and recommendation is traceable to SAP source objects (BSID/BSIK/VBEP/FDES…).
5. **Governance** – zero direct execution from the app; all SAP-changing operations require workflow approval (human-in-the-loop).

## 3. In-Scope Business Requirements
| ID | Requirement | Priority |
|---|---|---|
| BR-01 | Executive overview with 8 primary + 4 efficiency KPIs, each with a meaningful icon and RAG tone | Must |
| BR-02 | 13-week (configurable 8/13/26) forecast with inflows, outflows, closing cash, P10–P90 confidence band and policy buffer | Must |
| BR-03 | Scenario simulation: Base / Optimistic / Stress with instant recalculation | Must |
| BR-04 | Company-code–scoped filtering with authorization enforcement server-side | Must |
| BR-05 | Risk dashboard: liquidity, collection, FX, payroll/statutory, data-quality risks with severity, score, mitigation, owner, due date | Must |
| BR-06 | AI explainability: ranked factor contributions (waterfall) with SAP source lineage | Must |
| BR-07 | Action Center: create governed recommendations (mitigation work items); approval workflow integration | Must |
| BR-08 | Cash-flow line-item drilldown (top items by due date, probability, planning level) | Must |
| BR-09 | CSV export of the forecast for offline board packs | Should |
| BR-10 | Responsive UX: desktop, tablet, mobile (hamburger navigation) | Must |
| BR-11 | Mobile app reuse of the same OData API (React Native client – phase 2) | Could |
| BR-12 | Data-health monitoring (source freshness SLA) surfaced as a risk | Should |
| BR-13 | AI Insights panel: ranked, explainable insights with one-click governed action creation (COLLECTION_WORKLIST included) | Must |

## 4. Out of Scope
- Direct payment execution, F110 proposal changes, clearing, GL postings or FX dealing from the app (recommendations only).
- Machine-learning retraining pipelines (deterministic ABAP aggregation + behaviour model phase 1; ML phase 3).
- Bank connectivity / MT940 parsing (assumes existing electronic bank statement processing).

## 5. Users & Roles
| Role | Usage | SAP authorization basis |
|---|---|---|
| CFO / Finance leadership | Executive overview, scenario, export | Display on all company codes (via role) |
| Treasury manager | Forecast, risk, mitigation actions | Company-code cash management display + action create |
| AR/AP heads | Collections & payment re-sequencing | Restricted company codes |
| SAP IT / Auditor | Data health, audit trail of created actions | Audit/display only |

## 6. Business Rules (key)
1. Policy buffer breach: any week whose projected closing cash < policy buffer (company-code configurable) raises a Critical liquidity risk.
2. Receipt probability: L1 ≥ 95%, L2 60–95%, L3 < 60% per planning levels (custom planning group mapping from FDFD/FDES planning levels).
3. Scenario multipliers (phase 1 deterministic): Optimistic ×1.12 closing, Stress ×0.82 closing with inflow/outflow adjustments.
4. Statutory outflows (PF/TDS/GST) are immovable: never proposed for deferral.
5. All actions are audit-logged (user, timestamp, before/after values) in a custom table.

## 7. Success Metrics
- Forecast production time: from days (manual) to < 1 minute (system).
- Forecast accuracy (W+1 actual vs forecast): ≥ 90% by quarter 2.
- Policy-buffer breaches caught before occurrence: 100%.
- DSO reduction: ≥ 3 days within two quarters.

## 8. Assumptions & Constraints
- SoH 2.0 as the database enables CDS views and HANA-optimized aggregation; Gateway on the ECC stack exposes OData V2.
- Browser SSO via SAP Web Dispatcher / reverse proxy (SAML2 or Kerberos SPNEGO). No SAP credentials in the browser.
- The app never writes financial documents; only `ActionSet` creation is a mutation.

## 9. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Gateway performance on high-volume line items | CDS-based aggregation, $top/$skip paging, BFF TTL cache, $batch |
| User trust in AI output | Explainability panel with source lineage; confidence bands; human approval |
| Authorization gaps | AUTHORITY-CHECK per company code in every DPC_EXT entity read; penetration test before go-live |
