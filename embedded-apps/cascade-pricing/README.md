# Cascade Pricing (ZMM_CASCADE_PRICING)

Export price cascade from the consumer price (RRP incl. VAT) in each market down to the billing price (CIF after A&P):
rate upload, pricing simulation, approval, SAP condition creation, and pricing KPIs. Static Next.js 15 export served
by the hub at `/apps/cascade-pricing/` (built by the repo root `scripts/build-embedded-apps.js`).

```
npm install
npm run dev        # http://localhost:3310/apps/cascade-pricing/ (DEV backend, live SAP NGD)
npm test           # excel parsing, formatting, the API client against a stubbed backend, KPIs
npm run build      # static export -> dist/
```

## Data
The browser never calls SAP. The app is a static export, so its "route handlers" live on the Emami Apps backend:
`backend/cascadePricing.js` (mounted at `<api>/me/cascade-pricing`: `GET /health`, `GET /cascade/{set}`, `POST /action`)
and `backend/cascadeSap.js` (`sapGet` / `sapAction`: Basic auth, sap-client, CSRF token + cookies, one retry on 403).
Every call needs the hub session and a Cascade Pricing grant. Server env (never committed):
`CASCADE_SAP_ODATA_BASE` (DEV: the Azure SAP gateway + `/api/NGD/ZMM_CASCADE_SRV_SRV`, which signs in and does CSRF),
optional `CASCADE_SAP_CLIENT`, `CASCADE_SAP_USER`, `CASCADE_SAP_PASSWORD` for a direct SAP URL.

SAP's OData names (`Matnr`, `CascadeDesc`, `ZiRrpPerPc`) are returned as the ABAP names the app uses (`MATNR`,
`CASCADE_DESC`, `ZI_RRP_PER_PC`). ActionRequestSet on NGD: `Requestid`, `Action`, `Payload` (JSON string), `Validfrom` /
`Validto` (Edm.DateTime, left out when blank), `Result` (JSON string with PROCESSED / FAILED / MESSAGE / DATA).

There is no mock or demo data: every build, including local `npm run dev`, reads SAP through the backend (local
development uses the DEV backend and needs a hub sign-in token in the browser).

## Tabs
1. Cascade Material Extraction · 2. Cascade Rate Upload · 3. Pricing Simulation · 4. Condition Creation ·
5. Review / Approval (the ABAP report's tabs, same order) · 6. Pricing KPIs.

## KPIs (`lib/kpis.ts`)
Price waterfall as % of RRP excl. VAT (retailer margin, distributor margin, A&P, damage/expiry, duty + C&F + LC charge,
net realisation), channel margin, A&P investment, landing cost on CIF, net price per dozen, change vs previous version,
price corridor across markets (parallel-trade risk), guardrail exceptions (`GUARDRAILS`), cascade coverage and
validity expiring soon. Simple averages: the contract carries no volumes.
