# SAP MDM Portal – Material Master (create MC, change MX, extension ME)

Next.js 14 + React 18 + TypeScript front end (static export, served by the hub under `/apps/mm-mdm/`) for the Material Master
MDM replacement of `/INOWITS/MM_CREATE_PROC`. **Every Material master screen runs on live SAP data** through the hub backend
(`backend/mmMdm.js`, mounted at `<api>/me/mm-mdm`). There is no demo data, no seed requests, no mock users and nothing is kept in the
browser: when the backend or SAP cannot be reached the screen shows the error and a *Try again* button, never invented data.

```bash
npm install
npm run dev        # http://localhost:3320/apps/mm-mdm/ (needs a hub sign-in token in localStorage: emami_apps_session_token)
npm run build      # static export to dist/ (what the hub build merges in at /apps/mm-mdm/)
npm test           # unit tests of the mapping layer (lib/mmMap.ts), node's test runner via tsc
node e2e/material.e2e.cjs   # browser test (Playwright from ../bom-cost-explorer), backend mocked with page.route; run `npx next dev -p 3320` first
```

API root: `https://audit-capa-api.emamiapps.in/dev-api/api` on hosts containing `dev` and on localhost, else `.../api`.
Auth: `Authorization: Bearer <hub token>` (localStorage `emami_apps_session_token`), same as the product hierarchy screens.

## Who does what

* **The logged-on hub user is the SAP user** (`GET /session`: user, display name, department, roles). There is no user switching.
* **SAP decides everything**: which fields a user sees, may change or must fill (`GET /fieldcontrol?type=<material type>&level=<L0..L7>`),
  which actions are allowed (`allowed` of the request: edit, validate, saveDraft, submit, approve, sendBack, reject, forward,
  deleteDraft), validation messages, routing and posting. The front end recomputes none of it.
* Status codes (SAP): 00 saved as draft, 01 requested, 02 in progress, 03 completed, 04 sent back, 05 rejected.
* Level `L0` is the initiator, `L1`..`L7` the approval levels.

## Screens

| Route | What | Backend |
| --- | --- | --- |
| `/master/material` | Home: *Waiting for me* (SAP inbox) and *My requests* with status chips | `GET /requests?scope=inbox`, `?scope=mine` |
| `/master/material/new` | Start a create request: key data, org data, view selection, group-based description builder, duplicate check, save as draft or submit | `POST /requests`, `PUT /requests/:id`, `POST …/submit`, `POST /duplicates`, `POST /description`, `GET /valuehelp/<NAME>` |
| `/master/material/requests` | Search by scope, status, material type, text | `GET /requests?scope&materialType&text` |
| `/master/material/requests/view?id=` | Request page (create, change, extension): key data, tabs of the material views, history, attachments, comments; save, check, submit, approve, send back, reject, forward, delete draft | `GET/PUT/DELETE /requests/:id`, `POST …/{validate,submit,approve,sendback,reject,forward}`, `GET /fieldcontrol`, attachments and comments routes |
| `/master/material/data` | Posted materials with *Change* and *Extend* (disabled while a change or extension request is open: `busy`) | `GET /posted` |
| `/master/material/change?matnr=` | Choose plant, storage location and sales area from what the material has, start MX | `GET /posted/:matnr/scope`, `POST /change` |
| `/master/material/extend?matnr=` | Extend to a new plant / storage location (P), sales area (S) or valuation type (V), start ME | `GET /posted/:matnr/scope`, `POST /extension` |
| `/master/hierarchy` | Product Hierarchy & CRS set-up (ZMDM_PH), unchanged: its own live path in `lib/phApi.ts` | `/me/mm-mdm-ph` |

For MX and ME the request page names the material and shows the org level being changed or extended (plant, storage location, sales
area, valuation type).

## Structure

```
lib/mmApi.ts            HTTP client and types of /me/mm-mdm (errors keep SAP's text and message list)
lib/mmMap.ts            mapping layer: flat screen model (MaterialData) <-> backend data (single / multi / views), messages -> fields,
                        field control index. Pure and unit-tested (lib/mmMap.test.ts)
lib/mmCatalogue.ts      fields known per entity (fallback only; the keys of the rows SAP returns and the field control add to it)
lib/mmValueHelp.ts      live value helps: cached per name + parameters, lazy, errors kept per list
lib/store.tsx           session user, inbox (waiting count), status-bar message. No request data, no storage
lib/keyFields.ts        key-data fields (labels, SAP names, which value help each uses)
lib/materialViews.ts    the 24 material views (tabs): blocks and fields with their SAP names. No value lists, no defaults
lib/fieldConfig.ts      lookups and display helpers
lib/workflowConfig.ts   status texts (SAP's 00..05), request types
lib/valueHelps.ts       product hierarchy helpers (live only, via lib/phApi.ts)
components/material/    Home, New request, Request page, Search, Browser, Change / Extension start, key field, field widgets
e2e/material.e2e.cjs    Playwright test (home, new request, edit + save + submit, approver, posted -> change, extension, 500 state)
```

## How the mapping works (lib/mmMap.ts)

* Backend model: `data.single[Entity][ABAP_FIELD]`, `data.multi[Entity] = rows`, `data.views` = selected SAP view names.
* The entity of a field follows its SAP name and the table of its view (MARA → Material, MARC → Plant, MARD → StorageLocation,
  MBEW → Valuation, MVKE → SalesOrg, MLGN → WarehouseData, MLGT → StorageTypeData, MPOP → ForecastParameter, MAKT → Description,
  QMAT → InspectionType). A field binds **only to an entity that has it** (keys of the returned rows, items of the field control,
  `lib/mmCatalogue.ts`). Fields no entity has are **not shown and never written**; the request page says how many there are.
* Table fields hold JSON arrays: units of measure ↔ `UnitOfMeasure` (MEINH, UMREZ, UMREN), tax ↔ `SalesTaxData` (ALAND, TATYP, TAXKD;
  rows are SAP's, only the class changes), descriptions ↔ the single `Description` row, long texts ↔ `LongText` rows by FID
  (GRUN, PRUE, IVER, 0001, LTXT = key-data long text).
* A second app field on the same SAP column (NRFHG and NRFHG_P) is a read-only mirror.
* Writes send only what changed (plus all view flags, which the backend rewrites on every write), keep SAP's value types (number,
  boolean, string, date as `YYYY-MM-DD` or null).
* SAP messages (`{code, message, severity, target}`) are mapped to the screen field named in `target`.

## Open items

1. **Scopes of `GET /requests`**: the app uses `inbox` (waiting for me), `mine` (raised by me) and none (all). Only `inbox` was confirmed.
2. **Value help names and parameters** for dependent lists (`LGORT?werks=`, `VTWEG?vkorg=`, `LGNUM?werks=`, `LGTYP?lgnum=`, `SGRP?mainGroup=`,
   `SSGR?mainGroup=&subGroup=`) and for select fields (a list named like the field's SAP name, e.g. `DISMM`) are not confirmed; a field
   whose list SAP does not have falls back to free entry.
3. **Classification** (KSSK / AUSP) and the *Initiator comments* field are not mapped: the layout of `ClassCharacteristic` rows is unknown.
4. **Posted material search** filters SAP by exact description (`Maktx eq`) and material type; the list also has a local filter.
5. **Forward** takes the SAP user id of the person to ask (there is no user lookup route).
6. The backend's `submit` does not take the submit comment (the dialog sends it; SAP ignores it today).
