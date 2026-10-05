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
  pins the deployed app to **NWP / production**. Local `npm run dev` / tests stay on NGD or the mock.
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
| CostLineSet | B costing (with `$expand=RateOptions` when supported) and C plant comparison (never expanded) |
| RateRowSet / FreightRowSet / RmPmRowSet | R / F / M views: fetched once per selection with `$top/$skip/$inlinecount`, then searched / sorted / totalled / paged in the browser (10 min cache) |
| PlantVHSet | plant picker (10 min cache) |
| MaterialVHSet | type-ahead `?search=<text>&$top=50`, min 2 characters |
| ConfigItemSet | GROUP_CURR, DEFAULT_PRIO, MAX_HEADS (10 min cache) |
| RateOptionSet | never called; only via `CostLineSet?…&$expand=RateOptions` |

### RateOptions expand capability (`lib/sap/capability.ts`)

`SAP_EXPAND_RATE_OPTIONS=off` never expands; `on` always expands and shows SAP's error; `auto`
(default) expands on the first mode B run, and if SAP answers RATEOPTIONSET / not implemented /
501 / navigation it retries **once** without `$expand`, remembers *unsupported* for this system for
15 minutes (no double runs meanwhile) and shows a warning. A successful expanded run sets
*supported*. Without rate options the drawer shows "Rate options are not available from SAP for
this system" and the re-pick / cheapest-source what-ifs are disabled; component rates, %, FX and
overrides keep working.

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
  `m` suffix, booleans, dates), normaliser, sap-message parsing, table paging, connection config guards, expand capability.
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
