# Term Policy – SAP side (ZLIFE_INS_SRV)

Source of truth: Web Dynpro component **ZWD_MEDICAIM_NOMINEE** (package ZEMAMI_MEDICLAIM, EDS). It serves Mediclaim and Term Life;
this app is the **Term Life** half (tables `ZLIFE_*`). Mediclaim is a separate app (`embedded-apps/mediclaim`).

## What exists on EDS

| Object | State |
|---|---|
| Tables ZLIFE_EMP, ZLIFE_FAMILY, ZLIFE_AMT, ZLIFE_PERIOD, ZLIFE_INS_LIMIT, ZMEDI_AUTH_USERS, ZMEDI_DATE | existing, unchanged |
| FMs ZLIFE_REQNO, ZLIFE_UPDATE_TABS (group ZFG_MEDI) | existing, unchanged (BL class does the same writes) |
| **Class ZCL_LIFE_INS_UTILS** (`zcl_life_ins_utils.abap`) | **deployed and active on EDS** (package ZEMAMI_MEDICLAIM, 2026-11-18), business logic of every Web Dynpro function |
| **Program ZLIFE_INS_UTILS_TEST** (`zlife_ins_utils_test.abap`) | deployed; 13 read-only ABAP Unit tests, all passing on EDS |
| Class ZCL_LIFE_INS_UTILS_T | empty leftover from a failed first attempt at hosting the tests; safe to delete |
| **SEGW project ZLIFE_INS + DPC_EXT** (`zcl_zlife_ins_dpc_ext.abap`) | **not created**: needs SEGW + /IWFND registration (Basis) |

## Web Dynpro function → BL method → OData

| Web Dynpro (view / action) | BL method | OData |
|---|---|---|
| user = SAP user, flag E/R in ZMEDI_AUTH_USERS | `get_role`, `user_from_email` | `GET ProfileSet('<email>')` |
| MAIN / FETCH_DET (HR read, cut-off date, company 1000, "already exists") | `get_employee` | `GET EmployeeSet(EmpId='…',Email='…')` |
| MAIN / BPOLICY (sum slabs ≤ limit, premium) | `get_sum_options` | `GET SumOptionSet?$filter=EmpId eq '…' and Email eq '…'` |
| MAIN / SUBMIT and CHANGE | `save_policy` | `POST PolicySet` (deep insert with `Nominees`; `Reqno` filled = change) |
| MAIN / DELETE (flag R, soft delete) | `delete_policy` | `POST DeletePolicy?Reqno='…'&Email='…'` |
| DISPLAY / SEARCH, V_DOWNLOAD | `search_policies` | `GET PolicySet?$filter=Email eq '…' [and EmpId eq '…'] [and AllRows eq 'X']&$expand=Nominees` |
| V_LIMIT_UP (save limits) | `save_limits` | `POST LimitUploadSet` (deep insert with `Rows`) |
| MASS_UPLOAD | `save_policy` per row | the app posts one `PolicySet` per Excel row |
| V_SEND_MAIL | `send_summary` | `POST SendSummary?Reqnos='a,b'&Email='…'` |

The Azure gateway passes only GET and POST (Gate Entry finding), so there is no PUT/DELETE: change and delete are POSTs.

## Entity model (SEGW)

All properties Edm.String unless noted. Keys in **bold**.

