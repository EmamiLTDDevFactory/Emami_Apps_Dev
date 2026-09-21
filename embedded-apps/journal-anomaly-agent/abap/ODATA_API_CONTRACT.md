# Journal Entry & GL Anomaly Agent — SAP OData V2 API Contract

Backend for ECC 6.0 EHP8 on Suite on HANA 2.0. All application data access runs
through the SAP Gateway OData V2 service `ZJE_ANOMALY_SRV`. The web API is
backend-agnostic: setting `DATA_BACKEND=sap` in the API environment routes every
journal / case / dashboard request to this service with identical JSON shapes.

- Service document: `GET /sap/opu/odata/sap/ZJE_ANOMALY_SRV/`
- Metadata: `GET /sap/opu/odata/sap/ZJE_ANOMALY_SRV/$metadata`
- SAP client: `?sap-client=NNN` (optional)
- Auth: Basic (RFC account; password from the approved secret vault, never the browser)

## Entity sets

| Entity set | Keys | Description |
| --- | --- | --- |
| `WorklistSet` | `CompanyCode`, `FiscalYear`, `DocumentNo` | Scored journal worklist row (denormalized read model of `ZJE_DOCDATA`). |
| `HeaderSet` | `CompanyCode`, `FiscalYear`, `DocumentNo` | Document header (BKPF fields + extraction stamp; read-only). |
| `LineSet` | `CompanyCode`, `FiscalYear`, `DocumentNo`, `Line` | Document line items (BSEG fields; read-only). |
| `GLMasterSet` | `GLAccount` | GL master attributes used for context/evidence enrichment. |
| `RiskScoreSet` | `CompanyCode`, `FiscalYear`, `DocumentNo`, `ModelVersion`, `Seq` | Latest scoring run per document. |
| `DriverSet` | `CompanyCode`, `FiscalYear`, `DocumentNo`, `ModelVersion`, `Seq` | Explainable risk drivers for a score. |
| `CaseSet` | `CaseId` | Anomaly case workflow (create/read/update). |
| `CaseEventSet` | `CaseId`, `EventSeq` | Append-only case history (read-only). |
| `DashboardSet` | `Scope` | Pre-aggregated KPI summary for one company code or `ALL`. |
| `ConfigSet` | `ConfigKey`, `Version` | Approved runtime configuration (risk thresholds, weights). |

## Read queries (all sets)

Supported OData V2 system query options:

- `$top` — page size. The DPC enforces a hard cap of **500**; larger values fail
  with `400 ZJE/TOO_MANY`.
- `$skip` — offset paging.
- `$filter` — field comparisons, `eq`, `and`, `or`, parentheses, `lt/le/gt/ge`.
- `$orderby` — allowed only on the listed sortable fields (see `$metadata`);
  other keys fail with `400 ZJE/BAD_SORT`.
- `$select` — projection; ignored fields are dropped.
- `$inlinecount` / `$count`

Unbounded queries are rejected (`400 ZJE/TOO_MANY`). All reads are filtered by
company-code authorization through `AUTHORITY-CHECK` against `ZJE_ANOMALY_AUTH`
or the service role.

### Example — worklist page

```
GET /sap/opu/odata/sap/ZJE_ANOMALY_SRV/WorklistSet?
  $format=json&$top=50&$skip=0&
  $filter=CompanyCode eq '1000' and FiscalYear eq '2026' and RiskBand eq 'Critical'&
  $orderby=CompositeScore desc
```

### Example — use in the API

With `DATA_BACKEND=sap`, `GET /api/v1/journals` maps `companyCode`, `fiscalYear`,
`period`, `risk` filters to `$filter`, `limit` to `$top`, and the opaque cursor to
`$skip`. The response keeps the exact `{ items, nextCursor }` shape.

## Write operations (CaseSet)

