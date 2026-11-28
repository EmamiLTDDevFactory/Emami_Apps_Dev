# Trip Trail phase 1 (from ~/Downloads/Trip Trail.docx, 2026-11-28)

Source requirements (verbatim intent):
1. Indent Creation: **No. of Cases** and **No. of Vehicles** must be added.
2. The **Customer** label is renamed **Transporter**.
3. **Multiple transporter** selection, with the distribution of No. of Cases, No. of Vehicles, Required Time and Quantity per transporter.
   It must stay the **same indent number, with an item number** per transporter line, to track it.
4. After the indent is raised, a **mail goes to each transporter with only their own details**.
5. **Vendor login**: a vendor sees only their own pending requests. The vendor fills **Driver Name, Driver Phone Number, Vehicle Number**;
   every other field is read-only. The vendor fills the details and sends them back to us.
Plus (same message): a separate **Map tab** with the plant / depot locations from `~/Downloads/EXPORT 1 (1).XLSX` (SAP T001W export, 110 plants) geocoded.

## Data model (additive; existing single-transporter indents keep working)
`Indent` (same id `IND123`) gains: `cases` (total), `vehicles` (total = sum of items), `items[]`, and `customerId` becomes optional ('' allowed).

`IndentItem` (item numbers 10, 20, 30 ...; displayed `IND123-10`):
```
{ itemNo, carrierId, cases, vehicles, qty, requiredAt (ISO), rate, per?, currency?,
  status: 'Pending' | 'Submitted' | 'Rejected' | 'Expired' | 'Cancelled',
  expiresAt, units: [{ driver, phone, vehicleNo }]   // exactly `vehicles` rows once Submitted
  submittedAt?, rejectReason?, orderId?, sins?: string[], mail?: { to, sent, simulated, at } }
```
Indent.status: `Open` while any item is Pending; `Allocated` when every non-cancelled item is Submitted; `Partly allocated` when some are Submitted and others Rejected/Expired/Pending; `Cancelled`.
An item that is Rejected/Expired needs HO action (re-offer to another transporter with a new item) - HO sees it highlighted; sequential lane-priority offering is only used when `allocations` is NOT sent (legacy path).

## Commands
`createIndent` (perm indent.create) accepts, in addition to today's fields:
`cases` (optional when allocations given), `vehicles` (ignored when allocations given), `customerId` (optional), and
`allocations: [{ carrierId, cases, vehicles, qty, requiredAt }]` (1..20 rows, distinct carriers not blocked; each cases >= 0, vehicles >= 1 integer, qty > 0, requiredAt in the future; the
row's rate comes from the lane's vendor row for that carrier (mode-aware) else 0).
Totals are derived from the allocations: `cases`, `vehicles`, `qty` of the indent = sums; if the client also sends totals they must match (else 400 naming the field).
Returns `{ indentId, items: [{itemNo, carrierId}], mailRequests: [...] }`; tms.js sends each mail request through `deps.mail` (TMS_MAIL_URL unset => simulated, nothing leaves the box)
and stores the outcome on the item (`item.mail`).
Each mail contains ONLY that carrier's item(s): indent id, item no, route (from/to), vehicle type, cases, vehicles, qty, required time. No other transporters, no rates of others, no customer.
Recipient = the carrier's e-mail field(s) on the carrier master (check the existing carrier record / the invoice mailbox lookup in tmsTrips.js); a carrier without e-mail => `item.mail = {sent:false, error:'no e-mail'}` and a warning on the indent, never a failure.

