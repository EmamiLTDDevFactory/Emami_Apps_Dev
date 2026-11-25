# CAPEX Approval Portal — SAPUI5 / Fiori

Capital expenditure approval and capitalization portal for Emami Group.
Budget → CPE → Evaluation → DOA approvals → CWIP/PO → GRN → Installation
Certificate → auto-capitalization, with dashboards, audit trail and reports.

---

## 1. Application Details

| | |
| --- | --- |
| **Module name** | `zcapexportal` |
| **Namespace / app id** | `zcapexportal` |
| **BSP application** | `ZCAPEX_PORTAL` |
| **ABAP package** | `ZEMAMI` |
| **Transport** | *set in `ui5-deploy.yaml` before deploying* |
| **UI5 version** | 1.120.0 (min declared 1.108.0) |
| **Theme** | `sap_horizon` |
| **Language** | JavaScript (no TypeScript), ESLint enabled |
| **OData** | v2 — `/sap/opu/odata/sap/ZCAPEX_PORTAL_SRV/` |
| **FLP semantic object** | `ZCapexPortal` / action `display` |

---

## 2. Running it in BAS

```bash
npm install
npm start
```

The app boots on **sample data**, so every screen is clickable with no backend.
Look for `_bUseMock` in `webapp/Component.js`.

### Preview as different approvers

Click the avatar (top right) → **Preview As**. Switching persona changes:

- which CPEs appear in **My Approvals** (only your own DOA level)
- which plants are visible at all (plant authorization)
- whether the **DOA Matrix** admin screen is shown

This is a demo aid only. Delete the `personas` block from `MockData.js` before
going live — real identity comes from `sy-uname` and PFCG roles.

---

## 3. Switching from mock data to SAP

One flag:

```js
// webapp/Component.js
this._bUseMock = false;      // was true
```

That is deliberately the only switch. When it flips:

- `MockData.load()` is skipped
- `_createODataModel()` builds the v2 model against `ZCAPEX_PORTAL_SRV`
- `BaseController.callFunction()` stops resolving locally and issues real
  `callFunction` POSTs to the Gateway

**The OData model is not declared in `manifest.json` on purpose.** A declared
model is instantiated at component start and fires a `$metadata` request
immediately, which throws until the service is activated. The `dataSource`
entry stays in the manifest so Fiori tools and the deploy step still see it.

### What the backend has to provide

**Entity sets**

| Entity set | Feeds |
| --- | --- |
| `BudgetSet` | Budget list / detail |
| `CPESet` | CPE list / detail |
| `VendorQuoteSet` | Vendor comparison (nav from CPE) |
| `ApprovalStepSet` | Approval chain and inbox |
| `DOAMatrixSet` | Delegation of authority rules |
| `CWIPSet`, `POSet`, `GRNSet` | Procurement |
| `InstallationCertSet` | IC and capitalization |
| `QuotaCapexSet` | Unit quota capex |
| `AuditTrailSet` | Audit trail |
| `DashboardKPISet` | Dashboard rollup |

**Function imports** (names already called by the UI)

| Function import | Called from |
| --- | --- |
| `SubmitBudget` | `BudgetCreate.controller.js` |
| `SubmitCPE` | `CPECreate.controller.js` |
| `SubmitEvaluation` | `Evaluation.controller.js` |
| `ApproveCPE`, `RejectCPE`, `HoldCPE`, `RolloutCPE` | `ApprovalDetail.controller.js` |
| `BulkApprove` | `ApprovalInbox.controller.js` |
| `CreateCWIP` | `CWIPCreate.controller.js` |
| `ConfirmPO` | `PODetail.controller.js` |
| `CapitalizeAsset` | `ICDetail.controller.js` |
| `SubmitQuotaCapex` | `UnitQuota.controller.js` |

Each returns `{ Success, Message }`. The UI already handles the failure branch.

---

## 4. Deploying to ECC

1. Set the transport in `ui5-deploy.yaml`:

   ```yaml
   transport: <YOUR_TRANSPORT_HERE>
   ```

2. Build and deploy:

   ```bash
   npm run deploy
   ```

   This runs `ui5 build` then `fiori deploy`, which uploads the BSP
   `ZCAPEX_PORTAL` into package `ZEMAMI` via the `EDS` destination.

3. Register the tile:
   - `LPD_CUST` — new application, semantic object `ZCapexPortal`, action `display`
   - Assign to a catalog and group in `/UI2/FLPD_CUST`
   - Add the catalog to a PFCG role
   - Launch from `/UI2/FLP`

`webapp/index.html` is only used for standalone testing. Inside the Fiori
Launchpad it is ignored — the FLP bootstraps UI5 itself and loads
`Component.js` directly.

**If your users have no internet access**, change the bootstrap in
`index.html` from `https://ui5.sap.com/1.120.0/resources/sap-ui-core.js` to
`/sap/public/bc/ui5_ui5/resources/sap-ui-core.js` so it is served by ECC.
This only affects standalone launches, not the FLP.

---

## 5. Screen map

