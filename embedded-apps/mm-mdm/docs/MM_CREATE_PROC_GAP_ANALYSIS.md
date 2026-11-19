# /INOWITS/MM_CREATE_PROC: Change (MX) and Extension (ME) analysis and gap list for mm-mdm

Source: Web Dynpro component `/INOWITS/MM_CREATE_PROC` (ADT download: `compctrl.abap` plus `view_*.abap`).
Citation format is `file:method` (`compctrl` = component controller). "Not determinable" means the code needed is not in the download.

Not in the download, so not analysable: class `/INOWITS/CL_WF` (start / complete / sendback / reject / forward_agent / get_final), the CRUD classes `/INOWITS/MM_CL_*_CRUD`, the FMs `/INOWITS/MM_MAT_GET`, `/INOWITS/MDM_FM_GET_RULE_PLANT`, `/INOWITS/P_ALERT`, `/INOWITS/M_TRANSID_GENERATE`, the attachment, comment and mm_ui_comp (config adapter) components, and the mail template texts. Level-to-level routing, mail recipients and the field-level screen config are therefore only known from their call sites.

App ids seen: `MC` create, `MX` change, `ME` extension, `MMX` mass change (compctrl:submit_mass_cng / approve_mass_cng), `M` change-log lookup (V_SEARCH:onactionchange_log). `MME` appears in V_SEARCH as a status probe for mass extension.

---

## 1. Change process (MX), end to end

### 1.1 Entry, picking the material and the scope

1. **Gate**: V_SEARCH:wddoinit runs `AUTHORITY-CHECK OBJECT 'ZMDM_MAT' ACTVT 01` only. No MTART / MATKL / business check, and no ACTVT 02, for change (see section 5).
2. **Pick**: the user searches the posted-materials list in V_SEARCH and clicks Change (V_SEARCH:onactionchange_mat). The selected row must be a created material (status LED not red: "The selected Material is not yet Created") and must not already be in a change request ("Selected Material is already in change process"). The check reads `/INOWITS/M_TRANS` where `obj_value LIKE '%matnr'` and `app_id = 'MX'`.
3. **Confirm**: popup "Selected material will be Changed. Do you want to continue?" (V_SEARCH:onactionyes_chg). It fills the MX header with MATNR and MAKTX (from MAKT) and the scope dropdowns, read from the live material: plants from MARC, storage locations from MARD, sales orgs and distribution channels from MVKE. It then sets `gv_change = 'X'`.
4. **Scope popup** (V_MX_POPUP). The initiator can pick one plant, storage location, sales org and distribution channel. Validations (V_MX_POPUP:validation):
   - Plant and storage location pair must exist in MARD: "plant & storage location is not maintained for this selection".
   - Sales org and distribution channel pair must exist in MVKE: "Distribution channel & sales org. is not maintained for this selection".
   - Plant and sales org pair must exist in TVKWZ: "plant & sales org. is not maintained for this selection".
   - Descriptions come from T001W, T001L, TVKOT, TVTWT.
5. **Continue** (V_MX_POPUP:onactioncontinue) does the following:
   - It loads MTART from MARA and MTBEZ from T134T, MBRSH from MARA and MBBEZ from T137T.
   - It calls `compctrl:read_chng(matnr)` to load the **current SAP data** of the material into the view context.
   - It sets `gv_change = 'X'`.
   - It calls `compctrl:get_wf_parmters`, then `compctrl:views_visibility(app 'MX', level 'L0', gen_type, gen_field, gen_field2)`.
   - It navigates to the change initiator screen.

   If no view is configured for L0, `lv_msg` is non-empty and navigation stops. Copy-from-reference uses the same loader (V_MX_POPUP:onactioncontinue_copy → `compctrl:copy` → `read_chng`, then the number is cleared).

**read_chng sources** (compctrl:read_chng):
- MARA, MARC (matnr+werks), MARD (matnr+werks+lgort), MBEW, MVKE (matnr+vkorg+vtweg), MAKT, MARM, MEAN, MAEX, MAPE, QMAT.
- MLAN, WRPL, MKAL, MLGN, MLGT.
- India: J_1IMTCHID, J_1IASSVAL, J_1IMODDET.
- Classification: KSSK and CLAF_CLASSIFICATION_OF_OBJECTS.
- Long texts: 6x READ_TEXT.
- Forecast: PROP via MAPR.
- Units of measure: VBWS_UOM_READ_WITH_MATNR.
- Consumption values.

### 1.2 The change screen and how views to change are chosen

- The change initiator screen is **V_INITIATOR_CHNG**. It is a thin shell that hosts the shared material-view UI component (`wd_cpifc_mm_ui_comp->set_config(gv_transid)`). The same shell is used for the initiator, a re-edit after send back, and (via V_REVIEWER_CHNG / V_APPROVER_CHNG) the reviewer and approver. The screens differ only by `gv_type_lvl` (I, R, A) and the button set.
- The initiator edits **any field of the loaded material in the view tabs**. There is no per-field selection step.
- **Save (submit)** is V_INITIATOR_CHNG:onactionsave. Checks run in this order:
  1. Period indicator rule (added 18 Feb 2021): if MARA_PLNT1 is editable and `IPRKZ <> '2'`, error "Period Indicator allow only Month and rectify SLED accordingly".
  2. `compctrl:field_validation`.
  3. `compctrl:validate`.
  4. `compctrl:val_change_bapi` (dry run, see 1.4).
