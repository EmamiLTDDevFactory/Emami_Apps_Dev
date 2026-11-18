# Mediclaim (Emami Apps)

Next.js 14 static export, served by the hub under `/apps/mediclaim/` (`next.config.js`: `output: 'export'`, `basePath`, `trailingSlash`;
`npm run build` = `next build && node scripts/rename-export.js`, output moved to `dist/`).

This is the rebuild of the SAP Web Dynpro application **ZWD_MEDICAIM** (package ZEMAMI_MEDICLAIM). Every rule, message and premium
calculation lives in SAP behind the OData V2 service **ZMEDICLAIM_SRV**; the app has no mock data, no localStorage data and no mock mode.

## Dependency: the SAP service is not registered yet

`ZMEDICLAIM_SRV` is being registered by someone else. Until it is reachable on the gateway the app shows
**"Mediclaim service not available (SAP)"** with a Try again button (same behaviour as gate-entry). Nothing else works without it.

## Config (one place: `src/lib/config.ts`)

| Constant | Value |
|---|---|
| `SAP_GATEWAY` | `https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api` (shared Azure SAP gateway, browser calls it directly, CSRF handled by the gateway) |
| `SAP_SYSTEM` | `NGD`. PRD switches this to `NWP` when the service exists there. |
| `SAP_SERVICE` | `ZMEDICLAIM_SRV` |

No credentials or secrets are used or stored anywhere in this app.

## Identity and roles

* The user is the hub login (`emami_apps_user_email` / session token in localStorage, `src/lib/hubEmailLogin.ts`). The gateway logs on to
  SAP with a technical user, so **every call carries `Email`** (lower case): in every list `$filter`, as the last key of every keyed read,
  as property `Email` on every create/update, as parameter `Email` of every function import (`src/lib/mediclaim.ts`).
* Roles come from SAP `ContextSet` (`IsAuthUser`, `IsHrAdmin`), not from the hub Admin role (`src/lib/hubAccessApi.ts` is kept but no longer used for access).
  The Admin menu shows only for `IsAuthUser` or `IsHrAdmin`; HR-only screens (cut-off, blocked employees, HR download, delete) need `IsHrAdmin`.
  SAP enforces the same rules again on every call.

## Screens

| Route | Screen | Roles |
|---|---|---|
| `/` | **My Mediclaim**: enrolment form (WD view MAIN) until the employee has a policy; then that policy read-only with **Add Nominees** (change) when `CanChange`. Cut-off banner from `ContextSet.WindowOpen`. | everyone |
| `/last-year/` | **Last year application** (WD popup V_PREV_YR): previous-year policy via `EmployeeSet.PrevYearReqNo`, read-only | everyone |
| `/admin/` | **Policies**: search (Employee Id, Year), result list, policy detail with members, **Delete** (HR admin, current year only) | IsAuthUser / IsHrAdmin |
| `/admin/cutoff/` | **Cut-off date & insurer mail** (`SetCutOff`) | IsHrAdmin |
| `/admin/blocked/` | **Blocked employees**: list, add, delete, `.xlsx` upload (col A = PERNR, col B = name; header row skipped) | IsHrAdmin |
| `/admin/download/` | **HR download**: policies of a year (`PolicyReportSet`), location filter, preview, Excel export | IsHrAdmin |

Enrolment flow (SPEC.md 2.x): employee id + Fetch (own PERNR is fetched automatically; only auth users can type another one) ->
eligibility result verbatim from SAP (`Reason`) -> SAP employee (read-only data) or non-SAP employee (manual fields, validated in the legacy order)
-> sum insured -> top-up (checkbox enabled only for the sum insured with `TopUpAllowed`, i.e. 5,00,000) -> nominees (max 6 rows, Father/Mother/Spouse
once, max 3 children, child age > 30 rejected, gender derived from relation, previous-year family carried forward) -> **live premium
through `QuoteSet`** after every change (base, top-up, total, employee and employer share, per-member base premium and employee share)
-> Submit validations 1-13 with the legacy texts (`src/lib/rules.ts`) -> `PolicySet` deep POST -> request number shown.
Premiums are never sent as authoritative: the client only displays what SAP returns, SAP recomputes on submit.

## OData usage (CONTRACT.md)

| Purpose | Call |
|---|---|
| Context | `GET ContextSet(Email='..')` |
| Dropdowns | `GET SumInsuredSet?$filter=Email eq '..' and Year eq '..'`, `GET TopUpSet?...` |
| Employee fetch | `GET EmployeeSet(EmpId='..',Email='..')?$expand=PrevMembers` |
| Policy list / read | `GET PolicySet?$filter=Email eq '..' [and EmpId eq '..'] [and Year eq '..']`, `GET PolicySet(ReqNo='..',Email='..')?$expand=Members` |
| Quote | `POST QuoteSet` deep (`Members`), no persistence |
| Submit | `POST PolicySet` deep (`Members`) |
| Add Nominees | deep `POST /PolicySet` with the existing ReqNo: policy as read + all `Members` (SAP Gateway rejects PUT with inline Members) |
| Delete | function import `POST DeletePolicy?ReqNo='..'&Email='..'` |
| Cut-off | function import `POST SetCutOff?CutOffDate=datetime'..'&InsurerMail='..'&Email='..'` |
| Blocked | `GET/POST BlockedEmployeeSet`, `DELETE BlockedEmployeeSet(EmpId,Email)` (one row per POST) |
| HR download | `GET PolicyReportSet?$filter=Email eq '..' and Year eq '..'` |

ABAP flags are `'X'`/`''` strings, amounts `Edm.Decimal` strings, dates `/Date()/`. SAP business exceptions (`/IWBEP/CX_MGW_BUSI_EXCEPTION`)
are shown **verbatim** (`src/lib/sap.ts`, `SapError.message`). Excel/CSV cells go through `src/lib/spreadsheetSafe.ts` (formula-injection guard).

## Files

* `src/lib/config.ts` constants, `sap.ts` generic OData V2 client, `mediclaim.ts` one typed function per entity set / function import,
  `types.ts` entity types (SAP property names), `rules.ts` client-side Web Dynpro validations and messages, `format.ts`, `exportExcel.ts`,
  `blockedUpload.ts`, `spreadsheetSafe.ts`.
* `src/context/AppContext.tsx` loads `ContextSet`; `src/components/Shell.tsx` shows the service-unavailable state.

## Assumptions the SAP side should confirm

See the hand-over notes of the rebuild: Quote/Policy payload for non-SAP employees (self row + `NoEmpIdSap`/`NoEmpIdCtc` etc.), whether
`QuoteSet` returns the employee's own row (`Relation='1'`), `PolicySet` has no name property (list shows a Name column only if SAP sends `FullName`),
`PolicyReportSet` location filter is done on the screen (`LocText`), the change POST sends existing members with their `SlNo` plus new ones,
and DELETE on `BlockedEmployeeSet` needs a gateway route.
