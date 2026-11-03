# Material Master (mm-mdm)

Replacement for the SAP Web Dynpro app `/INOWITS/MM_CREATE_PROC`: request, review and approve material master records. One request is one
material at one plant, one sales organisation and one valuation area. The SAP side is an OData V2 service on the SAP Gateway,
`ZMM_MDM_SRV` (model: `odata/metadata.xml`, contract: `odata/service-contract.md`, ABAP: `sap-backend/`).

This is an **embedded app of Emami Apps**: a static Next.js export served by the hub at `/apps/mm-mdm/`. Hub tile "Material Master",
category Supply Chain, stage WIP.

## Run it

Demo mode (default). No SAP and no backend: the demo service and its demo rules run in the browser, data is kept in the tab's
`sessionStorage` (a reload keeps it, a new tab starts fresh).

    npm install
    npm run dev              # http://localhost:3320/apps/mm-mdm/   (MM_MODE=demo)
    npm run build            # static export to dist/ (what the hub's Amplify build does)

The header has a demo-user switch (initiator, reviewer level 1, approver level 2) and an EN / DE language switch.

Live mode (SAP through the hub backend). The build decides the mode:

    MM_MODE=live npm run build              # every call goes to <api>/me/mm-mdm
    MM_API_BASE=https://host/api/me/mm-mdm  # optional; default: audit-capa-api.emamiapps.in/dev-api/api on dev and localhost, /api on www

## How live mode works (and why the app is built this way)

The brief asked for Next.js route handlers (a BFF). Emami Apps embedded apps are **static exports**, which cannot have route handlers
(nor a dynamic `[transId]` path segment), so:

- The route handlers became a module of the hub backend: `backend/mmMdm.js` (routes and the screen-model to OData mapping) and
  `backend/mmMdmSap.js` (OData V2 client: CSRF, `$batch` change set, error mapping). It is mounted at `/api/me/mm-mdm`
  (nginx already forwards `/api/me/`). The browser never talks to SAP.
- Request pages are `/requests/view/?id=<TransId>` (query parameter, not a path segment).
- Every call needs the hub session (Bearer token) and a Material Master grant in Admin Center > Manage Access.
- Backend settings (`.env` of the hub backend): `MM_SAP_ODATA_BASE` (for example `https://<gateway>/api/NGQ/ZMM_MDM_SRV`),
  `MM_SAP_CLIENT` (optional), `MM_SAP_AUTH` = `gateway` (default) | `bearer` | `basic`, `MM_SAP_USER_HEADER` (default
  `X-Emami-User`), `MM_SAP_USER` / `MM_SAP_PASSWORD` (basic only).
- Deploying backend changes is manual on the PM2 box (see the hub's deploy notes); a git push does not update it.

### Authentication

All authentication towards SAP is in one function, `sapAuth` in `backend/mmMdmSap.js`.

- `gateway`: the Azure SAP gateway signs in itself (like the other apps); the hub user's e-mail is passed in the header named by
  `MM_SAP_USER_HEADER` so SAP can tell who is calling. The gateway uses one technical SAP user, so SAP cannot treat calls as the real
  SAP user in this mode.
- `bearer`: the real user reaches SAP with a token SAP accepts. The identity provider (OIDC or SAML) is not named yet: register a token
  provider with `setTokenProvider(async (caller) => token)`. Until then every call answers 503 "Bearer sign-in is not configured".
- `basic`: one fixed technical user, development only. SAP workflow and field control depend on the real user.

Tokens stay on the server and are never sent to the browser. Deviation from the brief: it asked for an HTTP-only cookie session; here
the browser uses the hub's own session (the hub controls how that is stored), and SAP-bound tokens stay in the backend.

## What the front end decides, and what it does not

No business rule is in the browser. SAP decides validation, field visibility, required and display-only flags, workflow and posting.

- Field behaviour comes from `GetFieldControl` (per tab an ordered list: shown, displayOnly, required, column L or R).
  `src/data/form_definition.json` is only the demo's field control and the dictionary metadata (types, lengths, fixed values, reference
  fields for units and currencies).
- Buttons follow the allowed actions returned for the request (edit, validate, saveDraft, submit, approve, sendBack, reject, forward,
  deleteDraft, attach, comment), never the status.
- The client never sends status, routing keys (`genType`, `genField`, `genField2`, `genField3`), initiator or work item id.
- All messages of a failed action are shown together, grouped by tab, each a button that goes to its field. Targets look like
  `Material/NTGEW` or `UnitOfMeasure[2]/MEINH` (grid rows count from 1).

## Languages (English, German)

