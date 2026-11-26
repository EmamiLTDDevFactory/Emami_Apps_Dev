# SmarTruck TMS - Outward Shipment Tracking & Freight Portal (Release 1)

Source: `Shipment_Tracking_30Day_Plan.docx` (draft v1.0, 23 Nov - 22 Dec 2026). This file is the working spec adapted to our stack.
Decision (2026-11-23): this extends SmarTruck TMS. SmarTruck was an external vendor's product; IT is replacing it with this in-house build,
so Release 1 doubles as the replacement. Cutover, vendor onboarding and old-system data import (`POST /admin/import`) are in scope.

## Architecture (differences from the source plan)
| Source plan | Here |
|---|---|
| Next.js server actions, Prisma | Static Next.js UI + hub backend (Express, Postgres, PM2) commands in `backend/tms*.js` |
| ECC CDS views | Code-based OData V2 service on EDS/NGD (like `ZTMS_SRV`): read entity sets; gateway allows GET/POST only, no function imports |
| SAP/ULIP "Mock and Real" | `SapPort`, `UlipPort`, `MailPort`, `FilePort`: simulated until configured (pattern of `tmsIntegrations.js`) |
| Postgres tables | Workflow state is still the locked JSON document (pilot scale). Tracking events and files get their own tables; move the rest to tables before company-wide volume |

ECC stays the system of record for deliveries, shipments, costs and e-invoices. The portal owns indent, allocation, vehicle/driver, tracking, receipt, POD and invoice workflow.

## Mapping to the existing engine
| Release 1 concept | Existing | New |
|---|---|---|
| Indent | - | `indents`, `lanes` (vendor priority + rate), `vehicleTypes`, `settings` |
| Allocation / vendor response | Order, allocate, Carrier Vendor | `vendorRespond`, offer timeout in `sweep` |
| Trip | Shipment (assign, advance, ping ingest, geofence) | `indentId` link, capacity check, LR/seal, receipt, POD gate |
| Freight invoice | Invoice + SAP posting adapter | tolerance check vs ECC shipment cost, mail |
| Recipient link | - | public tokenised read-only route |

## Status (2026-11-23)
Built and tested locally (backend 47 tests; browser run of the whole flow against the real router with the real UI: 31 checks, no UI errors):
- [x] Slice 1 `backend/tmsOutward.js`: vehicle types, lanes with ordered vendors, indents, vendor accept/reject (reason mandatory), timeout to next vendor, escalation to HO, HO `offerIndent`, cancel.
- [x] Slice 2 `backend/tmsTrips.js`: `vendorAssign` (vehicle, driver, mandatory driver consent with wording version, ULIP document check, duplicate live vehicle, replace before departure).
- [x] Slice 3 SAP reads: `OutDeliverySet`, `OutShipmentSet` (sources in `sap/`, NOT yet compiled/deployed), `linkDeliveries`, `linkShipment` (vendor match, one ECC shipment per trip, cost), unlinked-trip alert.
- [x] Slice 4 `loadingCheck` (max of weight/volume %, below minimum needs reason + depot-head approval, over 100 % only HO), `vendorDepart` (LR unique per vendor, seal, photo, tracking token).
- [x] Slice 5 tracking: events, manual checkpoints (labelled Manual), ULIP poll (`tmsUlip.js`, simulated until credentials), ETA, public recipient link (`GET .../public/track/:token`, rate limited, masked).
- [x] Slice 6 `recordReceipt`, `approveCharges`, `vendorUploadPod` (closes trip), `vendorInvoice` (POD, LR match, one per trip, tolerance vs ECC cost + approved charges, review queue, mail request), `reviewFreightInvoice`, 9 MIS reports (category OUTWARD TRACKING), `saveSettings`, `syncLanes`.
- [x] UI: Indents, Vendor Portal (mobile friendly), Trip panel (shipment detail > Outward Trip), Settings > Outward Rules, public `/track/?t=`.

## Not done / needs input
- SAP (EDS, 2026-11-23): `OutDeliverySet`, `OutShipmentSet` compiled, active and tested on EDS in transport EDSK9B0EM3 (14 ABAP Unit tests green; real deliveries/shipments read back correctly). Still open: register/refresh the new sets on the hub NGD gateway (Basis), and `LaneSet` is live since 2026-11-26 (condition ZB00 via CDS ZI_TMS_LANERATE, see ZTMS_SAP_BACKEND.md).
- Verified on EDS: system is S/4 (no LIKP-WBSTK; PGI = LIKP-WADAT_IST), carton unit is KAR (default `ZTMS_CARTON_UOM`), IRN table is `J_1IG_INVREFNUM` (docno, irn, cancel_date), e-way table `J_1IG_EWAYBILL` (docno, ebillno, vdtodate), `CostStatus` = VFKP-STABR (C settled / A open). The IRN and e-way tables are empty on EDS, so those two lookups are not proven against real data; volume is 0 where material master has no volume.
- ULIP: paths and response fields are assumptions (approval not granted). Until then vehicle validation is simulated (flagged in the UI) and tracking is manual checkpoints only. `TMS_ULIP_MOCK=1` (dev only) emits toll-like events.
- Mail: `TMS_MAIL_URL` / `TMS_MAIL_KEY` not set, so invoice mails are not sent (the result says so). Mailbox is set in Settings.
- Files: stored in Postgres (`emami_apps.tms_files`), type/size/signature checked, no malware scan (needs ClamAV or similar). nginx `client_max_body_size` must allow ~6 MB for 4 MB uploads.
- Demo mode: outward screens say they need the live server.
- Release 2 (unchanged): SIM tracking, HO dispatch planning, MIRO/service entry posting, claims, WhatsApp/OTP.

## Rules fixed here (confirm with business)
- One vehicle per indent in Release 1, so a trip maps to one indent.
- Offer timeout default 4 h (`settings.offerTimeoutH`); capacity minimum 80%; invoice tolerance 2%.
- Trip is created before the ECC shipment exists; the shipment is attached later via VTTP. Alert when unlinked past a threshold.
- Vendors see only offers addressed to them, with no customer detail.

## Open inputs
EDS credentials (password asked each session, never stored); pilot depots/lanes/vendors; ULIP approval status; mailbox and file storage service; legal consent wording and retention; Finance owner for invoice tolerance.
