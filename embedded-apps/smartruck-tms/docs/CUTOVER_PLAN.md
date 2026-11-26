# Trip Trail - Cutover Plan (Instavans SmarTruck -> Trip Trail)

| | |
|---|---|
| App | Trip Trail (code name `smartruck-tms`, URL `/apps/smartruck-tms/`) |
| Replaces | Instavans SmarTruck Shipper + SAP transaction **ZSMART_VEH** (`ZMM_GET_VEHICLE_FROM_SMARTRUCK`) |
| Approach | **Parallel run first** (Instavans stays live and untouched), then a switch-based cutover, lane by lane |
| Target | Pilot go-live per the 30-day plan: 22 Dec 2026 (subject to the exit criteria in section 5) |
| Status of this document | Draft v1.0, 27 Nov 2026 |

Related documents in this folder: `OUTWARD_TRACKING_PLAN.md` (scope and slices), `ZTMS_SAP_BACKEND.md` (SAP objects and rules).

---

## 1. What changes at cutover

| Today (Instavans) | After cutover (Trip Trail) |
|---|---|
| Vehicles are placed by Instavans and pulled into SAP by ZSMART_VEH ("Get vehicles") into `ZINSTA_VEHICLE_H` | Vehicle is assigned by the transporter in Trip Trail (indent -> offer -> accept -> vehicle and driver) |
| Depot attaches billing documents to the vehicle in ZSMART_VEH and sends them to Instavans; stored in `ZINSTA_VEHICLE_I` | Depot attaches billing documents on the trip ("Invoices on this vehicle"); SAP stores them in `ZTMS_TRIP_INV` and, after the switch, also in `ZINSTA_VEHICLE_I` |
| Vehicle exit = Instavans no longer returns the vehicle | Vehicle exit = departure confirmed in Trip Trail |
| Material master pushed to Instavans (`ZMM_MATERIAL_DTL_TO_SMARTRUCK`) | Not needed: Trip Trail reads SAP directly |
| Reports `ZSTOCK_NEW`, `ZSTKTR_REP2`, `ZPWC_BUDGET` read the truck number from `ZINSTA_VEHICLE_I` | Unchanged: after the switch Trip Trail fills `ZINSTA_VEHICLE_I`, so the reports keep working without any change |

Trip Trail SAP key for a vehicle is `TT-<trip no>` (e.g. `TT-SIN100231`). It can never clash with an Instavans SIN (`AVQ...`, `BLU...`).

---

## 2. Current state (27 Nov 2026)

| Area | State |
|---|---|
| App (DEV) | Live on `dev.emamiapps.in` with live SAP data (NGD gateway). Indents, offers, vehicle assignment, deliveries, loading check, departure, tracking (manual/mock), receipt, POD, freight invoice, lanes from SAP (ZB00), vehicle invoices + parallel check (committed locally, push pending) |
| Backend (DEV) | Deployed on the DEV hub backend (PM2 `emami-hub-backend-dev`); backend tests 49/49 |
| SAP (EDS) | All objects active in transport **EDSK9B0EM3** (tasks EDSK9B0EM4, EDSK9B0EQO), unreleased |
| PRD | **Nothing deployed** (no app, no backend, no SAP objects) |
| Instavans | Live and untouched |
| E-mail | **None sent by Trip Trail** - on hold by business decision until explicitly released |

---

## 3. Phases

```
 A. DEV build + UAT  ->  B. PRD deploy (parallel mode)  ->  C. Parallel run (pilot lanes)  ->  D. Cutover per lane  ->  E. Hypercare + rollout  ->  F. Decommission Instavans
    (now)                 Instavans primary                  both systems in use              switch + SM01 lock        lane by lane                   after last lane
```

### A. DEV build and UAT (now -> mid Dec)
- Finish open items in section 9 that are marked "before parallel run".
- UAT on DEV with depot, vendor, HO and finance users (scenarios in section 8).

