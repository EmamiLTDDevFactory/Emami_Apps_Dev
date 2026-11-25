# CAPEX PORTAL — REVISION 3 FRONTEND TASKS (for Claude in SAP BAS)

Place this file in the project root next to `CAPEX_SESSION_LOG.md`, then paste the prompt in section 0 into Claude in BAS.
The backend team is working in parallel. Every task below must work (or degrade gracefully) BEFORE the backend is ready.

---

## 0. PROMPT TO PASTE INTO CLAUDE IN BAS

```
You are working on the SAPUI5 app zcapexportal (this project). Read, in this order:
1. CAPEX_SESSION_LOG.md — at least entries #43 to #70 (attachment matrix, CJN = Budget, gap analysis, DocumentSet attempts/errors).
2. CAPEX_Rev3_Frontend_Tasks_for_BAS.md (this file).

Then implement tasks T1 to T10 in order (T11 is the regression pass at the end). Rules:
- Implement ONLY what this file lists. If something conflicts with the existing code, STOP and report it.
- After each task: run `npm run lint`, then `npm run build`, fix errors, and append a numbered entry (#71, #72, ...) to CAPEX_SESSION_LOG.md describing files changed, what and why.
- Follow the existing patterns: indexed setProperty (never replace a whole array), key-based change detection on repeating lists, fyDigits helper for fiscal year, status strings may be truncated to 12 chars by the backend ("UNDER_EVALUA").
- Every backend-dependent call must be feature-detected (section 3) so the app still runs when the backend is not yet deployed.
- Keep _bUseMock = false at the end. If you toggle it for testing, restore it.
- Do not touch webapp/localService or the manifest data source URL.
- At the end show a list of all changed files and a short summary per task.
```

---

## 1. PROJECT FACTS (do not re-discover)

- App `zcapexportal`, SAPUI5 1.120, OData V2 model `odataModel` (useBatch false), service ZCAPEX_PORTAL_SRV.
- JSON models: cpe, budget, app, config, procure, approval, asset.
- `Component.js`: `mapCpeEntity` (documents hard-coded `[]`), `mapVendorEntity` (no Lifnr), `mapDoaRuleEntity`, ConfigSet mapping (QUOTA_YEAR_CAP, QUOTA_SINGLE_CAP), `_loadLiveCpeList` ($expand CPEToVendors), `isMock()`.
- `BaseController.js`: `callFunction`, `createEntity`, `updateEntity`, `extractODataError`, `resolveDOA(sCapexType, nAmount)`, `checkQuota(nUsedThisFY, nRequest)`.
- `CPECreate.controller.js`: `_buildEmptyAttachments`, `_syncAttachmentSlots`, `onAttachmentFileChange` / `_setAttachmentFile`, `onAddGeneralAttachment`, `_uploadAttachments` (currently fails: createEntity on /DocumentSet), `_validate`, `onSaveDraft`, `onSubmit`.
- `CPECreate.view.xml`: attachment card (MessageStrip warning with i18n `attachmentMatrixHint` to be removed).
- `CPEDetail` / `ApprovalDetail`: Documents tab is bound to local `documents` (always empty); `onUpload` / `onDownload` are only toasts.
- `BudgetList`: fiscal year applied silently in `_applyPlantAuthFilter`.
- `CWIPCreate`: Asset Class ComboBox, `CreateCWIP` params without AssetDesc.

---

## 2. BACKEND CONTRACT (what the backend team will deliver)

**Document upload (media entity)**
- `POST /sap/opu/odata/sap/ZCAPEX_PORTAL_SRV/DocumentSet` with raw file body.
- Headers: `x-csrf-token`, `Content-Type: <file mime>`, `slug: DocType|DocId|Category|FileName|Title|Note` (URL-encode each part with encodeURIComponent; DocType = `CPE` or `BUD`).
- Download: `GET .../DocumentSet(Doctype='CPE',Docid='<id>',Docseq=<n>)/$value`.

**List**: `GET /CPESet('<id>')/CPEToDocuments` returns: Doctype, Docid, Docseq, Filename, Category, CategoryText, DocTitle, Note, Mimetype, Filesize, SizeText, UploadedBy, UploadedByName, UploadedOn.

**Categories**: RFQ1, RFQ2, RFQ3, QUOTE1, QUOTE2, QUOTE3, TCC, NEGOTIATION, JUSTIFICATION, GEN, AMT_REV.

**Function imports**
- `SetCpeVendorCode(CpeId, Lifnr)`
- `ReviseCpeAmount(CpeId, NewAmount, Reason)`
- `CreateCWIP` gets a new parameter `AssetDesc`.

