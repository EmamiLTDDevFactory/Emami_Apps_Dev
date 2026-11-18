# Term Policy – SAP side (ZLIFE_INS_SRV)

Source of truth: Web Dynpro component **ZWD_MEDICAIM_NOMINEE** (package ZEMAMI_MEDICLAIM, EDS). It serves Mediclaim and Term Life;
this app is the **Term Life** half (tables `ZLIFE_*`). Mediclaim is a separate app (`embedded-apps/mediclaim`).

## What exists on EDS (built 2026-11-18 through ADT, no SEGW project; same technique as Mediclaim)

Transport request EDSK9B0EKB (task EDSK9B0EKC), package ZEMAMI_MEDICLAIM. Nothing existing was changed.

| Object | Role |
|---|---|
| Tables ZLIFE_EMP, ZLIFE_FAMILY, ZLIFE_AMT, ZLIFE_PERIOD, ZLIFE_INS_LIMIT, ZMEDI_AUTH_USERS, ZMEDI_DATE | existing, unchanged |
| FMs ZLIFE_REQNO, ZLIFE_UPDATE_TABS (group ZFG_MEDI) | existing, unchanged (the BL class does the same writes) |
| `ZCL_LIFE_INS_UTILS` (`zcl_life_ins_utils.abap`) | business logic of every Web Dynpro function; no UI, no COMMIT |
| `ZLIFE_INS_UTILS_TEST` (`zlife_ins_utils_test.abap`, program) | 13 read-only ABAP Unit tests, all passing |
| `ZCL_LIFE_INS_TY` (`zcl_life_ins_ty.abap`) | the OData structure types (generated) |
| `ZCL_ZLIFE_INS_MPC` (`zcl_zlife_ins_mpc.abap`) | code-based model provider, extends `/IWBEP/CL_MGW_ABS_MODEL` (generated) |
| `ZCL_ZLIFE_INS_DPC` (`zcl_zlife_ins_dpc.abap`) | data provider, extends `/IWBEP/CL_MGW_ABS_DATA`, maps OData to the BL, commits/rolls back |
| IWMO ZLIFE_INS_MDL, IWSV ZLIFE_INS_SRV (0001), IWSG ZLIFE_INS_SRV_0001, SICF node `/sap/opu/odata/sap/ZLIFE_INS_SRV`, system alias LOCAL | registered by ABAP, see below. `GET .../ZLIFE_INS_SRV/$metadata` answers 200 on EDS |
| `ZCL_LIFE_INS_UTILS_T` | empty leftover of a failed first attempt at hosting the tests; ADT refuses to lock it (403), SAP team can delete it |

The model is generated: edit `gen/spec.py`, run `python3 gen/gen.py`, deploy `zcl_life_ins_ty.abap` and `zcl_zlife_ins_mpc.abap`, and
bump the timestamp constant in `ZCL_ZLIFE_INS_MPC>GET_LAST_MODIFIED` so the metadata cache refreshes.

### Registration (what /IWFND/MAINT_SERVICE does, done from ABAP; sources in `registration/`)

1. `zcl_life_ins_reg.abap` (classrun): `/IWBEP/CL_MGW_MED_REG_API` CREATE_MODEL, CREATE_SERVICE, ASSIGN_MODEL_TO_SERVICE.
2. `zcl_life_ins_reg2.abap` (classrun): `/IWFND/CL_MED_REM_ACTIVATION->CREATE_GW_SERVICE` and `create_destination_assignment` (alias LOCAL).
3. `zcl_life_ins_reg3.abap` (classrun): the SICF node. The API's own ICF step (`CREATE_GW_SERVICE_ICF_NODE`) fails on this system with
   `/IWFND/CX_COS_ICF`, so the node is inserted with the same `CL_ICF_TREE->IF_ICF_TREE~INSERT_NODE` call, under the parent of ZMEDICLAIM_SRV.
   These three helper classes were deleted from EDS after use.

Note for ADT: activating a class needs its `source/main#type=CLAS/OSU` ref listed too, otherwise the activation call answers 200 and nothing happens.

## Still to do on the SAP side

- ~~Register `ZLIFE_INS_SRV` on the gateway hub NGD~~ **Done by Basis (2026-11-18)**; tested through the Azure gateway, see below.
- Release transport EDSK9B0EKB, import into the NGQ/NWP backends, register on those hubs.
- Mail (`CommandSet` Action MAIL) is untested: EDS has no SMTP (SCOT).

## Web Dynpro function → BL method → OData

