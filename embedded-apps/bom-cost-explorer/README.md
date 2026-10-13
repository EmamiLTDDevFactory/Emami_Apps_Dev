# BOM Simulator

Embedded app (hub tile **BOM Simulator**, category CPD; folder, URL `/apps/bom-cost-explorer` and
Manage Access app id `bom-cost-explorer` kept unchanged) on top of the
SAP ECC OData V2 service `ZMM_BOM_COST_SRV`. **SAP does all costing** (BOM explosion, rate
resolution, UoM and currency conversion). This app presents, compares, analyses and simulates.

## Architecture

A static Next.js 14 export (`npm run build` -> `dist/`, basePath `/apps/bom-cost-explorer`), built
and merged by `scripts/build-embedded-apps.js` like every sibling embedded app. **There is no
server:** the browser calls the Azure SAP gateway directly, read-only (GET), exactly like PO
Deviation and Market Rate. Nothing goes through `audit-capa-api.emamiapps.in` for SAP data; the
only call there is the hub's Manage Access role lookup (`/access/me`, roles only, used to show the
admin tools), the same as po-followup / mediclaim / term-policy.

```
browser (hub origin) --GET--> ${SAP_GATEWAY_HOST}/api/${SAP_SYSTEM}/ZMM_BOM_COST_SRV/<EntitySet>
```

- **Deployed SAP system:** `next.config.mjs` (`DEPLOYED_SAP_SYSTEM`, applied to `next build` only)
  pins the deployed app: **NGQ / qa** in this repo (dev.emamiapps.in), **NWP / production** in the PRD copy
  (Emami_Apps_New, www.emamiapps.in). Local `npm run dev` / tests stay on NGD or the mock.
- **Connection config** (`src/lib/sap/config.ts`, zod-validated, readable error screen when wrong):
  gateway host, system (NGD / NGQ / NWP), service, APP_ENV, auth mode (`lib/sap/auth.ts`; browser:
  `none` only), optional sap-client, timeout, `SAP_EXPAND_RATE_OPTIONS`. See `.env.example`.
  Guards: NWP only with APP_ENV=production and vice versa; the header shows a `SAP <system> ·
  <env>` badge (red for NWP).
- **HTTP** (`lib/sap/client.ts`): encodeURIComponent for every value (%20), 120 s timeout,
  aborts / 502 / 504 mapped to a message about the Azure 230 s limit, one retry only for network
  errors or 502/503 (never after a timeout), OData error bodies, proxy HTML pages (first 300 chars)
  and `sap-message`; a log line per request with system, set, filter length, duration, rows and
  status (no values, no credentials).
- **Session**: the hub's same-origin localStorage (email + session token), like the sibling apps.
- **Admin** (Manage Access role "Admin"): `/admin/connection` diagnostics, and the "Re-test" of
  the RateOptions capability.

### Entity sets and when they are called (`lib/sap/entities.ts`)

| Set | Used for |
|---|---|
| CostLineSet | B costing and C plant comparison: **one call per Run, never `$expand`** |
| RateRowSet / FreightRowSet / RmPmRowSet | R / F / M views: fetched once per selection with `$top/$skip/$inlinecount`, then searched / sorted / totalled / paged in the browser (10 min cache) |
| PlantVHSet | plant picker (10 min cache) |
| MaterialVHSet | type-ahead `?search=<text>&$top=50`, min 2 characters |
| ConfigItemSet | GROUP_CURR, DEFAULT_PRIO, MAX_HEADS (10 min cache) |
| RateOptionSet / CostLineSet `$expand=RateOptions` | rate options, lazily (see below) |

### Rate options, loaded lazily (`lib/rates/`, 2026-10-13)

The main costing call never sends `$expand` and is never retried: one SAP run per **Run in SAP**
(the old "expand, and on 501 run again without it" is gone). Rate options are read only when
something needs them: the **Rate sources** tab, the row drawer's options table, or a re-pick /
cheapest-source what-if.

How a system delivers them is found out the first time and remembered for 15 minutes per SAP system
(browser memory + localStorage `rates:capability:<system>`; the app is a static export, there is no
server): `unknown -> direct | expand | unavailable`.

1. probe **direct**: `RateOptionSet?$filter=<costing filter>` (flat rows), using
   `NEXT_PUBLIC_RATES_PROBE_MATNR` / `NEXT_PUBLIC_RATES_PROBE_WERKS` with ExplQty 1, or the user's own
   query once when those are not set;
2. if that is "not there" (404 / 501 / not implemented / Resource not found for segment / unknown
   property), probe **expand**: `CostLineSet?<filter>&$select=Seqnr,Hwerks,Headmat,RateOptions&$expand=RateOptions`;
3. both "not there" -> **unavailable**. Network errors and 500s decide nothing.