- **View selection popup** (W_CHANGED_VIEW, view V_CHANGED_VIEWS; the view controller is empty, it is only a layout). The list is `SELECT * FROM /INOWITS/MDM_V_N WHERE app_id = 'MX'` (columns VIEW_NAME, V_DES). The user ticks the views that must be changed. If none is ticked: "No view selected, please select atleast one view" (V_INITIATOR_CHNG:onactionselected). Confirm text: "Note : Only selected views will be updated in SAP. Do you want to Submit the Request...". V_ATTRIBUTE is also an empty controller.
- SELECT_VIEWS (view, with `init_buf`) is not MX-specific. It is the select-all / deselect-all checklist. Its `onactionextend_cr2` is a hidden direct BAPI extension (loading group + sales org, no workflow, no error check) that looks like a leftover. Do not port it.

### 1.3 How old and new values are stored

There is **no old-value table and no field-level diff** anywhere in the component (grep for old / diff / CDHDR / CDPOS found nothing). Consequences:
- The request stores only a **full snapshot of the new values** in the same staging tables as creation, keyed by `TRANSID` (plus `MATNR`, and for plant-level tables `WERKS`).
- Old values are whatever SAP holds at the time the screen is read.

Staging tables written by `compctrl:submit_chng` (through the CRUD classes, all keyed by TRANSID):

| Staging table | Content |
| --- | --- |
| `/INOWITS/MM_MARA`, `MM_MARC`, `MM_MARD`, `MM_MBEW`, `MM_MVKE` | Client, plant, storage location, valuation and sales org data |
| `MM_MLAN`, `MM_STAX` | Tax classification (country plus up to 9 tax types in TAXM1..9, ordered by table index) |
| `MM_MAKT`, `MM_MARM`, `MM_MEAN`, `MM_MKAL`, `MM_MLGN`, `MM_MLGT`, `MM_WRPL`, `MM_QMAT`, `MM_MAPE`, `MM_MAEX` | Descriptions, units, EAN, production versions, warehouse, forecast plant, inspection setup, export / import data, excise |
| `MM_PROP`, `MM_PROW`, `MM_CONS`, `MM_MVER`, `MM_PRO` | Forecast values, consumption (`MM_MVER` row per period set, built per period indicator M / W / T / P), proportion units |
| `MM_TEXT` (FID GRUN, PRUE, IVER, BEST, 0001, LTXT) | Long texts |
| `MM_RMCL` | Classification values (SR_NO, class, ATNAM, ATWRT) |
| `MM_WS_V`, `MM_EXSE`, `MM_DRAW` | Work-schedule product versions, excise, DMS links |
| `ZMLDDSGN_MDM`, `ZSECOND_PROD`, `ZSECOND_MAT_MAP` | Design codes, second product mapping |

Request header and index tables:

| Table | Content |
| --- | --- |
| `/INOWITS/M_TRANS` | TRANSID, app id, status 00..05, user id, start date, TOP_WI_ID, OBJ_VALUE |
| `/INOWITS/CM_META` | One row **per material** (delete then insert on matnr, V_INITIATOR_CHNG:onactionyes_save). It carries status, MEINS, MATKL, TRANSID and phonetic keys. Status history of the material is overwritten by the next request. |
| `/INOWITS/M_SELV` | The selected views: key TRANSID + VIEW_NAME (+V_DES). Written by submit_chng with MODIFY. |

`M_TRANS-OBJ_VALUE` is rewritten to `'SC' + transid + matnr` at submission for the MDM dashboard (V_INITIATOR_CHNG:onactionyes_save) and to the plain matnr at posting.

Key facts for the rebuild:
- The snapshot covers **all fields of all views**, not only the selected ones. The selection is applied later by gating (below).
- Whether blank-on-purpose fields can be cleared is a posting-side matter (see 1.7).

### 1.4 Validations

- `compctrl:field_validation` (about 5,700 lines, rule engine): mandatory fields, ranges, value dependencies per view and per material type. It is called for MC, MX and ME.
- `compctrl:validate`:
  - config-adapter validation (`/INOWITS/...config_adapter->validation(ls_visibility, nodeinfo)`);
  - only one standard class: "Only one class can be selected as standard class";
  - mandatory attachment doc types (`check_mandatory`, app id hard-coded `'MC'`): "Document Type X is mandatory for attachment";
  - ROH / VERP / PKGN: Special procurement 30 and source-list tick must go together ("Special Procurement 30 Is missing", "Source list Tick Is missing");
  - PKGN: "No views are maintained for this brand." (reads `WF_LVL` with `gen_field4 = brand`);
  - IMD data for FERT / FRT2 with `ZBUSINESS = '03'`: product, brand, category, segment, season, scheme, range are mandatory;
  - classification checks (`compctrl:classification`).
- `compctrl:val_change_bapi` is the pre-check for change. It builds the full BAPI structures from the screen, calls `BAPI_MATERIAL_SAVEDATA` with `returnmessages`, reports each `type = 'E'` message, then `ROLLBACK WORK`. It does not use TESTRUN, it relies on the rollback. Message 189 is rewritten to "The base unit of measure cannot be changed".
- Workflow dry run: `/INOWITS/CL_WF=>start(... iv_simulate = 'X')` before the real start. Any `msg_type = 'E'` is shown and the submit stops (submit_chng).
- Reviewer / approver actions (V_REVIEWER_CHNG, V_APPROVER_CHNG): reject requires a comment ("Please enter reason to reject in comments box", compctrl:comment_mandt). Every action first runs `validate_frwd` (blocks if a forward request is open).

