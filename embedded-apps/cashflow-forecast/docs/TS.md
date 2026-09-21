# Technical Specification (TS)
## CashFlow Intelligence – AI-Assisted Cash Flow Forecasting
Document ID: TS-CFI-001 · Stack: SAP ECC 6.0 EHP8 + SoH 2.0 · Gateway OData V2 · Node.js BFF · React 19/TS (React Native phase 2)

---

## 1. Architecture Overview
```
Browser (React SPA, CSP-hardened)
   │  HTTPS (same origin)
   ▼
SAP Web Dispatcher / Enterprise Reverse Proxy (SSL termination, SSO, LB)
   │
   ├─► Node.js BFF (stateless, N instances behind NLB)
   │       helmet, CORS allowlist, rate limiting, TTL cache, gzip
   │       └─► SAP Gateway OData V2  (ZCASHFLOW_AI_SRV)
   │               └─► DPC_EXT / MPC_EXT
   │                       └─► ZCL_CF_FACADE (orchestration)
   │                               ├─ ZCL_CF_AUTH        (company-code AUTHORITY-CHECK)
   │                               ├─ ZCL_CF_REPOSITORY  (HANA-optimized reads)
   │                               ├─ ZCL_CF_FORECAST    (aggregation + scenario rules)
   │                               ├─ ZCL_CF_RISK        (scoring, alerts)
   │                               ├─ ZCL_CF_EXPLAIN     (factor contributions)
   │                               └─ ZCL_CF_ACTION      (governed recommendation + audit)
   └─► Static assets (dist/) served by enterprise web tier
```

## 2. SAP Data Sources (ECC 6.0 EHP8, standard tables)
| Domain | Tables | Use |
|---|---|---|
| Cash management | FDSB, FDSR, FDFIEP, FDES, FDM1, FDM2, FDS1, FDS2, FDZA | CM planning levels/groups, forecast items |
| AR | BSID, BSAD, KNA1, KNKK, T052, customer history | Receipt forecast, DSO, at-risk AR |
| AP | BSIK, BSAK, LFA1, T052, EKKO/EKPO/EKET/EKBE, RBKP/RSEG | Payment forecast, DPO, capex commitments |
| GL / Bank | BKPF, BSEG, BSIS, BSAS, T012, FEBKO/FEBEP, FDM | Actuals, bank balances, statement lines |
| SD pipeline | VBAK, VBAP, VBEP, LIKP/LIPS, VBRK/VBRP | Order-to-cash expected receipts |
| Payroll/Statutory | HR payroll clusters, T710*, TDS/GST challan tables | Immovable outflow calendar |
| FX / Treasury | TCURR, TCURF, VTBF* (TR-TM if active) | Exposure and rates |
| CO/AA | COEP, COOI, ANLA/ANEK | Capex commitments |

**Performance rule:** no unrestricted `SELECT *` on BSEG/BSID/BSIK-class tables. Select with index-supported predicates (BUKRS + KUNNR/LIFNR + BUDAT/FDTAG/AUGDT), aggregate in CDS on HANA, page via `$top/$skip`, cap `$top` at 500.

## 3. Custom Tables (DDIC)
| Table | Purpose | Key fields |
|---|---|---|
| ZCF_RUN_HDR | Forecast run header (as-of, scenario, horizon, status, user) | RUN_ID |
| ZCF_RUN_WEEK | Weekly aggregates per run | RUN_ID, WEEK_NO |
| ZCF_RISK | Persisted risk snapshots (score, severity, owner) | RUN_ID, RISK_ID |
| ZCF_FACTOR | Explainability factor contributions + source lineage | RUN_ID, RANK |
| ZCF_ACTION | Governed actions, approval status, audit fields | ACTION_ID (GUID) |
| ZCF_AUDIT | Who created/approved/overrode what and when | AUDIT_ID |
| ZCF_POLICY | Company-code policy buffer, DSO/DCH targets, scenario multipliers | BUKRS |
| ZCF_DQ_LOG | Source freshness/SLA checks for the Data Health panel | FEED_ID, TS |

## 4. CDS Views (Suite on HANA 2.0)
Full sources in `abap/CDS_VIEWS.cds`. All views are DCL-protected (company code), annotated for SoH 2.0, and push aggregation to the HANA columnar engine:

| CDS View | Role |
|---|---|
| ZC_CF_OPEN_AR | Weighted open AR by due week, customer, planning level |
| ZC_CF_OPEN_AP | Weighted open AP by due week, vendor, planning level |
| ZC_CF_CM_ITEMS | Cash-management items (FDSB/FDFIEP) normalized to weekly buckets |
| ZC_CF_BANK_BAL | Bank account balances (statement/CM snapshot) |
| ZC_CF_SD_PIPELINE | Confirmed SD order pipeline as expected receipts |
| ZC_CF_PAYROLL_OUT | Payroll/statutory outflow calendar |
| ZC_CF_WEEKLY_CASH | Weekly inflow/outflow/closing aggregation consumed by the facade |

