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

## LaneSet - lane-wise, mode-wise freight rates (2026-11-26)
Source: SD shipment-cost condition **ZB00** "Freight Gross Weight" (KAPPL F, access sequence Z001), maintained in TK11/TK13.
CDS view **`ZI_TMS_LANERATE`** (`sap/zi_tms_lanerate.ddls`, SQL view `ZITMSLANERT`, classic `define view` - EDS is SAP_BASIS 7.50,
package ZEMAMI, transport EDSK9B0EM3) = `union all` of the three condition tables, each joined to KONP (KOPOS 01, not deleted), valid on
parameter `p_date` (defaults to the system date):

| Table | Key (after KAPPL/KSCHL) | Access step | Valid records 2026-11-26 |
|---|---|---|---|
| A964 | SHTYP ROUTE ADD01 ADD02 SDABW TDLNR ZDAYS VSART | 09 | 1,070 |
| A973 | SHTYP ROUTE ADD01 ADD02 SDABW TDLNR VSART | 10 | 1,896 |
| A972 | SHTYP ROUTE ADD01 ADD02 SDABW TDLNR (no VSART) | 20 | 3 |

Meaning: lane = ROUTE (TVRO distance DISTZ, transit TRAZTD = HHHHMMSS, TVRAB first KNANF / last KNEND), mode = VSART (T173T: 01 Truck,
03 Train ...) + ADD01 (VTADD01T: truck codes FTL9MT, 15T, CONT15MT ... or rate methods RTPKG/RTPCAR/ABSL), ADD02 = rate basis
(WEIGHT / FLAT RATE / CARTON), SDABW NORM/COUR, TDLNR = transporter. Rate = KBETR per KPEIN KMEIN - **INR per 1 KG gross weight on every
record, including those with ADD02 = FLAT RATE**. A502 / A601 are also in Z001 but hold only 4 / 2 ZB00 records and are not read.

`ZCL_TMS_CORE=>GET_LANES` adds the texts, distance, transit hours, end points and Priority (1 = cheapest within shipment type + route +
ADD01 + ADD02 + VSART + SDABW). OData `LaneSet` (filters Route, Lifnr, Vsart, VehicleType; $top/$skip) works through the hub NGD gateway
with no extra Basis step (the MPC last-modified stamp was bumped). ABAP Unit: 17/17 in ZTMS_CORE_TEST.

App side (`backend/tmsTrips.js` syncLanes): SAP route points become locations when no location matches (by id, city, alias or
`sapPoint`; coordinates must then be filled in), truck codes become vehicle types (capacity from the code, volume unset = weight-only loading
check), service agents outside ZTRP are added as carriers; one rate per transporter x mode (A973 preferred over A964 over A972); hand-entered
rows are kept. Offers follow the indent's vehicle type and shipping type; a per-KG rate estimates freight on the indent quantity and the
invoice is checked against rate x delivered weight when there is no ECC shipment cost. A gateway on the old model (no condition record) is refused.

## Vehicle invoices - replacement of Instavans / ZSMART_VEH (2026-11-27)
What ZSMART_VEH (`ZMM_GET_VEHICLE_FROM_SMARTRUCK`) does today: pulls vehicles placed by Instavans per plant into `ZINSTA_VEHICLE_H`, lets the
depot attach billing documents to a vehicle (cases in KAR without inside-pack trade-scheme items, value NETWR+MWSBP, gross/net kg), sends
them to Instavans and stores them in `ZINSTA_VEHICLE_I`. `ZSTOCK_NEW`, `ZSTKTR_REP2` and `ZPWC_BUDGET` read `ZINSTA_VEHICLE_I` for the
truck number per invoice.

**Parallel run (now): Instavans is not touched.** Trip Trail writes only its own shadow tables (transport EDSK9B0EM3, task EDSK9B0EQO):

| Table | Key | Like |
|---|---|---|
| `ZTMS_TRIP_VEH` | SIN, WERKS | ZINSTA_VEHICLE_H (+ HUB_USER, CHG_ON/TIME) |
| `ZTMS_TRIP_INV` | SIN, VBELN | ZINSTA_VEHICLE_I (+ WAERS, HUB_USER) |

