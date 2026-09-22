# Credit Risk Advisory AI — SAP Gateway Service Design (ZCREDIT_ADV_SRV)

Target: **SAP ECC 6.0 EHP8 on Suite on HANA 2.0**, SAP Gateway OData V2.

## Service identity

- Service name: `ZCREDIT_ADV_SRV`
- Technical name: `ZCREDIT_ADV_SRV`
- ICF path: `/sap/opu/odata/sap/ZCREDIT_ADV_SRV`
- Version: 1.0.0
- OData version: 2.0 (also compatible with the v3 metadata of newer Gateways)
- Authentication: Basic (RFC service user) from the API; the browser never
  holds these credentials.

## Data model

### CustomerSet (read)

Source tables: `KNA1`, `KNB1`, `KNKK`, `KNVV`, `LFA1`, plus derived exposure from
`KONV`, `LIKP`, `VBRK` (via the extraction report).

| Property | Type | Notes |
| --- | --- | --- |
| `CustomerNo` | Edm.String (10) | **Key** |
| `Name1` | Edm.String (40) | Customer name |
| `SalesOrg` | Edm.String (4) | Company org (EM01/EM02) |
| `CreditControlArea` | Edm.String (4) | CCA 5000/5001 |
| `DistributionChannel` | Edm.String (2) | |
| `Depot` | Edm.String (40) | |
| `CreditLimit` | Edm.Decimal | SAP credit limit |
| `Outstanding` | Edm.Decimal | Current exposure |
| `OpenOrder` | Edm.Decimal | Open order value |
| `OpenDelivery` | Edm.Decimal | |
| `Pgi` | Edm.Decimal | |
| `Billing` | Edm.Decimal | |
| `Overdue` | Edm.Decimal | |
| `AvgDelayDays` | Edm.Int32 | |
| `OnTimePct` | Edm.Decimal | |
| `TenureMonths` | Edm.Int32 | |
| `SecondaryTrend` | Edm.Decimal | |
| `ReturnsPct` | Edm.Decimal | |
| `CreatedAt` | Edm.DateTime | Extract load timestamp |

### WorklistSet (read-only)

Denormalized risk worklist rows: order/delivery/billing documents with blocking
state and recommendation.

### KpiSet (read-only)

Pre-aggregated KPIs by company code or ALL.

### DecisionLogSet (append-only)

Approval decisions, immutable, actor + timestamp + payload JSON.

### CreditLimitChangeSet (append-only)

Proposed and approved credit-limit changes.

## Function imports

| Function | Kind | Description |
| --- | --- | --- |
| `RiskAdvisory` | GET | Score a customer, returning band, utilization, hard stops, recommendation. |
| `SubmitDecision` | GET | Record a decision to DecisionLogSet (idempotent). |
| `CreditLimitCheck` | GET | Validate a proposed limit against policy. |

## Authorization

- Service role: `ZCREDIT_ADV_AUTH` (`ACTVT=01`, `BUKRS=*`).
- Company code restrictions enforced via `AUTHORITY-CHECK` inside the DPC
  (ABAC-aligned with the app's role model).
- Decisions additionally require `ACTVT=17` (approval) for the service user
  mapped role `COMMERCIAL_HEAD`, `CFO` or `ADMIN`.

## Security capabilities (DPC)

- Maximum page size 500 (`$top` > 500 → `400 ZCREDIT/TOO_MANY`).
- `$orderby` allow-list (sortable fields only).
- `DELETE` → 405 (append-only model).
- No dynamic SQL: filters are parsed into a fixed set of comparisons.
- No direct DB access outside the extraction report.