| Web Dynpro (view / action) | BL method | OData |
|---|---|---|
| user = SAP user, flag E/R in ZMEDI_AUTH_USERS | `get_role`, `user_from_email` | `GET ProfileSet('<email>')` |
| MAIN / FETCH_DET (HR read, cut-off date, company 1000, "already exists") | `get_employee` | `GET EmployeeSet(EmpId='…',Email='…')` |
| MAIN / BPOLICY (sum slabs ≤ limit, premium) | `get_sum_options` | `GET SumOptionSet?$filter=EmpId eq '…' and Email eq '…'` |
| MAIN / SUBMIT and CHANGE | `save_policy` | `POST PolicySet` (deep insert with `Nominees`; `Reqno` filled = change) |
| MAIN / DELETE (flag R, soft delete) | `delete_policy` | `POST CommandSet {Email, Action:'DELETE', Reqnos:'…'}` |
| DISPLAY / SEARCH, V_DOWNLOAD | `search_policies` | `GET PolicySet?$filter=Email eq '…' [and EmpId eq '…'] [and AllRows eq 'X']&$expand=Nominees` |
| V_LIMIT_UP (save limits) | `save_limits` | `POST LimitUploadSet` (deep insert with `Rows`) |
| MASS_UPLOAD | `save_policy` per row | the app posts one `PolicySet` per Excel row |
| V_SEND_MAIL | `send_summary` | `POST CommandSet {Email, Action:'MAIL', Reqnos:'a,b'}` |

The Azure gateway passes only GET and POST (Gate Entry finding), so there is no PUT/DELETE: change and delete are POSTs.

## Entity model (ZCL_ZLIFE_INS_MPC)

All properties Edm.String unless noted. Keys in **bold**.