Both shapes are normalised to the same flat rows and joined back to the cost lines on
`Seqnr|Hwerks|Headmat`; results are cached 5 minutes per query, and a query change or closing the tab
aborts the request. When unavailable there is no warning anywhere: the tab and the drawer show the
neutral note "Rate options are not available from SAP for this system", the re-pick choices are
hidden, and component rates, %, FX, manual overrides, SelSource and SrcCount keep working. Any SAP
message mentioning `RATEOPTIONSET` is kept out of the warnings panel. Re-test: in the tab, the drawer,
and on `/admin/connection` (which lists each probe with HTTP code, latency and SAP's raw message).
`SAP_EXPAND_RATE_OPTIONS=off` still switches rate options off entirely. `lib/sap/capability.ts` (the
old expand verdict) is no longer used by the costing call.

**Rate sources tab:** one block per source in the report colours (CONTRACT green, INFOREC yellow,
MARKT cyan, CONSUMP orange, MBEW red), column sets Compact / Report / Local currency, the option SAP
used in bold, the cheapest marked, Used vs Cheapest with the saving over leaf rows only; a rate of 0
is never the cheapest; virtualised rows; Excel export. Option total INR = `TotCostInr` from the direct
set, or (expand) `RatePcInr x ProdQty + line FrtPcInr x ProdQty`. RatePcInr is used rather than
`RatePc x FxInr` because it already includes the option-to-plant FX (`Fx`), so it stays right when the
option currency differs from the plant currency.

### Production Plan module (`lib/plan/`, `components/plan/`)

**Switch.** Off unless the build sets `PLAN_MODULE_ENABLED=true` (or `NEXT_PUBLIC_PLAN_MODULE_ENABLED=true`;
next.config.mjs maps the first onto the second). Off = no "Production plan" nav section, no plan
requests, and no plan code in the costing page's scripts (each plan route loads its screen with a
dynamic import only when the flag is on). This DEV repo turns it ON for deployed builds
(`DEPLOYED_PLAN_MODULE` in next.config.mjs, like the NGQ pin); the PRD copy (apps-new) keeps it off.
`PLAN_MODULE_ENABLED=false` at build time switches it off again. It needs the plan entity sets active on NGQ
(PRD: NWP).

| Env var | Meaning |
|---|---|
| `PLAN_MODULE_ENABLED` | `true` turns the Production Plan module on (build time) |
| `NEXT_PUBLIC_RATES_PROBE_MATNR` / `NEXT_PUBLIC_RATES_PROBE_WERKS` | material / plant of the tiny probe that decides how rate options are read (RateOptionSet or `$expand`) |

**Routes.** `/plan` (plans: PlanHeadSet with search, open, template download), `/plan/upload` (upload
wizard) and `/plan/view/?plan=<name>` (Entries | Breakup & cost | Requirement | Checks | WIP | Scenarios).
A static export cannot have a dynamic `/plan/[plan]` route, so the plan name is a query parameter.

**SAP path.** Reads and writes go browser -> Azure gateway (the gateway does the CSRF handshake, as for Gate
Entry's saves). All SAP names live in `lib/plan/fields.ts`; requests in `lib/plan/requests.ts` (Mode P never
sends `$expand`); reads in `lib/plan/client.ts`; writes in `lib/plan/write.ts` (`sapWrite` in
`lib/sap/client.ts`: no retry; the gateway's own "Cannot DELETE /" page becomes "gateway route missing", a
CSRF 403 says the proxy must forward x-csrf-token and cookies).

**Upload** (`lib/plan/upload.ts`, `UploadPage.tsx`): template A Material, B Plant, C Plan, D Country, E..P
Apr..Mar; header row detected and skipped; browser checks (required cells, plant 4 characters, months
numeric >= 0, duplicates, plan name <= 30, <= 2000 rows) with row numbers; rows grouped by plan, one
PlanUploadSet deep insert per plan; Merge (default) or Replace with a confirmation; Step 1 "Check with SAP"
(Dryrun true), Step 2 "Save" (only after the check passed); per-row status / message from SAP. Every upload
is logged in this browser (`plan:audit`; there is no app server for a central log).

**Role.** Uploading and editing need the hub Manage Access role **Planner** (or Admin) on BOM Simulator,
checked in the UI; SAP's authority check is the real gate. `backend/server.js` accepts the role.

**Entries.** Editable monthly grid, one PUT per changed row, delete per row. The Azure gateway does not
forward DELETE today: then the plan is saved again with Replace and every other row (check run first).

