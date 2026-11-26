# Order to Cash (embedded app)

Hub tile **Order to Cash** (category SD, `/apps/order-to-cash`, Manage Access app id `order-to-cash`). It follows the
JAVIS "autonomous order to cash" flow on Emami's own SAP: every customer PO is captured, checked and turned into a sales
order, then tracked through fulfilment to cash, so nothing leaks.

```
browser (static Next.js export)  --Bearer-->  backend/orderToCash.js  (/api/me/order-to-cash, hub session + grant)
                                                 |-- Postgres schema order_to_cash (PO inbox, audit, appointments, flags, disputes)
                                                 |-- Groq (GROQ_API_KEY): reads PO documents into JSON, nothing else
                                                 +-- SAP: SOAP-RFC /sap/bc/soap/rfc -> Z_SD_O2C_ACTION -> ZCL_SD_O2C=>HANDLE
```

## Screens

| Step | Screen | What it does | SAP |
|---|---|---|---|
| Control tower | Overview | 30-day PO funnel, touchless rate, exception causes, dispute money | Postgres |
| Order management | PO Capture | Drop PDF / Excel / image / email; AI reads header + lines; a person checks; saved to the inbox | — |
| | Validation & Exceptions | Customer + sales area, material mapping (given, customer info record KNMT, EAN), listing (MVKE), sales status, price / MRP / confirmed qty from a simulation, case lot, duplicate PO, credit. Auto amendment: SAP price instead of PO price (customer amendment list for download), quantity rounded down to the case lot | VALIDATE_PO |
| | Sales Order Creation | Simulate, then create (BAPI_SALESORDER_CREATEFROMDAT2). A second order for the same customer + PO number is refused by SAP | CREATE_SO |
| Order fulfilment | Order Tracker | Order → delivery → goods issue → invoice, blocked and stuck orders | LIST_ORDERS |
| | Back Orders | Open lines, stock (MARD unrestricted), fill rate, create deliveries for what can ship | LIST_BACKORDERS, CREATE_DELIVERY |
| | Appointments | Customer delivery slot per delivery | LIST_DELIVERIES + Postgres |
| | Advance Shipping Note | ASN Excel per delivery (PO, invoice, EAN, batch, mfg / expiry), sent marker | DELIVERY_ITEMS |
| | GRN Reconciliation | Customer GRN file vs invoice lines: short, rejected, excess, value at risk, dispute | INVOICE_ITEMS |
| Invoice to cash | Invoices | Ageing, open amount, paid date, delivered-to-customer marker | LIST_INVOICES |
| | Cash Application | Remittance / bank file matched to open items; clearing proposal to download (nothing posted) | LIST_OPEN_ITEMS |
| | Deductions | Payment residuals and credit memos, grouped by reason | LIST_DEDUCTIONS |
| | Disputes | Owner, status, notes until recovered or written off | Postgres |

SAP writes are only CREATE_SO and CREATE_DELIVERY. Role "Viewer" (Manage Access) is read only.

## SAP (EDS, TR EDSK9B0EPL "Order To Cash", package ZEMAMI)

- `ZCL_SD_O2C` (`abap/zcl_sd_o2c.abap`): all actions, JSON in / JSON out (`/UI2/CL_JSON`), ECC 7.50 tables (VBUK/VBUP).
- Function group `ZSD_O2C`, RFC function module `Z_SD_O2C_ACTION` (`abap/z_sd_o2c_action.abap`).
- No Gateway service: the standard SOAP-RFC node `/sap/bc/soap/rfc` is used. If an OData service is wanted later, wrap
  the function module in SEGW (RFC import) and switch `backend/orderToCashSap.js`.
- Notes: `NET_VALUE` of the simulation is an old BAPI amount with implied decimals, so `NET_VALUE1` is used. MRP = condition
  ZMRP. Default order type = the customer's last one in the sales org (e.g. ZOD1), else OR. Credit block = a simulation
  message mentioning credit.

## Backend env (server .env)

`O2C_SAP_BASE` (https://10.17.10.13:4440 for EDS), `O2C_SAP_CLIENT` (900), `O2C_SAP_USER` / `O2C_SAP_PASSWORD` (an RFC user
with S_RFC on ZSD_O2C plus SD read, order and delivery authorisations), `O2C_SAP_TLS_VERIFY=false` for EDS's self-signed
certificate, `O2C_SAP_SYSTEM` (EDS), `GROQ_API_KEY` (already used by the Expense app). The server must reach the SAP host.

## Run / build / test

```bash
npm install && npm run dev        # http://localhost:3320/apps/order-to-cash/
npm run build                     # static export -> dist/
cd ../../backend && npm test      # rules + SOAP client tests (test/orderToCash.test.js)
```
