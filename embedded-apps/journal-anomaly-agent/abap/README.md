# SAP ECC OData V2 Backend — Plug & Play

This folder contains everything needed to serve the Journal Entry & GL Anomaly
Agent from **SAP ECC 6.0 EHP8 on Suite on HANA 2.0** exclusively through the SAP
Gateway OData V2 service **`ZJE_ANOMALY_SRV`**. The web API ships with a
built-in OData V2 client adapter (`apps/api/src/sap/`); enabling it is a
configuration change — no web code changes.

## What you get

| File | What it is |
| --- | --- |
| `ZJE_ANOMALY_SRV.md` | Service design: model, entity sets, methods, authorization |
| `ODATA_API_CONTRACT.md` | Request/response contract, error codes, field mapping |
| `abap/zje_anomaly_install.abap` | DDIC installer report (idempotent) |
| `abap/zcl_zje_anomaly_mpc_ext.abap` | Model provider extension |
| `abap/zcl_zje_anomaly_dpc_ext.abap` | Data provider — GET/CREATE/UPDATE/DELETE methods |

## Enabling the backend (2 steps)

### 1. On SAP (once)

1. Import the transport containing the Z tables, classes and SEGW model.
2. Run report `ZJE_ANOMALY_INSTALL` to create the DDIC artefacts.
3. `/IWFND/MAINT_SERVICE` → Add Service → `ZJE_ANOMALY_SRV` → activate.
4. Grant the service RFC user `ZJE_ANOMALY_AUTH` (ACTVT=01, BUKRS=<codes>).
5. Run `/IWFND/GW_CLIENT` smoke test:

```
GET /sap/opu/odata/sap/ZJE_ANOMALY_SRV/WorklistSet?$top=10&$format=json
```

### 2. In the API environment

`.env`:

```dotenv
DATA_BACKEND=sap
SAP_BASE_URL=https://<gwhost>:<port>/sap/opu/odata/sap/ZJE_ANOMALY_SRV
SAP_CLIENT=100
SAP_USERNAME=<service-rfc-user>
SAP_PASSWORD=<from-approved-secret-vault>
SAP_TIMEOUT_MS=20000
```

Start the API. `npm run dev` → all journal, case, dashboard and config routes
now read/write through the Gateway. Health check confirms connectivity:
`GET /api/v1/health/dependencies` reports `sap: { configured: true, ok: ... }`.

## What the adapter does

- Implements the OData V2 client (Basic auth, `$format=json`, `sap-client`,
  CSRF token handshake for writes, `/Date(ms)/` and `Edm.Decimal` normalisation).
- Maps every REST route to the matching entity set with identical JSON shapes:

| REST route | OData call |
| --- | --- |
| `GET /api/v1/journals` | `GET WorklistSet` ($filter/$top/$skip) |
| `GET /api/v1/journals/{cc}/{fy}/{doc}` | `GET HeaderSet` + `LineSet` + `CaseSet` + `RiskScoreSet`/`DriverSet` |
| `GET .../explanation` | `GET RiskScoreSet` (latest) + `DriverSet` |
| `GET /api/v1/dashboard/summary` | `GET DashboardSet` (per scope) |
| `POST /api/v1/cases` | `POST CaseSet` (+ `Idempotency-Key` header) |
| `PATCH /api/v1/cases/{id}` | `MERGE CaseSet('CaseId')` (RowVersion optimistic lock) |
| `GET /api/v1/config/risk-thresholds` | `GET ConfigSet` |

## Backend switch

`DATA_BACKEND` accepts `postgres` (default, unchanged) or `sap`. Rollback is a
single environment variable. Both backends are kept in lock-step by the same
zod-validated routes and shared unit-tested mapping helpers.

## Contract notes

- `CaseId` is a 32-char uppercase hex value on SAP; the adapter converts to the
  canonical uuid the web app exposes.
- Dates/times are modelled as `Edm.DateTime` pairs (`...AtDate`/`...AtTime`).
- The DPC rejects `DELETE` (405) everywhere — the audit model is append-only.
- Error codes `ZJE/*` map to the REST status contract (400/403/404/409/502).