**Entities / config**
- `DoaRule` gets `Doctype` (`CPE` or `BUD`) and optional `Active`.
- `ConfigSet` keys: `DOC_MAX_MB`, `DOC_EXTENSIONS`, `QUOTA_YEAR_CAP_<WERKS>` (per-plant cap).
- CPE entity may expose `Lifnr` (actual vendor code) and `VendorCodeLocked`.

---

## 3. GRACEFUL DEGRADATION RULES

Add to `BaseController`:

```js
hasFunctionImport: function (sName, aParams) {
    var oMeta = this.getOwnerComponent().getModel("odataModel").getServiceMetadata();
    if (!oMeta) { return false; }
    var bFound = false;
    (oMeta.dataServices.schema || []).forEach(function (s) {
        (s.entityContainer || []).forEach(function (c) {
            (c.functionImport || []).forEach(function (f) {
                if (f.name !== sName) { return; }
                var aNames = (f.parameter || []).map(function (p) { return p.name; });
                bFound = (aParams || []).every(function (p) { return aNames.indexOf(p) > -1; });
            });
        });
    });
    return bFound;
},
hasEntityProperty: function (sEntityType, sProp) { /* same idea over schema.entityType[].property */ }
```

- If a function import / property is missing: hide the related control (`visible` bound to a flag in the `app` model) or show `MessageToast` "Not available until backend update" — never throw.
- Mock mode (`isMock()`): upload/list functions return `null`, UI falls back to current behaviour.

---

## 4. TASKS

### T1 — BudgetList: visible Fiscal Year filter (obs. 1)
Files: `BudgetList.view.xml`, `BudgetList.controller.js`, `i18n`.
- Add a `ComboBox cbFY` (items: current FY and previous 4, using `fyDigits`) before Plant filter; default = current FY from `app>/fiscalYear`.
- Add `SearchField` filtering budget id / description / unit (client-side `Filter` OR).
- `_applyPlantAuthFilter` must use the ComboBox key instead of the silent FY; "All years" option clears the FY filter.
- Keep EventBus "app"/"fiscalYearChanged" subscription: it updates the ComboBox selection.
- Accept: user can change FY and search; list count updates; clearing shows all.

### T2 — Document service layer
Files: `Component.js`, `BaseController.js`.
1. `Component.js`: add `mapDocumentEntity(o)` → `{docSeq, fileName, category, categoryText, title, note, mimeType, size, sizeText, uploadedBy, uploadedByName, uploadedOn(toIso), url}` where `url = serviceUrl + "/DocumentSet(Doctype='"+t+"',Docid='"+id+"',Docseq="+seq+")/$value"`.
2. `Component.js`: add `loadDocuments(sDocType, sDocId)` reading `/CPESet('id')/CPEToDocuments` (for BUD use `/BudgetSet('id')/BudgetToDocuments` only if `hasEntityProperty` finds it; otherwise return `[]`). Return `null` in mock/error.
3. `BaseController.uploadDocument(oFile, mMeta)`:
   - `await refreshSecurityToken` (use existing `oModel.refreshSecurityToken`), then `jQuery.ajax` POST to `sServiceUrl.replace(/\/$/, "") + "/DocumentSet"`, `processData:false`, `data:oFile`, headers `x-csrf-token`, `slug`, `Content-Type: oFile.type || "application/octet-stream"`.
   - Slug: `[docType, docId, category, fileName, title, note].map(encodeURIComponent).join("|")`.
   - On error reject `{responseText: xhr.responseText, message: ...}` so `extractODataError` can parse it.
4. Client-side validation helper `validateFile(oFile)`: max size from `config>/docMaxMb` (default 10), extensions from `config>/docExtensions` (default `pdf,xls,xlsx,doc,docx,jpg,jpeg,png,msg,zip`). Map the new ConfigSet keys in `Component.js` like QUOTA_YEAR_CAP is mapped.

### T3 — CPECreate: attachments rework (obs. 6)
Files: `CPECreate.controller.js`, `CPECreate.view.xml`, `i18n`.
- Remove the MessageStrip warning that uses `attachmentMatrixHint` (l.~270) and the i18n keys `attachmentMatrix` / `attachmentMatrixHint` if unused elsewhere.
- Each slot: `FileUploader` with `fileType` from allowed extensions, `maximumFileSize`, `typeMissmatch` / `fileSizeExceed` handlers showing `MessageToast`; a Name (title) `Input` and Note `Input` per slot (note inputs already exist: bind them to `title` and `note`).
- Slots per matrix:
  - Multi-vendor (2–3 vendors): per vendor RFQ(n) + Quotation(n); plus TCC, Negotiation, Justification.
  - Single vendor: Quotation1, Justification (sole-source), TCC, Negotiation as per existing `_buildEmptyAttachments` logic — do not change the slot ids.
  - General: unlimited `GEN` slots (existing `onAddGeneralAttachment`).
