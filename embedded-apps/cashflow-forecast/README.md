# CashFlow Intelligence — AI Cash Flow Forecast

Next.js 14 (App Router, static export) port of the standalone `cashflow-Forecast` prototype
(Vite + React + a Node BFF) into this monorepo's embedded-app pattern — same shape as
`fm-po-deviation`: static-exported, merged into the hub's `dist/apps/cashflow-forecast/` at build
time (see repo root `scripts/build-embedded-apps.js`), no login screen of its own (gated by the
hub's session, see `src/components/HubGate.tsx`).

## SAP integration status

`src/lib/sapClient.ts` calls the real `ZCASHFLOW_AI_SRV` OData V2 entity sets directly from the
browser (same pattern every sibling SAP-integrated app in this repo uses — Market Rate, PO
Followup, Provision Tracking, PO Deviation Approval), with full field-level mapping from the raw
SAP wire shapes (`docs/API_CONTRACT.md`) into this app's typed domain model (`src/types/index.ts`).

**This is not deployed yet.** Unlike those sibling apps, `ZCASHFLOW_AI_SRV` doesn't exist in SAP
yet — `abap/` is a structured SEGW/DPC_EXT blueprint with pseudocode method bodies (see
`abap/SEGW_BLUEPRINT.md`, `abap/ZCL_ZCASHFLOW_AI_DPC_EXT.template.abap`), not a working service.
`sapClient.ts`'s `SAP_BASE_URL` is a placeholder — **replace it with the real Gateway host** once
SAP Basis actually generates and activates the service, exactly like every sibling app's own
hardcoded base URL.

Until then, `loadDashboard()`/`createAction()` attempt the real call first and transparently fall
back to the bundled demo dataset (`src/data/mock.ts`) on any failure, so the dashboard is fully
usable today and needs zero frontend changes the day the real service goes live — only the base
URL constant.

## Folders

- `src/` — the Next.js application (App Router: `src/app/page.tsx` is the whole dashboard)
- `abap/` — SEGW blueprint, DPC_EXT template, CDS views — hand this to SAP Basis/ABAP to build the
  real service
- `docs/` — BRD/FS/TS and the OData contract this app's mapping layer is built against

## Application map

| Section | Content |
|---|---|
| Executive Overview | 8 primary KPIs + 4 efficiency KPIs (CCC, DSO, DPO, FX) |
| Forecast | 13-week composed chart: inflow/outflow bars, closing cash line, P10–P90 band, policy buffer |
| AI Insights | Ranked, agent-generated insights with one-click governed action creation |
| Risk Dashboard | Liquidity, collection, FX, payroll/statutory, data-quality risks with score bars |
| AI Explainability | Waterfall of factor contributions with SAP source lineage |
| Action Center | Governed recommendation creation — never posts/pays/clears in SAP directly |
| Line Items | Cash-flow lines with probability and planning level |

## Governance

Same posture as the source prototype: `ActionSet` creation is a governed recommendation/work item
only. This app never posts, pays or clears in SAP — every action requires a separate approval
workflow (see `docs/API_CONTRACT.md`'s Mutation section).