| Route | View | Purpose |
| --- | --- | --- |
| `#/` | Dashboard | Budget rollup, SLA alerts, approval queue, CWIP ageing |
| `#/budget` | BudgetList | All budgets, filtered by plant authorization |
| `#/budget/create` | BudgetCreate | Submit budget, IRR/NPV/payback, DOA preview |
| `#/budget/{id}` | BudgetDetail | Position, cash-flow schedule, linked CPEs, audit |
| `#/cpe` | CPEList | CPE worklist with status tabs |
| `#/cpe/create` | CPECreate | Auto-fill from budget, live budget block, L1/L2/L3 |
| `#/cpe/{id}` | CPEDetail | Vendor comparison, financials, approval chain, docs |
| `#/evaluation/{id}` | Evaluation | Technical + commercial sign-off, non-L1 justification |
| `#/approvals` | ApprovalInbox | Your queue, SLA severity, bulk approve |
| `#/approvals/{id}` | ApprovalDetail | **One-page approval summary** |
| `#/cwip/{id}` | CWIPCreate | CWIP + PO fields, push to SAP |
| `#/po`, `#/po/{id}` | POList / PODetail | Purchase orders, confirm PO |
| `#/grn` | GRNList | Goods receipts |
| `#/ic`, `#/ic/{id}` | ICList / ICDetail | Installation certificate, 3 photos, capitalize |
| `#/capitalization` | Capitalization | CWIP ageing, capitalized assets |
| `#/quota` | UnitQuota | ₹2 L per FY / ₹50 K per item rules |
| `#/reports` | Reports | Report catalogue and analytics |
| `#/audit` | AuditTrail | Full compliance trail |
| `#/admin/doa` | DOAMatrix | DOA config + routing simulator |

---

## 6. Business rules implemented

**Budget control** — `BaseController.checkBudget()`
Available = Approved − Committed − Spent. A CPE above the balance is **blocked**
and Submit is disabled, with two remedies offered: draw from the common pool
bucket, or route for a budget increase.

**DOA auto-routing** — `BaseController.resolveDOA()`
Resolves the approver chain from capex type and amount using the matrix in
`config>/doaMatrix`. Ranges match the requirement document (Manufacturing
≤/> ₹10 L, Moulds ≤/> ₹10 L, IT ≤/> ₹5 L).

**Vendor rules** — `CPECreate` / `Evaluation`
Above ₹10 L, three quotes are mandatory. Vendors are auto-ranked L1..Ln by
quote. Selecting a non-L1 vendor forces a written justification of at least 25
characters, and the saving or premium versus L1 is computed and shown.

**Unit quota** — `BaseController.checkQuota()`
≤ ₹2,00,000 per unit per financial year, ≤ ₹50,000 per single item. Both are
checked live as the amount is typed.

**Plant authorization** — `BaseController.applyPlantAuth()`
Users see only their authorized plants. List screens also push this into the
binding filter so it holds through search and paging.

**SLA** — `formatter.slaState()`
On track ≤ 3 days, at risk 4–5, breached > 5. Breached rows pulse and the
dashboard raises an escalation strip.

**Financial engine** — `BaseController.calcIRR/calcNPV/calcPayback`
IRR uses bisection rather than Newton-Raphson, so it cannot diverge on
irregular cash flows and returns `NaN` when a root cannot be bracketed rather
than a misleading number. Verified against textbook values
(₹1000 in, 5 × ₹300 out → IRR 15.24%, NPV at IRR ≈ 0, payback 3.33 yrs).
Can be switched off per request, as the requirement asked.

---

## 7. Responsive behaviour

| Breakpoint | Behaviour |
| --- | --- |
| ≥ 1024px | Side navigation expanded alongside content |
| < 1024px | Side navigation becomes an off-canvas overlay |
| < 600px | Edge-to-edge layout, tables collapse to pop-in cards, sticky action bar |
| < 360px | Reduced type scale |

Verified at 1440 / 834 / 390 / 320 px with **zero horizontal overflow**.

---

## 8. A note on styling

UI5 does not support binding on the `class` attribute — an expression there is
evaluated once at parse time and silently produces an unstyled control. Every
conditional colour in this app therefore goes through bound `CustomData` with
`writeToDom="true"`, which renders `data-tone="…"` on the element, matched by
attribute selectors in `style.css`:

```xml
<VBox class="zcpxKpi">
    <customData>
        <core:CustomData key="tone"
            value="{path: 'detail>/available', formatter: '.formatter.balanceTone'}"
            writeToDom="true"/>
    </customData>
```

```css
.zcpxKpi[data-tone="error"] { border-left-color: var(--zcpx-error); }
```

All custom CSS is prefixed `.zcpx*` and scoped under `.zcpxApp`, so nothing
leaks into other apps sharing the Launchpad.

---

## 9. Project structure

```
zcapexportal/
├── ui5.yaml               UI5 1.120.0, libs, proxy to EDS
├── ui5-deploy.yaml        BSP ZCAPEX_PORTAL, package ZEMAMI
├── ui5-local.yaml         Local FLP sandbox preview
└── webapp/
    ├── Component.js       Mock/OData switch, side-nav sizing
    ├── manifest.json      21 routes, 22 targets, 7 JSON models
    ├── index.html         Standalone bootstrap only
    ├── css/style.css      Design system, ~40 tokens, 4 breakpoints
    ├── i18n/              All UI text
    ├── model/
    │   ├── formatter.js   Currency (L/Cr), dates, status, tones
    │   ├── models.js      Device model
    │   └── MockData.js    Sample data — delete when backend is live
    ├── controller/        BaseController + 21 view controllers
    └── view/              21 views + 2 fragments
```

---

## 10. Known limitations

- Attachment upload, Excel export and global search show a toast — they need
  the corresponding Gateway services.
- Photo capture on the IC screen simulates the attachment. Wire it to
  `sap.m.upload.FileUploader` or the device camera when the DMS service exists.
- Charts are progress bars and meters, not `sap.viz`. If you want real charts,
  add `sap.viz` to `ui5.yaml` — it is a heavy library, so it was left out.
- `MockData.js` mutates in memory. Refreshing the browser resets everything.