SIN = `TT-<trip sin>` (never clashes with Instavans AVQ.../BLU...). OData in ZTMS_SRV:
- `TripInvoiceSet` (GET; `Vbeln eq` and/or `Vbelv eq` delivery, optional `Werks eq`): figures exactly as ZSMART_VEH (checked: billing
  4280111664 / 4280111665 give 6.5 / 22,750 / 71.5 / 65 and 1 / 3,500 / 11 / 10 = what ZSMART_VEH stored), plus the Trip Trail vehicle
  and the Instavans vehicle holding it. Cancelled (VBRK-FKSTO) and wrong-plant documents carry a Message.
- `TripVehicleSet` (POST, idempotent): the vehicle and its COMPLETE invoice list; adds/refreshes rows, flags removed ones LOEKZ = 'X',
  VehExit 'E' after departure. Refuses an invoice already on another Trip Trail vehicle. Commits only a fully valid write.
- `ParallelCheckSet` (GET; `Werks eq`, `Days eq`): billing documents on a vehicle in either system in the last N days, status
  MATCH / DIFF / TT_ONLY / INSTA_ONLY. App page: **Vehicle Invoices**.

**Cutover (later, after the parallel run is signed off):** set TVARVC `ZTMS_INSTA_WRITE` = `X` (type P) - from then on the same write also
fills `ZINSTA_VEHICLE_H/I`, so the three reports keep their truck number. Do it only together with stopping Instavans: lock transaction
ZSMART_VEH (SM01) first, because its "get vehicles" run marks every open vehicle of the plant that Instavans does not return as exited.
Then retire proxies ZCO_SAP_REQUEST / ZCO_SAP_INVOICEGET_VEHICLES / ZCO_SAP_API_AWSINVOICE (they carry hard-coded Instavans logins) and
`ZMM_MATERIAL_DTL_TO_SMARTRUCK`. Write tests (11 scenarios incl. the cutover path) ran in a rolled-back classrun on EDS; EDS only allows
harmless ABAP Unit, so they are not in ZTMS_CORE_TEST. No e-mail is sent by any of this.

