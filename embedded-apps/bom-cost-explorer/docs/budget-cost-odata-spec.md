# Budget costing: OData contract for SAP (`ZMM_BOM_COST_SRV`)

Rebuild of the GUI report `ZMM_FG_BOMEXPLR_COST` (initiate and approve modes) as additional entity sets of the existing service, used by the
Costing Cockpit screens `/budget-cost/` and `/budget-cost/approvals/`. **Every property name here is a contract, not yet live.** When the sets exist:
`npm run check:budget-metadata`, then fix names only in `src/lib/budget/fields.ts`, then set `DEPLOYED_BUDGET_ENABLED = 'true'` in `next.config.mjs`.

## 0. Cost basis and FG selection (confirmed by the business)

1. **Product cost is priced from the CPD rate tables:** `zcomponent` (India) or `zcomponent_n` (Sri Lanka, Dubai, Bangladesh; filtered by `land1`), for the budget year `BudgetYr`. Selected with `Country`.
2. **Info-record rates are information only.** `LastRate`, `RmlastRate`, `PmlastRate`, `PerfumelastRate`, `L<origin>` (summary) and `LRate` (saved lines) are the latest info-record rate (a017 / a018 + konp, purchasing org CPD). They are shown and saved for reference, never used in the budget, projected or actual cost. The screens label them "info only".
3. **`FgSource = 'P'`, "As per latest process order":** the last process order created in the date range, per plant + CRS SKU + business line + scheme indicator + material type.
4. **`FgSource = 'G'`, "As per latest FG":** the same latest-wins rule at FG code level: the latest finished good code created in the date range.
5. `FgSource = 'N'` (NPD, no production history) is the report's third option; its label is not in the files received, so it is named by what the code does. Please confirm the wording.

## 1. Principles

