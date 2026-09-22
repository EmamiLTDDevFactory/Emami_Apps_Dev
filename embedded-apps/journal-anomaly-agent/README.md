# Journal Entry & GL Anomaly Agent

Next.js 14 (App Router, static export) port of the standalone `journal-anomaly-agent` prototype
(React + Vite + a Node/Express + PostgreSQL API) into this monorepo's embedded-app pattern — same
shape as `cashflow-forecast`: static-exported, merged into the hub's `dist/apps/journal-anomaly-agent/`
at build time (see repo root `scripts/build-embedded-apps.js`), no login screen of its own (gated
by the hub's session, see `src/components/HubGate.tsx`).

## SAP integration status

`src/lib/sapClient.ts` calls the real `ZJE_ANOMALY_SRV` OData V2 entity sets directly from the
browser (same pattern every other SAP-integrated app in this repo uses), with full field-level
mapping from the raw SAP wire shapes (`abap/ODATA_API_CONTRACT.md`, `abap/ZJE_ANOMALY_SRV.md`)
into this app's typed domain model (`src/types/index.ts`).

**This is not deployed yet.** Unlike this repo's confirmed-live SAP integrations, `ZJE_ANOMALY_SRV`
doesn't exist in SAP yet — `abap/zcl_zje_anomaly_dpc_ext.abap` documents the runtime methods but
leaves several (DashboardSet aggregation, LineSet/GLMasterSet projections, the full
$filter/$orderby builder) as commented specifications rather than complete implementations.
`sapClient.ts`'s `SAP_BASE_URL` is a placeholder — **replace it with the real Gateway host** once
SAP Basis actually generates and activates the service.

Until then, every function in `sapClient.ts` attempts the real call first and transparently falls
back to the bundled demo dataset (`src/data/mock.ts`, built from the source project's own
`db/seeds/001_seed.sql`) on any failure, so the dashboard is fully usable today.

## Architecture note: no separate backend

The source project's `apps/api` (Express + PostgreSQL, its own case-workflow tables, OIDC auth)
is **not** reproduced here — this monorepo's embedded apps call SAP OData directly from the
browser, with no server of their own. The source API's business rules (idempotent case creation,
one-open-case-per-document, optimistic locking via `RowVersion`, disposition required to close)
are preserved client-side in `sapClient.ts`, matching what `ZCL_ZJE_ANOMALY_DPC_EXT` enforces
server-side once the real service exists.

`apps/web/src/pages5.tsx`'s Security page originally called the Express API's own
`/health/dependencies` (Postgres, AI-gateway health) — this port's `Pages5.tsx` shows those two
rows as "not applicable to this deployment" rather than fake status, and reflects the real
`SAP_CONFIGURED` flag for the SAP row.

## Folders

- `src/` — the Next.js application (App Router: `src/app/page.tsx` assembles the tabbed shell)
- `abap/` — SEGW DPC_EXT source, service design doc, and the OData API contract this app's
  mapping layer is built against — hand this to SAP Basis/ABAP to build the real service

## Application map

| Section | Content |
| --- | --- |
| Executive Command Center | Population-wide KPIs, risk trend, company-code × risk heatmap |
| Anomaly Workbench | Risk-ranked journal population, critical/high counts |
| Journal Entry Explorer | Document-level view with real explainable drivers (RiskScoreSet/DriverSet) |
| Pattern Intelligence | Posting typologies, user behavior deviation, Benford signals |
| Period-End Close Guard | Pre-close readiness, posting-hour risk, close checklist |
| Integrated Process Risk | Cross-module traceability (SD/MM/CO to FI) |
| Case Management | Real case queue (CaseSet) — maker-checker status transitions |
| Audit Evidence Center | Evidence pack contents and assurance metrics |
| AI Explainability & Governance | Model performance, drift, score composition |
| Security & Integration Health | Integration status, SAP entity-set reference |

## Governance

Same posture as the source prototype: case creation/update is a governed work item only. This app
never posts, pays or clears anything in SAP — `CaseSet` writes only ever create or update an
investigation case (see `abap/ODATA_API_CONTRACT.md`'s write-operations table).