- **Profile**: **Email**, User, Role (USER/EDITOR/ADMIN), EmpId, ActiveYear
- **Employee**: **EmpId**, **Email**, FirstName, LastName, Dob (DateTime), Age (Int16), Gender, CompanyCode, CompanyName, Department, OrgUnit, Designation, Location, LocationText, CompanyMail, LimitText, Year
- **SumOption**: **Email**, **EmpId**, **Slno**, SumText, SumAmount (Decimal), Premium (Decimal), Gst (Decimal), Total (Decimal)
- **Policy**: **Reqno**, Email, Year, EmpId, EmployeeName, Designation, OrgUnit, LocationText, CompanyMail, PersonalMail, Contact, SumText, Premium, Gst, Total (Decimal), CreatedBy, ReqDat (DateTime); NavigationProperty `Nominees` → Nominee (1:n)
- **Nominee**: **Reqno**, **SlNo**, Name, Relation (3 Father, 4 Mother, 5 Spouse, 6 Son), PerShare
- **LimitUpload**: **Email**, Count (Int32); NavigationProperty `Rows` → LimitRow
- **LimitRow**: **EmpId**, Limit (e.g. `50 LAKHS`)
- **Result** (complex type returned by actions): Ok (Boolean)
- Function imports (POST): `DeletePolicy(Reqno, Email)`, `SendSummary(Reqnos, Email)`, both returning Result

Basis steps: create SEGW project, define the above, generate, paste `zcl_zlife_ins_dpc_ext.abap` over the DPC_EXT, register
`ZLIFE_INS_SRV` in /IWFND/MAINT_SERVICE, expose it on the Azure gateway for system EDS, then check `SAP_SYSTEM` in
`src/lib/config.ts` (EDS by default; or build with `NEXT_PUBLIC_TERM_POLICY_SAP_SYSTEM`). The app has no mock: until the service answers it
shows "Term Life service not available (SAP)" with a Try again button, like Mediclaim.

## Differences from the Web Dynpro (deliberate)

1. HR data, premium, GST and total are **re-derived on the server**; the Web Dynpro trusted the screen values.
2. Age is taken at **1 August of the current year**; the Web Dynpro had `20260801` hard-coded (and a `20250801` comment).
3. Change mode read `created_by` from **ZMEDI_EMP** (the Mediclaim table); fixed to ZLIFE_EMP.
4. Nominee relation is validated (3–6), share must be a whole number, max 6 nominees, shares = 100%.
5. An ordinary user can apply only for **their own** employee number; EDITOR/ADMIN apply for anyone.
   Identity from the hub mail: SAP user = USR21+ADR6 owner of that address (mail local parts are not user names: user
   `sandip.das`, mail `SANDIPD@...`); employee number = PA0105 subtype 0010 (stored UPPER case) restricted to employees active
   in PA0000 (stat2 3). If one address still maps to several active employees, nothing is returned and the person is told to contact HR.
6. Nothing in the BL commits; the DPC commits once per request (`COMMIT WORK AND WAIT`) and rolls back on a business error.

## Findings to act on (not changed)

- **Identity is claimed by the caller.** The gateway signs in with a technical user, so `Email` in each request is the only
  identity. Anyone who can call the gateway can pass an admin's email. Same class of issue as Gate Entry F1/F2. Real fix: the
  gateway forwards the hub JWT and the DPC verifies it, or the gateway signs in as the person.
- **DEV is not configured for the current year**: `ZLIFE_PERIOD` has only year 2018 active and `ZLIFE_AMT` has no 2018 slabs, so
  nobody gets a sum-assured list until HR maintains the active period, slabs (`ZLIFE_AMT`) and limits (`ZLIFE_INS_LIMIT`).
- Request number (`ZLIFE_REQNO`) is `MAX(reqno)+1`. `save_policy` now takes an exclusive enqueue (`ENQUEUE_E_TABLE`, ZLIFE_EMP/SAVE) before reading anything, released by the caller's COMMIT/ROLLBACK, so two simultaneous saves can no longer collide or both pass the duplicate-employee check. **The DPC must COMMIT (or ROLLBACK) after every `save_policy`** or the lock is held until the session ends. A save that cannot get the lock answers "Another request is being saved right now. Please try again in a moment."
- The cut-off date row (`ZMEDI_DATE` slno 2) is 2025-08-31, already past, so on DEV only editors can apply.
- The Web Dynpro saved through `ZLIFE_UPDATE_TABS` in update task; the BL does the same three statements (MODIFY emp, DELETE family, MODIFY family) directly and the DPC commits.
