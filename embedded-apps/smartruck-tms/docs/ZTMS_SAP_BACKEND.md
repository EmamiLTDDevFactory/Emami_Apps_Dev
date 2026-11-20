# SmarTruck TMS - SAP backend (ZTMS_SRV) and how it is wired

Built on **EDS (client 900)** on 2026-11-19 through ADT, no SEGW project (same technique as `ZLIFE_INS_SRV`). Transport request **EDSK9B0EM3**
(task EDSK9B0EM4, text "Generated Request for Change Recording" - rename in SE09 if you like), package `ZEMAMI`, **unreleased**.
Sources and the model generator are in `../sap/`.

## What is on EDS

| Object | Role |
|---|---|
| `ZCL_TMS_TY` / `ZCL_ZTMS_MPC` | OData types and code-based model, **generated** from `sap/gen/spec.py` (`python3 sap/gen/gen.py`) |
| `ZCL_TMS_CORE` | business logic, no UI, no COMMIT: transporters, customers, PO/SO check, freight invoice, payment status |
| `ZCL_ZTMS_DPC` | data provider; commits only a real new posting |
| `ZTMS_CORE_TEST` | 10 ABAP Unit tests, all green (read-only; invoices run with `Simulated = 'X'`) |
| IWMO `ZTMS_MDL`, IWSV `ZTMS_SRV`, IWSG `ZTMS_SRV_0001`, SICF node, alias LOCAL | registered by ABAP classruns (helpers deleted afterwards) |

`GET https://emamidev.emami.local:4440/sap/opu/odata/sap/ZTMS_SRV/$metadata` answers 200.

## Entity sets

| Set | Access | Meaning |
|---|---|---|
| `VendorSet` (`Lifnr`) | read, `$filter=Lifnr eq` | transporters = vendors of account group **ZTRP** that exist in company code (default 1000); `Sperr`/`Loevm` = 'X' when blocked or deleted at client or company level |
| `CustomerSet` (`Kunnr`) | read | KNA1 not deleted, `Zone` = state text (T005U). Capped at 5000 rows (28,800 customers exist): ask by `$filter=Kunnr eq` |
| `PoSoCheckSet` (`Po`,`So`) | read | does the PO (EKKO, not deleted) / sales order (VBAK) exist |
| `PaymentStatusSet` (`Belnr`) | read, `$filter=Belnr eq 'a' or ...` (max 50) | `Cleared`='X', `Augbl`, `Augdt` from BSAK |
| `FreightInvoiceSet` (`ExtRef`) | **create only** | check or post the carrier freight invoice (below) |

The Azure gateway passes only GET and POST and no function imports, so the one write is an entity create, as in the other apps.

## Freight invoice: what it does and what it does not

`POST FreightInvoiceSet {ExtRef, Lifnr, Amount, Waers:'INR', InvDate, Werks, Sin, Miro, Simulated}`

