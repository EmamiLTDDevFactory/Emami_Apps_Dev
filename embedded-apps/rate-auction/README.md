# Rate Auction

Live reverse auction for material and freight rates. Central Purchase starts an auction for a SAP
material, invites SAP vendors, and watches bids come in live with real names. Vendors see only an
alias, their own rank and the threshold. After closing, the admin awards (any bidder, with a reason
if not the lowest), creates the SAP info record (ME11) or contract (ME31K), and sends result mails.

Converted from the standalone `rate-auction-nextjs` prototype. Two parts:

| Part | What | Runs on |
|---|---|---|
| `/` (this folder) | Next.js static export, `basePath: /apps/rate-auction` | Amplify, merged by `scripts/build-embedded-apps.js` like every sibling app |
| `server/` | Express API: bid engine, anonymity masking, timer, SSE stream, SAP adapters (`mock` / `rfc` / `odata`) | 172.17.2.21 under PM2, same pattern as `timesheet-api` |

## Roles (from Manage Access)

The app has no login of its own. The frontend sends the hub's session token to
`POST /api/auth/hub-login`. The server checks the token against `HUB_AUTH_JWT_SECRET` and reads the
person's `rate-auction` role from Manage Access (`/access/me`):

| Manage Access role | In Rate Auction |
|---|---|
| **Admin** | Admin console: create, pause, extend, close, void bids, award, SAP documents, mails |
| **User** | Vendor room: bids as the invited SAP vendor whose vendor-master **email matches their Emami Apps email** |
| none | "You don't have access" screen |

Vendors are external, so they sign in to Emami Apps with the email magic link. A User who is not on
the running auction's vendor list sees "not invited" and cannot bid. In `SAP_MODE=mock` (a demo
auction, whose sample vendors have fake `.example` emails), the first two signed-in Users get the
two free demo seats instead.

## Local development

```
cd server && cp .env.example .env && npm install --omit=optional && npm run dev   # :4110, ALLOW_DEMO_LOGIN=true
npm install && npm run dev                                                       # http://localhost:3000/apps/rate-auction
```

With no hub session in localStorage, the page offers a demo "sign in as admin / vendor" picker. It
only appears when the server has `ALLOW_DEMO_LOGIN=true`.

Server checks: `npm run test:ecc` (40 checks, ECC client + SAP-table store against a fake ECC) and
`npm run test:sap` (18 checks, OData client).

## Deploying the server (manual, nothing in CI does this)

1. Copy `server/` (without `node_modules`/`.env`) to `/home/emamiadmin/apps/rate-auction-api-dev/`
   (and `rate-auction-api/` for prod) on 172.17.2.21.
2. Run `npm install --omit=optional` (add `node-rfc` plus the SAP NW RFC SDK only for `SAP_MODE=rfc`).
3. `.env`: `PORT` (dev 4110 / prod 4111), `CLIENT_URL`, a fresh `SESSION_JWT_SECRET`, and
   `HUB_AUTH_JWT_SECRET` matching **that environment's** hub login (dev and prod differ). Leave
   `ALLOW_DEMO_LOGIN` unset.
4. `pm2 start src/index.js --name rate-auction-api-dev` in **fork mode, one instance**. The live auction
   is held in process memory, so a second instance would run a different auction.
5. Set up nginx: `/dev-api/rate-auction/` → `localhost:4110`, `/api/rate-auction/` → `localhost:4111`, with
   `proxy_buffering off;` and a long `proxy_read_timeout` for the SSE stream (`/api/stream`). The
   frontend's URLs are in `src/lib/api.ts`.

With `STORE_MODE=memory` (the default), a restart loses the running auction. `STORE_MODE=ecc` saves
every change to the `ZAUC_*` tables (ABAP in `server/abap/`, never run in a SAP system yet).