### 1.5 Workflow routing

Tables used for routing (call sites: compctrl:get_wf_parmters, compctrl:views_visibility):

| Table | Role |
| --- | --- |
| `/INOWITS/WF_CONS` | Per MTART: `RQ_MATKL`, `RQ_BUSINESS`. Decides whether material group and business vertical are part of the workflow key. |
| `/INOWITS/WF_DEF` | Per app id, gen_type, gen_field, gen_field2, level, `TYPE_LVL` (I / R / A): `TYPE = '02'` means rows are filtered to the logged-in agent |
| `/INOWITS/WF_LVL` | Level to view assignment: `VIEW_NAME`, `ACTIVE`, `AGENT` |
| `/INOWITS/WF_ROLE` | Level to agent (`AGENT = sy-uname`) |
| `/INOWITS/M_VIEW` | Per MTART: which views exist |
| `/INOWITS/MDM_V_N` | View catalog per app id |

Routing rules:
- **Key** = `(app_id 'MX', gen_type = MTART of the existing material, gen_field = MATKL if RQ_MATKL, gen_field2 = ZBUSINESS if RQ_BUSINESS)`. The key is read from the posted material (`get_wf_parmters` re-selects MTART, MATKL, ZBUSINESS from MARA). The plant is **not** part of the MX key.
- **View visibility per level** (`views_visibility`): the level's `WF_LVL` rows are intersected with `M_SELV` for the transid. A level only sees (and can edit) views the initiator selected. View flag `02` = editable (if the view is in `M_VIEW` for the MTART), `01` = display only. Level `L0` is the initiator and needs no `WF_ROLE` row.
- **Start / advance** are done by `/INOWITS/CL_WF`: `start` creates the workitem for level 1, `complete` moves to the next level, `sendback` goes to the previous level (or the initiator), `reject` ends it. The out parameters `ev_is_next_lvl`, `et_mail_id`, `ev_initiator_mail_id`, `ev_is_final` drive the screens and mails. The number of levels is **not determinable** from this component.
- **Resubmit after send back** goes through `complete(iv_workitem_id = gv_wid)` instead of `start` (submit_chng, `IF gv_wid IS INITIAL`).
- **Forward** (any level): V_FORWARD, `/INOWITS/FRD_STS` (status C when the forwarded person returns it), `compctrl:update_frwd`, `forward_save`, `CL_WF=>forward_agent`. A forwarded request blocks the original agent's actions through `validate_frwd`.

### 1.6 Approver screens (V_APPROVER_CHNG / V_REVIEWER_CHNG)

- Both are the same shell as the initiator. The shared UI is configured with `gv_transid` (and `gv_level_new` for reviewers), so the reviewer sees the **staged snapshot**, not live SAP data.
- Reviewer (V_REVIEWER_CHNG): Save calls `compctrl:update` (staging update). Yes-save sets `CM_META.status = 'CR'`. Reject sets `'CRR'`. Send back sets `'CRSB'`.
- Approver (V_APPROVER_CHNG): Save calls `compctrl:stnd_update_chng` (posting). Reject sets `'CAR'`. Send back sets `'CASB'`. Posted sets `'CHA'`.
- Confirmation screens (V_CONFIRMATION) take TITLE, H1, H2 and TRANSID context fields.
- Status codes seen for MX in `CM_META`: `CI` (submitted), `CR` (reviewed), `CRR` (rejected by reviewer), `CRSB` (sent back), `CAR` (rejected by approver), `CASB` (sent back by approver), `CHA` (changed in SAP). Create uses `SD`, `RSB`, `ASB`, `IR`. Extension uses `EI`, `ER`, `EA`. The `M_TRANS` status codes are the separate 00..05 set from the README.

### 1.7 How the change is posted to the material master

`compctrl:stnd_update_chng`, called by V_APPROVER_CHNG:onactionyes_save, in this order:

1. Take the lock `ENQUEUE_/INOWITS/MDM_MM` (key is TRANSID, `sy-subrc` not checked).
2. Rewrite the approver's edits into staging through the CRUD classes (same as submit_chng).
3. `CL_WF=>get_final(gv_wid)`. If not final: only `CL_WF=>complete`, then mails `P_MDM_MX_APP` (next level) and `P_MDM_MX_APP_L0` (initiator). If final, posting follows.
4. **Final**:
   - Build `HEADDATA` view flags from the **approver's own** view-visibility flags (`ls_views_visibility-... EQ 02`: basic, sales, mrp, storage, account, warehouse, cost, purchase, forecast, quality).
   - Build the BAPI structures only for views flagged 02 at that level. `…X` change flags are set **only where the new value is non-initial** (`IF wa_bapimarc-abc_id IS NOT INITIAL. ...x = 'X'`).
   - Call `BAPI_MATERIAL_SAVEDATA` (client, plant, forecast parameters, storage location, valuation, warehouse number, sales, storage type, descriptions, units, EAN, tax classification).
   - `BAPI_TRANSACTION_COMMIT wait = 'X'`.
