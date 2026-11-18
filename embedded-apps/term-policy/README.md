# Term Life Policy (Emami Apps)

Next.js 14 static export, served by the hub under `/apps/term-policy/` (`next.config.js`: `output: 'export'`, `basePath`, `trailingSlash`;
`npm run build` = `next build && node scripts/rename-export.js`, output moved to `dist/`).

Rebuild of the Term Life part of the SAP Web Dynpro **ZWD_MEDICAIM_NOMINEE** (package ZEMAMI_MEDICLAIM). Every rule, message and premium
calculation lives in SAP (`ZCL_LIFE_INS_UTILS`) behind the OData V2 service **ZLIFE_INS_SRV**; the app has no mock data, no localStorage data
and no mock mode. Same pattern as Mediclaim.

## SAP side

Built on EDS without SEGW (code-based model and data provider, like Mediclaim) and registered on the gateway hub NGD by Basis. Tested over HTTP on EDS and
through the Azure gateway (see `sap/README.md`). Delete and mail are entity creates on `CommandSet`, because the hub rejects function-import POSTs.
If the service does not answer, the app shows **"Term Life service not available (SAP)"** with a Try again button.

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

| Route | Tab (Web Dynpro equivalent) | Roles |
|---|---|---|
| `/` | **Create / Change**: employee fetch (own number automatic; EDITOR/ADMIN may type another), sum assured by limit, premium/GST, mobile, personal mail, nominees (max 6, shares = 100%), submit or change, delete | everyone; delete = ADMIN |
| `/display/` | **Display**: look up a request with its nominees. EDITOR/ADMIN search any employee; a USER sees the requests they created | everyone |
| `/report/` | **Insurance Report**: all policies of the year, search, Excel download, mail, delete | ADMIN |
| `/limits/` | **Insurance Limits**: upload each employee's cap (.xlsx) | ADMIN |
| `/mass/` | **Mass Upload**: one policy per Excel row, per-row results | ADMIN |

All five tabs are shown to everyone, like the Web Dynpro; the HR-only ones show "Not authorised" to others, and SAP refuses the calls anyway.
A user who is not in ZMEDI_AUTH_USERS (flag E or R) is a USER: after the cut-off date in ZMEDI_DATE (slno 2) SAP answers "You have exceeded the permissible date limit".

## Files

`src/lib/config.ts` constants, `termPolicyApi.ts` typed OData client (one function per call, `isServiceDown`), `validate.ts` client-side
copies of the Web Dynpro checks, `exportExcel.ts` download/templates/parsers, `src/context/AppContext.tsx` loads `ProfileSet`,
`src/components/Shell.tsx` shows `ServiceUnavailable` when it cannot, `AdminGuard` gates the HR tabs.
