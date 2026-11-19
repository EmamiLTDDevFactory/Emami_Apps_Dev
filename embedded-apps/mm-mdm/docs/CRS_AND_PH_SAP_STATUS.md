# CRS product grouping + product hierarchy: what is built, what is not

Source of truth for the SAP objects is EDS (client 900, package ZEMAMI, transport EDSK9B0EAU "MDM_Revamp_SA_03.11").
`docs/sap-eds/` holds a copy of each class so the work is in git. Web Dynpro components read: `ZMDM_PRODUCT_HIERARCHYF_F`,
`ZCRS_PRODUCT_GROUP`, `/INOWITS/MM_CREATE_PROC` (see `MM_CREATE_PROC_GAP_ANALYSIS.md` for the material create/change/extend part).

## Done and verified on EDS

| Piece | State |
| --- | --- |
| `ZCX_MDM_PH` | Fixed. It never stored its messages, `get_text`/`from_text` were commented out. |
| `ZCL_ZMDM_PH_DPC_EXT>raise_busi` | Fixed. Body was commented out, so every business error of the product hierarchy writes came back as success. Now a 400 with every message. |
| `ZCL_MDM_CRS_CORE` (new) | CRS product > group > SKU group: values, verticals (ZBUS_GRP), requests, inbox, validate, initiate, approve, reject, next code. 7 ABAP Unit tests pass. |
| `ZMDM_PH_SRV` extended | `CrsValueSet`, `CrsVerticalSet`, `CrsRequestSet` (POST = initiate), `CrsWorkItemSet`, function imports `CrsValidate`, `CrsApprove`, `CrsReject`. Reads and validation checked over HTTP against real data. |
| Hub backend `backend/mmMdmPh.js` | `/crs/*` routes, 6 tests (`backend/test/mmMdmPhCrs.test.js`). |
| App | `components/setup/CrsLive.tsx` (live on DEV host / `NEXT_PUBLIC_MDM_PH_LIVE=1`), browser-tested with the API mocked. Local and PRD keep the demo form. |

## Rules taken from the Web Dynpro, and where this differs on purpose

* Codes: CRS product 9 digits, group 2 or 3, SKU group 3 (the old mock used 6/3/3). New = blank code + description; the code is generated at approval.
* The old screen made new product codes with `NUMC2`, always numbered a new group `001` (the `MAX` ran with `prd_grp = ''`), and compared codes as text. All three would overwrite or corrupt master rows. The new code uses numeric maximum + 1 (9 / 2-3 / 3 digits).
* Descriptions are upper-cased and must be unique inside their parent. Existing codes must match their description.
* Master rows use `INSERT ... ACCEPTING DUPLICATE KEYS` (never overwrite), under an enqueue.
* Attachment is mandatory and is written to `/sftproot/CRS_GRP/<SYSID>/` like before.

## NOT done / needs a decision

1. **Identity.** The gateway signs in as a technical user. SAP workflow runs as `SY-UNAME`, so through the hub the initiator is that technical user and approve/reject only work for work items it owns. Needs the gateway to run as, or map to, the real SAP user before real approvals.
2. **Initiate and approve were not run live** (they would start a workflow and write master data on a shared system). Their logic is covered by the unit tests only up to validation and code generation.
3. **Deployed to DEV on 2026-11-19:** `backend/mmMdmPh.js` on 172.17.2.21 (`emami-hub-backend-dev`, backup `mmMdmPh.js.bak-pre-crs-ph-writes`, PM2 restarted). The NGD gateway already serves the CRS entities (checked from the box). **Not deployed:** prod backend, and the front end (it builds from git; nothing is committed or pushed).
   Proof of the identity limit (item 1): from the gateway's technical user `CrsWorkItemSet` is empty, while the real user on EDS sees 6 open items.