`vendorSubmitItem` (vendor only; perm indent.respond): `{ id, itemNo, units: [{driver, phone, vehicleNo}] }`: exactly `item.vehicles` rows, each validated like the engine's `assign`
(driver name required, phone format, vehicle number format, no duplicate vehicle number within the item or against active shipments - reuse the engine's own checks).
Effect: item -> Submitted; creates ONE order for the item and `item.vehicles` shipments (reuse the accept path / `makeShipments`), each shipment assigned its unit (status Assigned) exactly as `assign` does; `item.sins`, `item.orderId` set; indent status recomputed; HO notified.
`vendorRejectItem`: `{ id, itemNo, reason }` (reason required) -> item Rejected; HO notified (critical).
`vendorRespond` (legacy accept/reject) is unchanged for legacy indents; on an indent with items it returns 409.
Vendor visibility (`vendorIndents`): only indents having an item for the caller's carrier; `items` filtered to the caller's items; no customerId, createdBy, remarks, other carriers, other items.
A vendor can change ONLY `units[*].{driver,phone,vehicleNo}` (via vendorSubmitItem). Everything else is server-controlled.

Sweep: a Pending item past `expiresAt` -> Expired (notify HO); settings.offerTimeoutH applies (default as today).
Cancel: cancelIndent cancels all items (Pending -> Cancelled; Submitted items cancel their shipments as today).

## UI
- Indents page, create form: label **Transporter** replaces Customer; fields No. of Cases, No. of Vehicles shown as the totals of the table below; a **transporter table**
  (add/remove rows): Transporter (select, lane-ranked carriers first, shows lane rate), Cases, Vehicles, Qty (MT), Required date/time; running totals + "remaining to distribute" against
  optional targets the user may type first (total cases / vehicles / qty); Raise is disabled until the table is valid. Indent list shows items as sub-rows `IND123-10` with status chips and mail status.
- Vendor Portal (vendor login only): "Pending requests" = own items in Pending; read-only summary of the item, and a grid with one row per vehicle: Driver name, Driver phone, Vehicle number; **Send to Emami** submits.
  Rejected / submitted history below. Nothing else editable.

## Map tab
`/locations-map/` ("Plant Map", nav after Distribution Planning). Data: `public/plant-locations.json` built by `scripts/geocode-plants.mjs` from the T001W export:
`{plants:[{code,name,type:'3P'|'Unit'|'Depot'|'MWH'|'Plant',city,state,pincode,lat,lon,source:'sanjoy-dp'|'pincode'|'city'|'manual',confidence:'high'|'medium'|'low'}], builtAt}`.
Coordinates: Sanjoy's DP.xlsx coordinates (in his dp_data.json `sites[].lat/lon`) win when the plant code matches; otherwise geocode PIN code + city (India) with a public geocoder, throttled, sending ONLY pincode/city/state (no company, no user info; generic User-Agent). Every low-confidence point is flagged in the UI list ("check location") and is draggable/editable by an admin (saved in the browser for now; persisting is a follow-up).

## Implemented (backend, 2026-11-28) - deviations and additions to the contract above
- Files: `backend/tmsOutward.js` (items, commands, sweep, visibility), `backend/tmsEngine.js` (shared `checkUnit` / `applyUnit` used by `assign` AND `vendorSubmitItem`; carrier `email`; import allows `customerId: ''`), `backend/tms.js` (mail + consent dispatch in `run()`), tests `backend/test/tmsIndentItems.test.js` (16) - `tms.test.js` (51) unchanged and green.
- **Indent.status with mixed lines**: any Submitted line but not all => `Partly allocated` (including while another line is still Pending); `Open` = nothing Submitted yet (also when every line was Rejected/Expired, then `escalated: true`); `Allocated` = every line that still counts is Submitted.
- **New command `addIndentItem`** `{id, allocation:{carrierId,cases,vehicles,qty,requiredAt}, replaces?}` (perm indent.override): HO adds a transporter line (next item no: 40 after 30, ...). `replaces` = itemNo of a Rejected/Expired line (default: the only unreplaced failed line). A replaced line gets `replacedBy` and stops counting. Returns `{indentId, itemNo, mailRequests}`.
- **Totals** (`cases`, `vehicles`, `qty`) always follow the live lines (Pending + Submitted); Rejected/Expired/Cancelled lines are excluded.
- **Mail**: `createIndent` / `addIndentItem` return `mailRequests` to the service layer only; `tms.js` strips them from the response and returns `result.mails = [{indentId,itemNo,carrierId,to,sent,simulated?,error?}]`. Outcome stored on `item.mail = {to,sent,simulated?,error?,at}`. Recipients = carrier `email` + the e-mails of the TMS users linked to that carrier; none => `item.mail.error = 'No e-mail address for this transporter'` + a warning notification. `TMS_MAIL_URL` unset => simulated (nothing sent). Mail text: indent-item id, route, vehicle type, vehicles, cases, qty, required time, answer-by time; never rates, other transporters or the customer.
- **Carrier e-mail**: optional `email` on the carrier record, set by `addCarrier {email}` / `patchCarrier {patch:{email}}` (perm carrier.add, validated, lower-cased). The UI needs an e-mail field on the carrier form.
- `vendorSubmitItem` result: `{orderId, sins, consentRequests}` (the service sends the SIM-consent requests and returns `result.consent`). One order per item, `packages = item.cases`, shipments carry `indentId` and `indentItem`. Errors for unit rows are prefixed `Vehicle n:`.
- `vendorRejectItem` / `vendorSubmitItem` on a line that is missing OR belongs to another carrier: the same 409 `This request is not assigned to your transport company.`.
- Vendor view (`vendorIndents`): `items` = own lines without `mail`; `cases/vehicles/qty/status/requiredAt` computed from own lines only.
- `vendorRespond` / `offerIndent` on an indent with lines => 409; `vendorSubmitItem` / `addIndentItem` on a legacy indent => 409. Customer is optional on both paths (unknown id still refused).