1. **SAP does all the maths.** The browser never computes or sends a cost. Computed in the browser and labelled so: "Act vs budget %" and "Last vs budget %" (two SAP figures divided), KPI averages.
2. **Reads are stateless.** Selection in `$filter`, one plant per request (a plant run has to fit the Azure gateway's 230 s).
3. **Initiate saves what SAP computed, by reference.** Each `BudgetSumSet` response carries a `RunId`; `BudgetInitSet` POST sends the RunIds, never an amount. SAP keeps the run for a limited time (suggest 4 h) in a buffer table, e.g. `ZMM_BUDRUN` (RUNID, ERDAT/ERZET, WERKS, cluster of `lt_summ` + `lt_split`), cleaned by a job.
4. **Identity.** The OData user is a service user, so `sy-uname` is useless. The hub's e-mail is sent as `AppUser`; SAP maps it to the initiator / approver (add an `EMAIL` field to `zmm_cost_aprove`). **Limit:** the app is a static export, so `AppUser` is a browser-supplied string. SAP must treat it as a claim, not proof. If the approval is a real financial control, put a token check in front (the hub backend can sign the e-mail) before go-live.

## 2. Entity sets

Property lists are in `src/lib/budget/fields.ts` (single source). Types: Edm.String unless noted; decimals Edm.Decimal; flags CHAR1 `'X'`/`''`; dates Edm.DateTime.

| Set | Method | Rows | Source in the report |
|---|---|---|---|
| `BudgetSumSet` | GET | one per FG × plant (+ direct-purchase lines) | `lt_summ` (`st_summ`) |
| `BudgetSplitSet` | GET | BOM rows of ONE FG + plant (`Matnr` + `Werks` in the filter) | `lt_split` (`st_split`) |
| `BudgetChkSet` | GET | FG level BOM / production version flags | `lt_fg_bom`, report mode `rad7` |
| `BudgetPendSet` | GET | `zmm_fbudcost_sum` rows, status `I`, for the approver | approver mode |
| `BudgetPendDetSet` | GET | `zmm_fbudcost_det` rows of a version | approver "SPLIT" |
| `BudgetInitSet` | POST | result of one initiate | `usercommand` `SAVE` (initiator) |
| `BudgetApproveSet` | POST | result of one approval | `costapprove` `SAVE` |

Key of every read set: `Rowid` (Edm.Int32, as the Wac sets).

### 2.1 Selection filter (SUMMARY, SPLIT, CHECK)

| Property | Report field | Notes |
|---|---|---|
| `Werks` | `s_werks` | **required, exactly one** |
| `Matnr` | `s_matnr` | optional; `or` group for several |
| `Mtart` | `s_mtart` | **required** (the report refuses without it) |
| `BudatFrom` / `BudatTo` | `s_budat` | `BudatFrom` **required**; Edm.DateTime |
| `Plan1` | `s_plan1` | optional, plan names |
| `Scheme` | `s_schm` | optional |
| `BudgetYr` | `p_byear` | **required** (`zcomponent-gjahr` = this year) |
| `RateYr` | `r_year` | **required** (activity rate year; `zbomactrate(p_start_date = 31.12.<RateYr>)`) |
| `Uom` | `p_uom` | plan UoM filter on `zprodplanentry` |
| `FgSource` | `rad1` / `rad2` / `r_npd` | `P` AUFM, `G` MSEG 101, `N` MARA+MARC |
| `Business` | `ccd`/`hcd`/`imd`/`csd` | `01` `02` `03` `04`; absent when `ExclDiv` |
| `ExclDiv` | `exdv` | `X` = no business-line filter |
| `Country` | `ind`/`sl`/`dub`/`ban` | `IN` → `zcomponent`; `LK`/`AE`/`BD` → `zcomponent_n` with `land1` |
| `ExclManuf` | `check1` | after the roll-up, drop `xtlty = 'M'` lines **from the split only** (`ZMM_BUD_REMOVE_WIP_FRT2_ONLY` TVARVC still decides WIP/FRT2 only) |
| `Overrides` | `check2` popup | `'MATNR|VALUE|PCT;…'`, ≤ 20; `p_total = VALUE` or `total × (1 + PCT/100)` |
| `OnlyOverrides` | `check3` | keep only FGs that contain an overridden component |
| `OneSkuPerCrs` | `check4` | the `DELETE ADJACENT DUPLICATES … zskugrcodecrs zscheme mtart_fg werks zbusiness` step |
| `InclDirect` | `check5` | direct-purchase products; only valid with `FgSource = 'G'` |
| `BomQtyX10` | `check7` | `emeng = bmeng × 10` |
| `Checklist` | `rad6` | also fill `MulBom` / `MulUnlock` / `MulProd` / `AllBomIn` / `AllPverIn` |
| `AppUser` | — | hub e-mail |

`check6` is declared but never read by the report; it is not exposed.

### 2.2 `BudgetSumSet` extras
* `RunId` (CHAR 32): identifies this plant's run. Same on every row of the response.
* `Msg`: row note (shown as a warning).
* Messages: put report `MESSAGE … 'S'`/`'I'` texts (for example "No data to display") in the `sap-message` header. Required-field errors → HTTP 400 with the report's own text.
* `Year` = the current fiscal year at run time (`GET_CURRENT_YEAR`, company code 1000, today's date), as on the report's screen. The year a version is **saved** under (`Gjahr`, `Monat`) is the fiscal year of `BudatTo`, as in the report's SAVE step.

### 2.3 `BudgetInitSet` (POST)
Body: `{ AppUser, RunIds: "id1,id2", Remarks, ExclDiv: "X" }`. SAP: refuses unless `ExclDiv = 'X'` ("Initiate without exclude division not possible"), maps `AppUser` to the initiator (`zmm_cost_aprove`), loads the runs, writes one new version to `zmm_fbudcost_sum` + `zmm_fbudcost_det`, `COMMIT WORK AND WAIT`. Returns `{ Gjahr, Monat, Version, Status 'S'|'E'|'W', SavedSum, SavedDet, MsgTxt }`. Unknown / expired RunId → HTTP 400 "The run is no longer available in SAP. Run the budget again."

### 2.4 `BudgetPendSet` / `BudgetPendDetSet` (GET) and `BudgetApproveSet` (POST)
Pending = `approved_by = <mapped AppUser>` and `status = 'I'`. Filter may carry `Gjahr` and `Version`. Approve body `{ AppUser, Gjahr, Version, Remarks1 }`: sets `status = 'A'`, `approved_on`, `remarks1` for that version of that approver; answers `{ Gjahr, Version, Status, Approved, MsgTxt }`. (The report approves everything pending in one go; the screen approves per version and offers "Approve all", which calls this once per version.)

## 3. Things found in the report that need a decision before the rebuild

1. **Version number can collide.** The report takes `MAX(version)` of the year over `status = 'A'` only. Two initiations before the first approval get the **same** version, and `MODIFY` then overwrites rows with equal keys. The contract (and the mock) uses the maximum over **all** statuses, taken under an ENQUEUE on the year. Please confirm this is wanted.
2. **"Latest" is decided in two steps in the code, and they do not match the description above.** (a) `rad1` (AUFM) and `rad2` (MSEG 101) each keep, per material + plant, the row with the latest posting date. (b) Then `check4` ("one FG per CRS SKU"), which is on by default, sorts by CRS SKU / scheme / type / plant and **material number descending** and keeps the **highest material number** per plant + CRS SKU + scheme + material type + business line. That is the highest FG code, not the latest process order date. Both agree only when newer FG codes always carry higher numbers. Decide which rule SAP implements for `P` and `G`; the contract currently says what the business described, and the screen text follows it.
2b. **Direct-purchase products** (`check5`, goods receipt only) are costed from the info-record condition (`kbetr` of ZRM / ZPU / ZPM / ZAC / ZSC), because they have no BOM and no zcomponent rate in the report. This is the one place where an info-record rate is the cost. Confirm that is intended.
3. **Split-level checklist** (`usercommand`, `SPLIT`): `werks = <fs_split1>-werks` uses a field symbol left over from the main run, not the current row (`<lfs_split_final>-werks`). With several plants the "multiple BoM" test compares against the wrong plant. (An earlier version of this note also claimed that the checklist counters leak between rows; that was wrong, they are cleared after each row.)
4. **`ExclManuf` (check1) only changes the split**: it runs after the roll-up, so the summary totals are unchanged.
5. **`sy-uname` everywhere** (initiator, approver, `approved_by`): see §1.4.
6. **Popups** (`POPUP_GET_VALUES` remarks, `REUSE_ALV_POPUP_TO_SELECT` overrides) become the `Remarks` and `Overrides` properties.
7. Report messages of type `E` (`LEAVE TO SCREEN 0`) must become `/iwbep/cx_mgw_busi_exception` with the same text, so the screen shows SAP's wording.

## 4. ABAP refactor outline (skeleton, not compiled)

Move `START-OF-SELECTION` (rad3 branch) into a class so the GUI report and OData share one implementation, with the report's globals as attributes of the class:

```abap
CLASS zcl_mm_budget_cost DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_sel,                       " one plant per call
             werks TYPE werks_d, matnr TYPE RANGE OF matnr, mtart TYPE RANGE OF mtart,
             budat TYPE RANGE OF budat, plan1 TYPE RANGE OF zdesc, schm TYPE RANGE OF zscheme,
             byear TYPE gjahr, ryear TYPE gjahr, uom TYPE zuom,
             source TYPE c LENGTH 1, business TYPE zbusiness, excl_div TYPE abap_bool, country TYPE land1,
             excl_manuf TYPE abap_bool, only_overrides TYPE abap_bool, one_sku TYPE abap_bool,
             incl_direct TYPE abap_bool, qty_x10 TYPE abap_bool, checklist TYPE abap_bool,
             overrides TYPE STANDARD TABLE OF zmm_s_budget_override WITH EMPTY KEY,
           END OF ty_sel.
    METHODS run IMPORTING is_sel TYPE ty_sel
                EXPORTING et_summ TYPE ty_t_summ et_split TYPE ty_t_split
                RAISING   zcx_mm_budget.           " message text = the report's text
    METHODS check IMPORTING is_sel TYPE ty_sel RETURNING VALUE(rt_fg) TYPE ty_t_fg_bom.
    METHODS save  IMPORTING it_runid TYPE string_table iv_user TYPE syuname iv_remarks TYPE zmm_fbudcost_sum-remarks
                  RETURNING VALUE(rs_result) TYPE zmm_s_budget_init_result RAISING zcx_mm_budget.
    METHODS approve IMPORTING iv_user TYPE syuname iv_gjahr TYPE gjahr iv_version TYPE zcostversion iv_remarks TYPE zmm_fbudcost_sum-remarks1
                    RETURNING VALUE(rs_result) TYPE zmm_s_budget_approve_result RAISING zcx_mm_budget.
ENDCLASS.
```

`BUDGETSUMSET_GET_ENTITYSET` (DPC_EXT): read the filter with `io_tech_request_context->get_filter( )->get_filter_select_options( )`, build `ty_sel`, call `run`, store `lt_summ` / `lt_split` in `ZMM_BUDRUN` under a new GUID, fill `RunId`, return `et_summ`. `BUDGETSPLITSET_GET_ENTITYSET`: same selection with the one `Matnr`, return `et_split` (and recompute in the same request: one FG is cheap). `BUDGETINITSET_CREATE_ENTITY`: `save( )`. In the report, `PERFORM display_summary_data` etc. stay, now calling `run( )`.

## 4b. Backend objects
The full SAP side (DDIC, SEGW, classes, code, port map of the report, parity test) is in `sap-backend/README-backend.md`.

## 5. Not covered here
* The FG summary / split level **checklist** is reproduced as flags (`Checklist` on the summary and split, and the separate `BudgetChkSet`), not as the report's separate ALV.
* Freight (`zi_delvcost`, `consolidate_delv`, `filter_latest` in the attached conversation) is a separate class and is not part of this contract.