**Breakup & cost** (CostLineSet Mode P, one SAP call): tree Country > Plant > Plan material > components,
monthly quantity or cost (QtyMn x TotCostPcInr), total quantity with unit, rate source, rate / freight /
total per piece, total cost, budget landed, actual rate with variance. Header rows: plan quantity, cost
per FG piece and per 1000 (leaf rows only, blank when PlanQty is 0) and the BOM source (OWN, or "From
plant X (last production dd.mm.yyyy)" for LASTPROD). SAP warnings in a collapsible panel; SAP's 30 plan
rows per request limit is shown with "filter by plant or material". Sub-views: charts (monthly cost by rate
source and by material type, top components) and Rate sources (lazy rate options for the same filter).

**Requirement** (PlanSummarySet): shortage = requirement - (valuated stock + open PO), "only shortages";
units are SAP's base units, not converted. **Checks** (PlanCheckSet): grouped by plant and material, counts
per message, Excel. **WIP** (PlanWipSet): "Save as WIP plan" groups by component + plant + country, sums
the months, names it "WIP <plan>" and opens the upload wizard with those rows (check, then save).

**Scenarios** (`lib/plan/scenarios.ts`, stored in `plan:scenarios`): SAP what-ifs (fallback, material
types, rate priority, donor plant) run SAP again; client what-ifs (quantity x overall / per month, shift
between months, % by rate source, % on freight, FX shock per currency, rate per row) are marked
simulated. Baseline vs scenario per month, plan material and component.

**Excel** (button on the plan page): sheets Breakup, Requirement, Checks, WIP (what has been loaded) and
Parameters.

The mock (`mock/plan.ts`) seeds plans FY27-BASE (5 rows, including FG5001 in BD10, costed with plant 1000's
BOM: the LASTPROD example) and FY27-EXPORT, and answers every plan set, the deep insert (dry run / save,
merge / replace, per-row status), entry PUT / DELETE (`MOCK_SAP_NO_DELETE=true` behaves like today's
gateway), Mode P rate options (following `MOCK_SAP_RATES`) and the 30-rows limit.

### Connection diagnostics (`/admin/connection`)

Runs `$metadata`, `ConfigItemSet`, `PlantVHSet?$top=1` and a tiny `CostLineSet` (with and without
`$expand`) for a material / plant you enter; shows status, HTTP code and latency, whether a
`sap-message` header was readable, the active system and base URL, the entity sets in
`$metadata`, the RateOptions navigation and the first 10 CostLine properties - and the same name
check as `npm run check:metadata` (shared code: `lib/sap/metadataCheck.ts`), missing names in red.

Note: cross-origin, the browser can read `sap-message` only if the gateway sends
`Access-Control-Expose-Headers: sap-message`. The Azure gateway currently does not, so SAP
warnings from that header are not shown in the browser (diagnostics check e) reports it).

### SAP names: two files only

- **`src/lib/sap/entities.ts`**: entity set names (`CostLineSet`, `RateRowSet`, `FreightRowSet`,
  `RmPmRowSet`, `PlantVHSet`, `MaterialVHSet`, `ConfigItemSet`), `NAV_RATE_OPTIONS`, and
  `MODE_TO_ENTITY`. `RateOptions` is never called as a set of its own, only `$expand`ed on
  CostLineSet, and only for mode B.
- **`src/lib/sap/fields.ts`**: every property name (internal key -> [SAP name, kind]), the
  per-set types of the selection properties (`SELECTION_KIND_BY_SET`), and `OPTIONAL_PROPS`.

Checked against the live service on NGD (2026-10-04):

| What | Live service | Where handled |
|---|---|---|
| `HasChild` | spelled `Haschild` | fields.ts |
| RateRowSet `RowId` | `Rowid`, Edm.Int | fields.ts |
| Flags (`UseAsof`, `InclFrt`, `StdFrt`, `LatestOnly`, `InclBudget`, `InclCover`) | Edm.Boolean on CostLineSet; ABAP char `'X'`/`''` on Rate/Freight/RmPm row sets (`eq false` -> "Invalid parametertype") | fields.ts `SELECTION_KIND_BY_SET` |
| `BudgetYr` | NUMC 4, sent as `'2026'` | fields.ts |
| Coverage (`StockQty` … `CovH3`) | not in the service | fields.ts `OPTIONAL_PROPS` (show as 0 / not requested) |
| `$expand=RateOptions` | 501 `RATEOPTIONSET_GET_ENTITYSET not implemented` | Rate options are only ever read via `CostLineSet?$expand=RateOptions` (mode B), never via RateOptionSet or per-line navigation URLs. On an error matching `RATEOPTIONSET\|not implemented\|501\|navigation` the app retries once without `$expand` (auto mode), remembers *unsupported* for 15 min, adds a warning, and the UI hides the rate-option comparison and disables the re-pick / cheapest-source what-ifs. Local repro: `MOCK_SAP_EXPAND_501=true`. **ABAP to do:** redefine `/IWBEP/IF_MGW_APPL_SRV_RUNTIME~GET_EXPANDED_ENTITYSET` (or implement `RATEOPTIONSET_GET_ENTITYSET`) in the DPC_EXT |
| `MaterialVHSet` `$top` | ignored by SAP | the app caps at 50 |

