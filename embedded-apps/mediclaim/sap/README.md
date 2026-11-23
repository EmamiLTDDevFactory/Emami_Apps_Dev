# Mediclaim - SAP side (ZMEDICLAIM_SRV)

Sources as they are on EDS (package ZEMAMI_MEDICLAIM). Mediclaim and Term Life share the master data class `ZCL_INS_MAINT`.

| File | Object |
|---|---|
| `zcl_medi_bl.abap`, `zcx_medi_error.abap` | business logic and its exception (unchanged by the maintenance work) |
| `zcl_zmediclaim_mpc.abap` | code-based model; the maintenance entities were added by `maint_mpc.py` |
| `zcl_zmediclaim_dpc.abap` | data provider; `MaintRowSet` (GET) and `MaintCmdSet` (deep POST) added, HR admins only |
| `zcl_ins_maint.abap` | **new**, shared with Term Life: list / save / replace / delete / copy of the master tables |
| `maint_mpc.py` | adds `MaintRow` / `MaintCmd` to an MPC source (also used by `term-policy/sap/gen/gen.py`) |

Transports: `ZCL_ZMEDICLAIM_MPC/DPC` in EDSK9B0EKD, `ZCL_INS_MAINT` in EDSK9B0EKB (the Term Life request). Release both, import into NGQ/NWP, and
register nothing new (same services). After an import the gateway hub caches `$metadata`: clear it (`/IWFND/CACHE_CLEANUP`) if `MaintRowSet` answers
"Resource not found for the segment".

## Maintenance from the app (what used to be SE16 / SM30)

Two generic entities serve every table, so a new table needs only a branch in `ZCL_INS_MAINT`:

* `GET MaintRowSet?$filter=Email eq '..' and Table eq '..' [and Year eq '..']` - rows as Key1..3 / Year / Val1..5
* `POST MaintCmdSet` deep `{Email, Table, Year, ToYear, Action, Rows[]}` with Action `SAVE` (add or change), `REPLACE` (the rows become the whole table or year),
  `DELETE`, `COPY` (Year to ToYear, fails if the target has rows). Writes are creates, not PUT/DELETE, because the gateway passes only GET and POST.
  Do not send `$format=json` on this POST (SAP answers 400).

| Table code | SAP table | Rows (Key / Val) | Screen |
|---|---|---|---|
| BASE | ZBASE_PREMIUM | Key1 from age, Key2 to age, Key3 sum insured, Val1 premium; by year | Premium rates |
| TOPUP | ZTOP_PREMIUM | Key1 top-up amount, Val1 premium; by year | Premium rates |
| MPERIOD | ZMEDI_PERIOD | Key1 year, Val1 `X` = active (exactly one) | Policy periods |
| AUTH | ZMEDI_AUTH_USERS | Key1 serial (assigned if empty), Val1 user id, Val2 `R` / `E` (at least one R must remain) | Authorised users |
| EXCL | ZMEDI_EXCL_EMP | Key1 employee number, Val1 name | Blocked employees (delete and upload) |
| DATE | ZMEDI_DATE | Key1 row (1 Mediclaim, 2 Term Life), Val1 cut-off date, Val2 mail | Cut-off date |
| POLICY | (BL `delete_policy`) | Key1 request number; Action DELETE | Policies - Delete |
| SLAB, LPERIOD, LIMIT | ZLIFE_AMT, ZLIFE_PERIOD, ZLIFE_INS_LIMIT | Term Life, see `term-policy/sap/README.md` | |

Only a user with flag `R` in ZMEDI_AUTH_USERS can read or change these (403 "You are not authorized to maintain the master data."). Every write
runs in one LUW: any validation error rolls the whole call back. `?simulate=X` (direct EDS calls only; the gateway drops the header) rolls back instead of committing.
Not exposed because nothing in the code reads them: ZBASE_CATEGORY, ZMEDI_EMPBLOCK, ZMEDI_EMP_SAL.

## Hub Admin access
A user who is Admin for the app in the hub (Manage Access) may do every maintenance, with or without a role R row in
ZMEDI_AUTH_USERS. The app sends such a user's email as `<email>~HUB` on MaintRowSet / MaintCmdSet; `maint_admin` in the DPC
strips the suffix and skips the ZMEDI_AUTH_USERS check (policy delete passes `iv_hub_admin` to `ZCL_MEDI_BL=>DELETE_POLICY`).
SAP does not look the role up, it trusts the caller, as it already does for the Email on every call.