| Method | Path | DPC behavior |
| --- | --- | --- |
| `POST /CaseSet` | create | `CREATE_ENTITY` in `ZCL_ZJE_ANOMALY_DPC_EXT`. Requires `Idempotency-Key` header (16–120 chars). Sets `Status='OPEN'`, `RowVersion=1`. Duplicate open case -> `409 ZJE/OPEN_CASE_EXISTS` with `existingId`. Replayed idempotency key -> 200 with original case. |
| `MERGE /CaseSet('CaseId')` | update | `UPDATE_ENTITY` in `ZCL_ZJE_ANOMALY_DPC_EXT`. Optimistic lock on `RowVersion` -> `409 ZJE/STALE_VERSION` with `currentRowVersion`. Closing requires `Disposition` -> `400 ZJE/DISPOSITION_REQUIRED`. Returns 204 (empty) then re-read by client. |
| `GET /CaseSet('CaseId')` | read | `GET_ENTITY`. |

Each write appends an immutable `CaseEventSet` row (`CASE_CREATED`, `CASE_UPDATED`,
`CASE_CLOSED`) carrying `Actor` and the changed fields as JSON.

### Create payload (JSON in `{ "d": { ... } }`)

```json
{
  "CompanyCode": "1000",
  "FiscalYear": "2026",
  "DocumentNo": "1900008472",
  "FiscalPeriod": 9,
  "Severity": "Critical",
  "Rationale": "Round-amount posting after hours on a rare GL pair."
}
```

Headers: `X-CSRF-Token: Fetch` (get a token from the service document first) and
`Idempotency-Key: <client-generated>`.

## ATOM field mapping (OData property -> API JSON)

| OData property | API field (`GET /api/v1/journals...`) |
| --- | --- |
| `ScoredAtDate` / `ScoredAtTime` | `scoredAt` (ISO 8601 in the adapter) |
| `CompositeScore` (Edm.Decimal) | `score` (number) |
| `RiskBand` | `risk` |
| `KeySignal` | `signal` |
| `HeaderSet.DocumentDate` / `PostingDate` | `documentDate` / `postingDate` (YYYY-MM-DD) |
| `ReversalDoc <> ''` | `reversed` (boolean) |
| `CaseSet.DueAtDate` / `DueAtTime` | `dueAt` (ISO 8601) |
| `CaseSet.RowVersion` | `rowVersion` (optimistic lock) |

## Error contract

Gateway errors are returned in the OData V2 `{ "error": { "code", "message",
"innererror" } }` envelope. The API's `handleSapError` maps them: 4xx from the
DPC stay 4xx (400/403/404/409), transport errors become `502 SAP Gateway
unavailable`, always with the request `correlationId`.

| code | HTTP | Meaning |
| --- | --- | --- |
| `ZJE/TOO_MANY` | 400 | Unbounded page requested. |
| `ZJE/BAD_SORT` | 400 | `$orderby` on a non-sortable field. |
| `ZJE/IDEMPOTENCY_MISSING` | 400 | `Idempotency-Key` header absent/invalid. |
| `ZJE/OPEN_CASE_EXISTS` | 409 | Another OPEN case exists for the document; `existingId` included. |
| `ZJE/STALE_VERSION` | 409 | `RowVersion` mismatch; `currentRowVersion` included. |
| `ZJE/DISPOSITION_REQUIRED` | 400 | Closing without a disposition. |
| `ZJE/NOT_AUTHORIZED` | 403 | Company code outside the caller's authorization. |

## Delta extraction

The batch extraction report `ZJE_ANOMALY_EXTRACT` (docs in `abap/`) reads
accounting documents from **BKPF/BSEG read-only**, applies the delta watermark
(`CPUDT`/`CPUTM` + document key), computes the anomaly score with the deployed
model (feature contributions -> `DriverSet`), and inserts/updates rows in
`ZJE_DOCDATA` + `ZJE_DOCCTX` only. Selection on HANA is pushed down through
Open SQL; no direct SELECT * is allowed on `/FIN` tables outside the report.