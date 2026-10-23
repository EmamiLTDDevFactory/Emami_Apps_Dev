# Cascade Pricing (ZMM_CASCADE_PRICING)

Export price cascade from the consumer price (RRP incl. VAT) in each market down to the billing price (CIF after A&P):
rate upload, pricing simulation, approval, SAP condition creation, and pricing KPIs. Static Next.js 15 export served
by the hub at `/apps/cascade-pricing/` (built by the repo root `scripts/build-embedded-apps.js`).

```
npm install
npm run dev        # http://localhost:3310/apps/cascade-pricing/
npm test           # excel parsing, cascade maths, mock workflow, KPIs
npm run build      # static export -> dist/
```

## Data
The browser never talks to SAP. `lib/api.ts` calls the service that fronts it:
`GET <base>/cascade/{CascadeMapSet|ApprovalSet|ConditionPendingSet}` and `POST <base>/action`
(`SEND_APPROVAL, APPROVE, APPROVE_SIM, REJECT, DELETE, CREATE_COND, RUN_SIM, SAVE_RATES, COMPARE`).

The service is not available yet, so **mock mode is on by default** (`lib/mock.ts`: in-memory, same contract and
workflow, fictional customers, nothing persisted). To use the real service, build with
`CASCADE_MOCK=false CASCADE_API_BASE=https://<host>/<path>`. Authorisation must be enforced by that service; this app
has no login UI of its own.

## Tabs
1. Cascade Material Extraction · 2. Cascade Rate Upload · 3. Pricing Simulation · 4. Condition Creation ·
5. Review / Approval (the ABAP report's tabs, same order) · 6. Pricing KPIs.

## KPIs (`lib/kpis.ts`)
Price waterfall as % of RRP excl. VAT (retailer margin, distributor margin, A&P, damage/expiry, duty + C&F + LC charge,
net realisation), channel margin, A&P investment, landing cost on CIF, net price per dozen, change vs previous version,
price corridor across markets (parallel-trade risk), guardrail exceptions (`GUARDRAILS`), cascade coverage and
validity expiring soon. Simple averages: the contract carries no volumes.
