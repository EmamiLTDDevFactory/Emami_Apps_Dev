# BOM Cost Explorer & Simulator

Embedded app (hub tile **BOM Cost Explorer**, category CPD, `/apps/bom-cost-explorer`) on top of the
SAP ECC OData V2 service `ZMM_BOM_COST_SRV`. **SAP does all costing** (BOM explosion, rate
resolution, UoM and currency conversion). This app presents, compares, analyses and simulates.

## Architecture

One Next.js 14 codebase, two builds:

| Build | Command | What it is | Where it runs |
|---|---|---|---|
| UI | `npm run build` (BUILD_TARGET=static) | Static export to `dist/`, basePath `/apps/bom-cost-explorer`. The `.ts` Route Handlers and middleware are excluded via `pageExtensions` | Amplify, merged by `scripts/build-embedded-apps.js` like every embedded app |
| BFF | `npm run build:server` | Same app + Route Handlers (`src/app/api/**/route.ts`), `output: 'standalone'` | PM2 on 172.17.2.21 (like Rate Auction / TimeSheet) |

The browser never calls SAP. The UI calls the BFF; only the BFF holds the SAP credentials.

```
browser (hub origin) --Bearer--> BFF /api/*  --Basic auth, sap-client, $format=json--> ZMM_BOM_COST_SRV
```

**Sessions.** The hub has already authenticated the user. Its token (`emami_apps_session_token` in
same-origin localStorage) goes to `POST /api/session`. The BFF verifies it with
`HUB_AUTH_JWT_SECRET`, checks the Manage Access role for `bom-cost-explorer` (when
`HUB_ACCESS_API_BASE` is set), and resolves the allowed plants. It then issues a **NextAuth JWT**
(`next-auth/jwt`, `NEXTAUTH_SECRET`), which the UI sends as `Authorization: Bearer`. Every route
checks it with `getToken`. A cookie session is not used because the UI and the BFF run on
different origins.

**Plant authorisation.** Allowed plants come from a `plants` claim on the hub token or, failing
that, from `PLANT_ACCESS` (JSON: email or `*` -> plants, `*` = all). The plant picker shows only
those plants. Every request is rejected (403) if it names any other plant, and rows or rate options
for other plants are stripped from SAP's answer.

### BFF routes

- `POST /api/cost` `{ query, page? }`: the zod-validated query. The mode picks the entity set
  (`MODE_TO_ENTITY`: B -> `CostLineSet?$expand=RateOptions`, C -> `CostLineSet`, R -> `RateRowSet`,
  F -> `FreightRowSet`, M -> `RmPmRowSet`). Matnr and Werks are mandatory and checked before SAP is called.
  - B / C: every row (CostLineSet does not page) -> `{ rows, messages, ms }`
  - R / F / M: fetched from SAP once with `$top/$skip/$inlinecount` and cached 10 min per
    user + query. Search, sort, per-column filters, per-currency totals and paging are served from
    that cache (SAP isn't asked for `$orderby`).
- `GET /api/plants` (PlantVHSet), `GET /api/materials?q=` (MaterialVHSet `?search=`, min 2
  characters, max 100), `GET /api/config` (ConfigItemSet -> `{ GROUP_CURR, DEFAULT_PRIO, MAX_HEADS }`).
  All cached 10 min.
- `POST /api/session`, `GET /api/session` (whether demo sign-in is enabled).
- Rate limit per user (`RATE_LIMIT_COST_PER_MIN`, `RATE_LIMIT_LOOKUP_PER_MIN`), 120 s SAP timeout
  (`SAP_TIMEOUT_MS`), one retry on 5xx/timeout, cancel propagates to SAP (AbortController).
  `sap-message` is parsed into the warnings panel; OData errors show `error.message.value`.

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
| `$expand=RateOptions` | 501 `RATEOPTIONSET_GET_ENTITYSET not implemented` | Rate options are only ever read via `CostLineSet?$expand=RateOptions` (mode B), never via RateOptionSet or per-line navigation URLs. On an error matching `RATEOPTIONSET\|not implemented\|501\|navigation` the BFF retries without `$expand`, returns `rateOptions: false` plus a warning, and the UI hides the rate-option comparison and disables the re-pick / cheapest-source what-ifs. Local repro: `MOCK_SAP_EXPAND_501=true`. **ABAP to do:** redefine `/IWBEP/IF_MGW_APPL_SRV_RUNTIME~GET_EXPANDED_ENTITYSET` (or implement `RATEOPTIONSET_GET_ENTITYSET`) in the DPC_EXT |
| `MaterialVHSet` `$top` | ignored by SAP | BFF caps at 100 |

`npm run check:metadata` fetches `<SAP_BASE_URL>/$metadata` with the BFF's credentials. It fails
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
npm run dev:mock               # http://localhost:3210  (MOCK_SAP=true, demo sign-in)
```

Mock mode uses the in-process mock SAP (`mock/sap.ts`), with the live entity set and property names:
string decimals, `/Date()/`, `__metadata`, two sample `sap-message` warnings on every response, OData errors (any material starting `FAIL`), and paging. Header `FG9000` is
a large kit (~2,100 lines per plant) for 10k-row testing. `npm run mock:sap` serves the same mock
over HTTP on :4599 (Basic auth when `MOCK_SAP_USER` is set). `mock/fixtures/` holds sample raw
responses (`npx tsx mock/dump-fixtures.ts` regenerates them).

To work on the static UI against a local BFF: run `npm run dev:mock` (BFF on :3210), then serve
`dist/` after `npm run build`. On localhost the static UI calls `http://localhost:3210`.

## Tests

- `npm test`: Vitest, covering the tree builder, leaf roll-ups, comparison pivot, priority
  re-selection, % what-ifs, sensitivity, scenario waterfall, OData filter builder (escaping,
  `m` suffix, booleans, dates), normaliser, sap-message parsing, and BFF table paging.
- `npm run test:e2e`: Playwright smoke test. It starts the HTTP mock SAP and the app with
  `MOCK_SAP=false`, so the real SAP client path (Basic auth, sap-client, headers) is exercised:
  hub-token sign-in, B tree/drawer/dashboard/simulator, C pivot, R paging, SAP error, cancel, and
  API 401/403.

## Deploying the BFF (172.17.2.21, PM2)

Same pattern as Rate Auction (see its README). Proposed ports and paths: **4120 dev / 4121 prod**,
nginx `/dev-api/bom-cost/` and `/api/bom-cost/` -> strip prefix, `proxy_read_timeout 150s` (SAP
runs can take up to 120 s). The static UI already calls these URLs (`src/lib/client/session.ts`).

```bash
npm ci && npm run build:server
cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/ 2>/dev/null || true
# .env with SAP_*, NEXTAUTH_SECRET, HUB_AUTH_JWT_SECRET (the matching hub's), PLANT_ACCESS, ALLOWED_ORIGINS
PORT=4121 HOSTNAME=127.0.0.1 pm2 start .next/standalone/server.js --name bom-cost-api
```

Run in fork mode as a single instance: the rate limiter and the R/F/M result cache are in-memory.

## Not in scope / open points

- SAP `$metadata` has not been checked against the real service yet. Run `npm run check:metadata`
  with real credentials first; property names in the spec may differ.
- The Manage Access app id is `bom-cost-explorer` (default User/Admin roles). Users need a role
  before the hub tile unlocks.
- Scenario definitions persist in localStorage (per user). Their SAP results go to IndexedDB,
  because 10k rows with rate options exceed localStorage's ~5 MB. Export/import JSON carries
  definitions only; results are re-run.