5. If `ls_return-type <> 'E'`, run follow-ups:
   - Direct table `UPDATE` of customer fields (`MARA-ZZMTYPE_CODE`, `ZBUSINESS`, `ZSKUSIZE`, `MARC-KORDB`, `MBEW-HRKFT`, `MLAN-TAXIM`), plus `ZSECOND_PROD` and `ZSECOND_MAT_MAP`.
   - Product versions via `CM_FV_PROD_VERS_DB_UPDATE`.
   - India: `J_1IMTCHID_POST`, `J_1IASSVAL_POST`, `J_1IMODDET_POST`.
   - Long texts via `CREATE_TEXT`.
   - Classification via `BAPI_OBJCL_CREATE`.
   - Inspection setup via `BAPI_MATINSPCTRL_SAVEREPLICA`.
   - Preference price via `PREFERENCE_PRICE_UPDATE`.
   - Export / import data via `MAEX_SAVE`.
   - Forecast and consumption via `BAPI_MATERIAL_SAVEREPLICA`.
   - Proportion units via `VBWS_UOM_MAINTAIN_DARK`.
   - PKGN version / parent material logic.
6. `CL_WF=>complete`; `M_TRANS.obj_value = matnr`; final attachment to DMS (object type `BUS1001006`, `attach(iv_final = 'X')`); mails `P_MDM_MX_APP_FINAL` and `_L0`; `DEQUEUE`.

Mail templates for MX (via `P_ALERT`, key/value pairs TRANS_ID, MATNR, MAKTX, MTART, WERKS, VKORG, VTWEG, LV_COMM, MAT_GRP): `P_MDM_MX`, `P_MDM_MX_L0`, `P_MDM_MX_NXT`, `P_MDM_MX_L0_NXT`, `P_MDM_MX_COMPLETE`, `P_MDM_MX_L0_COMPLETE`, `P_MDM_MX_NXT_COMPLETE`, `MDM_MX_L0_NXT_COMPLT`, `P_MDM_MX_APP`, `P_MDM_MX_APP_L0`, `P_MDM_MX_APP_FINAL`, `P_MDM_MX_APP_FINAL_L0`. Send back and reject reuse the **MC** templates (`P_MDM_M_RESEND*`, `P_MDM_M_REJECT_*`).

---

## 2. Extension process (ME)

### 2.1 What can be extended

The extension screen (V_INITIATOR_EXT) first shows the current org footprint of the material through `/INOWITS/MM_MAT_GET(matnr) -> it_plant, it_sales`. Header text: "Material extended to plant records are : n" and "... Sales records are : n". Four actions, plus one that is hidden:
- **Extend plant** (`gv_ext = 'P'`): copy the material data of a source plant to a new plant. The source sales org and distribution channel are also required (V_INITIATOR_EXT:onactionextend_plant).
- **Extend storage location** (`'P'`, `plant_v = 02`): add a storage location to an existing plant (extend_sloc).
- **Extend sales org / distribution channel** (`'S'`, `sales_v = 02`): needs one source plant (`lv_total = 1`, else "Please select the source plant"), then org popup (extend_sorg, extend_dc).
- **Extend valuation type** (`'V'`, `valuation_v = 02`): split valuation, only the accounting views (ext_val_type, plant_val_ext, MBEW_ACC1 / ACC2).
- Hidden or mass variants: `V_MASS_PLANT_SLS` (many plants x many sales orgs, `MASS_PL` / `MASS_SL` / `PH_D_M` tables, `compctrl:mass_plant_sls`, `mass_read`, `mass_ext_validation`).

Views per extension type (compctrl:views_visibility lists):
- **P**: MARA_PLNT1/2, MARC_COST1, MARC_FT_EXP/IMP, MARC_GEN, MARC_MRP1-4, MARC_PURC, MBEW_ACC1/2, MBEW_COST2, MLGN_WHM1, MLGT_WHM2, MVKE_SORG1/1_TAX/2, PROP_FORC, QMAT_QM, WORK_SCHEDULE, TEXT.
- **S**: MVKE_SORG1/1_TAX/2, TEXT, MARC_FT_EXP, MARC_GEN, QMAT_QM, PROP_FORC.
- **V**: MBEW_ACC1, MBEW_ACC2.

### 2.2 Screens and flow

1. V_SEARCH:onactionyes_extend sets `gv_ext_frm_search`, calls `compctrl:material_extension` and goes to V_INITIATOR_EXT.
2. V_EXT_POPUP (window W_EXT_POPUP "Organizational levels"): radio between sales org and plant. Fields WERKS, LGORT, VKORG, VTWEG, BWTAR. Master-data validation:
   - T001W, T001L, TVKOT, TVTWT;
   - plant+sloc in T001L;
   - plant+sales org in TVKWZ;
   - sales org+channel in TVTA.
3. V_INITIATOR_EXT:onactionok_navigate validates per type (see 2.3), calls `views_visibility(app 'ME', 'L0')` and writes `CM_META` row with status `EI`.
4. V_EXT_INIT is the editable form for the new org level. It shows the preliminary data and the new-level views. Save runs `validate` and `field_validation`, then asks for confirmation ("Request will be generated for material to be extended"), then `compctrl:submit_ext`.
5. Reviewers: V_REVIEWER_EXT (`compctrl:updat_ext`, status `ER`, then `CL_WF=>complete`). Final: V_APPROVER_EXT:onactionyes_save, which calls `compctrl:stnd_update_ext` and then `CL_WF=>complete`, status `EA`.

### 2.3 Validations (ME)