- `_validateAttachments()`: required = RFQ+Quote for every vendor present, TCC, Negotiation, Justification. Returns array of messages. Called ONLY from `onSubmit` (not from Save Draft, which allows missing documents).
- `_uploadAttachments(sCpeId)`: sequential chain (`next(i)`), skip slots without file, call `uploadDocument` with `{docType:"CPE", docId:sCpeId, category:slot.category, ...}`. On failure throw `Error` with `failedUpload = slot label`, so user sees which file failed.
- `onSubmit` order: `createEntity("/CPESet")` → `_uploadAttachments` → `SubmitCPE` (not parallel). If upload fails: show error, keep CPE as DRAFT, do not call SubmitCPE.
- `onSaveDraft`: after creating CPE, also upload any selected files (same chain) — drafts keep the documents.
- Feature flag: if `app>/docUploadEnabled` is false (backend not ready, determined by checking the `DocumentSet` entity set is media: `hasEntityProperty("Document","...")` or by `config>/docMaxMb` present), skip upload with a toast "Documents will be uploaded once backend is ready" and continue as today.

### T4 — CPEDetail: documents tab (obs. 6 "doc will come when they go inside the CPE")
Files: `CPEDetail.controller.js`, `CPEDetail.view.xml`.
- In `_onMatched`, after building `detail`, call `loadDocuments("CPE", sId)`; when it returns an array, `setProperty("/documents", aDocs)` and update `docCount`; if null keep existing.
- Documents `IconTabFilter` list: show title (fallback fileName), category text, note, size, uploaded by/on; each row has a Download button.
- `onDownload(oEvent)`: get context object, `window.open(url, "_blank")` (browser sends the session cookies). Remove the toast.
- `onUpload`: opens a Dialog with Category Select (all categories), Title, Note, FileUploader; calls `uploadDocument` then reloads documents. Visible only when status is `DRAFT`, `BLOCKED` or `UNDER_EVALUA` (match with `indexOf` on 12-char status). Category choices are not limited to GEN.
- Keep `onPrint`, `onBack` unchanged.

### T5 — ApprovalDetail: documents download
Files: `ApprovalDetail.controller.js`, view (list l.~200).
- Load documents with `loadDocuments` using the doc type/id of the approval item (CPE or BUD).
- Replace the toast `onDownload` (l.~343) with the same `window.open(url)` implementation; show category and title in the list item.
- Approvers must see all documents read-only (no upload).

### T6 — CPE post-approval: actual vendor code (obs. 9)
Files: `Component.js` (`mapVendorEntity` / `mapCpeEntity`), `CPEDetail` view+controller.
- Map `Lifnr` into the vendor object (`lifnr`) and CPE (`vendorCode`, `vendorCodeLocked`).
- In CPEDetail show an "Actual Vendor Code" block when status is APPROVED (or any status after final approval) and `SetCpeVendorCode` exists: Input (10 chars, alphanumeric, leading zeros padded on backend) + Save button.
- `onSaveVendorCode`: `callFunction("SetCpeVendorCode", {CpeId, Lifnr})`, success toast, refresh the CPE list entry.
- Visible only for roles that may edit (reuse existing role flag; if none exists use `app>/isAdmin`).
- `CWIPCreate`: block "Create CWIP" with a clear message if the CPE has no vendor code (guard only when `vendorCode` property is supported by the backend metadata).

### T7 — CWIP: editable asset class description (obs. 10)
Files: `CWIPCreate.view.xml`, `CWIPCreate.controller.js`.
- Add `Input assetDesc` (maxLength 50) beside `cbAssetClass`, pre-filled from the selected asset class text, editable.
- Include `AssetDesc` in the `CreateCWIP` params only when `hasFunctionImport("CreateCWIP", ["AssetDesc"])`; otherwise send as today.
- Keep draft seeding via `_suggestAssetClass`.

### T8 — Admin: revise CPE amount along with attachment (obs. 11)
Files: `CPEDetail` view+controller.
- Button "Revise Amount" visible for admin only and only when `hasFunctionImport("ReviseCpeAmount", ["CpeId","NewAmount","Reason"])`.
- Dialog: New Amount (StepInput / Input number > 0), Reason (required TextArea), FileUploader (mandatory supporting document, category `AMT_REV`).
- Order: upload document first, then `ReviseCpeAmount`. Show error from `extractODataError`; refresh CPE list afterwards.
- Display the revision document in the Documents tab (category text "Amount Revision").

