# CAPEX Portal (Emami Apps) - build guide

Conversion of the SAPUI5 Fiori app `zcapexportal` to a static Next.js 15 / React 19 / Tailwind 3 app. Same screens, same flow,
same business rules; Emami Apps look. Reference (read-only, do not edit): `docs/fiori-source/`
(`webapp/` = every view/controller/formatter, `CAPEX_SESSION_LOG.md` = 132 numbered findings and the rule book, `README.md`,
`CAPEX_Rev3_Frontend_Tasks_for_BAS.md`, `class ZCL_ZCAPEX_PORTAL_DPC_EXT def.txt` = the ABAP service).
Live service shape: `docs/metadata.live.xml` (28 entity sets, 23 function imports), typed rows in `lib/entities.ts`.

## Architecture
- Browser -> hub backend `/api/me/capex/*` (backend/capex.js) -> Azure gateway -> SAP `ZCAPEX_PORTAL_SRV`. The browser never calls SAP.
  The backend adds the signed-in person's verified e-mail, so SAP resolves THAT person's role/plants/approver. No mock data, ever.
- `lib/api.ts`: `list<T>(path, {$filter,$select,$expand,$orderby,$top,$skip,count})`, `get<T>`, `fn(name, params)` (function imports),
  `create(set, body)` (deep insert allowed), `update("Set('key')", body)`, `odataKey`, `q()` (quote a $filter string), `isOk`.
  `lib/useData.ts`: `useList(path, options)` -> `{rows,count,loading,error,reload}`. `lib/session.tsx`: `useSession()` -> user, role, plants, isAdmin, config, cfgNum, fiscalYear.
- `components/ui.tsx`: Button, Card, PageHeader, Field/Input/Select/TextArea, Chip, Kpi, DataTable, Modal, Tabs, Spinner, ErrorBox, Empty, toasts (`useToast`), `useAction` (one-at-a-time async with SAP's message on failure).
- Static export: NO dynamic route segments. Detail screens are `/x/detail/?id=...` read with `useSearchParams()` inside a `<Suspense>`; link with `next/link`.
- Routes/screens: `lib/nav.ts` (each entry names its Fiori source view). Each screen = `app/<route>/page.tsx` (thin) + `components/<area>/*`.

## SAP/Fiori facts you must respect (from the session log - read the relevant entries before coding a screen)
- Status values can be truncated to 12 chars by SAP (`UNDER_EVALUA`): compare with prefix/`startsWith`, never full-word equality.
- ABAP flags are `'X'`/`''` strings; Edm.Decimal arrives as a string; Edm.DateTime as `/Date(ms)/`. `Active` on DoaRule is `''`-able: treat only `'X'`... check log #94 before relying on it.
- Fiscal year: `lib/format.ts fyDigits` (log #43). Plant authorization is enforced by SAP (rows simply do not come back) - still hide what would be empty.
- Function imports answer `{ Success, Message }`; show `Message` on failure; after any approve/reject/submit reload the affected lists (log #23: no stale rows).
- Double-submit guard on every async action button (use `useAction`), log #90. Bulk approve: optimistic pre-check, log #110/#111.
- Money rules live in `lib/rules.ts` + `lib/finance.ts` (ported from BaseController, unit-tested): budget block, DOA routing, quota caps, IRR/NPV/payback, SLA. Do not re-implement in screens.
- Documents (attachments, IC photos): the Azure proxy cannot carry a raw-body/Slug upload or `$value`. Screens must call `lib/documents.ts` (stub: `documentsEnabled()` false until the backend gets the base64 entity); when disabled, show the slots read-only with "Document upload is not available yet" and never block Save Draft; submit-time mandatory-document checks stay but are skipped while disabled.
- Maintenance (users + plants, DOA rules + chains, SLA/quota settings) is done in the app (`/admin/doa/`, `lib/admin.ts`). Visible only to the Admin role of the `capex-portal` app in Emami Apps (hub grant, not the SAP IsAdmin flag). Reads: `AdminDataSet?$filter=Kind eq 'USERS'|'DOA'` (JSON in one row); writes: function import `AdminSave(Kind, Json)`. The hub adds `zcpxadm=X` only for Admins; SAP (`zcl_capex_auth=>proxy_admin`) re-checks it with PROXY_SECRET. Config writes are allow-listed (SLA_*, QUOTA_*); rules are deactivated, not deleted.

## Rules for every agent
- Touch ONLY the files you own (listed in your brief) plus new files under `components/<your area>/` and `tests/<your area>*.test.ts`. Never edit `backend/`, `lib/api.ts`, `lib/session.tsx`, `lib/nav.ts`, `components/ui.tsx`, `components/Shell.tsx`, `app/layout.tsx`, `app/globals.css`, `docs/`. If you need a change there, say so in your final report.
- No `any` shortcuts that hide bugs; `npm run typecheck` and `npm test` must pass for your files. Do not run `npm install`, `npm run build`, or the dev server concurrently with other agents (it clobbers `out/`): use `npx tsc --noEmit` and `npx vitest run <your test files>` only.
- Parity first: read the Fiori view + controller (and the log entries that mention it) end to end, then reproduce every field, filter, button, validation message, and rule. List anything you did NOT port in your final report.
- Mobile: tables use `hideBelow` on secondary columns; forms stack under 640px.
- Never hard-code approver names/roles or caps: they come from SAP (DoaRuleSet/DoaChainSet/ConfigSet).
- Final report (short): files created, what is ported, what is deliberately not (and why), typecheck/test result, open questions.
