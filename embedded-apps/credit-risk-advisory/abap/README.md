# Credit Risk Advisory — SAP OData V2 Backend (Plug & Play)

This folder contains everything needed to serve the **Credit Risk Advisory AI**
from **SAP ECC 6.0 EHP8 on Suite on HANA 2.0** exclusively through the SAP
Gateway OData V2 service **`ZCREDIT_ADV_SRV`**. The web API ships with a
built-in OData V2 client adapter (`apps/api/src/odata.ts` + `datasource.ts`);
enabling it is a configuration change — no web code changes.

## What you get

| File | What it is |
| --- | --- |
| `ZCREDIT_ADV_SRV.md` | Service design: model, entity sets, function imports, authorization |
| `ODATA_API_CONTRACT.md` | Request/response contract, error codes, field mapping |
| `abap/zcredit_adv_install.abap` | DDIC installer report (idempotent) |
| `abap/zcl_zcredit_adv_mpc_ext.abap` | Model provider extension |
| `abap/zcl_zcredit_adv_dpc_ext.abap` | Data provider — GET + function imports |

## Enabling the backend (2 steps)

### 1. On SAP (once)

1. Import the transport containing the Z tables, classes and SEGW model.
2. Run report `ZCREDIT_ADV_INSTALL` to create the DDIC artefacts.
3. `/IWFND/MAINT_SERVICE` → Add Service → `ZCREDIT_ADV_SRV` → activate.
4. Grant the service RFC user `ZCREDIT_ADV_AUTH` (ACTVT=01, BUKRS=<codes>).
5. Run `/IWFND/GW_CLIENT` smoke test:

```
GET /sap/opu/odata/sap/ZCREDIT_ADV_SRV/CustomerSet?$top=10&$format=json
```

### 2. In the API environment

`apps/api/.env`:

```dotenv
DATA_BACKEND=sap
SAP_BASE_URL=https://<gwhost>:<port>/sap/opu/odata/sap/ZCREDIT_ADV_SRV
SAP_CLIENT=100
SAP_USERNAME=<service-rfc-user>
SAP_PASSWORD=<from-approved-secret-vault>
SAP_TIMEOUT_MS=20000
```

Start the API. `npm run dev` → all customer, worklist, KPI and decision routes
now read/write through the Gateway. The health endpoint reports the active
backend: `GET /health` → `{ "backend": "sap", ... }`.

## What the adapter does

- Implements the OData V2 client (Basic auth, `$format=json`, `sap-client`,
  CSRF token handshake for writes, `/Date(ms)/` and `Edm.Decimal` normalisation).
- Maps every REST route to the matching entity set / function import with
  identical JSON shapes:

| REST route | OData call |
| --- | --- |
| `GET /api/dashboard/kpis` | `GET KpiSet` |
| `GET /api/customers` | `GET CustomerSet` ($filter on SalesOrg) |
| `GET /api/customers/{id}` | `GET CustomerSet('id')` + function import `RiskAdvisory` |
| `GET /api/worklist` | `GET WorklistSet` ($filter on RiskBand) |
| `POST /api/approvals/{doc}/decision` | function import `SubmitDecision` |

## Backend switch

`DATA_BACKEND` accepts `memory` (default, prototype) or `sap`. Rollback is a
single environment variable. Both backends expose the same zod-validated
routes and the same JSON contract.

## Contract notes

- `CustomerNo` is the primary key (up to 10 alphanumeric chars).
- Amounts are `Edm.Decimal` and arrive as quoted strings; the adapter converts
  them to numbers.
- Dates/times are `Edm.DateTime` (`/Date(ms)/`); the adapter converts to ISO.
- The DPC rejects `DELETE` (405) everywhere — the audit model is append-only.
- Error codes `ZCREDIT/*` map to the REST status contract (400/403/404/409/502).