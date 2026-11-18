# Term Life Policy (Emami Apps)

Next.js 14 static export, served by the hub under `/apps/term-policy/` (`next.config.js`: `output: 'export'`, `basePath`, `trailingSlash`;
`npm run build` = `next build && node scripts/rename-export.js`, output moved to `dist/`).

Rebuild of the Term Life part of the SAP Web Dynpro **ZWD_MEDICAIM_NOMINEE** (package ZEMAMI_MEDICLAIM). Every rule, message and premium
calculation lives in SAP (`ZCL_LIFE_INS_UTILS`) behind the OData V2 service **ZLIFE_INS_SRV**; the app has no mock data, no localStorage data
and no mock mode. Same pattern as Mediclaim.

## Dependency: the service is not on the gateway hub yet

The whole SAP side is built on EDS without SEGW (code-based model and data provider, like Mediclaim): `ZCL_LIFE_INS_UTILS`, `ZCL_ZLIFE_INS_MPC`,
`ZCL_ZLIFE_INS_DPC`, service `ZLIFE_INS_SRV` registered locally on EDS, `$metadata` 200, 13 ABAP Unit tests pass, and a real submit/change/delete
cycle was run over HTTP (see `sap/README.md`). What is left is Basis registering `ZLIFE_INS_SRV` on the gateway hub **NGD** (alias to the EDS backend)
and the technical user's `S_SERVICE`. Until it answers, the app shows **"Term Life service not available (SAP)"** with a Try again button.

## Config (one place: `src/lib/config.ts`)

| Constant | Value |
|---|---|
| `SAP_GATEWAY` | shared Azure SAP gateway, browser calls it directly |
| `SAP_SYSTEM` | `NGD` (the Azure gateway only knows the hubs NGD/NGQ/NWP; the hub reaches the EDS backend by alias). PRD switches to `NWP`. Override at build time with `NEXT_PUBLIC_TERM_POLICY_SAP_SYSTEM` |
| `SAP_SERVICE` | `ZLIFE_INS_SRV` |

No credentials or secrets are used or stored in this app.

## Identity and roles

The user is the hub login. The gateway signs in to SAP with a technical user, so **every call carries the hub email**; SAP derives the SAP
user (USR21+ADR6), the employee number (PA0105) and the role from it. Roles come from SAP `ProfileSet.Role` (table ZMEDI_AUTH_USERS:
`R` = ADMIN, `E` = EDITOR, else USER), not from the hub Admin role. Weakness shared with Gate Entry: the email is spoofable by anyone who
can reach the gateway (see `sap/README.md`).

## Screens

| Route | Screen | Roles |
|---|---|---|
| `/` | **Apply / change**: employee fetch (own number automatic; EDITOR/ADMIN may type another), sum assured by limit, premium/GST, mobile, personal mail, nominees (max 6, shares = 100%), submit or change, delete | everyone; delete = ADMIN |
| `/admin/` | **Policies** (search, download, mail), **Insurance limits** (.xlsx), **Mass upload** (.xlsx, one save per row) | ADMIN |

## Files

`src/lib/config.ts` constants, `termPolicyApi.ts` typed OData client (one function per call, `isServiceDown`), `validate.ts` client-side
copies of the Web Dynpro checks, `exportExcel.ts` download/templates/parsers, `src/context/AppContext.tsx` loads `ProfileSet`,
`src/components/Shell.tsx` shows `ServiceUnavailable` when it cannot.
