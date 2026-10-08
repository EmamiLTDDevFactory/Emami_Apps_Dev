# Gate Entry

Inward truck gate entry against purchase orders or ASNs, replacing the Web Dynpro app `ZGATE_ENTRY`.
Built from `gate-entry-web` (its business rules, field names and messages), as a static Next.js app like every
other embedded app: served at `/apps/gate-entry`, tile **Gate Entry** (Supply Chain) in the hub.

```
npm install --legacy-peer-deps
npm run dev        # http://localhost:3230/apps/gate-entry (sign in to the hub on localhost first)
npm run typecheck
npm run build      # -> dist/, merged into the hub by scripts/build-embedded-apps.js
```

## Screens
| Sidebar | What it does |
|---|---|
| New gate entry | Against PO (one or more POs on the same truck) or against ASN; tick the lines on the truck, received quantity, truck / LR / freight vendor / invoice; 7-day date question; saved -> request number, print gate pass |
| Gate entries | Search by year, request, PO, ASN; detail with Print gate pass, Record out time, Cancel (with reason) |
| Truck out | Same list, only trucks without an out time |

## Vehicle number from a photo
Under **Vehicle number**: *Take photo* (opens the camera on phones/tablets) or *Upload photo*. The photo is shrunk to
1568 px in the browser and sent, with the hub session token, to `POST /api/vision/vehicle-number` on the Emami Apps
server (172.17.2.21, the SAP Agent server behind `audit-capa-api.emamiapps.in/dev-api/sap-agent`). The Anthropic key
is typed in on the first photo (kept only in that browser tab, sent as `X-Anthropic-Key`, used for that request and
never stored by the server; the green key button changes or forgets it); a server key `VISION_ANTHROPIC_API_KEY` is
used when none is sent. Model `VISION_MODEL`, default `claude-opus-5-5`. The server asks Claude to
read the plate **twice in parallel**; the readings are compared and checked against the Indian formats
(`SS NN X(XX) NNNN`, `YY BH NNNN X(X)`):
- both agree, valid format, high confidence -> filled in ("Read from photo")
- agree with medium confidence -> filled in, marked "check it"
- they disagree, or the format is wrong -> nothing filled; both readings shown to tap
The user can always correct the field. Any signed-in hub user may call it (30 photos per minute each); photos are
not stored. Code: `src/lib/vision.ts`, `src/components/VehiclePhoto.tsx`, server `sap_agent_web/vision.py`.

## How it reaches SAP
Browser -> shared Azure SAP gateway -> `NGD` -> OData V2 service **`ZMM_GATE_ENTRY_SRV`** (SEGW `ZMM_GATE_ENTRY_MDL`,
`src/lib/config.ts`). The gateway logs on with its technical user, does the CSRF handshake and appends
`$format=json` to every URL - same as Shelf Life Deviation, PO Approval and the other SAP apps. No server of our own.
The contract below follows `UI5_CONVERSION_PROMPT.md` (written for a UI5 app; this app is Next.js, so manifest /
Component / i18n / UI5 proxy items do not apply) and was checked live on NGD on 2026-10-08: every property name
there exists (checked with `$select`), and every call below reaches the DPC.

| UI action | Call |
|---|---|
| PO + Enter | `GET PoInfoSet('<po>')` + `GET PoItemSet?$filter=Ebeln eq '<po>'` |
| ASN value help | `GET AsnSet[?$filter=Ebeln eq '<po>']` |
| ASN chosen | `GET AsnSet(ShipId='<id>',Email='<login email>')` + `GET AsnItemSet?$filter=Email eq .. and ShipId eq '<id>'` |
| Save (PO or ASN) | `POST GateEntrySet` deep insert, `Pos` = one element per PO (one for an ASN), each with `Items`; response `ReqNo` |
| Search | `GET GateSummarySet?$filter=Year/PoNo/ReqNo/AsnNo eq ..` |
| Open an entry | `GET GateRequestSet` + `GateRequestItemSet?$filter=ReqNo eq '..'` |
| PO history | `GET GateRequestItemSet?$filter=Ebeln eq '..'` |
| Print | `GET GateRequestPdfSet('<ReqNo>')/$value` (see gaps) |
| Record out time | `POST GateOutTimeSet { ReqNo }` (SAP stamps the time) |
| Cancel / admin cancel | `POST GateCancelSet { ReqNo, Reason, Admin: '' / 'X' }` |
| Admin: set line to 0 | `PUT GateRequestItemSet(ReqNo,Slno,Ebeln,Ebelp,Email)` with the full entity as read, `QntRecievd: "0.000"` |
| Admin: delete line | `DELETE GateRequestItemSet(ReqNo,Slno,Ebeln,Ebelp,Email)` (see gaps) |

