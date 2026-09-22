# SAP Gateway OData V2 Service Design — ZJE_ANOMALY_SRV

Journal Entry & GL Anomaly Agent backend service for **ECC 6.0 EHP8 on Suite on
HANA 2.0**. SEGW project `ZJE_ANOMALY`; service `ZJE_ANOMALY_SRV` (OData V2,
JSON). This document is the authoritative model and method specification for
both the SAP implementation and the Node adapter (`apps/api/src/sap/`).

## Artefacts

| Object | Type | Purpose |
| --- | --- | --- |
| `ZJE_ANOMALY_INSTALL` | Report | Creates DDIC Z tables + ABAP types (idempotent) |
| `ZJE_ANOMALY_EXTRACT` | Report | Batch delta extraction BKPF/BSEG (read-only) -> ZJE_* read model |
| `ZJE_DOCDATA` | Table | Scored document header + risk fields |
| `ZJE_DOCCTX` | Table | Line items |
| `ZJE_GLMASTER` | Table | GL master context |
| `ZJE_CASE` | Table | Case workflow (custom, controlled writeback) |
| `ZJE_CASE_EVT` | Table | Append-only case events |
| `ZJE_RISK`, `ZJE_RISK_DRIVER` | Tables | Scoring model + explainable drivers |
| `ZJE_CONFIG` | Table | Approved configuration (thresholds/weights) |
| `ZCL_ZJE_ANOMALY_MPC_EXT` | Class | Model provider extension |
| `ZCL_ZJE_ANOMALY_DPC_EXT` | Class | Data provider extension — all runtime methods |

## Authorization

Every read/write executes `AUTHORITY-CHECK` against object `ZJE_ANOMALY_AUTH`
(`ACTVT`, `BUKRS`) **before** any SELECT. The Node API applies its own OIDC
ABAC on top; the Gateway enforces the SAP-side scope for the RFC user. Never
grant `BUKRS=*` to service users.

## Entity sets and methods

| Entity set | Keys | Read | Create/Update | Notes |
| --- | --- | --- | --- | --- |
| `WorklistSet` | CompanyCode, FiscalYear, DocumentNo | ✓ | — | Worklist page (score desc). |
| `HeaderSet` | CompanyCode, FiscalYear, DocumentNo | ✓ | — | BKPF view. |
| `LineSet` | + Line | ✓ | — | BSEG view. |
| `GLMasterSet` | GLAccount | ✓ | — | Master context. |
| `RiskScoreSet` | + ModelVersion, Seq | ✓ | — | Latest score per doc. |
| `DriverSet` | + ModelVersion, Seq | ✓ | — | Feature contributions. |
| `CaseSet` | CaseId | ✓ | ✓ | Workflow entity (see below). |
| `CaseEventSet` | CaseId, EventSeq | ✓ | — | History. |
| `DashboardSet` | Scope | ✓ | — | Aggregate KPI. |
| `ConfigSet` | ConfigKey, Version | ✓ | — | Approved config. |

`DELETE` is rejected for every set (405) — the audit model is append-only.
`$top` is capped at **500**; unbounded sets are rejected (400 `ZJE/TOO_MANY`).
`$orderby` is restricted to the sortable fields in the model.

## CaseSet workflow semantics (mirrors the REST contract)

1. `POST CaseSet` requires `Idempotency-Key` (16–120 chars) read from the HTTP
   header. Replay of a known key returns the original case (200 semantics).
2. Only one `OPEN` case may exist per company+year+document; a second create
   returns 409 `ZJE/OPEN_CASE_EXISTS` with `existingId`.
3. `MERGE` update uses `RowVersion` as an optimistic lock; mismatch -> 409
   `ZJE/STALE_VERSION` (with `currentRowVersion`). Closing requires a
   `Disposition` -> otherwise 400 `ZJE/DISPOSITION_REQUIRED`.
4. Every transition appends an immutable `CaseEventSet` row and sets
   `UpdatedAtDate/Time`; the API-side audit_event table records the same fact.

## Extraction and scoring

`ZJE_ANOMALY_EXTRACT` runs per company code with a delta watermark on
`CPUDT/CPUTM` (+ document key as tie-breaker). It SELECTs BKPF/BSEG read-only
(projected fields; row-level access via RFC user authorization), computes the
score with model `ZJE_RISK_MODEL_V1`, writes only `ZJE_DOCDATA` / `ZJE_DOCCTX` /
`ZJE_RISK` / `ZJE_RISK_DRIVER`. On HANA the selection is pushed down via Open
SQL; no `SELECT *` from `/FIN` tables.

## Service activation

1. Install the transport (DDIC objects + classes + `ZJE_ANOMALY` model).
2. Run `/IWFND/MAINT_SERVICE` -> Add Service -> `ZJE_ANOMALY_SRV` -> activate.
3. Test with `/IWFND/GW_CLIENT`:
   `GET /sap/opu/odata/sap/ZJE_ANOMALY_SRV/WorklistSet?$top=10&$format=json`.
4. Monitor `/IWFND/ERROR_LOG` and `/IWFND/CACHE_CLEANUP` after transport imports.
5. Full request/response examples and error mapping:
   see **`ODATA_API_CONTRACT.md`** in this folder.