4. **New CRS product code** is `max + 1` in the nine-digit series. Real codes are not strictly sequential (e.g. 801360455, 801350454). Confirm that rule with MDM.
5. Product hierarchy writes are now wired end to end in the app on the DEV host (validate + initiate, inbox with approve / cost centre / reject / send back), with hub routes `/ph/*`, 7 backend tests and a browser test with the API mocked. Same identity limit as item 1. Not run against real SAP data (they would start workflows).
6. Material create, change (MX) and extension (ME): see the gap analysis. The Next.js app covers create only.

## Material Master create / change: state on 2026-11-19 (end of day)

* `ZMM_MDM_SRV_SRV` on EDS already had the create flow: request service, validator, workflow, staging, field control, value helps.
* **`ZCL_MM_MDM_POSTER` (posts the approved request) was an empty outline; it is now implemented and switched on (`c_implemented = abap_true`) on EDS.** Ported from `STND_UPDATE`:
  1. material number (internal draw, or the typed number for an external range), stored in `/INOWITS/M_TRANS-OBJ_VALUE`
  2. test run (same BAPI call, rolled back; its messages stop a bad request before anything is created), then `BAPI_MATERIAL_SAVEDATA` (client, plant, storage location, valuation, warehouse, storage type, sales, forecast parameters, descriptions, units, EAN, tax classification); the field mapping (363 pairs) was extracted mechanically (`gen_poster.py`, `pairs.json`), X flags are generic; second call for split valuation
  3. custom Z fields and hierarchy levels of MARA (as the old UPDATE did, per material type ROH / PKGN / FERT / FRT2 / WIP), replenishment (retail), production versions
  4. India tax (HSN chapter ID, assessable value, MODVAT), long texts, classification (`BAPI_OBJCL_CREATE` + `_CHANGE`)
  5. inspection setup, preference prices, legal control (`MAEX_SAVE`), forecast and consumption values (`BAPI_MATERIAL_SAVEREPLICA`)
  6. variants, `CM_META` row, phonetic keys (`PH_D_M`)
  Retry safety: a second post reuses the material and continues; failures raise the BAPI messages and leave the request with the approver.
* Proven on DEV with a console runner (`ZCL_MM_MDM_POSTER_RUN`, temporary friend class; remove when done): bad material group stopped by the test run with nothing created; a clone of real material 100003623 (all common views) posted on the default path and compared field by field. Only expected differences remain (authorisation group = material type, valuation class from the `ZMM_MDM` plant defaults, ROH parent/version fields, period and cost-estimate numbers). India tax, meta row, phonetic keys and a long text were verified.
* **Not verified with data:** classification, forecast/consumption values, variants, production versions, split valuation, replica, inspection setup, preference prices and legal control are compiled and follow the old code, but no test request exercised them. Plant tolerances `UNETO`/`UEETO` (5.0 became 0.0) and `AUTRU` did not carry over in the clone; to be checked.
* **Not ported:** attachments and comments (the old code calls a separate Web Dynpro attachment component, `attach_dms`, with DMS object BUS1001006; needs Basis confirmation and an `AttachmentSet` in the service), IMD data for business 03 (`ZSECOND_PROD` / `ZSECOND_MAT_MAP`: the old screen keeps it in the screen context only, there is no staging table, so the request model needs new fields), and the alert mails (about 40 `P_MDM_*` templates).
* **Throw-away materials created on EDS client 900** (text "ZZ UNIT TEST DELETE ME" / "ZZ CLONE DELETE ME"): 100003642, 100003644, 100003646, 100003648, 100003650, 100003652, 100003654, 100003656, 100003658, 100003660 (the last one was also changed by the MX test and got a new storage location ASH1 from the ME test). Mark them for deletion when convenient.

## Change (MX) and extension (ME): SAP side and backend done 2026-11-19, app screens not yet live