### T9 — DOA by document type (CPE vs Budget/CJN)
Files: `Component.js` (`mapDoaRuleEntity`), `BaseController.resolveDOA`, `DOAMatrix.controller.js/view`, callers (`BudgetDetail.controller.js:146`, `Evaluation.controller.js:196`, `CPECreate.controller.js:601`).
- `mapDoaRuleEntity`: add `docType` (default `""` when absent) and `active` (default true).
- `resolveDOA(sCapexType, nAmount, sDocType)`: filter rules `(!r.docType || r.docType === sDocType) && r.active !== false && (r.capexType === "*" || r.capexType === sCapexType)`; amount-range logic stays as it is; rules with an exact `docType` match are sorted before generic ones.
- Callers: CPECreate/Evaluation → `"CPE"`; BudgetDetail → `"BUD"`; DOAMatrix simulator gets a Select (CPE / Budget(CJN)) and passes it.
- DOAMatrix table: add a "Document Type" column and a filter. Chain display must support 7–8 steps without truncation (wrap / scroll).
- Approver chain text comes from the backend; do not hard-code the roles in the UI.

### T10 — Unit quota per plant (obs. 12)
Files: `Component.js` (config mapping), `BaseController.checkQuota`, `UnitQuota.controller.js/view`.
- Map any ConfigSet key starting with `QUOTA_YEAR_CAP_` into `config>/quota/plantCaps` (`{WERKS: amount}`); keep `QUOTA_YEAR_CAP` as the default.
- `checkQuota(nUsedThisFY, nRequest, sPlant)`: cap = `plantCaps[sPlant]` if defined, else default. Single-request cap logic unchanged. Callers pass the plant.
- UnitQuota page shows each plant's own cap (Pacharia 5 lakh, others 2 lakh when configured by backend); no hard-coded numbers.
- Note: rule "any unit quota must not exceed ₹0.50 lakh" is enforced by the backend; UI only displays the backend message.

### T11 — Regression pass
- `npm run lint`, `npm run build`.
- Walk through the test list in section 6.
- Confirm `_bUseMock = false`, no console errors on app load, i18n keys all present.
- Append the final log entry summarising T1–T10.

---

## 5. i18N KEYS TO ADD (adapt names to existing conventions)

`fiscalYear`, `allYears`, `searchBudget`, `docTitle`, `docNote`, `docCategory`, `docDownload`, `docUpload`, `docFileTooBig`, `docBadType`, `docMissing`, `docUploadFailed`, `docNone`, `vendorCodeActual`, `vendorCodeSave`, `vendorCodeSaved`, `vendorCodeMissing`, `assetDesc`, `reviseAmount`, `reviseAmountReason`, `reviseAmountDoc`, `docTypeCol`, `backendNotReady`.

---

## 6. TEST CHECKLIST

1. Budgets: FY combo defaults to current FY, change FY, search text, "All years".
2. New CPE with 2 vendors: add vendor 2 and 3 — earlier vendor fields are not erased.
3. Submit with a missing RFQ/Quote/TCC/Negotiation/Justification → blocking list of missing documents; Save Draft still works.
4. Wrong extension or file > limit → toast, file rejected.
5. Submit with all documents → files uploaded one by one, then SubmitCPE; failed upload keeps DRAFT and shows which file failed.
6. Open the CPE → Documents tab lists files, download opens the file.
7. Approver opens the item → can see/download documents, cannot upload.
8. After final approval: vendor code can be saved; CWIP blocked without it.
9. CWIP: asset description editable and sent.
10. Admin: Revise Amount needs a reason and a document.
11. DOA simulator: CPE <10 lakh (7 steps), CPE >10 lakh (8 steps), Budget/CJN (8 steps).
12. Unit quota shows per-plant caps.
13. With the backend NOT deployed: app loads, no exceptions, new controls hidden or toast-only.

---

## 7. OUT OF SCOPE

- Backend ABAP, AL11 storage, DOA table changes.
- Financial evaluation 8% (already done), common pool removal (done), one-capex-per-year (done), technical evaluation (done).
- Warranty / GST default values (12 months / true) — separate decision.
- Any redesign of unrelated screens.

## 8. LOG ENTRY RULE

Each task ends with a numbered entry in `CAPEX_SESSION_LOG.md` (#71 onward): title, files touched, what changed, how to test, known limitations.