1. `ExtRef` mandatory (the app sends `TMS-<invoice id>`), amount > 0, INR only.
2. **Idempotent:** a non-reversed FI document in the company code with `XBLNR = ExtRef` and header text `TMS...` is returned instead of posting again.
3. Vendor must be a ZTRP vendor of the company code and not blocked.
4. **If TVARVC `ZTMS_FREIGHT_GL` is not set it stops here** and answers `Validated ... NOT posted: TVARVC ZTMS_FREIGHT_GL is not set`.
5. Otherwise `BAPI_ACC_DOCUMENT_CHECK`; `Simulated = 'X'` stops after the check; else `BAPI_ACC_DOCUMENT_POST` (Dr freight GL / Cr vendor, doc type `ZTMS_BLART` default KR,
   payment terms from LFB1, text carries the SIN and the hub user's e-mail), then COMMIT. Errors come back as HTTP 400 with every BAPI message.

TVARVC parameters (type P): `ZTMS_BUKRS` (1000), `ZTMS_FREIGHT_GL` (**no default, finance must give it**), `ZTMS_TAXCODE` (optional), `ZTMS_BLART` (KR).

**Not verified and why it matters:** I found no existing freight-posting pattern for transporters on EDS (only 62 cleared transporter items in company 1000), and the old system's
screens say "Shipment Cost / SAP-Doc No." and "Miro", which points at SD shipment costs + invoice verification. Whether Finance wants a direct FI vendor invoice (this build), or SD
shipment cost documents with MIRO, is a Finance/SAP decision. Until `ZTMS_FREIGHT_GL` is set nothing is ever posted. A real post has not been run on EDS.

Writes run as the gateway's technical user; the hub user's e-mail (`emamiuser=` / `X-Emami-User`) is only written into the document text. SAP does not map it to a user (open
finding, same as Gate Entry).

## Hub backend (`backend/tms*.js`)

Mounted at `/api/me/smartruck-tms` (needs the `smartruck-tms` grant in Admin Center). `tmsSap.js` is the only file that knows SAP names; with `TMS_SAP_ODATA_BASE` empty it runs
**simulated** and the app says so. Settings are in `backend/.env.example`. 90 backend tests pass (31 for TMS). **Not deployed**: the PM2 box at 172.17.2.21 is a manual deploy,
see memory `backend_deploy_topology`.

### To go live (in order)
1. Deploy `backend/` to the PM2 box (DEV first). Tables `emami_apps.tms_state` / `tms_audit` are created on first use.
2. Give yourself the `smartruck-tms` grant as Admin; the first Admin is bootstrapped as TMS Admin. Add users in Settings > User Management.
3. Point `TMS_SAP_ODATA_BASE` at EDS directly with basic auth (dev only, the box must reach 10.17.10.13:4440), **or** ask Basis to register `ZTMS_SRV` on hub NGD (alias to EDS) + `S_SERVICE`;
   the Azure gateway has no EDS landscape. Then Settings > Integrations > "Sync carriers and customers from SAP".
4. Build the app with `NEXT_PUBLIC_TMS_MODE=live` (or open it with `?mode=live` once). Settings > Integrations > "Load demo data into live" fills a DEV database for a pilot walk-through.
5. Set `TMS_INGEST_KEY` and give the GPS / telecom providers the ingest URLs. Provider contracts (SIM-consent API, GPS feed format, e-way bill GSP) are **not known**; `tmsIntegrations.js` is the only place to adapt.
6. Release transport EDSK9B0EM3 and import to NGQ/NWP when Finance has settled the posting question above.

## Phases in the rebuild plan vs what exists

| Phase | Built | Still open |
|---|---|---|
| 0 Discovery and migration | validated, referentially-checked JSON import with dry run (`/admin/import`) | stakeholder answers (SSO, hosting, SAP/JDE contract owner, pilot unit); extracting the data from Instavans |
| 1 Orders, carriers, RBAC | server-enforced roles per action, unit scope, audit table, masters synced from SAP | SSO is the hub login; JDE not touched |
| 2 Tracking, control tower, ePOD | ingest API (key), geofence status changes, speed / corridor / GPS-gap anomalies, SIM-consent callback, e-way expiry alerts, ePOD flow | real GPS / telecom / e-way providers; ePOD file storage (status only, no file upload yet) |
| 3 Bidding, accounting, ERP | auction rules and carrier-only view enforced server-side, invoice pipeline, SAP posting + payment sync | Finance decision above; JDE posting; vouchers are records only |
| 4 Reports, rollout | 41 server-side reports in 8 categories (plan says 9, lists 8) | 5 reports have no data source here (vehicle service / maintenance, driver expenses, warehouse temperature); warehouse/replica and load test at company scale |

Known limits: state is one locked JSON document (pilot scale); move to tables before company-wide volume. No push notifications, e-mail or SMS are sent unless `TMS_NOTIFY_URL` is set.