## FreightCondSet - A964 with transporter and route text (2026-11-27)
CDS **`ZI_TMS_A964_VENDOR`** (`sap/zi_tms_a964_vendor.ddls`, SQL view `ZITMSA964VEND`, transport EDSK9B0EM3): every field of freight condition
table **A964** (KAPPL, KSCHL, SHTYP, ROUTE, ADD01, ADD02, SDABW, TDLNR, ZDAYS, VSART, DATBI, DATAB, KNUMH) with, all LEFT OUTER joins:
`TDLNR -> LFA1-LIFNR` (NAME1 -> VendorName, REGIO -> VendorRegion, ADRNR -> AddressNumber), `LFA1-ADRNR -> ADR6-ADDRNUMBER` (SMTP_ADDR ->
VendorEmail: the company address, default e-mail only, so one row per record) and `ROUTE -> TVROT-ROUTE` language **E** (BEZEI -> RouteText;
SAP's language key is one character, `EN` finds nothing). 22,790 rows on EDS = the table's rows. On EDS no A964 transporter has an e-mail
in ADR6 (the join is proven on other vendors), so VendorEmail is blank there.

OData `FreightCondSet` in ZTMS_SRV (key `Knumh`; `ZCL_TMS_CORE=>GET_FREIGHT_COND`): filters `Route`, `Tdlnr` (leading zeros optional), `Kschl`,
`Vsart`, `Shtyp`, `Add01` (eq, several values with `or`), `$top` / `$skip`. With no filter `$top` is mandatory (about 20,000 rows); at most 5000
per request. Newest validity first within route and transporter. Backend: `sapSvc.freightConditions({ route, vendor, condType, shippingType,
shipmentType, add01, top, skip })` in `backend/tmsSap.js` (a bare call returns the first 500 rows). ABAP Unit 19/19, backend tests 51/51.

## Distribution Planning feed (2026-11-28) - DEPLOYED AND VERIFIED ON EDS
Transport EDSK9B0EM3 (IT_FCOMMON, modifiable; same request as the rest of ZTMS_SRV). Objects: new class `ZCL_TMS_DP` (+ local test class, 10 ABAP Unit, all green),
regenerated `ZCL_TMS_TY` / `ZCL_ZTMS_MPC`, patched `ZCL_ZTMS_DPC`. All four active, `inactive objects` empty. `$metadata` on EDS listed the 7 sets immediately (no cache cleanup needed).
Sources under `sap/`: `zcl_tms_dp.abap`, `zcl_tms_dp.testclasses.abap`, `gen/spec.py`+`gen.py` (-> `zcl_tms_ty.abap`, `zcl_ztms_mpc.abap`), `zcl_ztms_dpc.abap`.
Every figure below was cross-checked against datapreview SQL (or an independent SQL-side calculation) and matched exactly.

| set | key | fields (OData) | filters | EDS rows |
|-----|-----|----------------|---------|----------|
| DpMaterialSet | Matnr | Matnr, Maktx, Spart, Meins, Brgew, Gewei, CasePack, Brand, Mtart | `Spart eq`, `Matnr eq` (either number form), or `$top` | 38,546 (not deleted); Spart 10: 4,218, 03: 1,319 |
| DpStockSet | Matnr+Werks | Matnr, Werks, Unr, Git, Qi | `Werks eq` or `Matnr eq` | 19,835 over 129 plants (DP15: 609, Unr 2,290,321,596.01 = MARD) |
| DpLotSet | Matnr+Werks+Charg | Matnr, Werks, Charg, Hsdat, Vfdat, Unr, **LifePct** (0-100, -1 = no expiry date, 0 = expired) | `Werks eq` or `Matnr eq` | 22,440 over the 86 DP/UN/3P plants (DP15: 992 = MCHB sum) |
| DpStoSet | Matnr+Reswk+Werks | Matnr, Reswk, Werks, OpenQty | `Werks`, `Reswk`, `Matnr` eq | 4,094 over 54 receiving plants (DP15: 257, 4,715,282; Reswk DP29: 60,583,719.12) |
| DpOpenOrderSet | Matnr+Werks+Vtweg+Kdgrp | Matnr, Werks, Vtweg, Kdgrp, OpenQty | `Werks eq` or `Matnr eq`; optional `Vtweg eq` | 10 rows, 6 plants (DP15, DP16, DP19, DP47, DP59, UN11) - EDS has ~100 order items in 120 days |
| DpSaleSet | Datum+Matnr+Werks+Vtweg | Datum, Matnr, Werks, Vtweg, Qty | `Datum ge datetime'..'` REQUIRED (+ optional `Datum le`, max 100 days), `Werks`, `Vtweg`, `Matnr` eq | 35 rows for 20 Aug - 27 Nov (14,466 pcs); EDS has ~100 invoices in 2026 |
| DpTransitSet | Vbeln+Matnr | Vbeln, Matnr, Tknum, Swerks, Werks, Qty, Budat, Transporter, Vehicle | `Werks`, `Swerks`, `Matnr` eq | 9 rows, 2 plants (DP62: 410 pcs / 3 rows, DP59: 1,125,736 / 6 rows) |

Rules: material numbers go out without leading zeros and are accepted either way; quantities are base unit; `$top` <= 5000 with `$skip` paging (stable sort); **stricter than the contract**: the aggregated sets need a
Werks/Matnr filter (`$top` alone is refused); only DpMaterialSet accepts `$top` alone. Backend reader: `tmsSap.dpFetch`.

Resolved assumptions (against EDS data):
- **EKET-GLMNG is NOT "issued"**: it is the quantity of deliveries CREATED (a delivery without goods issue already counts). So `DpStoSet.OpenQty = EKET-MENGE - GLMNG` = not yet on any delivery ("not yet issued"). Correct for that meaning.
- **Transit** therefore = quantity of goods-issued STO deliveries (LIKP-WADAT_IST set, via LIPS-VGBEL/VGPOS) minus received (EKET-WEMNG), newest delivery first, STOs of the last 90 days. The first idea (EKBE VGABE 1 with XBLNR = delivery) was wrong: XBLNR of the goods receipt holds another reference.
- **MCH1** holds HSDAT/VFDAT (MCHA is empty for 44,821 of 44,822 rows). Left join, so batches without a MCH1 row keep their stock.
- **VBRP-FKLMG** is the base-unit quantity (a KAR item of 7 cartons x 300 = 2,100 pcs); FKIMG is the sales unit.
- Customer group is VBKD-KDGRP (header, POSNR 000000) - there is no KDGRP on VBAK. The planner's e-commerce test (his console uses customer-group NAMES) must be a code mapping in the backend (EDS codes seen: 01, 02, 03, 12, 16, 35, 51 ...).
- **FOR ALL ENTRIES drops duplicate rows**: two identical invoices on an order item counted once and overstated open orders by 10 pcs on DP47; fixed by also selecting the document / item numbers (same guard in transit).
- Brand = MARA-PRDHA (18-char product hierarchy code; no brand field in MARA). CasePack = MARM KAR (else CS) UMREZ/UMREN: 400001152 -> 900, same as the console.

EDS data limits: SD data is thin (orders/invoices in 2026: ~100 each; max billing date in VBRK is junk 30110730 - ignored by the window), in-transit STOs only at DP59/DP62, open STOs/stock/lots are rich (129 / 54 / 86 plants).
Basis for NGD: once EDSK9B0EM3 is imported on NGD, run the gateway cache cleanup (/IWFND/CACHE_CLEANUP) for ZTMS_SRV so the 7 new sets appear (same pending step as TripInvoiceSet / FreightCondSet / Out* sets).

## Phase 1: vendor e-mail + PlantSet (2026-11-28) - DEPLOYED AND VERIFIED ON EDS
Same transport EDSK9B0EM3. Changed: `ZCL_TMS_CORE` (GET_VENDORS), `ZCL_TMS_DP` (GET_PLANTS), `ZCL_ZTMS_DPC` (PlantSet), regenerated `ZCL_TMS_TY` / `ZCL_ZTMS_MPC` (gen/spec.py: Vendor + Email, Mobile; new Plant). All active; ABAP Unit: 14 green in ZCL_TMS_DP (4 new: plants_by_land, plants_by_code, vendors_email_format, vendor_email_is_default), the 19 existing ZTMS_CORE_TEST tests still green.

**VendorSet.Email / Mobile.** Standard SAP rule for a vendor's address: LFA1-ADRNR -> ADR6 (e-mail) / ADR2 (telephone) of the *company* address (PERSNUMBER blank), rows flagged "not used" (FLG_NOUSE) ignored.
E-mail pick when there are several: **standard sender (ADR6-DFT_RECEIV 'X') first, then default (FLGDEFAULT 'X'), then lowest consecutive number (CONSNUMBER)**. Mobile = ADR2 with R3_USER '3' (mobile), same order, `TELNR_LONG` (international, e.g. +919435322795) else `TELNR_CALL`. Returned lower-case-untouched by SAP; the backend lower-cases and validates.
EDS coverage (checked by SQL and through VendorSet, identical): of the **1,413 transporter vendors in VendorSet (ZTRP, company 1000) only 8 have an e-mail** in the vendor master, 79 have a mobile; of all 2,400 ZTRP vendors 22 have an e-mail and 103 a mobile. So on EDS **1,405 carriers would stay without a vendor-master e-mail** (the 8: 0000240029, 0000240190, 0000241573, 0000241745, 0000241936, 0000241967, 0000241968, 0000241969). Multi-address vendors are rare (4 with a second row); every e-mail found is well-formed. (NGD/NWP will differ: re-count there.)

**PlantSet** (key Werks): Werks, Name1, Name2, Stras, Pstlz, Ort01, Regio, Land1, Adrnr, Fabkl, TimeZone, CityCode (T001W + ADRC address, nation blank, date_from 0001-01-01). Filters (EQ): `Werks`, `Land1`; or `$top` (<= 5000) with `$skip`; no filter and no `$top` = error "Give a filter (Werks or Land1 eq '...') or $top." EDS: **252 plants** (IN 232, AE 7, BD 5, LK 4, DE 2, EG 1 ...); TimeZone filled ('INDIA' 231, 'UTC+6' 9, 'UTC+3' 7), **CityCode is empty everywhere** on EDS (field kept, always blank for now). Regio is the SAP region *code* (WBL), not the state name.
Diff against the user's export (`public/plant-locations.json`, 110 plants): all 110 codes exist in SAP; **142 SAP plants are not in the file (122 of them in India)**, none the other way. PIN differences: only 3P17 (file blank, SAP 571438); name differs only for DP46 ('EMAMI LTD' vs 'EMAMI LIMITED'). 3P17 and 3P45 have no coordinates in the file (no valid PIN / PIN 131104 not found).
(Exact figures when the file's 110 are seeded: 108 get coordinates; with SAP merged: 252 plants, 108 with coordinates, `newInSap` = 144 plants without coordinates, 124 of them in India.)

**Backend** (`backend/tmsPlants.js`, mounted in tms.js as `/api/me/smartruck-tms/plants`, own table `emami_apps.tms_plant_geo`, NOT tms_state):
- `GET /plants` (hub session + app grant + TMS user) -> `{ plants:[{code,name,city,state,pincode,type,lat,lon,source,confidence,fromSap,hasCoordinates, country,region,street,timeZone (SAP rows only)}], newInSap:[codes without coordinates], simulated:bool }`. SAP master data wins for name/city/pincode; state = state name from the geo table, else the SAP region code. `simulated:true` (SAP not configured) = geo rows only, `fromSap:false`, `newInSap:[]`.
- `POST /plants/seed-geo` (Admin) body `{plants:[{code,name,type,city,state,pincode,lat,lon,source,confidence,note}]}` = the content of public/plant-locations.json (a bare array works too) -> `{seeded, skipped, invalid:[msg], invalidCount}`. Idempotent; never overwrites a coordinate an admin set by hand (source 'manual' -> counted in `skipped`); rows without coordinates or outside India are listed in `invalid`.
- `POST /plants/geo` (Admin) body `{code, lat, lon, confidence?}` -> `{plant}` (same shape as in GET). India box lat 6-37, lon 68-98 else 400 "...outside India..."; source becomes 'manual', confidence 'high' unless given; unknown plant (not on the map and not in SAP) 404. Non-admin 403.
- Vendor master sync (`syncMasters` command): carrier.email = SAP vendor e-mail whenever SAP has a valid one (overwrites, lower-cased, same validator as the carrier form, `emailSource:'sap'`); a manual e-mail stays only when SAP has none (`emailSource:'manual'`); an existing e-mail is never blanked. Manual edits through addCarrier / patchCarrier set `emailSource:'manual'`. Command result gains `emailsFromSap`, `emailsKeptManual`, `withoutEmail`. `map.vendor` returns `{code,name,paymentTerms,blocked,email,mobile}` (mobile is not stored on carriers).
- Tests: `test/tmsVendorEmail.test.js` (8), `test/tmsPlants.test.js` (10: pure merge, fake pool + fake SAP, permissions, the three routes over HTTP); `tms.test.js` mapping assertion updated for email/mobile. Whole TMS backend suite: 92 tests, 0 failed.

Basis for NGD: same transport EDSK9B0EM3; after import run the gateway cache cleanup (/IWFND/CACHE_CLEANUP) for ZTMS_SRV so PlantSet and the new VendorSet fields (Email, Mobile) appear. Not deployed to the DEV box (coordinator does that); then call `POST /plants/seed-geo` once as Admin with public/plant-locations.json.
