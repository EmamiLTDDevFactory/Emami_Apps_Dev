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
Browser -> shared Azure SAP gateway -> `NGD` -> OData V2 service **`ZGATE_ENTRY_SRV`** (`src/lib/config.ts`).
The gateway logs on with its technical user and does the CSRF handshake, and appends `$format=json` to every URL -
same as Shelf Life Deviation, PO Approval and the other SAP apps. There is no server of our own.

**Status (2026-10-07): `ZGATE_ENTRY_SRV` does not exist on NGD yet** (`/IWFND/MED/170 No service found`). The app
shows a banner until it does. The SAP side is Phase 0 of `gate-entry-web/docs/PLAN.md` (ZCL_GATE_ENTRY_BL, SEGW
project, DPC_EXT, `/IWFND/MAINT_SERVICE`); its ABAP files were not in the gate-entry-web folder.

## SAP contract (build the SEGW service to this)
`gate-entry-web` assumed its own Node server calling SAP as each user (Basic auth), `$batch` and a `$value` PDF.
Behind the Emami gateway that does not work, so the contract differs in four places:

1. **Email instead of sy-uname.** All calls run as the gateway's technical user, so the hub user's email
   (lower case) travels with every call. `ZCL_GATE_ENTRY_BL` maps it to the SAP user (e.g. ADR6/USR21) and uses that
   for `ZGATE_AUTH` (plants, cancel authority 'D') and `REQ_BY`.
   - reads: `$filter=Email eq '<email>' and ...` on every entity set below
   - function imports: parameter `Email`
   - create: property `Email` on `GateRequest`
2. **Filtered reads instead of keyed reads** (so Email can travel): `AsnSet?$filter=Email eq .. and ShipId eq ..`,
   `PoInfoSet?$filter=Email eq .. and Ebeln eq ..` (one row each).
3. **Multi-PO entry = one deep insert.** `POST GateRequestSet` with `Items` of every PO (each item has its `Ebeln`);
   the BL splits them into one header per PO under one new request number - the same thing it already does for an
   ASN - and derives vendor/region per PO. The header carries the first PO's data. One call = one LUW, so the
   all-or-nothing rule of the `$batch` design still holds. `NewReqNo` is not called by the app.
4. **PDF as base64.** `GET GateRequestPdfSet?$filter=Email eq .. and ReqNo eq ..` -> one row, property `Pdf` =
   base64 of the Smartform `ZF_GATE_ENTRY` PDF.

Calls the app makes (entity/property names as in gate-entry-web):

| Call | Used for |
|---|---|
| `GET AsnSet?$filter=Email eq '..' [and Ebeln eq '..']` | open ASNs of the user's plants (WD OVS_ASN) |
| `GET AsnSet?$filter=Email eq '..' and ShipId eq '..'` + `GET AsnItemSet?$filter=... ShipId eq '..'` | ASN header defaults + lines |
| `GET PoInfoSet?$filter=Email eq '..' and Ebeln eq '..'` + `GET PoItemSet?$filter=...` | PO_ENTER; errors as `PO_NO: <WD message>` |
| `GET GateRequestItemSet?$filter=Email eq '..' and Ebeln eq '..'` | earlier receipts of a PO (PO_HIST) |
| `POST GateRequestSet` (deep insert, `Items`) | save (PO or ASN mode); returns `ReqNo` |
| `GET GateSummarySet?$filter=Email eq '..' [and Year/PoNo/ReqNo/AsnNo eq '..']` | search |
| `GET GateRequestSet` / `GateRequestItemSet?$filter=Email eq '..' and ReqNo eq '..'` | entry detail |
| `POST RecordOutTime?ReqNo='..'&Email='..'` | out time (server time) |
| `POST CancelRequest?ReqNo='..'&Reason='..'&Email='..'` | cancel |
| `GET GateRequestPdfSet?$filter=Email eq '..' and ReqNo eq '..'` | gate pass PDF (base64 `Pdf`) |

Errors: raise `FIELD_NAME: text` (the UI puts the text under that input, e.g. `INV_NO: ...` -> invoice number) and
`CONFIRM_DATE|text` for the 7-day question (the UI asks YES/NO and resends with `ConfirmDateWarning: true`).

Create body (PO mode, two POs on one truck):
```json
{ "Email": "gate.user@emamigroup.com", "ReqDate": "/Date(1791331200000)/", "PoNo": "4500000001", "PoVendr": "100123",
  "PoVendrName": "Kolkata Chemicals Ltd", "Regio": "19", "RegioDesc": "West Bengal", "TruckNo": "WB25F4521",
  "TruckDate": "/Date(1791331200000)/", "TruckTim": "PT14H35M00S", "Lrno": "LR-7781", "FrVendr": "02",
  "VehVendrNo": "", "VehVendrName": "Sharma Roadways", "InvNo": "INV/2026/551", "InvDate": "/Date(1791158400000)/",
  "Plnt": "1101", "ConfirmDateWarning": false,
  "Items": [
    { "Ebeln": "4500000001", "Ebelp": "00010", "Txz01": "Menthol crystals", "Matnr": "RM1010", "Werks": "1101", "PoQnty": "500.000",
      "Menge": "300.000", "Meins": "KG", "QntRecievd": "120.000", "RetVend122": "0.000", "Selected": "X" },
    { "Ebeln": "4500000002", "Ebelp": "00020", "Txz01": "Glass bottle 100ml", "Matnr": "RM1020", "Werks": "1101", "PoQnty": "500.000",
      "Menge": "250.000", "Meins": "PC", "QntRecievd": "40.000", "RetVend122": "0.000", "Selected": "X" } ] }
```
ASN mode: same, `PoNo` empty, `AsnNo` set, `Items` = the ticked ASN lines.

## Code map
| File | Role |
|---|---|
| `src/lib/sap.ts` | gateway client, SAP error -> `GateError` (`FIELD: msg`, `CONFIRM_DATE|`, service missing) |
| `src/lib/gate.ts` | every call above, OData <-> camelCase mapping |
| `src/lib/format.ts` | `/Date()`, `PT..H..M..S`, decimals, display formats |
| `src/lib/validate.ts` | fast-feedback checks (SAP stays the authority) |
| `src/components/NewEntry.tsx` | PO/ASN form, line table, ASN picker, 7-day dialog, saved screen |
| `src/components/Entries.tsx` | search, detail drawer, out time, cancel |
