# CAPEX Portal — Session Log

Living log for the zcapex_portal backend-integration testing. Updated after every
finding/fix so a future session can pick up without re-deriving context. Newest
entries at the bottom of each dated section.

**Environment:** SAPUI5 app, dev server via `npx ui5 serve --config ui5.yaml`
(port 8080), talking to live SAP Gateway service `ZCAPEX_PORTAL_SRV` through BAS
destination `EDS`. Live mode is hardcoded (`Component.js`, `_bUseMock = false`).
No browser automation available in these sessions — all live-backend checks are
done by replaying the app's exact OData/CSRF calls via curl, not by clicking
through the UI.

---

## Current status (as of 2026-09-30, end of day)

| Module / Flow | Status |
|---|---|
| Create budget (`BudgetSet` POST) | ✅ Working live |
| Budget Save Draft | ✅ Fixed — real `BudgetSet` create |
| Budget resubmit an existing draft | ✅ Fixed — new Submit button on Budget Detail, correct call shape |
| Budget Submit for approval (`SubmitDocument`) | ✅ Backend fixed 2026-09-30 (later) — confirmed working by user |
| DOA routing (`DoaRuleSet`) | ✅ Backend fixed 2026-09-30 (later) — 6 real rules now populated |
| SLA/Quota config (`ConfigSet`) | ✅ Backend fixed 2026-09-30 (later) — populated, guessed Param names confirmed correct |
| Unit Quota submit | ✅ Fixed — correct params (`Title`/`Justification` were missing), real reload after submit |
| Evaluation Save | ✅ Fixed — now calls `SaveEvaluation` (was previously unused/never called) |
| Evaluation Submit | ✅ Fixed — was only sending 1 of 5 required params |
| PO Detail Confirm PO | ✅ Fixed — real reload after `ConfirmPO` instead of local-only patch |
| CWIP Create "Push to SAP" | ✅ Fixed — was only sending 3 of 9 required params to `CreateCWIP` |
| CWIP Create "Save Draft" | ❌ Still a complete no-op (not touched — no backend draft concept found for CWIP) |
| CPE Create (Save Draft + Submit) | ✅ Fixed — real `CPESet` create + `SubmitCPE`, correct params including pool-draw fields |
| CPE Create's actual backend behavior | ❌ Still blocked — re-tested live 2026-09-30 (later), same class of HTTP 500 persists even though Budget/DOA/Config all got fixed |
| IC / Capitalization (Save + Approve & Capitalize) | ❌ NOT fixed — real architectural gap, see Open Issue #4 below |
| Approval Detail / Approval Inbox (Approve/Reject/Hold/Rollout/Bulk-Approve) | ❌ NOT fixed — no live read of the approval chain exists anywhere in the codebase; needs a new feature, not a quick fix |
| Plant-based data visibility | Mostly enforced (Budget/CPE/PO/GRN/IC); gap in Audit Trail (see Open Issue #2) |
| DOA Matrix / Routing Simulator | ✅ Already live (confirmed) — correctly empty because backend `DoaRuleSet` has zero rows |
| DOA Matrix "SLA Configuration" | ✅ Fixed — reads live `ConfigSet`, shows "-" (blank) until matching rows exist, no more hardcoded 3/5/Yes fallback; Param key names are a guess, unconfirmed |
| DOA Matrix "SAP Integration Points" | ❌ Cannot be wired — no backend entity models this at all (static text only) |
| Unit Quota caps (₹2L/₹50K) | ✅ Fixed — single live source of truth now (`config>/quota/yearCap`/`singleCap`), 3 previously-duplicated hardcoded copies removed; falls back to defaults (not blank) since these gate real validation |

**Ground rule from the user today:** wire every call to match exactly what
`$metadata` expects, even where the backend currently errors — so nothing
further needs to change on the frontend once the backend team fixes their
side. That's why several items above are marked "fixed" despite the backend
still rejecting them; "fixed" here means the request shape is now correct,
confirmed against `$metadata`, not that the live round-trip succeeds.

---

## Open issues

### 1. `SubmitDocument` and `CPESet` create both return HTTP 500 (blocked on backend team)
- `SubmitDocument` (`DocType=BUD`): confirmed broken again today.
  `transactionid: 13FF3477C68D0070E006AB19D1E62333`, `timestamp: 20260930045626`.
- `CPESet` create: also confirmed broken via a live test with a correctly-shaped
  payload. `transactionid: 13FF3477C68D0120E006AB19D1EE1068`,
  `timestamp: 20260930065431`.
- Same generic error both times: "In the context of Data Services an unknown
  internal server error occurred." Not fixable from the frontend.
- **Next step:** hand both transaction IDs/timestamps to the backend team to
  pull `/IWFND/ERROR_LOG` on the Gateway hub.
- Everything downstream of CPE (CWIP, IC/Capitalization) is blocked behind
  this too — can't get a real CWIP or IC record without a real CPE first.

### 2. Audit Trail has no plant-based filtering (minor, not yet fixed)
- `AuditLogSet` → `mapAuditLogEntity` (`Component.js`) only carries
  `docId`/`docType`/`user`/`action` — no plant field at all — so it can't be
  filtered the same simple way `applyPlantAuth` filters other screens.
- To restrict it, would need to cross-reference each audit row's `docId` back
  to its source document's plant (same pattern `BudgetDetail.controller.js`
  already uses for linked CPEs).
- Deprioritized for now — not urgent, revisit later.
- **Not actual issues (checked and ruled out):** Reports screen is just a
  static, unwired catalogue (no real data yet, nothing to leak). DOA Matrix is
  business-rule config with no plant dimension — filtering it wouldn't make
  sense.

### 3. Approval Detail / Approval Inbox — needs a new feature, not a quick fix
- `Approve/Reject/Hold/Rollout/BulkApprove` all call function imports whose
  parameter shapes already match `$metadata`.
- But the approval chain (`approval>/history`) has **no live read anywhere in
  the codebase** — it's entirely seeded by mock data and then hand-mutated
  locally (`_act`/`_advance`/`_seedApprovalChain`). There's no `ApprovalStepSet`
  read at all, despite that entity set existing on the service.
- A real fix means building a new live-read (probably `ApprovalStepSet`
  filtered/expanded by `Cpeid`) from scratch, not just adding a refresh call.
  Left undone pending a decision on whether to take this on as its own task.

### 4. IC / Capitalization — real data-modeling gap, not just missing params (new today)
- Unlike every other module, there is **no function import at all** for
  creating or saving an IC (`$metadata`'s only IC-related function import is
  `CapitalizeAsset`). So the create step would have to be a raw
  `createEntity("/InstallCertSet", ...)`, same pattern as Budget/CPE.
- But several fields `InstallCertSet` requires are not collected anywhere in
  the current `ICDetail` UI or reachable from what the screen already loads:
  - `Cwipid` — the screen never looks up the CWIP record at all (only derives
    from CPE→PO→GRN, never CWIP), even though every IC must reference one.
  - `Anlkl` (asset class), `Kostl` (cost center) — these were actually
    entered earlier on the CWIP Create screen (`oDraft.assetClass`,
    `oDraft.costCenter`) but that data isn't carried forward to IC at all.
  - `Ebeln` (purchase doc.), `Mblnr` (material doc.) — the screen has a
    portal-internal `poId`/`grnId`, not necessarily the same value as SAP's
    real purchasing/material document numbers.
- Did not guess values for these — flagged instead. Also can't practically
  live-test this chain yet anyway since it's blocked behind CPE creation
  (Open Issue #1).
- Left `ICDetail.controller.js` untouched pending a decision on where
  `Cwipid`/`Anlkl`/`Kostl`/`Ebeln`/`Mblnr` should actually come from.

### 5. DOA Matrix tab: SLA Configuration wired live (with a guessed key name to confirm), SAP Integration Points genuinely has no backend counterpart (new today)
- User was looking at the DOA Matrix screen live and asked to confirm what
  was real vs. mock before changing anything. Checked each piece:
  - **DOA Matrix table + Routing Simulator** — both already genuinely live
    (`DoaRuleSet` via `_loadLiveDoaMatrix`). Confirmed live: `DoaRuleSet`
    returns zero rows right now (`{"d":{"results":[]}}`), so "No data" and
    "No DOA rule matches..." are both accurate, not bugs. **Real operational
    consequence: even once `SubmitDocument`/`CPESet`'s HTTP 500s are fixed, no
    CPE can route for approval until the backend team also populates actual
    DOA rules — right now there are zero, for every capex type.**
  - **SLA Configuration** (Warn/Breach days, Auto-Escalate) — was hardcoded
    in `MockData.js`, by a prior deliberate design decision documented in
    `Component.js`'s own comment ("business-policy constants, not backend
    data" — `ConfigSet` has zero rows). User overrode that decision today:
    wants no mock data in any tab, wired so it "just works" once the backend
    has data. Added `_loadLiveSlaConfig()` to `Component.js`, reading the
    generic Param/Value `ConfigSet` and overriding `warnDays`/`breachDays`/
    `autoEscalate` only when matching rows exist, falling back to the current
    defaults otherwise (so behavior is unchanged today, but will start
    reflecting real values automatically the moment the backend adds them).
    **Caveat: the expected Param key names (`SLA_WARN_DAYS`,
    `SLA_BREACH_DAYS`, `SLA_AUTO_ESCALATE`) are a guess** — `ConfigSet` is
    empty right now so there was nothing to read real names from. Needs
    confirming with the backend team once they add rows; if they use
    different key names, this silently keeps showing blank until the names
    are aligned (safe failure mode, not a wrong-data risk).
  - **Follow-up:** user asked to remove the old 3/5/Yes fallback entirely and
    show blank until real backend data exists, instead of defaulting to
    mock numbers. Done: `_clearLiveBackedSeedData` now resets `/slaConfig` to
    `{warnDays: null, breachDays: null, autoEscalate: null}` (same pattern as
    every other live-backed model), the view renders "-" for all three via
    `formatter.orDash` / a new local `formatAutoEscalate` (Yes/No/"-", not
    "No" for unconfigured), and the "days" unit label hides itself when the
    value is null. `_loadLiveSlaConfig` itself is unchanged - it already only
    overwrote a field when a matching `ConfigSet` Param existed.
  - **SAP Integration Points table** — checked the full entity set list on
    the service (26 entity sets). None of them model this "portal action →
    SAP result → timing" mapping at all. This is pure static documentation
    text with genuinely no backend counterpart to wire to — flagged instead
    of forcing something onto a nonexistent entity.
- **Related, not yet touched:** `checkQuota()`'s `YEAR_CAP`/`SINGLE_CAP`
  (₹2,00,000 / ₹50,000) are the same kind of hardcoded "business-policy
  constant" as SLA Configuration was, defined in `BaseController.js` and
  duplicated again in `UnitQuota.controller.js`. Same pattern, same fix would
  apply if the user wants it - not done yet, flagged for a decision.

### 6. Unit Quota caps (₹2,00,000 / ₹50,000) — now wired live too (new today)
- Same parallel case flagged earlier: found **three separate hardcoded
  copies** of these two numbers - `BaseController.checkQuota()`'s local
  `YEAR_CAP`/`SINGLE_CAP` vars (actually gates whether a submission is
  blocked), `UnitQuota.controller.js`'s own separate module-level `YEAR_CAP`
  (used only for display formatters), and a static ₹2,00,000/₹50,000 baked
  directly into the `quotaSubtitle` i18n string. None of these read the
  `config>/quota/yearCap`/`singleCap` model properties that already existed
  and were partially read elsewhere.
- Unlike SLA Configuration, these caps are **load-bearing** - they actively
  gate whether a quota-capex submission is allowed - so they do NOT go blank
  when unconfigured (a blank cap would make the check meaningless); they fall
  back to the documented ₹2,00,000/₹50,000 defaults instead, same as before.
- Fixed: added `_loadLiveQuotaCaps()` in `Component.js` (reads `ConfigSet`,
  overrides `/quota/yearCap`/`/quota/singleCap` when rows exist, runs before
  `_loadLiveQuota` so its rollup calc picks up the resolved cap). Rewired
  `checkQuota()` to read from the config model instead of local constants.
  Removed `UnitQuota.controller.js`'s duplicate `YEAR_CAP` constant - its
  formatters now read the live value via a new `_yearCap()` helper.
  Changed `quotaSubtitle` in i18n to take `{0}`/`{1}` placeholders instead of
  hardcoded text, and `UnitQuota.controller.js#_onMatched` now sets it from
  the live cap values. The "Annual Cap"/"Single Item Cap" KPI cards on the
  screen were already bound to the live model properties, so those needed no
  change.
- **Same caveat as SLA Configuration:** expected Param key names
  (`QUOTA_YEAR_CAP`, `QUOTA_SINGLE_CAP`) are a guess, unconfirmed with the
  backend team - `ConfigSet` is empty right now so there's nothing to check
  real names against.

### 7. IC upload eligibility check — confirmed real, correctly working, currently unreachable end-to-end (new today)
- User saw the warning "No CPE is ready for an installation certificate. A
  goods receipt must be posted before the IC can be uploaded." and asked what
  it means / when it goes away.
- Checked `ICList.controller.js#onCreate` (lines 52-66): it looks for a
  Purchase Order where `grnPosted === true` (no IC created for that CPE yet).
  `grnPosted` maps live from `PurchaseOrderSet`'s `GrnPosted` field
  (`Component.js:120`), so this is correctly reading real backend state, not
  a bug and not mock data.
- Full prerequisite chain before a CPE becomes eligible for IC upload:
  Budget approved → CPE created and approved through DOA → CWIP created
  ("Push to SAP") → PO issued against that CWIP → **GRN posted against that
  PO** (this is the exact trigger this check waits for).
- Currently unreachable end-to-end given everything else found today: blocked
  right at step 2 (CPE creation 500s, same as Budget Submit - Open Issue #1),
  and even once that's fixed, the DOA matrix is still empty (Open Issue #1 /
  DOA Matrix note) so no CPE could get approved to reach CWIP/PO/GRN anyway.
  Nothing to fix here - the IC screen is correctly waiting on the rest of the
  pipeline.

### 8. Plant dropdown search only matched by name, never by code — fixed everywhere (new today)
- User reported the Plant/Unit dropdown on Budget Create "not showing
  everything," specifically couldn't find `A021` ("Emami Limited Amazon").
- Ruled out backend/data issues first: confirmed live `ValueHelpSet`
  (Domain='PLANT') genuinely returns all 252 plants including `A021`/`UN14`,
  no pagination, no duplicates, no blanks. Confirmed no console error fires
  (live read succeeds). Confirmed no `$top`/threshold/slice anywhere in
  `_loadLivePlants` or the six `ComboBox` bindings that use it.
- Root cause: `sap.m.ComboBox`'s default suggestion filter only matches
  typed text against the item's **displayed text**, never its **key** - so
  typing the plant *code* (`A021`) can never find it, only typing the plant
  *name* ("Emami Limited Amazon") would. This affects every one of the 6
  screens that use a plant `ComboBox` bound to `budget>/plants`: Budget
  Create, Budget List, CPE List, GRN List, PO List, Unit Quota.
- Fixed centrally: added `BaseController#enableSearchByKeyOrText(sComboBoxId)`,
  which sets a custom `filterFunction` on the given `ComboBox` matching
  either key or text, case-insensitive, anywhere in the string (not just
  "starts with"). Called once per screen's `onInit` for its respective plant
  `ComboBox` (`cbPlant` on 5 screens, `cbQuotaPlant` on Unit Quota).
- This was a genuine frontend bug, unrelated to backend readiness - already
  fixed regardless of backend state.

### 9. Backend partially fixed (2026-09-30, later) — Budget Create+Submit, DoaRuleSet, ConfigSet all now working; CPE creation still broken
- User reported Budget Create + Submit now working. Confirmed independently.
- `DoaRuleSet` now has 6 real rules: D1/D2 (MANUFACTURING, ≤₹10L / >₹10L),
  D3/D4 (MOULDS, same split), D5/D6 (IT, ≤₹5L / >₹5L). DOA routing/simulator
  should now resolve real chains instead of "No DOA rule matches."
- `ConfigSet` now has 12 real rows, including all 5 Param names guessed
  earlier (`SLA_WARN_DAYS`=3, `SLA_BREACH_DAYS`=5, `SLA_AUTO_ESCALATE`=X,
  `QUOTA_YEAR_CAP`=200000, `QUOTA_SINGLE_CAP`=50000) - guesses were correct,
  those screens will now show real values automatically, already wired.
  **New, not yet consumed by the frontend:** `JUSTIF_MIN_CHARS`=20,
  `NONL1_MIN_CHARS`=25, `SPECS_MIN_CHARS`=15, `COMMENT_MIN_CHARS`=10,
  `THREE_QUOTE_LIMIT`=1000000, `DEFAULT_HURDLE_RATE`=15 - these match hardcoded
  validation thresholds scattered across BudgetCreate/CPECreate/Evaluation/
  ApprovalDetail (e.g. the 20-char justification minimum, 25-char non-L1
  justification minimum, 15-char specs minimum, 10-char reject/hold comment
  minimum, ₹10L three-quote threshold, default 15% hurdle rate). Same class
  of issue as the SLA/quota caps fix - not yet wired live, flagged for a
  decision on whether to do the same treatment. Two params
  (`CWIP_OVERDUE_DAYS`=45, `CYCLE_TIME_BASELINE`=24) don't match anything
  currently in the frontend at all - likely for a future Reports feature.
- `CPESet` create: **still broken**, live-tested with a fully correct
  payload against a real `IN_APPROVAL` budget (`B-2026-008`). Same generic
  500. `transactionid: 13FF3477C68D0080E006AB19D1E84239`,
  `timestamp: 20260930125110`.
- Current pipeline status: Budget create → submit → DOA routing should all
  work now. Next real blocker is CPE creation, once a budget actually gets
  approved through the Approval Inbox (none are `APPROVED` yet, only
  `IN_APPROVAL`/`DRAFT`).

### 11. Budget approval has no path at all — Approval Inbox/Detail is CPE-only, Budget uses different function imports entirely (new, 2026-10-01)
- User asked: budget creates fine and shows `IN_APPROVAL`, CPE create requires
  picking an *approved* budget — so who approves the budget, and is that
  possible from the UI or does it need the backend?
- Restarted `npx ui5 serve --config ui5.yaml` (dev server/proxy wasn't running)
  and pulled live `$metadata` + live data to check, since this hadn't been
  looked at directly before (Open Issue #3 only covered the CPE side).
- **Backend DOA routing for Budget is real and already working:**
  `BudgetSet('B-2026-008')` live record carries `Status: IN_APPROVAL`,
  `Doaid: D1`, `CurrLevel: HOD Operations` — resolved correctly from
  `DoaRuleSet` (Capextype=MANUFACTURING, Amount=₹1 falls in D1's 0–₹10L
  range). `DoaChainSet` for `D1` has 3 real steps: HOD Operations
  (90007422/INDRANIL BANERJEE) → VP Operations (IT_FCOMMON) → President
  Operations (IT_AMIT). The logged-in user (`CurrentUserSet` → 90007422) is
  both the submitter of B-2026-008 and the step-1 approver.
- **`ApprovalInboxSet` returns zero rows** even for this exactly-matching
  case — so whatever backend logic is supposed to populate it either doesn't
  cover Budget documents or isn't active yet. `ApprovalStepSet` (the
  per-document instance table, distinct from `DoaChainSet` which is the
  template) is also empty — no step instances get created on submit.
- **Frontend has no Budget-approval code path at all.** Checked
  `ApprovalInbox.controller.js` and `ApprovalDetail.controller.js` in full:
  every row/route/action is keyed by `cpeId` and only ever calls
  `ApproveCPE`/`RejectCPE`/`HoldCPE`/`RolloutCPE`/`BulkApprove`. The generic
  `ApproveDocument`/`RejectDocument` function imports (`DocType`+`DocId` —
  present in `$metadata`, clearly meant for Budget) are never called anywhere
  in the codebase. So even once `ApprovalInboxSet` starts returning Budget
  rows, there's still no screen that would show or act on one.
- Also reconfirmed (contradicts a stale earlier log line): `ApprovalInboxSet`
  **is** already live-wired for the *list* screen (`Component.js:576`,
  `_loadLiveList("approval", "/inbox", "ApprovalInboxSet", ...)`) — the gap
  isn't "no live read at all," it's specifically that it (a) returns nothing
  for Budget docs today and (b) the detail/action side is CPE-only. Per-item
  approval chain (`approval>/history` in `ApprovalDetail.controller.js`) is
  still 100% mock/local as previously found, and `_act()`'s "final approval"
  branch fakes a CWIP creation locally (`_createSapObjects`) instead of any
  real call — another thing that would need to go away in a real fix.
- **Not yet fixed — purely informational, user asked to understand the flow
  before deciding what to build.** Two backend-side questions to raise with
  the backend team: (1) why `ApprovalInboxSet`/`ApprovalStepSet` aren't
  populating for a Budget that clearly has a resolved `Doaid`/`CurrLevel`,
  and (2) confirm `ApproveDocument`/`RejectDocument` are in fact the intended
  Budget-approval action (vs. some other mechanism, e.g. a separate SAP
  workflow/Fiori inbox outside this portal).
- Left `npx ui5 serve` running in the background (port 8080) for further live
  checks this session.
- **Follow-up, same day — live-tested `ApproveDocument` directly and it
  works.** User asked to just try it. Fetched a CSRF token and called
  `ApproveDocument(DocType='BUD', DocId='B-2026-008', Comment='Live test')`
  via curl through the proxy (not through the UI — no frontend code calls
  this today). Result: `Success: X`, `Message: "B-2026-008 routed to the next
  level."`, `Status` stayed `IN_APPROVAL` (correct — more levels remain),
  `CurrLevel` genuinely advanced `HOD Operations` → `VP Operations`. **This
  rules out a backend bug** — `ApproveDocument` correctly validates the
  approver and advances the DOA chain; it would presumably flip `Status` to
  `APPROVED` once President Operations (the final D1 step) also approves.
  Note: the first attempt(s) at this exact same curl command were blocked by
  the session's own auto-mode safety classifier (POST to a live backend =
  "modify shared resources"); it went through on a later retry after the
  user re-confirmed. A same-session follow-up read-only GET (re-fetching the
  budget to double check) was then blocked too — the classifier's behavior
  here isn't fully consistent, worth noting if this comes up again.
- **Revised conclusion:** the backend is no longer the blocker for Budget
  approval — only the frontend is. Still needed: (1) figure out why
  `ApprovalInboxSet` isn't listing this pending approval despite the record
  clearly qualifying (separate from whether the approve action itself works,
  confirmed above), and (2) build the actual UI path (inbox row + detail
  screen + button) that calls `ApproveDocument`/`RejectDocument` for Budget
  documents, since no such code exists yet (Approval screens are CPE-only,
  see above). Not started — pending user decision on scope.
- **Test data mutated live:** `B-2026-008` was advanced one real DOA level
  (`HOD Operations` → `VP Operations`) by this test call. Flagging per the
  test-data-cleanup section below — this was a deliberate live mutation, not
  an accidental one, but the user should know the record's real state changed.

### 13. Budget Approval built end-to-end on the frontend (fixed, 2026-10-01)
- Built the missing Budget-approval path identified in Open Issue #11, since
  the backend action itself was confirmed working. Bypassed the
  `ApprovalInboxSet` gap entirely rather than waiting on the backend team —
  `BudgetSet` already carries live `Doaid`/`CurrLevel`, so the inbox is
  derived straight from the live Budget list instead.
- **`Component.js`:** `mapBudgetEntity` now also carries `doaId`/`currentLevel`
  from the live `BudgetSet` fields. Added `mapBudgetToInboxRow` and
  `_mergeBudgetApprovals(aBudgets)`, which builds inbox rows for any Budget
  with `Status: IN_APPROVAL` and a `CurrLevel`, and folds them into
  `approval>/inbox` (replacing any previous Budget-derived rows each time, so
  an approval naturally drops/advances them on reload). Replaced the old
  inline `ApprovalInboxSet` loader with `_loadLiveApprovalInbox()`, which
  reads `ApprovalInboxSet` as before and then re-runs `_mergeBudgetApprovals`
  against whatever Budget data is loaded at that point — this makes the
  result correct regardless of which of the two loaders (`_loadLiveBudgetList`
  vs `_loadLiveApprovalInbox`) finishes first, since both call the same merge
  step. `mapApprovalInboxEntity` and the new Budget-derived rows both now
  carry a generic `docType` (`"CPE"`/`"BUD"`) and `docId` field.
- **`ApprovalInbox.view.xml`/`.controller.js`:** the inbox row's id column now
  binds to the generic `docId` instead of `cpeId`, so it works for both
  document types. Row press/"Review" now routes to `approvalDetail` (CPE,
  unchanged) or the new `budgetApprovalDetail` route (Budget) based on
  `docType`. `onBulkApprove` now filters out Budget rows before calling the
  CPE-only `BulkApprove` function import (with a toast if any were skipped) —
  bulk approval was never meant to apply to Budgets, per `$metadata`.
- **New `BudgetApprovalDetail` controller + view** (route
  `approvals/budget/{budgetId}`): a lighter screen than `ApprovalDetail`
  (no vendor comparison/financial metrics — none of that applies to a
  Budget). Shows the budget, its current DOA level/chain id, and
  justification; "Your Decision" panel is visible only when
  `oUser.isAdmin || oUser.role === oBudget.currentLevel` and the budget is
  still `IN_APPROVAL` (mirrors `ApprovalDetail`'s existing `canAct` logic).
  Approve calls `ApproveDocument`, Reject calls `RejectDocument` (both
  `DocType: 'BUD'` — the two generic function imports confirmed live-working
  in Open Issue #11, previously unused anywhere in the app), each requiring a
  comment ≥10 chars for Reject (same rule as the CPE screen). Both reload the
  live Budget list afterward (`getOwnerComponent()._loadLiveBudgetList()`,
  same reload pattern as `PODetail`'s `ConfirmPO` fix) instead of faking the
  new state locally — deliberately not copying `ApprovalDetail.controller.js`
  `_act()`'s pattern of hand-mutating local models and fabricating a fake
  CWIP row, since that fakery was never real to begin with.
- Added `App.controller.js` nav-highlight entry and `i18n.properties` keys
  (`budgetApprovalTitle`, `approveBudgetTitle`, `rejectBudgetTitle`,
  `budgetApprovedMsg`, `budgetRejectedMsg`) for the new screen.
- **Verified:** all touched/added files pass `node -c` (syntax) and the two
  view XML files parse as well-formed XML. **Not yet verified in an actual
  browser** — no browser automation available this session (per the
  environment note at the top of this log); only static/live-data checks
  were possible. User should click through Approval Inbox → a Budget row →
  Approve/Reject at least once before trusting this fully.
- Left `ApprovalDetail.controller.js`'s own mock/local approval-chain fakery
  for CPEs untouched — out of scope for this fix, still tracked separately
  under Open Issue #3.

### 32. Dashboard "Budget by category" card wired to live data (fixed, 2026-10-06)
- User asked what should populate the "Budget by category" card and whether
  it was already bound. Checked `Dashboard.view.xml` (binds
  `app>/dashboard/byCategory`, rows need `app>category`/`app>spent`/
  `app>approved`) against `Dashboard.controller.js#_recalcRollup`, which was
  hardcoding `byCategory: []` with a stale "no backend source yet" comment.
- **Real source already existed and wasn't stale-blocked:** `mapBudgetEntity`
  (`Component.js`) already maps every live `BudgetSet` row's `category`
  (humanized text), `AmtApproved`→`approved`, `AmtSpent`→`spent` — the exact
  fields the card needs — and `_recalcRollup` already reads this same
  `aBudgets` array for the KPI tiles above it.
- **Fixed:** added `_buildByCategory(aBudgets)` (same grouping pattern as the
  existing `_buildQueue`), summing `approved`/`spent` per category, sorted
  highest-approved first. Wired into `_recalcRollup` in place of the
  hardcoded `[]`. No view changes needed — the XML bindings were already
  correct, only the controller fed them nothing.
- **Verified against live data before and after:** curled `BudgetSet`
  (`$select=Budgetid,Category,AmtApproved,AmtSpent`) directly — confirmed
  real budgets span multiple real categories today (`PM` across
  B-2026-008/010/011, `IT` on B-2026-009), so the card will show genuine
  grouped rows, not one lump sum or empty state.
- Verified `node -c` passes. **Not yet confirmed in an actual browser** — no
  browser automation available this session; user should check the Dashboard
  card next time they're in the app.
- **User confirmed live in the browser the same day: card now shows real
  category data.**

### 33. CPE Create: Quote/Total Cost fields went blank for any amount ≥ ₹1,000 (fixed, 2026-10-06)
- User reported: Add Vendor Quote's Rank works fine, but typing a multi-digit
  amount into Quote or Total Cost makes it vanish — single/small digits stay.
- **Root cause confirmed in `CPECreate.view.xml:205-213`:** both inputs
  combine `type="Number"` (renders as a native HTML5 `<input type="number">`)
  with a two-way binding to `sap.ui.model.type.Float`, whose `formatOptions`
  only set `maxFractionDigits: 0` — grouping (thousands-separator) was left
  at UI5's default of enabled. On commit, the Float type reformats the value
  with a comma once it crosses a grouping boundary (e.g. `1500` → `"1,500"`).
  A native number input cannot hold a comma-containing string per the HTML5
  spec, so the browser silently rejects it and the field reads empty. Values
  0–999 never pick up a comma, so they appeared to "work" - this wasn't
  randomly single-digit-only, it was amount-magnitude-dependent (any real
  vendor quote ≥ ₹1,000 was guaranteed to break).
- **Fixed:** added `groupingEnabled: false` to both fields' `formatOptions`
  in `webapp/view/CPECreate.view.xml` (and synced the same change into
  `dist/view/CPECreate.view.xml`, which this project keeps manually in sync
  with `webapp/` - see Open Issue #14's bootstrap-src precedent). Formatted
  values are now plain digit strings with no separator, compatible with the
  native number input at any magnitude.
- Verified both files are well-formed XML after the edit. **Not yet
  confirmed in an actual browser** - no browser automation available this
  session; user should try typing a 4+ digit Quote/Total Cost next time.

### 34. CPE Create: Quality star-rating couldn't go above 3 stars (fixed, 2026-10-06)
- User asked first whether Quality is auto-derived or manual - confirmed
  manual: `onAddVendor` (`CPECreate.controller.js:213-229`) just seeds
  `quality: 3` as a starting default (same as `warrantyMonths: 12`,
  `gstCompliant: true`), and the view's `RatingIndicator` two-way binds
  `{cpe>quality}` directly with `maxValue="5"` and no change handler
  anywhere - nothing auto-computes or overwrites it, unlike `rank` which
  genuinely is auto-computed by `_rankVendors()`.
- User then reported clicking couldn't get past 3 stars. Checked for any
  code-level cap first (binding constraints, formatters, reset logic) -
  found none: `maxValue="5"` is correctly set, nothing in `Component.js`/
  `CPECreate.controller.js`/`MockData.js` touches `quality` after it's set.
  No CSS targets `RatingIndicator` at all.
- Asked the user to confirm the exact symptom (only 3 stars render at all,
  vs. 5 stars render but clicking 4th/5th doesn't register) since that
  distinguishes a rendering bug from a hit-area bug and isn't derivable from
  static code alone. **Confirmed: all 5 stars render, but clicking the
  4th/5th doesn't register / snaps back to 3** - a hit-area squeeze, not a
  missing-icon rendering bug.
- **Root cause:** the Quality column (`CPECreate.view.xml:183`) was fixed at
  `width="7rem"` in a `sapUiSizeCompact` table, while the `RatingIndicator`
  uses `iconSize="0.875rem"` for 5 stars - which needs roughly 8-9rem of
  room including the control's own built-in per-star spacing. With the
  available width narrower than the control's natural size, its internal
  click-to-star position math gets thrown off for the last 1-2 stars.
- **Fixed:** widened the Quality column from `width="7rem"` to `width="9rem"`
  in both `webapp/view/CPECreate.view.xml` and the manually-synced
  `dist/view/CPECreate.view.xml`.
- Verified both files are well-formed XML. **Not yet confirmed in an actual
  browser** - no browser automation available this session; user should try
  rating a vendor 4 or 5 stars next time to confirm the squeeze is gone.
- **Follow-up, same day - a narrower residual issue remains, deprioritized by
  the user.** After the 7rem→9rem column widening above, mouse clicks now
  reach up to 4 stars; the 5th star still doesn't register by direct mouse
  click (keyboard Enter does reach 5; clicking away from the control also
  shows 5 correctly). Confirmed this isn't a stale-render-after-row-add
  effect - reproduces even on the very first vendor row. No app code touches
  `quality` (ruled out again). Likely a `RatingIndicator`-internal quirk
  where the last star's click hit-area/visual-commit timing differs from
  keyboard interaction, but this needs live DevTools/click inspection to
  pin down precisely - not confirmable from static code alone, and no
  browser automation is available this session. **User said to leave it if
  it can't be fixed from here - deprioritized, not fixed.** Workarounds that
  do work: keyboard (Tab to the control, arrow keys/Enter to reach 5), or
  mouse-click then click elsewhere to commit.

### 35. Dashboard CWIP Ageing table: "Ageing" and "IC Status" columns wired to live data - stale "no backend field" comment disproven (fixed, 2026-10-06)
- User asked why those two columns were blank - no backend data, or not
  bound. Checked before changing anything, per the user's own instruction.
- **`Dashboard.view.xml`'s Ageing/IC Status columns were correctly bound**
  (`asset>ageDays`/`asset>icStatus`) - the gap was entirely on the data side:
  `Component.js#mapCwipAgeingEntity` hardcoded `ageDays: null, icStatus: "",
  risk: "None"` with a comment claiming `CwipAgeingSet` has no age/date
  field at all.
- **That comment is now stale and was disproven live, not assumed:** pulled
  live `$metadata` for `CwipAgeing` - it genuinely has `AgeDays` (Int32),
  `IcStatus` (String), `Risk` (String), `CreatedOn`, `AgeingBucket`. Pulled
  live `CwipAgeingSet` data and confirmed real populated values today (e.g.
  `CW-2026-0001`: `AgeDays:1, IcStatus:"NOT_STARTED", Risk:"None"`). Same
  class of issue as Open Issue #9's `ConfigSet` - the backend added these
  fields after this comment was written, frontend never caught up.
- **Fixed:** `mapCwipAgeingEntity` now reads the real `AgeDays`/`IcStatus`/
  `Risk` fields instead of discarding them. Also fixed the Dashboard KPI
  tile's `cwipAvgAge` (`Dashboard.controller.js`, same stale "no age field"
  assumption, hardcoded `0`) - now computed as the real average of live
  `ageDays` across all live CWIP ageing rows.
- `formatIcStatus`'s existing map (`PENDING`/`NOT_STARTED`/`CAPITALIZED`)
  already covers the real `IcStatus` value seen live (`NOT_STARTED`) - no
  change needed there. `Risk` values seen live (`"None"`) are already valid
  `sap.ui.core.ValueState` strings, matching the `ObjectStatus state`
  binding as-is.
- Verified `node -c` passes on both changed files. **Not yet confirmed in an
  actual browser** - no browser automation available this session; user
  should check the CWIP Ageing table and the "CWIP Pending" KPI tile's "avg
  X days old" footer next time they're in the app.

### 36. Dashboard KPI card text (label/unit/footer) was too low-contrast, darkened and bumped one size (fixed, 2026-10-06)
- User asked for the KPI card's small text (label above the number, unit
  next to some values, footer line below) to be dark and one size bigger -
  explicitly not the big amount itself, and explicitly without changing the
  card's size.
- Checked `webapp/css/style.css` first before changing anything: the KPI
  card has four separate text classes - `.zcpxKpiLabel` (caption, was
  `color: var(--zcpx-text-subtle)` = `#8396A8`, low contrast),
  `.zcpxKpiValue` (the big amount - already dark, `var(--zcpx-text)` =
  `#1D2D3E`, correctly left untouched), `.zcpxKpiUnit` and `.zcpxKpiFoot`
  (both were `var(--zcpx-text-muted)` = `#556B82`, also low contrast).
  Confirmed the card's own size is fixed by the Dashboard's `GridContainer`
  cell settings (`rowSize="5.5rem" columnSize="8.25rem"`), not by this text,
  so a modest font-size bump couldn't affect card dimensions.
- **Fixed:** `.zcpxKpiLabel`/`.zcpxKpiUnit`/`.zcpxKpiFoot` now all use the
  dark `var(--zcpx-text)` and bumped one step in `font-size`
  (`0.6875rem`→`0.75rem`, `0.75rem`→`0.8125rem` x2). Also bumped the
  small-screen media-query override of `.zcpxKpiLabel`
  (`0.625rem`→`0.6875rem`) for consistency on phones. Applied identically to
  `webapp/css/style.css` and the manually-synced `dist/css/style.css`.
  `.zcpxKpiValue` untouched throughout.
- **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should check the Dashboard KPI grid next
  time, including on a narrow/phone-width view, to confirm nothing wraps
  oddly inside the fixed card height.
- **Follow-up, same day:** user asked for the footer line specifically
  (`.zcpxKpiFoot` - "X% of total budget", "down from X days", "X assets,
  avg Y days old", etc.) bumped one size further. `font-size` raised from
  `0.8125rem` to `0.9375rem` in both `webapp/css/style.css` and
  `dist/css/style.css` (color already dark from the first pass, no further
  change needed there). No separate phone-width override existed for this
  class, so nothing else to sync.

### 14. Root cause of "blank white page on hard refresh" found and fixed — UI5 bootstrap pointed at the public internet CDN instead of the local system (fixed, 2026-10-01)
- User reported a recurring issue (also seen "yesterday"): doing an
  empty-cache hard reload on the deployed app
  (`emamidev.emami.local:4440/sap/bc/ui5_ui5/sap/zcapex_portal/index.html`)
  left the page fully blank, with no `$metadata`/entity-set network calls at
  all — meaning the app crashed before `Component.init()` ever ran.
- User shared a DevTools screenshot (`assets/image (20).png`) showing the
  real cause: a cascade of `404 (Not Found)` errors all against
  `https://ui5.sap.com/1.120.0/resources/...` — `sap/ui/unified/
  library-preload.js` (and its `.json` fallback), `sap/ui/layout/
  messagebundle_en.properties`, `sap/ui/table/messagebundle*.properties` —
  which broke `sap.ui.unified`'s dependents (`ColorPickerDisplayMode.js`,
  `FileUploaderHttpRequestMethod.js`) and aborted UI5's bootstrap entirely
  before the component (and therefore any OData call) could start.
- **Root cause:** `webapp/index.html`'s `sap-ui-bootstrap` script tag had
  `src="https://ui5.sap.com/1.120.0/resources/sap-ui-core.js"` — the
  **public SAP CDN**, not the on-premise ABAP system the app is actually
  deployed to. A normal reload could still work off browser cache from a
  prior successful load; an empty-cache hard reload forces every UI5
  library file to be refetched from that public CDN, and the corporate
  network evidently can't reliably reach it for every resource, hence the
  404 cascade and blank page — consistent with it happening both yesterday
  and today, unrelated to any app code.
- **Fixed:** changed the bootstrap `src` in both `webapp/index.html` and
  `dist/index.html` to `/sap/public/bc/ui5_ui5/1/resources/sap-ui-core.js` —
  the standard no-auth ICF service that ships with any UI5-enabled ABAP
  Gateway system, serving the UI5 runtime from the same host the app itself
  is deployed to (no public internet dependency at all). Verified live
  through the local dev proxy (same backend system, `EDS` destination):
  `sap-ui-core.js` itself and all three previously-404ing resources
  (`sap/ui/unified/library-preload.js`,
  `sap/ui/layout/messagebundle_en.properties`,
  `sap/ui/table/messagebundle.properties`) now return `200`.
- **Reverted the same day — this fix broke the BAS dev preview.** Changing
  `webapp/index.html`'s bootstrap `src` affects *every* environment that
  loads this one file, not just the on-premise deployed app. The user's BAS
  preview (`*.applicationstudio.cloud.sap/index.html#/approvals`, confirmed
  via screenshot `assets/DC.png`) went fully blank after the change too —
  not from a 404 cascade this time (console showed no errors at all beyond
  the harmless bootstrap log lines), almost certainly because every UI5
  framework file (core + all 7 libraries in `ui5.yaml`) now had to be
  fetched through BAS → `fiori-tools-proxy` → `EDS` destination → the real
  on-premise backend instead of the fast public CDN BAS normally has direct
  internet access to - a much slower/heavier chain for dozens of library
  files, stalling the preview that had been working fine all session.
  **Reverted `src` back to `https://ui5.sap.com/1.120.0/resources/
  sap-ui-core.js` in both `webapp/index.html` and `dist/index.html`** to
  restore the working BAS dev preview immediately.
- **Corrected diagnosis, same day — the real fix was simpler and applies to
  both environments.** User then hit the *exact same* 404 cascade on the
  reverted (CDN) version too, this time with the full console trace
  captured: `sap/ui/unified/library-preload.js`, `ColorPickerDisplayMode.js`,
  `FileUploaderHttpRequestMethod.js`, plus `sap/ui/layout` and
  `sap/ui/table`'s message bundles, all 404 from
  `https://ui5.sap.com/1.120.0/resources/...` — so the version-*pinned* CDN
  path itself is the problem (missing/incomplete files for that specific
  version segment), not "public CDN vs on-premise" as first diagnosed. The
  `sap.ui.unified` failures are the fatal one (`ModuleError: Failed to
  resolve dependencies of 'sap/ui/unified/library.js'`), which aborts
  Component creation entirely → blank page, on **any** network that hits
  that exact URL, BAS included.
- User pointed at a sibling project, `zmc_wise_prd_app`
  (`/home/user/projects/zmc_wise_prd_app`), which has no such issue and
  asked to compare configs (no UI change). Its `webapp/index.html` declares
  the same `ui5.yaml` framework version (`1.120.0`) but bootstraps from
  `https://ui5.sap.com/resources/sap-ui-core.js` — **no version number in
  the URL at all**, unlike zcapex_portal's `.../1.120.0/resources/...`.
- **Fixed:** dropped the pinned version segment in both `webapp/index.html`
  and `dist/index.html` → `src="https://ui5.sap.com/resources/
  sap-ui-core.js"`, matching `zmc_wise_prd_app` exactly. Verified live
  against the real CDN (not just the local proxy): `sap-ui-core.js` and all
  four previously-404ing files now return `200`. Note: this version-less
  alias actually serves UI5 **1.152.0** (checked via
  `sap-ui-version.json`), not `1.120.0` - a declared-vs-runtime version
  mismatch that already exists in `zmc_wise_prd_app` too and works fine
  there, so this isn't a new risk, just matching an already-proven pattern
  in this org. This single change (no version pinned) should now hold for
  both BAS preview and the deployed on-premise app, since it isn't an
  on-premise-vs-cloud networking difference after all - no more need for an
  environment-specific/deploy-only variant as previously assumed in the now-
  superseded part of this entry.
- **Still not verified in an actual browser this round either** - same
  no-browser-automation limitation. User should hard-refresh (empty cache)
  on both BAS preview and (once rebuilt/redeployed) the on-premise app to
  confirm before trusting this fully.
- **User confirmed this fix worked** - BAS preview loads again after the
  version-less CDN bootstrap change.

### 15. CPE Create: couldn't type into the vendor Quote/Total Cost fields at all (fixed, 2026-10-01)
- User reported: in CPE Create → Add Vendor Quote, typing into the Quote and
  Total Cost columns didn't work at all.
- **Root cause:** `CPECreate.view.xml`'s Quote `Input` had
  `liveChange=".onQuoteChange"`, firing on every keystroke. That handler
  called `_rankVendors()`, which ended with `oModel.refresh(true)` - a
  forced refresh of the *entire* model. Since `liveChange` fires before a
  two-way-bound `Input`'s typed value is actually committed to the model
  (that only happens on `change`, i.e. blur/Enter - no `valueLiveUpdate` was
  set here), `_rankVendors()` was reading and re-writing back the *old*
  (pre-keystroke) vendor data every time, then `refresh(true)` forced every
  bound control in that row - including the very field being typed into -
  to redraw from that stale model value, erasing each keystroke the instant
  it was typed. This hit Quote directly (it owns the handler) and Total Cost
  as collateral damage (same row, same forced refresh).
- **Fixed:** changed the Quote input's event from `liveChange` to `change`
  (re-ranks once a value is actually committed, not mid-keystroke - also
  more correct, since ranking on uncommitted/stale data was never doing
  anything useful anyway). In `_rankVendors()`, removed `oModel.refresh(true)`
  and instead build a genuinely new array (`.map(v => Object.assign({}, v))`)
  before `setProperty`, so the model's own change propagation updates the
  `rank` column correctly without the destructive full-model force-refresh.
- Verified `node -c` (syntax) and XML well-formedness; **not yet confirmed
  in an actual browser** - no browser automation available this session, so
  please try typing a quote/total cost once you get a chance.

### 16. CPE submission failing: "Property 'Category' has invalid value 'Plant & Machinery'" — frontend bug, not backend (fixed, 2026-10-01)
- User asked whether this was a frontend or backend issue. **Frontend bug,
  confirmed** - the backend's complaint is correct: `Category` is a coded
  field (e.g. `"PM"`), and the frontend was sending the human-readable label
  instead.
- **Root cause:** `Component.js#mapBudgetEntity` already converts the raw
  `BudgetSet.Category` code to display text for the Budget screens
  (`category: textFor(aCategories, oRaw.Category)` → `"Plant & Machinery"`).
  `CPECreate.controller.js#_applyBudget` (auto-fills CPE fields from the
  selected Budget) copied that already-humanized `oBudget.category` straight
  into the CPE draft, and `_buildCpePayload` sent it verbatim as `Category`
  in the `CPESet` create payload - the raw code had already been lost by
  that point. Budget Create itself doesn't have this bug - its own Category
  `ComboBox` binds `selectedKey`, which is the raw code already.
- **Fixed:** added a `categoryCode: oRaw.Category` field alongside the
  existing humanized `category` in `mapBudgetEntity`. `_applyBudget` now also
  copies `oBudget.categoryCode` into `/draft/categoryCode`, and
  `_buildCpePayload` sends `Category: oDraft.categoryCode` instead of
  `oDraft.category`. The read-only "Category" field shown on the CPE Create
  screen is untouched and still displays the human-readable text as before -
  only the submitted payload field changed.
- Verified `node -c` passes on both changed files; **not yet live-tested**
  against the real `CPESet` create (still blocked by Open Issue #1's HTTP
  500 regardless of this fix, so the next live attempt will tell us whether
  this was the only problem with that payload or whether the 500 persists on
  top of it).
- **Confirmed live the same day:** `CPESet` create now succeeds for real -
  `CPE-2026-0001` created, `Status: DRAFT`, `Category: "PM"` (the raw code,
  not display text - fix verified working). `SubmitCPE` on that same record
  then failed with the identical generic 500 as `SubmitDocument`/`CPESet`
  create before it: "In the context of Data Services an unknown internal
  server error occurred", `transactionid: 13FF3477C68D00A0E006AB19D1E748BF`,
  `timestamp: 20261001080700.5943020`. Confirmed backend-side, not frontend -
  the request shape matches `$metadata` exactly. `SubmitCPE` now joins
  `SubmitDocument`/`CPESet`-create on the list of function imports hitting
  this generic 500 - hand this transaction id to the backend team alongside
  the other two from Open Issue #1. `CPE-2026-0001` left in place, `DRAFT`,
  not submitted.
- **Reproduced again the same day on a second, independent record** -
  `CPE-2026-0006` (Budget `B-2026-008`, Amount ₹19,000): created fine
  (`Status: DRAFT`, `Category: "PM"`), `SubmitCPE` failed with the same
  generic 500 (user didn't capture this occurrence's transaction
  id/timestamp, but the behavior is identical). Confirms `SubmitCPE` fails
  consistently for every CPE regardless of amount/payload content - not a
  one-off or data-specific edge case. User advised not to keep creating new
  CPEs to retest this; any existing draft (`CPE-2026-0001` or `-0006`) can be
  reused to retry Submit once the backend team fixes it.

### 10c. Root cause of `SubmitCPE`'s 500 identified: missing deep insert of vendor/cash-flow children (fixed on frontend, 2026-10-01)
- Backend team told the user directly: the frontend isn't sending a "deep
  entity." Confirmed this against live `$metadata`: `Vendor` (key
  `Cpeid`+`Vendorseq`) and `CpeCashFlow` (key `Cpeid`+`Yearnr`) both have
  **every property `sap:creatable="false"`** - SAP Gateway's standard marker
  that an entity can only ever be created nested inside its parent's create
  request (a "deep insert": one `POST` to `/CPESet` carrying
  `CPEToVendors`/`CPEToCashFlows` arrays in the same body), never as its own
  standalone `POST`.
- `CPECreate.controller.js` was only ever sending the flat CPE header to
  `/CPESet` - the vendor quotes and yearly cash flows typed into the UI
  (the same "Add Vendor Quote" table fixed earlier this session, plus the
  5-year cash-flow fields used for IRR/NPV/Payback) were **never sent
  anywhere at all**, despite being fully collected in `/draft/vendors` and
  `/draft/cf1..cf5`. This was already flagged as a known gap in
  `Component.js`'s own comments ("need a CPECreate rewrite... a bigger,
  separate pass") but hadn't been connected to `SubmitCPE`'s 500 until the
  backend team's feedback. Most likely cause: `SubmitCPE`'s ABAP logic reads
  the CPE's vendor rows (L1/selected vendor, 3-quote rule above ₹10L, etc.)
  and throws when it finds none.
- **Fixed in `_buildCpePayload`:** now builds `CPEToVendors`/`CPEToCashFlows`
  nested arrays from the real draft data and includes them in the same
  `createEntity("/CPESet", ...)` call (both `onSaveDraft` and `onSubmit` go
  through this one payload builder, so both now deep-insert). Mapped per
  `$metadata`: `Vendorseq`/`Yearnr` are generated sequence numbers (not
  collected anywhere in the UI, same convention as other sequence fields
  already generated client-side elsewhere in this app); `Lifnr` (real SAP
  vendor code) left blank - not collected anywhere, not guessed.
  `SelVendor` on the CPE header now points at the actual selected vendor's
  generated `Vendorseq` (previously hardcoded blank with a stale comment
  about vendor comparison being mock-only - that's no longer true since
  Add Vendor Quote was fixed earlier this session).
- Verified `node -c` passes. **Not yet live-tested** - next CPE submission
  attempt will tell us whether this was the actual fix for `SubmitCPE`'s 500
  or whether another backend-side issue remains underneath it.
- **Live-tested the same day - isolated the exact cause of the deep-insert
  500, and found it's a backend deadlock, not a frontend sending issue.**
  Sent identical `CPESet` create payloads directly to the backend (bypassing
  the UI) with only one variable changed each time:
  - Flat payload, no nested data → `201 Created`.
  - Same payload + 1 real vendor row in `CPEToVendors` → `500` (identical
    generic error, transaction `13FF3477C68D0110E006AB19D1EFB59C` /
    `20261001102434.1878640`).
  - Same payload + **empty** `CPEToVendors: {results: []}` → `201 Created`.
  - Same payload + `CPEToCashFlows` (5 rows) only, no vendors → `201 Created`.

  Conclusively proves the backend's `CREATE_DEEP_ENTITY` implementation
  crashes specifically when `CPEToVendors` is non-empty - not a frontend
  payload-shape problem (confirmed by cross-checking the ABAP source the
  backend team shared for `CREATE_DEEP_ENTITY`: it dispatches to
  `zcl_capex_cpe=>create( it_vendors = ... it_cashflows = ... )` inside a
  `TRY...CATCH zcx_capex_error` that would only catch their own business
  exceptions - backend confirmed **no ST22 dump** for this transaction,
  meaning it's a different, non-`zcx_capex_error`-type exception being
  thrown and silently swallowed by a broader handler further up the stack,
  not a classic runtime dump. Advised them to set an external breakpoint
  inside `zcl_capex_cpe=>create()`'s vendor-handling logic (session
  breakpoints can miss requests routed through a different work process via
  BAS/the destination) and to widen the `CATCH` to also catch `cx_root` so
  the real exception text surfaces instead of the generic wrapper message.
- **New, separate confirmation the same day: `SubmitCPE` fails even with
  zero vendor rows.** `CPE-2026-0014` (a real CPE, confirmed via
  `$expand=CPEToVendors` to have 0 vendor rows) still got the identical
  generic 500 on `SubmitCPE`. This directly confirms the earlier theory that
  `SubmitCPE`'s own logic expects a vendor record to exist and fails when it
  doesn't - **creating a backend deadlock**: `SubmitCPE` needs a vendor row
  to succeed, but creating a CPE with a vendor row crashes at the
  `CREATE_DEEP_ENTITY` step above. Both must be fixed on the backend before
  any CPE can get past Submit; this is not fixable from the frontend side
  under any payload shape.
- Backend team also raised whether a `$batch`-wrapped deep insert (what the
  real SAPUI5 app sends by default, vs. the single-POST test above) behaves
  differently, and described an expected "hit the expanded one, then the
  others sequentially" sequence - clarified for them that OData v2 deep
  insert is a single POST with nested data (what was tested, and what their
  own `CREATE_DEEP_ENTITY` code is written to receive), not a batch of
  separate per-entity calls; a hand-constructed `$batch` test on our side
  was inconclusive (OData batch bodies are strict about exact formatting and
  ours likely wasn't byte-perfect) so that specific distinction is still
  unconfirmed. Also captured one real UI attempt that returned `504 Gateway
  Timeout` instead of `500` on a `CPESet` create with a vendor attached -
  worth backend checking for a lock/loop specifically in the `$batch` path,
  separately from the clean single-POST repro above.
- Test data: `CPE-2026-0009` through `CPE-2026-0014` all created during this
  troubleshooting (mix of real user attempts and diagnostic test records),
  all `DRAFT`, none successfully submitted. None currently deletable (no
  delete capability in the app, same as noted earlier for Budget).
- **Bisected the exact trigger field the same day: `Vendor.QuoteAmt` being
  non-zero, specifically.** User asked whether the frontend could be fixed
  further, or whether vendor data was even reaching the backend at all.
  Proved delivery first (identical requests behave differently purely based
  on whether vendor data is present, which is only possible if the backend
  receives and attempts to process it), then bisected the vendor row
  field-by-field via direct, minimal `CPESet` deep-insert test calls
  (bypassing the UI entirely each time):
  - `{Vendorseq}` alone → `201`
  - all string/flag fields (`Vendorname`/`Lifnr`/`Waers`/`Quality`/
    `WarrantyMon`/`GstCompliant`/`Selected`/`Ranking`) → `500`
  - `QuoteAmt`+`Totalcost` together → `500`
  - `Totalcost` alone (any value) → `201`
  - `QuoteAmt` alone, value `15000.000` → `500`
  - `QuoteAmt` alone, value `0.000` → `201`
  - `QuoteAmt` alone, values `1`, `0.5`, `99`, `100` → all `500`
  - `DeliveryDays` alone → `201`

  **Conclusion: the crash is triggered by `QuoteAmt` being non-zero, not by
  magnitude** (fails identically at 0.5, 1, 99, and 15000 - rules out an
  overflow/precision-size theory). Strongly suggests a conditional branch in
  `zcl_capex_cpe=>create( )`'s vendor-processing loop guarded by something
  like `IF ls_vendor-quoteamt <> 0` (likely ranking/L1-comparison/savings
  logic) that only executes - and only breaks - when a real quote amount is
  present; zero skips that branch entirely. Also re-confirmed earlier finding
  that the "strings only" combination independently fails too, so there may
  be more than one broken field-specific branch (e.g. something in that
  group too) - `QuoteAmt` is the cleanest, most specific one isolated so far.
  Told the user this is as far as external OData-level testing can narrow
  it without actual ABAP debugger access - handed to the backend team as a
  precise pointer: breakpoint inside `zcl_capex_cpe=>create()`'s vendor loop,
  specifically wherever it branches on `QuoteAmt`.
- **Backend confirmed `CREATE_DEEP_ENTITY`'s breakpoint never triggers from
  a real UI submission.** Backend team shared `CPESET_CREATE_ENTITY` (the
  flat create handler, explicitly commented "no vendors, app uses deep
  insert below") - it deserializes into a flat `zcapex_s_cpe` structure and
  calls `zcl_capex_cpe=>create( is_cpe = ls_in )` with no vendor/cashflow
  params at all, so vendor data would obviously show blank if this is what's
  actually running. Initially suspected a `$batch`-vs-single-POST difference
  between the real app and direct test calls, but ruled that out - checked
  `Component.js#_createODataModel`: `useBatch: false` is already set
  explicitly, so the real app never batches requests either; this isn't a
  batching issue.
- **Compared against the working sibling app `zmc_wise_prd_app`'s own deep
  insert** (`MainView.controller.js#_buildSubmissionRows`, `ORDERNAV`
  nested rows) at the user's request - found one real structural
  difference: it sends its nested child array as a **bare array**
  (`"ORDERNAV": [...]`), not wrapped in `{results: [...]}` like our
  `CPEToVendors`. Tested switching to a bare array for `CPEToVendors` -
  **same `500`, ruled out** (transaction
  `13FF3477C68D00E0E006AB19D1E2AA17` / `20261001112553.3240400`). The
  wrapper format isn't the differentiator; `QuoteAmt`'s value being non-zero
  remains the only confirmed trigger. Next step handed to the user: capture
  the real browser's actual outgoing `CPESet` request via DevTools "Copy as
  cURL" during a real submit-with-vendor attempt, to compare byte-for-byte
  against the manually-tested payloads above and rule out any other
  frontend-vs-test discrepancy before concluding this is purely backend-side.
- **Resolved, same day: the real app was running stale code.** User captured
  the real browser's `CPESet` POST via DevTools "Copy as cURL" as asked -
  its body had **no `CPEToVendors` or `CPEToCashFlows` keys at all**, proving
  the deep-insert fix (Open Issue #10c) hadn't actually been loaded by the
  browser yet (classic stale-cache issue, same family as the earlier CDN
  bootstrap problem). This explains the whole `CREATE_DEEP_ENTITY`-never-
  triggers investigation with the backend team - there was never any nested
  data being sent in the first place, so of course the framework routed to
  the flat handler. User did an empty-cache hard reload and confirmed the
  deep insert now actually fires.
- **New, real frontend bug found once deep insert was actually live:**
  `Property 'Quality' - Failed to read property 'Quality' at offset 'N'`
  (`CX_SXML_PARSE_ERROR`). Live-isolated via direct test: `Quality` sent as
  a JSON string (`"4"`) throws this parse error; the exact same value sent
  as a raw JSON number (`4`) succeeds (`201`) - **despite `$metadata`
  declaring `Quality` as `Edm.String`.** Checked the sibling field
  `WarrantyMon` (also `Edm.String`, also numeric-looking) - that one is fine
  as a string, so this isn't a general pattern, just `Quality` specifically.
  **Fixed:** `_buildCpePayload` now sends `Quality: Number(v.quality) || 0`
  (unquoted) instead of a string. Verified `node -c` passes.
- **Net status:** the deep-insert path is now confirmed genuinely working
  end-to-end from the frontend (real nested data reaching the backend,
  backend actually parsing individual vendor fields and giving specific,
  readable field-level errors back - a world of difference from the earlier
  generic 500s). Next submit attempt will tell us if there are more
  field-level issues like `Quality` to find, or if this clears the way to
  finally test `SubmitCPE` against a CPE that has real vendor data attached.

### 17. "Evaluate" button missing on CPE Detail — backend truncates `Status` to 12 chars, frontend compared against the full word (fixed, 2026-10-01)
- User: CPE successfully reached evaluation, but opening CPE Detail showed
  only Print/Back in the footer - no Evaluate button.
- **Root cause confirmed live:** `$metadata` declares `CPE.Status` as
  `Edm.String MaxLength="12"`. The real status word `"UNDER_EVALUATION"` is
  16 characters, so the backend silently truncates it on save. Checked the
  real record live: `CPE-2026-0044` has `Status: "UNDER_EVALUA"` (exactly
  12 chars), not `"UNDER_EVALUATION"`. The Evaluate button's `visible`
  binding compared against the full, untruncated word, so it could never
  match real data and silently hid itself.
- **Same bug also broke CPE List's "Under Evaluation" tab** - both its
  count tile (`CPEList.controller.js#_updateCounts`) and its filter
  (`IconTabFilter key="UNDER_EVALUATION"`) compared against the full word
  too, so that tab was silently showing zero CPEs even with a real one
  sitting there.
- **Fixed in four places:** `formatter.js`'s `statusState`/`statusText`
  now recognize both `UNDER_EVALUATION` and the truncated `UNDER_EVALUA`
  (kept both - `MockData.js`'s seed data still uses the full untruncated
  word, so both need to resolve correctly); `CPEList.view.xml`'s tab `key`
  and `CPEList.controller.js`'s count both switched to the real truncated
  value; `CPEDetail.view.xml`'s Evaluate button now matches either form.
  Checked every other known status word against the same 12-char limit
  (DRAFT/SUBMITTED/IN_APPROVAL/APPROVED/REJECTED/HOLD/BLOCKED/POSTED/
  CAPITALIZED/COMPLETED all fit within 12 chars) - `UNDER_EVALUATION` is the
  only one affected.
- **Not touched:** `Evaluation.controller.js#onSave` still locally patches
  the client-side model with the full, untruncated `"UNDER_EVALUATION"`
  after a live `SaveEvaluation` call (`_writeBack("UNDER_EVALUATION")`) -
  self-corrects on the next live reload (which would show the real
  truncated value instead), so it's not the cause of this bug, but it's the
  same kind of local-patch-instead-of-live-reload pattern already flagged
  elsewhere this session (Open Issue #3) - left alone, not in scope here.
- Verified `node -c`/XML well-formedness on all four changed files.

### 18. Evaluation always said "Select the recommended vendor" even when one was selected (fixed, 2026-10-01)
- Root cause: `Component.js#mapCpeEntity` hardcoded `vendors: []` for every
  live CPE (a known, previously-documented gap - vendor data wasn't
  live-wired when that line was written), and `_loadLiveCpeList` never
  `$expand`-ed `CPEToVendors` at all. So even after today's fix made CPE
  Create genuinely persist real vendor rows, nothing ever read them back -
  Evaluation's `_onMatched` always saw an empty vendor list regardless of
  what was actually saved, so its "at least one vendor selected" validation
  could never pass.
- **Fixed:** added `mapVendorEntity(oRaw)` (the reverse of
  `_buildCpePayload`'s vendor row mapping) and wired it into `mapCpeEntity`;
  `_loadLiveCpeList` now reads `/CPESet` with `$expand=CPEToVendors`.
  Verified live against `CPE-2026-0044`: it genuinely has 1 vendor row
  (`Vendorseq 0001`, `Vendorname "Sahin"`, `Selected: "X"`, `Ranking: "L1"`)
  that was previously invisible to the app entirely.
- **Caught one more bug while verifying live data:** `Ranking` came back
  from the backend as `"L1"` (already including the "L" prefix) rather than
  the bare number `_buildCpePayload` sends (`Ranking: "1"`, stripped via
  `.replace(/^L/, "")` on write). `mapVendorEntity`'s first draft
  unconditionally re-added the "L" prefix on read, which would have produced
  `"LL1"` and silently broken every rank-dependent check (L1 vendor
  detection, non-L1 justification trigger). Made the read side defensive -
  it now only adds the prefix if it isn't already present, handling either
  stored format rather than assuming one. (Not yet resolved: *why* the
  stored value has the prefix when the write path strips it - possibly the
  backend recomputes/overwrites `Ranking` itself rather than storing what
  was sent, since there's only one vendor on this record so either value
  would trivially be correct; not chased further since the defensive read
  fix covers both cases regardless of the real answer.)
- **Also fixed two stale, now-incorrect comments/blanks** in
  `Evaluation.controller.js`: `onSave`/`onSubmitEvaluation` both hardcoded
  `VendorSeq: ""` to `SaveEvaluation`/`SubmitEvaluation`, with comments
  claiming "vendor comparison isn't live-wired yet, mock-only ids" - no
  longer true since today's CPE Create deep-insert fix. Both now send the
  real selected vendor's `id` (`Vendorseq`), using the already-computed
  `oSelVendor` that `onSave` had even built but never actually used.
- Verified `node -c` passes on both changed files.

### 19. CPE Approval ("ApprovalDetail") rebuilt to use live DOA data instead of the mock approval chain (fixed, 2026-10-01)
- Same root cause as Open Issue #11/#13 (Budget approval), but on the CPE
  side: `ApprovalDetail.controller.js#_onMatched` derived `canAct` and the
  approval timeline entirely from `approval>/history`, a hardcoded mock map
  covering only ~8 old demo CPE ids (`CPE-2026-0042`, `-0041`, `-0040`,
  `-0038`...`-0034`). Any genuinely-created CPE (like today's
  `CPE-2026-0044`) has no entry there, so the Approve/Reject/Hold/Rollout
  buttons silently never appeared, even though the CPE itself was correctly
  `IN_APPROVAL` with a real `CurrLevel`/`Doaid` on the backend.
- **Fixed:** added `_buildLiveChain(oCPE)`, which looks up the CPE's own
  `Doaid` in the already-live `config>/doaMatrix` (from `DoaRuleSet`
  `$expand=DoaRuleToChain`, confirmed live-loaded since 2026-09-30) and
  marks each step APPROVED/PENDING/WAITING by comparing to the CPE's live
  `CurrLevel` - same technique as `BudgetApprovalDetail`, just sourced from
  the DOA matrix instead of re-deriving from a single rule lookup. `canAct`
  now checks `oCPE.status === 'IN_APPROVAL' && oUser.role === oCPE.currentLevel`
  (or `isAdmin`), not the mock chain's pending step.
- **Also replaced the post-action local-state faking** in
  `onApprove`/`onReject`/`onHold`/`onRollout`: removed `_act()` (hand-mutated
  mock `history`/`inbox`/`cpe` models), `_createSapObjects()` (fabricated a
  fake CWIP record out of thin air on "final approval" - never real),
  `_releaseCommitment()`, and `_flagRollout()` (both local-only patches).
  All four actions now call `addAudit` + `getOwnerComponent()._loadLiveCpeList()`
  (and `_loadLiveBudgetList()` for Reject, since that affects the budget's
  committed amount) to reflect real backend state afterward, same reload
  pattern used everywhere else this session (PODetail/BudgetApprovalDetail/
  CPECreate). `_pendingIndex` was kept - `onApprove` still uses it against
  the new live-built chain to word the confirmation dialog.
- **Also extended the Approval Inbox to actually list CPEs pending
  approval** - the exact same gap Budget had before today's fix:
  `ApprovalInboxSet` returns zero rows for CPEs too (not "CPE-only" as a
  stale comment claimed - corrected that comment). Added
  `mapCpeToInboxRow`/`_mergeCpeApprovals` (direct mirror of
  `mapBudgetToInboxRow`/`_mergeBudgetApprovals`), wired into both
  `_loadLiveCpeList` and `_loadLiveApprovalInbox` the same order-independent
  way as Budget's. Without this, a user would never actually find a pending
  CPE through the Approval Inbox screen at all, even with the ApprovalDetail
  fix in place.
- **Not fixed / explicitly out of scope:** `ApprovalInbox.controller.js`'s
  `onBulkApprove`/`_advance()` still has the identical mock-history-based
  flaw for the bulk-approve path specifically - not touched in this pass,
  flagged here so it isn't mistaken for already covered.
- Verified `node -c` passes on both changed files. Traced the live data by
  hand for `CPE-2026-0044` (`Status: IN_APPROVAL`, `CurrLevel: "HOD
  Operations"`, `Doaid: "D1"`) against `D1`'s real chain (HOD Operations →
  VP Operations → President Operations) - confirms the Approve button
  should now correctly appear for this CPE. **Not yet confirmed in an
  actual browser** - no browser automation this session; user should
  hard-refresh and check.

### 20. CPE Create: Quote/Total Cost still vanishing after the 2026-10-01 fix — root cause was only half-fixed, now actually fixed (2026-10-05)
- User reported the same symptom as Open Issue #15 (typing into Quote and
  Total Cost of Ownership in Add Vendor Quote still vanishes), even though
  #15 was logged as fixed. Asked first to explain only, no code changes.
- **Confirmed the documented #15 fix is genuinely in place:** the Quote
  `Input` (`CPECreate.view.xml:197`) uses `change`, not `liveChange`,
  and `_rankVendors()` no longer calls `oModel.refresh(true)` anywhere.
- **But the fix only patched one trigger of a broader pattern that survived:**
  `_rankVendors()` (`CPECreate.controller.js`, called from `onQuoteChange`
  on every Quote commit) still replaced the **entire** `/draft/vendors` array
  via a single `setProperty("/draft/vendors", ...)`. The vendor `Table`
  (`view.xml:172`, `items="{cpe>/draft/vendors}"`) has no row key on its
  binding, so that whole-array replace re-applies every bound `Input`'s value
  from the model in every row - overwriting any field's in-progress
  (uncommitted) typing elsewhere in the same row, including Total Cost, which
  has **no event handler of its own at all** (confirmed via grep) - its
  vanishing was pure collateral damage from Quote's handler, not its own bug.
- **Fixed:** `_rankVendors()` now computes the new ranks but writes them back
  with per-index `setProperty("/draft/vendors/" + i + "/rank", ...)` calls,
  only for rows whose rank actually changed - never replaces the array
  reference, so no other bound field in any row gets re-applied from the
  model anymore.
- **Deliberately left untouched (same pattern, but not what was asked/tested
  today):** `onAddVendor`/`onRemoveVendor`/`onVendorSelect` still do a
  whole-array `setProperty` each - structurally necessary for add/remove
  (row count changes, the aggregation has to be told), and `onVendorSelect`
  only flips a `selected` flag on button/row-select, not per-keystroke, so
  none of these were implicated in the reported symptom. Flagged here in
  case the same collateral-wipe pattern is ever reported from those actions.
- Verified `node -c` passes. **Not yet confirmed in an actual browser** - no
  browser automation this session; user should hard-refresh and retest typing
  into both Quote and Total Cost of Ownership.

### 21. CPE Create: Save Draft / Submit had no double-click guard — could create two drafts from one action (fixed, 2026-10-05)
- User saw a long list of draft CPEs (`CPE-2026-0024` through `CPE-2026-0043`)
  and asked whether creating one CPE was somehow creating multiple duplicate
  drafts. Analysis first, no changes, per user's request.
- **Most of that specific list is very likely old clutter, not new
  duplication:** the titles ("Test", "Bisect: QuoteAmt=...", "Quality as
  number", "WarrantyMon as string", "Bare array test") closely match the
  field-by-field diagnostic methodology already documented under Open Issue
  #10c (2026-10-01) - direct curl calls bypassing the UI to isolate
  `SubmitCPE`'s 500. The log doesn't enumerate exact CPE ids per curl call,
  so this couldn't be confirmed 100% by id, but the title match is too
  specific to be coincidence.
- **But a real, separate double-submit bug was found and confirmed in the
  code**, independent of the above: neither the Save Draft nor Submit button
  (`CPECreate.view.xml`) had an `enabled`/`busy` binding, `setBusy()`
  (`BaseController.js`) only shows a view-level busy overlay with UI5's
  default ~1s show delay, and neither `onSaveDraft` nor `onSubmit`
  (`CPECreate.controller.js`) had any re-entry guard. Net effect: a
  double-click, or a second press during that ~1s window (or while the
  request is still pending), fired a second independent `createEntity
  ("/CPESet", ...)` call - two draft CPEs for one intended action.
- **Fixed:** added a shared `this._bSaving` flag (reset in `_resetDraft`,
  checked at the top of both `onSaveDraft` and `onSubmit`'s confirm callback)
  and disabled both `btnSaveDraft` (new id added to the view) and `btnSubmit`
  immediately when a save/submit actually starts, re-enabling them on error
  (not on success, since both success paths navigate away via `navTo
  ("cpeList")`). `onSubmit`'s guard sits both at the top of the handler and
  again inside the confirm dialog's callback, since the actual network call
  only happens after the user confirms.
- Did not touch `onAddVendor`/`onRemoveVendor`/`onVendorSelect` or anything
  else in this file - scoped strictly to the double-create risk on
  Save Draft/Submit, per the user's "don't break any flow" ask.
- Verified `node -c` and XML well-formedness pass. **Not yet confirmed in an
  actual browser** - no browser automation this session; user should
  double-click (or rapid-click) Save Draft and Submit to confirm only one
  CPE is created each time.
- **Not cleaned up:** the `CPE-2026-0024`–`0043` test-data backlog itself was
  not deleted - no delete capability exists in this app (same limitation
  noted earlier in this log for Budget/CPE test records). Flag if the user
  wants this raised with the backend team for a manual cleanup.

### 22. CPE Create: Vendor Name live search added (new VendSet entity), but VendSet's live data is backend-broken (2026-10-05)
- User reported a new entity set in `$metadata` (guessed name "Vent") and
  asked for a live backend vendor search on the "Add Vendor Quote" table's
  Vendor Name field, with Quote auto-filling from the backend too.
- **Checked live `$metadata`** (local cached copy was stale - pulled fresh
  from the already-running `npx ui5 serve` dev proxy): the real entity is
  `EntityType Name="Vend"` / `EntitySet Name="VendSet"`, read-only
  (`sap:creatable/updatable/deletable="false"`, non-pageable), with exactly
  two properties: `Lifnr` (key, vendor code, `sap:filterable="false"`) and
  `Name1` (vendor name, max 35). **No quote/price field exists anywhere on
  this entity or any related one** - confirmed by also checking
  PurchaseOrder and the Quota entities. User agreed to wire the name search
  only for now, leave Quote manual.
- **Built, following the existing Plant-dropdown live-search pattern (Open
  Issue #8):**
  - `Component.js`: new `_loadLiveVendors()` (reads `/VendSet`, maps
    `{key: Lifnr, text: Name1}` into `cpe>/vendorMaster`), added to the
    `aLoaders` list.
  - `MockData.js`: added an empty `vendorMaster: []` default alongside the
    existing `draft` seed so the binding has something to point at before
    the live load completes.
  - `CPECreate.view.xml`: Vendor Name's plain `Input` replaced with a
    `ComboBox` bound to `cpe>/vendorMaster` (still free-typeable, not
    restricted to the list - doesn't break manually-typed vendor names).
  - `CPECreate.controller.js`: new `onVendorNameChange` resolves the
    committed value against the live vendor list and stores the matched
    vendor's real `Lifnr` on the row (`v.lifnr`); `onAddVendor`'s new-row
    shape gained a `lifnr: ""` field; `_buildCpePayload` now sends
    `Lifnr: v.lifnr || ""` instead of always-blank `""` (closes a
    previously-flagged gap - "Lifnr left blank, not collected anywhere" -
    now resolvable whenever the picked name matches a real backend vendor).
- **Found a real backend data problem while confirming this live, before
  telling the user it was ready:** queried `/VendSet` directly - 470 rows,
  and **`Lifnr` is blank (`""`) on every single row**, while `Name1` holds
  what are clearly vendor **codes** (e.g. `"0000004258"`, `"0000A21494"`),
  not vendor names. The two fields appear swapped/mis-mapped server-side -
  no actual vendor name text exists in the live data today. Not a frontend
  bug - the code matches `$metadata`'s declared shape exactly.
- **Net effect:** the search dropdown is live-wired and will show real
  backend rows, but today it shows 470 numeric-looking codes instead of
  names (not useful for "search by name" yet), and the new `Lifnr` capture
  in `onVendorNameChange`/`_buildCpePayload` will always resolve to blank
  until the backend fixes `VendSet`'s data - no regression, just currently
  a no-op, same "wire to $metadata now, works once backend is fixed" approach
  used throughout this log. **Next step: hand this to the backend team** -
  `VendSet`'s `Lifnr`/`Name1` values need to be corrected (or swapped back)
  so `Name1` actually returns vendor names.
- Verified `node -c` on all three JS files and XML well-formedness on the
  view. **Not yet confirmed in an actual browser** - no browser automation
  this session.

### 23. App-wide audit: "approve/reject needs a refresh to take effect" - two systemic bug classes found and fixed across 9 files (2026-10-05)
- User reported: approving/rejecting a CPE (or acting on "Under Evaluation")
  sometimes doesn't seem to take effect until a manual page refresh and
  re-click. Asked to analyse first, no changes, then "how many issues are
  like this" before authorising a fix.
- **Root cause #1 - "reload race":** every write handler's success callback
  called a live reload (`_loadLiveCpeList()`/`_loadLiveBudgetList()`/etc.)
  WITHOUT chaining `.then()` on it, then immediately showed the success
  toast and navigated away. Since the reload is a real async OData read, the
  screen you land on (e.g. Approval Inbox) was built from the pre-action
  data - the real update arrived a moment later with nothing listening for
  it. This is why a manual refresh (which re-runs the live loaders from
  scratch) "fixed" it: by then the backend write had actually landed.
- **Root cause #2 - "local patch instead of live reload":** several handlers
  never called a live reload at all after a real backend write succeeded -
  they hand-mutated the local JSONModel (splice/push/hardcode a new status
  string) to fake the effect, leftover from the pre-live-backend mock era.
- **Full audit found 21 write-action call sites; fixed 19, explicitly
  excluded 2 (see below).** Fixed:
  - `Component.js`: `_loadLiveBudgetList`, `_loadLiveCpeList`, the generic
    `_loadLiveList` (and therefore `_loadLivePOList`, which wraps it), and
    `_loadLiveQuota` now all return a Promise that resolves once the read
    actually lands (success or error - a reload failure shouldn't block the
    write's own success flow). Added `_loadLiveCwipList()` (same
    convenience-wrapper shape as `_loadLivePOList`) since `mapCwipEntity` is
    only reachable inside `Component.js`'s own closure.
  - `ApprovalDetail.controller.js` (onApprove/onReject/onHold/onRollout) and
    `BudgetApprovalDetail.controller.js` (onApprove/onReject): reload now
    chained via `.then()` before the success toast/`navTo`.
  - `CPECreate.controller.js` (onSaveDraft, onSubmit success + inner catch)
    and `BudgetCreate.controller.js` (onSaveDraft, onSubmit success + inner
    catch) and `BudgetDetail.controller.js` (onSubmitPress): same chaining.
  - `UnitQuota.controller.js` (onQuotaSubmit): same chaining (stays on
    screen, but the quota-used figure was showing stale pre-submit data
    before the chain fix).
  - `Evaluation.controller.js`: `onSave` and `onSubmitEvaluation`'s compliant
    branch no longer call the old `_writeBack`/`_seedApprovalChain` local
    fakery at all - both now call the real `_loadLiveCpeList()` (chained)
    instead. `_seedApprovalChain` deleted (now fully unused) - it duplicated
    what `_loadLiveCpeList`'s own `_mergeCpeApprovals` already does correctly
    from live `Status`/`CurrLevel` (same mechanism Open Issue #19 built for
    CPE approval).
  - `ApprovalInbox.controller.js` (onBulkApprove): replaced the `_advance()`
    per-id local patch (hand-mutated `approval>/history` + `cpe>/list`) with
    a real `_loadLiveCpeList()` reload, chained before `_load()` re-renders
    the inbox. `_advance` deleted (now fully unused).
  - `PODetail.controller.js` (onConfirmPO): removed the hardcoded
    `detail/status = "APPROVED"` optimistic patch; now chains
    `_loadLivePOList()` and re-derives `/detail` from the refreshed PO row via
    `readOne` before showing success - so the detail screen reflects
    whatever the backend actually did, not an assumption.
  - `CWIPCreate.controller.js` (onPushToSap): removed `_createRecords()`,
    which fabricated a CWIP id, WBS and PO id entirely client-side (e.g.
    `"CW-2026-0030"`) - never what SAP actually created. Now reloads the real
    CWIP/PO lists (`_loadLiveCwipList()` + `_loadLivePOList()`, chained) and
    shows the backend's own `Message` text instead of a guessed structured
    breakdown - checked live `$metadata`: `CreateCWIP`'s return type
    (`ActionResult`) only has one generic `Message`/`SapObject` field, not
    separate cwip/wbs/po ids, so a structured breakdown can't honestly be
    reconstructed from it anyway. `_createRecords` deleted.
- **Deliberately NOT fixed, flagged instead of guessed:**
  - `ICDetail.controller.js` (`onApproveIC`, `onSave`) - these also matched
    the local-patch pattern (`onSave` doesn't even call a backend function at
    all), but this isn't a simple reload-chaining fix: it's the same
    already-documented architectural gap as Open Issue #4 (missing
    `Cwipid`/`Anlkl`/`Kostl`/`Ebeln`/`Mblnr`, no real function import to save
    an IC against). Patching the reload here would polish a flow that's
    fundamentally fake underneath - left untouched pending that decision.
  - `Evaluation.controller.js`'s non-compliant-return branch
    (`onSubmitEvaluation`, "the equipment is marked NOT compliant" path) -
    found while fixing the compliant branch alongside it: this path calls
    **no backend function at all**, only the local `_writeBack("DRAFT")`
    patch, despite the toast claiming "CPE returned to the initiator." A
    page refresh would show the CPE exactly where it was
    (`UNDER_EVALUATION`), not actually returned to `DRAFT`. No function
    import for this was identified in the audit - needs checking against
    `$metadata` for the right call (possibly `SaveEvaluation` with
    `TechCompliant=""`, unconfirmed) before fixing; left `_writeBack`
    function in place, still used only by this one remaining call site.
- Verified `node -c` passes on all 11 touched files
  (`Component.js` + 10 controllers). **Not yet confirmed in an actual
  browser** - no browser automation this session; user should click through
  Approve/Reject/Hold/Rollout (CPE and Budget), Bulk Approve, Confirm PO,
  CWIP Push to SAP, and Evaluation Save/Submit to confirm each now reflects
  immediately with no refresh needed.

### 24. IC screen: Cost Breakdown total fixed; commissioning photo upload replaced with a real file picker, but genuinely can't be sent to SAP yet - no backend channel exists (2026-10-05)
- User reported two IC (Installation Certificate) bugs: (1) the commissioning
  photograph "upload" does nothing real, (2) the Capitalization Cost
  Breakdown total doesn't include the Installation & Commissioning amount.
  Asked to analyse first; confirmed both, then asked to fix both and "let
  user upload photo and send."
- **Bug 2 (Cost Breakdown total) - fixed, same class of bug as the CPE
  Quote/Total Cost issue fixed earlier this session.** `ICDetail.view.xml`'s
  three cost Inputs (Equipment/Freight/Installation & Commissioning) were
  wired to `liveChange` only - `sap.m.Input` doesn't commit a typed value to
  its two-way-bound model property until `change` (blur/Enter), so
  `onCostChange`'s sum always read whatever was in the field *before* the
  user's last edit. The calculation itself (`ICDetail.controller.js`
  `onCostChange`) already correctly included all three fields - it was
  purely a stale-read timing bug, not a missing term. Fixed by switching all
  three Inputs from `liveChange` to `change`.
- **Bug 1 (photo upload) - replaced the fake button with a real file picker,
  but "send to SAP" is confirmed impossible with the current backend, not
  just unimplemented.** The old `onAddPhoto` was a plain `Button` that just
  flipped a boolean and fabricated a filename (`"photo_1_<timestamp>.jpg"`) -
  no file picker, no camera, no API call at all (the code comment admitted
  as much). Checked live `$metadata` before building anything to avoid
  faking a "send" the same way the old code faked an "upload":
  - `InstallCert` has a real nav property `InstallCertToPhotos` → `Document`
    (association `IC_Document`, keyed `Icid`→`Docid`), and `InstallCert`
    itself already has a real `PhotoCount` field.
  - But `Document`'s entity type has **no content/stream field at all** -
    only metadata (`Filename`, `Mimetype`, `Filesize`, `SizeText`,
    `Category`, `UploadedBy`, `UploadedByName`, `UploadedOn`, `Doctype`,
    `Docid`, `Docseq`). No `m:HasStream="true"` (so it isn't an OData v2
    Media Link Entry either, which would otherwise allow a `$value` PUT).
    Every property is `sap:creatable="false"`. No function import anywhere
    accepts file content either (checked all 22 function imports in
    `$metadata` - none take a binary/base64 parameter).
  - **Conclusion: there is currently no mechanism anywhere in this OData
    service to transmit actual file bytes, under any entity, stream, or
    function import.** This is a step beyond the usual "not creatable yet"
    pattern seen elsewhere in this log - it's a genuine schema gap, not a
    permissions/activation one.
  - **Fixed the frontend honestly within that constraint:** replaced the
    fake `Button` with a real `sap.ui.unified.FileUploader`
    (`buttonOnly="true"`, restricted to jpg/png, 10 MB cap) and a new
    `onPhotoFileChange` handler that captures the genuine picked `File`
    object (real name, real size) instead of a fabricated filename. The file
    itself is held in `this._photoFiles` on the controller instance (not the
    JSONModel - a `File` object isn't plain serializable data); the slot's
    `name`/`uploaded` fields in the `detail` model are real now. The toast
    is explicit: *"attached for this session... Not yet sent to SAP - the
    backend has no document upload endpoint yet."* Added `onPhotoSizeExceed`
    for the 10 MB cap.
  - **Next step, for the backend team:** `Document` needs either a binary
    content property with `m:HasStream="true"` (classic OData v2 media
    resource), or a dedicated function import accepting base64-encoded file
    content, before a real upload can ever reach SAP from this screen.
- Both fixes verified `node -c` / XML well-formedness. **Not yet confirmed
  in an actual browser** - no browser automation this session; user should
  check that (a) typing in all three cost fields and tabbing out updates the
  total correctly, and (b) the photo tiles now open a real OS file picker
  and show the actual chosen filename/size.

### 25. IC Save/Approve & Capitalize wired to the real backend - all 5 "missing" fields traced to data this app already reads live (fixed, 2026-10-05)
- Following on from Open Issue #24: user asked "what should the standard
  level be" after noticing a saved IC vanishes on hard refresh, since
  `onSave` never called the backend at all (`onApproveIC`'s `CapitalizeAsset`
  call was already real, but was operating on a document that never actually
  existed in SAP). Asked to trace where the five Open-Issue-#4 fields should
  come from and fix it.
- **Traced all five - none needed new data collection, all already available
  live elsewhere in the app:**
  - `Cwipid` - already a field on the live `PurchaseOrder` entity
    (`oPO.cwipId`) and is the `CWIP` entity's own key.
  - `Anlkl` (asset class) - already mapped from `CWIP.Anlkl` as
    `assetClass`, entered at CWIP Create, just never read on the IC screen.
  - `Kostl` (cost center) - exists live on `CWIP.Kostl`, but
    `Component.js#mapCwipEntity` wasn't mapping it into the JS model at all
    (one-line gap, now added as `costCenter`).
  - `Ebeln` (purchase doc.) - the IC screen's own `poId` field *is* `Ebeln`
    (the PO entity's real key) - previously assumed to be a separate
    portal-internal id, it already was the real SAP document number.
  - `Mblnr` (material doc.) - same story: the IC screen's own `grnId` field
    *is* `Mblnr` (the GRN entity's real key).
- **Fixed:**
  - `Component.js#mapCwipEntity`: added `costCenter: oRaw.Kostl`.
  - `Component.js#mapInstallCertEntity`: added `cwipid`/`anlkl`/`kostl`
    round-trip mapping (previously write-only once populated, not read back
    when reopening an existing IC).
  - `Component.js`: added `_loadLiveIcList()` (same convenience-wrapper shape
    as `_loadLivePOList`/`_loadLiveCwipList`) since `mapInstallCertEntity` is
    only reachable inside `Component.js`'s own closure. Also added
    `_loadLiveCwipList()` and reused it in the loader array alongside the new
    `_loadLiveIcList()` (minor consistency cleanup, same pattern).
  - `BaseController.js`: added `updateEntity(sPath, oPayload)` - this app had
    never done an OData update before, only create; needed so re-opening an
    already-saved `PENDING` IC and saving again updates that same record
    instead of creating a duplicate.
  - `ICDetail.controller.js#_newFromCPE`: now looks up the real CWIP record
    for this CPE and seeds `cwipid`/`anlkl`/`kostl` onto the draft (`poId`/
    `grnId` already existed and already held the real `Ebeln`/`Mblnr`
    values).
  - `ICDetail.controller.js`: added `_buildIcPayload(oDraft)` (mirrors
    `_buildBudgetPayload`/`_buildCpePayload`'s shape elsewhere in this app) -
    decimal fields to 3dp matching `InstallCert`'s `$metadata` scale,
    `CommissionDt`/`TechSignDt` sent as real JS `Date` objects (first
    `Edm.DateTime` field this app has ever sent - SAPUI5's OData v2 model
    serializes a native `Date` correctly on its own).
  - `onSave` now does a real `createEntity("/InstallCertSet", ...)` for a
    brand-new IC, or `updateEntity("/InstallCertSet('<id>')", ...)` when
    re-opening an already-saved `PENDING` one (distinguished by the existing
    `isNew` flag), then reloads via `_loadLiveIcList()` before navigating
    away - same reload-before-nav discipline as Open Issue #23.
  - `onApproveIC`'s success handler no longer fabricates an asset number
    locally - it reloads via `_loadLiveIcList()` and reads back the real
    `Anln1` SAP actually assigned.
  - Deleted `_persist` (now fully unused, both callers replaced).
  - `InstallCertSet`'s own `$metadata` entity-set tag only declares
    `sap:deletable="false"` - no explicit `sap:creatable`/`sap:updatable`
    flag, which per Gateway convention defaults both to creatable/updatable,
    even though every individual *property* is separately marked
    non-creatable/non-updatable (the same stale-annotation pattern Budget/CPE
    turned out to have early in this log). **Not yet live-tested** - the
    next real Save attempt will confirm whether this create/update actually
    succeeds or whether the per-property flags turn out to be the accurate
    ones this time.
- Verified `node -c` on all 3 touched files. **Not yet confirmed in an
  actual browser or via a live write** - no browser automation this session,
  and didn't want to fire a real IC creation/capitalization as an
  unsupervised test given it mutates live SAP data. User should try Save on
  a real IC next and report whether it persists through a hard refresh.

### 26. IC Save: "Property 'TechSignoff' ... invalid value 'Testing Phase'" - field-length mismatch, live-tested the new Open Issue #25 save path (2026-10-05)
- First real live test of Open Issue #25's new `createEntity("/InstallCertSet", ...)` call - user hit this error immediately, confirming the new Save path does reach the backend (progress - previously `onSave` never called it at all).
- **Root cause:** `InstallCert.TechSignoff` is `Edm.String MaxLength="12"` in
  `$metadata`. "Testing Phase" the user typed is 13 characters - one over.
  `ICDetail.view.xml`'s `inpSignOff` Input had no length cap at all.
- **Worth noting, not acted on without a decision:** `TechSignoff`'s
  `sap:label` is `"User Name"` - the exact same label and length (12 chars)
  as the real `CurrentUser.Userid` field (`app>/user/id`, e.g. `"90007422"`)
  already used throughout this app for every other approver/signer identity.
  This strongly suggests the field is meant to hold a short SAP user id, not
  an arbitrary typed name - but didn't change the field's behavior to
  auto-fill from the logged-in user without confirming that's actually
  intended (maybe a different name is legitimately being entered on
  someone else's behalf).
- **Fixed as a crash guard only:** added `maxLength="12"` to the Input in
  the view, and `_buildIcPayload` now does
  `(oDraft.techSignOff || "").trim().slice(0, 12)` before sending.
- Verified `node -c` / XML well-formedness. **Flagged for a decision:**
  should `TechSignoff` auto-populate from the logged-in user's real SAP id
  (matching every other signer/approver field in this app) instead of being
  freely typed? Left as free text (now capped) pending that answer.

### 27. "Pending With Me" showing already-approved items - not a bug, a label/behavior mismatch for Admin/Unit-Initiator accounts, now made visible (fixed, 2026-10-05)
- User approved Budget `B-2026-010`, saw it disappear then "come back" after
  a refresh, and suspected the reload-race fix (Open Issue #23) had a gap.
- **Checked live, confirmed it's not a bug:** queried `/CurrentUserSet`
  directly - the logged-in account (`90007422`, INDRANIL BANERJEE) has
  `Role: "Unit Initiator"` and `IsAdmin: "X"`. `ApprovalInbox.controller.js
  #_load()` has `var bSeesAll = oUser.isAdmin || oUser.role === "Unit
  Initiator"` - true for this account either way, so it shows **every**
  pending Budget/CPE system-wide regardless of whose turn it actually is,
  not just ones genuinely awaiting this user. B-2026-010 correctly advanced
  to the next approver after being approved (still `IN_APPROVAL`, just with
  a different `CurrLevel` now) - it never should have disappeared for this
  persona, since "sees all" is by design, just mislabeled as "Pending With
  Me."
- User asked how to reduce the confusion; agreed to add a "Currently With"
  column rather than a bigger two-tab split, since the underlying
  `currentLevel` field already existed in the data, just wasn't shown.
- **Fixed (purely additive, no filtering/approve/reject logic touched):**
  `ApprovalInbox.view.xml` - new "Currently With" column, bound to
  `inbox>currentLevel`. New `ApprovalInbox.controller.js#formatCurrentLevelState`
  highlights the row `Success` (green) when `currentLevel` matches the
  viewer's own role, `None` otherwise - so a bSeesAll user can tell at a
  glance which rows are genuinely theirs to act on vs. elsewhere in the
  chain.
- Verified `node -c` / XML well-formedness. **Not yet confirmed in an actual
  browser** - no browser automation this session.

### 28. Dashboard KPI race condition fixed, Approved CPEs + Capitalized wired to live data (2026-10-05)
- Follow-up to the Dashboard-showing-zeros report: user asked if it was
  fixable, then asked to fix the race condition and the two hardcoded-zero
  KPIs that already had real live data available (Approved CPEs,
  Capitalized), explicitly asking not to break any other flow.
- **Race condition fix - purely additive, no existing behavior changed:**
  - `Component.js#_initLiveData()`: the `aLoaders` entries Dashboard's
    rollup actually depends on (`_loadLiveBudgetList`, `_loadLiveApprovalInbox`,
    the `cwipAgeing` `_loadLiveList` call, `_loadLiveCpeList`, `_loadLiveIcList`,
    `_loadLiveUser`) now `return` their call instead of discarding it - every
    one of these already fires at exactly the same time, in the same order,
    with the same error handling as before; only the previously-ignored
    return value is now forwarded. The other loaders are untouched.
  - Promisified `_loadLiveApprovalInbox` and `_loadLiveUser` (same
    resolve-on-success-or-error shape as every other `_loadLive*` promisified
    in Open Issue #23) - needed because Dashboard's rollup reads
    `approval>/inbox` directly and uses `applyPlantAuth` (which depends on
    `app>/user/authorizedPlants`).
  - `_initLiveData()` now collects whichever loader calls returned a Promise
    into `this._pInitialLoad = Promise.all(aPromises)` - observes when the
    startup batch has landed, without re-triggering any read itself.
  - `Dashboard.controller.js#_onMatched` now calls `_recalcRollup()`
    immediately (unchanged, handles navigating back here after the data's
    already warm) AND again once `_pInitialLoad` resolves (new - fixes the
    hard-refresh case, where the route matches and the first `_recalcRollup()`
    runs before any of the three XHRs it depends on can possibly have
    returned, and previously nothing ever ran it a second time).
- **Wired the two hardcoded-zero KPIs to real live data (no backend gap -
  both already loaded elsewhere in the app):**
  - Approved CPEs: sums `amount` across `cpe>/list` rows where
    `status === "APPROVED"`.
  - Capitalized: sums `totalCapitalCost` across `asset>/ic` rows where
    `status === "CAPITALIZED"` (this is the first real consumer of the
    `_loadLiveIcList()` added in Open Issue #25 - depends on
    `CapitalizeAsset` actually flipping `InstallCert.Status` to
    `"CAPITALIZED"` server-side, which hasn't been live-confirmed yet).
- **Deliberately left alone, same as before:** `cwipAvgAge`, `cycleTimeDays`/
  `cycleTimeBefore`, `savingsYTD`, `byCategory` are still hardcoded zero/empty
  - no backend source identified yet, not part of what was asked this round.
  Also left the pre-existing "Committed"/"Spent" tile label mismatch alone
  (they're computed from Budget's own fields, not live PurchaseOrderSet/
  GRNSet, despite the subtitles) - flagged earlier, not touched.
- Verified `node -c` on both touched files. **Not yet confirmed in an actual
  browser** - no browser automation this session; user should hard-refresh
  landing on the Dashboard and confirm all six previously-zero-on-refresh
  tiles (Committed/Spent/Available/CWIP Pending/Approvals Pending/SLA
  Breaches) now show correct numbers immediately, and that Approved CPEs/
  Capitalized now show real sums instead of permanent zero.

### 29. Budget approval needing "4-5 clicks" - confirmed working-as-designed (3 real DOA steps), fixed the missing progress feedback (2026-10-05)
- User reported needing to click Approve 4-5 times on a budget before it
  "vanished and worked fine." Asked to analyse first, no changes.
- **Confirmed live, not a bug:** every DOA rule currently configured (D1-D6,
  `DoaRuleSet?$expand=DoaRuleToChain`) has exactly 3 real chain steps (HOD
  Operations → VP Operations → President Operations). The logged-in account
  is both Admin and Unit Initiator, so `canAct` lets it approve at every
  step in sequence (not just its own role) - 3 clicks is the correct number
  of real, successfully-advancing approvals for any budget today. Live
  `BudgetSet` check confirmed every existing budget had reached
  `Status=APPROVED, CurrLevel=Completed` with no evidence of a click ever
  failing to advance `CurrLevel`.
- **Real problem: zero progress feedback.** `BudgetApprovalDetail` showed
  the identical generic dialog ("Approve budget X?") and identical generic
  toast on every single click regardless of step, had no chain/timeline UI
  at all (unlike the CPE equivalent, `ApprovalDetail`, which already has
  both), and navigated straight back to the inbox after every click instead
  of showing the advanced level - so 3 genuinely-working clicks looked
  identical and gave no confirmation anything had happened, reading as "I
  have to keep clicking until something works."
- **Fixed, mirroring `ApprovalDetail.controller.js`'s existing CPE pattern
  exactly:**
  - `BudgetApprovalDetail.controller.js`: added `_buildLiveChain`/
    `_pendingIndex` (near-identical to the CPE version, reading
    `config>/doaMatrix` matched by the budget's own `doaId`). `_onMatched`
    now includes `chain` in the detail model. `onApprove` now computes
    `iPending`/`bFinal`/`sNext` and shows "Approve and route to VP
    Operations?" vs. "This is the final approval..." - and the success
    toast now says which (new i18n keys `budgetApprovedNextMsg`/
    `budgetApprovedFinalMsg`, replacing the old always-identical
    `budgetApprovedMsg`).
  - `BudgetApprovalDetail.view.xml`: added the same `.zcpxTimeline` chain UI
    `ApprovalDetail.view.xml` already has, bound to the new `detail>/chain`.
  - `onReject` untouched - rejection is terminal regardless of chain
    position, no step-awareness needed there.
- Verified `node -c` / XML well-formedness. **Not yet confirmed in an actual
  browser** - no browser automation this session; user should open a Budget
  pending approval and confirm the chain timeline renders and the dialog/
  toast now name the specific next role or say "final."

### 30. Real Emami logo swapped in for the header's placeholder icon, made round (2026-10-05)
- User uploaded `assets/emami-logo-new.jpg` (also used in the sibling
  `projectlaunchpad` project) and asked to replace the white header icon
  next to "CAPEX Approval Portal / Emami Group" with it, round, same size.
- Confirmed scope first: the icon is a single `core:Icon`
  (`sap-icon://capital-projects`) styled by `.zcpxBrandMark`
  (`1.875rem × 1.875rem`), used in exactly one place in `App.view.xml` -
  nothing else shares that class.
- **Fixed:**
  - Copied the logo into `webapp/images/emami-logo-new.jpg` and (mirroring
    this project's existing webapp/dist dual-maintenance pattern from Open
    Issue #14) `dist/images/emami-logo-new.jpg`.
  - `App.view.xml` (both `webapp/` and `dist/` copies): replaced the
    `<core:Icon>` with an `<Image src="images/emami-logo-new.jpg">`, same
    class, same `visible`/`layoutData` bindings - no other markup touched.
  - `style.css` (both copies): `.zcpxBrandMark`'s `border-radius` changed
    from the old small-square-corner token to `50%`, plus `object-fit: cover`
    - same `1.875rem` width/height as before, now renders as a circle.
  - Did not touch `dist/Component-preload.js` (a prebuilt bundle with the
    view inlined as a string) - same precedent as Open Issue #14, which only
    ever hand-edited the two `index.html`/view/css files, never the preload
    bundle.
- Verified XML well-formedness on both `App.view.xml` copies. **Not yet
  confirmed in an actual browser** - no browser automation this session;
  user should hard-refresh and confirm the round logo renders correctly in
  the header at the same size/position as the old icon.

### 31. Header logo "not properly visible" - fixed by cropping just the icon mark out of the full logo (2026-10-05)
- Follow-up to Open Issue #30: user reported the round header logo wasn't
  showing properly and shared a screenshot (`assets/logs.png`).
- **Root cause:** `emami-logo-new.jpg` (447×447) isn't just the circular
  swirl mark - it's the full lockup with the "emami GROUP" wordmark baked in
  directly below the icon, with **zero white gap** between them (confirmed
  pixel-row-by-row - no fully-white row exists between the circle and the
  "e" of "emami", so they're touching by design). At the header's actual
  `1.875rem` (~30px) size, the whole lockup scaled down together, making the
  wordmark an illegible smear and leaving only a small fraction of the
  image as recognizable icon detail.
- **Fixed:** cropped a new derived asset, `emami-icon-mark.jpg` (195×188,
  via Pillow - installed this session, not previously available), isolating
  just the circular swirl and excluding all text - verified by rendering a
  4x-scale simulation of the actual 30px circular header slot before calling
  it done. Saved into both `webapp/images/` and `dist/images/` alongside the
  original full logo (kept, untouched, in case a bigger placement elsewhere
  ever wants the full lockup with text).
  - `App.view.xml` (both copies): `<Image src="images/emami-icon-mark.jpg">`
    (was `emami-logo-new.jpg`).
  - `style.css` (both copies): `.zcpxBrandMark`'s `object-fit` changed from
    `cover` to `contain` - the crop is close to square but not pixel-exact,
    and `contain` guarantees the whole icon always renders with no further
    cropping risk, at the cost of a sliver of empty padding on the shorter
    side (negligible at this size).
- Verified XML well-formedness. **Not yet confirmed in an actual browser**
  - no browser automation this session, though the 4x rendered simulation
    matches what the real CSS/HTML should produce; user should hard-refresh
    and do a final visual check.

### 12. Missing spec document from backend team (still pending)
- Original ask: backend team implemented something and was going to share a
  document describing it, so entities could be bound into the frontend based
  on it. Document has not been shared yet as of today.

### 37. Approval-chain test-user setup — live-queried exact backend state, emailed backend team the gaps (2026-10-28)
- **Goal:** figure out exactly which user IDs the backend/functional team
  needs to configure (and how) so the 3-step DOA chain (`HOD Operations` →
  `VP Operations` → `President Operations`) can be tested end-to-end without
  the earlier "same account approving 3-4 times" bug recurring.
- **Method:** no UI/browser automation — started the local `ui5 serve`
  dev server (`fiori-tools-proxy` → `EDS` destination) and queried the real
  OData service directly via curl, same approach as every other live check
  in this log.
- **Queried `CurrentUserSet` (unfiltered, full read):** returned **exactly
  one record total** — `90007422` (INDRANIL BANERJEE), `Role: "Unit
  Initiator"`, `IsAdmin: "X"`. Direct key-reads for `IT_FCOMMON` and
  `IT_AMIT` both return **HTTP 500** ("unknown internal server error"), not
  404 — because those user records **don't exist yet** in `CurrentUserSet`
  at all (confirmed by the empty unfiltered read), and the Gateway doesn't
  handle a not-found key cleanly.
- **Queried `DoaRuleSet` with `$expand=DoaRuleToChain`:** confirmed all 6
  DOA rules (D1–D6) use the **identical 3-step chain and identical 3
  approver IDs** (`90007422` → `IT_FCOMMON` → `IT_AMIT`) — settles the
  previously-open question of whether D2–D6 might use different people.
  Amount thresholds also confirmed live: D1/D2 split at ₹10,00,000, D5/D6
  split at ₹5,00,000, matching the documented matrix.
- **Queried `UserPlantSet`:** also only **one row total** — `90007422` →
  plant `UN13` ("EMAMI LTD, Pachoria"). All live test Budgets
  (`B-2026-008/009/010/011`) are under `Werks = UN13`. `BaseController.js
  #applyPlantAuth` filters any list (e.g. Approval Inbox) to only the
  viewer's `authorizedPlants`, **unless** `IsGlobal = "X"` or
  `authorizedPlants` comes back empty (in which case it fails open — shows
  everything, by accident, not by design). So any newly-created approver
  account with zero `UserPlantSet` rows would *appear* to work today purely
  because of that fail-open behavior, not because plant auth was actually
  configured correctly.
- **Confirmed (not a frontend gap):** Budget/CPE **creation** has zero
  `Role`/`IsAdmin` checks anywhere in `BudgetCreate.controller.js` /
  `CPECreate.controller.js` — any logged-in account can create/submit. The
  Role/IsAdmin/plant gates only apply at the approval step
  (`ApprovalDetail`/`BudgetApprovalDetail`/`ApprovalInbox`). This means once
  `90007422` is converted to a pure `HOD Operations` approver, there is no
  account left with `Role = "Unit Initiator"` to raise new requests — a 4th
  account is needed for that persona, beyond the 3 approvers.
- **User sent an email to the backend/functional team** today asking them to
  configure 4 accounts total:

  | User ID | `Role` must be | `IsAdmin` | `UserPlantSet` row |
  |---|---|---|---|
  | `90007422` | `HOD Operations` (currently `Unit Initiator` — wrong) | blank/false (currently `X` — wrong) | has `UN13` already |
  | `IT_FCOMMON` | `VP Operations` | blank/false | needs `UN13` — record doesn't exist yet |
  | `IT_AMIT` | `President Operations` | blank/false | needs `UN13` — record doesn't exist yet |
  | 4th ID (initiator, not yet picked) | `Unit Initiator` | blank/false | needs `UN13` |

- **Not yet done / next session should check:** whether backend has acted on
  the email; once they confirm, re-run the same live `CurrentUserSet`/
  `UserPlantSet` queries to verify before attempting the full §5 walkthrough
  in `CAPEX_APPROVAL_TESTING.md` (Unit Initiator creates → HOD Operations
  approves → VP Operations approves → President Operations approves →
  `APPROVED`).

### 38. IMPORTANT — identified two different backend systems in play; QA (`emamiqa.emami.local`) is the real test target, not the BAS `EDS` destination (2026-10-28, later)
- All live checks in Open Issue #37 (and every other live check this whole
  session, going back to earlier dates) were run via the local `ui5 serve`
  dev server's `fiori-tools-proxy` → BAS destination `EDS`, which resolves
  to host **`ppcuser:443`**. That is a **different SAP system** from
  **`emamiqa.emami.local:44300`** — the Quality system the user is actually
  testing against when opening the app "by link" (as opposed to by Fiori
  Launchpad tile). User confirmed explicitly: "QA is quality and we are
  testing in Quality."
- This is why backend's user-master-data fix "worked" when the user opened
  the app by link but appeared not to take effect when checked via this
  session's `EDS`/`ppcuser` connection (Open Issue #37's "backend updated...
  but based on tile you will not able to find" exchange) — two genuinely
  different backends, not a caching issue, not a mistake on backend's side.
- **`emamiqa.emami.local:44300` is not reachable from this sandbox at all**
  (tried a direct curl, no route — likely needs VPN/corporate network
  access). From here on, QA-side checks in this session are done by the
  user pasting the raw OData JSON response and this session analyzing it,
  not by an independent live curl the way `EDS`/`ppcuser` checks were done.
- **QA's live `DoaRuleSet` (`$expand=DoaRuleToChain`), pasted by the user,
  shows a different chain shape than what was understood from `EDS`/`ppcuser`
  and the original `CAPEX_APPROVAL_TESTING.md` doc:**
  - It's a **4-step chain**, not 3. Step 1 (`Seqnr='01'`) is `Role: "Unit
    Initiator"`, `Approver: 90007422`, `Mandatory: "X"` — the initiator is
    now a formal, mandatory chain step, not just the person who raises the
    request before `CurrLevel` starts.
  - **Role↔ID mapping changed from what the doc assumed:** `IT_FCOMMON` is
    now `HOD Operations` (not `VP Operations`). `VP Operations` is a new
    person/ID, `90009349` (Sayontan Das) — this is the 4th ID the user had
    backend add, confirmed by name here for the first time.`IT_AMIT` (Amit
    Biswas) is unchanged as the final `President Operations` approver.
  - Confirmed true identically across D1–D5. **D6 has a data problem:**
    `Seqnr='03'` and `Seqnr='04'` are **both** labeled `Role: "President
    Operations"` (`03` → approver `90009349`/Sayontan Das, `04` → approver
    `IT_AMIT`/Amit Biswas) — `03` should read `"VP Operations"` like every
    other rule. Flagged to the user as something to send back to backend:
    if left as-is, two different people will both match `CurrLevel =
    "President Operations"` for D6 (IT, >₹5L), which would reproduce the
    original "wrong person can approve" class of bug specifically for that
    one rule.
- **Still to confirm on QA (ask user to paste, not independently checked):**
  `CurrentUserSet`/`UserPlantSet` for `90007422`/`IT_FCOMMON`/`90009349`/
  `IT_AMIT` on `emamiqa.emami.local`, to verify each one's `Role`/`IsAdmin`/
  plant actually matches this new 4-step chain before attempting a real
  end-to-end CPE approval test there.

### 39. QA approver role mapping — confirmed final by user (2026-10-28, later)
- User shared a screenshot (`Unit Initiator.png`, from the app's own
  `images/` — a frontend profile/role display, not a data source) and
  confirmed the real QA role mapping explicitly, to be taken as settled:

  | User ID | Role (QA) |
  |---|---|
  | `90007422` | Unit Initiator |
  | `IT_FCOMMON` | HOD Operations |
  | `90009349` | VP Operations |
  | `IT_AMIT` | President Operations |

  Matches exactly what QA's live `DoaRuleSet` (Open Issue #38) showed for
  D1–D5 — this is now the confirmed mapping to work from, no longer "to be
  verified."
- User also confirmed directly: this session **cannot** independently fetch
  QA live data — QA (`emamiqa.emami.local`) only opens via the user's own
  direct link/browser, not reachable from this sandbox (see Open Issue #38).
  Going forward, any QA-side verification in this session happens by the
  user pasting the raw OData JSON response here, not by this session
  curling it directly the way the `EDS`/`ppcuser` system was checked earlier.
- **Reminder for future sessions:** don't confuse QA (`emamiqa.emami.local`,
  the real test target, 4-step chain with initiator as a mandatory step) with
  the BAS `EDS` destination (`ppcuser`, reachable via the local `ui5 serve`
  proxy, 3-step chain, separate test data like `CPE-2026-0050`/`B-2026-009`)
  — they are two different systems with different data, confirmed Open Issue
  #38.

---

## Fixes applied this session (2026-09-30)

1. **Budget Save Draft** (`BudgetCreate.controller.js`) — was completely
   local/fake (`_persist` into the in-memory model only, never called the
   backend, vanished on reload). Rewired to real `createEntity("/BudgetSet")`.
   Removed the now-dead `_persist` method. Verified live: `201 Created`,
   `Status: "DRAFT"`, new id `B-2026-006`.

2. **Budget resubmit** (`BudgetDetail.view.xml` + `BudgetDetail.controller.js`)
   — there was no way to submit an already-saved draft at all. Added a
   "Submit" button (visible only when `status === 'DRAFT'`) and
   `onSubmitPress`, which calls **only** `SubmitDocument` (never
   `createEntity` again — that would duplicate the budget).

3. **Unit Quota submit** (`UnitQuota.controller.js`) — `SubmitQuotaCapex` was
   missing `Title`/`Justification`, both required by `$metadata`. Added them,
   added a justification-required validation (field existed in the view but
   was never validated), and replaced the local-only `_persist` fabrication
   with a real reload via the existing `_loadLiveQuota()`. Removed the now-dead
   `_persist` method.

4. **Evaluation Save** (`Evaluation.controller.js`) — `onSave` had zero
   backend call. Now calls `SaveEvaluation` (previously defined live but never
   used) with `CpeId`/`TechCompliant`/`TechRemark`/`Justification`. `VendorSeq`
   is sent blank — vendor comparison isn't live-wired at all yet (still 100%
   mock data, per `Component.js`'s own deferred-work comment), so there's no
   real vendor sequence to send; guessing one from the mock `V1`/`V2` ids was
   avoided.

5. **Evaluation Submit** (`Evaluation.controller.js`) — `SubmitEvaluation` was
   only sending `CpeId`, missing `TechCompliant`/`TechRemark`/`VendorSeq`/
   `Justification`. Added all four (same `VendorSeq` blank caveat as #4).

6. **PO Detail Confirm PO** (`PODetail.controller.js` + `Component.js`) —
   `onConfirmPO` used to hand-patch the local PO list and guess the resulting
   status. Added a reusable `_loadLivePOList()` on the Component (extracted
   from an inline lambda that used to live only inside the initial loader
   list) and call it after `ConfirmPO` succeeds, so the PO list now reflects
   real backend state.

7. **CWIP Create "Push to SAP"** (`CWIPCreate.controller.js`) — `CreateCWIP`
   was only sending `CpeId`/`AssetClass`/`CostCenter` (3 of 9 required
   params). Added the missing `WbsElement`/`PaymentTerms`/`TimeframeWeeks`/
   `ExecProcess`/`ProfitCenter`/`Remarks` — all of this data already existed
   in the draft, just wasn't being sent.

8. **CPE Create (Save Draft + Submit)** (`CPECreate.controller.js`) — both
   were completely local/fake, same pattern as Budget originally was. Rewired
   `onSaveDraft` to real `createEntity("/CPESet")`, and `onSubmit` to the same
   create-then-`SubmitCPE` two-step pattern as Budget, including the common
   pool draw fields (`PoolBudgetId`/`PoolAmount`, sourced from
   `oDraft.fundingTopUp` — already collected by the existing
   "draw from common pool" flow, just never sent anywhere). Added
   `_buildCpePayload` mirroring Budget's `_buildBudgetPayload`, with correct
   decimal scales pulled from live `$metadata` (`Amount`/`Investment`/`Npv`/
   `PoolAmount` → 3dp, `HurdleRate`/`Irr`/`Payback` → 2dp). `SelVendor` sent
   blank for the same not-live-wired-vendor-data reason as #4/#5. Removed the
   now-dead `_persist`/`_commitToBudget` methods.
   - Live-tested the underlying `CPESet` create with a correct payload: it
     returns the same HTTP 500 as `SubmitDocument` (see Open Issue #1). So
     this fix is verified *correct* but not verified *working* — that's on
     the backend team now, same as Budget Submit.

**Deliberately NOT touched this session**, with reasons — see Open Issues 3 and 4:
- CWIP Create "Save Draft" (still a no-op stub — no backend draft concept
  found for CWIP; `CreateCWIP` appears to be a single-step create, not a
  draft-then-submit flow like Budget/CPE).
- IC / Capitalization (`ICDetail.controller.js`) — real data-modeling gap,
  not a quick fix. See Open Issue #4.
- Approval Detail / Approval Inbox — needs a new live-read feature, not a
  quick fix. See Open Issue #3.

---

## Test data created on the live backend (flag if cleanup is wanted)

- `B-2026-005` — pre-existing draft from an earlier session, garbage
  `Justification` text, still `DRAFT`.
- `B-2026-006` — "Draft wiring test - safe to delete", created while verifying
  the Budget Save Draft fix, `DRAFT`.
- No new records were created while testing `CPESet` (that POST returned
  HTTP 500, so nothing persisted).
- `B-2026-008` — real DOA level advanced live (`HOD Operations` → `VP
  Operations`) via a deliberate `ApproveDocument` test call, 2026-10-01 (see
  Open Issue #11). Status is still `IN_APPROVAL`, one level short of fully
  `APPROVED`. Flag if this needs to be reverted/reset before real testing.
- No delete capability exists in the app UI, and `$metadata` marks
  `sap:deletable="false"` on Budget (though that flag can be stale — verify
  live before trusting it, per past experience). Left both records in place;
  user has not asked for cleanup yet.

---

## Where things came from (user instructions/decisions trail)

- Session started: user said budget submission had errored previously, wanted
  to retest budget creation and submission from scratch today, plus a second
  thing called "submit document."
- Confirmed no code had been changed by the assistant before this session
  (git diff matched pre-existing state).
- User asked to debug step by step starting from Budget "since you have all
  the data" → led to discovering the `SubmitDocument` 500 is unchanged from
  2026-09-29, plus the missing-resubmit-button gap as a byproduct of reading
  the code.
- User asked specifically about plant-based visibility across the whole
  project → led to the Audit Trail/Reports/DOA Matrix review; user did not
  ask for any code changes there yet.
- User said resubmit "was not as per requirement, leave that for now" —
  deprioritized initially.
- User then asked directly "is Save Draft safe/working" → found it was fake
  (client-only, non-persistent) → user said "yes go ahead, fix save draft" →
  fixed.
- After testing Save Draft, user asked "what if user wants to submit that
  existing draft" — reopened the resubmit topic on their own → user said
  "Yes, add the submit button for draft budgets" → fixed.
- User asked to confirm the resubmit button wouldn't call `createEntity`
  again — confirmed it correctly calls only `SubmitDocument` for an existing
  record.
- User asked this log file to be created and kept updated going forward.
- User asked "where do we have save draft besides Budget" → found CPE Create
  (same fake pattern) and CWIP Create (complete no-op) as look-only findings,
  not yet fixed.
- User asked to integrate "whatever entities are working" end to end → a full
  audit was run first (per-module real/fake/blocked status). Found most
  downstream modules share Budget's original problem, and CPE creation itself
  is also backend-blocked (500), not just a frontend gap.
- User agreed to fix the three items assessed as purely-frontend gaps: Unit
  Quota params, Evaluation Save, and the PO/Approval re-fetch gap. Approval
  turned out to be a much bigger gap than described (no live read at all,
  not fixed) — flagged rather than silently expanded.
- User asked to confirm "whatever entities are working, you integrated all
  those right?" → answered no, gave the honest per-module breakdown (what was
  actually fixed vs. still fake/blocked).
- User asked whether the "not integrated" ones just have correct
  calls-but-backend-errors → answered no, it varies: some are genuinely
  backend-blocked with correct requests (Budget Submit, CPE Create), others
  still have incomplete/wrong requests on the frontend side that were never
  even tested with a correct payload (CWIP push, Evaluation submit at the
  time), and Approval's issue is neither — it's a missing read-back feature.
- User then clarified the real instruction: wire every remaining call to
  match `$metadata` exactly regardless of current backend state, so nothing
  further is needed once the backend is fixed. Fixed CWIP push params,
  Evaluation submit params, and did the full CPE Create rewrite on this basis.
  Stopped at IC/Capitalization once it became clear the gap there is missing
  data (no `Cwipid` lookup, no asset-class/cost-center carry-forward from
  CWIP, no function import to save against) rather than just missing
  parameters — flagged instead of guessing.
- 2026-10-28: user referenced a separate testing-guide doc
  (`CAPEX_APPROVAL_TESTING.md` — approval roles/levels and how to test the
  chain end-to-end) and asked to check the live backend response for the 3
  approver IDs it names, explicitly "don't generate anything, just fetch and
  tell me" → live-queried `CurrentUserSet`/`DoaRuleSet`/`UserPlantSet`
  directly (see Open Issue #37), reported findings only, no doc/code
  changes. User then asked who creates Budgets/CPEs if `90007422` becomes a
  pure approver → confirmed creation is unrestricted on the frontend, but
  flagged a 4th "Unit Initiator" account is needed. User asked if 4 accounts
  are enough → surfaced the plant-authorization (`UserPlantSet`) gate as a
  third, previously-undiscussed requirement. User has since emailed the
  backend/functional team the consolidated ask (see #37) and asked this log
  to be updated to record the session — this entry and Open Issue #37 are
  that record.

### 40. QA account verification in progress (2026-10-29) — checking backend's fixes against Open Issues #37/#38, 2 of 4 IDs checked so far
- This session can't reach QA (`emamiqa.emami.local`) directly (Open Issue
  #38) — user is pasting raw `CurrentUserSet`/`UserPlantSet` JSON per ID for
  this session to check against the required config table in Open Issue #37.
- **`90009349` (Sayontan Das, VP Operations) — fully correct, no action
  needed.** `Role: "VP Operations"`, `IsAdmin: ""` (blank), `Active: "X"`,
  `UserPlantSet` has `UN13` ("EMAMI LTD, Pachoria"). Matches the Open Issue
  #37 ask exactly. (User initially typed this ID as `90009439` when pasting
  — the JSON itself confirms the real id is `90009349`, matching every other
  reference to this person in this log; noted as a probable typo, not a data
  issue.)
- **`90007422` (Indranil Banerjee) — `IsAdmin` fixed, `Role` conflict not yet
  resolved, needs a user decision, not purely a backend-compliance check.**
  `IsAdmin: ""` (blank) — correctly fixed, was `"X"` before. `Role: "Unit
  Initiator"` — **unchanged**, NOT converted to `HOD Operations` as the
  Open Issue #37 email asked for. `UserPlantSet` has `UN13`, correct.
  - This isn't necessarily a backend miss: Open Issue #38 (found *after* the
    #37 email was sent) showed QA's real `DoaRuleSet` has a 4-step chain
    where `Seqnr='01'` is a **mandatory** `Unit Initiator` step with
    approver `90007422` — i.e. the real chain design may want `90007422` to
    stay `Unit Initiator`, contradicting the original email's ask to convert
    him to `HOD Operations`.
  - **Resolved — confirmed intentional, not a backend miss.** User shared
    the backend's own SAP table-maintenance screenshot (`webapp/images/Unit
    Initiator.png`, "CAPEX: portal users") showing the actual configured
    mapping: `90007422` → `Unit Initiator` (UN13), `90009349` → `VP
    Operations` (UN13), `IT_AMIT` → `President Operations` (UN13),
    `IT_FCOMMON` → `HOD Operations` (UN13), plus an unused/unassigned 5th
    account `90008780` (blank role, UN13). This matches QA's live
    `CurrentUserSet` response for `90007422` exactly — backend deliberately
    kept him as `Unit Initiator` (consistent with the 4-step chain design
    from Open Issue #38), not an unapplied fix from the original #37 email.
    **No further backend change needed for `90007422`.**
- **`IT_FCOMMON` (HOD Operations) — fully correct, no action needed.**
  `Role: "HOD Operations"`, `IsAdmin: ""` (blank), `Active: "X"`,
  `UserPlantSet` has `UN13` ("EMAMI LTD, Pachoria"). Matches the Open Issue
  #37 ask and the backend's own "CAPEX: portal users" screenshot exactly.
- **`IT_AMIT` (President Operations, Amit Biswas) — Role/Unit/Plant correct,
  but `IsAdmin`/`IsGlobal` both `"X"`, not blank as the Open Issue #37 ask
  specified.** `Role: "President Operations"`, `Active: "X"`, `UserPlantSet`
  has `UN13` ("EMAMI LTD, Pachoria") — all correct. But `IsAdmin: "X"` and
  `IsGlobal: "X"` — the #37 table asked for `IsAdmin` blank on all 4 accounts
  (only `90007422` was flagged as wrongly `"X"` at the time; `IT_AMIT` wasn't
  checked back then). `IsGlobal: "X"` is new information — per
  `BaseController.js#applyPlantAuth` (Open Issue #37), `IsGlobal = "X"` makes
  plant-based filtering not apply at all for this user (sees every plant's
  data, not just `UN13`).
  - Not necessarily wrong: `IsAdmin`/`IsGlobal` on the final, top-level
    approver (President Operations) plausibly reflects an intentional
    "sees/can-act-on everything" design, unlike the lower approval levels.
    But it wasn't explicitly confirmed as intended anywhere in this log —
    flagged as a question for the user/backend team, not assumed correct or
    incorrect.
- **All 4 QA accounts now checked.** 3 of 4 (`90009349`, `90007422`,
  `IT_FCOMMON`) match the Open Issue #37 ask exactly. `IT_AMIT` matches on
  Role/Unit/Plant but has `IsAdmin`/`IsGlobal` both `"X"` — flagged above,
  needs a decision on whether that's intended for the top-level approver or
  should also be blanked per the original ask.
- **Recommendation given to the user: `IT_AMIT`'s `IsAdmin` and `IsGlobal`
  should both be blank, same as the other 3 accounts — this is a real test
  gap, not just a style preference.** Reasoning, based on
  `BaseController.js`'s own approval-permission check
  (`oUser.isAdmin || oUser.role === oBudget.currentLevel`, per Open Issue
  #37): `IsAdmin: "X"` alone satisfies that check regardless of the actual
  current DOA level, so Amit could approve/act on a Budget or CPE at *any*
  step (HOD's, VP's, or his own) — not only when it's genuinely at
  "President Operations." That would let the chain be approved out of order
  during testing and mask whether real role-based routing works, defeating
  the point of an end-to-end DOA test. `IsGlobal: "X"` similarly bypasses
  `applyPlantAuth`'s plant filtering entirely (sees every plant's queue, not
  just `UN13`) — harmless today since all test data is on `UN13`, but
  broader than his role needs and not something the original #37 ask
  included.
- **Net result of this verification pass:** 3 of 4 QA accounts
  (`90007422`/Unit Initiator, `IT_FCOMMON`/HOD Operations,
  `90009349`/VP Operations) are fully correctly configured, no further
  backend change needed. One remaining ask for the backend/functional team:
  blank out `IT_AMIT`'s `IsAdmin` and `IsGlobal` flags so the full 4-step
  chain (Unit Initiator → HOD → VP → President Operations) can be tested
  with real role-based gating end to end, not short-circuited by admin/global
  overrides. Separately, Open Issue #38's D6 `DoaRuleSet` duplicate-`Seqnr`
  bug (two rows both labeled "President Operations") is still open and
  should go to backend alongside this.
- The confirmed 4-step approval flow to test once `IT_AMIT` is fixed:
  `90007422` (Unit Initiator, raises) → `IT_FCOMMON` (HOD Operations) →
  `90009349` (VP Operations) → `IT_AMIT` (President Operations, final
  approval → `Status: APPROVED`). All four sit on plant `UN13`, matching the
  live test Budgets (`B-2026-008/009/010/011`).
- **Resolved — backend/functional team confirmed `IT_AMIT`'s `IsAdmin`/
  `IsGlobal` = `"X"` is intentional, "required for testing purpose."** User
  raised the flagged recommendation with them directly; backend's answer was
  that it's deliberate, not a leftover config to fix. Treated as settled —
  no further change requested on this account.
  - **Caveat worth remembering, not re-raised to backend yet:** because
    `IsAdmin="X"` satisfies `BaseController.js`'s
    `oUser.isAdmin || oUser.role === oBudget.currentLevel` check on its own,
    any approval test done through `IT_AMIT` can succeed even when the
    document isn't actually at the "President Operations" step yet — so a
    successful approve by him alone doesn't prove the HOD→VP→President
    role-based gating is working correctly. If the goal is to verify the
    *chain* (not just that the final approve action works), the walkthrough
    should still go through `90007422`→`IT_FCOMMON`→`90009349` in order
    first, rather than relying on `IT_AMIT` to validate intermediate steps.

### 41. Dashboard "Approval Queue by Level" table empty/wrong - real root cause was a stale workaround silently deleting live data, not a missing Budget integration (fixed, 2026-11-02)
- User reported a created Budget never shows up in this table while a CPE
  does, and separately that the table sometimes shows no data at all -
  asked for analysis only, no code changes yet.
- **Live-checked the backend directly before touching any code.** All 4 live
  Budgets (`B-2026-008..011`) are already `Status: APPROVED, CurrLevel:
  Completed` - nothing is currently pending for Budgets, so there was
  nothing wrong with "Budget not showing" in that specific case (correct,
  not a bug).
- **Found the real bug while checking further.** `ApprovalInboxSet` was
  assumed (per Open Issue #13, 2026-10-01) to always return zero rows,
  which is why `_mergeBudgetApprovals`/`_mergeCpeApprovals` exist as a
  client-side fallback. That assumption is now stale: live-queried
  `ApprovalInboxSet` and got a real row back (`CPE-2026-0050`, `Status:
  HOLD`, `CurrLevel: VP Operations`). The fallback merges were still
  unconditionally stripping out and replacing every row of their own
  `docType` using only their own narrow `status === "IN_APPROVAL"` filter -
  `HOLD` doesn't match it, so the one real pending row was being silently
  deleted immediately after being loaded, every time. Net effect: the queue
  was very likely blank regardless of Budget data.
- **Fixed in `Component.js`:** `mapBudgetToInboxRow`/`mapCpeToInboxRow` now
  tag their rows `isFallback: true`. `_mergeBudgetApprovals`/
  `_mergeCpeApprovals` now only ever remove/replace their own previously-
  added fallback rows (matched via `isFallback`) and only add a fallback row
  for a document not already covered by a real `ApprovalInboxSet` row
  (deduped by `docId`) - real live rows are never touched regardless of
  their status. Verified by replaying the real captured live data through
  the fixed logic in Node: the real HOLD row now survives the merge.
- Secondary finding/fix: the queue table's second column header was
  hardcoded literal text `"CPEs"` (`Dashboard.view.xml`), not generic, even
  though a row can mix Budget and CPE documents - likely contributor to the
  functional team's confusion. Renamed to "Items"; `_buildQueue`
  (`Dashboard.controller.js`) now also tallies a per-docType count
  (`byType`), and a new `formatQueueItems` formatter shows the plain count
  unless a row actually mixes types, e.g. `3 (1 Budget · 2 CPE)`.
- Also fixed the Value column: it was hardcoded to `formatter.inCrores`,
  which rounds small amounts (e.g. a real ₹4,100 CPE) down to `0.00 Cr` -
  not missing data, just the wrong unit. Switched to the existing
  `formatter.money()`, which auto-picks Lakhs vs Crores by magnitude.
- Verified: `node -c`/XML checks pass on all touched files; replayed real
  live data through the new merge/queue logic in Node to confirm correct
  output before and after. `dist/` rebuilt via `npm run build`. **Not yet
  confirmed by clicking through in an actual browser.**

### 42. Dashboard KPI tiles made clickable, navigate to the screen that explains each number (added, 2026-11-02)
- User asked whether each of the 10 KPI cards could navigate to its
  underlying data/screen on click, per a functional request.
- Checked first: `sap.m.VBox` (what these cards are built from) has no
  `press` event in its own metadata (confirmed against the installed UI5
  source) - added click handling via `attachBrowserEvent` instead, which
  needed no visual/CSS changes.
- **Wired 8 of the 10 tiles** (`Dashboard.view.xml`/`.controller.js`,
  `_wireKpiTiles`): Approved CPEs → CPE List (pre-filtered to the Approved
  tab), Committed → PO List, Spent → GRN List, Capitalized → IC List,
  Available → Budget List, CWIP Pending Capitalization → Capitalization
  screen (reused existing `onGoCapitalization`), Pending Approvals →
  Approval Inbox (reused existing `onGoApprovals`), SLA Breaches → Approval
  Inbox pre-filtered to Breached.
- **Avg Approval Cycle and Negotiation Savings YTD deliberately left
  unclickable** - both are still hardcoded `0` with no backend source
  (same gap noted in Open Issue #28), so there's nothing real to navigate
  to yet.
- Pre-filtering mechanism: a one-shot transient property on the shared
  `app` model (`cpeListInitialStatus`, `approvalInboxInitialSla`), set by
  the Dashboard right before navigating, read once by the target screen's
  own `_onMatched` (`CPEList.controller.js`, `ApprovalInbox.controller.js`)
  using its own pre-existing filter control (status `IconTabBar`/SLA
  `ComboBox` - no new filter UI added), then cleared so a later ordinary
  visit to that screen isn't stuck filtered.
- **Known gap, flagged rather than silently expanded:** "Capitalized" lands
  on the full IC List (every status), not just capitalized ones - that
  screen has no status filter control at all today (only free-text search),
  and adding one wasn't part of what was asked.
- Verified: `node -c`/XML checks pass; `dist/` rebuilt and confirmed to
  contain the new handlers. **Not yet clicked through in an actual browser.**

### 43. Fiscal Year header selector made live - both the dropdown's options and what selecting a year actually does (fixed, 2026-11-02)
- User asked for the nav-bar Fiscal Year dropdown to be "live data, not
  dummy." Checked first, before changing anything: the 3 options
  (FY2026-27/25-26/24-25) were hardcoded in `App.view.xml`, and - more
  importantly - changing the selection did nothing anywhere in the app
  except update a display label and tag newly-created documents; no screen
  filtered by it. Live-checked the backend: every live Budget and CPE today
  is Fiscalyear `"2026"` (no "FY" prefix, unlike the UI's own
  `"FY2026"`-shaped values) - confirmed via direct query before building
  anything.
- Asked the user what "company standard" should be here; agreed the
  standard (matching both general Fiori practice and this app's own
  existing convention for Plant/Category/CapexType, which are all read live
  from the backend's `ValueHelpSet` picklist rather than hardcoded) is that
  the selector should both reflect real data and actually filter what's
  shown - confirmed no `ValueHelpSet` domain exists for fiscal year, and no
  entity carries one besides `BudgetSet`/`CPESet` (checked `$metadata` for
  `CwipAgeingSet`/`InstallCertSet`/`PurchaseOrderSet`/`GRNSet` - none have a
  year field at all).
- **Fixed, `Component.js`:** new `_recalcFiscalYears()`, called after both
  `_loadLiveBudgetList`/`_loadLiveCpeList` land, rebuilds `app>/fiscalYears`
  from the real distinct years found across live Budget+CPE data (today:
  just `FY2026-27`) and falls the current selection forward to the newest
  real year if the previous selection no longer exists. `MockData.js` keeps
  the old 3-year list only as the pre-live-data seed fallback.
- **`App.view.xml`:** the `Select` now binds `items="{app>/fiscalYears}"`
  instead of 3 hardcoded `<core:Item>`s. `App.controller.js#onFYChange` now
  also publishes an `EventBus` event (`"app"`/`"fiscalYearChanged"`) so
  whichever screen is currently open refilters immediately, not just on the
  next navigation - same cross-screen-refresh problem the existing
  `onSwitchRole` persona switcher solves differently (by forcing a nav to
  Dashboard); EventBus was chosen instead since the FY selector is visible
  on every screen, not just reachable from one place.
- **`Dashboard.controller.js#_recalcRollup`:** now filters `aBudgets`/
  `aCPEs` (and `aInbox`, cross-referenced back to its underlying Budget/CPE
  by `docId`) to the selected year before computing every KPI derived from
  them. **Deliberately left unscoped:** Capitalized and CWIP Pending
  Capitalization, since `InstallCertSet`/`CwipAgeingSet` have no fiscal
  year field at all and joining them via `Cpeid` wasn't part of what was
  asked.
- **`BudgetList.controller.js`/`CPEList.controller.js`:** both now fold a
  fiscal-year filter into their existing plant-auth filter construction
  (`_applyPlantAuthFilter`/`_buildAuthFilter`), and both subscribe to the
  same `fiscalYearChanged` event to rebuild it live. `CPEList`'s status-tab
  counts are scoped the same way.
- Fiscal year values aren't shaped consistently everywhere ("FY2026" in the
  UI/seed vs plain "2026" live) - added a small `fyDigits()` helper
  (reducing to the last 4 digits) duplicated in each touched controller,
  matching the same normalization technique `BudgetCreate`/`CPECreate`
  already used when stamping a new document's `Fiscalyear`.
- Verified: `node -c`/XML checks pass on all 7 touched files; replayed the
  real live data (`2026` on every record) through the actual filter logic
  in Node - correct totals for FY2026, correctly empty for FY2025 (no data
  exists for it yet, which is accurate). `dist/` rebuilt. **Not yet clicked
  through in an actual browser.**

### 44. "From Common Pool Bucket" funding source removed end-to-end, per functional ask (removed, 2026-11-02)
- User reported the functional team said this Budget Create radio button
  "is not required." Checked first, before touching anything: it wasn't
  just a cosmetic option - selecting it at Budget creation is the *only*
  way a Budget ever gets marked `isCommonPool: true`, which is exactly what
  CPE Create's "draw from common pool" remedy (`onBudgetRemedy`,
  documented business rule in README section 6) searches live Budgets for
  when a CPE exceeds its own budget. Removing only the radio button would
  have silently broken that remedy going forward (it would always say "No
  common pool bucket is configured").
- Asked the user to choose: keep it, remove the radio only, or remove the
  whole feature both sides. **User chose: remove it end-to-end, both
  sides.**
- **Removed:** the "From Common Pool Bucket" `RadioButton` from
  `BudgetCreate.view.xml`'s Funding Source group (now just New/Existing
  IO); `BudgetCreate.controller.js`'s `onFundingChange`/`mFundingSrcCode`
  updated to match, `IsCommonpool` hardcoded to `""` with a comment
  (permanent BudgetSet field, now always blank by construction). CPE
  Create's entire "Draw from Common Pool" remedy removed - the `lnkBudgetAction`
  link (`CPECreate.view.xml`) and `onBudgetRemedy` handler
  (`CPECreate.controller.js`) deleted; `_renderBudgetVerdict` no longer
  references the link. Orphaned i18n keys `fsCommonPool`/`useCommonPool`
  removed.
- **No backend change needed/requested** - `IsCommonpool`/`FundingSrc`
  (Budget) and `PoolBudgetId`/`PoolAmount` (CPE) all stay in the OData
  payload exactly as `$metadata` defines them; they just always carry the
  same blank/zero values the backend already accepts for every non-pool
  document today, since the UI can no longer produce anything else.
- **Deliberately left alone, in scope per what was approved:**
  `BudgetList.view.xml`/`BudgetDetail.view.xml`'s passive "Common Pool
  Bucket" display badge, which just shows `isCommonPool` on whatever
  existing backend data already has it set - not part of the two spots the
  user approved removing.
- **Correction surfaced to the user after the fact:** initially described
  "route for a budget increase" as the remaining remedy once the pool
  option was gone - turned out that was never actually built (only a
  leftover, already-unused `routeForIncrease` i18n string, no real
  link/button anywhere). A budget-blocked CPE now shows a hard block with
  no remedy action at all, not an alternative working path. Flagged, not
  silently built as a new feature.
- Verified: `node -c`/XML checks pass on all touched files; grepped for any
  remaining reference to the removed feature (`COMMON_POOL`,
  `fsCommonPool`, `useCommonPool`, `onBudgetRemedy`, `lnkBudgetAction`) -
  none found. `dist/` rebuilt and confirmed clean.

### 45. Discount / Hurdle Rate fixed to 8%, no longer user-editable (fixed, 2026-11-02)
- User reported the functional team said this rate (defaulted to 15%,
  freely editable) "will be fixed to 8%."
- Found the field duplicated identically in two places - Budget Create and
  CPE Create - both a plain editable `Input` two-way bound to
  `hurdleRate`, both defaulting to `15`, both feeding `calcMetrics`'s
  IRR/NPV/Payback calculation.
- **Fixed in both:** default changed `15` → `8`
  (`BudgetCreate.controller.js`/`CPECreate.controller.js`); the input
  replaced with a plain read-only `Text` showing `8%`
  (`BudgetCreate.view.xml`/`CPECreate.view.xml`), matching the existing
  read-only style already used for the "Investment" field next to it in
  Budget Create. The metric calculation itself (`onCalc`/`calcMetrics`)
  needed no change - it already just reads whatever's in the model.
- Confirmed `BudgetDetail.view.xml`/`ApprovalDetail.view.xml`'s own
  `hurdleRate` references are pure read-only display of a saved record's
  value - left untouched, they'll show 8% automatically for new documents.
- No backend change needed - `HurdleRate` is sent exactly as before, just
  always `8.00` now instead of a user-typed value.
- Verified: `node -c`/XML checks pass; grepped for the removed input's id
  (`inpRate`) - no dangling references. `dist/` rebuilt and confirmed to
  contain the `hurdleRate: 8` default.

### 46. CPE Create: Vendor Comparison table was erasing other rows' in-progress typing when a 2nd/3rd vendor was added (fixed, 2026-11-02)
- User reported adding 2-3 vendors erases other fields; asked for analysis
  only before any fix.
- **Root cause confirmed from the code itself, not guessed:** `onAddVendor`
  (`CPECreate.controller.js`) adds a row by pushing onto the vendors array
  and then calling `oModel.setProperty("/draft/vendors", aVendors)` - a
  whole-array replace. The vendor table's binding has no row-identity
  tracking, so UI5 responds to any length change by destroying and
  rebuilding every row's Input controls from the model, not just the new
  one - wiping out any not-yet-committed typing in other rows.
- This exact failure mode was already diagnosed once before in this same
  file: `_rankVendors`'s own doc comment explicitly describes it ("a
  whole-array replace re-applies every bound Input's value from the model
  on every row, stomping any other field's in-progress (uncommitted)
  typing") and was rewritten to patch one row's `rank` via indexed
  `setProperty` instead - that fix was just never applied to
  `onAddVendor`/`onRemoveVendor`, which still do the forbidden whole-array
  replace and are exactly what the user was reproducing it with.
- **Fixed:** added `key: 'id'` to the vendor table's binding
  (`CPECreate.view.xml`), enabling UI5 extended change detection - adding/
  removing a row now inserts/removes only that one row's controls, leaving
  every other row (and any in-progress typing in it) untouched. This
  requires `id` to be genuinely unique for the draft's lifetime, which the
  old length-based id generation (`"V" + (aVendors.length + 1)`) wasn't -
  add 3, remove the 2nd, add again would have reissued an id still held by
  the 3rd row. Fixed id generation to use the highest existing numeric
  suffix + 1 instead of array length (`CPECreate.controller.js`).
- Verified: `node -c`/XML checks pass; reproduced the old id-collision
  scenario in Node against both the old and new generation logic to
  confirm the fix actually prevents it (new logic correctly produces a
  fresh `V4` instead of reissuing `V3`). `dist/` rebuilt. **Not yet clicked
  through in an actual browser** - user should add 2-3 vendors, type into
  an earlier row without blurring, add another, and confirm the typed
  value survives.

### 47. "Post approval of CPE, add the actual vendor code" - analysis only, confirmed this needs a real backend change, nothing built (2026-11-02)
- Functional team asked for a field, post-CPE-approval, to add the "actual"
  vendor code. Checked first: CPE Create's live vendor search only sets a
  real `lifnr` when a suggestion is actually picked (`onVendorNameSelected`)
  - a free-typed vendor name leaves it blank, so a CPE can get fully
  approved with a vendor that has a name but no real SAP code.
- `PODetail.view.xml` already has a "Vendor Code" field, but it's read-only
  display only - there's no screen anywhere in the app where a vendor code
  can actually be typed in today.
- **Explained the standard reasoning to the user (SAP PR→PO convention):**
  an approved document shouldn't be edited afterward (breaks the audit
  trail the DOA chain exists for); the real/confirmed vendor code belongs
  at the PO stage, not retrofitted onto the CPE. This app's own data model
  already agrees - `PurchaseOrderSet` has its own vendor code field.
- **Checked whether that's actually buildable - it is not, without backend
  work.** `$metadata` shows `PurchaseOrderSet` itself is
  `sap:creatable="false" sap:updatable="false" sap:deletable="false"`, and
  its `Lifnr` property is separately locked the same way
  (`sap:creatable="false" sap:updatable="false"`). The only existing action
  touching a PO, `ConfirmPO`, takes just one parameter (`PoId`) - no vendor
  code parameter exists anywhere to send one through.
- **Conclusion given to the user: this is backend-first.** The backend team
  needs to add a new function import (matching this service's own pattern -
  everything here is dedicated actions, never generic OData updates) that
  accepts a PO id + vendor code and applies it with real validation. No
  frontend change can make this work until that exists - confirmed, not
  guessed, from the metadata's explicit locks. No code touched this round.

### 48. "They need to create PR before PO" - explained what a Purchase Requisition is, confirmed it doesn't exist anywhere in this app yet (2026-11-02)
- User relayed a functional comment with no further detail; asked what it
  means.
- **Explained standard SAP procurement sequence:** Purchase Requisition
  (PR, internal "we need this" request, `ME51N`/`Banfn`) normally precedes
  and gets released before a Purchase Order (PO, external commitment to a
  vendor, `ME21N`) can be created against it - two separate documents, not
  one.
- **Checked this app for any existing PR concept - found none at all.** No
  PR entity in the OData service's `$metadata`, no PR screen, no PR field
  anywhere in the codebase. Today's documented flow
  (`Budget → CPE → Evaluation → DOA approvals → CWIP/PO`) goes straight
  from an approved CPE to PO - the CPE itself is currently standing in for
  what a PR would normally do (it already carries the business case, vendor
  comparison, and its own approval chain).
- **Open question handed back to the user, not assumed either way:** does
  "create PR before PO" mean a backend/SAP-process step done entirely
  outside this portal (no frontend change needed), or does this portal
  itself need a new PR stage/screen/tracking field (which would need a
  brand-new backend entity and actions, same category of backend-first gap
  as Open Issue #47 above)? Not yet answered by the user. No code touched.

### 49. Large functional requirements document relayed - document attachment matrix, expanded CPE approval chain, "CJN" matrix (term unclear), unit quota thresholds (2026-11-02, analysis only)
- User pasted a requirements document covering several distinct asks, asked
  whether it was related to the PR discussion above - **it is not**,
  confirmed and explained as two separate, substantial pieces of scope:
  1. **A structured document attachment matrix for CPE creation** - named,
     typed upload slots (RFQ 1/2/3, Quotation 1/2/3, Techno-Commercial
     Comparative, Negotiation History, Justification Note, General/
     Additional), counts varying by multi-vendor vs single-vendor CPE, each
     with its own file upload + name + note, visible later when opening the
     CPE. **Checked: no attachment capability exists on CPE Create at all
     today.** CPE Detail has an "Attachments" tab, but it's a non-functional
     stub (`CPEDetail.controller.js` just shows a toast: "Attachment upload
     posts to the Gateway attachment service once the backend is live") -
     confirmed a second time later in the same conversation when the user
     restated this requirement in their own words (point 6 of the original
     document) and asked if it had been understood correctly - confirmed
     yes, same gap.
  2. **A materially larger CPE approval chain than what's configured
     today.** The document specifies up to 7-8 roles depending on amount
     (Unit Function Head/Initiator → Unit Commercial Head → Unit Head → HO
     Capex Viewer → HO Technical Head → HO Commercial Head → President
     [→ Director above ₹10L]). What's actually configured and tested per
     this log (Open Issues #37-40) is a 4-step chain (Unit Initiator → HOD
     Operations → VP Operations → President Operations). This is not a
     tweak - closer to a DOA redesign, and would need new backend
     `DoaRuleSet` rows plus real people/SAP accounts assigned to each new
     intermediate role, none of which exist today.
  3. **A separate "CJN" approval matrix, with its own unit quota thresholds
     (₹2L other units / ₹5L Pacharia, 0.50L max per unit)** - **"CJN" is
     not a term that appears anywhere in this codebase or prior session
     history.** Asked the user what it means rather than guess; the user
     confirmed they don't know either (relaying the document as received).
     **Not resolved - flagged back to the user to ask whoever sent the
     original document.** No assumption made about what it stands for.
- Told the user plainly that even once CJN is defined, the realistic next
  step for all of this is still "take it to the backend/functional team,"
  not immediate frontend work - the attachment matrix needs a real backend
  upload service that doesn't exist, and the expanded approval chain needs
  backend DOA configuration and real role/account setup, neither of which
  is something the frontend can build around. No code touched this round.

### 50. CWIP Create "Asset Class" - disambiguated what "needs to be editable" actually means, flagged a real backend risk before building anything (2026-11-02, analysis only)
- User reported the functional team said Asset Class "needs to be
  editable" when creating a CWIP.
- Checked first: `cbAssetClass` (`CWIPCreate.view.xml`) is already a live,
  unlocked `ComboBox` sourced from the real backend Asset Class picklist
  (`ValueHelpSet` domain `ASSETCLASS`) - picking a *different* valid class
  than whatever was auto-suggested from the CPE's capex type
  (`_suggestAssetClass`) already works today, nothing broken there.
- Asked the user to disambiguate "editable" into two distinct meanings
  before changing anything - **user confirmed they want free-text entry**
  (type something that isn't one of the predefined codes), not just the
  ability to pick a different item from the list.
- **Flagged a concrete backend constraint before building this:** per
  `$metadata`, `CreateCWIP`'s `AssetClass` parameter is `Edm.String`,
  `MaxLength="8"` - a real SAP asset class code field, not a description
  field. Free text sent there risks either immediate rejection (too long)
  or - more importantly - failing when the backend actually tries to use it
  to create a real SAP asset record, since Asset Class is normally
  validated against SAP's own configured master data regardless of the
  OData field's string length.
- Pointed out the CWIP Create screen already has a genuine, working
  free-text field for exactly this kind of use (`remarks`, max 2000 chars,
  already wired to `CreateCWIP`'s `Remarks` parameter) as a possible
  alternative to repurposing Asset Class itself.
- **User's plan: ask the backend team to increase `AssetClass`'s length.**
  Explained honestly that length alone likely isn't sufficient if the
  backend validates the value against real SAP asset class master data
  (a structural SAP data-model check, not a string-length check) - advised
  the user to specifically ask the backend team whether `CreateCWIP` will
  still succeed with a value that isn't one of the real configured asset
  classes, not just whether the field accepts more characters. Not yet
  answered by the backend team. No code touched this round - waiting on
  that answer before deciding whether to make the field free-text, keep it
  as a picklist, or redirect the ask toward the existing `remarks` field.

### 51. CPE Create: Document Attachment Matrix UI built, frontend-only by design - no backend storage exists yet (added, 2026-11-02)
- Follow-up to Open Issue #49's document attachment matrix requirement.
  User decided to proceed with the UI now so the backend team has something
  concrete to build against, accepting upfront that nothing persists until
  they add real storage.
- **Checked the backend more closely before building, since it looked
  promising at first glance.** A real `DocumentSet` entity already exists,
  genuinely linked to CPE via a `CPEToDocuments` relationship, with fields
  that map almost exactly to what's needed (`Filename`, `Category`,
  `UploadedBy`/`UploadedByName`/`UploadedOn`, `Filesize`/`Mimetype`). But
  **every single property on it is `sap:creatable="false"
  sap:updatable="false"`** - the same lockdown pattern this whole service
  uses everywhere else (real writes always go through a dedicated function
  import, never generic OData create/update - see Budget/CPE/PO's own
  locks). There is also no field anywhere to hold the actual file bytes
  (no stream/binary/base64 property), and no existing function import for
  upload (`SubmitDocument`/`ApproveDocument`/etc. are Budget/CPE workflow
  actions, unrelated). So this is more blocked than "just missing the file
  content field" - there is currently no mechanism at all, generic or
  dedicated, to persist a `DocumentSet` row.
- **Built anyway, frontend-only, clearly flagged:**
  `CPECreate.controller.js`/`CPECreate.view.xml` - a new "Document
  Attachments" card after Vendor Comparison:
  - RFQ and Quotation slots auto-track the vendor count (one slot each per
    vendor, capped at 3, per the matrix's multi-vendor vs single-vendor
    split) - `_buildEmptyAttachments`/`_syncAttachmentSlots`, hooked into
    `onAddVendor`/`onRemoveVendor`. Verified in Node: adding/removing
    vendors resizes the slot count correctly while preserving already-
    filled slots' data by index.
  - TCC, Negotiation History, Justification Note - fixed, always exactly
    one slot each (own dedicated handlers, since they're not in a
    repeating list and have no binding context to share the generic
    handler with).
  - General/Additional - open-ended, user-added/removed list.
  - Each slot: a `sap.ui.unified.FileUploader` (captures the picked file's
    name/size locally only - no `uploadUrl`, nothing is actually sent
    anywhere), a `Text` showing the recorded filename (deliberately not
    relying on the FileUploader's own display, since a browser file input's
    selection can't be restored after a model-driven slot resize - this
    keeps the recorded name visible regardless), and a note `Input`.
  - A `MessageStrip` warning banner states plainly that nothing here is
    saved to SAP yet - matching the honest tone of the pre-existing
    "Attachment upload posts to the Gateway attachment service once the
    backend is live" stub on CPE Detail, not pretending this works.
  - Applied the `key`-based extended-change-detection fix from Open Issue
    #46 to every repeating attachment list (RFQ/Quotation/General) and the
    same unique-id-generation fix for General's add handler, from the
    start - avoids reproducing the exact row-stomping bug in a brand new
    feature.
- **Backend ask prepared and handed to the user** (not sent by this
  session): a new function import, e.g. `UploadCpeDocument`, accepting
  `CpeId`/`Category`/`Filename`/`Mimetype`/file content (base64), creating
  a real `DocumentSet` row via the existing `CPEToDocuments` relationship;
  plus a way to retrieve/download the stored file afterward (a `$value`
  stream endpoint or similar), since CPE Detail's Attachments tab needs to
  let people open these documents later.
- Verified: `node -c`/XML checks pass; slot-sync logic validated directly
  in Node against 1→2→4→1 vendor-count scenarios (correct resize, no data
  loss on shrink/grow within the cap). `dist/` rebuilt and confirmed to
  contain the new card/handlers. **Not yet clicked through in an actual
  browser.**

### 52. CPE Create: searching/selecting a vendor was erasing a previously-entered vendor in another row (fixed, 2026-11-02)
- User reported: search/add vendor 1, then search/add vendor 2, and vendor
  1's entry vanishes. Asked for analysis first, no guessing.
- **User's own first theory - call `VendSet` once instead of live-searching
  every keystroke, let users pick from a pre-loaded dropdown - checked live
  before agreeing to it: `VendSet` has 56,842 records.** Loading that
  entire list client-side to filter locally isn't viable (far too much data
  for the browser to hold/filter), so the live, debounced, typed-term
  search itself is correct and was kept.
- **Real root cause, confirmed in the code:** every vendor row's name
  `Input` pointed its suggestion dropdown at the exact same shared,
  top-level model property (`suggestionItems="{cpe>/vendorSearchResults}"`
  in `CPECreate.view.xml`) - not one slot per row. Searching in any row
  overwrote the one shared slot every other row's dropdown was also reading
  from. The debounce timer (`onVendorNameSuggest`,
  `CPECreate.controller.js`) was a single shared instance variable too, so
  typing in one row could cancel another row's in-flight search.
- **Fixed:** each vendor row now gets its own `searchResults: []` slot
  (`onAddVendor`); `onVendorNameSuggest`/`onVendorNameSelected` read/write
  that row's own indexed path instead of the shared top-level one; the
  debounce timer is now keyed per row path (`_mVendorSearchTimers`) instead
  of one shared timer. The view's `suggestionItems` binding changed from
  `{cpe>/vendorSearchResults}` to `{cpe>searchResults}` (relative to each
  row's own context). The live search mechanism itself is unchanged.
- Verified: `node -c`/XML checks pass; replayed the exact reported scenario
  (vendor 1 already selected, then search + select vendor 2) against the
  real model-update logic in Node - vendor 1's data comes out completely
  untouched. `dist/` rebuilt and confirmed to contain the fix. **Not yet
  clicked through in an actual browser.**

### 53. Confirmed: Open Issue #47 (vendor code field post-CPE-approval) is still not done - re-asked and re-answered, nothing changed (2026-11-02)
- User asked directly whether the post-approval vendor code field (Open
  Issue #47) had been completed. Re-confirmed: no, and it still can't be -
  the backend blockers from #47 are unchanged (`PurchaseOrderSet`/`Lifnr`
  both `creatable=false`/`updatable=false`, `ConfirmPO` has no vendor code
  parameter). Nothing to build on the frontend until the backend team adds
  the new function import already specified in #47. No code touched.

### 54. CWIP Create Asset Class - requirement clarified further to "select OR type," still waiting on a go/no-go decision (2026-11-02, analysis only)
- Follow-up to Open Issue #50. User re-asked "this isn't editable, right?" -
  corrected the premise: it already is editable via the dropdown (always
  was); only free-typing a custom value doesn't work. User then clarified
  the real requirement is both together - pick from the list **or** type a
  custom value - which is exactly what the `ComboBox` control already in
  use is designed for; the gap is purely a binding one (only `selectedKey`
  is bound today, not `value`, so free-typed text never reaches the model).
- Re-flagged the same backend risk from #50 before offering to build it:
  fixing the binding would make typing *look* like it saved, but the actual
  SAP push could still fail downstream if `AssetClass` is validated against
  real asset class master data, not just length. **Asked the user whether
  to build the frontend capture now anyway (same approach as the attachment
  matrix - build correctly, flag the backend risk) or wait for backend's
  answer first - not yet answered, no code touched.**

### 55. "Admin can change the amount along with the attachment" - analysed and a design recommended, confirmed same backend blocker class as Open Issue #47 (2026-11-02, analysis only)
- New functional item relayed with no detail. Checked first: `isAdmin` is
  currently used for exactly one thing anywhere in this app - letting an
  admin bypass the role-check gate to approve/reject at any DOA level.
  There is no existing amount-editing capability anywhere, admin or
  otherwise, once a CPE/Budget is submitted.
- **Checked the backend before recommending a design:** `CPE.Amount` and
  `Budget.AmtApproved` are both `sap:creatable="false"
  sap:updatable="false"`, the same lockdown pattern as every other mutable
  field in this service (see #47/#51) - so this needs a new backend
  function import too (e.g. `ReviseCpeAmount`/`ReviseBudgetAmount`), not
  just frontend wiring.
- **Design recommended to the user** (not yet approved/built):
  1. A deliberate "Revise Amount" action (dialog), restricted to Admin,
     rather than an inline-editable amount field - too sensitive for silent
     accidental edits.
  2. Require both a typed reason **and** an attachment before saving -
     matches this app's existing justification-required pattern (non-L1
     vendor selection ≥25 chars, budget justification ≥20 chars).
  3. **The one genuinely risky part, flagged explicitly:** if the revised
     amount crosses into a different DOA bracket, the approval chain must
     be re-resolved/restarted, not silently continued on the original
     (now-mismatched) chain - otherwise a document could get approved by a
     shorter chain than its real final value requires. If it stays within
     the same bracket, no change needed.
  4. Log the old/new amount, who changed it, and the reason through the
     existing `addAudit()`/Audit Trail mechanism already used elsewhere in
     this app - nothing new to build there.
- Not yet approved by the user; no code touched.

### 56. "Only one vendor can be selected via the radio button, so is comparing multiple vendors wasted effort?" - no, confirmed with evidence already in the app (2026-11-02, analysis only)
- User questioned whether multi-vendor entry is pointless since only one
  gets picked in the end. Explained with code evidence, not just
  assertion: `_rankVendors()` auto-ranks every entered vendor L1/L2/Ln by
  quote; `CPECreate.view.xml` already shows a warning when amount > ₹10L
  and fewer than 3 vendors are entered (matches the README's "above ₹10L,
  three quotes are mandatory"); picking a non-L1 (non-cheapest) vendor
  already forces a ≥25-character written justification and shows the
  savings/premium versus L1. Multi-vendor entry is what makes the single
  final selection auditable/justifiable, not redundant with it - also ties
  directly into the RFQ/Quotation/TCC document attachment matrix just
  built (Open Issue #51), which is explicitly structured around comparing
  multiple vendor quotes. No code touched - explanation only.

### 57. Vendor Comparison "Quality" rating - confirmed purely informational, no effect on anything (2026-11-02, analysis only)
- User asked why Quality (1-5 stars per vendor) is editable at all. Checked
  the code: it is never read anywhere except to default to `3` on a new
  row and to be sent to the backend as `Quality` - it does not factor into
  `_rankVendors()` (price-only), does not trigger the non-L1 justification
  requirement, and has no effect on approval routing or budget checks.
  Explained plainly as a subjective, unscored reference field for whoever
  reviews the CPE later, and noted the inconsistency the user's question
  implicitly surfaced: unlike going against price-rank, rating something
  low quality and still picking it requires no justification at all today,
  even though it's at least as subjective as price. No code touched.

### 58. Full Vendor Comparison table field-by-field breakdown requested - surfaced two silently-defaulted fields never shown in the UI (2026-11-02, analysis only)
- User asked for a plain explanation of every field in the table, not just
  Quality. Checked each one against the actual code (not assumed):
  - **Rank** - auto-computed from Quote, drives the non-L1 justification
    rule.
  - **Vendor Name** - search-and-pick (real SAP code) or free-type (no
    code attached - see Open Issue #47's root cause).
  - **Quote** - drives Rank.
  - **Total Cost** and **Delivery (days)** - editable, stored, sent to the
    backend, but confirmed unused by any logic anywhere in the app.
  - **Quality** - see Open Issue #57, purely informational.
  - **Select (radio)** - the final winning vendor.
  - **Real finding worth flagging on its own:** `warrantyMonths` and
    `gstCompliant` are **not shown anywhere in the Vendor Comparison UI at
    all**, yet `onAddVendor` silently defaults every vendor to
    `warrantyMonths: 12, gstCompliant: true`, and both get sent to the
    backend as real fields (`WarrantyMon`, `GstCompliant`) on submit. This
    means the app currently reports "12-month warranty, GST compliant" to
    SAP for every single vendor compared, regardless of whether that's
    actually true for that vendor - nobody is ever asked to confirm either
    value. Flagged as a real data-integrity concern, not just a missing UI
    field - raised to the user, not yet actioned (no decision made on
    whether to surface these as real editable fields or remove them from
    the payload). No code touched.

### 59. "Where should Unit Quota be" - confirmed it already exists as its own screen (2026-11-02, analysis only)
- User relayed a functional comment that "unit quota should be there
  somewhere" and asked where. Checked the app: "Unit Quota Capex" is
  already a standalone top-level item in the left nav menu (its own icon,
  not nested under Budget/CPE/Procurement), route `#/quota`, screen
  `UnitQuota.view.xml`/`.controller.js`. Currently enforces a flat
  ₹2,00,000/year cap and ₹50,000/single-item cap, both live-configurable
  (`config>/quota/yearCap`/`singleCap`, fixed in an earlier session).
- Flagged the one real gap, pending confirmation this connects to the "CJN"
  document (not yet resolved at the time): the cap is the same ₹2L for
  every unit; the functional document wanted Pacharia specifically to have
  a higher ₹5L cap, which isn't supported - one global number today, not
  per-plant. No code touched.

### 60. "CJN" resolved - it simply means "Budget," not a separate document type (resolved, 2026-11-02)
- The blocker from Open Issue #49 is resolved. User confirmed (after an
  initial garbled "Budget lok" that turned out to be "Budget lol" - i.e.
  just laughing, not a second word) that CJN plainly means **Budget**, not
  an unknown acronym or a separate capital-project document type (the
  "Capital Job Number" guess floated earlier, Open Issue #49/this session's
  "how would SAP do this" discussion, was wrong).
- **Re-mapped the whole requirements document now that this is known - it
  is not a mysterious third matrix, it is simply two approval matrices, one
  per existing document type:**
  - "Any CPE Approval matrix" (< ₹10L / > ₹10L) → the approval chain for
    **CPE** documents.
  - "CJN Approval matrix Budget:" (regular / > unit quota) → the approval
    chain for **Budget** documents, with the "> Unit quota" bracket almost
    certainly meant to key off the existing Unit Quota screen (Open Issue
    #59), unconnected to it today.
- This confirms Budget and CPE are meant to each have their own expanded
  chain (currently both share the same one 4-step chain), not that a new
  document type needs to be modeled.

### 61. Full compliance gap analysis against the (now fully understood) requirements document, plus a readiness inventory (2026-11-02, analysis only)
- With CJN resolved, did a complete comparison of the requirement against
  today's app, rather than treating the backend-config items as one vague
  blob:
  1. **Chain length/roles (CPE and Budget both)** - today both document
     types share the same 4-step chain
     (Unit Initiator→HOD Operations→VP Operations→President Operations).
     Requirement wants 7-8 steps with 4-5 new roles (Unit Commercial Head,
     Unit Head, HO Capex Viewer, HO Technical Head, HO Commercial Head,
     +Director above a threshold). **Confirmed zero frontend code is
     needed for this** - `resolveDOA()` (`BaseController.js`) is already
     fully generic, reading whatever chain length/role names exist in
     `config>/doaMatrix` with no hardcoded assumptions. Purely a backend
     `DoaRuleSet` configuration task, plus real people/SAP accounts
     assigned to the new roles (today only 4 real accounts exist, for the
     4 roles currently in use).
  2. **Role-name mapping is unconfirmed, not assumed** - unclear whether
     e.g. "Unit Function Head/Initiator" is the same person/role as
     today's "Unit Initiator," whether "President" = "President
     Operations," or whether "HOD Operations" maps onto "Unit Head" or
     disappears entirely. Needs to come from whoever owns the org
     structure, not guessed.
  3. **A genuine architecture gap found, not yet confirmed as actually
     needed:** `resolveDOA(sCapexType, nAmount)` has no concept of
     document type at all - it can't currently give Budget and CPE
     different chains at the same capex type/amount, even though the
     requirement describes them as two separate matrices. Looking at the
     actual role sequences sent, they appear identical for both document
     types (same roles, Director added above a threshold either way), so
     this may not be a real requirement once confirmed - but if Budget and
     CPE genuinely need different outcomes at the same amount, this would
     need a structural change on both sides (`DoaRuleSet` needs a
     document-type column, `resolveDOA` needs to accept and filter by it).
  4. **Unit Quota connection** - the "> Unit quota" trigger in the Budget/
     CJN matrix isn't wired to the existing Unit Quota screen (Open Issue
     #59) at all today; two unrelated systems. Pacharia's ₹5L exception
     still doesn't exist anywhere (flat ₹2L today).
  5. **Document Attachment Matrix** - already built (Open Issue #51),
     tracked separately, backend storage still pending.
- **Readiness inventory given to the user**, consolidating everything from
  this session into one status list:
  - ✅ Done/working: Dashboard Approval Queue fix (#41), KPI tile
    navigation (#42), live Fiscal Year (#43), Common Pool Bucket removal
    (#44), Hurdle Rate fixed to 8% (#45), Vendor Comparison stomping fix
    (#46), vendor search cross-row fix (#52).
  - 🟡 Built, pending backend: Document Attachment Matrix (#51).
  - 🟢 Design/analysis ready, awaiting user go-ahead to build: CWIP Asset
    Class "select or type" (#50/#54), Admin amount-revision + attachment
    (#55).
  - 🔴 Backend/org work only, nothing for this session to build: vendor
    code post-approval (#47), the expanded DOA chains for both document
    types (this entry), Unit Quota/CJN escalation incl. Pacharia exception.
- No code touched this round - pure analysis/status consolidation.

### 62. PR (Open Issue #48) - "what if the backend team creates it directly in SAP" scenario worked through (2026-11-02, analysis only)
- Follow-up to #48's still-open question (does Procurement create the PR
  in SAP directly, or does this portal need its own "Create PR" screen).
  User asked what the "backend creates it" scenario would mean for this
  app specifically.
- **Concluded: if true, this app likely needs zero changes.** The existing
  flow (CPE approved → CWIP Create → "Push to SAP," which already creates
  the Internal Order/CWIP/PO) doesn't need to know a PR exists if SAP's own
  internal process handles creating it as an invisible prerequisite behind
  that same backend call.
- **One thing that would still need checking, not assumed:** whether the
  existing `CreateCWIP` function import still works unmodified once a PR
  is required first on the backend's side, or whether it would need a PR
  id passed into it from this app (which would mean the PR has to exist or
  be looked up before that point, not fully invisible after all).
- **One optional, not-required addition:** if anyone wants the PR number
  visible somewhere in this portal (CPE Detail/PO Detail) for traceability,
  that's a small read-only field addition, independent of whether PR
  creation itself needs any portal changes.
- Recommended one direct question for the backend team: does their side
  need anything from this app (e.g. a PR number) to create the PR, or is
  it fully self-contained on their end. Not yet answered. No code touched.

### 63. "What is Single Vendor CPE, how is it handled?" - clarified the already-built mechanism from Open Issue #51 (2026-11-02, explanation only)
- User was confused about how "single-vendor" vs "multi-vendor" CPE is
  distinguished in the Document Attachment Matrix already built. Clarified:
  there is no separate toggle or flag anywhere - it's inferred purely from
  how many rows exist in the Vendor Comparison table at the time, via the
  same `_buildEmptyAttachments`/`_syncAttachmentSlots` logic from #51
  (`Math.min(Math.max(vendors.length, 1), 3)`). 1 vendor entered → 1 RFQ +
  1 Quotation slot shown (matches the document's "Single Vendor" matrix
  exactly); 2 or 3+ vendors → 2 or 3 slots (matches the "multi-vendor"
  matrix, capped at 3). TCC/Negotiation History/Justification Note/General
  are identical either way per the document, and were already built that
  way (always exactly one each, General open-ended) - no change needed, no
  code touched, explanation only.

### 64. "Backend says send documents to DocumentSet, but I can't see where we're sending that" - confirmed nothing is sent anywhere today, by design (2026-11-02, analysis only)
- Checked `CPECreate.controller.js` directly rather than relying on memory:
  the word "attachments" appears only in the local draft-building code
  (slot setup, file-pick capture, add/remove general) - it is never
  referenced in `_buildCpePayload`, the function that actually assembles
  what gets sent on Save/Submit. Confirmed nothing related to attachments
  is included in any real request today - the data stays in the browser
  only, exactly as the (Open Issue #51) warning banner says.
- Re-confirmed why, from `$metadata`: `DocumentSet` and every one of its
  properties are `sap:creatable="false"/sap:updatable="false"`, no field
  exists for the actual file bytes, and no function import exists for
  upload either - so there's genuinely no working path to send a document
  through today, not a frontend oversight.
- User then asked whether to just build the UI to send data and let
  backend "fix it on their end" (backend's own suggestion: "send it and we
  can debug"). **Explained why that premise doesn't quite hold**: the
  `creatable=false` lock is a declared contract-level block, not an
  implementation bug with a specific fixable symptom - sending correctly-
  shaped data doesn't help them debug anything if the framework itself
  never lets the request through to their custom code. No code touched
  this round.

### 65. Live test write to DocumentSet attempted directly, blocked by this session's own safety guardrail - not a backend finding (2026-11-02)
- User asked to confirm empirically (not just from the metadata) whether a
  create to `DocumentSet` would actually work, and gave the go-ahead to
  test it directly. Fetched a live CSRF token successfully, but the actual
  test POST was blocked by this coding session's own "no writes to shared
  resources" safety classifier - not something that can or should be
  bypassed. No backend information gained from this attempt; recorded so a
  future session doesn't re-attempt the same blocked path.
- Pivoted instead to building the real integration into the app itself
  (next entry) so the user could test it live in their own browser, which
  isn't subject to the same restriction.

### 66. Real `DocumentSet` create attempt wired into actual CPE submission, per the backend team's own request to "send it so we can debug" (added, 2026-11-02)
- Since a live test from this session was blocked (Open Issue #65), built
  the real attempt into the app instead, so the user could test it
  themselves and get the backend's own real response.
- **`CPECreate.controller.js`:** new `_uploadAttachments(sCpeId)` - after a
  CPE is actually created, attempts a genuine `createEntity("/DocumentSet",
  ...)` for every filled attachment slot, using the real fields the entity
  exposes (`Doctype`/`Docid`/`Docseq`/`Filename`/`Category`/`Mimetype`/
  `Filesize`). Each attempt is caught individually and this never rejects,
  so a document-save failure (expected, per Open Issue #51/#64) can never
  block or fail the CPE submission itself - only `SubmitCPE` failing does.
  Wired to run alongside `SubmitCPE` (`Promise.all`, not chained after) in
  `onSubmit`. New `_formatDocResults` appends a plain-language summary to
  the submit success message, showing the real backend error per failed
  document so it's visible without opening devtools - the whole point of
  attempting this was to capture that error to report back.
- Also started capturing each file's MIME type (`oFile.type`), not just
  name/size, so the test payload is as complete as possible.
- Updated the attachment matrix's warning banner (`i18n.properties`) to
  accurately describe the new behavior - an attempt is now genuinely made
  on Submit, expected to fail today, failure shown after submission.
- Verified: `node -c`/XML checks pass; replayed the slot-flattening logic
  in Node to confirm only filled slots are attempted. `dist/` rebuilt. This
  is real integration code, not a mockup - confirmed working as intended
  once the user tested it live (see next entry for the result).

### 67. Real backend error received and analysed: `DOCUMENTSET_CREATE_ENTITY` is an unimplemented stub, not a hard metadata-level block (2026-11-02)
- User tested the Open Issue #66 build live and got back:
  `/IWBEP/CX_MGW_NOT_IMPL_EXC` - "Method 'DOCUMENTSET_CREATE_ENTITY' not
  implemented in data provider class."
- **Confirms the end conclusion from Open Issue #51/#64 (DocumentSet create
  doesn't work) but corrects the assumed mechanism.** The request actually
  reached the backend's generated data provider class and looked for the
  standard `<ENTITYSET>_CREATE_ENTITY` method SAP Gateway generates for
  every entity set - found it present only as the default auto-generated
  stub that raises "not implemented," never actually coded. The
  `sap:creatable="false"` metadata flag did **not** block the request at
  the framework level the way originally assumed - it reached all the way
  to the unimplemented method. Noted as a correction for accuracy, same
  end result either way.
- **Precise, actionable ask handed to the user for the backend team:**
  implement `DOCUMENTSET_CREATE_ENTITY` in the DPC_EXT class for
  `ZCAPEX_PORTAL_SRV`, accepting the fields already being sent
  (`Doctype`/`Docid`/`Docseq`/`Filename`/`Category`/`Mimetype`/`Filesize`).
  **Flagged this alone is still not sufficient** - `DocumentSet` has no
  field anywhere for the actual file content, so even once implemented,
  only metadata would save, not the real file bytes - the other half of
  the original Open Issue #51 ask.

### 68. Document Attachment Matrix UI cleanup - fixed a duplicate-filename display bug, added visual structure (fixed, 2026-11-02)
- User reported the screen was confusing - a file's name was showing
  twice per slot, and there was no clear grouping between RFQ/Quotation/
  TCC/etc.
- **Confirmed duplicate display bug:** each slot had both the
  `FileUploader`'s own native filename display and a separately-added
  `Text` showing the same `fileName` - genuinely showing the name twice.
  Fixed by only showing the separate `Text` (as "Selected: <name>") when a
  file is actually picked, instead of always rendering alongside the
  uploader's own (often-empty) native state.
- **Added missing structure:** section headers for "RFQ"/"Quotation" (were
  previously unlabeled as a group); every slot now renders as its own
  bordered card (new `.zcpxAttachRow`/`.zcpxAttachLabel` CSS, added to
  `style.css`) instead of a single long wrapping row of controls; each
  card now stacks label → uploader+status → note vertically instead of
  cramming everything into one horizontal line.
- Verified: XML well-formed, `dist/` rebuilt and confirmed to contain the
  new styling. Not yet viewed in an actual browser.

### 69. RFQ/Quotation slots laid out side by side on wider screens (added, 2026-11-02)
- User asked whether the (now-cleaner, per Open Issue #68) RFQ 1/2/3 cards
  could sit next to each other instead of stacking, and how that would be
  done, before building anything.
- Checked for an existing precedent in this codebase first (`l:Grid`
  bound-content pattern) rather than guessing - found no actual working
  example of binding `Grid`'s `content` aggregation to repeating data
  anywhere in this app; the one similar-looking case (CPEDetail's vendor
  cards) turned out to just be a `VBox` with no side-by-side CSS behind it
  at all. **Used the pattern that actually is proven throughout this
  codebase instead:** `HBox` with `wrap="Wrap"` and a fixed card width,
  the same technique already used elsewhere in this app for responsive
  button/chip wrapping.
- **Fixed, `CPECreate.view.xml`:** RFQ and Quotation sections changed from
  a stacking `VBox` to a wrapping `HBox` (`width="17rem"` per card) - cards
  sit side by side when there's room and automatically drop to one-per-row
  on a narrow screen, with no separate breakpoint logic needed. Each
  card's internal content (label/uploader/status/note) is unchanged from
  Open Issue #68. The `key`-based row-identity fix from Open Issue #46
  carries over unaffected (identical behavior on `HBox` and `VBox`).
- Verified: XML well-formed, `dist/` rebuilt and confirmed to contain the
  new layout. Not yet viewed in an actual browser.

### 70. KPI-tile navigation extended to 4 other screens, after establishing the jump-vs-filter rule (added, 2026-11-02)
- Follow-up to Open Issue #42 (Dashboard KPI tiles made clickable). User
  asked whether other screens with the same KPI-tile styling could get
  similar treatment.
- **Audited every screen using the `zcpxKpi` style** (8 total) rather than
  guessing: Approval Inbox, Capitalization, Approval Detail and Budget
  Detail each had tiles summarizing either a list on the same screen or a
  different document's data elsewhere - genuine candidates. DOA Matrix,
  Budget Approval Detail, IC Detail and Unit Quota's tiles are plain
  config/metadata values with no list behind them - correctly left alone.
- **Established the standard rule before building anything, per the
  user's own request:** if the tile summarizes data that lives on a
  *different* screen, clicking it should **navigate there** (the Dashboard
  pattern); if the tile summarizes data that's already shown directly
  below it on the *same* screen, clicking it should **filter that list in
  place**, not navigate away (navigating to the same page you're already
  on makes no sense).
- **Built, following that rule exactly:**
  - **Approval Detail** (jump) - all 4 Budget Position tiles now navigate
    to that CPE's own Budget Detail page, reusing the existing
    `onBudgetPress` handler already wired to the header's budget-id link -
    no new navigation logic needed, just wired the tiles to it.
  - **Budget Detail** (jump) - "Committed"/"Spent" tiles (whose footers
    already read "Open POs"/"Posted GRNs") now navigate to PO List/GRN
    List. Lands on the full list, not filtered to this budget - neither
    screen has a budget filter today, flagged rather than silently
    expanded. "Approved"/"Available" left alone, nothing to point them at.
  - **Approval Inbox** (filter in place) - the 3 SLA tiles now apply the
    screen's own pre-existing `cbSla` filter to the inbox table directly
    below them.
  - **Capitalization** (filter in place) - "Over 45 Days" now filters the
    CWIP ageing table to just the overdue rows, with a dismissible banner
    + Clear link. This one needed a genuinely new filter capability (none
    existed on this screen before) - the other 3 tiles summarize the whole
    list with no subset to filter to, so were correctly left as plain
    display, same as the Dashboard's own non-clickable tiles.
- All new tiles use `attachBrowserEvent` for the click (same reason as
  every other KPI-tile fix this session - `sap.m.VBox` has no `press`
  event of its own).
- Verified: `node -c`/XML checks pass on all 4 touched screens' controllers
  and views; `dist/` rebuilt and confirmed to contain every new handler.
  Not yet clicked through in an actual browser.

---

## Rev3 implementation (CAPEX_Rev3_Frontend_Tasks_for_BAS.md, T1-T11, 2026-11-03)

User added `CAPEX_Rev3_Frontend_Tasks_for_BAS.md` to the project root and
asked for a gap analysis against the current code, then asked to implement
everything missing. Entries #71-#80 below are T1-T10 from that spec,
implemented in order; #81 is the T11 regression pass. `npm run lint` could
not be run in this environment (`eslint.config.mjs` requires
`@sap-ux/eslint-plugin-fiori-tools`, not present in `node_modules` and not
installable here - no network access); `npm run build` was run after every
task instead as the available syntax/compile gate, and passed each time.
No live backend is reachable from this environment either, so none of the
backend-dependent paths below (DocumentSet upload, SetCpeVendorCode,
ReviseCpeAmount, DoaRule.Doctype, QUOTA_YEAR_CAP_<WERKS>) have been
exercised against a real service - every one of them is feature-detected
per the spec's own section 3 (`hasFunctionImport`/`hasEntityProperty`,
added to `BaseController.js`) so the app runs unchanged until the backend
actually exposes them. Per Open Issue #67, `DocumentSet` create is a known
unimplemented stub today - document upload will keep no-op'ing (toast only)
until that changes.

### 71. T1 - BudgetList: screen-local Fiscal Year filter (added, 2026-11-03)
Files: `BudgetList.view.xml`, `BudgetList.controller.js`, `i18n.properties`.
- Added `cbFY` ComboBox (items from `app>/fiscalYears`, "All years" via a
  cleared selection, same convention as `cbPlant`/`cbType`/`cbStatus`),
  defaulting to the header's current `app>/fiscalYear` on init and
  re-syncing on the header's `fiscalYearChanged` event.
- `_applyPlantAuthFilter` now reads `cbFY`'s own selected key instead of
  silently reading `app>/fiscalYear` directly; an empty key (All years)
  skips the fiscal-year filter entirely rather than defaulting to the
  header's year.
- Search field (`sfBudget`, already existed) extended to also match
  `plantName`, not just budget id/title.
- Added i18n key `allYears`.
- Test: open Budget List, change the new FY combo independently of the
  header selector, confirm the list and count update; select "All years"
  and confirm every fiscal year shows; Clear restores the header's year.
- Limitation: not run against live data in a browser (see header note).

### 72. T2 - Document service layer (added, 2026-11-03)
Files: `Component.js`, `BaseController.js`.
- `BaseController.hasFunctionImport(sName, aParams)` /
  `hasEntityProperty(sEntityType, sProp)`: walk the **live** `odataModel`'s
  `getServiceMetadata()` (never the stale local `webapp/localService/
  metadata.xml`, confirmed to have zero `FunctionImport` entries at all).
  Return `false` in mock mode or before `$metadata` has loaded - never throw.
- `Component.mapDocumentEntity(oRaw, sServiceUrl)` and
  `Component.loadDocuments(sDocType, sDocId)`: reads `/CPESet('id')/
  CPEToDocuments`, or `/BudgetSet('id')/BudgetToDocuments` only when
  `_hasNavigationProperty("Budget","BudgetToDocuments")` confirms it exists
  live; resolves `null` in mock mode/on error (caller keeps what it had),
  `[]` when Budget's nav property isn't live yet.
- `BaseController.uploadDocument(oFile, mMeta)`: `refreshSecurityToken`
  (async) then `jQuery.ajax` POST to `.../DocumentSet` with the
  `slug: DocType|DocId|Category|FileName|Title|Note` header (each part
  `encodeURIComponent`-ed), `x-csrf-token` from `oModel.getHeaders()`.
  Resolves `null` in mock mode.
- `BaseController.validateFile(oFile)`: checks `config>/docMaxMb` (default
  10) and `config>/docExtensions` (default the documented list).
- `Component._loadLiveQuotaCaps` (existing ConfigSet reader) extended to
  also map `DOC_MAX_MB`/`DOC_EXTENSIONS` into `config>/docMaxMb` /
  `/docExtensions`, same "only if the backend has the row" guard as
  `QUOTA_YEAR_CAP`.
- Limitation: `DOC_MAX_MB`/`DOC_EXTENSIONS`/`BudgetToDocuments` key/property
  names are **not confirmed with the backend team** - same caveat already
  on `_loadLiveSlaConfig`/`_loadLiveQuotaCaps` for their own keys.

### 73. T3 - CPECreate: attachments rework (fixed/added, 2026-11-03)
Files: `CPECreate.controller.js`, `CPECreate.view.xml`, `i18n.properties`.
- Removed the `attachmentMatrixHint` MessageStrip and i18n key (was warning
  that uploads were expected to fail - no longer true now that an upload
  path actually exists); replaced with a MessageStrip bound to
  `app>/docUploadEnabled` showing `backendNotReady` only when the feature
  flag (`BaseController.isDocUploadEnabled`) is off.
  `attachmentMatrix` (card title) kept - still used.
- Every attachment slot's `FileUploader` now has `fileType`/
  `maximumFileSize` bound to `config>/docExtensions`/`docMaxMb`
  (via a new shared `formatFileTypes` formatter) and
  `typeMissmatch`/`fileSizeExceed` wired to new shared `BaseController`
  toasts (`onAttachmentTypeMismatch`/`onAttachmentFileSizeExceed`). Added a
  Title input (new `title` field on every slot) alongside the existing Note
  input. `onAttachmentFileChange`/`_setAttachmentFile` now also run
  `validateFile` client-side and keep the raw `File` object on the slot
  (new non-bound `_file` property) so it can actually be uploaded later -
  previously only the file's name/size/type strings were kept.
- `_validateAttachments()` (new): requires an RFQ+Quotation file for every
  vendor slot present, plus TCC/Negotiation/Justification; merged into the
  existing `_validate()` (which is itself only ever called from `onSubmit`,
  so this is Submit-only, never Save Draft, as required).
- `_uploadAttachments(sCpeId)` rewritten: sequential `next(i)` chain over
  `BaseController.uploadDocument` (was `Promise.all` over `createEntity("/
  DocumentSet")`, the Open-Issue-#66/#67 debug probe); rejects with
  `Error.failedUpload = <slot label>` on the first failure instead of
  resolving a mixed ok/fail array. General slots all send category `"GEN"`
  (flat, per the backend's category list) rather than their own `GEN1`/
  `GEN2`/... UI-only id.
  `_formatDocResults` (dead now) removed.
- `onSubmit`: order is now `createEntity` → (if `isDocUploadEnabled()`)
  `_uploadAttachments` → `SubmitCPE`, strictly sequential (was
  `Promise.all([SubmitCPE, _uploadAttachments])`). An upload failure now
  skips `SubmitCPE` entirely and the CPE stays `DRAFT`, matching the spec;
  previously a document failure could never block submission.
- `onSaveDraft`: also attempts the same upload chain after creating the
  CPE (drafts keep whatever was already picked), but a failure only toasts
  - it never blocks the draft save itself.
- Test: with a mock/no-live-backend, nothing changes visibly (flag is off,
  toast shown, old flow preserved). Live-backend behavior unverified (no
  backend reachable here).

### 74. T4 - CPEDetail: real documents tab (fixed/added, 2026-11-03)
Files: `CPEDetail.controller.js`, `CPEDetail.view.xml`.
- `_onMatched` now calls the new `_loadDocuments(sId)` (via
  `Component.loadDocuments("CPE", sId)`); on a real array, overwrites
  `/documents` and `/docCount` - leaves the CPESet-mapped empty array alone
  otherwise (same "never pretend" convention as the rest of `Component.js`).
- Documents table rewritten to the real `mapDocumentEntity` field shape
  (title/fileName, categoryText/category, note, sizeText,
  uploadedByName/uploadedBy, uploadedOn) - was bound to a `name`/`type`/
  `size` shape nothing ever actually produced.
- `onDownload(oEvent)`: reads the row's own `url` and `window.open(url,
  "_blank")` (browser sends session cookies) - was a toast.
- `onUpload`: opens a new `UploadDocument` fragment/dialog (Category
  Select covering all 11 backend categories incl. `AMT_REV`, Title, Note,
  FileUploader) via `BaseController.uploadDocument`, then reloads
  documents. Upload button only `visible` for DRAFT/BLOCKED/
  UNDER_EVALUA(TION) status (new `formatCanUpload`, `indexOf`-matches the
  12-char-truncated form) and only when `isDocUploadEnabled()`.
- Test (once live): open a DRAFT CPE, Upload button visible; open an
  APPROVED one, hidden. Not run against a live backend here.

### 75. T5 - ApprovalDetail: real document download (fixed, 2026-11-03)
Files: `ApprovalDetail.controller.js`, `ApprovalDetail.view.xml`.
- `_onMatched` now calls `_loadDocuments(sId)` the same way as CPEDetail
  (T4); approvers get no upload action anywhere on this screen (correct -
  read-only by design).
- Documents list now shows title/fileName + category + size (was a
  `name`/`type`/`size` shape nothing produced); `onDownload` does the same
  real `window.open(url)` as CPEDetail instead of a toast.
- Note: `BudgetApprovalDetail.controller.js`/`.view.xml` (a separate,
  already-existing screen for Budget approvals) has no documents section
  at all and was left untouched - out of this task's stated scope
  (`ApprovalDetail.controller.js` only).

### 76. T6 - CPE actual vendor code post-approval (added, 2026-11-03)
Files: `Component.js`, `CPEDetail.controller.js`, `CPEDetail.view.xml`,
`CWIPCreate.controller.js`, `CWIPCreate.view.xml`.
- `mapVendorEntity` now maps `Lifnr` → `lifnr`. `mapCpeEntity` adds
  `vendorCode`/`vendorCodeLocked` (both blank/false until the backend's CPE
  entity type actually carries them - confirmed via `$metadata` it does
  not yet, same finding as Open Issue #47).
- CPEDetail: new "Actual Vendor Code" card (Input, 10-char maxLength, +
  Save button), visible only when status is APPROVED/CAPITALIZED/COMPLETED,
  the user is admin (`app>/user/isAdmin`), and
  `hasFunctionImport("SetCpeVendorCode", ["CpeId","Lifnr"])` is true.
  `onSaveVendorCode` calls the function import, then reloads the CPE list.
- CWIPCreate: `_onMatched` now sets `detail>/vendorCodeBlocked` when
  `hasEntityProperty("CPE","Lifnr")` is true (backend has the field) **and**
  this CPE's `vendorCode` is still blank - guard only fires once the
  backend actually supports the field, never today. Blocks "Push to SAP"
  (disabled + error MessageStrip + guarded in `onPushToSap` itself).
- Limitation: entirely inert today since `CPE.Lifnr`/`SetCpeVendorCode`
  aren't live yet (Open Issue #47/#53) - verified only by code review.

### 77. T7 - CWIP: editable asset description (added, 2026-11-03)
Files: `CWIPCreate.controller.js`, `CWIPCreate.view.xml`.
- New `assetDesc` Input (maxLength 50) next to the Asset Class ComboBox,
  pre-filled from the selected asset class's own picklist text
  (`_assetClassText`) on load and again on `onAssetClassChange` - stays
  freely editable after that, same "convenience default, not a lock" as
  `_suggestAssetClass`.
  `CreateCWIP`'s params now include `AssetDesc` only when
  `hasFunctionImport("CreateCWIP", ["AssetDesc"])` confirms the live
  function import actually declares it; otherwise sent exactly as before.
- Per Open Issue #50/#54 this requirement's shape was still described as
  "pending a go/no-go" from the user - built anyway per this session's
  explicit "implement everything missing" instruction, feature-detected so
  it's a no-op until the backend adds the parameter.

### 78. T8 - Admin: revise CPE amount with supporting document (added, 2026-11-03)
Files: `CPEDetail.controller.js`, `CPEDetail.view.xml`, new
`ReviseAmount.fragment.xml`.
- New "Revise Amount" footer button, visible only for admin and only when
  `hasFunctionImport("ReviseCpeAmount", ["CpeId","NewAmount","Reason"])`.
- Dialog: New Amount (`StepInput`), Reason (required `TextArea`),
  supporting document (required `FileUploader`, category `AMT_REV`).
  `onConfirmReviseAmount` uploads the document first, then calls
  `ReviseCpeAmount` only once that succeeds (never the reverse); reloads
  the CPE list and the Documents tab afterward. The revision document
  appears in the Documents tab under whatever `CategoryText` the backend
  returns for `AMT_REV` (categoryText/category fallback already built in
  T4) - no separate display logic needed.
- Same backend-blocker class as T6 (Open Issue #55) - inert until
  `ReviseCpeAmount` is live.

### 79. T9 - DOA routing by document type (added, 2026-11-03)
Files: `Component.js`, `BaseController.js`, `DOAMatrix.controller.js`,
`DOAMatrix.view.xml`, `BudgetDetail.controller.js`,
`BudgetCreate.controller.js`, `Evaluation.controller.js`,
`CPECreate.controller.js`.
- `mapDoaRuleEntity` adds `docType` (`oRaw.Doctype || ""`) and `active`
  (defaults `true` when absent). Confirmed via `$metadata` the live
  `DoaRule` entity type has `Active` already but **not yet** `Doctype` -
  so this is inert (every rule reads as generic/`docType: ""`) until the
  backend adds that column.
- `resolveDOA(sCapexType, nAmount, sDocType)`: now filters on
  `active !== false` and `(!r.docType || r.docType === sDocType)`; an
  exact-docType match sorts before a generic (`""`) rule covering the same
  range. All 5 callers updated to pass `"CPE"` (CPECreate, Evaluation) or
  `"BUD"` (BudgetDetail, both BudgetCreate call sites).
- DOAMatrix: new Document Type `Select` in the simulator (passed into
  `resolveDOA`) and a filterable "Document Type" column on the matrix
  table (`onMatrixFilter`, new `formatDocType`). The chain display already
  used `HBox wrap="Wrap"` (Open Issue #69's pattern) so 7-8 steps already
  don't truncate - no change needed there.
- Per Open Issue #61, whether this is even needed is still unconfirmed
  (CPE/Budget chains look identical in practice today) - built per this
  session's "implement everything missing" instruction; harmless no-op
  until the backend adds `DoaRule.Doctype`.

### 80. T10 - Unit quota per plant (added, 2026-11-03)
Files: `Component.js`, `BaseController.js`, `UnitQuota.controller.js`,
`UnitQuota.view.xml`.
- `Component._loadLiveQuotaCaps` now also collects every
  `QUOTA_YEAR_CAP_<WERKS>` ConfigSet row into `config>/quota/plantCaps`
  (`{WERKS: amount}`).
- `rollupQuotaByUnit` takes that map and uses a plant's own cap (if
  present) instead of the flat default when computing its `remaining`.
- `BaseController.checkQuota(nUsedThisFY, nRequest, sPlant)`: new `sPlant`
  param, uses `plantCaps[sPlant]` when defined else the default yearCap;
  single-item cap stays global (never plant-specific, per spec). Both
  `UnitQuota.controller.js` call sites updated to pass the plant.
- `UnitQuota.controller.js` formatters (`formatUsedOf`/`formatQuotaPct`/
  `formatQuotaState`) now derive each row's own cap as `used + remaining`
  (already plant-correct from the rollup above) instead of reading the
  flat default - no hardcoded numbers anywhere in the per-unit list.
- Limitation: Pacharia's documented ₹5L exception (vs. ₹2L elsewhere, Open
  Issue #61) still shows as flat ₹2L until the backend actually adds a
  `QUOTA_YEAR_CAP_<Pacharia's WERKS>` ConfigSet row - the plumbing is in
  place, just nothing to read yet.

### 81. T11 - Regression pass (2026-11-03)
- `npm run lint`: **could not run** - `eslint.config.mjs` requires
  `@sap-ux/eslint-plugin-fiori-tools`, absent from `node_modules`, no
  network access in this environment to install it. Flagging for whoever
  has a working lint setup to run before merging.
- `npm run build`: run after every task above (#71-#80), passed every
  time; run once more at the end, still passes.
- Every touched `.view.xml`/`.fragment.xml` file re-checked for
  well-formedness (`xml.dom.minidom.parse`) - all pass.
- Cross-checked every i18n key referenced from any touched view/controller
  against `i18n.properties` - no missing keys.
- `_bUseMock` confirmed still `false` in `Component.js` (never toggled
  during this work).
- Section 6's test checklist (items 1-13) was **not walked through in an
  actual running browser** - this environment has no live backend (the
  real `ZCAPEX_PORTAL_SRV` service isn't reachable here) and no headless
  browser/Playwright tooling available to drive a mock-mode run either.
  Everything above was verified by static review + build/XML checks only.
  Recommend an actual click-through pass in BAS (or `npm run start-local`
  against a real session) before this ships, especially: T3's
  submit-order change (#73), and T4/T5's document list rendering once
  real `CPEToDocuments` rows exist.

### 82. PR creation status re-confirmed; Rev3 (T1-T10) frontend-vs-backend readiness summarised (analysis only, 2026-11-03)
- User asked whether "PR" (Purchase Requisition) exists anywhere in this
  app's UI. Re-checked Open Issues #48/#62 and re-ran a grep across
  `webapp/` for any PR-related entity/screen/field
  (`purchase.req|PurchReq|PRSet|Banfn|CreatePR|"PR"`) - **zero matches**.
  Confirmed again: no PR screen, entity, or field exists anywhere in this
  app today. Whether one is ever needed is still the same open,
  unanswered question from #48/#62 (does SAP create the PR invisibly on
  its own side, or does this portal need a new screen for it) - nothing
  new decided, no code touched.
- Summarised overall Rev3 readiness for the user:
  - **T1-T10 are frontend-code-complete** (`npm run build` passed after
    each task, per #71-80) but **not live-verified** - `npm run lint`
    still can't run (missing `@sap-ux/eslint-plugin-fiori-tools`, no
    network here to install it) and the section 6 test checklist was
    never walked through against a real backend (per #81).
  - **Feature-detected and wired, waiting only on backend work** to
    light up, no frontend changes expected to be needed: T2/T3 document
    upload (blocked specifically by the `DocumentSet` create still being
    an unimplemented stub per #67, not just "not yet wired"), T6 vendor
    code (needs `CPE.Lifnr` + `SetCpeVendorCode`), T8 revise amount
    (needs `ReviseCpeAmount`), T9 DOA by document type (needs
    `DoaRule.Doctype`), T10 per-plant quota (needs
    `QUOTA_YEAR_CAP_<WERKS>` ConfigSet rows), T7 CWIP asset description
    (needs `CreateCWIP` to accept `AssetDesc`).
  - **Explicitly NOT a simple "backend only" gap:** (1) PR creation
    (#48/#62) - scope itself is undecided, may or may not need a new
    frontend screen; (2) the expanded 7-8 step approval chain (#49) -
    needs new `DoaRuleSet` rows **and** real people/SAP accounts
    assigned to new intermediate roles, which is org/master-data setup
    on top of any backend code change, not a pure dev task.

### 83. Live CPE submit confirmed `DocumentSet` upload never fires - `isDocUploadEnabled()` fixed to stop depending on a property the backend no longer uses (fixed, 2026-11-04)
Files: `BaseController.js`.
- User live-tested a real CPE submit with an attached file (`CPE-2026-0061`)
  and sent the Network tab trace: `CPESet` (create) -> `SubmitCPE` ->
  `CPESet?$expand=CPEToVendors` (reload) - **no `DocumentSet` POST anywhere**
  in the sequence. Backend team also confirmed a breakpoint placed directly
  in `CREATE_STREAM`/`GET_STREAM` (shared via the uploaded
  `ZCL_ZCAPEX_PORTAL_DPC_EXT` class source) never triggers - consistent with
  the request never being sent at all, not a backend routing problem.
- Root cause: `isDocUploadEnabled()` (added in #72/T2) only returned `true`
  when `hasEntityProperty("Document", "Content")` or `config>/docMaxMb` was
  set. The shared backend class's own `GET_STREAM` comment ("Rows written
  before Revision 3 still carry the binary in CONTENT") confirms Revision 3
  moved storage off that DB field entirely (to `filepath` on disk) - so the
  live `Document` entity type may no longer expose `Content` as a queryable
  property at all, and `ConfigSet` has no confirmed `DOC_MAX_MB` row yet
  either (same unconfirmed-key caveat as #72). Both signals false -> flag
  permanently `false` -> `_uploadAttachments()` silently skipped on every
  submit, with the CPE itself still submitting successfully - exactly
  matching what the user's trace showed.
- Fixed: added `BaseController.isEntitySetCreatable(sEntitySet)`, reading the
  live `sap:creatable` extension directly off the `DocumentSet` entity set in
  `$metadata` - the one signal that's actually authoritative for "will a
  POST be accepted" (defaults to `true` when the attribute is absent, per
  OData v2's own default; `false` when the entity set isn't found or
  `$metadata` hasn't loaded, same as every other feature-detect helper here).
  `isDocUploadEnabled()` now also OR's this in, so it stops depending solely
  on the `Content` property or on the backend remembering to add the
  `ConfigSet` row - either one undoes the block on its own now.
- Not a backend fix: this doesn't make a live upload succeed if `DocumentSet`
  itself isn't actually marked creatable/stream-capable in live `$metadata` -
  it only stops the frontend from giving up before trying. Backend team
  should still confirm/add `DOC_MAX_MB` to `ConfigSet` (asked of them this
  session) and confirm `DocumentSet`'s live `$metadata` actually carries
  `sap:creatable="true"` / `m:HasStream="true"` on `Document` - if neither is
  true, the next submit will now at least attempt the `DocumentSet` POST and
  surface a real HTTP status/error instead of silently skipping it.
- Verified: `node -c` passes, `npm run build` passes. Not live-tested (no
  backend reachable from this environment) - user should retry a CPE submit
  with an attachment and re-check the Network tab for a `DocumentSet` entry.

### 84. Document upload confirmed working live after #83; download then failed with "Malformed URI literal syntax" - unquoted Docseq key, a real frontend bug (fixed, 2026-11-04)
Files: `Component.js`.
- User confirmed `DOC_MAX_MB` was already present in the live `ConfigSet`,
  retested a CPE submit with an attachment after #83's fix, and this time
  the upload went through end-to-end - the user reports "document and
  everything is working fine" on upload.
- Download then failed immediately with a live OData error
  (`005056A509B11EE1B9A8DBD9EA7BB778` / "Malformed URI literal syntax",
  transactionid `13FF3477C68D0100E006ADB8CCB5F477`).
- Root cause, confirmed as a genuine frontend bug: `mapDocumentEntity`
  (`Component.js`) built the download URL's key predicate as
  `Docseq=" + oRaw.Docseq` - a bare, unquoted literal, which is only valid
  OData V2 syntax for a numeric key type. But `Docseq` is `Edm.String`
  (MaxLength 4, a classic ABAP NUMC counter field, confirmed from the
  service's own metadata) - a **string**-typed key must be quoted
  (`Docseq='0001'`), never bare. "Malformed URI literal syntax" is exactly
  the generic OData parser error for this class of key-type mismatch, and
  it's thrown by the framework before the request reaches `GET_STREAM` at
  all - consistent with it being a URL-construction bug, not a backend
  logic bug.
- Fixed: quoted `Docseq` the same way `Doctype`/`Docid` already were
  (`Docseq='" + encodeURIComponent(oRaw.Docseq) + "'`), single source of
  truth (grepped - no other file builds a `DocumentSet` download URL).
- Verified: `node -c` passes, `npm run build` passes. Not live-tested here -
  user should retry Download on an already-uploaded document and confirm
  the file actually opens.

### 85. IC commissioning photos wired to the real DocumentSet upload/download - the stale "backend has no endpoint" assumption from Open Issue #24 is gone now that #83/#84 proved the mechanism live (added, 2026-11-04)
Files: `Component.js`, `ICDetail.controller.js`, `ICDetail.view.xml`.
- Followed up on the readiness question raised this session: is IC's
  commissioning-photo upload actually possible now? Re-checked the shared
  `ZCL_ZCAPEX_PORTAL_DPC_EXT` source directly - `CREATE_STREAM` explicitly
  allows `doctype = 'IC'` with `status = 'PENDING'`, and `GET_STREAM` is
  fully generic (no doctype restriction at all), so both upload and
  download are backend-ready for IC with zero backend changes needed.
- One real gap found in the same class: `DOCUMENTSET_GET_ENTITYSET`'s
  navigation-key loop only recognises `CpeId`/`BudgetId` - there's no
  `IcId` case, so reading documents via a hypothetical
  `/InstallCertSet('id')/InstallCertToPhotos` nav property would silently
  return nothing. The same method's generic `$filter=Doctype eq '...' and
  Docid eq '...'` fallback (step 2 in the method) has no such restriction
  though, so that's the path used instead.
- `Component.loadDocuments(sDocType, sDocId)`: extended beyond the
  CPE/BUD-only branches from #72 (T2) - any other doctype (IC today) now
  reads the flat `/DocumentSet` entity set directly with that `$filter`,
  instead of assuming a nav property exists.
- `ICDetail.controller.js`:
  - `_loadExisting` now also calls a new `_loadDocuments(sId)`, which
    overlays real `DocumentSet` rows (matched by category `PHOTO1`/`PHOTO2`/
    `PHOTO3` back to each slot's index) onto `/photoSlots` - `uploaded`,
    `name`, and a new `url` field used for download. A session where the
    file was only ever picked locally (new/unsaved IC) has no `url` and no
    download link, correctly.
  - New `_uploadPhotos(sIcId)`: same sequential `next(i)` chain pattern as
    CPECreate's `_uploadAttachments`, uploading only slots with a
    freshly-picked file (`this._photoFiles[i]`) - an already-saved photo
    from a prior session is left alone. Categories are `PHOTO1`/`PHOTO2`/
    `PHOTO3`, deliberately not `GEN*` - per `CREATE_STREAM`'s own "one file
    per fixed slot" rule, a non-`GEN*`/non-`AMT_REV` category replaces the
    old row instead of accumulating duplicates, which is what a fixed photo
    slot needs.
  - `onSave`: after a successful `InstallCertSet` create/update (needs the
    confirmed `Icid`, so upload only ever happens after that, never before -
    same ordering CPE uses), calls `_uploadPhotos` when
    `isDocUploadEnabled()` is true. A photo-upload failure doesn't block or
    undo the IC save (there's no draft/resubmit concept to fall back to for
    IC) - it's surfaced as a named error ("Reopen `<icId>` to retry that
    photo") and the rest of the save flow (audit entry, list reload, toast,
    navigation) still completes.
  - `onDownloadPhoto` (new): `window.open` on the slot's real `url`, same
    pattern as `CPEDetail`/`ApprovalDetail`.
  - Removed the stale claim in `onPhotoFileChange`'s toast/doc-comment that
    "the backend has no document upload endpoint yet" (Open Issue #24,
    written before #83/#84 proved the mechanism works) - now says the photo
    will be uploaded on Save when `isDocUploadEnabled()` is true, same
    honest fallback message as before when it isn't.
- `ICDetail.view.xml`: added a `Link` (reusing the existing `docDownload`
  i18n key from T4/T5) next to each photo tile's filename, visible only
  when that slot's `url` is set.
- Verified: `node -c` passes on both JS files, the view XML parses
  (`xml.dom.minidom`), `npm run build` passes. Not live-tested here (no
  backend reachable from this environment) - user should create/open an IC,
  attach all three photos, Save, then reopen it and confirm all three show
  as uploaded with working Download links.

### 86. CPE Create: old attachment filenames still visually showing after submitting and starting a new CPE - confirmed cosmetic-only, FileUploader controls weren't being cleared (fixed, 2026-11-04)
Files: `CPECreate.controller.js`.
- User reported that after submitting a CPE with documents attached, opening
  CPE Create again for a new CPE still showed the previous document's
  filename sitting in the attachment slots.
- Checked whether this could mean a stale file actually gets re-sent to a
  new CPE (a real data bug) - it can't. `_resetDraft` (called on every
  `cpeCreate` route match) already rebuilds `/draft/attachments` from
  `_buildEmptyAttachments`, which returns fresh slot objects with
  `fileName: ""` and no `_file` property at all. `_uploadAttachments` only
  ever sends a slot where `slot._file` is set from a file picked *this*
  session (`onAttachmentFileChange`/`_setAttachmentFile`) - a reset slot has
  none, so a stale display can never cause a duplicate/wrong upload.
- Root cause, confirmed as the actual (cosmetic) bug:
  `sap.ui.unified.FileUploader` keeps its own internally-remembered chosen
  filename independent of any model binding - nothing in the view binds its
  `value`, only the separate "Selected: ..." hint `Text` is bound to
  `cpe>fileName` (which does correctly clear). So resetting the model data
  left the FileUploader controls themselves still visually displaying
  whatever was last picked into them, misleading the user into thinking a
  document was already attached to a brand-new CPE.
- Fixed: new `_clearAttachmentFileUploaders()`, called at the end of
  `_resetDraft`. RFQ/Quotation/General slots are all variable-length
  aggregations (no fixed control ids to `byId()`), so it sweeps the whole
  view with `findAggregatedObjects(true, ...)` for every
  `sap.ui.unified.FileUploader` instance and calls its own `.clear()` -
  works regardless of how many slots currently exist, and only touches
  controls that still exist post-reset (any slot the vendor-count shrink
  actually destroys needs no clearing - its DOM is already gone).
- Verified: `node -c` passes, `npm run build` passes. Not live-tested here -
  user should submit a CPE with an attachment, reopen CPE Create, and
  confirm every attachment slot shows empty/no filename.

### 87. CPEDetail Attachments tab: File column widened, Title/fileName duplication with Category removed (fixed, 2026-11-05)
Files: `webapp/view/CPEDetail.view.xml`.
- User shared a screenshot (`Attachment Changes.png`) of the Attachments tab
  showing the `File` column visually cramped, and separately noticed the
  column's top line (document `title`, e.g. "RFQ 1"/"Quotation 1"/"Techno
  Commercial Comparative") duplicated what the `Category` column already
  shows (`RFQ1`/`QUOTE1`/`TCC`) - confirmed real: `CPECreate.controller.js`'s
  `_buildCpePayload` sets `title: o.slot.title || o.label`, so any slot where
  the user left the optional Title input blank gets the slot's own label as
  its title, which is exactly the same information as `Category` in
  different words. All 5 rows in the screenshot hit this fallback case.
- First fix: gave the `File` column an explicit `width="18rem"` (was
  unset, so it only got the auto-layout algorithm's leftover space after
  `Size`/`Uploaded`/`Note`'s widths were taken, most of which is usually
  near-empty since `Note` is "-" on most rows). Matches this app's existing
  convention of `rem`-based fixed column widths (`cpeId`/`budgetId`/
  `grnNumber`/etc. columns), not `%`, so it degrades the same way under the
  table's existing `demandPopin` responsive behaviour.
- Second fix, after discussing trade-offs with the user: considered (a)
  always hide the title line, (b) only hide it when it matches the category
  text (kept the custom-title case but produced inconsistent 1-line/2-line
  row heights - user explicitly rejected this for non-uniformity), (c) drop
  the second line entirely but keep `title` reachable as a hover tooltip on
  the filename instead of a visible row. **Went with (c)**, agreed by the
  user: every row now renders as one uniform line (icon + `fileName` only),
  and `title` - when a user actually bothers to type a custom one instead of
  leaving it blank - is still available on hover (`tooltip="{detail>title}"`
  on the `Text`), rather than being permanently discarded.
- `ColumnListItem` cell changed from `HBox > Icon + VBox(title, fileName)` to
  `HBox > Icon + Text(fileName, tooltip=title)` in
  `webapp/view/CPEDetail.view.xml` (~line 343-348). No controller change
  needed - `detail>title`/`detail>fileName` already existed on the bound
  model from `loadDocuments`/`mapDocumentEntity` (Open Issue #74/T4).
- Verified: XML well-formed, `npm run build` passes (dist rebuilt from
  webapp, no manual dist sync needed since full rebuild was run).
  `npm run lint` still unavailable in this environment (missing
  `@sap-ux/eslint-plugin-fiori-tools`, no network - same known gap as Open
  Issue #82). **Not yet confirmed in an actual browser** - no browser
  automation available this session; user should open a CPE with attachments
  and confirm the File column now shows one line per row with a sensible
  width, and that hovering a filename whose slot had a custom title shows it
  as a tooltip.

### 88. CPEDetail Attachments tab: in-page "View" preview for PDF/image documents, download-only fallback for everything else (added, 2026-11-05)
Files: `webapp/view/CPEDetail.view.xml`, `webapp/controller/CPEDetail.controller.js`,
`webapp/view/fragment/DocumentPreview.fragment.xml` (new), `webapp/i18n/i18n.properties`.
- User asked whether a document could be viewed in a small popup instead of
  always downloading/opening a new tab. Scoped this first: of the app's
  allowed extensions (`pdf,xls,xlsx,doc,docx,jpg,jpeg,png,msg,zip` -
  Open Issue #T2/ConfigSet `DOC_EXTENSIONS`), only PDFs and images can
  actually be rendered by a browser at all; Office formats need either a
  public-internet viewer (not reachable from this on-prem backend, same
  class of problem as Open Issue #14's CDN issue) or a heavy conversion
  library, and `msg`/`zip` have no in-browser rendering path whatsoever.
  Agreed with the user to only build real inline preview for PDF/image and
  leave every other type on the existing Download-only path, rather than a
  half-working "preview everything" attempt.
- **New `DocumentPreview.fragment.xml`:** a `Dialog` (`contentWidth="36rem"
  contentHeight="28rem"`, resizable/draggable) with an empty `VBox` content
  placeholder (`vbPreviewContent`) that the controller fills dynamically,
  a Download button (`beginButton`) and a Close button (`endButton`).
- **`CPEDetail.view.xml`:** added a "View" `Button` (`sap-icon://show`) next
  to the existing Download button in the Attachments row, both now wrapped
  in one `HBox` cell (previously Download was its own cell - needed since
  `sap.m.Table` cells map positionally 1:1 to columns, so two sibling
  buttons would have silently become a 7th cell against 6 columns). Widened
  that action column from `4rem` to `7rem` to fit both icons. View's
  `visible` binds to new `formatCanPreview(detail>mimeType)`.
- **`CPEDetail.controller.js`:** `formatCanPreview(sMimeType)` returns true
  only for `application/pdf` or any `image/*` mime type. `onPreview`
  resolves the row's `url`/`mimeType`/`title` from the `detail` binding
  context, lazily loads the new fragment (same cached-promise pattern as
  `onUpload`'s `_pUploadDialog`/`ReviseAmount`'s `_pReviseDialog`), clears
  `vbPreviewContent`, and injects either a `sap.m.Image` (image mime types)
  or a `sap.ui.core.HTML` control rendering an `<iframe src="...">` (PDF) -
  both pointed at the same live `DocumentSet(...)/$value` URL already used
  for Download, so no new backend call or auth concern (same session
  cookies/proxy). `onDownloadFromPreview` reuses that URL for the dialog's
  Download button; `onClosePreview` closes it. New `sap/m/Image` and
  `sap/ui/core/HTML` AMD dependencies added to the controller's
  `sap.ui.define` list (matching the existing `Fragment`/`JSONModel`
  dependency-injection style in this file, not a global `sap.*` reference).
- Added i18n key `docView=View`.
- Verified: XML well-formed (both view and new fragment), `node -c` passes,
  `npm run build` passes (dist rebuilt from webapp). `npm run lint` still
  unavailable in this environment (same known gap as Open Issue #82/#87).
  **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should open a CPE with a PDF and an image
  attachment and confirm: View button only appears for those two types (not
  for `.xlsx`/`.doc`/etc.), clicking it renders the file inline in the small
  dialog without leaving the page, and Download still works both from the
  row and from inside the preview dialog.

### 89. CPE Create: adding/removing a vendor silently dropped an already-attached RFQ/Quotation file - it still showed as attached but was never uploaded (fixed, 2026-11-05)
Files: `webapp/controller/CPECreate.controller.js`.
- Found during a requested audit for UI bugs/bad UX, not a user report this
  time - static analysis of `_syncAttachmentSlots` (called from
  `onAddVendor`/`onRemoveVendor` to keep RFQ/Quotation slot counts in sync
  with the current vendor count).
- **Root cause:** `_syncAttachmentSlots` rebuilds the RFQ/Quotation slot
  arrays and carries over each slot's displayed `fileName`/`fileSize`/
  `fileType`/`title`/`note` from the old array - but never carried over
  `_file`, the actual `File` object `_uploadAttachments` (line ~301) reads
  to decide what to actually upload (`aFilled = aSlots.filter(function (o) {
  return o.slot._file; })`). So: attach an RFQ to Vendor 1, then click "Add
  Vendor" to bring in a second quote for comparison (the core point of this
  screen) - the slot still visually shows the filename, the "required
  documents" check still passes (it only checks the filename string, not
  `_file`), but the file is quietly dropped and never reaches
  `_uploadAttachments`'s filled list. Nobody would notice until opening the
  approved CPE's Documents tab later and finding the file genuinely isn't
  there.
- **Fixed:** added `oFresh[sCategory][i]._file = aOld[i]._file;` alongside
  the other carried-over fields in `_syncAttachmentSlots`'s copy loop - the
  one line that was missing.
- Confirmed this doesn't fight the existing `key: 'id'` list-binding change
  detection in `CPECreate.view.xml` (RFQ/Quotation `HBox items` bindings) -
  slot ids (`RFQ1`/`QUOTE1`/etc.) stay stable across the rebuild regardless
  of vendor count, so the same `FileUploader` control instances are reused,
  consistent with the rest of this fix.
- Not addressed (separate, pre-existing design property, out of scope of
  this bug): RFQ/Quotation slots are positional (slot 1/2/3), not tied to a
  specific vendor's identity - removing an earlier vendor (not the last one)
  shifts the remaining vendors into lower slot numbers while that slot's
  already-attached file stays put, which could display a file originally
  meant for a different vendor. This predates today's fix (the "do not
  change the slot ids" rule in `CAPEX_Rev3_Frontend_Tasks_for_BAS.md` T3)
  and is a bigger design question, not the silent-data-loss bug fixed here.
- Verified: `node -c` passes, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no browser automation available this session; user
  should attach an RFQ/Quotation to Vendor 1, add a second vendor, submit,
  and confirm the file actually appears in the CPE's Documents tab
  afterward (previously it would silently not be there).

### 90. Double-submit guard extended to every other async action button app-wide - previously only CPE Create's Save Draft/Submit had one (fixed, 2026-11-05)
Files: `webapp/controller/BaseController.js`, `webapp/controller/ApprovalDetail.controller.js`,
`webapp/controller/BudgetApprovalDetail.controller.js`, `webapp/controller/ApprovalInbox.controller.js`,
`webapp/controller/PODetail.controller.js`, `webapp/controller/CWIPCreate.controller.js`,
`webapp/controller/BudgetCreate.controller.js`, `webapp/controller/Evaluation.controller.js`,
`webapp/controller/ICDetail.controller.js`.
- Found during the same requested UI-bug audit as Open Issue #89.
  `CPECreate.controller.js#onSaveDraft` already has an explicit guard with
  its own comment explaining why: the busy overlay from `setBusy(true)`
  alone doesn't block button presses, and has its own ~1s show delay before
  it's visually obvious - so a fast double-click (or a double-click on a
  `MessageBox.confirm` dialog's Yes button) can fire the same
  `createEntity`/`callFunction` twice before the first call resolves. That
  specific fix was never applied anywhere else in the app - every other
  Approve/Reject/Hold/Rollout/Bulk-Approve/Confirm-PO/Push-to-SAP/Save
  button relied on `setBusy` alone.
- **Generalized the fix into `BaseController`** instead of copy-pasting
  `CPECreate`'s own ad hoc `_bSaving` boolean into eight more controllers:
  added `isGuarded(sFlag)` (returns `true` - and does nothing else - if a
  call with that flag name is already in flight, else marks it in-flight
  and returns `false`) and `releaseGuard(sFlag)` (clears it). Named flags
  (not a single boolean) because several of these controllers have more
  than one independent guarded action (e.g. `ApprovalDetail` has four:
  Approve/Reject/Hold/Rollout, each must be able to run without blocking
  the others).
- Left `CPECreate.controller.js`'s own existing `_bSaving` flag + manual
  button-disable untouched - it already works correctly and additionally
  disables the Save Draft/Submit buttons themselves (which the new generic
  helper deliberately does not do, since the affected screens don't share a
  common pair of button ids to reach for). Not worth refactoring working
  code just for the sake of using the new helper there too.
- **Applied `isGuarded`/`releaseGuard` to every other identified gap:**
  `ApprovalDetail.onApprove/onReject/onHold/onRollout`,
  `BudgetApprovalDetail.onApprove/onReject`, `ApprovalInbox.onBulkApprove`,
  `PODetail.onConfirmPO`, `CWIPCreate.onPushToSap`,
  `BudgetCreate.onSaveDraft/onSubmit`, `Evaluation.onSave/onSubmitEvaluation`,
  `ICDetail.onSave/onApproveIC`. For the `this.confirm(...)` wrapped actions,
  the guard check sits as the first line *inside* the Yes callback (the
  actual point a second click could re-fire the backend call), not at the
  top of the outer handler. For the two direct (non-confirm) saves
  (`BudgetCreate.onSaveDraft`, `Evaluation.onSave`, `ICDetail.onSave`), it
  sits right after synchronous validation and before `setBusy(true)`/the
  async call - same placement as `CPECreate`'s original fix, so a failed
  validation never leaves the flag stuck "in progress" forever. Every
  `.then()` success branch and every `.catch()` error branch that actually
  terminates the flow now calls `releaseGuard` alongside its existing
  `setBusy(false)` - including both nested branches of
  `BudgetCreate.onSubmit`'s two-step `createEntity` + `SubmitDocument` chain
  (success, the "created but not routed" partial-failure catch, and the
  outer catch).
- Not touched: `CWIPCreate.onSaveDraft` (just a `toast()`, no real backend
  call yet per Open Issue #1's CWIP-draft gap - nothing to guard) and
  `Evaluation.onSubmitEvaluation`'s "technical non-compliance" early-return
  branch (calls local `_writeBack` only, no network call either).
- Verified: `node -c` passes on all nine changed files, `npm run build`
  passes. **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should try rapidly double-clicking Approve
  (or any of the other guarded buttons) and confirm only one backend call
  actually fires (e.g. a DOA chain only advances one level, not two).

### 91. CPE Detail's "Upload Document" and "Revise Amount" dialogs still showed the previous session's filename on reopen - same bug as Open Issue #86, just not covered there (fixed, 2026-11-05)
Files: `webapp/controller/CPEDetail.controller.js`.
- Found during the same requested UI-bug audit as Open Issue #89/#90. Issue
  #86 fixed this exact bug (`sap.ui.unified.FileUploader` keeps its own
  internally-remembered chosen filename independent of any model binding)
  for CPE Create's attachment slots, but the identical control pattern
  exists untouched in CPE Detail's two upload dialogs: "Upload Document"
  (`UploadDocument.fragment.xml`, `fuUploadDocument`) and "Revise Amount"
  (`ReviseAmount.fragment.xml`, `fuReviseDoc`). Both dialogs are built once
  and cached (`_pUploadDialog`/`_pReviseDialog`), so reopening either a
  second time still showed whatever filename was last picked into it, even
  though `onUpload`/`onReviseAmount` already correctly reset the bound
  `upload`/`revise` JSON models and the internal `_oUploadFile`/
  `_oReviseFile` references each time - only the `FileUploader` control's
  own visual state was never cleared. A user could be misled into thinking a
  file was already selected, press Submit, and only then see "Choose a file
  before uploading."
- **Fixed:** both `onUpload` and `onReviseAmount` now also call
  `Fragment.byId(oView.getId(), "fuUploadDocument"/"fuReviseDoc").clear()`
  at the same point the model is reset, right before `oDialog.open()` -
  simpler than Open Issue #86's `findAggregatedObjects` sweep since these
  two dialogs each have exactly one fixed-id `FileUploader` (unlike
  CPECreate's variable-length RFQ/Quotation/General slots), so a direct
  `Fragment.byId` lookup is enough.
- Verified: `node -c` passes, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no browser automation available this session; user
  should open "Upload Document" (or "Revise Amount" as admin), pick a file,
  cancel, reopen the same dialog, and confirm the file picker shows no
  filename until a new file is chosen.

### 92. CWIP Create's Asset Class dropdown couldn't be searched by its code, only its full name - same gap the Plant dropdown fix (Open Issue #8) missed here (fixed, 2026-11-05)
Files: `webapp/controller/CWIPCreate.controller.js`.
- Found during the same requested UI-bug audit as Open Issue #89-#91. Open
  Issue #8 fixed `sap.m.ComboBox`'s default "match displayed text only,
  never the key" suggestion-filter gap app-wide via
  `BaseController#enableSearchByKeyOrText`, applied to every Plant `ComboBox`
  (`cbPlant` on 5 screens, `cbQuotaPlant` on Unit Quota) - but `CWIPCreate`'s
  own `cbAssetClass` (`webapp/view/CWIPCreate.view.xml:62-68`) has the
  identical `key="{procure>key}" text="{procure>text}"` item structure and
  was never covered, since Asset Class isn't a plant dropdown and the
  original fix was scoped to plant screens specifically. A user typing a
  known asset class code got no match, only typing the full description
  would find it.
- **Fixed:** added `this.enableSearchByKeyOrText("cbAssetClass");` to
  `CWIPCreate.controller.js#onInit`, same call already used by
  `BudgetCreate`/`BudgetList`/`CPEList`/`GRNList`/`POList`/`UnitQuota` -
  no new logic needed, just applying the existing shared helper to the one
  ComboBox it was missed on.
- Verified: `node -c` passes, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no browser automation available this session; user
  should open CWIP Create and confirm typing an asset class code (not just
  its description) into the Asset Class dropdown finds a match.

### 93. Amount field "live" feedback (DOA preview, budget check, quota message) was always one keystroke behind, not actually live - fixed on all 3 screens (fixed, 2026-11-05)
Files: `webapp/view/BudgetCreate.view.xml`, `webapp/view/CPECreate.view.xml`, `webapp/view/UnitQuota.view.xml`.
- Found during the same requested UI-bug audit as Open Issue #89-#92.
  `BudgetCreate.view.xml:76` (`inpAmount` → `.onAmountChange`),
  `CPECreate.view.xml:111` (`inpAmount` → `.onAmountChange`), and
  `UnitQuota.view.xml:101` (`inpQuotaAmount` → `.onQuotaCheck`) all wire
  `liveChange` to handlers that read the typed amount straight from the
  bound model (`oModel.getProperty(".../amount")` -
  `BudgetCreate.controller.js#onAmountChange`,
  `CPECreate.controller.js#onAmountChange`/`_runBudgetCheck`,
  `UnitQuota.controller.js#onQuotaCheck`) - but none of the three `Input`
  controls had `valueLiveUpdate="true"` set, so the two-way bound model
  value only actually commits on blur/Enter, not on `liveChange`. Result:
  the DOA chain preview, budget-availability check, and quota-remaining
  message all displayed results based on the amount from *before* the
  user's current keystroke, only catching up once they clicked/tabbed away -
  confusing even though nothing was lost (distinct from Open Issue #33's
  data-loss bug, which this isn't).
- **Fixed:** added `valueLiveUpdate="true"` to all three `Input`s, so the
  model actually updates on every keystroke and the live checks reflect what
  the user is currently typing.
- **Also changed `groupingEnabled: true` → `false`** in the same three
  `formatOptions` while making this change - not the original complaint, but
  a real risk this fix would have otherwise introduced: with
  `valueLiveUpdate="true"`, the bound Float type now reformats the displayed
  text on every keystroke (not just on blur), and once an amount crosses a
  thousands boundary the inserted comma would have made the input's text and
  cursor position jump mid-typing. These fields are plain `Input`s (no
  `type="Number"`, unlike Open Issue #33's Quote/Total Cost fields), so this
  wouldn't have erased the value the way #33 did, but it's the same
  underlying grouping-while-typing interaction, caught before shipping it
  rather than after a user reported it. Fields now just show plain digits
  while typing, consistent with the precedent #33 already established for
  the same reason.
- Verified: XML well-formed on all three files, `npm run build` passes.
  **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should type a multi-digit amount into Budget
  Create / CPE Create / Unit Quota's amount field and confirm the DOA
  preview / budget check / quota message updates on every keystroke, not
  only after clicking away, and that the digits don't jump or reformat
  oddly while typing.

### 94. DoaRule `Active` flag read wrong - defaulted to true on JS undefined/null, but the live Edm.String(1) flag actually comes back as "" and was silently excluding every original DOA rule (fixed, 2026-11-05)
Files: `webapp/Component.js`.
- User asked to re-check the DOA Matrix against the live backend specifically
  (reported the backend team said they'd "maintained many more IDs"). Pulled
  live `$metadata` + live `DoaRuleSet?$expand=DoaRuleToChain` data via the
  dev proxy (`npx ui5 serve`, already running) rather than reading code
  alone, since the user wanted the backend checked directly.
- **Found 3 new DOA rules added since Open Issue #9: D7/D8/D9**, all
  `Capextype: "*"` (generic, applies to any capex type) rather than the
  existing per-type D1-D6: D7 is a 6-step chain (₹0-10L), D8/D9 are 7-step
  chains (>₹10L / a malformed ₹0.00-₹0.00 range respectively - D9's range
  looks like a data issue worth asking the backend team about separately).
  This matches the "7-8 step approval chain" shape the Rev3 test checklist
  (section 6, item 11) was written anticipating but never had real data for.
  5 new approver user IDs appear across them, each now also paired with a
  real `ApproverName` (`DoaChain` entity) - a field that exists in
  `$metadata` but `mapDoaRuleEntity`'s chain mapping never reads.
- **The actual bug, found while checking this new data:**
  `mapDoaRuleEntity`'s `active` field was
  `oRaw.Active === undefined || oRaw.Active === null ? true : !!oRaw.Active`
  - written speculatively (Open Issue #79/T9) before real `Active` data
  existed. Live-tested: D1-D6 all return `Active: ""` (confirmed via the raw
  JSON, not assumed) - an empty string, never JS `undefined`/`null`, since
  `Active` is `Nullable="false"` in `$metadata`. `"" === undefined` and
  `"" === null` are both false, so the ternary fell through to `!!""` =
  `false` - every one of the 6 original, proven DOA rules was being silently
  read as inactive and excluded from `BaseController.resolveDOA`'s
  `r.active !== false` filter, while the new D7-D9 (`Active: "X"`) rules
  matched instead. Net effect: a MANUFACTURING CPE under ₹10L would silently
  route through the wrong 6-step generic chain instead of the correct
  3-step MANUFACTURING-specific one (D1), with no error.
- **Fixed:** changed to `active: oRaw.Active === "X"` - the exact same
  "X"/"" flag-reading convention already used consistently everywhere else
  in this file (`GstCompliant`, `TechCompliant`, `MetricsOn`, `IsQuota`,
  `RolloutFlag`, `IsAdmin`, etc. are all read this way already; the old
  DoaRule code was the one outlier).
- **Important open question, not resolved here - flagged for the backend
  team/user to confirm, not assumed:** with this fix, D1-D6 (now correctly
  read as inactive) stop matching anything, and every CPE/Budget routes
  through the new D7-D9 generic chains instead. Two explanations are equally
  plausible from the data alone and this fix can't distinguish them: (a) the
  backend forgot to set `Active="X"` on the pre-existing rules when adding
  the new ones (an oversight, meaning D1-D6 should probably still be
  active), or (b) this is a deliberate transition to a single unified,
  longer approval hierarchy, replacing the old per-capex-type chains
  entirely (which would also finally deliver the "expanded CPE approval
  chain" requirement from Open Issue #49, never built until now). This fix
  makes the frontend correctly reflect whichever the `Active` flag actually
  says rather than silently guessing - but the real-world behavior change
  (every future CPE/Budget approval routes through a completely different,
  longer chain of people) is significant enough that it should be confirmed
  with the backend team before being treated as final, not just accepted
  because the code now technically reads the flag correctly.
- Verified: `node -c` passes, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no browser automation available this session; user
  should check the DOA Matrix / Routing Simulator for a MANUFACTURING CPE
  under ₹10L and confirm which chain it now resolves to, and raise the
  D1-D6-now-inactive question with the backend team before relying on it.
- **Resolved, 2026-11-06 - confirmed by the backend team: explanation (b) is
  correct.** D7-D9 (the new generic, longer chains) are the deliberate,
  intended routing going forward; D1-D6 being inactive is correct, not a
  bug or an oversight. No further frontend change needed - this fix already
  reads the live `Active` flag correctly and requires no update now that
  intent is confirmed. **Still outstanding, not covered by this
  confirmation:** D9's malformed ₹0.00-₹0.00 amount range (flagged earlier
  in this entry) - worth a separate follow-up with the backend team since
  that wasn't part of what they confirmed.

### 95. SLA warn/breach thresholds (3/5 days) were hardcoded in 3 separate places in formatter.js, independent of the live ConfigSet values already used to populate the DOA Matrix's own SLA Configuration display (fixed, 2026-11-05)
Files: `webapp/model/formatter.js`, `webapp/Component.js`.
- Follow-up to the same backend-sync check as Open Issue #94. User's
  original ask was to make `CPE.SlaState`/`ApprovalInbox.SlaState` (both
  present live in `$metadata`, never read by the frontend) the source of
  truth, since the frontend currently computes its own SLA badge from
  `daysPending` instead.
- **Checked before changing anything, per the user's own established
  preference for this codebase:** `mapCpeEntity`'s own doc comment
  (`Component.js:403-405`) already documents this as a *deliberate*
  decision, not an oversight - "slaState is deliberately not read from
  SlaState - the UI already derives it from daysPending via
  formatter.slaState, the same as every other worklist." Only `CPE` and
  `ApprovalInbox` actually expose a `SlaState` field; Budget/GRN/PO/etc. do
  not, so switching only those two screens to the backend's version would
  make different worklists disagree with each other on the exact same
  concept - worse, not better. Did not undo this decision.
- **The real, narrower gap this check surfaced instead:** `formatter.js`'s
  `slaState`/`slaText`/`slaRowClass` (used consistently across CPEList,
  ApprovalInbox, ApprovalDetail, Reports, and indirectly Dashboard - the
  "same as every other worklist" the comment above refers to) all
  independently hardcoded `d > 5` / `d > 3` as literal numbers. Meanwhile
  `Component.js#_loadLiveSlaConfig` already reads real `SLA_WARN_DAYS`/
  `SLA_BREACH_DAYS` from `ConfigSet` (Open Issue #5, confirmed correct
  2026-09-30 per Open Issue #9) purely to populate the DOA Matrix's SLA
  Configuration display tile - the two numbers happen to currently agree
  (3/5 both places) but nothing kept them in sync if the backend's `ConfigSet`
  values ever changed. Same class of "N separate hardcoded copies of one
  business constant" issue as Open Issue #6's quota-cap fix, just not
  noticed until this SLA-specific check.
- **Fixed:** added module-level `nSlaWarnDays`/`nSlaBreachDays` to
  `formatter.js` (default 3/5, the same literals every call site used to
  hardcode) plus `formatter.setSlaThresholds(nWarnDays, nBreachDays)`;
  `slaState`/`slaText`/`slaRowClass` now read these module variables instead
  of literals. `Component.js#_loadLiveSlaConfig` now also calls
  `formatter.setSlaThresholds(...)` with the same `ConfigSet` values it was
  already reading for the display tile - one source of truth, no new
  backend call. `formatter` added as a new AMD dependency to
  `Component.js`'s `sap.ui.define` (previously only reached via
  `BaseController.formatter`); the UI5 module loader caches it as a
  singleton, so both consumers share the exact same mutable state. No view
  binding changes needed anywhere - every existing `formatter.slaState`/
  `slaText`/`slaRowClass` call site picks this up automatically.
- **Deliberately left alone, flagged as a separate, smaller follow-up if
  wanted:** `ApprovalInbox.controller.js` has its own independent hardcoded
  copies not routed through `formatter.js` at all - `formatHighlight`
  (3/5), the on-track/at-risk/breached KPI counts (3/5), and the SLA
  `Filter` bounds used for the inbox's own filter buttons (3/4/5, baked into
  `sap.ui.model.Filter` constructors, not simple formatter calls) -
  `Dashboard.controller.js#slaBreachCount` (hardcoded 5) is the same
  situation. Not touched here since none of them can reach the shared
  `formatter.js` thresholds as a one-line change the way the `format*`
  calls could; a real fix for these needs the config value threaded into
  each controller directly, more invasive than this pass's scope.
- Verified: `node -c` passes, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no browser automation available this session; since
  the live `ConfigSet` SLA values currently still resolve to 3/5 (per Open
  Issue #9), there is no visible behavior change to check right now - this
  only matters the next time the backend changes `SLA_WARN_DAYS`/
  `SLA_BREACH_DAYS`, at which point every SLA badge app-wide (except the
  `ApprovalInbox`/`Dashboard` spots flagged above) should move together
  automatically instead of silently drifting from the DOA Matrix's own
  displayed SLA Configuration.

### 96. Audit Trail now plant-filtered, closing Open Issue #2 (fixed, 2026-11-06)
Files: `webapp/controller/AuditTrail.controller.js`.
- Open Issue #2 was left deprioritized since 2026-09-30: `AuditLogSet` →
  `mapAuditLogEntity` carries no plant field at all, so `AuditTrail.controller.js`
  was the one list screen in the app not enforcing "other plant capex should
  not be visible." User asked to build this now rather than leave it open.
- **Fixed, same pattern `BudgetDetail.controller.js` already uses for linked
  CPEs:** added `_stampPlants()`, which cross-references each audit row's
  `docId` back to its source document's `plant` field (`budget>/list` for
  BUD, `cpe>/list` for CPE, `procure>/po` for PO, `procure>/grn` for GRN,
  `procure>/cwip` for CWIP, `asset>/ic` for IC, `config>/quota/items` for
  QUOTA - all already loaded live elsewhere, no new backend call needed) and
  writes the stamped rows back to `config>/auditTrail`. A row whose source
  document can't be found gets `plant: null`, which fails closed - it won't
  match any authorized-plant filter, rather than risking a leak.
- Added `_buildAuthFilter()`, the exact same shape as
  `CPEList.controller.js#_buildAuthFilter` (an OR'd `plant EQ` filter per
  the user's `authorizedPlants`, skipped entirely for `isGlobal` users), and
  merged it into `onFilter()`'s existing filter array (search/doc-type/date),
  same as every other filtered list screen in the app.
- `_onMatched` now calls `_stampPlants()` → `_buildAuthFilter()` → `onFilter()`
  on every route match, so it's recomputed fresh each time the screen opens
  (cheap at this app's data scale, and avoids any staleness if the user's
  plant list or the underlying documents changed since the last visit).
- `BudgetDetail.controller.js`'s own existing read of `config>/auditTrail`
  (filtering to one budget's own history) is unaffected - it now just also
  sees a `plant` field on each row, which it doesn't use.
- Verified: `node -c` passes, `npm run build` passes, `webapp/view/AuditTrail.view.xml`
  unchanged (no view edits needed - the table was already bound correctly).
  **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should log in as a non-global, single-plant
  user and confirm the Audit Trail only shows rows for documents on their
  own plant(s), same as Budget/CPE/PO/GRN/IC lists already do.

### 97. "Record ... could not be found" error flashing and bouncing the user off a detail screen on hard refresh - startup load-order race, fixed on all 9 affected screens (fixed, 2026-11-06)
Files: `webapp/controller/BaseController.js`, `webapp/Component.js`,
`webapp/controller/CPEDetail.controller.js`,
`webapp/controller/BudgetDetail.controller.js`,
`webapp/controller/BudgetApprovalDetail.controller.js`,
`webapp/controller/ApprovalDetail.controller.js`,
`webapp/controller/Evaluation.controller.js`,
`webapp/controller/PODetail.controller.js`,
`webapp/controller/CWIPCreate.controller.js`,
`webapp/controller/ICDetail.controller.js`.
- User reported a confusing, transient error popping up and vanishing within
  about a second on some screen after a refresh - asked what it was.
- **Root cause, confirmed by reading the code (not reproduced live - no
  browser automation available this session):** every detail-type screen's
  `_onMatched` does a synchronous `readOne(...)` against a local list model
  (`cpe>/list`, `budget>/list`, `procure>/po`, `asset>/ic`) and, if nothing
  matches, immediately shows `i18n>recordNotFound` ("Record {0} could not be
  found.") and navigates back to the parent list. On a **hard refresh** of a
  deep-linked detail URL, the router matches the route and fires `_onMatched`
  synchronously, but `Component.js#_clearLiveBackedSeedData` has just reset
  that same list to `[]` and its live OData read (`_loadLiveCpeList()` etc.)
  is still in flight - so the very first lookup always finds nothing, fires
  the error, and bounces the user back to the list, a moment before the real
  data would have arrived. What looked like a self-vanishing popup was
  actually the error firing once, immediately followed by navigation away -
  not a fixed-duration toast.
- Affected 9 call sites across 7 screens (same pattern every time):
  `CPEDetail`, `BudgetDetail`, `BudgetApprovalDetail`, `ApprovalDetail`,
  `Evaluation`, `CWIPCreate` (all keyed off `cpe>/list`), `PODetail`
  (`procure>/po`), and `ICDetail` (both `_loadExisting` off `asset>/ic` and
  `_newFromCPE` off `cpe>/list`).
- **Fixed:** added `BaseController#resolveRecord(sModel, sPath, sKeyField,
  sKeyValue, fnFound)` - tries the lookup immediately (so normal in-app
  navigation, where the list is already loaded, is unaffected and still
  instant), and only if that fails, waits for the app's existing
  `_pInitialLoad` promise (the same one `Dashboard.controller.js` and
  `ApprovalInbox.controller.js` already key their own post-refresh
  self-correction off) and retries exactly once before truly reporting
  "not found." All 9 call sites now wrap their existing body in this
  callback instead of a bare `readOne` + immediate error - no other logic
  changed, just when the not-found decision is allowed to fire.
- **Also fixed in `Component.js`:** `_loadLivePOList()`'s call in the
  `_initLiveData` loader array wasn't returning its promise, so
  `_pInitialLoad` never actually waited for the PO list - meant `PODetail`
  would have retried against a promise that resolves before PO data lands,
  defeating the fix for that one screen. Changed to `return
  this._loadLivePOList();`, same one-line pattern already used for
  Budget/CPE/IC/CWIP-ageing in that same array.
- Verified: `node -c` passes on all 10 changed files, `npm run build`
  passes. **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should hard-refresh (empty cache or a plain
  reload) while sitting on a CPE/Budget/PO/IC/Evaluation/CWIP-Create detail
  URL for a record that genuinely exists, and confirm the screen now loads
  normally with no flash of "could not be found." A refresh on a URL for a
  record that's genuinely deleted/invalid should still correctly show the
  error after the retry, just slightly later than before - worth checking
  that negative case too.

### 98. My Approvals (Approval Inbox) table headers still said "CPE Number/Title/Amount" even for Budget rows - mislabeling, not a data bug, fixed with generic headers + a doc-type chip (fixed, 2026-11-06)
Files: `webapp/view/ApprovalInbox.view.xml`, `webapp/controller/ApprovalInbox.controller.js`, `webapp/i18n/i18n.properties`.
- User noticed a newly-created Budget showing up in My Approvals (expected -
  Issue #13 built this on purpose, the user is also the first DOA approver
  on their own submitted budget) under column headers that said "CPE
  Number"/"CPE Title"/"CPE Amount", and asked whether that binding was
  wrong.
- **Not a data bug - the cells were already correct.** Issue #13 made the
  cell bindings generic (`inbox>docId`/`title`/`amount`, correctly holding
  either the CPE's or the Budget's own id/title/amount), but the column
  *headers* were never updated off the old CPE-specific i18n keys
  (`cpeId`="CPE Number", `cpeTitle`="CPE Title", `cpeAmount`="CPE Amount" -
  confirmed these three keys are genuinely correct and still needed
  elsewhere, reused by CPEList/CPEDetail/CPECreate/BudgetDetail's own CPE
  sub-table/PODetail/POList, so their *text* couldn't just be changed
  without mislabeling those screens instead).
- User asked for the best UX treatment rather than just a literal relabel -
  agreed on generic headers plus a small doc-type chip per row, since
  nothing on the row previously showed CPE vs Budget explicitly (only
  inferable from the id's own prefix, e.g. `CPE-2026-0031` vs `B-2026-011`).
- **Fixed:** the three headers now read `{i18n>docId}` (reusing the existing
  generic "Document" key AuditTrail already uses for the same concept) and
  two new keys added to `i18n.properties`, `inboxDocTitle`="Title"/
  `inboxDocAmount`="Amount" (not reusing the existing `docTitle` key, which
  already means something different - the uploaded-file title placeholder
  on CPECreate's document fields, Rev3 T2-T5). Added a small `ObjectStatus`
  chip ("CPE"/"Budget", colour-coded the same Success/Information scheme
  AuditTrail's own `formatDocTypeState` already uses for CPE/BUD) above the
  id in the first column, via two new controller formatters
  (`formatDocTypeText`/`formatDocTypeState`) reading `inbox>docType` (the
  same generic field Issue #13 already added).
- Verified: `node -c` passes, XML well-formed, `npm run build` passes.
  **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should check My Approvals shows "Document"/
  "Title"/"Amount" headers with a CPE/Budget chip on each row, correctly
  colour-coded per row's real type.

### 99. Capitalization screen's two tables had no growing/pagination, unlike every sibling full-list screen (fixed, 2026-11-06)
Files: `webapp/view/Capitalization.view.xml`.
- User asked whether every table in the app has pagination. Audited all
  `<Table>` items-bindings across every view: no screen has **server-side**
  pagination at all - every live list (`BudgetSet`, `CPESet`,
  `PurchaseOrderSet`, `GRNSet`, `CWIPSet`, `InstallCertSet`, `AuditLogSet`,
  etc.) is read via one OData call with no `$top`/`$skip`, and
  `Component.js` already has a comment confirming the backend doesn't honour
  `$top` anyway (a live `$top=2` test returned every row). So client-side
  `growing` (SAPUI5's load-more) is the only pagination this app has
  anywhere, and it's applied to most - but not all - of the full-list
  screens: Budget List (15), CPE List (20), PO List (20), GRN List (20), IC
  List (20), Audit Trail (30), My Approvals (20), Unit Quota (15),
  Dashboard's CWIP Ageing mini-table (5).
- **Gap found:** `Capitalization.view.xml`'s two tables - the open-CWIP
  ageing list (`asset>/cwipAgeing`) and the capitalized-assets list
  (`asset>/ic`, filtered to `status=CAPITALIZED`) - bind to the exact same
  full live lists Dashboard and other screens already paginate, but had no
  `growing` at all, rendering every row unbounded. Every other
  screen-not-paginated case (CPE's own vendor quotes, a budget's 5-year cash
  flow, a PO's GRNs, DOA Matrix's handful of rules, Dashboard/Reports' small
  rollups) is a genuinely small, inherently bounded list - these two aren't.
- **Fixed:** added `growing="true" growingThreshold="20"` to both tables,
  matching the threshold already used by every other full-entity-list
  screen (CPEList/POList/GRNList/ICList).
- Verified: XML well-formed, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no browser automation available this session; user
  should check the Capitalization screen still shows all rows via "Load
  More" scrolling rather than everything up front.

### 100. My Approvals table cleanup - type filter, inline chip, dropped redundant SLA signal, consistent priority badges (fixed, 2026-11-06)
Files: `webapp/view/ApprovalInbox.view.xml`, `webapp/controller/ApprovalInbox.controller.js`.
- User said they weren't satisfied with how My Approvals looked after Issue
  #98's chip/label fix and asked for cleaner UX, frontend-only. Agreed on
  four changes, all pure client-side:
  1. **Type filter.** Added a `cbDocType` ComboBox (CPE/Budget) next to the
     existing SLA/Priority filters, wired into `onFilter`/`onClearFilter`
     the same way those two already are - lets a user narrow to one
     document type without losing the single-inbox view by default.
  2. **Inline chip layout.** The id column's CPE/Budget chip (added in
     Issue #98) was stacked in its own line above the id inside a `VBox`,
     using more vertical space than needed. Changed to an `HBox` so the
     chip sits beside the id on one line.
  3. **Dropped the redundant row-highlight stripe.** The same SLA ageing
     was being shown three ways at once: the SLA summary tiles up top, the
     row's own coloured left-edge `highlight` bar, and the SLA
     text+colour+icon badge in its own column. Removed the `highlight`
     attribute from `ColumnListItem` (keeping the tiles and the badge,
     which already carry the same information more clearly) and deleted
     the now-unused `formatHighlight` controller function (and an orphaned
     doc-comment above `formatCurrentLevelState` that actually described
     `formatHighlight`, left behind from an earlier edit).
  4. **Consistent priority badges.** Previously only `priority === "High"`
     showed a badge at all (`visible` bound to that check); Medium/Low rows
     showed nothing, reading like missing data rather than a set priority.
     Added `formatPriorityState` (High→Error, Medium→Warning, Low→Success)
     and made the badge always visible, so every row shows its priority
     consistently.
- Verified: `node -c` passes, XML well-formed, `npm run build` passes.
  **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should check My Approvals shows the new
  Type filter, the inline chip, no more coloured row-edge stripe, and a
  priority badge on every row (not just High-priority ones).

### 101. My Approvals split into two separate tables (CPE / Budget) instead of one merged list - supersedes part of Issue #100 (fixed, 2026-11-06)
Files: `webapp/view/ApprovalInbox.view.xml`, `webapp/controller/ApprovalInbox.controller.js`, `webapp/i18n/i18n.properties`.
- User said the Type filter from Issue #100 wasn't enough - they still saw
  CPE and Budget mixed together by default (the filter only narrows down
  when you pick one, it doesn't change the default view). Asked for a real
  split instead: two separate tables, confirmed frontend-only beforehand
  (no backend change - both tables read the same already-loaded
  `inbox>/items` array, just filtered client-side by `docType`).
- **Removed, now unnecessary with a real split:** the `cbDocType` filter
  dropdown and its i18n/controller plumbing from #100 (no longer needed -
  each table is already single-type by construction), the per-row doc-type
  chip and its `formatDocTypeText`/`formatDocTypeState` formatters (same
  reason - which table a row is in already says its type), and the generic
  `inboxDocTitle`/`inboxDocAmount` i18n keys (reverted to the real
  `cpeId`/`cpeTitle`/`cpeAmount` and `budgetId`/`budgetTitle`/`budgetAmount`
  keys instead, both sets already existed and are now accurate again since
  each table is genuinely single-type).
- **Built:** a second `Table` (`tblInboxBudget`) alongside the existing one
  (renamed `tblInboxCpe`), both bound to the same `inbox>/items` path.
  `onFilter()` now applies the shared search/SLA/priority filters to both
  bindings, each with its own added `docType` filter (`NE "BUD"` for the
  CPE table, `EQ "BUD"` for the Budget one) - same underlying data, split
  by type instead of merged. The Budget table has no `mode="MultiSelect"`
  and no "Approve Selected" button, since `BulkApprove` is CPE-only per
  `$metadata` anyway - this was already true, just now structurally
  reflected instead of handled defensively inside `onBulkApprove`.
- **Also fixed in passing, found while touching `onFilter`:** the search
  box's id/title filter was checking the legacy `cpeId` field (`null` on
  every Budget-derived row, see `mapBudgetToInboxRow`), so searching for a
  Budget by its own id never matched it even in the old merged table.
  Changed to filter on the generic `docId` field instead, which both row
  types carry correctly. Updated the search placeholder from "CPE number or
  title" to "Document number or title" to match (one search box now feeds
  both tables).
- **Simplified `onBulkApprove`:** since `tblInboxCpe`'s own binding filter
  guarantees it never contains a Budget row, removed the now-dead
  "filter Budget rows out of the selection, warn if any were skipped" logic
  from Issue #13 - it can't fire any more, so keeping it would just be dead
  code.
- Verified: `node -c` passes, XML well-formed, `npm run build` passes,
  every `i18n>` key referenced in the view resolves to a real
  `i18n.properties` entry (checked by script, not just by eye). **Not yet
  confirmed in an actual browser** - no browser automation available this
  session; user should check My Approvals now shows two clearly separate
  "CPE Approvals" / "Budget Approvals" tables, the shared search/SLA/
  priority filters narrow both at once, and bulk-approve still only acts on
  selected CPE rows.

### 102. CPE Create: RFQ/Quotation now always show exactly 3 slots, decoupled from vendor count (fixed, 2026-11-06)
Files: `webapp/controller/CPECreate.controller.js`, `webapp/view/CPECreate.view.xml`.
- User asked for RFQ and Quotation to always default to 3 slots each when
  creating a CPE, with everything else left the same, and all document
  slots mandatory except the open-ended "Additional Document" section.
  Confirmed with the user first since it was a real design change, not a
  bug: previously RFQ/Quotation slot count was tied 1:1 to the number of
  vendors added in the comparison table above (1 vendor = 1 slot, capped at
  3, with a hint text "add a vendor there to unlock another RFQ slot
  here"). User confirmed they want **(A)** - always exactly 3, fully
  decoupled from vendor count, not **(B)** keeping the per-vendor linkage
  with a higher floor.
- **Already true, no change needed:** TCC/Negotiation History/Justification
  Note were already always exactly one slot each and already mandatory
  (`_validateAttachments`); the General/"Additional Document" section was
  already excluded from that mandatory check (open-ended, optional). So the
  only real change needed was decoupling RFQ/Quotation from vendor count.
- **Fixed:** `_buildEmptyAttachments` no longer takes a vendor-count
  parameter and always builds exactly 3 RFQ + 3 Quotation slots. Removed
  `_syncAttachmentSlots` entirely (previously resynced slot counts on every
  vendor add/remove, preserving already-picked files by index) along with
  its two call sites in `onAddVendor`/`onRemoveVendor` - with a fixed slot
  count, there's nothing left to resync, and keeping it would have
  overwritten already-picked files with no vendor-driven reason to.
  `_validateAttachments`/`_uploadAttachments` needed no changes - both
  already loop generically over whatever's in `attachments.rfq`/
  `attachments.quotation`, so they automatically validate/upload all 3
  slots now.
- Updated the stale RFQ hint text ("One slot per vendor ... add a vendor
  there to unlock another RFQ slot here") to "3 RFQs are required for every
  CPE." and added the equivalent hint under Quotation (previously had no
  user-facing hint text at all, only an XML comment) - both sections'
  structural XML comments updated too.
- Verified: `node -c` passes, XML well-formed, `npm run build` passes,
  confirmed no remaining reference to the deleted `_syncAttachmentSlots`
  anywhere in the codebase. **Not yet confirmed in an actual browser** - no
  browser automation available this session; user should open CPE Create
  and confirm 3 RFQ + 3 Quotation slots show up immediately (before adding
  any vendor), stay at 3 regardless of how many vendors are added/removed,
  and that Submit still blocks correctly if any of the 3+3 slots are left
  empty.

### 103. CPE Create: mandatory documents now show a visual asterisk, not just blocking validation (fixed, 2026-11-06)
Files: `webapp/view/CPECreate.view.xml`.
- Follow-up to Issue #102. User asked whether the mandatory asterisk was
  kept on every document label except "Additional Document" - it wasn't:
  the underlying Submit-blocking validation was already correct
  (`_validateAttachments`), but every label in the whole Document
  Attachments section (RFQ/Quotation slot labels, TCC, Negotiation History,
  Justification Note) was a plain `<Text>`, which `sap.m.Text` can't render
  an asterisk for at all - only `sap.m.Label` with `required="true"` does
  that, the same pattern already used elsewhere on this exact screen for
  Title/Amount/Specs/Non-L1 Justification.
- **Fixed:** switched the 5 relevant labels from `<Text>` to
  `<Label required="true">` - each RFQ slot's `{cpe>label}`, each
  Quotation slot's `{cpe>label}`, and the TCC/Negotiation History/
  Justification Note labels. Left the General/"Additional Document"
  section's own label control untouched - it's an editable `<Input>` (the
  user names their own additional attachments), not a `<Text>`/`<Label>`,
  and was never meant to be mandatory anyway.
- Verified: XML well-formed, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no browser automation available this session; user
  should open CPE Create and confirm a red asterisk now shows next to every
  RFQ/Quotation slot name, TCC, Negotiation History and Justification Note,
  but not on the Additional Document entries.

### 104. Dashboard Approval Queue "Items" cell - replaced the squeezed one-line "2 (1 Budget · 1 CPE)" string with a stacked count + caption, matching the KPI tiles' own value/footnote style (fixed, 2026-11-06)
Files: `webapp/view/Dashboard.view.xml`, `webapp/controller/Dashboard.controller.js`.
- User flagged the Approval Queue table's "Items" cell as ugly for any row
  mixing CPE and Budget at the same DOA level (e.g. "Unit Commercial Head"):
  `formatQueueItems` was cramming a long string like "2 (1 Budget · 1 CPE)"
  into a single `<Text>` inside a narrow (9rem), right-aligned numeric
  column meant for a plain count.
- Discussed the fix with the user first since it's a visual judgment call,
  not a bug: agreed on a two-line stacked cell (bold count on top, small
  muted breakdown caption underneath) - the same value+footnote treatment
  this Dashboard's own KPI tiles already use (`zcpxKpiValue`/`zcpxKpiFoot`),
  so it's consistent with the screen's existing visual language rather than
  a new one-off pattern. Rows with only one type still show just the plain
  count, no empty second line.
- **Fixed:** replaced `formatQueueItems` with `formatQueueBreakdown`
  (returns just the "1 Budget · 1 CPE" caption, or `""` for a single-type
  row) and a new `hasQueueBreakdown` boolean helper, so the second line is
  fully hidden rather than rendered empty when there's nothing to show.
  `Dashboard.view.xml`'s Items cell is now a `VBox alignItems="End"` with
  the existing `zcpxNum`-styled count `Text` on top and the new
  conditionally-visible `zcpxHintText`-styled caption `Text` below.
- Confirmed `Reports.view.xml`'s own separate queue table (different
  screen, same `app>/dashboard/queue` data) was never using
  `formatQueueItems` at all - it already only ever showed the plain count,
  so nothing there needed touching.
- Verified: `node -c` passes, XML well-formed, `npm run build` passes.
  **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should check the Dashboard's Approval Queue
  table shows a plain bold count for single-type levels, and a count with a
  small grey breakdown line underneath for any level mixing CPE and
  Budget.

### 105. Dashboard Approval Queue "Items" cell - follow-up polish: centered and darkened (fixed, 2026-11-06)
Files: `webapp/view/Dashboard.view.xml`.
- User liked Issue #104's stacked cell overall, asked for two tweaks: the
  count centered instead of right-aligned, and the breakdown caption
  darker/more readable instead of faded.
- **Fixed:** `VBox alignItems="End"` → `"Center"` for the Items cell.
  Swapped the breakdown `Text`'s class from `zcpxHintText`
  (`color: var(--zcpx-text-subtle)`, the same low-contrast muted color
  Issue #36 already flagged and fixed for the KPI tiles' own label/footer
  text) to `zcpxKpiFoot` (`color: var(--zcpx-text)`, dark) - this is the
  exact class the KPI tiles' own footnote line already uses, which this
  cell was explicitly designed to match in Issue #104, so reusing it here
  instead of inventing a new style keeps it consistent with that precedent.
- Verified: XML well-formed, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no browser automation available this session; user
  should check the Approval Queue's Items cell now centers the count and
  shows the Budget/CPE breakdown in dark, readable text.

### 106. CPE Create: new "Single CPE" checkbox - shrinks RFQ/Quotation to 1 slot each instead of 3, frontend-only (added, 2026-11-06)
Files: `webapp/view/CPECreate.view.xml`, `webapp/controller/CPECreate.controller.js`.
- New functional ask: once a Budget is selected, give the user a "Single
  CPE" option; ticking it means all documents become single instead of the
  default 3, same mandatory validation either way. Confirmed with the user
  upfront this is entirely frontend-controlled - no backend field, nothing
  new sent in the CPE payload, purely how many slots render/validate
  locally. Also confirmed: a plain `CheckBox` (matching this form's
  existing plain-field style, no switches used elsewhere here), and that
  toggling keeps slot 1's already-picked file across the switch, silently
  dropping slots 2/3 when shrinking (no confirm dialog needed - ticking the
  box is itself a deliberate action).
- **Fixed/built:**
  - `_buildEmptyAttachments` (changed in Issue #102 to always build 3
    slots) now takes back an optional `iSlots` param, defaulting to 3 -
    `_resetDraft` still calls it with no arg (3), the new
    `onSingleCpeChange` calls it with 1 or 3 depending on the checkbox.
  - Added `/draft/singleCpe: false` to the draft's reset shape.
  - Added `onSingleCpeChange`: rebuilds RFQ/Quotation at the new slot
    count, carries over slot 1's `fileName`/`fileSize`/`fileType`/`title`/
    `note`/`_file` from whichever array already existed (so re-ticking
    back and forth doesn't lose a file already picked into the first
    slot), and writes only `/draft/attachments/rfq`/`quotation` - TCC/
    Negotiation History/Justification Note/General are never touched,
    since they were already single/optional regardless of this flag.
  - `CPECreate.view.xml`: added the `CheckBox` (text "Single CPE") right
    under the Budget verdict message strip, visible only once a budget is
    selected (`{= !!${cpe>/draft/budgetId} }`, the same reveal pattern this
    screen already uses for the auto-filled KPI grid). Updated the RFQ/
    Quotation hint text to a ternary expression binding on
    `cpe>/draft/singleCpe` ("1 RFQ/Quotation is required for this CPE." vs
    "3 ... required for every CPE."), matching the ternary-expression-
    binding style already used throughout this same view.
  - **No change needed in `_validateAttachments`/`_uploadAttachments`** -
    both already loop generically over whatever's actually in
    `attachments.rfq`/`attachments.quotation`, so they automatically
    validate/upload 1 or 3 slots correctly either way, same as they did for
    Issue #102's fixed-3 change.
- Verified: `node -c` passes, XML well-formed, `npm run build` passes.
  **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should open CPE Create, select a budget,
  confirm the "Single CPE" checkbox appears, and that ticking it shrinks
  RFQ/Quotation to 1 slot each (with updated hint text) while unticking
  restores 3 - and that a file already picked into the first RFQ/Quotation
  slot survives toggling either direction.

### 107. My Approvals: both CPE and Budget tables were showing every row mixed together - onFilter() never ran on a normal page load, so Issue #101's docType split never applied (fixed, 2026-11-06)
Files: `webapp/controller/ApprovalInbox.controller.js`.
- User reported both tables showing identical mixed content - a Budget
  (`B-2026-013`) appearing in the CPE Approvals table, a CPE
  (`CPE-2026-0067`) appearing in the Budget Approvals table, both tables
  showing the exact same two rows.
- **Root cause, confirmed by reading the code:** Issue #101 put the
  per-table `docType` split filter entirely inside `onFilter()`, but
  `_onMatched` only ever called `onFilter()` indirectly, through
  `_applyInitialSla()` - and that function only calls it when a specific
  hand-off flag is set (arriving via the Dashboard's "SLA Breaches" KPI
  tile). On a normal, direct visit to My Approvals, `_applyInitialSla` does
  nothing, so `onFilter()` never ran at all - both tables kept their
  default, completely unfiltered binding, showing every row of both types
  in both tables. Not a data problem - `inbox>/items` itself was always
  correct; the split just never got applied.
- **Fixed:** `_onMatched` now calls `this.onFilter()` unconditionally,
  every route match, right after `_load()`/`_applyInitialSla()` - not only
  when there's an SLA hand-off. Simplified `_applyInitialSla` to just set
  the SLA ComboBox's selection and clear the hand-off flag; it no longer
  calls `onFilter()` itself, since the new unconditional call right after
  it in `_onMatched` already picks up whatever SLA value is selected
  (hand-off or not) and applies the full filter set - search, SLA,
  priority, and each table's own docType split - every time.
- Verified: `node -c` passes, `npm run build` passes. **Not yet confirmed
  in an actual browser** - no browser automation available this session;
  user should reopen My Approvals (a direct visit, not via the Dashboard
  SLA tile) and confirm the CPE table only shows CPE rows and the Budget
  table only shows Budget rows.

### 108. Dashboard Approval Queue "Items" cell - still right-aligned after Issue #105, because the fix only centered content inside the VBox, not the column itself (fixed, 2026-11-06)
Files: `webapp/view/Dashboard.view.xml`.
- User reported the Items cell still wasn't centered after Issue #105.
  **Root cause:** Issue #105 set `alignItems="Center"` on the VBox wrapping
  the count and breakdown caption, which correctly centers those two lines
  relative to *each other* - but the `<Column>` itself (the table column
  definition, which governs where the whole cell's content, and the
  "Items" header label, sit within the column's width) was still
  `hAlign="End"` from the original design, left untouched by #105. A
  `VBox`'s own `alignItems` only affects its children's cross-axis
  position inside itself - it has no effect on where that VBox sits within
  the surrounding table cell, which the column's `hAlign` controls
  separately.
- **Fixed:** changed the Items `<Column>` from `hAlign="End"` to
  `hAlign="Center"` - this centers both the "Items" header label and every
  row's cell content (not just the two lines relative to each other, but
  the whole block within the column).
- Verified: XML well-formed, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no browser automation available this session; user
  should confirm the Items column (header and data) now sits centered
  within its own column width, not pinned to the right edge.

### 109. My Approvals: added bulk-approve to the Budget table too, by looping the existing single-document ApproveDocument call (added, 2026-11-06)
Files: `webapp/view/ApprovalInbox.view.xml`, `webapp/controller/ApprovalInbox.controller.js`.
- User noticed only the CPE table had multi-select/"select all" (Issue
  #101 deliberately left it off the Budget table, since `BulkApprove` is
  CPE-only per `$metadata`) and asked whether Budgets could still be
  multi-approved by looping the existing single-document approve call.
  Confirmed: yes - `ApproveDocument(DocType='BUD', DocId=...)` is already
  real and confirmed working (it's what `BudgetApprovalDetail.controller.js
  #onApprove` already calls one at a time), so a client-side sequential
  loop over it needs no new backend capability at all.
- **Built:** `tblInboxBudget` now has `mode="MultiSelect"` and its own
  "Approve Selected" button, matching the CPE table. `onBulkApproveBudget`
  confirms the selected ids/total value (same dialog shape as
  `onBulkApprove`), then calls the new `_approveBudgetsSequentially(aIds,
  0)` - a recursive one-at-a-time chain calling `ApproveDocument` for each
  id in turn (sequential, not `Promise.all`, same reasoning as
  `CPECreate.controller.js#_uploadAttachments`'s own sequential chain: a
  failure stops at a known point instead of leaving an ambiguous mix of
  in-flight/succeeded/failed calls). On success, reloads the live Budget
  list and refreshes the inbox. On failure partway through, still reloads
  (so the inbox reflects whichever ones already succeeded before the
  failure) and reports exactly which budget id the chain stopped at,
  rather than a generic "something failed."
- Verified: `node -c` passes, XML well-formed, `npm run build` passes.
  **Not yet confirmed in an actual browser, and the live `ApproveDocument`
  calls themselves haven't been re-tested in this session** - no backend
  reachable here. The single-document version of this exact call was
  previously confirmed working live (Open Issue #11's follow-up), and
  looping the same call shouldn't behave differently per-call, but the
  user should still select 2+ Budgets and try a real bulk approve before
  trusting this fully - particularly worth checking what happens if one of
  the selected Budgets is no longer actually awaiting that user's approval
  by the time its turn in the loop comes up (e.g. someone else acted on it
  moments earlier).

### 110. Budget bulk-approve hit exactly the race flagged in Issue #109 - fixed with an optimistic-concurrency pre-check instead of letting it hit the backend (fixed, 2026-11-06)
Files: `webapp/controller/ApprovalInbox.controller.js`.
- User hit the generic backend 500 ("In the context of Data Services an
  unknown internal server error occurred") on a real bulk-approve attempt,
  stopped at `B-2026-013` on the very first item. Confirmed by reasoning
  through the evidence rather than guessing: same generic error text seen
  throughout this project for various unrelated backend exceptions
  (Open Issue #1), failed on the first call (not after N successful calls,
  ruling out a token/session staleness theory), and the payload shape
  exactly matches the already-confirmed-working single-approve call - all
  pointing at the backend correctly rejecting a Budget that had already
  moved past this approver's level, not a bug in the new loop logic. User
  confirmed this directly: the Budget had already been acted on/advanced
  by the time it was opened individually, with no approval action left to
  take - exactly the staleness risk flagged (but not yet fixed) in Issue
  #109's own write-up.
- Discussed the fix with the user at length before building: landed on an
  optimistic-concurrency pattern - check fresh data immediately before
  acting, exclude anything stale before it ever reaches the backend, and
  gracefully handle the one unavoidable sliver (a true same-instant
  collision) instead of trying to prevent it outright, which isn't
  possible from the frontend alone.
- **Fixed, in `onBulkApproveBudget`:** now re-pulls the live Budget list
  (`_loadLiveBudgetList()`) the moment the button is pressed, *before*
  building the confirmation dialog, and splits the selection into `aValid`
  (still genuinely approvable) and `aStale` (already moved on) via the new
  `_isBudgetStillApprovable(sBudgetId)` - the exact same "is this budget
  still actionable by me" condition `BudgetApprovalDetail.controller.js`
  already uses for its own Approve/Reject panel visibility, reused here so
  both screens agree on what counts as stale. Only `aValid` is ever sent to
  `_approveBudgetsSequentially`; `aStale` entries are named in the
  confirmation dialog's own text ("X already moved on and will be
  skipped.") so the user isn't surprised by a smaller batch than they
  selected. If *everything* selected turns out stale, skips the dialog
  entirely and just refreshes with a plain explanation - no backend call,
  no error.
- **Added `_isGenericBackendError(oError)`** to catch the one remaining
  race this pre-check can't close - a genuine same-instant collision
  between the fresh check and the actual `ApproveDocument` call (e.g.
  another approver acting on it in that exact window, or the gap while the
  confirm dialog sits open waiting for a click). Detects the backend's own
  generic "unknown internal server error" wrapper text specifically, and
  when matched, shows a calm "X was likely just acted on by someone else -
  the list has been refreshed" message instead of the raw backend error -
  any other, genuinely unexpected error still shows the full
  `extractODataError` detail as before, so real backend bugs aren't
  silently swallowed by this softer message.
- Verified: `node -c` passes, `npm run build` passes. **Not yet confirmed
  in an actual browser or against a live backend** - no backend reachable
  this session. User should retry a bulk approve including at least one
  Budget they know has already moved on, and confirm it's silently
  excluded with a note rather than erroring, and that a normal bulk approve
  of genuinely-pending Budgets still succeeds as before.

### 111. CPE bulk-approve brought up to the same standard as Issue #110's Budget fix (fixed, 2026-11-06)
Files: `webapp/controller/ApprovalInbox.controller.js`.
- Follow-up to Issue #110 - user hit the CPE table's own old, flat
  `"Bulk approval failed. Please retry."` message (no detail at all) and
  pointed out the inconsistency: Budget had already been brought up to a
  clear, graceful standard, CPE hadn't. Agreed on bringing CPE in line with
  the exact same experience: pre-check fresh data before acting, quietly
  skip anything already handled with a plain note, never show a flat
  unexplained failure. Confirmed this is a general UX pattern, not a
  specific company/SAP standard - just applying it consistently to both
  tables.
- **Fixed in `onBulkApprove`:** now re-pulls the live CPE list
  (`_loadLiveCpeList()`) the moment the button is pressed, before building
  the confirmation dialog, and splits the selection into `aValid`/`aStale`
  via the new `_isCpeStillApprovable(sCpeId)` - the same "still actually
  approvable" condition `ApprovalDetail.controller.js` already uses for its
  own Approve/Reject/Hold/Rollout panel visibility (mirrors
  `_isBudgetStillApprovable` from Issue #110 for the CPE side). Only
  `aValid` is sent to `BulkApprove`; stale ones are named in the
  confirmation dialog and silently excluded. If everything selected turns
  out stale, skips the dialog entirely with a plain explanation, no
  backend call.
- **On failure**, reuses `_isGenericBackendError` from Issue #110 - the
  same generic "unknown internal server error" signature gets a calm
  "may have already been acted on by someone else" message; anything else
  shows the real `extractODataError` detail instead of the old flat
  message. **One real difference from Budget's fix, documented in a code
  comment:** `BulkApprove` is one true batch call to the backend (not
  Budget's sequential one-at-a-time loop), so a failure here can't point at
  which specific CPE caused it - only that the batch (already pre-filtered
  moments earlier) failed.
- Confirmed this change doesn't touch `onFilter`/`_onMatched` or any of the
  search/SLA/priority/docType filter logic (Issue #101/#107) at all - it
  only changes what happens when "Approve Selected" is pressed, after
  whatever's currently selected and visible under the active filters.
- Verified: `node -c` passes, `npm run build` passes. **Not yet confirmed
  in an actual browser or against a live backend** - no backend reachable
  this session. User should retry a CPE bulk approve including one already
  acted on elsewhere, and confirm it's quietly skipped with a note instead
  of the old flat failure message.

### 112. My Approvals follow-up discussion - single-table-with-dropdown idea rejected, "remove Approve Selected?" left open, KPI tiles confirmed to already cover both tables (2026-11-06, analysis/discussion only, no code touched)
- **Single table + Budget/CPE dropdown, rejected:** user proposed collapsing
  the two tables (Issue #101) back into one table with a dropdown to switch
  which type's data/columns show. Recommended against it: an approvals
  inbox hiding a whole document type behind a toggle risks the user
  forgetting to check it and missing something genuinely waiting on them -
  the reason real approval inboxes (SAP's own Fiori "My Inbox", Jira,
  ServiceNow) default to showing everything at once with filters to narrow,
  rather than a manual show-one-type-at-a-time toggle. Also flagged it
  wouldn't actually be less work to build - swapping column headers/cell
  bindings per dropdown value is effectively still two templates toggled
  under the hood, just hidden in one table control instead of two. **Not
  built - staying with the two-table layout.**
- **"Shall we remove Approve Selected?" - still an open question, not
  decided.** User's underlying concern was purely "it creates problems,"
  not an approval-governance one (some financial workflows deliberately
  avoid bulk-approve so each decision gets individually reviewed - raised
  as a consideration, but not the user's actual concern here). Recommended
  keeping it, since Issues #110/#111 already fixed the actual problem (the
  missing staleness check), not the feature itself - removing a now-fixed
  feature to avoid a bug that no longer exists would lose real value for
  routine small-CPE approvals. **User did not give a final answer either
  way before moving to the next question - flagged for next session to
  actually decide, not to assume "keep" just because that was the
  recommendation.**
- **Confirmed, not a bug:** the three SLA KPI tiles (On Track/At Risk/
  Breached) and the "Pending With Me" count/value in the header are built
  in `_load()` from the full combined inbox list - both CPE and Budget rows
  together - before the per-table `docType` split (Issue #101/#107) ever
  applies. The split only decides which of the two tables a row renders
  into; it has no effect on these KPIs. Clicking a KPI tile applies the
  same shared SLA filter to both tables at once (`onFilter`), same as
  typing into search or picking a Priority. No code change needed - this
  was already correct, just confirmed by reading `_load`/`onFilter`
  directly rather than assumed.

### 113. CPE Detail's own "Approval Chain" tab was reading the old mock approval>/history instead of live DOA data - fixed by sharing ApprovalDetail's live-chain logic (fixed, 2026-11-06)
Files: `webapp/controller/BaseController.js`, `webapp/controller/CPEDetail.controller.js`.
- User asked what shows in CPE Detail's "Financials" and "Approval Chain"
  tabs. Financials (IRR/NPV/Payback) was already correct - a snapshot from
  creation time, nothing to fix. Approval Chain was a real, confirmed bug:
  `CPEDetail.controller.js#_onMatched` built `detail>/chain` from
  `approval>/history` (the old mock/local structure), not from live data -
  meaning a real, live-created CPE would show "No approval history yet."
  on its own detail page even while genuinely progressing through real
  approvals, because `ApprovalDetail.controller.js`'s own live chain
  builder (`_buildLiveChain`, reading `config>/doaMatrix` by the CPE's
  `doaId`) was never reused here. The binding itself (`items="{detail>/chain}"`)
  was working correctly the whole time - it just had nothing real to render.
- **Fixed:** extracted the shared algorithm into
  `BaseController#buildLiveApprovalChain(sDoaId, sCurrentLevel, bFinal)` -
  identical logic to `ApprovalDetail.controller.js`'s own `_buildLiveChain`
  (and structurally the same as `BudgetApprovalDetail.controller.js`'s own
  Budget version), generalized to take the three primitive values instead
  of a whole CPE object so any screen can call it. `CPEDetail.controller.js`
  now calls `this.buildLiveApprovalChain(oCPE.doaId, oCPE.currentLevel,
  oCPE.status === "APPROVED")` instead of reading `approval>/history`.
  Deliberately left `ApprovalDetail.controller.js`'s and
  `BudgetApprovalDetail.controller.js`'s own existing private copies
  untouched rather than refactoring them to call the new shared method too -
  both are already live, working, and tested; only the new consumer
  (CPEDetail) was changed, to avoid any risk of regressing the two screens
  that were already correct.
- Verified: `node -c` passes on both files, `npm run build` passes.
  **Not yet confirmed in an actual browser** - no browser automation
  available this session; user should open a real, in-progress CPE's own
  Detail page (not the Approval Inbox's review screen) and confirm the
  Approval Chain tab now shows the real live timeline instead of "No
  approval history yet."

### 114. Approval Inbox: "Already Actioned" stale indicator added to both tables, plus auto-deselect so a stale row can't be selected at all (fixed, 2026-11-10)
Files: `webapp/controller/ApprovalInbox.controller.js`, `webapp/view/ApprovalInbox.view.xml`.
- Follow-up discussion to Issue #112's still-open "remove Approve Selected?"
  question. User proposed an alternative instead of removing bulk-approve
  outright: surface which rows are already stale directly in the table, so
  the user sees it before selecting anything rather than only discovering it
  via the confirmation dialog's "X already moved on" note (#110/#111). Also
  floated sorting newest-first - recommended against, since this inbox's SLA
  tracking (On Track/At Risk/Breached KPI tiles) depends on oldest-pending
  items staying visible, and newest-first would bury the ones closest to
  breaching. Not built; default sort left as-is. Issue #112's underlying
  "keep or remove Approve Selected" question is now effectively addressed by
  this fix rather than decided outright - the stale-selection problem that
  motivated considering removal is closed either way.
- **Added `formatIsStale(sDocId, sDocType)`:** reuses the exact same
  `_isBudgetStillApprovable`/`_isCpeStillApprovable` conditions the bulk-
  approve pre-checks (#110/#111) already treat as authoritative, so the
  indicator can never disagree with what actually happens at approve time.
  It's a soft hint only, computed from whatever's already cached locally in
  the cpe/budget models - not a fresh backend call per row render - so it
  can lag a few minutes behind reality on a long-idle screen.
- **View:** wrapped the Document ID cell (first column) in a `VBox` in both
  `tblInboxCpe` and `tblInboxBudget`, adding a second line - an
  `ObjectStatus` reading "Already Actioned" with a `sys-cancel` icon,
  visible only when `formatIsStale` is true. Deliberately did not add a new
  column, so column count/widths/alignment are unchanged from before this
  change - same pattern already used for the title/priority cell in column
  2.
- **Added `onInboxSelectionChange`**, wired to `selectionChange` on both
  tables: when a stale row gets checked - either a single click or via the
  header "select all" (`selectAll` true, every affected row in `listItems`
  at once) - immediately calls `setSelected(false)` on it and shows a toast
  naming which doc(s) got blocked ("X is already actioned and can't be
  selected."). Reuses `formatIsStale` itself rather than a separate check,
  so the badge and the selection-block always agree. `setSelected()` doesn't
  itself re-fire `selectionChange` (only the table's own built-in selection
  handling - a checkbox press or a `selectAll()` call - does), so this
  doesn't loop.
- Deliberately did not disable the row's checkbox/navigation outright or
  grey out the whole row - since the underlying check is a cache-based soft
  hint, not a live guarantee, treating it as a hard block on the full row
  (including drill-in to view the document) risked being wrong in the rare
  case the cache hasn't caught up yet. The live pre-check at approve-time
  (#110/#111) remains the actual authority; this just removes the confusing
  "I selected 5, only 3 got approved" moment by catching the common case
  earlier.
- Verified: `node -c` passes, `npm run build` passes. **Not yet confirmed in
  an actual browser** - no backend reachable this session. User should open
  the inbox with a row they know has already moved on, confirm the "Already
  Actioned" badge shows under its Document ID, confirm clicking its checkbox
  (and selecting via "select all") immediately unchecks it with a toast, and
  confirm a normal bulk-approve of genuinely-pending rows still works as
  before.

### 115. Functional-training Q&A - user building up a professional-level explanation of the whole CAPEX lifecycle, to use when explaining the app to end users (in progress, 2026-11-10, analysis/discussion only, no code touched)
- User doesn't have a strong background to explain this AI-built app's
  functional flow to end users, and asked to build that understanding
  properly rather than superficially. Agreed approach: interactive Q&A
  walkthrough first (ask a question, user answers, corrected/filled in with
  specifics grounded in the actual code - not just prose explanation),
  written reference guide at the end. Functional level, not developer level -
  explaining to users, not modifying code.
- **Published a 2-diagram reference artifact** before the Q&A started:
  https://claude.ai/artifact/1KWA3jX1Ad3poCN1aqx9tv ("CAPEX Approval Flow") -
  diagram 1 is the full lifecycle pipeline (Unit Quota → Budget → CPE +
  Evaluation → PO/GRN → CWIP → IC → Capitalization), diagram 2 zooms into the
  DOA approval-chain mechanism using a real 7-level CPE chain from
  MockData.js, including the exact "Already Actioned" decision-diamond
  mechanism built in Issue #114 - so the diagram doubles as documentation for
  that fix. Also covers Budget vs CPE (real IDs: B-2026-001, CPE-2026-0042)
  and a glossary (DOA, SLA, Unit Quota, CWIP, GRN/PO, IC, Audit Trail).
- **Q&A covered so far, verified against the actual code each time rather
  than assumed:**
  1. Budget vs CPE and the dependency direction (CPE raised against Budget,
     can't exceed what's left in it) - user got this right.
  2. What determines a document's approval chain - the **DOA Matrix**,
     resolved by `BaseController#resolveDOA` matching CapEx type, amount
     range (`amountFrom`/`amountTo`), and document type (CPE-specific rules
     win over generic `docType: ""` ones covering the same range). No
     matching rule = CPE blocked until the matrix is extended.
  3. The two live checks gating every approve action - `_isCpeStillApprovable`/
     `_isBudgetStillApprovable` (status still `IN_APPROVAL`, and
     `currentLevel` still matches the approver's own role or they're admin) -
     tied directly back to Issue #114's badge/auto-deselect/bulk-filter, all
     three driven by this one shared check.
  4/5. Budget availability math - confirmed via `BaseController#checkBudget`:
     **Available = Approved − Committed − Spent**, checked live as the amount
     is typed in CPE Create (`_runBudgetCheck`), not only as a submit-time
     error. Discussed why Committed is subtracted separately from Spent -
     without it, multiple approved-but-not-yet-PO'd CPEs could all pass the
     check against money already promised elsewhere (double-commitment).
  6. Traced one CPE's amount through Committed → Spent: confirmed directly
     from `BudgetDetail.controller.js#_wireKpiTiles` that the "Committed"
     KPI tile navigates to the PO List and "Spent" navigates to the GRN
     List - so a CPE amount is Committed once approved (PO not yet raised),
     and only flips to Spent once GRN posts (goods actually received).
  7. **Open, not yet answered** - why CWIP is tracked as a separate concept
     rather than capitalizing the asset the moment GRN happens. Flagged for
     next session: clarified first that CWIP isn't "Spent renamed" - it's
     the same spend watched through a second, parallel lens (asset still
     under construction) until the Installation Certificate triggers
     Capitalization, not a bucket Budget's own Committed/Spent fields
     transition into.
  7. Resumed after lunch: CWIP exists because GRN (goods received) is not
     the same as "ready for use" - installation/testing/commissioning still
     has to happen, and the Installation Certificate is what actually
     confirms the asset is operational before Capitalization. Also a real
     secondary reason confirmed in code: the Dashboard has its own "CWIP
     Pending Capitalization" KPI/ageing tracking, so there's a genuine
     monitoring value too, not just an accounting one.
  8. **Correction made to my own earlier (wrong) explanation from before
     lunch:** the DOA Matrix screen (`admin/doa`) is actually read-only +
     a simulator today - checked `DOAMatrix.controller.js` directly, no
     Add/Edit/Save function exists for rules, only filter/simulate/export
     (export itself a placeholder). A rule change would have to happen in
     backend config data, not through this screen as it stands. Also
     confirmed a DOA rule change is forward-only: `resolveDOA` runs once at
     submit time (`BudgetCreate.controller.js`/`CPECreate.controller.js`)
     and the resulting chain is saved onto that specific document - an
     in-flight Budget/CPE never picks up a later rule fix, and there is no
     "patch this document's chain" feature anywhere in the app; the only
     real-world fix is reject-and-resubmit outside the app's own tooling.
  9. Who else can act on a stuck approval (e.g. VP Operations on leave) -
     only an **Admin** (`oUser.isAdmin`), per `_isCpeStillApprovable`'s own
     condition. Confirmed via grep there is **no delegation/substitute-
     approver feature** anywhere in the codebase - flagged as a real,
     useful-to-know gap, not an oversight to explain away.
  10. **Unit Quota corrected from my own earlier (wrong) assumption** in the
     very first big-picture explanation (I'd originally called it "the
     ceiling above Budget" - wrong). Confirmed from
     `UnitQuota.controller.js` and its own i18n text: Unit Quota is a
     completely separate small-purchase track that explicitly **skips the
     DOA chain** ("Unit quota capex is approved at unit level and does not
     go through the DOA chain" - straight from the code), self-approved
     against an annual cap + a per-item cap (e.g. ₹2L/year, ₹50K/item).
     Discussed why both caps exist: per-item cap stops one big risky item
     sneaking through self-approval in one shot; annual cap stops splitting
     many small items to avoid real DOA scrutiny over the year. Confirmed
     it is still audited despite skipping approval -
     `onQuotaSubmit`/`addAudit("QUOTA", ...)` writes every item to the same
     shared Audit Trail.
  11. PO/GRN/CWIP real mechanics, corrected from an earlier simplification:
     `CWIPCreate.controller.js#onPushToSap` calls one backend function
     (`CreateCWIP`) that creates the Internal Order, the CWIP element, AND
     the Purchase Order together, right after CPE approval - its own
     success message says "The budget commitment has been updated in real
     time" at this exact step, meaning Committed updates at PO/CWIP
     creation, not merely at CPE approval as earlier stated (they just
     happen back-to-back in practice). GRN itself is never created in this
     portal - `GRNList.controller.js`/`PODetail.controller.js` are
     read-only, synced from real SAP MM ("Synced from SAP MM" on refresh).
  12. Reports screen is two-tier: an 8-item catalogue (Budget Utilisation,
     Approval Cycle Time, Vendor Selection, CWIP Ageing, Negotiation
     Savings, Unit Quota Consumption, Portal vs SAP Reconciliation,
     Compliance Audit Extract) that are all placeholders today -
     `onRunReport`/`onExportReport` just toast "once the backend is live" -
     plus genuinely live tables below reusing Dashboard's own rolled-up
     data (Budget vs Committed vs Spent by category, Approval Cycle Time by
     level). Clarified this is two *different* backend states: core
     document data (Budget/CPE/PO/GRN/Audit/Quota/DOA) is already live per
     a 2026-09-29 backend rebuild noted in `Component.js`; the Reports
     catalogue's "Gateway analytics service" doesn't exist at all yet, not
     just unconfigured.
  13. Audit Trail: flat cross-document log (BUD/CPE/PO/GRN/CWIP/IC/QUOTA),
     search + docType + date-range filters, drill-in only for
     BUD/CPE/PO/IC. Flagged a real security detail from
     `AuditTrail.controller.js#_stampPlants`: `AuditLogSet` carries no
     plant field of its own, so plant authorization is enforced by
     cross-referencing each row's `docId` back to its real source
     document's plant - a row whose source document can't be resolved
     fails closed (`plant: null`, matches no authorized-plant filter)
     rather than risking a leak.
  14. Dashboard: company/unit rollup **scoped to the current fiscal year**
     (not all-time), derived live from the same Budget/CPE/Inbox/CWIP/IC
     data other screens use, no separate backend call
     (`Dashboard.controller.js#_recalcRollup`). Confirmed two numbers are
     hardcoded to 0 in the code itself with `// no backend source yet`
     comments: Cycle Time and Savings YTD - genuinely not a bug when a user
     asks why they always show zero.
- **Not yet covered:** Capitalization/IC mechanics in detail, the DOA Matrix
  simulator in hands-on use, Evaluation screen specifics, roles/personas
  beyond what's already come up. Core lifecycle, DOA mechanics, Budget math,
  Unit Quota, PO/GRN/CWIP, Reports, Audit Trail, and Dashboard are now all
  solidly covered. Next step offered to the user: either keep going on the
  remaining areas, or stop here and have the whole Q&A turned into the
  written reference guide that was promised at the start.

### 116. All CPEs list: status tab counts (All/Draft/Under Evaluation/In Approval/Approved/Blocked) stuck at 0 until a manual refresh - same race class as Issue #97, just missed there (fixed, 2026-11-11)
Files: `CPEList.controller.js`.
- User reported landing on the "All CPEs" screen and seeing every status
  tab read `(0)` even though the table itself had real rows, until
  refreshing the page.
- **Root cause:** `_onMatched` calls `_updateCounts()` immediately, which
  computes each tab's count from a synchronous snapshot of `cpe>/list`
  (`readList`). `Component.js`'s live `_loadLiveCpeList()` read is
  asynchronous and may not have landed yet at that point (e.g. right after
  a hard refresh) - the snapshot is taken from the still-empty seed array,
  every count comes out 0, and nothing ever recomputes them afterward. The
  table itself still shows real data because it's live two-way bound
  (`items="{cpe>/list}"`) and re-renders on its own once the data arrives;
  the counts are a one-time JS computation, not a binding, so they stay
  frozen. This is the exact same bug class Issue #97 already fixed on 9
  call sites across 7 detail screens (plus Dashboard/ApprovalInbox) - this
  list screen's tab counts were the one place it was never applied.
- **Fixed:** `_onMatched` now also chains onto
  `this.getOwnerComponent()._pInitialLoad` (the same promise Dashboard/
  ApprovalInbox/Issue #97 already key off) and reruns `_updateCounts()` +
  `onFilter()` once it resolves, on top of the existing immediate call -
  normal in-app navigation (data already loaded) is unaffected, a fresh
  load now self-corrects instead of requiring a manual refresh.
- Verified: `node -c` passes. `npm run lint`/`npm run build` could not be
  run in this environment (no `node_modules`/network access here). Not yet
  confirmed in an actual browser - no browser automation available this
  session; user should hard-refresh while landing directly on "All CPEs"
  and confirm the tab counts are correct immediately.

### 117. ComboBox key-search gap (Issue #8/#92's class) found on two more filters - Audit Trail's Document Type and DOA Matrix's Capex Type simulator (fixed, 2026-11-11)
Files: `AuditTrail.controller.js`, `DOAMatrix.controller.js`.
- Found during a requested audit for more UI bugs, not a user report this
  time - checked every `ComboBox` in the app against the pattern Issue
  #8/#92 already identified (`sap.m.ComboBox`'s default suggestion filter
  only matches typed text against the item's displayed *text*, never its
  *key* - `BaseController#enableSearchByKeyOrText` already exists as the
  fix, applied so far to Plant dropdowns (5 screens) and CWIP Create's
  Asset Class dropdown).
- **Two more instances had the identical gap and were never covered:**
  - `AuditTrail.view.xml`'s `cbDocType` - items keyed `BUD`/`CPE`/`PO`/`IC`/
    `QUOTA` with differing display text (`Budget`/`CPE`/`Purchase Order`/
    `Installation Certificate`/`Unit Quota`) - typing a known doc-type code
    like "PO" found nothing.
  - `DOAMatrix.view.xml`'s `cbSimType` - identical `key="{budget>key}"
    text="{budget>text}"` structure as CWIP Create's Asset Class dropdown
    that Issue #92 already fixed, just on a different screen.
  - Checked and ruled out as not actually affected: `ApprovalInbox`'s SLA/
    Priority filters (key and text are short enough/close enough that the
    gap doesn't practically bite) and `CPECreate`'s Budget dropdown (its
    display text already starts with the budget id itself, so typing the
    id already matches the default text-prefix filter).
- **Fixed:** added `this.enableSearchByKeyOrText("cbDocType")` to
  `AuditTrail.controller.js#onInit` and
  `this.enableSearchByKeyOrText("cbSimType")` to
  `DOAMatrix.controller.js#onInit` - no new logic, just applying the
  existing shared helper to the two ComboBoxes it was missed on.
- Verified: `node -c` passes on both files. `npm run lint`/`npm run build`
  could not be run in this environment. Not yet confirmed in an actual
  browser - user should type a doc-type code into Audit Trail's filter and
  a capex-type code into DOA Matrix's simulator dropdown and confirm both
  now find a match.

## 2026-11-16

**Environment note:** `node_modules` is now present (wasn't in prior
sessions) - `npm run build` runs and succeeds this session, so every fix
below is verified against a real UI5 build, not just `node -c`. `eslint`
itself is still not installed (`npm run lint` → "eslint: not found"), and
browser automation is still not connected, so nothing below has been
clicked through in an actual browser - the dev server was started
(`localhost:8080`) but every verification is static (syntax/build), not
visual.

### 118. Functional Q&A - Budget/CPE visibility timing, "Mould Capex" nickname, Evaluation screen walkthrough started then paused (2026-11-16, analysis/discussion only, no code touched)
- **Budget vs CPE visibility timing, confirmed from code:** a submitted
  **Budget** goes `DRAFT` → `IN_APPROVAL` immediately
  (`BudgetCreate.controller.js:245-251`), so it appears in **My Approvals**
  (Approval Inbox) the instant it's submitted. A submitted **CPE** goes
  `DRAFT` → `UNDER_EVALUATION` first (`CPECreate.controller.js:833-896`,
  no `currentLevel`/DOA chain yet) and only reaches `IN_APPROVAL` once
  Technical/Procurement submit the evaluation
  (`Evaluation.controller.js:202-231`) - so a CPE shows in **All CPEs**
  immediately (under "Under Evaluation") but doesn't reach **My Approvals**
  until evaluation finishes. "All CPEs"/"All Budgets" show every document
  at every stage (plant + fiscal-year scoped only); My Approvals is a
  derived subset - `status === 'IN_APPROVAL' && currentLevel` matches the
  logged-in user's own role (`Component.js#_mergeCpeApprovals`/
  `_mergeBudgetApprovals`, `ApprovalInbox.controller.js#_load:89-97`).
  Admins/"Unit Initiator" see the whole queue regardless of role.
- **"Mould Capex" nickname - not a system name.** User's manager calls the
  portal "Mould Capex"; checked the codebase for this - no such name
  exists anywhere. "MOULDS" is just one of three CapEx type categories
  (`MANUFACTURING`/`MOULDS`/`IT`, `BaseController.js:676`,
  `MockData.js`), each with its own DOA threshold/internal-order prefix.
  Likely just informal shorthand since Moulds & Tooling capex may be the
  dominant category at the user's plant - confirmed with user, not
  pursued further.
- **Evaluation screen walkthrough - started, not completed.** User asked
  to understand the Evaluation screen (the stage between CPE submission
  and `IN_APPROVAL` - see above). A research pass was launched to read
  `Evaluation.controller.js`/`Evaluation.view.xml` in full, but the user
  asked to pause before it reported back ("wait until i tell you to do
  something"). **Flagged for next session - still genuinely not covered.**

### 119. IC Detail: commissioning photos had Download but no inline "View" - added, reusing the existing DocumentPreview fragment/dialog pattern (added, 2026-11-16)
Files: `webapp/controller/ICDetail.controller.js`, `webapp/view/ICDetail.view.xml`.
- User asked for a way to view a commissioning photo without leaving the
  page. Confirmed `webapp/view/fragment/DocumentPreview.fragment.xml`
  already exists and is already used by `CPEDetail.controller.js#onPreview`
  for a saved CPE's own attachments - this screen just never used it.
- **Fixed:** added `ICDetail.controller.js#onViewPhoto` (+
  `onDownloadFromPreview`/`onClosePreview` for the dialog's own buttons),
  mirroring `CPEDetail#onPreview` but simplified to always render as an
  `<Image>` - every commissioning photo is restricted to jpg/jpeg/png by
  the FileUploader's own `mimeType` attribute, so the PDF/iframe branch
  never applies here. Added an eye-icon `Button` next to the existing
  Download `Link` in each photo tile (`ICDetail.view.xml:171-182`).
- Verified: `node -c` passes, `npm run build` passes. Not confirmed in an
  actual browser this session.

### 120. IC Detail: the new View icon (Issue #119) only showed for an already-saved photo, not one just picked this session - fixed with an instant local preview (fixed, 2026-11-16)
Files: `webapp/controller/ICDetail.controller.js`, `webapp/view/ICDetail.view.xml`.
- User reported picking a photo and seeing only the "Replace" button, no
  eye icon. Root cause: the View/Download `visible` bindings both keyed off
  `detail>url`, which is only ever set by `_loadDocuments` once a real
  backend `DocumentSet` row is confirmed to exist - a file picked this
  session (before Save) only gets a `name`, never a `url`
  (`onPhotoFileChange`, deliberately, per its own existing doc comment).
- **Fixed:** added a new `previewUrl` field to each photo slot, separate
  from `url`. `onPhotoFileChange` now sets it to
  `URL.createObjectURL(oFile)` immediately (revoking any prior blob: URL
  first); `_loadDocuments` overwrites it with the real backend `url` once
  confirmed saved. The View icon's `visible` now checks `previewUrl`
  (works at both stages); Download's `visible` is untouched, still checks
  `url` only (deliberately stays backend-confirmed-only, same as before).
- Verified: `node -c` passes, `npm run build` passes. Not confirmed in an
  actual browser this session.

### 121. CPE Create document-type support clarified - functional's requirement (Excel/PDF/Doc) is already satisfied (2026-11-16, analysis only, no code touched)
- User asked what file types CPE Create's upload slots support, citing a
  functional requirement for Excel/PDF/Doc. Confirmed from
  `BaseController.js#validateFile:467-486` and `#formatFileTypes:550-553`:
  every attachment slot already accepts
  **pdf, xls, xlsx, doc, docx, jpg, jpeg, png, msg, zip**, up to 10 MB,
  both restricting the file picker (`fileType` on each `FileUploader`) and
  re-validating on pick. Both the extension list and max size are
  **backend-configurable** (`ZCAPEX_CONFIG` table, `DOC_MAX_MB`/
  `DOC_EXTENSIONS`, read in `Component.js:1116-1120`), only falling back to
  the list above if that config row doesn't exist. **No code change
  needed** - requirement already met.

### 122. CPE Create: added the same "View" eye icon to all 6 attachment slot groups - previously had no preview/download affordance at all (added, 2026-11-16)
Files: `webapp/controller/CPECreate.controller.js`, `webapp/view/CPECreate.view.xml`.
- Follow-up to Issue #119 - user asked if CPE Create's own document slots
  got the same treatment. Checked: RFQ ×3, Quotation ×3, TCC, Negotiation
  History, Justification Note, and General/Additional (6 `FileUploader`
  groups total) had **zero** view/download affordance of any kind, not
  even what IC Detail had before Issue #119 - picking a file only ever
  showed a "Selected: &lt;filename&gt;" text line.
- **Fixed:** added `previewUrl` to every attachment slot's data shape
  (`_buildEmptyAttachments`, `onAddGeneralAttachment`'s new-row default),
  set via `URL.createObjectURL` in `onAttachmentFileChange`/
  `_setAttachmentFile` (revoking the previous blob: URL first - also added
  to `onRemoveGeneralAttachment` and the "Single CPE" slot-shrink carry-over
  in `onSingleCpeChange`). Added `onViewAttachment` (+ `formatCanPreview`/
  `formatCanPreviewAttachment`, `onDownloadFromPreview`, `onClosePreview`),
  reusing the same `DocumentPreview` fragment as Issue #119/CPEDetail, but
  branching Image-vs-iframe by `fileType` since this screen's files aren't
  image-only like IC's photos. Repeating slots (RFQ/Quotation/General) read
  their own list binding context; TCC/Negotiation/Justification (fixed
  single paths, no list context) pass their slot key via `customData
  key="slot"` on the eye-icon `Button` instead. Added one eye-icon `Button`
  per slot group in the view, `visible` bound to both `previewUrl` and
  `fileType` via the two-part formatter.
- Only images/PDFs get the eye icon (`formatCanPreview`, same rule as
  CPEDetail's existing one) - Excel/Word/msg/zip never will, see Issue
  #123.
- Verified: `node -c` passes, `npm run build` passes. Not confirmed in an
  actual browser this session.

### 123. Inline Excel/Word preview - clarified as a browser limitation, not a Fiori or app gap; true fix needs backend/infra work outside this repo (2026-11-16, analysis only, no code touched)
- User uploaded an Excel file (Issue #122's new slots) and asked why the
  eye icon didn't appear, then asked whether this was a Fiori limitation.
  Clarified: browsers have a native renderer for images/PDF only - no
  browser (any framework) can render `.xlsx`/`.xls`/`.docx` inline without
  help. Confirmed `CPEDetail.controller.js#formatCanPreview` already
  applies the identical restriction to a *saved* CPE's attachments (real
  backend URL, not just a local blob:) - so this isn't stage-dependent
  (before vs after reaching SAP), it's file-type dependent at both stages.
- **Two real options to actually fix it, neither of them frontend-only:**
  Microsoft Office/Google Docs viewer embedded in an iframe (needs the file
  at a public, internet-reachable URL - won't reach this app's internal SAP
  backend or a local blob: preview at all), or server-side conversion to
  PDF at upload time (real ABAP work - the repo has a reference copy of
  `ZCL_ZCAPEX_PORTAL_DPC_EXT` with `DOCUMENTSET_CREATE_ENTITY`/
  `DOCUMENTSET_GET_ENTITYSET`, but no connection to the real SAP system
  exists in this session to develop/test/transport anything there).
  **Not built - flagged as a backend/infra scoping question for the
  functional team, not a same-session fix.**
- Confirmed separately: the inability to preview has **zero** effect on
  actually sending the file to SAP - `uploadDocument`/`validateFile` don't
  care whether a file is previewable, only whether its extension is
  allowed. An Excel file still uploads exactly like a PDF would on Save.

### 124. Commissioning Photographs restricted to jpg/jpeg/png only (no PDF) - confirmed deliberate, not an oversight (2026-11-16, analysis only, no code touched)
- User asked why a PDF can't be added as a commissioning photo. Confirmed
  `ICDetail.view.xml:187-188` hardcodes `fileType="jpg,jpeg,png"`/
  `mimeType="image/jpeg,image/png"` on that one `FileUploader`, unlike
  every other document slot in the app (which uses the shared,
  backend-configurable `config>/docExtensions` list - see Issue #121).
  Read as intentional: this section is literally three required
  **photographs** (installed equipment / nameplate / equipment in
  operation) used as physical proof of installation, not general
  documents - a PDF would defeat that purpose. **Not changed** - would
  need an explicit functional-team decision to broaden it, not a bug fix.

### 125. IC Detail: added a "Remove" (delete icon) per commissioning photo tile, matching CPE Create's existing "Additional Document" remove button (added, 2026-11-16)
Files: `webapp/controller/ICDetail.controller.js`, `webapp/view/ICDetail.view.xml`.
- User pointed out there was no way to clear an uploaded photo back to
  empty, only "Replace" (pick a different file immediately) - and pointed
  to CPE Create's `onRemoveGeneralAttachment` delete icon as the pattern
  they wanted mirrored.
- Checked first: **no screen in this app calls a real backend DELETE for
  any uploaded document** (ABAP has `DOCUMENTSET_DELETE_ENTITY`, but
  nothing in the frontend calls it anywhere), and CPE Create's own remove
  button is the same - purely local/session state, not a backend delete.
  Applied the identical scope here, not a bigger "delete from SAP" feature.
- **Fixed:** added `ICDetail.controller.js#onRemovePhoto` - resets a
  slot's `uploaded`/`name`/`url`/`previewUrl` back to empty (revoking any
  blob: URL first) and clears `_photoFiles[iIndex]`. Added a trash-icon
  `Button` next to the Replace `FileUploader`
  (`ICDetail.view.xml:183-192`), visible only when that slot is uploaded
  and the IC is still editable. **Known limitation, called out in the
  function's own comment:** clearing a photo that was already saved to SAP
  on a prior visit only hides it locally until the next reload brings it
  back - it does not delete the SAP-side document, same gap as every other
  "remove" in this app.
- Verified: `node -c` passes, `npm run build` passes. Not confirmed in an
  actual browser this session.

### 126. CPE Create: Committed/Spent KPI tiles made clickable (navigate to PO List/GRN List), plus a pre-existing bug this surfaced - the route always wiped the in-progress draft, which would have silently destroyed it on this exact round trip (added + fixed, 2026-11-16)
Files: `webapp/controller/CPECreate.controller.js`, `webapp/view/CPECreate.view.xml`.
- User asked whether Create CPE's four KPI tiles (Approved/Committed/
  Spent/Available) do anything on click - confirmed they don't, unlike
  `BudgetDetail`'s own Committed/Spent tiles which already navigate to PO
  List/GRN List (`BudgetDetail.controller.js#_wireKpiTiles`). Discussed
  with user why this makes sense business-wise (catching insufficient
  budget headroom before submitting, not after DOA review starts) and
  user asked to build it.
- **Fixed/added:** added `id="tileCpeCommitted"`/`id="tileCpeSpent"` +
  `sapMPointer` + "Open POs"/"Posted GRNs" footer text
  (`CPECreate.view.xml:55-62`, matching `BudgetDetail.view.xml:67-75`'s
  existing style) and a `CPECreate.controller.js#_wireKpiTiles` identical
  to `BudgetDetail`'s own (`attachBrowserEvent("click", ...)` -
  `sap.m.VBox` has no native `press` event).
- **Also found and fixed while verifying this wouldn't ship broken:**
  `CPECreate.controller.js#_onMatched` unconditionally calls
  `_resetDraft()` on every route match, keeping only `budgetId` - meaning
  clicking Committed/Spent and navigating back would have silently wiped
  the entire in-progress CPE (title/amount/vendors/attachments/everything
  except the budget). Added a `_bResumeDraft` flag, set right before the
  two new `navTo` calls and nowhere else, checked at the top of
  `_onMatched` to skip the reset only for this one round trip - every
  other way of reaching Create CPE still resets as before.
- **Correction to what was told to the user in-conversation:** first
  described this as navigating to a *filtered* PO/GRN list (just this
  budget's). Re-checked `BudgetDetail`'s own existing tiles and found they
  land on the **full, unfiltered** list too - explicitly flagged in that
  code's own comment as a known gap, neither list screen has a budget
  filter today. Built to match that existing behavior, not the filtered
  version first described.
- Verified: `node -c` passes, `npm run build` passes. Not confirmed in an
  actual browser this session - user should select a budget + fill a few
  fields on Create CPE, click Committed, confirm it lands on PO List, then
  navigate back and confirm the draft is still intact.

### 127. Budget Detail's empty "Financial Evaluation"/"Linked CPEs (0)" sections clarified - budget-specific, not a bug (2026-11-16, analysis only, no code touched)
- User asked what populates these two sections on a specific Budget's
  detail page. Confirmed from `BudgetDetail.controller.js#_onMatched:32-65`:
  **Linked CPEs** is a live filter over every CPE for
  `cpe.budgetId === thisBudgetId` - "(0)" means literally no CPE has been
  raised against this particular budget yet, updates automatically once
  one is. **Financial Evaluation** (IRR/NPV/Payback/cash-flow schedule) is
  this Budget's *own* data, entered at Budget Create time, not derived
  from its CPEs - empty here means either "Enable Financial Metrics" was
  left off for this budget (shows `i18n>metricsDisabledHint` instead of
  blank numbers) or it was on but no cash-flow figures were ever entered.
  **No code change needed** - both are correct, data-driven empty states.

### 128. Budget Create: Excel upload automated for multiple budgets in one file - grouped by Budget Title, each auto-saved as a draft (added, 2026-11-18)
Files: `webapp/controller/BudgetCreate.controller.js`, `webapp/i18n/i18n.properties`.
- User ask: uploading an Excel with multiple distinct Budget Titles should
  no longer just fill the on-screen form for the first budget found -
  every budget in the file should be created and saved as a DRAFT
  automatically, with fields filled the same way the single-budget path
  already does.
- Added `_bulkImportBudgets`/`_saveBudgetFromRows` to
  `BudgetCreate.controller.js`: groups `aDataRows` by Budget Title,
  builds one draft per group (same column mapping `_applyUploadedWorkbook`
  already used), computes IRR/NPV/Payback per budget (mirrors `onCalc`,
  there's no bound form to trigger it for a row group never loaded into
  the model), and calls `createEntity("/BudgetSet", ...)` for each -
  sequential chain via `isGuarded("bulkImportBudgets")`, one
  `addAudit`/toast summary at the end, reloads the live budget list once.
  Per-budget lookup failures (unrecognised Plant/Capex Type/Category) are
  tracked per group (not a shared array) so one budget's bad value doesn't
  get blamed on another in the summary toast.
- New i18n keys: `templateUploadBulkRowSkipped` (title/amount missing -
  that one budget is skipped, not the whole file).

### 129. Budget Create: removed the ₹5,00,000 per-line-item amount cap (removed, 2026-11-18)
Files: `webapp/controller/BudgetCreate.controller.js`, `webapp/view/BudgetCreate.view.xml`, `webapp/i18n/i18n.properties`.
- This was a UI-only rule, never enforced by the backend (its own
  original comment said so). User asked for it gone. Removed
  `ITEM_AMOUNT_CAP`, `formatItemAmountState`, the `_validate` check, the
  `valueState`/`valueStateText` binding on the item amount `Input`, and
  the now-unused `itemAmountCapExceeded` i18n key. Line items can now be
  any amount greater than zero.

### 130. Budget Create: single-Budget-Title Excel uploads now auto-save too, not just multi-budget files (extended, 2026-11-18)
Files: `webapp/controller/BudgetCreate.controller.js`.
- User reported: uploading an Excel with only **one** budget still just
  filled the on-screen form for manual review/Save Draft, unlike the
  multi-budget path above which auto-saves. Changed the routing condition
  in `_applyUploadedWorkbook` from `aUniqueTitles.length > 1` to `>= 1` -
  any file with at least one Budget Title now goes through
  `_bulkImportBudgets` (1 group or many, same code path). The old
  fill-the-form behaviour is now only a fallback for a file with **no**
  Budget Title column filled in at all (nothing to group by).

### 131. Budget Create: Funding Source simplified to a single option - "From Existing Internal Order" removed (removed, 2026-11-18)
Files: `webapp/view/BudgetCreate.view.xml`, `webapp/controller/BudgetCreate.controller.js`, `webapp/i18n/i18n.properties`.
- User ask: only "New Budget Allocation" should remain as a funding
  source choice on Create Budget. Same treatment as the earlier "Common
  Pool Bucket" removal (see #44) - removed the `RadioButtonGroup`/
  `inpSourceIO` controls (replaced with a plain read-only
  `zcpxReadonlyValue`-styled `Text`), `onFundingChange`, the
  `sourceInternalOrder` validation rule, and hardcoded `FundingSrc: "NEW"`
  / `SrcAufnr: ""` in `_buildBudgetPayload` (fields kept - permanent part
  of `BudgetSet`, same as `IsCommonpool`). Dropped the "Funding Source"/
  "Source Internal Order" columns from the downloadable Excel template
  and removed the now-unused `fsExistingIO` i18n key.
- Also separately fixed in this pass: the "Funding Source"/"New Budget
  Allocation" **alignment** on screen - a bare `Text` next to a `Label` in
  a `SimpleForm` row doesn't line up with the label's own padding; swapped
  its class from `sapUiSmallMarginTop` to `zcpxReadonlyValue`, the class
  this codebase already uses everywhere else for exactly this (Budget
  Detail, CPE Detail, Quota Item Detail, ...).

### 132. Budget Create: bulk Excel import now auto-SUBMITS for approval instead of auto-saving as a draft (changed, 2026-11-18)
Files: `webapp/controller/BudgetCreate.controller.js`, `webapp/i18n/i18n.properties`.
- User ask: after #128's bulk auto-save, now route each imported budget
  straight to approval instead of leaving it as DRAFT.
- `_saveBudgetFromRows` now calls `callFunction("SubmitDocument", {DocType:
  "BUD", DocId: sId})` right after `createEntity` succeeds. If the create
  itself fails, that budget is skipped entirely (as before). If create
  succeeds but submit fails (e.g. justification too short), the budget is
  **left as the DRAFT `createEntity` already made** rather than losing it
  - reported back as "created but not submitted," not silently dropped.
- `_bulkImportBudgets` now buckets results three ways - submitted /
  created-but-not-submitted / failed-to-create entirely - with a matching
  audit-trail entry and summary toast per bucket
  (`templateUploadBulkSuccess`/`templateUploadBulkWarning`/
  `templateUploadBulkMixed`). Updated the on-screen hint text to say
  "submitted for approval" instead of "saved as draft."

### 133. CPE Create: "Single CPE" checkbox renamed "Single Vendor" + a mandatory justification field added beside it, later wired to a new backend field (added, 2026-11-18)
Files: `webapp/view/CPECreate.view.xml`, `webapp/controller/CPECreate.controller.js`.
- User ask: rename the checkbox (display text only - kept the internal
  `singleCpe` draft key/`onSingleCpeChange` handler name to avoid touching
  unrelated bindings) and add a justification `Input` beside it, visible
  only when the box is checked, mandatory on Submit.
- Wrapped the checkbox + new `inpSingleVendorJustification` in an `HBox`;
  added `singleVendorJustification` to the draft; `_validate` now blocks
  Submit with "A justification is required when Single Vendor is checked"
  if left blank while checked (same pattern as the existing non-L1
  justification check) - Save Draft stays lenient, same as everywhere
  else in this screen.
- Initially frontend-only (matching `singleCpe` itself, which is **not**
  sent to the backend - a UI-only flag controlling RFQ/Quotation slot
  count, see #entry near 2026-11-06). **Backend later added a
  `SingleVendJust` field with no companion flag field needed** - updated
  `_buildCpePayload` to send
  `SingleVendJust: oDraft.singleCpe ? (oDraft.singleVendorJustification || "") : ""`.
  `singleCpe` itself still isn't sent - confirmed not required.

### 134. Deploy fix: an extensionless `thirdparty/LICENSE` file was silently breaking the SAPUI5 app-index registration step on every deploy (fixed, 2026-11-18)
Files: `ui5-deploy.yaml`.
- User reported a deploy failure: generic `SAPUI5 application ZCAPEX_PORTAL
  was not uploaded or registered successfully` (HTTP 400) at the
  "Updating the Application Index" step, with no further detail even from
  `/IWFND/ERROR_LOG`-style guidance in the tool's own output.
- Re-ran `npx fiori deploy --config ui5-deploy.yaml --verbose --yes` (this
  session runs *inside* BAS itself, with a working route to the `EDS`
  destination/`ppcuser:443` - confirmed via `http_proxy`/
  `DESTINATION_PROXY_URL` env vars and a live curl) - verbose log revealed
  the real cause: `Type of file thirdparty/LICENSE is unknown` (no
  extension, so the SAPUI5 ABAP repository service can't classify it as
  text/binary). Excluded it from the deploy bundle:
  `exclude: [ "/test/", "/thirdparty/LICENSE" ]`. Re-ran - **Deployment
  Successful.**
- **Lesson for next time a deploy fails with this generic message:**
  `--verbose` on the `fiori deploy` CLI (or `verbose: true` in the
  `ui5-deploy.yaml` customTask config) surfaces the real per-file upload
  log the plain error never shows.

### 135. CPE "Unit Technical" evaluation visibility/routing - full frontend implementation of backend change EDSK9B0EA7/task EDSK9B0EA8 (added, 2026-11-18)
Files: `webapp/controller/BaseController.js`, `webapp/controller/CPEDetail.controller.js`, `webapp/view/CPEDetail.view.xml`, `webapp/controller/Evaluation.controller.js`, `webapp/controller/CPECreate.controller.js`, `webapp/i18n/i18n.properties`.
- Backend rule (per a written spec the user pasted from the backend team):
  a CPE `UNDER_EVALUATION` is now visible/actionable in the backend only
  to its DOA chain's "Unit Technical *" approver(s), the initiator
  (read-only), or an admin - everyone else gets it omitted from lists and
  a 404 on a direct read. `DoaChainSet`/`resolveDOA` still return the raw
  chain **including** the Unit Technical row(s) - anything showing "who
  approves next" must skip it, since it's evaluation, not a repeated
  approval level.
- **Added to `BaseController.js`:** `isUnitTechnicalRole(sRole)` (regex
  case-insensitive prefix match) and `skipUnitTechnical(aChain)` (filters
  the row out and renumbers remaining `level`s so a rendered badge doesn't
  show a gap, e.g. 1,3,4).
- **`CPEDetail.view.xml`/`.controller.js`:** the footer Evaluate button
  was previously visible to *everyone* once `status === UNDER_EVALUATION`
  (no role check at all). Added `formatCanEvaluate(status, role, isAdmin)`
  bound via `app>/user/role`/`app>/user/isAdmin` (the `app` model already
  carries `CurrentUserSet` live, see `Component.js#_loadLiveUser`) -
  button now only shows for an admin or a "Unit Technical *" role.
- **`Evaluation.controller.js`:** `_onMatched` previously only checked the
  *locally cached* `cpe>/list` (stale-cache risk, e.g. right after
  clicking a notification for a CPE submitted since the list last
  loaded) and never checked status at all. Now force-reloads
  `_loadLiveCpeList()` first; not found → error + bounce to `cpeList`;
  found but not `UNDER_EVALUATION` → redirect to `cpeDetail` read-only.
  Also fixed the "it will go to X first" submit-confirmation text to use
  `skipUnitTechnical`.
- **Real bug found and fixed in the same pass:** the "mark not compliant,
  return to initiator" path in `onSubmitEvaluation` was **pure client-side
  `_writeBack("DRAFT")`** - it never actually called the backend at all,
  so the CPE's real server-side status never changed. Backend already has
  a working `ReturnCPE` function import
  (`zcl_capex_cpe=>return_cpe(iv_cpeid, iv_comment)`, confirmed from
  `ZCL_ZCAPEX_PORTAL_DPC_EXT`'s `EXECUTE_ACTION`) that was simply never
  wired up anywhere in the frontend. Wired it in; removed the now-dead
  `_writeBack` method entirely.
- **`CPECreate.controller.js`:** `_refreshDOA` now filters `doaPreview`
  through `skipUnitTechnical` (fixes both the visual DOA-chain-preview
  widget and the submit-confirmation text, which reads
  `doaPreview[0].role`). Removed the hardcoded `"Technical Team"` fallback
  and `"Technical and Procurement teams"` phrasing from the submit
  confirm dialog; the post-submit success toast now shows the backend's
  real `Message` from `SubmitCPE`'s result instead of a hardcoded
  "Routed to Technical and Procurement for evaluation" string.
- New i18n keys: `cpeNotAvailable`, `cpeNotUnderEvaluation`.
- Verified: `node -c` on every touched file, XML well-formed, full
  `npm run build` passes. **Deployed to `EDS`/`ppcuser`** (package
  `ZEMAMI`, transport `EDSK9B0EA7`) the same session - confirmed
  `Deployment Successful` in the `fiori deploy` output.
- **Not done, explicitly flagged as out of scope / lower priority:** the
  "Awaiting my evaluation" quick filter/tile (spec called it a nice-to-
  have), and adding a mock "Unit Technical Head" persona to `MockData.js`
  for testability in mock mode.
- **Open risk, never resolved this session:** the backend spec doc
  itself warned the local UI source may be older than what's actually
  deployed live - this was never independently verified one way or the
  other before building on top of this repo.

### 136. Quality: CPE Submit falling back to DRAFT - root-caused to the document-upload step failing (`POST .../DocumentSet` → 400), NOT a missing DOA-chain step as first guessed (2026-11-18, analysis only, nothing built)
- User reported: creating a CPE against a budget and clicking Submit in
  **Quality** (`emamiqa.emami.local` - a different system from `EDS`/
  `ppcuser`, not reachable from this sandbox, see #38/#39) leaves it as
  DRAFT instead of routing forward.
- **First hypothesis (plausible but unconfirmed):** Quality's
  `ZCAPEX_DOACHN` may be missing the "Unit Technical *" DOA-chain row
  entry 1's own spec doc explicitly required (#135) - same gap the spec
  doc said existed in `EDS` at the time it was written ("no such step
  exists in EDS, so nobody except an admin can evaluate"). Per-system
  master data, so fixing it in one system doesn't fix another.
- **Actual cause, confirmed once the user pasted the real network
  evidence:** `onSubmit` in `CPECreate.controller.js` uploads any attached
  documents **before** calling `SubmitCPE` (deliberately - "if the upload
  fails, SubmitCPE is never called") - the user's browser showed
  `POST .../DocumentSet` returning `400 Bad Request` with a **blank**
  response body. Since the upload step fails first, `SubmitCPE` (and by
  extension any Unit-Technical-chain check) is never even reached - the
  CPE stays DRAFT purely because of the failed upload, regardless of
  whether #135's DOA-chain prerequisite is satisfied in Quality or not.
  `isDocUploadEnabled()` is a heuristic ($metadata-based feature
  detection) that can say "yes, upload away" even when the backend can't
  actually store the file - matches the long-known gap already flagged in
  this log (document storage never fully implemented backend-side, see
  the open issue referenced throughout `CPECreate.controller.js`'s own
  comments).
- Blank response body on the 400 means the real reason is only in the
  backend's own log - told the user to check `/IWFND/ERROR_LOG` on
  Quality's Gateway for that request's timestamp; this session cannot
  read Quality's logs directly (no network route).
- **Nothing built/changed** - this was diagnosis only, the real fix (making
  Quality's backend actually accept/store the document, or fixing
  whatever rejects this specific upload) is backend-side.

### 137. Confirmed gap: no way anywhere in the UI to reopen and resubmit a DRAFT CPE - intentionally NOT built, blocked on one backend confirmation (2026-11-18, analysis only, nothing built)
- Surfaced while investigating #136 - once a CPE lands in DRAFT (whether
  from Save Draft or from a failed Submit), there is **no route, button,
  or screen anywhere** that lets a user get back into it and try Submit
  again. Confirmed via direct code read: `CPEDetail.view.xml`'s footer has
  no Submit/Edit button and nothing gates on `status === 'DRAFT'`;
  `CPEDetail.controller.js` has no `onSubmit`/`onEdit`/`onResubmit`
  handler at all; `manifest.json` has no `cpeEdit` route (only `cpeCreate`
  and `cpeDetail`); the CPE List's DRAFT tab is just a filter/count, not
  an action. **Budget has the exact pattern CPE is missing:**
  `budgetEdit` (`budget/{budgetId}/edit`) reopens `BudgetCreate` with the
  existing draft loaded via `_loadDraftForEdit`, and that edit flow relies
  on sending the existing `Budgetid` back in the create payload to update
  it in place rather than insert a new row.
- **Deliberately not built yet.** `zcl_capex_cpe=>create()` (the CPE
  equivalent) is called the exact same unconditional way in
  `ZCL_ZCAPEX_PORTAL_DPC_EXT`'s `CREATE_DEEP_ENTITY` as Budget's
  `zcl_capex_buddoc=>create()` is - but that method's *internal* logic
  (whether it checks for an existing `Cpeid` and updates in place, the
  way Budget's equivalent evidently does) isn't visible from the Gateway
  layer alone, and wasn't confirmed either way. Building the "reopen
  draft → resubmit" screen on a wrong guess here risks silently creating
  a **duplicate CPE** every time someone tries to fix a draft, which
  would be worse than today's "no button" gap.
- **Next step for whoever picks this up:** get backend/ABAP confirmation
  (or just test directly) - does `POST /CPESet` with an already-existing
  `Cpeid` update that record, or create a second one? Once that's known
  either way, the `cpeEdit` route + Resume Draft button + `CPECreate`
  load-existing-draft logic can be built safely, mirroring Budget's
  pattern.

### 138. CPE vendor screens: Total Cost of Ownership / Quality columns hidden (not removed) across all 4 places they appear (added, 2026-11-18, NOT yet deployed)
Files: `webapp/view/CPECreate.view.xml`, `webapp/view/Evaluation.view.xml`, `webapp/controller/Evaluation.controller.js`, `webapp/view/CPEDetail.view.xml`, `webapp/view/ApprovalDetail.view.xml`.
- User ask: hide (not delete) these two columns from "Add Vendor Quote."
  Investigated dependencies first - confirmed vendor ranking (L1/L2/L3),
  the three-quote rule, the non-L1-justification requirement, and DOA/
  approval routing all depend **only on `quote` (price)**, never on
  `totalCost`/`quality` - `_rankVendors` in `CPECreate.controller.js`
  sorts purely by `Number(v.quote)`; `rank` is computed once there and
  round-tripped verbatim everywhere else, never recomputed.
- **Chose hide-via-`visible="false"` over deleting the fields entirely** -
  simpler and safer: the data keeps its existing value/default under the
  hood (quality still defaults to 3, nothing becomes `undefined`), so
  `_buildCpePayload`'s `Totalcost`/`Quality` mapping (incl. the
  live-verified backend quirk that `Quality` must be sent as a raw
  unquoted number despite `$metadata` typing it a string, or the backend
  throws `CX_SXML_PARSE_ERROR`) needed **zero changes** - confirmed with
  the user explicitly: no backend change required for a hide.
- In `sap.m.Table`, setting a `Column`'s `visible="false"` auto-hides the
  matching cell at the same index in every row - no need to touch the
  `<cells>` templates themselves. Applied to all 4 screens' vendor tables
  (`CPECreate`, `Evaluation`, `CPEDetail`'s comparison table,
  `ApprovalDetail`). `CPEDetail` also has a separate card-view layout (not
  a `Table`) with its own quality-stars `Text` and TCO `HBox` row, hidden
  directly. Also hid the "Total cost of ownership includes freight,
  installation..." hint text (`Evaluation.view.xml`) - would otherwise
  reference an invisible column - and removed the "Quality X/5 vs L1 Y/5"
  sentence fragment from `Evaluation.controller.js#_evaluateVendorRule`'s
  non-L1 narrative (the only place with **no** graceful fallback - the
  "TCO saving/premium" wording elsewhere already degrades to the `quote`
  value via `||` and was left untouched, out of the agreed scope).
- Verified: `node -c`, XML well-formed on all 4 views, full
  `npm run build` passes. **NOT deployed this session** - still only in
  this local working tree as of this log entry.

### 139. "My Approvals" reported stale after Approve in Quality - verified all 4 approve paths (CPE/Budget × single/bulk) already refresh correctly in code; no bug found (2026-11-18, analysis only, nothing built)
- User reported: after approving a CPE in Quality, "My Approvals" still
  shows the old row. Checked every approve path in this codebase:
  - CPE single-approve (`ApprovalDetail.controller.js#onApprove`) and CPE
    bulk-approve (`ApprovalInbox.controller.js#onBulkApprove`) both
    explicitly reload `_loadLiveCpeList()` and refresh the table - both
    cite a previously-fixed bug (Open Issue #23) for this exact symptom.
  - Budget single-approve (`BudgetApprovalDetail.controller.js#onApprove`)
    and Budget bulk-approve (`ApprovalInbox.controller.js#onBulkApproveBudget`)
    mirror the same pattern with `_loadLiveBudgetList()`.
  - `ApprovalInbox.view.xml` confirmed the CPE/Budget split is two
    `Table`s (`tblInboxCpe`/`tblInboxBudget`) sharing one `inbox>/items`
    data source, separated only by a client-side `Filter` re-applied on
    every route match (`onFilter()`, called unconditionally from
    `_onMatched` - itself a past fix, Open Issue #107).
- **Conclusion: not a code bug in anything this session has access to.**
  All four refresh paths were already correct before today. If this is
  still reproducing live in Quality after a hard browser refresh, the
  likely causes are a stale cached JS bundle, Quality not actually running
  the version with the #23 fix, or a backend read-after-write timing gap
  - none of which are visible or fixable from this repo's code alone.

### 140. Session-wide note: what's actually live where, as of this log entry (2026-11-18)
- **Deployed to `EDS`/`ppcuser` this session** (via `npx fiori deploy`,
  confirmed `Deployment Successful` both times): everything through #135
  (Budget bulk-import/auto-submit, item-cap removal, Funding Source
  simplification, CPE Single Vendor justification + `SingleVendJust`
  payload mapping, the CPE Unit-Technical evaluation-visibility feature,
  and the `thirdparty/LICENSE` deploy fix).
- **NOT deployed this session, only in the local working tree:** #138
  (TCO/Quality hidden on the 4 CPE vendor screens).
- **`EDS`/`ppcuser` is a different SAP system from Quality**
  (`emamiqa.emami.local`, per #38/#39) - nothing confirms whether or when
  someone transported this session's `EDS` changes into Quality via the
  actual transport (`EDSK9B0EA7`) separately from this session's direct
  `fiori deploy` calls. The user said generally "we moved everything in
  quality" at the start of this stretch of conversation, but that move's
  exact scope/timing relative to today's specific changes was never
  pinned down.
- **Still unresolved/blocked, carried forward for whoever picks this up
  next:** #136 (document upload 400 in Quality - needs backend
  `/IWFND/ERROR_LOG` lookup), #137 (CPE resume-draft feature blocked on
  backend confirming update-vs-duplicate behaviour), and the
  never-independently-verified "local source may be older than deployed"
  warning from the original EDSK9B0EA7 spec doc (#135).

### 141. #137 resume-draft test — NOT run yet, paused on which record to use (2026-11-19)
- User confirmed they want the backend update-vs-duplicate question
  (#137) tested live rather than guessed at, before any resubmit-draft UI
  gets built. Plan agreed: POST `/CPESet` through the local dev proxy
  (`localhost:8080`, already running, PID left over from a prior session)
  with `Cpeid` explicitly added to the payload - something
  `_buildCpePayload` never sends today - pointed at a disposable-looking
  test record, `CPE-2026-0064` (Title "Machine", Budget "Bots Testing"/
  B-2026-010, Specs "This is tasting phase"). Will compare: does
  `CPE-2026-0064` itself change, or does a new `CPE-2026-00xx` appear.
  **Not yet executed** - paused for the user's final go-ahead on firing
  the live write; nothing sent to the backend yet this entry.

### 142. CPECreate "Add Vendor Quote" header/cell misalignment after #138 - root-caused and fixed: `visible="false"` left header space reserved while body cells fully collapsed; switched to removing the columns/cells outright (2026-11-19, fixed, NOT yet deployed)
Files: `webapp/view/CPECreate.view.xml`, `webapp/view/Evaluation.view.xml`,
`webapp/view/CPEDetail.view.xml` (scorecard `Table` only - the separate
card-view vendor layout was already safe, see below), `webapp/view/
ApprovalDetail.view.xml`, `webapp/controller/CPECreate.controller.js`,
`webapp/controller/Evaluation.controller.js`, `webapp/css/style.css`.
- User reported (screenshot `Alignment.png`): on CPECreate's vendor table,
  the QUOTE header sits over blank dead space, and the Quote `Input` box
  renders to its left instead of underneath it - same for the gap between
  VENDOR and QUOTE generally.
- **Root cause:** #138 hid the Total Cost / Quality columns via `Column
  visible="false"`, while leaving them (and their matching cells) in the
  markup. In this app's UI5 build, that left the **header row** still
  reserving blank space for the two hidden columns, while the **body
  cells** for those same columns fully collapsed out of the row's layout
  - so the header and body stopped agreeing on where each remaining
    column's content should sit. Confirmed via direct code read (all 4
  screens use the identical index-matched `<columns>`/`<cells>` pattern)
  plus the screenshot; no live browser access in this sandbox to watch it
  happen, but the fix below eliminates the mechanism entirely rather than
  patching around it.
- **Fix: removed the Total Cost / Quality `Column`s and their matching
  `<cells>` entries outright** (rather than toggling `visible`) on all 4
  Table-based vendor screens - there is no "hidden column" left to drift
  out of sync, so this class of bug can't recur here. Confirmed this is
  equally safe for the backend-payload concern #138 already established:
  `_buildCpePayload`/vendor JSON model still carries `totalCost`/`quality`
  with their existing defaults regardless of what the *view* renders -
  removing a UI control doesn't touch the underlying model data.
- **Cleaned up now-dead code this left behind** (per no-half-finished-code
  convention): removed `onQualityStarPress` (`CPECreate.controller.js`)
  and its `.zcpxQualityStars`/`.zcpxQualityStars .sapUiIcon` CSS
  (`style.css`) - that handler only existed to drive the now-deleted
  5-star rating control, and vendor quality already defaults to `3` at
  vendor-add time (`CPECreate.controller.js:634`) independent of star
  clicks, so removing it doesn't change what gets sent to the backend.
  Also removed `formatTcoState`/`oDetail.lowestTco`
  (`Evaluation.controller.js`) - only ever fed the now-deleted TCO
  `ObjectNumber` cell in `Evaluation.view.xml`.
- **Deployed 2026-11-19 (later, with #143) via `npm run deploy`** - see
  #144.
- **Left untouched, confirmed still safe:** `CPEDetail.view.xml`'s
  separate card-view vendor layout (`zcpxVendorCardHost`, not a `Table`)
  already hid TCO/quality via `visible="false"` on individual `Text`/
  `HBox` controls with no header row or column-index pairing involved -
  no equivalent desync is possible there, so it was left exactly as #138
  built it.
- Verified: `node -c` on both touched controllers, XML well-formed on all
  4 views, full `npm run build` passes clean. **NOT deployed this
  session** - still only in this local working tree, same as the rest of
  #138's unshipped work. **Not verified in an actual rendered browser
  either** - no browser automation available in this sandbox; the user
  should refresh and re-check against `Alignment.png`'s scenario before
  this is considered fully confirmed.

### 143. Follow-up to #142: VENDOR/QUOTE header labels pinned to the far-left/far-right edge of their now-wider columns - centered the header text only (2026-11-19, fixed, NOT yet deployed)
Files: `webapp/view/CPECreate.view.xml`, `webapp/view/Evaluation.view.xml`,
`webapp/view/CPEDetail.view.xml`, `webapp/view/ApprovalDetail.view.xml`.
- User reported, after #142's fix: the VENDOR/QUOTE column headers aren't
  centered in the middle of their columns anymore - expected side effect
  of #142 freeing up the width previously split 3 ways (VendorName/Quote/
  TotalCost) down to just 2, so VendorName (default left-align) and Quote
  (`hAlign="End"`, right-align) now sit visibly pinned to the left/right
  edge of a much wider column than before.
- **Fix:** added `textAlign="Center"` directly to the header `<Text>`
  inside each VendorName/Quote `Column`, on all 4 screens - centers only
  the header label. Deliberately left each `Column`'s own `hAlign`
  unchanged (Quote stays `hAlign="End"` for its data cells) so the actual
  Quote amounts keep the right-aligned numeric convention used everywhere
  else in this app - only the header word moved, not the data underneath
  it.
- Verified: XML well-formed on all 4 views, full `npm run build` passes
  clean. **Deployed 2026-11-19 (later) along with #142** - see #144. Still
  **not verified in an actual browser** - same no-browser-automation
  limitation throughout this session; needs the user's visual
  confirmation on next refresh.

### 144. Deployed #138/#142/#143 (TCO/Quality removal + alignment fix) to `EDS`/`ppcuser` (2026-11-19, later)
- User asked to deploy. Ran `npm run deploy` (`ui5 build --clean-dest` +
  `npx fiori deploy`). Two interactive CLI prompts came up and were
  confirmed: the pre-existing `minUI5Version (1.71.1) is below the
  minimum (1.128.0) required by the app descriptor schema` warning (not
  related to today's changes, has shown up across sessions - confirmed
  through it since it's never blocked a deploy), and the standard
  "Start deployment?" confirmation (target: `ZCAPEX_PORTAL` / package
  `ZEMAMI` / transport `EDSK9B0EKZ` / destination `EDS`).
- **Confirmed `Deployment Successful`** - delta upload, 134 files in
  archive, app available at
  `http://ppcuser:443/sap/bc/ui5_ui5/sap/zcapex_portal` (on-premise via
  Cloud Connector, so the real reachable host differs from that literal
  URL, same caveat noted every other deploy this project).
- This push carries everything currently in local `webapp/` source,
  which includes #138 (TCO/Quality hidden - now actually removed
  outright per #142) and #143's header-centering fix. Nothing else in
  this session's conversation was pending deploy beyond those three.
- **Still not visually confirmed in a real browser** - no browser
  automation available in this sandbox all session; next step for
  whoever's online is to refresh the live app and confirm the vendor
  table now looks right (no header/data drift, VENDOR/QUOTE centered,
  TCO/Quality gone).
- **Carried forward, unchanged by this deploy:** #136 (document-upload
  400 in Quality), #137 (CPE resume-draft blocked on backend confirming
  update-vs-duplicate - a question was drafted this session to send to
  the backend developer, not yet answered; the live curl test against
  `CPE-2026-0064` was also proposed but never actually run).

### 145. #137 answered by the backend developer directly - confirmed (b): CPE create always inserts a new row, never updates a draft. Explains the CPE-2026-0003..0006 duplicate cluster in QA. Backend fix proposed, pending user's go-ahead in EDSK9B0EKZ (2026-11-19, later, analysis + decision only, nothing built yet)
- Backend developer read the actual ABAP and reported back (no live curl
  test from this session was needed in the end - this answers #141/#137
  directly from source instead):
  - **`Save Draft`:** `POST /CPESet` → `ZCL_CAPEX_CPE=>CREATE` always
    draws the next number - saving twice gives two separate drafts (e.g.
    `CPE-2026-0003` and `CPE-2026-0004`). Matches this session's own
    earlier code-read finding that `_buildCpePayload` never sends
    `Cpeid` at all.
  - **`Submit`:** also does `POST /CPESet` first (new ID), then calls
    `SubmitCPE` on *that* new ID - never the original draft's ID.
  - **Reopen a draft:** confirmed no path exists anywhere in the UI
    (matches this session's #137 finding) - list page only has "Create
    CPE", no load-into-form logic.
  - **Root cause of the QA duplicate cluster** (`CPE-2026-0003` through
    `-0006`, same budget/title): confirmed these are duplicate drafts
    from repeat Save/Submit attempts, not edits of one record - direct
    confirmation of the exact risk #137 flagged before building anything
    blind.
  - **`ZCL_CAPEX_CPE=>UPDATE` / DPC `UpdateEntity` already exist** and
    can update a DRAFT/BLOCKED CPE in place - but **header fields only**
    (title, delivery weeks, metrics, hurdle rate, investment, non-L1
    justification). **Skip vendors and cash flows entirely. Not wired
    into the UI at all today** - nothing calls it.
  - `SubmitCPE` called directly against an *existing* ID does correctly
    submit that same record (backend-side, confirmed) - the gap is
    entirely that the frontend's `onSubmit` never takes that path.
- **Backend developer's proposed fix:** extend the create/update path so
  that when the payload carries an existing `Cpeid`, it updates that
  draft in place **and replaces its vendors and cash flows too** (goes
  further than today's `UPDATE`, which skips those) - same update-in-
  place pattern Budget already has, extended to cover CPE's vendor/
  cash-flow child data. Asked whether to make this change in transport
  `EDSK9B0EKZ` (same transport this session's other CPE work is already
  in).
- **Decision: told the backend developer to go ahead with the change in
  `EDSK9B0EKZ`.**
- **Frontend work this unlocks, NOT built yet - next session's starting
  point for #137:**
  1. A `cpeEdit`-style route + "Resume Draft" entry point (CPE list/
     `CPEDetail` currently have neither), mirroring Budget's
     `budgetEdit`/`_loadDraftForEdit` pattern.
  2. `_buildCpePayload` needs to include `Cpeid` when editing an
     existing draft (confirmed this session it never does today).
  3. The existing draft's vendors/cash flows need to load back into the
     `CPECreate` form on reopen - no such load-existing-vendors logic
     exists there now.
- **Do NOT build any of the 3 above until the backend developer confirms
  the extended `UPDATE`/create-with-existing-ID change is actually live**
  - building the UI side first, against the current backend (create-
    only, no vendor/cash-flow update), would reproduce the exact
    duplicate-creation bug this entry just diagnosed.
- **Status as of 2026-11-19, later still: user has relayed the full spec
  to the backend developer** (header update + replace vendors + replace
  cash flows when an existing `Cpeid` is passed, transport
  `EDSK9B0EKZ`), **and the backend developer has accepted it and is
  implementing it now.** Not yet confirmed deployed/live.
- **Next step, whoever picks this up next:** wait for the backend
  developer to confirm the change is live in `EDSK9B0EKZ`, then build the
  3 frontend pieces listed above (#137's `cpeEdit` route, `Cpeid` in
  `_buildCpePayload`, load-existing-vendors-on-reopen). Still do not
  build any of it against the current (unfixed) backend.

### 146. Built the simple half of #137 now, independent of the backend change: a direct "Submit" button on CPEDetail for DRAFT CPEs, calling SubmitCPE on the existing Cpeid (2026-11-19, later, built, NOT yet deployed)
Files: `webapp/view/CPEDetail.view.xml`, `webapp/controller/CPEDetail.controller.js`.
- Realized while planning #145's frontend work that the original ask
  ("if Submit fails and it goes to DRAFT, let the user submit it again")
  splits into two genuinely different features, only one of which needs
  the backend change in progress:
  1. **Plain retry-submit, no edits** - needs only `SubmitCPE` to work
     against the existing `Cpeid` directly. The backend developer
     already confirmed this works correctly today (#145) - the
     duplicate problem is specific to the *create* path, which this
     doesn't touch at all.
  2. **Edit vendors/amount, then resubmit** - this is the one genuinely
     blocked on #145's in-progress backend change (replace vendors/cash
     flows on an existing `Cpeid`). Still not started.
- **Built #1 now, deployable independently of #145's backend work:**
  added a `{i18n>submit}` button to `CPEDetail`'s footer, `visible="{=
  ${detail>/status} === 'DRAFT' }"` (identical condition/pattern to
  Budget's own `onSubmitPress` button on `BudgetDetail`), wired to a new
  `onResubmit` handler. It confirms, then calls `callFunction("SubmitCPE",
  {CpeId, BudgetId, Amount, PoolBudgetId, PoolAmount})` - the exact same
  call shape `CPECreate.controller.js#onSubmit` already uses, minus the
  `createEntity` step and the document-upload step. All 5 fields it needs
  (`cpeId`/`budgetId`/`amount`/`poolBudgetId`/`poolAmount`) already exist
  on the `detail` model via `Component.js`'s live-list mapping - no new
  data loading required.
- **Deliberately does not re-attempt any document upload** - if a draft
  is stuck here because of #136's upload-400 class of failure, the
  Documents tab on this same page already has its own independent
  Upload/`onConfirmUpload` flow; the expectation is the user attaches
  whatever's missing there first, then presses this new Submit button.
  Kept the two concerns separate rather than reimplementing CPECreate's
  upload-then-submit chain a second time here.
- On success: audit log entry, live CPE list reload, success toast
  showing the backend's own `Message`, nav to `cpeList` - same shape as
  every other submit-style handler in this codebase. On failure: guard
  released, `extractODataError` shown - the draft stays exactly as it
  was, so the button can just be pressed again.
- Verified: `node -c` on the controller, XML well-formed, full `npm run
  build` passes clean.
- **Deployed 2026-11-19 (later still) via `npx fiori deploy`** - confirmed
  `Deployment Successful`, delta upload of just 3 files
  (`CPEDetail.controller.js` + its `-dbg`/`.map`, `CPEDetail.view.xml`,
  plus the regenerated `Component-preload.js`) - confirms #142/#143 were
  already live from the earlier deploy (#144) and only this entry's
  change was new. Same transport `EDSK9B0EKZ`, same `minUI5Version`
  warning confirmed through as before (pre-existing, unrelated).
  **Still not verified in an actual browser** - no browser automation
  available in this sandbox all session; next person online should open
  a DRAFT CPE and confirm the new Submit button appears and works.
- **Still not built, still correctly blocked on #145's backend change:**
  feature #2 above (edit-then-resubmit) - the `cpeEdit` route, `Cpeid` in
  `_buildCpePayload`, and load-existing-vendors-on-reopen all remain
  undone, on purpose, until the backend developer confirms the extended
  update is live.

### 147. Small amounts were showing as an awkward fraction of a Crore (e.g. "0.50 Cr") instead of Lakhs - swapped hardcoded `inCrores` for the existing auto-scaling `money` formatter on Dashboard/Reports/Capitalization/Approval Inbox (2026-11-19, later still, fixed, NOT yet deployed)
Files: `webapp/view/Dashboard.view.xml`, `webapp/view/Reports.view.xml`,
`webapp/view/Capitalization.view.xml`, `webapp/view/ApprovalInbox.view.xml`,
`webapp/controller/Dashboard.controller.js`, `webapp/controller/Reports.controller.js`.
- User ask: small amounts should display in their natural scale (Lakhs),
  only large amounts should switch to Crores - not force every amount
  through a Crore conversion, which makes a small one read as an awkward
  "0.50 Cr" instead of "50.00 L".
- `webapp/model/formatter.js` already has exactly this auto-scaling
  formatter (`money` - Lakhs below ₹1 Cr, Crores at/above it,
  `Dashboard.view.xml:205` was already using it on one row), it just
  wasn't used consistently - several screens called the
  always-Crores `inCrores` formatter directly instead.
- **Fix: replaced every direct `.formatter.inCrores` call with
  `.formatter.money`** across Dashboard (hero totals + all 7 KPI tiles),
  Reports (`formatBalance`/`formatTrendText` + 3 view bindings),
  Capitalization (summary header + KPI tile), and Approval Inbox
  (summary header) - 19 call sites total (13 XML bindings + 1 XML
  already-correct + 2 controller formatters each with 2 calls). Also
  updated `Dashboard.controller.js#formatSpentOfApproved`'s stale
  docstring example (was `"₹95.00 Cr of ₹180.00 Cr"`, now documents that
  each side auto-scales independently).
- `inCrores`/`inLakhs` themselves are unchanged - `money` is just a thin
  wrapper choosing between them by magnitude, so this is a pure display
  change with no effect on any stored/sent value. `inCrores` is no longer
  called directly anywhere outside `money`'s own implementation, but
  isn't dead code - `money` still needs it internally.
- Verified: `node -c` on both controllers, XML well-formed on all 4
  views, full `npm run build` passes clean. **NOT deployed this entry -
  not verified in an actual browser** - same no-browser-automation
  limitation as the rest of this session.

### 148. #146's onResubmit silently did nothing - double isGuarded() call made it a dead no-op (bug report from backend dev, task EDSK9B0ELF; fixed 2026-11-19, later still)
File: `webapp/controller/CPEDetail.controller.js`.
- **Bug report from the backend developer**, read from the deployed DEV
  code (not reproduced in a live browser, but matched both their
  symptoms exactly): `isGuarded()` in `BaseController` is test-and-set -
  it sets the flag and returns `false` the *first* time it's called,
  `true` every time after until released. #146's `onResubmit` called it
  **twice** - once at the top of the handler (setting the flag), and
  again at the start of the confirm Yes-callback (which then always read
  "already guarded" and returned immediately, before ever calling
  `SubmitCPE`). Net effect: press Submit, confirm Yes, nothing happens -
  no request, no error, and the button stays dead afterward since the
  flag was never released. Pressing No left the flag set too, same dead
  state.
- Root cause was copying the "check once at the top, check again before
  acting" shape from `CPECreate.controller.js#onSubmit` without noticing
  that one uses a plain `this._bSaving` boolean (its outer check is a
  pure read, only *set* inside the Yes-callback) while this handler used
  `isGuarded()`, which sets as a side effect of the read itself - the two
  guards aren't equivalent and don't compose the same way.
- **Fix, exactly as the backend developer specified:** removed the
  top-of-handler `isGuarded` call entirely; kept the single check inside
  the Yes-callback only. Confirmed `confirm()` (`BaseController.js:166`)
  has no No-callback at all - it only invokes `fnYes` when the user picks
  YES - so with the guard moved fully inside that callback, pressing No
  never calls `isGuarded` in the first place and never sets the flag, no
  separate release needed for that path. `releaseGuard` in the success
  and error paths left untouched, as instructed.
- **What this means for #136/#137:** the backend developer's note that
  "the backend document check is still unverified - no request ever
  reached the backend" stands - every previous resubmit attempt through
  this button silently no-opped before any network call, so nothing
  about #136's root cause has actually been exercised against this path
  yet. That verification is still open.
- Verified: `node -c`, full `npm run build` passes clean. This is the fix
  the backend developer asked to be the final one for `onResubmit`
  specifically - should be retested per their exact steps (Submit → Yes
  → confirm `SubmitCPE` fires; Submit → No → confirm the button still
  works afterward).
- **Deployed 2026-11-19 (later still) via `npx fiori deploy`** - user
  provided a **new transport, `EDSK9B0ELG`** (not the `EDSK9B0EKZ` used
  by every earlier deploy this session), so `ui5-deploy.yaml`'s
  `transport` was updated to match before deploying. Confirmed
  `Deployment Successful`. This push also carried #147 (the
  Dashboard/Reports/Capitalization/Approval Inbox `money`-formatter
  swap), which was still pending deploy from earlier in the session.
  **Still not verified in an actual browser** - no browser automation
  available in this sandbox all session; next step is for someone to
  actually run the backend developer's retest steps above, since that's
  the first time this path will have a real chance to reach the backend
  and actually exercise #136's document-upload question.
- **Note for next session: `ui5-deploy.yaml` now points at `EDSK9B0ELG`,
  not `EDSK9B0EKZ`** - if a new transport is issued again later, update
  that file's `transport` value before deploying, the same way this
  entry did.

### 149. "My Approvals" Budget detail screen showed only the DOA chain and a free-text justification - no line items or financial metrics for the approver to actually evaluate - added both, reusing BudgetDetail's existing data/markup (2026-11-19, later still, fixed, NOT yet deployed)
Files: `webapp/view/BudgetApprovalDetail.view.xml`, `webapp/controller/BudgetApprovalDetail.controller.js`.
- User reported (screenshot `My Approvals.png`, taken against Quality -
  `emamiqa.emami.local`, a different system from this session's `EDS`
  sandbox - route `#/approvals/budget/B-2026-006`): entering a budget's
  row from "My Approvals" showed the approval-chain flow diagram and
  Approve/Reject, but no actual budget detail - no line items, no
  financial breakdown - for the approver to base a decision on.
- Confirmed by reading `BudgetApprovalDetail.view.xml` (untracked, newer
  file than most of this session's other work): it only had Header →
  Approval Chain → Justification (free text) → Decision. Compared
  against `BudgetDetail.view.xml` (the non-approval detail page, which
  already has a "Details" tab with a Budget Items table and a
  "Financials" tab with IRR/NPV/Payback + a discounted cash-flow table) -
  confirmed none of that exists on the approval screen.
- **Confirmed the data was already there, just not rendered:**
  `BudgetApprovalDetail.controller.js#_onMatched` already does
  `Object.assign({}, oBudget, {...})`, the same live-mapped record
  `BudgetDetail.controller.js` uses - `items`/`irr`/`npv`/`payback`/
  `hurdleRate`/`metricsEnabled` were already on the `detail` model with
  nothing displaying them. Only `cashFlowRows` (a *computed* table, not a
  raw field) was actually missing from the model.
- **Fix:** ported `_buildCashFlowRows` and the 5 related formatters
  (`formatIrr`/`formatNpv`/`formatPayback`/`formatHurdleFoot`/
  `formatItemsTotal`) from `BudgetDetail.controller.js` into
  `BudgetApprovalDetail.controller.js` verbatim (duplicated rather than
  shared - the two controllers have no common base beyond
  `BaseController`), and added `cashFlowRows` to the `Object.assign` in
  `_onMatched`. Added two new sections to the view, inserted between
  Justification and Decision, using the exact same markup/bindings as
  `BudgetDetail.view.xml`'s Details/Financials tabs: a Budget Items table
  (hidden entirely when there are none, same convention as
  `BudgetDetail`) and a Financial Metrics card (IRR/NPV/Payback +
  discounted cash-flow table, with the same "metrics disabled" message
  strip when `metricsEnabled` is false).
- Did **not** add the "Linked CPEs" or "Audit Trail" tabs `BudgetDetail`
  also has - scoped to what's directly relevant to an approve/reject
  decision (what's being funded and whether the financial case holds
  up), not a full port of every `BudgetDetail` tab.
- No new i18n keys needed - every key used (`budgetItems`, `itemNo`,
  `financialMetrics`, `cashFlows`, etc.) already existed from
  `BudgetDetail.view.xml`'s own use of them.
- Verified: `node -c` on the controller, XML well-formed, full `npm run
  build` passes clean.
- **Deployed 2026-11-19 (later still) via `npx fiori deploy`** - user
  provided another new transport, `EDSK9B0ELR` (already updated on disk
  in `ui5-deploy.yaml` before this entry, not by this session's own
  edit). Confirmed `Deployment Successful`, delta upload of exactly the
  `BudgetApprovalDetail` files (controller + `-dbg`/`.map`, view, plus
  the regenerated `Component-preload.js`). **Still not verified in an
  actual browser** - no browser automation available in this sandbox all
  session; also worth repeating: this screen was being viewed against
  **Quality** (`emamiqa.emami.local`) in the user's screenshot, not
  `EDS`/`ppcuser` - this deploy only reached `EDS`. Still need to confirm
  whether/when this also needs to land in Quality separately (see
  #38/#39's standing note that the two are different systems).
- **CPE's own approval detail screen was not affected and did not need
  this fix** - `ApprovalDetail.view.xml` (CPE's equivalent page) already
  has its own Vendor Comparison and Financial Metrics sections; this gap
  was specific to the newer, less-complete `BudgetApprovalDetail`.
- **User confirmed: this will be moved to Quality separately** - a
  transport release/import step on the Basis/transport-management side,
  outside what this sandbox can do (no network route to
  `emamiqa.emami.local` here, same limitation as #38/#39). Carry forward
  as open until confirmed live on Quality.

### 150. Added a PO Number column to the "All CPE" list, hyperlinked to PO Detail (2026-11-19, later still, built, NOT yet deployed)
Files: `webapp/view/CPEList.view.xml`, `webapp/controller/CPEList.controller.js`.
- User ask (screenshot `All CPE.png`, red mark between BUDGET ID and
  CPE AMOUNT): add a PO Number column there, mapped from the Purchase
  Order record raised for that CPE, and make it a hyperlink to the PO
  Detail page (same pattern the existing Budget ID column already uses
  with `onBudgetPress`).
- Confirmed the join first: `PurchaseOrderSet` rows (`procure>/po`,
  mapped in `Component.js#mapPurchaseOrderEntity`) carry a `cpeId` field
  back to the CPE that generated them (`poId` itself comes from SAP's
  `Ebeln`). Followed the exact "first match" convention already
  established in `ICDetail.controller.js#_onMatched`
  (`this.readList("procure", "/po").filter(p => p.cpeId === sCpeId)[0]`)
  rather than inventing a new one - a CPE only gets a PO once it's
  progressed that far (CWIP push → PO), so most rows legitimately have
  none yet, same as IC's own lookup already assumes.
- **Load-order issue avoided:** `_loadLivePOList` and `_loadLiveCpeList`
  both fire during Component init with no guaranteed completion order,
  so joining once at list-load time (inside `_loadLiveCpeList`) risked
  showing stale/empty PO numbers if the CPE list happened to finish
  loading first. Instead bound the cell as a 2-part formatter -
  `{parts: [{path:'cpe>cpeId'}, {path:'procure>/po'}], formatter:
  '.formatPoNumber'}` - so it automatically re-evaluates whenever
  `procure>/po` is set, regardless of which list finishes loading first.
  `procure>/po` already defaults to `[]` at Component init
  (`Component.js:717`), so the binding resolves cleanly even before
  either list has loaded.
- New `CPEList.controller.js` methods: `_findPoForCpe` (shared lookup),
  `formatPoNumber` (returns the matched `poId`, or `"-"` - same fallback
  convention as `formatter.orDash` elsewhere), `formatHasPo` (boolean,
  drives the `Link`'s `enabled` so an absent PO renders as plain muted
  text rather than a dead clickable link), and `onPoPress` (re-resolves
  the PO via the same `_findPoForCpe` lookup against the live list at
  click time, then `navTo("poDetail", {poId})`).
- View: new `<Column>` with the existing `{i18n>poNumber}` key (already
  existed, used by `POList.view.xml`/`PODetail.view.xml` - no new i18n
  needed), inserted between Budget ID and CPE Amount exactly where
  marked. Cell is a single `Link` (text + `enabled` both bound to the
  2-part formatters above) rather than two sibling controls toggling
  visibility - simpler, and a disabled `sap.m.Link` already renders as
  muted non-interactive text, which is the "-" fallback look needed.
- Verified: `node -c`, XML well-formed, full `npm run build` passes
  clean. **NOT deployed this entry, not verified in an actual browser**
  - same no-browser-automation limitation as the rest of this session.

### 151. "My Approvals" stale-after-Approve bug, actually found this time - #139's "no bug found" conclusion was wrong because it predated realizing ApprovalInboxSet now returns real rows. Fixed all 7 approve/reject/hold/rollout/bulk call sites across 3 files (2026-11-19, later still, fixed, NOT yet deployed)
Files: `webapp/controller/ApprovalDetail.controller.js` (CPE
Approve/Reject/Hold/Rollout - 4 sites), `webapp/controller/
BudgetApprovalDetail.controller.js` (Budget Approve/Reject - 2 sites),
`webapp/controller/ApprovalInbox.controller.js` (CPE bulk-approve +
Budget bulk-approve, success and catch paths each - 2 sites).
- User reported (again): going into a CPE from "My Approvals" and
  approving it, the list still shows the approved item when navigating
  back - only a full page refresh clears it. **This is the exact symptom
  #139 (2026-11-18) investigated and closed as "no bug found"** - that
  conclusion was wrong, and the reason why is itself informative: #139
  checked that every approve path calls `_loadLiveCpeList()`/
  `_loadLiveBudgetList()` after acting, which was true and *used to be
  sufficient* - but never checked whether that call alone actually
  refreshes `approval>/inbox` (the model the My Approvals table is
  really bound to), which is a different model entirely.
- **Root cause, confirmed by reading `Component.js` directly this time:**
  `_loadLiveApprovalInbox()` reads `ApprovalInboxSet` fresh and sets
  `approval>/inbox` wholesale - its own code comment
  (`Component.js:920-924`) says this is now treated as **authoritative**
  because the backend started returning real rows for it (confirmed live
  2026-11-02). `_mergeBudgetApprovals`/`_mergeCpeApprovals` (called as a
  side effect of `_loadLiveBudgetList`/`_loadLiveCpeList`) only ever
  add/replace their own **fallback** rows (`isFallback: true`) - a real
  row from `ApprovalInboxSet` is explicitly kept untouched regardless of
  what the underlying CPE/Budget's status has since become
  (`Component.js:980`/`1007`: `aKept = aInbox.filter(r => !(r.docType
  === "..." && r.isFallback))` keeps every non-fallback row
  unconditionally). So once a document's inbox row stopped being a
  fallback row (i.e. the backend started returning it for real),
  reloading `cpe>/list`/`budget>/list` alone stopped being able to drop
  it from the inbox - only a fresh `_loadLiveApprovalInbox()` call can,
  and nothing was calling it after any approve/reject/hold/rollout/bulk
  action. A hard page refresh works because it re-runs Component's full
  init batch, which does call `_loadLiveApprovalInbox()` from scratch.
- **Fix:** added a chained `_loadLiveApprovalInbox()` call after the
  existing `_loadLiveCpeList()`/`_loadLiveBudgetList()` reload in all 7
  sites - chained **after**, not run in parallel, so
  `_loadLiveApprovalInbox`'s own internal merge step
  (`_mergeBudgetApprovals`/`_mergeCpeApprovals`) computes fallback rows
  from the now-fresh cpe/budget list rather than a stale one. Covered:
  CPE `onApprove`/`onReject`/`onHold`/`onRollout`
  (`ApprovalDetail.controller.js`), Budget `onApprove`/`onReject`
  (`BudgetApprovalDetail.controller.js`, today's #149 file), and both
  success and catch/failure paths of CPE `onBulkApprove` and Budget
  `onBulkApproveBudget` (`ApprovalInbox.controller.js`) - the catch paths
  included deliberately, since a partial-failure reload should still
  reflect whichever documents in the batch genuinely did succeed
  server-side.
- **Left untouched, correctly:** the *pre-check* `_loadLiveCpeList()`/
  `_loadLiveBudgetList()` calls at the top of `onBulkApprove`/
  `onBulkApproveBudget` (before the confirm dialog even opens) - those
  exist to catch stale selections before acting, not to refresh after
  acting, so they were never part of this gap.
- Verified: `node -c` on all 3 controllers, full `npm run build` passes
  clean. **NOT deployed this entry, not verified in an actual browser**
  - same no-browser-automation limitation as the rest of this session;
  this is exactly the kind of bug that's easy to mis-declare fixed from
  a code read alone (as #139 did) without a live click-through, so
  whoever tests this should specifically retest the scenario the user
  described: approve a CPE/Budget from My Approvals, navigate straight
  back without refreshing, confirm it's actually gone.

### 152. Added PR Number to the All CPEs list, per backend dev's PR (Component.js, CPEList.view.xml, i18n) (2026-11-19, later still, built, NOT yet deployed)
Files: `webapp/Component.js`, `webapp/view/CPEList.view.xml`, `webapp/i18n/i18n.properties`.
- Backend developer's spec: `CPESet` now exposes `Banfn` (Edm.String(10),
  the PR number) directly on the entity - not a join against another
  entity set like PO Number is. Add a "PR Number" column beside Budget
  ID/PO Number, plain text (never a hyperlink, unlike PO Number), blank/
  dash when empty, no new backend call needed. Gated on transport
  `EDSK9B0EM1` being imported before it returns real data; test case once
  live: `CPE-2026-0003` → PR `0014315442`, PO `6500579953`.
- **Mapping:** added `prNumber: oRaw.Banfn || ""` to
  `Component.js#mapCpeEntity`, same "read-what's-there-or-stay-blank"
  convention already used for `vendorCode`/`vendorCodeLocked` a few lines
  above it (those are also waiting on their own not-yet-live backend
  fields) - no join, no new OData call, since `Banfn` rides along on the
  same `CPESet` read `_loadLiveCpeList` already does.
- **View:** new column + i18n key `prNumber` ("PR Number", added next to
  the existing `poNumber` key), placed between Budget ID and PO Number
  (PR precedes PO in the actual procurement sequence: Budget → CPE → PR →
  PO → GRN). Cell is a plain `<Text>` (never a `Link`, per spec) using
  `formatter.orDash` for the empty case - matches the "-" convention
  already in use for the adjacent PO Number column (#150), which the
  backend dev's note explicitly allowed ("no dash needed, unless you
  already use one for the PO column" - we do, so matched it for visual
  consistency between the two adjacent columns rather than one blank and
  one dashed).
- **Explicitly out of scope, per the backend dev's own note that it's
  optional:** search/filter support for PR Number - not added, to keep
  this change to exactly what was asked.
- Verified: `node -c` on `Component.js`, XML well-formed, full `npm run
  build` passes clean. **NOT deployed this entry, not verified in an
  actual browser.** Will show blank/dash for every row until transport
  `EDSK9B0EM1` is imported - this is expected, not a bug, per the backend
  dev's note. Once imported, retest against `CPE-2026-0003` specifically
  (expected PR `0014315442`, PO `6500579953`) to confirm the mapping is
  wired to the right field.

### 153. Deployed #150/#151/#152 together (2026-11-19, later still)
- User provided transport `EDSK9B0EM1` - the same TR the backend
  developer named for their own `Banfn` backend change (#152) - and
  `ui5-deploy.yaml` was already updated to it on disk before this entry.
  Ran `npx fiori deploy`. Confirmed `Deployment Successful`.
- This push carried everything still pending from earlier in the
  session: **#150** (PO Number column on All CPEs, hyperlinked to PO
  Detail), **#151** (the "My Approvals" stale-after-approve fix across
  all 7 approve/reject/hold/rollout/bulk call sites), and **#152** (PR
  Number column on All CPEs, bound to `Banfn`).
- **Still open, carried forward:**
  - #151 needs a live retest: approve a CPE/Budget from My Approvals,
    navigate back without refreshing, confirm the row is actually gone
    now (this is the fix that corrects #139's wrong "no bug found"
    conclusion from yesterday).
  - #152's PR Number column will show blank/dash for every row until
    the backend half of transport `EDSK9B0EM1` is actually imported on
    this system - confirm with the backend developer whether this
    deploy's TR import also covers their `Banfn` field, or whether that
    still needs a separate release/import.
  - #149 (Budget Approval screen's missing line items/financials,
    deployed under `EDSK9B0ELR` earlier) still needs to move to Quality
    separately - unchanged by this entry.

### 154. New ask surfaced: Admin tab ("set who is admin and other things") - scoping discussion only, no code touched (2026-11-20, analysis/discussion only)
- Stakeholder (via user) asked for an Admin tab/section in the portal
  where an admin can control who else is an admin, plus unspecified
  "other things." User wasn't sure how to approach it and asked for
  ideas before any build started.
- **Checked the actual backend (`class ZCL_ZCAPEX_PORTAL_DPC_EXT
  def.txt`) rather than assuming:**
  - No `UserSet`/`RoleSet`/`AdminUserSet` or any admin-user concept
    exists anywhere in the backend today. "Who is admin" is a
    ground-up build - new Z-table + new OData entity set + an
    `IsCurrentUserAdmin`-style check, none of which exist yet.
  - `DoaRuleSet` only implements `GET_ENTITY`/`GET_ENTITYSET` - no
    create/update/delete. Making DOA rules editable from an Admin tab
    needs new backend write methods.
  - `ConfigSet` (SLA/quota config) is **explicitly locked down**, not
    just unbuilt - `configset_get_entityset` has the comment
    *"Read-only, whitelisted: SLA and quota limits drive screens, but
    may never be set by a client."* Making this editable means
    reversing a deliberate guard, not just filing a feature request -
    flagged to the user as a different kind of conversation than the
    others.
  - Plant/unit mapping and an admin-action audit log: no backend
    support for either; both would be from-scratch.
- **UI approach discussed (not built):** reuse the existing
  `admin/doa` route's convention (DOA Matrix today is one page with
  stacked card sections, no tabs) rather than inventing a new pattern.
  Recommendation given: start as a single page with one section for
  "Users & Roles" (the only confirmed scope so far), and only promote
  to an `IconTabBar` (the tab pattern already used on CPEDetail/
  BudgetDetail) once a second admin concern is actually confirmed in
  scope - avoids over-building ahead of real requirements.
  Enforcement note given: any "isAdmin" gating must be checked
  backend-side on every privileged write, not just used to hide the
  tab client-side.
- **Decision: paused.** Backend developer isn't ready yet, and the
  user wants to discuss scope and the `ConfigSet` lock-down question
  with them before any frontend or backend work starts. No mock data,
  no new view/route, no backend spec doc written yet - this entry is
  scoping notes only, to pick up from once that conversation happens.

    