## 5. Standard Function Modules & BAPIs (reused, not modified)
| Object | Use in this app |
|---|---|
| BAPI_AR_ACC_GETOPENITEMS / BAPI_AR_ACC_GETBALANCE | AR open items and balances per authorized company code/customer |
| BAPI_AP_ACC_GETOPENITEMS / BAPI_AP_ACC_GETBALANCE | AP open items and balances |
| BAPI_COMPANYCODE_GETLIST | Company-code value list for `FilterValueSet` |
| BAPI_EXCHRATE_GETEXCHANGERATE | FX conversion for consolidated forecast |
| BAPI_BANK_GETLIST | Bank master mapping for balances |
| BAPI_FTR_DEAL_GETLIST / BAPI_FTR_DEAL_CREATE (TR-TM, optional) | Exposure deals; hedge execution only via treasury workflow, never from the app |
| FDBB001 (CM customer exit) | Hook to inject additional inflow/outflow sources into the CM cash forecast |
| FIEB_*/FDM_* family | Electronic bank statement and cash-management support reads |

## 6. BADIs / Enhancements
| BADI / Exit | Purpose |
|---|---|
| FDBB001 (TR-CM enhancement) | Plug custom receipt/payment sources into the CM forecast when CM forecast is the base |
| BADI_FEB_BSP | Enrich bank-statement postprocessing lines with project/agent tags for DQ checks |
| F110_PRECHECK_1 / F110_PRECHECK_2 | Guardrails validating re-sequencing proposals inside F110 runs |
| BADI_ACC_DOCUMENT | Only if a controlled execution service later posts approved actions (phase 3) |
| ZCF_BADI_EXTEND (custom definition) | Partner extensibility: add data sources/factors without modifying the facade |

## 7. OData Service Design (SEGW: ZCASHFLOW_AI → ZCASHFLOW_AI_SRV)
Entities per `docs/API_CONTRACT.md`: KPISet, ForecastSet, RiskSet, ExplainabilitySet, CashFlowLineSet, ActionSet, FilterValueSet.
Every entity read in DPC_EXT performs:
1. Parse `$filter` via `io_tech_request_context->get_filter( )`
2. Allowlist validation (scenario / horizon / company code)
3. `AUTHORITY-CHECK OBJECT 'F_BKPF_BUK' ID 'BUKRS' FIELD lv_bukrs ID 'ACTVT' FIELD '03'`
4. Facade call with server-side paging; honor `$inlinecount`
5. Raise `/IWBEP/CX_MGW_BUSI_EXCEPTION` for governed business errors

**CSRF**: mutations require `X-CSRF-Token` (Fetch → POST), enforced by Gateway; the BFF relays it, and the browser never talks to Gateway directly in production.

## 8. Security Architecture
| Layer | Controls |
|---|---|
| Network | TLS 1.2+ end-to-end; Web Dispatcher/reverse proxy with WAF; no direct Gateway exposure |
| AuthN | Enterprise SSO (SAML2/SPNEGO) at proxy; SAML2 cookies forwarded to Gateway; short-lived sessions |
| AuthZ | SAP roles: ZCF_USER (display), ZCF_ACTION (create recommendations), per-BUKRS via F_BKPF_BUK + ZCF custom authority object ZCF_BUKRS |
| OData | Allowlisted filters, CSRF token, read-only entities except ActionSet, error log monitoring (/IWFND/ERROR_LOG) |
| BFF | Helmet (CSP, HSTS, no-referrer), CORS allowlist + credentials, 32 KB body limit, input validation, two-tier rate limits (120 rpm GET / 10 rpm POST) |
| Browser | No SAP credentials; same-origin deployment; `noindex`; source maps only per policy |
| Data | No sensitive bank data exposed (masked/derived fields only); audit tables for all actions; log retention per compliance |
| Audit | ZCF_AUDIT + Gateway error log + BFF morgan logs shipped to central SIEM |

## 9. Performance Optimization
| Technique | Detail |
|---|---|
| HANA pushdown | CDS aggregation views compute weekly buckets in the DB; ABAP transfers only aggregates |
| Server-side paging | `$top` capped at 500 (BFF 200 for lines); `$inlinecount` for grids |
| Composite BFF call | One `/api/dashboard` request; BFF fans out to 4 entity sets in parallel (Promise.all) instead of 6 browser calls |
| TTL cache | 60 s per filter combination (Redis in multi-instance production) |
| Compression | gzip (BFF) + static asset brotli/gzip at web tier; JS bundle split on recharts when needed |
| Batch/parallel RFC | Facade uses `aRFC` in parallel for independent sources where app-server load permits |
| Client | `useMemo` scenario math, skeleton loading, tabular-nums, virtualized table (phase 2) |

## 10. Load Balancing & Availability
| Tier | Strategy |
|---|---|
| Web tier | Static SPA behind CDN/enterprise proxy; immutable hashed assets |
| BFF | Stateless; N instances behind NLB/round-robin; sticky sessions not required (JWT/SAML cookie shared via proxy); health endpoint `/api/health` for LB probes |
| SAP Gateway | Handled by Web Dispatcher (message-server based LB across app servers) |
| HANA | SoH single-node scale-up with secondary HSR standby (per landscape) |
| Cache coherence | Per-instance TTL acceptable (60 s); Redis optional for cross-instance hit rate |
| Degradation | If Gateway is slow: BFF serves stale cache up to 2×TTL with `stale=true` flag (phase 2); UI shows data age |

## 11. Environments & Transport
DEV (mock + SEGW build) → QA (integration + load test: 500 concurrent users, p95 < 1.5 s dashboard) → PRD via transport release. UI build deployed per `docs/DEPLOYMENT.md`.

## 12. React Native (Phase 2)
Reuse the identical OData contract through the BFF (`/api/dashboard`). Native app: React Native + Reanimated/Skia charts or react-native-svg; biometric SSO re-using SAML2 session; push notifications for policy-buffer breach risks. No business logic duplicated — the ABAP facade remains the single computation source.