SAP (EDS, same transport):
* `ZCL_MM_MDM_CHANGE`: `search` (posted materials, flags those with an open MX/ME request), `get_scope` (plants with storage locations, sales areas), `check_allowed` (material exists, not marked for deletion, no draft / requested / in-progress / sent-back MX or ME request; the old check was always true), `start_change`, `start_extension` (P new plant or storage location, S new sales area, V new valuation type, with the validations of the old screens).
* A request starts as a draft with its staging rows copied from the live material (client data, description, plant, storage location, valuation, sales, warehouse, units, EAN, inspection setup, India tax, long texts) **and a base snapshot** under `base_id( transid )` = transid + 5,000,000,000. Deleting the draft removes both.
* Posting (`ZCL_MM_MDM_POSTER`, app `MX`): the BAPI data is built from the base snapshot and from the request and only the **differences** are sent; a changed field is flagged even when now blank, so a cleared field is cleared in SAP, and changes made in SAP after the request started are not overwritten by stale values. Follow-up steps run only for the views the requester selected. App `ME`: only the new organisational level is posted (view flags as the old extension posting set them, no quality view for plants 3P*/4P*). Both run a test run first.
* OData `ZMM_MDM_SRV_SRV`: `PostedMaterialSet`, `ChangeScopeSet`, actions `StartChange`, `StartExtension`; the request list now includes MX and ME requests, with paging (100 by default).
* Fixed on the way: request and history reads failed for every request with an end date (the model types the dates as time stamps and the copy helper stored plain dates in them); one value that does not fit the model type no longer fails a whole entity; draft deletion also removes the base snapshot.
* Proven on DEV with the console runner: search, scope, start, second request for the same material refused, a change that sets a field (only that field moved; type, group and MRP data untouched), a second change that clears it again, an extension that created storage location ASH1 in plant UN13. OData: `StartChange`, `PostedMaterialSet`, `ChangeScopeSet`, request list and `DeleteDraft` checked over HTTP.
* Hub backend (`backend/mmMdm.js`, deployed to the DEV backend box 2026-11-19, backup `mmMdm.js.bak-pre-change-extend`): `GET /posted`, `GET /posted/:matnr/scope`, `POST /change`, `POST /extension`; the request read now uses one `$filter` read per entity set because key reads, navigation and `$expand` are rejected by the service on EDS (this also affected the existing create flow's request page).

**Still open for MX / ME and create in the app**
1. **The Material Master app screens are not wired to SAP.** `embedded-apps/mm-mdm` keeps all requests in the browser (`lib/store.tsx`, `lib/service.ts`, mock users) and only the product hierarchy and CRS screens are live. Create, change and extension need an async live data layer behind the request screens (new request, request page, home, search, posted materials) that maps the app's flat fields to the entities (the field definitions carry the SAP field name in `tech`) and calls `/api/me/mm-mdm`. The change and extension entry pages (search, scope, extension type) need building on top of it.
2. Not carried by a change request yet: tax classification, classification (class values), forecast and consumption values, replenishment, production versions, preference prices and export control are not copied into the request (they are posted only when present in the staging rows).
3. Attachments/comments (DMS), IMD data for business 03 and the alert mails (create and change) are not ported.
4. The validator (`ZCL_MM_MDM_VALIDATOR`) was written for create; check that its mandatory rules fit change and extension requests before submitting them through the workflow, and that the MX/ME workflow definitions exist for the routing keys.
5. The initiator identity limit of the gateway (see above) applies here too.

## Update 2026-11-19 (late): open points closed, what is left

Closed (DEV / EDS, same transport):
* **App is live.** The mock layer (`mockData`, `service`, `viewVisibility`, `DataSummary`) is deleted; create, change (MX) and extension (ME) run on `/api/me/mm-mdm` through `lib/mmApi.ts` / `mmMap.ts`. The hierarchy screen is live everywhere. Unit tests (`npm test`) and `tsc` are clean.
* **Attachments, comments, IMD data, alert mails, validator/workflow checks** are ported: `ZCL_MM_MDM_ATTACH` (draft rows in `/INOWITS/P_DMS_A`, DMS documents linked to the material at final posting), `ZCL_MM_MDM_MAIL` (`/INOWITS/P_ALERT` with the `P_MDM_*` templates), `check_workflow` in `ZCL_MM_MDM_CHANGE`, IMD rows (`ZSECOND_PROD` / `ZSECOND_MAT_MAP`) written by the poster for business 03. OData: `AttachmentSet` (media), `CommentSet`.
* Change requests now also copy tax, classification, replenishment, production versions, preference prices and export control.
* **Emami field names** in `materialViews.ts` / `keyFields.ts` now match the real `/INOWITS/MM_MARA` columns (ZSKUSIZE, ZBUSINESS, ZSKUGRCODE, ZCODE, ZZMTYPE_CODE ... ZZFG_CODE, IMD: ZPRODC, BRAND, CATAG, SEGMN, SEASON, SCHEME, RANGE); the old guessed names never bound, so those fields were hidden.
* Hub backend on DEV: live-contract `mmMdm.js` + `mmMdmFields.json` (backups `.bak-pre-live-app`). All 59 backend tests pass.
* Sources of all SAP classes are in `docs/sap-eds/`.

Still open:
1. (done) `ZCL_MM_MDM_CHANGE` maktx fix is on EDS since the SM12 lock clear; verified live (no description message on a change request).
2. Alert mails and the workflow with real work items were not exercised end to end (would send real mails).
3. Forecast / consumption values are not copied into change requests; classification and forecast posting have no data test.
4. The classification rows and the ZCOMMENT field are not mapped in the app; MX changed-field highlighting needs a base-snapshot route; copy-from-reference was removed; the app holds one description only.
5. Gateway runs as a technical user, so workflow approvals run as that user.
6. Cleanup: delete `ZCL_MM_MDM_TMP` and `ZCL_MM_MDM_POSTER_RUN` on EDS and the "ZZ UNIT TEST / ZZ CLONE" throw-away materials.
7. Nothing is committed; the front end builds from git. PRD backend is untouched.

## Update 2026-11-19 (evening): the Azure proxy in front of the Gateway

The hub backend reaches ZMM_MDM_SRV_SRV through `https://<azure webapp>/api/NGD/...`. That proxy (SAP log: `CX_DS_URI_NOT_MATCHING`, 404 with empty text) **drops the query string of a POST, the `Slug` header and raw request bodies, and only routes single-segment POST paths**. Direct calls to EDS were fine, which hid it. Consequences and fixes (all live-verified through the hub on DEV, 2026-11-19):
* Function imports (`StartChange`, `StartRequest`, `Validate`, `Submit`, `GetFieldControl`, ...): `request()` in `backend/mmMdmSap.js` sends a POST query as an encoded path (`Name%3F<encoded query>`), which the proxy turns back into a query string; a direct Gateway URL (plain form) is the automatic fallback.
* Attachments: the file travels as base64 text of the new entity `AttachmentFileSet` (create = upload, filtered read = download); metadata still comes from `AttachmentSet`. Removal is the new function import `DeleteAttachment` (no DELETE through the gateway). The old media-stream handler (`create_stream` with Slug) stays for a direct gateway.
* SAP: `ZCL_ZMM_MDM_SRV_MPC_EXT` (AttachmentFile, DeleteAttachment, Request_Attachment navigation) and `ZCL_ZMM_MDM_SRV_DPC_EXT` (create_entity / get_entityset for AttachmentFileSet, DeleteAttachment, tid/fname query reading) are in `docs/sap-eds/`.
* DEV hub backend now runs `mmMdm.js` + `mmMdmSap.js` with these (backups `.bak-pre-proxy-fix`).
* Live contract run (`start, save, validate, field control, attach, read back, comments, session, delete`) passes through the hub.
