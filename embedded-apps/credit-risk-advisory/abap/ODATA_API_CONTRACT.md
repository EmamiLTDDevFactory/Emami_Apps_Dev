# Credit Risk Advisory — SAP OData V2 API Contract

Backend for **ECC 6.0 EHP8 on Suite on HANA 2.0**. All application data access
runs through the SAP Gateway OData V2 service **`ZCREDIT_ADV_SRV`**. The web
API is backend-agnostic: setting `DATA_BACKEND=sap` in the API environment
routes every customer / worklist / KPI / decision request to this service with
identical JSON shapes.

- Service document: `GET /sap/opu/odata/sap/ZCREDIT_ADV_SRV/`
- Metadata: `GET /sap/opu/odata/sap/ZCREDIT_ADV_SRV/$metadata`
- SAP client: `?sap-client=NNN` (optional)
- Auth: Basic (RFC account; password from the approved secret vault, never the browser)

## Entity sets

| Entity set | Keys | Description |
| --- | --- | --- |
| `CustomerSet` | `CustomerNo` | Credit master + current exposure (KNC1/KNBK/KNVV fields, read-only). |
| `WorklistSet` | `DocumentNo`, `CustomerNo` | Order/delivery/billing risk worklist rows. |
| `KpiSet` | `KpiId` | Pre-aggregated executive KPIs for one company code or `ALL`. |
| `CreditLimitChangeSet` | `RecordId` | Append-only credit-limit change log (write via function import). |
| `DecisionLogSet` | `RecordId` | Append-only approval-decision audit log (write via function import). |

## Function imports

| Function | Parameters | Return |
| --- | --- | --- |
| `RiskAdvisory` | `CustomerNo` | `Score`, `Band`, `Utilization`, `Exposure`, `HardStops`, `Recommendation` |
| `SubmitDecision` | `CustomerNo`, `Decision`, `Reason`, `IdempotencyKey`, `Amount` | `Status`, `Execution`, `RecordId` |
| `CreditLimitCheck` | `CustomerNo`, `CreditLimit`, `Currency`, `ValidFrom` | `Allowed`, `Message` |

## Read queries (all sets)

Supported OData V2 system query options:

- `$top` — page size. The DPC enforces a hard cap of **500**; larger values fail
  with `400 ZCREDIT/TOO_MANY`.
- `$skip` — offset paging.
- `$filter` — field comparisons, `eq`, `and`, `or`, parentheses, `lt/le/gt/ge`.
- `$orderby` — allowed only on the listed sortable fields; other keys fail with
  `400 ZCREDIT/BAD_SORT`.
- `$select` — projection; ignored fields are dropped.
- `$inlinecount` / `$count`

Unbounded queries are rejected (`400 ZCREDIT/TOO_MANY`). All reads are filtered
by company-code authorization through `AUTHORITY-CHECK` against
`ZCREDIT_ADV_AUTH` or the service role.

### Example — worklist page

```
GET /sap/opu/odata/sap/ZCREDIT_ADV_SRV/WorklistSet?
  $format=json&$top=50&$skip=0&
  $filter=RiskBand eq 'Critical'&
  $orderby=Amount desc
```

### Example — use in the API

With `DATA_BACKEND=sap`, `GET /api/customers?org=EM01` maps the `org` filter to
`$filter=SalesOrg eq 'EM01'`; the response keeps the exact `Customer[]` shape.

## Write operations (function imports)

| Method | Path | Behavior |
| --- | --- | --- |
| `GET /RiskAdvisory('CustNo')` | read | Live score + explainable drivers. |
| `GET /SubmitDecision(...)` | write | Appends to `DecisionLogSet`. Requires `IdempotencyKey` (UUID); replays return the original `RecordId`. |
| `GET /CreditLimitCheck(...)` | write | Validates a proposed limit against policy (idempotent; no audit write). |

`SubmitDecision`:

```
GET /sap/opu/odata/sap/ZCREDIT_ADV_SRV/SubmitDecision?$format=json
  &CustomerNo='D000126'
  &Decision='CONDITIONAL_RELEASE'
  &Reason='Customer cleared E2E validation under 2 Cr'
  &IdempotencyKey='f47ac10b-58cc-4372-a567-0e02b2c3d479'
```

Every write appends an immutable `DecisionLogSet` row carrying `Actor`, the
changed fields as JSON, and the SAP timestamp — satisfying append-only audit.

## OData property -> API JSON field mapping

| OData property | API field (`GET /api/...`) |
| --- | --- |
| `CustomerNo` | `id` |
| `Name1` | `name` |
| `SalesOrg` | `org` |
| `CreditControlArea` | `cca` |
| `CreditLimit` (Edm.Decimal) | `limit` (number) |
| `Outstanding` | `outstanding` |
| `OpenOrder` / `OpenDelivery` / `Pgi` / `Billing` | `openOrder` / `openDelivery` / `pgi` / `billing` |
| `Overdue` | `overdue` |
| `AvgDelayDays` | `avgDelay` |
| `OnTimePct` | `onTime` |
| `TenureMonths` | `tenure` |
| `SecondaryTrend` | `secondaryTrend` |
| `ReturnsPct` | `returns` |
| `CreatedAt` (Edm.DateTime) | `createdAt` (ISO 8601 via adapter) |

## Error contract

Gateway errors use the OData V2 `{ "error": { "code", "message", "innererror" } }`
envelope. The API's `handleSourceError` maps them: 4xx from the DPC stay 4xx
(400/403/404/409), transport errors become `502 SAP Gateway unavailable`, always
with the request `correlationId`.

| code | HTTP | Meaning |
| --- | --- | --- |
| `ZCREDIT/TOO_MANY` | 400 | Unbounded page requested. |
| `ZCREDIT/BAD_SORT` | 400 | `$orderby` on a non-sortable field. |
| `ZCREDIT/NOT_AUTHORIZED` | 403 | Company code outside the caller's authorization. |
| `ZCREDIT/CUSTOMER_NOT_FOUND` | 404 | Customer key unknown. |
| `ZCREDIT/IDEMPOTENCY_MISSING` | 400 | `IdempotencyKey` absent/invalid. |
| `ZCREDIT/POLICY_BLOCKED` | 409 | Hard-stop policy blocks the decision. |
| `ZCREDIT/EXTERNAL_VALIDATION` | 503 | HANA-side delta extraction not yet committed. |

## Delta extraction

The batch extraction report `ZCREDIT_ADV_EXTRACT` reads credit/order data from
**KNKK/KNBK/KONV/LIKP/VBRK read-only**, applies the delta watermark, computes
the risk score (feature contributions kept for explainability), and inserts/
updates rows in the Z tables only. Selection is pushed down through Open SQL on
HANA; no direct SELECT * is allowed on `/FIN` tables outside the report.