Texts are in `src/i18n/en.json` and `src/i18n/de.json`, used through the typed `t('key')`
(a key that is not in `en.json` does not compile; `tests/i18n.test.ts` checks that both files have the same keys and placeholders).
The language comes from the header switch, is remembered in `localStorage`, and defaults to the browser language (`de*` = German).
To add a language: add `xx.json` with the same keys and register it in `src/i18n/translate.ts`.

Not translated, on purpose: **field and tab labels** (they come from the model / form definition as SAP delivers them) and **messages and
texts that SAP sends** (the demo service stands in for SAP and its texts are shown as received).

## Loading, empty and error states; optimistic UI

Every list and panel has a loading, an empty and an error state (requests, request view, value helps, history, grids, attachments,
comments). Optimistic UI is **not used for any workflow action** (save, validate, submit, approve, send back, reject, forward, delete):
SAP decides the result and the status, so the screen waits for SAP's answer. Nothing else is optimistic either.

## Layout and themes

Responsive down to tablet width (768 px): tabs scroll inside their own box and stay keyboard reachable, the editor collapses to one
column, grids scroll inside their box, the action bar stays sticky. Dark mode follows the system setting
(`prefers-color-scheme`); every colour is a CSS variable in `src/app/globals.css`, and the axe contrast rule is checked in both schemes.

## Tests

| Script | What |
| --- | --- |
| `npm run typecheck` | TypeScript strict |
| `npm test` | Vitest unit tests: demo service and its rules, api mapping, error mapping, units and currencies, value-help cache and cascade, grid rows, attachments, i18n |
| `npm run smoke` | the 15 original API checks, run against the demo service in memory |
| `npm run test:e2e` | Playwright, demo mode: create, validate with errors, fix, submit, review, approve, send back, resubmit, reject, delete draft, role switch, attachments and comments, language switch, tablet width. Fails on any console error |
| `npm run test:a11y` | axe-core on every page, every tab of a request (including grid tabs), messages, combobox and dialogs, in light and dark mode; fails on serious or critical violations |

The e2e tests run against a production static export (`next build`, served by `tests/e2e/serve.mjs`) in parallel workers, because each
browser context has its own demo data. Backend tests: `cd ../../backend && npm test` (mapping, batch parsing, authentication modes).

Playwright (`@playwright/test`) and `axe-core` are **dev dependencies only**: they run tests and never reach the shipped bundle. No
runtime dependency was added beyond Next and React.

## Odata contract changes

Added to `odata/metadata.xml` and `odata/service-contract.md` (SAP must implement them; nothing here is invented SAP behaviour):

- `AttachmentSet` (media resource: upload, download, delete; 10 MB limit and an allowed-types list in the backend) and `CommentSet`
  (read, add), both reachable from `RequestSet`, and the flags `CanAttach` and `CanComment` on `RequestSet` (derived by SAP for the calling user).

## What SAP must implement

- The whole service `ZMM_MDM_SRV` (`sap-backend/` holds ABAP written **without access to SAP**; nothing has been compiled, activated or run).
- Attachments and comments (above), including `CanAttach` and `CanComment`.
- For the change (MX) and extension (ME) flows, not built in the front end: `SearchMaterial`, `StartChange`, `GetCurrentValues`, and an
  `AppId` parameter on `GetFieldControl` (see the last section of `odata/service-contract.md`). The editor itself is already generic
  over `AppId`.

## Verified and not verified

Verified (automated): type check, unit tests, the demo workflow end to end in a real browser (Chromium), accessibility of every page in
light and dark mode, tablet width, console errors, the hub backend mapping and authentication functions with unit tests.

Not verified: **live mode has never run against a real Gateway** (the SAP service does not exist yet, the ABAP was never compiled), the
backend routes have not been called with a real hub session, the German texts have not been reviewed by a native speaker, and the app
was not tested on other browsers than Chromium. Browser Back inside the app gets no unsaved-changes warning (the Next.js app router
does not let an app intercept it).

## Structure

    src/app/                 pages (home, requests, requests/new, requests/view)
    src/components/          editor, form, grid, combobox, messages, timeline, attachments and comments
    src/lib/                 types, api (demo and live behind one interface), messages, units, value help, grid rows
    src/lib/demo/            demo service and demo rules (browser)
    src/i18n/                texts (en, de) and t()
    src/data/                form definition (dictionary metadata and the demo's field control)
    odata/                   metadata.xml and the service contract
    sap-backend/             ABAP of the Gateway service (not compiled)
    tests/                   vitest unit tests; tests/e2e Playwright and axe
    ../../backend/mmMdm*.js  the hub backend module (routes, OData client, field map)
    scripts/                 build helpers (rename-export, regenerate backend/mmMdmFields.json)