- Type S: all of plant, sales org, distribution channel are required ("Please fill Plant data / Sales Org. data / Distribution Channel").
- Type P (sloc): plant and storage location are required.
- Type V: BWTAR must exist in T149A for that plant. "Entered valuation type already extended" when MBEW has it. "Valuation Category does not allow split valuation" when MBEW-BWTTY is empty.
- Already extended: MVKE (vkorg+vtweg) or MARD (werks+lgort) exists leads to "This selection is already maintained".
- In-flight duplicate: an ME request in status 01 or 02 with the same vkorg+vtweg (`MM_MVKE`) or werks+lgort (`MM_MARD`) leads to "This selection is already in progress or initiated by <user> on <date> with transaction ID <id>".
- Plant already maintained in MARC: the message is shown but does not block (see section 5).

### 2.4 Tables and routing

- Same staging tables as MC (`MM_MARA`, `MM_MARC`, `MM_MARD`, `MM_MVKE`, `MM_MLAN`, `MM_STAX`, `MM_MBEW`, `MM_PROP`, plus long text via `save_longtext`). Index and status: `M_TRANS` (app `ME`), `CM_META` (EI / ER / EA).
- Transid via `/INOWITS/M_TRANSID_GENERATE(iv_app_id 'ME')`.
- Workflow key for ME also includes the **plant** (`iv_gen_field3 = werks`, compctrl:submit_ext) and `iv_extend_type` = P / S / V (V_EXT_INIT:onactionyes_generate). Dry run first (`iv_simulate = 'X'`).
- Templates: `P_MDM_ME`, `_L0`, `_NXT`, `_L0_NXT`, `_COMPLETE`, `_L0_COMPLETE`, `_NXT_COMPLETE`, `MDM_ME_L0_NXT_COMPLT`, `P_MDM_ME_APP`, `_APP_L0`, `_APP_FINAL`, `_APP_FINAL_L0`.

### 2.5 Posting (compctrl:stnd_update_ext)

- Staging rewrite, then `get_final`. Final: `BAPI_MATERIAL_SAVEDATA` with `HEADDATA` view flags **hard-coded**: basic, sales, mrp, storage, account, cost, purchase, forecast = X; warehouse and work-schedule blank; quality view blank when plant starts with `3P` or `4P`. Only the new org level is posted: plant data, forecast parameters, storage location, valuation, sales data and tax classification, with descriptions. Warehouse number and storage type data are not passed.
- WIP: `MARC-MATGR` is built as `ZMDM_MATGR-PCODE && material number` for the plant (hard-coded business rule).
- If return is not `E`: `BAPI_MATINSPCTRL_SAVEREPLICA` (inspection setup from `MM_QMAT`, FM `009`, `tq34` default procedure), commit, attachments, comments, `CM_META` set to status `EA` and matnr.
- Mails: see 2.4.
- The workflow `complete` happens afterwards in V_APPROVER_EXT (not in `stnd_update_ext`). If `complete` returns an error, the message branch is empty and nothing is shown (V_APPROVER_EXT:onactionyes_save), but SAP is already updated.

---

## 3. Features of the Web Dynpro that mm-mdm does not have yet

Compared with lib/service.ts (draft / submit / approve / send back / reject / forward / return / delete draft, soundex duplicate check, view visibility and field control from mock tables, description limit, `approve` mock-posts MARA, MARC, MVKE, MLAN, QMAT, MBEW).

