# Distribution Planning (Trip Trail) - contract

Port of Sanjoy Paul's "Distribution Planning" tool (Raam Baan L1/L2 + Pinaka) so it runs on LIVE SAP data instead of the
CCD/HCD console workbooks. His engine (`dp_engine.js`, pure JS, `plan(D, opt)`) is reused unchanged; only the data feed is new.
DEV only. No e-mail (see memory trip-trail-no-mail). Parallel run: his tool keeps running; Trip Trail has a diff screen.

## Dataset `D` (the contract between SAP feed, backend, engine and UI)
Arrays of arrays, indices into `mats` (mi) and `sites` (si). Pieces everywhere (base UoM).

| key   | row |
|-------|-----|
| meta  | `{today, source:'sap', builtAt, sapAsOf:{stock,lots,...}, trendFrom, trendDays, forecast:{uploadedAt,by,rows}, warnings:[...]}` |
| mats  | `{code, desc, div:'CCD'|'HCD', key, cp(case pack pcs), cw(case weight kg), brand, rate, ukey?}` |
| sites | `{code, name, zone, type:'Unit'|'3P'|'MWH'|'Depot'|'Old', mwh(code), lat?, lon?}` |
| stk   | `[mi, si, unrestricted, git, qualityInsp]` |
| lots  | `[mi, si, qty, lifeLeft(0..1, -1 = no SLED), mfgDate]` |
| git   | `[mi, si, qty]` (receiving plant) |
| ship  | `[mi, fromSi, toSi, qty, postingDate, leadTime, shipmentNo, transporter, vehicleNo]` |
| sto   | `[mi, supplyingSi, receivingSi, openQty]` |
| fc    | `[mi, si, channel 'GT'|'MT'|'Ecom', M0, M1]`  (UPLOADED - not in SAP) |
| afc   | `[mi, si, channel, qty]`                          (UPLOADED) |
| rpp   | `[mi, si, wk1, wk2, wk3, wk4, addi]`              (UPLOADED, optional) |
| prod  | `[mi, si, qty]`                                   (SAP if cheap, else empty) |
| sale  | `[mi, si, channel, mtdPcs]`                       (SAP, month to date) |
| trend | `[mi, si, channel, pcsLast14Days]`                (SAP, invoice date, excl. today) |
| oo    | `[mi, si, 'MT'|'Ecom', openPcs]`                  (SAP, open orders, rejection reason empty, ordered > invoiced) |
| split | `[div, channel, key, depotCode, mwhCode, mwhShare, depotShare, unitCode]` (CONFIG, seeded from his dp_data.json) |
| lanes | `[fromCode, toCode, transitDays]`                 (CONFIG, seeded) |
| fold  | `{code: planAsCode}`                              (CONFIG, seeded) |

Channel from SAP distribution channel (VTWEG): 10,20,25,35,40,45,58,70,95 -> GT; 30 -> MT; 55,57,96 -> Ecom (his CHAN_CODE).
Plant codes are folded through `fold` (Zandu/Amazon/old codes -> city depot) BEFORE indexing. `site_code('UN13 EMAMI LTD')` = first word.
Reference implementation of every column = `dp_extract.py` (copy in session scratchpad dpsrc/, and sample data dpsrc/data/dp_data.json).

## SAP: new read-only entity sets in ZTMS_SRV (EDS; NGD gateway exposure is a Basis step)
All require a filter (Werks list / date) or $top, like FreightCondSet. Names are fixed; fields below are the contract.

| set | key | fields | filters |
|-----|-----|--------|---------|
| DpMaterialSet | Matnr | Matnr, Maktx, Spart, Meins, Brgew, Gewei, CasePack (pcs per case, MARM), Brand, Mtart | Spart, Matnr, $top |
| DpStockSet | Matnr+Werks | Matnr, Werks, Unr (LABST), Git (in transit/transfer: TRAME+UMLMC), Qi (INSME) | Werks (list), Matnr |
| DpLotSet | Matnr+Werks+Charg | Matnr, Werks, Charg, Hsdat, Vfdat, Unr, LifeLeft (0..1: remaining shelf life / total) | Werks (list), Matnr |
| DpStoSet | Matnr+Reswk+Werks | Matnr, Reswk (supplying plant), Werks (receiving), OpenQty (ordered - issued, STO/UB docs) | Werks, Reswk |
| DpOpenOrderSet | Matnr+Werks+Vtweg+Kdgrp | Matnr, Werks, Vtweg, Kdgrp (customer group - his OO_ECOM test), OpenQty (order qty - invoiced, no rejection reason, base UoM) | Werks, Vtweg |
| DpSaleSet | Datum+Matnr+Werks+Vtweg | Datum, Matnr, Werks, Vtweg, Qty (base UoM, invoiced) | DateFrom (required), DateTo, Werks, Vtweg |
| DpTransitSet | Vbeln+Matnr | Vbeln, Tknum, Matnr, Swerks, Werks, Qty, Budat (PGI date), Transporter (name), Vehicle | Werks, Swerks |

Pieces vs cases: SAP returns base UoM; engine wants pieces; `mats.cp` converts. Dozens in his console (x12) are NOT used.

## Backend (`backend/tmsPlanning.js`, mounted under `/api/me/smartruck-tms/planning`)
Own Postgres tables (NOT `tms_state`): `tms_dp_config` (key, json), `tms_dp_forecast` (uploaded rows), `tms_dp_snapshot` (id, built_at, by, dataset gz json, stats).
| route | what |
|-------|------|
| GET `/planning/status` | latest snapshot meta, forecast meta, per-source health/row counts, warnings |
| POST `/planning/refresh` | pulls the SAP sets, merges config + forecast, stores snapshot (role `planner`/admin) |
| GET `/planning/dataset` | latest snapshot as `D` (gzip) |
| POST `/planning/forecast` | JSON rows from the browser's parsed sheet: `{rows:[{material,plant,channel,m0,m1,additional}], rpp?:[...]}`, replaces the forecast |
| GET/POST `/planning/config` | sites, lanes, split, fold, material keys (admin) |
| POST `/planning/seed` | import his `dp_data.json` as config (sites/lanes/split/fold/mat keys) |
Nightly refresh timer (DEV box PM2, `TMS_DP_NIGHTLY=HH:MM`, off by default).

## UI (`/distribution-planning/`)
Engine in the browser (same as his page). Tabs: Summary, Plan lines, Trucks, Raam Baan sheets, Settings, Forecast upload, Diff (our plan vs his).
Diff screen: user drops his `dp_data.json`; we plan BOTH datasets with the same engine and show input diff (stock/oo/sale/git per key) and output diff
(lines, trucks, tonnes by leg / depot), plus "create indent" from a planned truck.