Create body: `{ "ConfirmDateWarning": "", "Pos": [{ ReqDate, PoNo, PoVendr, PoVendrName, Regio, RegioDesc, Plnt,
TruckNo, TruckDate, TruckTim, Lrno, Lrdt, FrVendr, VehVendrNo, VehVendrName, InvNo, InvDate, [AsnNo],
"Items": [{ Ebeln, Ebelp, Txz01, Matnr, Werks, PoQnty, Menge, Meins, QntRecievd, RetVend122, "Selected": "X" }] }] }`.
Dates `/Date(<UTC midnight ms>)/`, times `PT14H35M00S`, decimals strings with 3 places. PO mode sends only lines with a
quantity above 0, ASN mode only the ticked lines (with `PoNo` empty).

Errors (`error.message.value`): `FIELD: text` marks that input (PO_NO, TRUCK_NO, LRNO, FR_VENDR, INV_NO, INV_DATE,
TRUCK_DATE, TRUCK_TIM; QNT_RECIEVD shows as a general message), `CONFIRM_DATE|text` asks YES/NO and resends with
`ConfirmDateWarning: 'X'`, anything else is shown as is.

### Gaps (where NGD or the gateway differ from the brief)
1. **Flags are ABAP flags, not booleans.** `ConfirmDateWarning` and `GateCancel.Admin` are strings: SAP refuses
   `true`/`false` ("Failed to read property 'Admin'"), so the app sends `'X'` / `''`.
2. **Email.** Every call runs as the gateway's technical SAP user, so the signed-in Emami Apps email (lower case)
   goes with every call: first in every list `$filter` (`Email eq '<login email>' and ...`), as the second key of
   `AsnSet(ShipId='..',Email='..')` and of `GateRequestItemSet(ReqNo,Slno,Ebeln,Ebelp,Email)` (admin PUT / DELETE), and as property `Email` on the GateEntry create (top level and each `Pos`),
   GateOutTime and GateCancel. NGD has `Email` on every entity type except `GateRequestPdf` (2026-10-09);
   `PoInfoSet('<po>')` is still keyed by `Ebeln` alone.
3. **The gateway has no route for `.../$value` or for `DELETE`** (its own 404 "Cannot GET/DELETE /api/..."). Print
   falls back to a printable gate pass built from the entry data (`src/components/print.ts`); delete line shows
   "The SAP gateway does not pass this request on to SAP yet". Both start working unchanged once the gateway
   forwards them. PUT does reach SAP.
4. ReqNo must be a full 10-character number: a short one (e.g. `ZZZ`) makes the DPC dump ("Invalid access to a
   string (too long)", HTTP 500) instead of answering "not found".
5. There was never a mock data path in this app (it was built against the contract), so there is no mock flag.

## Code map
| File | Role |
|---|---|
| `src/lib/sap.ts` | gateway client, SAP error -> `GateError` (`FIELD: msg`, `CONFIRM_DATE|`, service missing, gateway 404) |
| `src/lib/gate.ts` | every call above, OData <-> camelCase mapping |
| `src/lib/format.ts` | `/Date()`, `PT..H..M..S`, decimals, display formats |
| `src/lib/validate.ts` | fast-feedback checks (SAP stays the authority) |
| `src/components/NewEntry.tsx` | PO/ASN form, line table, ASN picker, 7-day dialog, saved screen |
| `src/components/Entries.tsx` | search, detail drawer, out time, cancel, admin dialog |
| `src/components/print.ts` | gate pass PDF, or the printable fallback |