| Feature in Web Dynpro | Where | mm-mdm status |
| --- | --- | --- |
| Change (MX) and extension (ME), mass extension, mass change (MMX) | sections 1 and 2; V_MASS_CHG, V_KEYDATA_MASS_CHG, V_MASS_CHG_POPUP, V_MASS_PLANT_SLS | Placeholders (`APPS` in lib/workflowConfig.ts) |
| Load existing material, copy from reference | compctrl:read_chng, compctrl:copy, V_COPY_REF, V_REF, V_INIT:onactioncopy_ref | Copy-from-reference exists only as a mock "use as reference" from `lib/mockData.ts`, no SAP read |
| In-flight duplicate check per material or per org level | V_SEARCH:onactionchange_mat, V_INITIATOR_EXT:onactionok_navigate | Not present |
| Authority check `ZMDM_MAT` (ACTVT 01 + MTART, MATKL, ZBUSINESS, PRDHA(13) for FERT / FRT2) | V_INIT:auth_check, V_SEARCH:wddoinit | Not present (user level only) |
| Duplicate check against the phonetic table | `/INOWITS/P_PHONETICS`, `PHONETICS_FM1`, `CM_META`, `PH_D_M`, `STR_NUM_LENGTH` (V_INIT:check_duplicate, compctrl:dublicate_popup) | Soundex in TS, own algorithm and no SAP data |
| Description builder (code-driven description) | V_DESCRITION, V_INIT:set_desc / get_des; tables `MM_MAT`, `MM_MGRP`, `MM_SGRP`, `MM_SSGR` by MTART | README lists description as free text of 40 characters only. Not present. |
| Attachments with DMS (doc-type mandatory check, final attach to the material `BUS1001006`) | compctrl:attach, compctrl:validate | Not present (`RequestPage.tsx` has no upload) |
| Comments object per level, mandatory on reject | compctrl:comment_mandt | Comment minimum is 5 characters on every action (`needComment` in service.ts). The ABAP rule is only mandatory on reject. |
| Forward with status table and permission blocks | V_FORWARD, FRD_STS, `validate_frwd`, `update_frwd` | Present (forward / return), without the "blocks the original agent" rule and without FRD_STS |
| Display of a request in any state, delete draft | V_DISPLAY (`onactiondelete_draft`, `view_sel`) | Present |
| Confirmation screen with texts, mails | V_CONFIRMATION, `create_alert` + about 40 `P_MDM_*` templates | No mails, no confirmation text variants |
| Classification (class, characteristics, standard class) | compctrl:classification, `class_upd`, `BAPI_OBJCL_CREATE / CHANGE`, `/INOWITS/CLASS`, `MM_RMCL` | Not present |
| Tax matrix (up to 9 tax types per country), SG tax rule | compctrl:set_tax, set_stax_chng, submit_chng | Simplified |
| Forecast and consumption (period indicator M / W / T / P, `MM_MVER`) | submit_chng, `BAPI_MATERIAL_SAVEREPLICA` | Not present |
| Product versions / work schedule, production lists | `MM_WS_V`, `CM_FV_PROD_VERS_DB_UPDATE` | Not present |
| Units of measure, EAN, proportion units | `MM_MARM`, `MM_MEAN`, `VBWS_UOM_MAINTAIN_DARK` | Only view fields |
| India taxes (HSN, assessable value, modvat) | `J_1IMTCHID_POST`, `J_1IASSVAL_POST`, `J_1IMODDET_POST` | Not present |
| Quality inspection setup | `BAPI_MATINSPCTRL_SAVEREPLICA` (`MM_QMAT`) | Not present in the post |
| Export / import data, preference price | `MAEX_SAVE`, `PREFERENCE_PRICE_UPDATE` | Not present in the post |
| IMD data rule (business `03`), PKGN version and parent logic, WIP MATGR | compctrl:validate, stnd_update_chng | Not present |
| Mass actions (mass plant / sales extension, mass change by table and field with ALV) | V_MASS_*, `MASS_CNG`, `MDM_MMX` | Not present |
| Search with change log (dashboard component) | V_SEARCH:onactionchange_log (`change_log(iv_app_id 'M', obj_value)`) | Search present, no change log |
| User chooser, messages window | V_USER, V_MSG | Not needed in a web app |
| Locks per transid | `ENQUEUE_/INOWITS/MDM_MM` | Not present (service is mock) |
| Posting that goes beyond the six mock tables | all of 1.7 | The mock only lists six tables |

---

## 4. Build list (prioritised) and OData requirements

The current names are the function imports in the README: StartRequest, SaveDraft, Submit, Approve, SendBack, Reject, Forward, DeleteDraft, CheckDuplicate, GetFieldControl, plus GetViewVisibility. Complexity: S small, M medium, L large.

| # | Item | Front end | ZMM_MDM_SRV_SRV addition | Size |
| --- | --- | --- | --- | --- |
| 1 | **Material read** (`read_chng` equivalent): one call that returns the posted material with all view data for a scope (matnr, werks, lgort, vkorg, vtweg) | Change entry, copy-from-reference, old-value display | Function import or entity `MaterialSet(Matnr,Werks,Lgort,Vkorg,Vtweg)` returning the same shape as the staging tables. Fix the partial-key reads (section 5) | L |
| 2 | **Change start**: search, in-flight check, scope popup (org dropdowns from MARC / MARD / MVKE, validations from TVKWZ / T001L / TVTA), MX header | New `/master/material/change` page, `APPS.MX` enabled | `GetChangeScope(Matnr)` (orgs), `CheckChangeAllowed(Matnr)` (open MX / ME requests, blocked flag), `StartChange(Matnr, Werks, Lgort, Vkorg, Vtweg)` returning `TransId` and level-0 visibility | M |
| 3 | **Change edit + changed-views popup**, snapshot stored with the old values. Recommended extra over the ABAP: store a **delta** and the **base snapshot** | Request page in change mode: tabs from existing material, field-level old / new highlight, popup with the views to change from `MDM_V_N` (app `MX`) | `GetChangeViews(AppId)` (MDM_V_N), `SaveChange(TransId, data, selectedViews)`, new tables for base snapshot and delta (does not exist in the old system) | L |
| 4 | **Dry run with BAPI** (`val_change_bapi`): server-side `BAPI_MATERIAL_SAVEDATA` with rollback, return all `E` messages | Run on Submit; show messages per view and field | Part of `Submit` for MX (no new import). Must use the same payload builder as posting | M |
| 5 | **MX routing and approver screens**: level view = selected views x level views, reviewer saves staging, approver posts | Reuse `RequestPage.tsx` with `view visibility x selected views` | `GetViewVisibility(AppId, MaterialType, Level, TransId)` gains `AppId` and the selected-view filter; WF key `(MTART, MATKL?, ZBUSINESS?)` from `WF_CONS` | M |
| 6 | **Posting engine for change** (`stnd_update_chng`), fixed so that only changed fields are flagged and cleared fields can be blanked | None (server only) | `Approve` for MX, posting service on the PM2 box or in ABAP. Cover BAPI_MATERIAL_SAVEDATA first, then the follow-ups in 1.7 as separate steps with per-step status | L |
| 7 | **Authority checks** (`ZMDM_MAT`: ACTVT 01 and 02, MTART, MATKL, ZBUSINESS, PRDHA) on create, change and extend | Hide or block start | `GetAuthorization(AppId, Matnr / MTART / MATKL / ZBUSINESS)`; server-side enforcement on every action | S-M |
| 8 | **Extension start and popup** (P, S, V; source plant selection; validations in 2.3) | New `/master/material/extend` pages | `GetExtensionContext(Matnr)` (the existing plants and sales areas, `MM_MAT_GET`), `CheckExtension(Matnr, type, werks, lgort, vkorg, vtweg, bwtar)`, `StartExtension(...)` | M |
| 9 | **ME posting engine** (`stnd_update_ext`), view set per type, quality view rule, WIP MATGR, inspection setup | None | `Approve` for ME | L |
| 10 | **Attachments** (upload, doc-type mandatory check, final attach to the material) | Upload in request page | `AttachmentSet` entity (`$value` stream) plus `GetMandatoryDocTypes(app, mtart, werks)`. Needs SAP Basis confirmation of the DMS object. | M |
| 11 | **Comments and mails**: structured comment per level, `P_MDM_*` template content as email / Teams | Comment box and history | `CommentSet`, mail sent from the Node server layer with the template texts (the ABAP template texts are not in the download and must be exported from the system) | M |
| 12 | **Description builder** (MM_MAT / MM_MGRP / MM_SGRP / MM_SSGR) | Builder popup on the new-request page | `GetDescriptionParts(mtart)` entities | M |
| 13 | **Phonetic duplicate check on the real table** (`CM_META` / `PH_D_M`) | No change | `CheckDuplicate` backed by `/INOWITS/P_PHONETICS` | S |
| 14 | **Classification** | Classification tab | `GetClasses`, `GetCharacteristics(class)`, values in the payload | M |
| 15 | **Forecast, consumption, UoM, EAN, India tax, export / import** tabs and their posting | Tabs per `lib/materialViews.ts` | Payload shape per staging table | L |
| 16 | **Mass extension and mass change** | Not needed first | Generic table / field catalogue (`MDM_MMX`), mass post | L |
| 17 | **Change log** per material | Read-only list | `GetChangeLog(Matnr)` over change documents | S |