### B. PRD deployment in parallel mode
Everything goes to PRD with the Instavans write switch **OFF**. Effect: Trip Trail runs, Instavans and ZSMART_VEH run exactly as today, the three reports still read only Instavans data.

### C. Parallel run (pilot lanes, recommended 2 weeks minimum)
- For each pilot dispatch the depot does the normal Instavans/ZSMART_VEH steps **and** the same trip in Trip Trail (indent, vehicle, deliveries, invoices, departure, receipt, POD).
- Daily: HO opens **Vehicle Invoices** (parallel check) per plant and reviews:
  - `Same vehicle` - expected result.
  - `Different vehicle` - investigate the same day (wrong entry in one system).
  - `Only in Instavans` - dispatch not entered in Trip Trail (process gap on pilot lanes).
  - `Only in Trip Trail` - not entered in ZSMART_VEH (expected only on non-Instavans lanes).
- Weekly: compare freight invoice checks (Trip Trail tolerance vs ECC shipment cost) with the current manual check.

### D. Cutover (per lane or per plant, see runbook in section 6)

### E. Hypercare and rollout
Daily defect review for 2 weeks after each cutover; then the next lane/plant.

### F. Decommission Instavans (after the last plant is cut over)
See section 6.4.

---

## 4. Deployment checklist for PRD (phase B)

### 4.1 SAP (ECC PRD via the NWP gateway)
| # | Step | Owner | Done |
|---|---|---|---|
| 1 | Release transport **EDSK9B0EM3** (tasks EDSK9B0EM4, EDSK9B0EQO) and import to quality, then production. Contents below | SAP Basis | |
| 2 | Register service `ZTMS_SRV` (model `ZTMS_MDL`) on the PRD gateway hub in `/IWFND/MAINT_SERVICE`, system alias of the PRD backend | SAP Basis | |
| 3 | Run `/IWFND/CACHE_CLEANUP` on the hub and `/IWBEP/CACHE_CLEANUP` on the backend after import (new entity sets are not visible until the model caches are cleared - seen on EDS/NGD) | SAP Basis | |
| 4 | Confirm TVARVC `ZTMS_INSTA_WRITE` does **not** exist or is blank on PRD (parallel mode) | SAP Basis | |
| 5 | Probe through the Azure gateway: `GET /api/NWP/ZTMS_SRV/VendorSet?$top=1`, `LaneSet?$top=1`, `TripInvoiceSet?$filter=Vbeln eq '<recent billing doc>'` | IT (portal) | |
| 6 | Freight FI posting stays OFF until Finance sets TVARVC `ZTMS_FREIGHT_GL` (not needed for the parallel run) | Finance | |

**Transport EDSK9B0EM3 contents**

| Type | Object | Purpose |
|---|---|---|
| CLAS | `ZCL_TMS_TY`, `ZCL_ZTMS_MPC`, `ZCL_ZTMS_DPC`, `ZCL_TMS_CORE` | OData types, model, data provider, business logic |
| DDLS | `ZI_TMS_LANERATE` (SQL view `ZITMSLANERT`) | Lane-wise, mode-wise freight rates (condition ZB00, tables A964/A973/A972) |
| TABL | `ZTMS_TRIP_VEH`, `ZTMS_TRIP_INV` | Trip Trail vehicle and invoices (shadow of ZINSTA_VEHICLE_H/I) |
| PROG | `ZTMS_CORE_TEST` | ABAP Unit tests (read-only) |
| IWMO / IWOM / IWSV / IWSG / SICF / TABU `/IWFND/I_MGDPIM` | `ZTMS_MDL`, `ZTMS_SRV` | Gateway model, service and ICF node (EDS registration; PRD hub registration is step 2) |
| CLAS (deletions) | `ZCL_ZTMS_REG`, `ZCL_ZTMS_REG2`, `ZCL_ZTMS_REG3`, `ZCL_ZTMS_MKTAB` | One-off setup helpers, deleted on EDS; travel as deletions. Basis may remove them from the request before release |

