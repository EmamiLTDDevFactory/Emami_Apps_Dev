# Credit Risk Advisory AI Agent

Next.js 14 (App Router, static export) port of the standalone `credit-risk-advisory-fullstack`
prototype (a React + Express full-stack app with its own JWT auth, Postgres-shaped in-memory
store, and a LangGraph risk-scoring service) into this monorepo's embedded-app pattern — same
shape as `embedded-apps/cashflow-forecast`: static-exported, merged into the hub's
`dist/apps/credit-risk-advisory/` at build time, no login screen of its own (gated by the hub's
session, see `src/components/HubGate.tsx` — the source project's own Login.tsx/JWT auth was
dropped entirely).

## SAP integration status

`src/lib/sapClient.ts` calls the real `ZCREDIT_ADV_SRV` OData V2 entity sets/function imports
directly from the browser (same pattern every sibling SAP-integrated app in this repo uses), with
field-level mapping built from `abap/ODATA_API_CONTRACT.md`'s own "OData property → API JSON field
mapping" table.

**This is not deployed yet.** `abap/` is a DDIC installer + MPC/DPC extension template, not a
working service. `sapClient.ts`'s `SAP_BASE_URL` is a placeholder — **replace it with the real
Gateway host** once SAP Basis actually generates and activates `ZCREDIT_ADV_SRV`. Until then,
every function attempts the real call first and falls back instantly to the bundled demo dataset
(`src/data/mock.ts`, ported from the source project's own `apps/api/src/data.ts`), so the app is
fully usable today and needs only that one constant swapped to go live.

The credit-risk scoring itself (`src/lib/risk.ts`) is a client-side port of the source project's
own deterministic policy step (`apps/api/src/risk.ts`'s `deterministicRisk`, originally run inside
a LangGraph node) — same formula, same weights. The source project's document-upload feature had
no corresponding SAP entity in its own OData contract (it was local-disk storage in its Node API),
so it isn't ported as a fake SAP call — the "attach supporting evidence" field in the Approval
Workflow drawer is a plain local affordance, clearly labeled as such.

## Folders

- `src/` — the Next.js application (App Router: `src/app/page.tsx` is the whole dashboard, a true
  multi-section SPA like the source prototype — Sidebar switches `page` state, not anchor scroll)
- `abap/` — DDIC installer, MPC/DPC extension templates, the OData API contract and the SAP-side
  README/service doc — hand this to SAP Basis/ABAP to build the real service

## Application map

| Section | Content |
|---|---|
| Executive Overview | 18 KPI cards (accent-colored, badge-tagged) + the top-5 priority decision queue |
| Operations Worklist | Blocked orders/deliveries/PGI/billing mini-KPIs + the full credit operations queue |
| Customer 360 | Master picker, exposure waterfall, AI advisory with hard stops and decision drivers |
| Portfolio Analytics | Risk-band donut, exposure-by-channel bars, top concentrations, depot risk heatmap |
| Approval Workflow | Maker-checker pipeline, the operations queue, a decision drawer (approve/reject/rework/conditional release) |
| Policy & Exceptions | Active credit policy rules, open exceptions, rule precedence, exception trend |
| Agent Monitoring | Recommendation mix, auto-release/override rates, governance signals |
| Integration Health | SAP ECC/DMS/SFA interface status, freshness thresholds, failed/retry queue |

## Governance

Same posture as the source prototype: `SubmitDecision` only appends an immutable `DecisionLogSet`
row — a governed recommendation/audit record, never a direct SAP post/pay/clear. Every release
still requires human approval and SAP-side revalidation before execution.