Suggested order: 7, 1, 2, 3, 4, 5, 6 (change complete) then 8, 9 (extension), then 10, 11, 12, 13, 14, 15, 17, last 16.

---

## 5. Bugs and fragile logic in the ABAP that must not be copied

Each item cites the place. "Inferred" means it follows from the code but has not been confirmed in the system.

**Posting (MX)**
1. `stnd_update_chng` sets the BAPI X-flag only when the new value is non-initial (e.g. `IF wa_bapimarc-abc_id IS NOT INITIAL. ...x = 'X'`). A field cleared by the user is never sent, so **a value can not be blanked** through change. Send explicit flags for the changed fields.
2. The BAPI view groups and structures are built only for views the **final approver's own level** flags as editable (`ls_views_visibility-... EQ 02`, compctrl:stnd_update_chng). Inferred: if the final level (MDM) has read-only views, edits made in those views by earlier levels are not posted, although `M_SELV` says they were requested. The posting must be driven by the selected views plus the delta.
3. The whole view snapshot is posted, not a delta. SAP changes made between the request and the approval are silently overwritten. Store the base snapshot and compare before posting.
4. `BAPI_TRANSACTION_COMMIT` is called straight after `BAPI_MATERIAL_SAVEDATA` without checking the full return (`return` is only one message; `returnmessages` is not requested in stnd_update_chng). Follow-ups (classification, versions, texts) then run, and the workflow completes, on an incomplete post. Use `returnmessages` and roll back on any `E`.
5. In `val_change_bapi` the units-of-measure X structure is built with an `ELSEIF` chain, so only **one** field is flagged, unlike `stnd_update_chng` (`IF` per field). The dry run therefore does not test what the real post sends.
6. `stnd_update_chng` (PKGN): `ls_mara-zzp_version = <ls_pm_savemat>-zzp_version + 1.` is immediately overwritten by `ls_mara-zzp_version = '0'.`, so the packing material version never increments.
7. The posted data come from the screen context (`ls_mara`, `ls_marc`, ...) in the final step, but the `MM_MARA` read for the header uses `transid + matnr`. Different sources inside one method (compctrl:stnd_update_chng). Use one source: the staging tables.
8. Direct `UPDATE mara / marc / mbew / mlan` for customer fields after the BAPI (compctrl:stnd_update_chng, `save_as_draft`, `stnd_update`). No change documents, no locks. Use BAPI extension structures (`BAPI_TE_*`) or a Z function with `ENQUEUE`.
9. Non-final approval branch: `stnd_update_chng` writes `CM_META.status = 'CHA'` (changed in SAP) and V_APPROVER_CHNG:onactionyes_save also does it and shows "Material number ... has been changed sucessfully" even when the item was only passed on. Inferred from the code: the status becomes CHA before the final level.
10. `read_chng` reads MLAN, WRPL, MKAL, MLGN, MLGT, MAEX with `SELECT SINGLE ... WHERE matnr = ...` only (compctrl:read_chng). With more than one country, warehouse, version or storage type the first arbitrary row is used. Use full keys and read all rows.