Not in the transport and not needed: any change to ZSMART_VEH, `ZINSTA_VEHICLE_H/I`, the Instavans proxies or the three reports.

### 4.2 Portal (hub) PRD
| # | Step | Owner | Done |
|---|---|---|---|
| 1 | Release the app to PRD: cherry-pick the Trip Trail commits onto `apps-new/main` (keep PRD's tile list, add only `smartruck-tms`), build `hub-next` | Portal team | |
| 2 | PRD hub backend (`/home/emamiadmin/apps/emami-apps-hub-backend`, PM2 `emami-hub-backend`): copy `tms.js`, `tmsEngine.js`, `tmsSap.js`, `tmsTrips.js`, `tmsOutward.js`, `tmsReports.js`, `tmsUlip.js`, `tmsIntegrations.js`; add the mount line `apiRouter.use('/me/smartruck-tms', require('./tms'))` in `server.js`; back up files and `.env` first | Portal team | |
| 3 | PRD `.env`: `TMS_SAP_ODATA_BASE=<gateway>/api/NWP/ZTMS_SRV`, `TMS_SAP_AUTH=gateway`, `TMS_SAP_USER_HEADER=X-Emami-User`, new random `TMS_INGEST_KEY`, `TMS_BACKGROUND=on` on exactly one process. **Do not set** `TMS_MAIL_URL` / `TMS_NOTIFY_URL` (mail on hold) | Portal team | |
| 4 | Frontend mode: the app runs live only on `dev.` hosts today. For PRD set `NEXT_PUBLIC_TMS_MODE=live` in the PRD build (or change the host rule) | Portal team | |
| 5 | Restart `emami-hub-backend`; check `GET https://audit-capa-api.emamiapps.in/api/me/smartruck-tms/me` answers 401 without a token | Portal team | |
| 6 | Admin Center: grant `smartruck-tms` to pilot users; first hub Admin opening the app becomes TMS Admin | Portal admin | |
| 7 | Backup/restore test of `emami_apps.tms_state`, `tms_audit`, `tms_files` (created on first use) | IT | |

### 4.3 Master data on PRD (before the first pilot trip)
| # | Step | Owner |
|---|---|---|
| 1 | Settings -> Sync masters (transporters from SAP account group ZTRP, customers) | HO Logistics |
| 2 | Settings -> Outward Rules -> Sync lanes from SAP (ZB00 rates; adds missing route points as locations, truck codes as vehicle types, service agents outside ZTRP as carriers) | HO Logistics |
| 3 | Fill latitude/longitude of the locations added from SAP route points (needed for tracking and geofences) | HO Logistics |
| 4 | Vehicle types: confirm max weight and add max volume (SAP-created ones have volume blank = weight-only loading check) | Logistics |
| 5 | Units, users, roles (Depot User, HO Logistics, Carrier Vendor per transporter) | TMS Admin |
| 6 | Outward Rules: offer timeout, capacity minimum (default 80%), invoice tolerance (default 2%), consent wording (Legal) | HO / Finance / Legal |
| 7 | Vendor users created and trained for pilot transporters | HO Logistics |

---

## 5. Exit criteria for the parallel run (all must be met before cutover of a lane/plant)

| # | Criterion | Measure |
|---|---|---|
| 1 | Invoice-to-vehicle data matches | Parallel check over the last 10 working days: `Different vehicle` = 0 unexplained; `Only in Instavans` = 0 on the pilot lanes |
| 2 | Figures match ZSMART_VEH | Cases, value, gross/net weight equal for a sample of 20 invoices (already proven on 2 invoices on EDS) |
| 3 | Reports | After the switch on a test lane in QA: `ZSTOCK_NEW` / `ZSTKTR_REP2` / `ZPWC_BUDGET` show the Trip Trail truck number |
| 4 | Process | Every pilot trip in the period has vehicle, deliveries, invoices, departure, receipt and POD in Trip Trail |
| 5 | Vendors | Pilot transporters accept/assign through the Vendor Portal without help for 1 week |
| 6 | Defects | No open blocker or critical defect |
| 7 | Sign-off | Logistics head, Finance, IT (section 10) |

---

## 6. Cutover runbook (per plant)

### 6.1 Day before (T-1)
| # | Step | Owner |
|---|---|---|
| 1 | Confirm exit criteria and sign-off for the plant | Logistics head |
| 2 | Inform depot, transporters and Instavans (date/time from which the plant no longer uses Instavans) | HO Logistics |
| 3 | List vehicles still open in ZSMART_VEH for the plant (`ZINSTA_VEHICLE_H`, `VEH_EXIT` blank) - these finish in Instavans | Depot / IT |
| 4 | Run Sync masters and Sync lanes in Trip Trail | HO Logistics |

### 6.2 Cutover day (T0)
| Order | Step | Owner |
|---|---|---|
| 1 | **Cut-off time:** every new indent/vehicle of the plant from this time is created in Trip Trail only | Depot |
| 2 | In-flight vehicles placed by Instavans finish in Instavans/ZSMART_VEH (no migration of open Instavans vehicles) | Depot |
| 3 | When the **last plant** using Instavans is cut over (or when IT decides the whole company switches at once): lock transaction **ZSMART_VEH** in SM01. Reason: its "Get vehicles" run marks every open vehicle of the plant that Instavans does not return as exited, and its vehicle list would show Trip Trail vehicles | SAP Basis |
| 4 | Set TVARVC **`ZTMS_INSTA_WRITE` = `X`** (type P) on PRD. From now on every Trip Trail invoice save also writes `ZINSTA_VEHICLE_H/I`. Before this switch, invoices saved in Trip Trail are only in `ZTMS_TRIP_*` | SAP Basis |
| 5 | Re-save the invoice lists of Trip Trail trips still open (trip panel -> Invoices -> Retry/save) so they reach `ZINSTA_VEHICLE_I` | Depot |
| 6 | Check: one Trip Trail invoice shows its truck number in `ZSTOCK_NEW` | IT / Logistics |

Note on steps 3-4 with plant-wise rollout: the switch is system-wide. While some plants still use Instavans, keep the switch OFF; those plants' reports keep reading Instavans data, and Trip Trail plants' truck numbers are visible in Trip Trail (Vehicle Invoices) until the final switch. If business needs the reports per plant earlier, a plant-level switch can be added (change in `ZCL_TMS_CORE=>WRITE_TRIP_VEHICLE`, small transport).

### 6.3 After cutover (T+1 onward)
- Daily parallel check now shows `Only in Trip Trail` for the cut-over plant (expected); `Different vehicle` must stay 0.
- Hypercare: daily defect review for 2 weeks.

### 6.4 Decommission (after the last plant)
| # | Step | Owner |
|---|---|---|
| 1 | Keep ZSMART_VEH locked; keep `ZINSTA_VEHICLE_H/I` (reports and history read them) | SAP Basis |
| 2 | Deactivate the SOAMANAGER logical ports of `ZCO_SAP_REQUEST`, `ZCO_SAP_INVOICEGET_VEHICLES`, `ZCO_SAP_API_AWSINVOICE`, `ZCO_MATERIAL_MASTER_SAP` | SAP Basis |
| 3 | Lock/remove `ZMM_MATERIAL_DTL_TO_SMARTRUCK` and any background job that runs it | SAP Basis |
| 4 | **Remove the hard-coded Instavans logins** from `ZMM_GET_VEHICLE_FROM_SMARTRUCK` / `ZMM_MATERIAL_DTL_TO_SMARTRUCK` and have Instavans disable those accounts | SAP / IT security |
| 5 | Instavans contract exit and data export (history the business wants to keep) | IT / Procurement |

---

## 7. Rollback

| When | Rollback |
|---|---|
| During the parallel run | Nothing to roll back: Instavans is the system of record. Stop using Trip Trail for the lane |
| After cutover, before the switch (steps 1-2 only) | Plant goes back to Instavans/ZSMART_VEH; Trip Trail data stays for reference |
| After the switch (step 4) | Unlock ZSMART_VEH (SM01), clear TVARVC `ZTMS_INSTA_WRITE`. Trip Trail rows already in `ZINSTA_VEHICLE_I` stay (truck numbers remain correct in the reports). On its next "Get vehicles" run ZSMART_VEH marks the `TT-...` vehicles as exited, which is harmless |
| App outage | Depot continues with ZSMART_VEH if it is not yet locked; otherwise record vehicle/invoices on paper and enter them in Trip Trail when back (the invoice save is idempotent) |

---

## 8. Test scenarios for UAT and the parallel run

1. Normal trip: indent -> offer -> accept -> vehicle and driver -> deliveries -> loading check -> invoices -> departure -> tracking -> receipt -> POD -> freight invoice.
2. Vendor rejects -> next vendor; offer times out -> next vendor or HO.
3. Vehicle replaced before departure.
4. Under-utilised vehicle (below 80%) with reason and approval; over 100% released by HO.
5. Shortage and damage at receipt; unloading/detention charges approved.
6. Missing POD blocks the trip close and the freight invoice.
7. Freight invoice outside tolerance goes to review.
8. Duplicate LR refused for the same vendor.
9. Invoice already on another Trip Trail vehicle is refused; cancelled billing document is refused; billing document of another plant is refused.
10. Remove an invoice from a vehicle -> SAP row flagged (LOEKZ), parallel check updates.
11. SAP unreachable while saving invoices -> trip shows "Not in SAP yet", Retry succeeds later.
12. Lane rates: indent with a vehicle type gets offered to the transporter with that vehicle's rate first.

---

## 9. Open items and decisions

| # | Item | Needed before | Owner |
|---|---|---|---|
| 1 | Push of the vehicle-invoice feature to DEV (`origin/main`) | Parallel run | IT (approval given in chat pending) |
| 2 | NGD/NWP gateway cache refresh for TripInvoiceSet / TripVehicleSet / ParallelCheckSet | Parallel run | SAP Basis |
| 3 | E-mail (vendor intimation, delay alerts, invoice mail) - **on hold** until business releases it | Business decision | Logistics head |
| 4 | ULIP approval (live vehicle documents and tracking); until then mock + manual checkpoints | Go-live (tracking) | IT / Compliance |
| 5 | Pilot plants, lanes and transporters | Phase B | Logistics head |
| 6 | Capacity rule above 100%: plan says block, app lets HO release with reason - confirm | UAT | Logistics head |
| 7 | Invoice tolerance (default 2%) | UAT | Finance |
| 8 | Driver consent wording and data retention | Phase B | Legal |
| 9 | Freight GL for FI posting (`ZTMS_FREIGHT_GL`), or confirm posting stays in ECC (shipment cost + MIRO) | Release 2 | Finance |
| 10 | E-invoice / e-way bill tables are empty on EDS - verify IRN/e-way display on QA/PRD data | UAT | SAP SD |
| 11 | Hardening: virus scan on uploads, schema checks on SAP responses, audit before/after, nightly master/lane sync | Before go-live | IT |
| 12 | Storage: app state is one JSON document (fine for pilot); move to tables before company-wide rollout | Rollout | IT |
| 13 | Plant-level Instavans write switch (only if reports are needed per plant during a staggered cutover) | Cutover | Business / IT |

---

## 10. Sign-off

| Role | Name | Parallel run start | Cutover go | Date |
|---|---|---|---|---|
| Logistics head | | | | |
| Finance | | | | |
| SAP functional (SD/LE) | | | | |
| SAP Basis | | | | |
| IT / Portal | | | | |