- **Profile**: **Email**, User, Role (USER/EDITOR/ADMIN), EmpId, ActiveYear
- **Employee**: **EmpId**, **Email**, FirstName, LastName, Dob (DateTime), Age (Int16), Gender, CompanyCode, CompanyName, Department, OrgUnit, Designation, Location, LocationText, CompanyMail, LimitText, Year
- **SumOption**: **Email**, **EmpId**, **Slno**, SumText, SumAmount (Decimal), Premium (Decimal), Gst (Decimal), Total (Decimal)
- **Policy**: **Reqno**, Email, Year, EmpId, EmployeeName, Designation, OrgUnit, LocationText, CompanyMail, PersonalMail, Contact, SumText, Premium, Gst, Total (Decimal), CreatedBy, ReqDat (DateTime); NavigationProperty `Nominees` → Nominee (1:n)
- **Nominee**: **Reqno**, **SlNo**, Name, Relation (3 Father, 4 Mother, 5 Spouse, 6 Son), PerShare
- **LimitUpload**: **Email**, Count (Int32); NavigationProperty `Rows` → LimitRow
- **LimitRow**: **EmpId**, Limit (e.g. `50 LAKHS`)
- **Command**: **Email**, Action (`DELETE` or `MAIL`), Reqnos (comma separated), Ok, Message. Creatable only: `POST CommandSet` runs the action.
- No function imports: the gateway hub answers every function-import POST with an empty 404 (Mediclaim's `DeletePolicy` too), so delete and mail are entity creates.

The app has no mock: until the service answers on the gateway it shows "Term Life service not available (SAP)" with a Try again button,
like Mediclaim. `SAP_SYSTEM` is `NGD` in `src/lib/config.ts`.

Notes from testing on EDS: `$format=json` must **not** be sent on an entity-create POST (SAP answers 400 "SystemQueryOptions not allowed"), the
`Accept` header is enough; `Reqno` and nominee `SlNo` are strings; `EmpId` is `00000000` when the mail has no employee number.
Dry run for tests: header `X-Life-Simulate: X` runs everything and rolls back on EDS. **The gateway drops this header**, so a "dry run" sent through it commits for real (it created a test policy once); use it only against EDS directly.

## Differences from the Web Dynpro (deliberate)

1. HR data, premium, GST and total are **re-derived on the server**; the Web Dynpro trusted the screen values.
2. Age is taken at **1 August of the current year**; the Web Dynpro had `20260801` hard-coded (and a `20250801` comment).
3. Change mode read `created_by` from **ZMEDI_EMP** (the Mediclaim table); fixed to ZLIFE_EMP.
4. Nominee relation is validated (3–6), share must be a whole number, max 6 nominees, shares = 100%.
5. An ordinary user can apply only for **their own** employee number; EDITOR/ADMIN apply for anyone.
   Identity from the hub mail: SAP user = USR21+ADR6 owner of that address (mail local parts are not user names: user
   `sandip.das`, mail `SANDIPD@...`); employee number = PA0105 subtype 0010 (stored UPPER case) restricted to employees active
   in PA0000 (stat2 3). If one address still maps to several active employees, nothing is returned and the person is told to contact HR.
6. The cut-off date is checked on **Submit** (`check_window`, first thing in `save_policy`, for new and changed requests), not on the employee fetch: the form always loads and the date error appears when Submit is clicked. The Web Dynpro blocked the whole screen at fetch.
7. Nothing in the BL commits; the DPC commits once per request (`COMMIT WORK AND WAIT`) and rolls back on a business error.

## Findings to act on (not changed)

- **Identity is claimed by the caller.** The gateway signs in with a technical user, so `Email` in each request is the only
  identity. Anyone who can call the gateway can pass an admin's email. Same class of issue as Gate Entry F1/F2. Real fix: the
  gateway forwards the hub JWT and the DPC verifies it, or the gateway signs in as the person.
- EDS data checked 2026-11-18: active year 2025, slabs and limits exist for 2025 (for example employee 90000060, limit 400 LAKHS, 14 slabs).
  The request number still uses the calendar year (2026...) while the policy year is the active year (2025): same as the Web Dynpro.
- Request number (`ZLIFE_REQNO`) is `MAX(reqno)+1`. `save_policy` now takes an exclusive enqueue (`ENQUEUE_E_TABLE`, ZLIFE_EMP/SAVE) before reading anything, released by the caller's COMMIT/ROLLBACK, so two simultaneous saves can no longer collide or both pass the duplicate-employee check. **The DPC must COMMIT (or ROLLBACK) after every `save_policy`** or the lock is held until the session ends. A save that cannot get the lock answers "Another request is being saved right now. Please try again in a moment."
- The cut-off date row (`ZMEDI_DATE` slno 2) is 2025-08-31, already past, so on DEV only editors/admins (or employees in their first 30 days) can apply.
- The dry-run switch (`X-Life-Simulate`) never commits; decide whether production hubs should block it.
- The Web Dynpro saved through `ZLIFE_UPDATE_TABS` in update task; the BL does the same three statements (MODIFY emp, DELETE family, MODIFY family) directly and the DPC commits.

## Test evidence (EDS, over HTTPS, 2026-11-18)

- `$metadata` 200: 8 entity sets (incl. CommandSet), 2 associations, no function imports.
- ProfileSet: admin (sourav.das) = ADMIN; unknown mail = USER, EmpId 00000000.
- EmployeeSet 90000060 as admin: HR data, limit 400 LAKHS, year 2025. As an ordinary user for someone else: 403 "You can see only your own employee ID."
- SumOptionSet follows the limit (14 slabs, premium/GST/total). PolicySet list with `$expand=Nominees`; `AllRows` as non-admin: 403.
- Submit (dry run): validations answered with the legacy texts: share not 100%, duplicate employee, mobile not 10 digits, sum not allowed, limits row invalid, not authorised.
- One real cycle on EDS (employee 90000060, nominees marked "ZZ TEST"): submit -> request 2026000001, change to 3 nominees, delete (soft). The row stays
  in ZLIFE_EMP/ZLIFE_FAMILY with DEL_FLAG X, like the other test rows there. The save lock was released after each call (the next call got through).
- 13/13 ABAP Unit tests (read-only) still pass.

## Test evidence through the Azure gateway (NGD, 2026-11-18)

- ProfileSet, EmployeeSet, SumOptionSet (with `$orderby`), PolicySet with `$expand=Nominees`: 200, same data as on EDS.
- Entity-create POSTs pass: a failing validation returns the legacy text (400); submit, change and delete (`CommandSet`) worked in one cycle with
  employee 90000060 (test nominees "ZZ TEST"); the test policies 2026000002 to 2026000004 are soft-deleted.
- **Function-import POSTs fail on the hub with an empty-message 404** (also Mediclaim's `DeletePolicy`; GET answers 405, so the hub knows the operation).
  Basis can look up the transaction id in `/IWFND/ERROR_LOG` on NGD (for example 86E79F2A03010060E006AD53A2B9B175). Worked around with `CommandSet`.
- `GET .../$metadata` through the Azure gateway answers 400 "System query options ... not allowed" (gateway quirk, same for Mediclaim); not needed by the app.
- Not tested through a browser yet.