`npm run check:metadata` fetches `<SAP_BASE_URL>/$metadata` (auth per `SAP_AUTH_MODE`). It fails
with a table if an entity set, the RateOptions navigation, or any property from fields.ts
(result fields plus the selection list) is missing, and suggests the closest name (ignoring case and
underscores). It also reports `sap:filterable` for every filter property. Exit codes: 0 OK,
1 names missing, 2 unreachable or wrong service name (Gateway `/IWFND/MED/170`).
Note: the Azure NGD proxy cannot serve `$metadata` (it appends `$format=json`), so run the
check against the Gateway itself over VPN:

```bash
SAP_BASE_URL=https://<gateway-host>:<port>/sap/opu/odata/sap/ZMM_BOM_COST_SRV \
SAP_CLIENT=<client> SAP_USER=<user> SAP_PASSWORD=<pw> npm run check:metadata   # add --all to list every property
```

### Calculation rules (enforced in `src/lib/cost`)

- Totals = sum of `TotCostInr` over **leaf** rows (`HasChild` blank), using decimal.js (never float).
  Parents carry SAP's own subtree roll-up and are shown in muted italics, never added.
- Tree: rows arrive depth-first; parent = last row at Level-1. It is built once per result as a
  flat pre-order list with contiguous row ranges, so every roll-up is one prefix-sum subtraction
  (10k+ rows, virtualised).
- Plant comparison: INR only; same component twice under a header is summed; min/max/cheapest only
  when >= 2 plants have a rated cost; header TOTAL = sum of leaf components.
- `SelSource` blank = NO RATE (freight-only cost). `CovH* = 999` = unlimited, excluded from
  low-coverage KPIs.
- **Simulation never replaces SAP figures.** Simulated values are violet, underlined and tagged
  `SIM`; SAP's value stays visible. FX shocks apply to the currency an amount is priced in
  (`SelCurr`/option `Curr` for the rate, `FrtCurr` for freight).

## Running locally

```bash
npm install
cp .env.example .env.local     # or just use mock mode:
npm run dev:mock               # http://localhost:3210/apps/bom-cost-explorer/ (mock SAP, local stand-in hub session)
```

Mock mode uses the in-process mock SAP (`mock/sap.ts`), with the live entity set and property names:
string decimals, `/Date()/`, `__metadata`, two sample `sap-message` warnings on every response, OData errors (any material starting `FAIL`), and paging. Header `FG9000` is
a large kit (~2,100 lines per plant) for 10k-row testing. `npm run mock:sap` serves the same mock
over HTTP on :4599 (Basic auth when `MOCK_SAP_USER` is set). `mock/fixtures/` holds sample raw
responses (`npx tsx mock/dump-fixtures.ts` regenerates them).

## Tests

- `npm test`: Vitest, covering the tree builder, leaf roll-ups, comparison pivot, priority
  re-selection, % what-ifs, sensitivity, scenario waterfall, OData filter builder (escaping,
  `m` suffix, booleans, dates), normaliser, sap-message parsing, table paging, connection config guards, expand capability,
  and `tests/unit/rates.test.ts`: the main call's frozen network baseline (snapshot), expand-fails /
  direct-works / only-expand-works, capability expiry and Re-test, normaliser, no `+` in URLs, Rate sources maths.
  The mock's rate behaviour is chosen with `MOCK_SAP_RATES=expand-fails|direct-works|only-expand-works`.
  `tests/unit/plan.test.ts`: plan flag off by default, Mode P filter / no `$expand` / no `+`, every plan set
  against the mock, LASTPROD, the 30-row limit, and the upload dry run / save.
- `npm run test:e2e`: Playwright smoke test. It starts the HTTP mock SAP and the app with
  `MOCK_SAP=false`, so the real SAP client path (Basic auth, sap-client, headers) is exercised:
  hub-token sign-in, B tree/drawer/dashboard/simulator, C pivot, R paging, SAP error, cancel, and
  API 401/403.

## Not in scope / open points

- SAP `$metadata` has not been checked against the real service yet. Run `npm run check:metadata`
  with real credentials first; property names in the spec may differ.
- The Manage Access app id is `bom-cost-explorer` (default User/Admin roles). Users need a role
  before the hub tile unlocks.
- Scenario definitions persist in localStorage (per user). Their SAP results go to IndexedDB,
  because 10k rows with rate options exceed localStorage's ~5 MB. Export/import JSON carries
  definitions only; results are re-run.