**Request creation (MX and ME)**
11. `submit_chng` writes all staging tables and takes the transid **before** the workflow simulate. On a simulate error it does `EXIT` without `DEQUEUE` and leaves half a request. Simulate first, then generate the id and write.
12. `ENQUEUE_/INOWITS/MDM_MM` locks the **transid**, not the material, and `sy-subrc` is never checked (`submit_chng`, `stnd_update_chng`, `stnd_update_ext`). Two requests on the same material do not exclude each other. Lock by material and org level.
13. In-flight check for MX: `( status NE '05' OR status NE '03' )` is always true (V_SEARCH:onactionchange_mat). The `LIKE '%matnr'` pattern also matches other materials with the same tail. Use `status NOT IN ('03','05')` and an exact key.
14. `CM_META` is one row per material (delete then insert on `matnr`, V_INITIATOR_CHNG:onactionyes_save, V_INITIATOR_EXT:onactionok_navigate). A new request wipes the visible status history of the previous one. Keep one row per transid.
15. ME: "Plant is maintained already" is shown as a message but `lv_error` is not set (V_INITIATOR_EXT:onactionok_navigate), so an existing plant can be extended again. Also, the `mvke` or `mard` already-exists and in-flight branches set flags without a message in some paths (silent no-op).
16. `V_EXT_INIT:onactionyes_generate`: `submit_ext` returns `lv_error = 'X'` on **success** and the caller tests `lv_error EQ 'X'` to start the workflow. Inverted flag semantics. Use a clear boolean.
17. `V_APPROVER_EXT:onactionyes_save`: SAP is already updated when `CL_WF=>complete` fails, and the error branch is empty. Make posting and workflow completion one transaction with a visible error state.
18. `mass_ext_validation` appends every plant to the same `lt_plant` inside the loop without clearing, and `lt_rules` is not reset (compctrl:mass_ext_validation). A later plant without rules passes if any earlier plant had rules.
19. SELECT_VIEWS:onactionextend_cr2 is a direct `BAPI_MATERIAL_SAVEDATA` in a loop, with no error check, no workflow, no commit per row check. Do not port.

**Validation**
20. IMD data check is an `ELSEIF` chain, so only the first missing field is reported, and the "Material Category Mandatory for IMD Data" branch does not set `lv_errors = 'X'`, so a missing category does not block (compctrl:validate).
21. Attachment mandatory check and the attachment store use the hard-coded app id `'MC'` for MX and ME too (compctrl:validate, compctrl:attach). Rules and storage for change and extension are therefore the create rules.
22. Authority: `AUTHORITY-CHECK 'ZMDM_MAT'` runs with `ACTVT 01` only, in V_SEARCH:wddoinit and V_INIT:auth_check (create). Change and extension are not checked on MTART / MATKL / business / hierarchy and not with `ACTVT 02`.

**Workflow actions and texts**
23. `compctrl:sendback` and `compctrl:reject` always send the **MC** mail templates (`P_MDM_M_RESEND*`, `P_MDM_M_REJECT_*`) and build the work-item text with "MC (" even for MX and ME. Status then gets overwritten by the view (`CRSB`, `CASB`, `CAR`). Use per-app templates.
24. Copied texts: V_REVIEWER_CHNG:onactionyes_save says "Material Creation Request has been raised successfully", V_REVIEWER_CHNG:onactionyes_send_back says "Material Extension request is sent back", V_INITIATOR_CHNG:onactionyes_save_draft says "Material Creation". Use texts per process.
25. V_INITIATOR_CHNG:onactionyes_sendback sets the status `CRSB` (the same code the reviewer uses), so the initiator and the reviewer send-back are not distinguishable. V_REVIEWER_CHNG:onactionyes_save writes `CM_META` after the confirmation navigation.
26. V_FORWARD:onactionyes_reject deletes `MM_MARA`, `CM_META`, `MM_MAKT`, `MM_MVKE` rows of the transid (all app ids). A rejected request loses its audit trail and leaves other staging tables orphaned. Keep the data and set status 03.
27. Dequeue is missing on most error exits; locks live until the session ends (V_INITIATOR_CHNG, `submit_chng`).

**Maintainability facts that affect the port**
- Hard-coded business rules in code that must move to configuration: quality view off for plants `3P*` / `4P*` and WIP `MATGR` rule (`stnd_update_ext`), PKGN brand check, period indicator `IPRKZ = '2'` (V_INITIATOR_CHNG:onactionsave, only at MARA_PLNT1), SG tax class rule, `BWTAR` / `T149A` check, FERT / FRT2 and `ZBUSINESS = '03'` IMD rule, language `'EN'` for descriptions in BAPI calls.
- `compctrl` has about 38,000 lines after stripping boilerplate; `field_validation` alone is about 5,700. Extract the rules to a table before porting, do not translate line by line.

---

## 6. Open points that cannot be settled from the code

- Number and meaning of the workflow levels for MX and ME (inside `/INOWITS/CL_WF` and the `WF_*` tables).
- Which views each level can edit for MX (content of `WF_LVL`, `M_VIEW`, `MDM_V_N`) and the MX view list in `MDM_V_N`.
- Window navigation: which plug leads from V_MX_POPUP, V_SEARCH and V_INITIATOR_CHNG to which window (the window XMLs carry no navigation). The flow in 1.1 follows the `fire_*_plg` calls and is likely, but not proven.
- Mail template texts and `/INOWITS/CL_MDM_MSG` message texts.
- The semantics of `M_TRANS.STATUS` against the README's 00..05 mapping, and whether `CM_META` statuses are the only ones shown to users.
- How `MMX` mass change finally posts (`compctrl:std_upd_mass_chg` was not read in detail: it is table-driven by `MDM_MMX` with `iv_app_typ = 'MMX'`).
