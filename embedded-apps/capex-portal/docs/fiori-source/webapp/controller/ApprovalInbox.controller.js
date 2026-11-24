sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.ApprovalInbox", {

        onInit: function () {
            this.setModel(new JSONModel({ items: [], summary: {} }), "inbox");
            this.getRouter().getRoute("approvalInbox").attachPatternMatched(this._onMatched, this);
            this._wireSlaTiles();
        },

        /**
         * The 3 SLA summary tiles filter the inbox table already on this
         * same screen, via the existing cbSla combo + onFilter - not a page
         * jump, since the data they summarize is right here already (see
         * Dashboard.controller.js#_wireKpiTiles's sibling note on when each
         * pattern applies). sap.m.VBox has no "press" event, hence
         * attachBrowserEvent.
         */
        _wireSlaTiles: function () {
            var that = this;
            var mTiles = { tileSlaOnTrack: "OK", tileSlaAtRisk: "RISK", tileSlaBreached: "BREACH" };

            Object.keys(mTiles).forEach(function (sId) {
                var oTile = that.byId(sId);
                if (oTile) {
                    oTile.attachBrowserEvent("click", function () {
                        that.byId("cbSla").setSelectedKey(mTiles[sId]);
                        that.onFilter();
                    });
                }
            });
        },

        _onMatched: function () {
            // On a hard refresh this route matches before Component.js's
            // live user-info read can possibly have returned, so the first
            // call alone reads app>/user while it's still empty and filters
            // every row out (see Dashboard.controller.js for the same
            // pattern against _pInitialLoad). That call isn't wasted - it's
            // what makes tab navigation (where the user is already loaded)
            // show data instantly - this just adds a second pass once the
            // initial batch has actually landed, to self-correct on refresh.
            this._load();
            this._applyInitialSla();
            // Unconditional, every route match - not just when
            // _applyInitialSla has a hand-off SLA to apply. Without this,
            // a direct/ordinary visit to this screen never called
            // onFilter() at all, so the two tables' own permanent docType
            // split (onFilter, CAPEX_SESSION_LOG.md Open Issue #101) never
            // got applied and both tables silently fell back to their
            // default unfiltered binding - showing every row, CPE and
            // Budget mixed, in both tables at once (Open Issue #107).
            this.onFilter();
            var pInitialLoad = this.getOwnerComponent()._pInitialLoad;
            if (pInitialLoad) {
                pInitialLoad.then(this._load.bind(this));
            }
        },

        /**
         * One-shot hand-off from the Dashboard's "SLA Breaches" KPI tile
         * (Dashboard.controller.js#onKpiSlaBreach) - if it set an SLA bucket
         * to land on, select it on the combo, then clear the flag so a
         * later, ordinary navigation to this screen (nav menu, back button)
         * isn't stuck on it. Just sets the ComboBox selection - _onMatched's
         * own unconditional onFilter() call right after this one picks it
         * up and actually applies it, same as it does for every other
         * filter on this screen.
         */
        _applyInitialSla: function () {
            var oApp = this.getOwnerComponent().getModel("app");
            var sSla = oApp.getProperty("/approvalInboxInitialSla");
            if (sSla) {
                this.byId("cbSla").setSelectedKey(sSla);
                oApp.setProperty("/approvalInboxInitialSla", null);
            }
        },

        /**
         * Builds the inbox for the current persona: only CPEs sitting at the
         * user's own DOA level, and only plants the user is authorised for.
         */
        _load: function () {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            var aAll = this.applyPlantAuth(this.readList("approval", "/inbox"));

            // Approvers see what is at their level; initiators and admins see everything.
            var bSeesAll = oUser.isAdmin || oUser.role === "Unit Initiator";
            var aItems = bSeesAll ? aAll : aAll.filter(function (r) {
                return r.currentLevel === oUser.role;
            });

            var oSummary = {
                count: aItems.length,
                value: aItems.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0),
                onTrack: aItems.filter(function (r) { return Number(r.daysPending) <= 3; }).length,
                atRisk: aItems.filter(function (r) { return Number(r.daysPending) > 3 && Number(r.daysPending) <= 5; }).length,
                breached: aItems.filter(function (r) { return Number(r.daysPending) > 5; }).length
            };

            this.getModel("inbox").setData({ items: aItems, summary: oSummary });
        },

        // ------------------------------------------------------------------
        // FILTER
        // ------------------------------------------------------------------

        onFilter: function () {
            var aFilters = [];

            var sQuery = this.byId("sfInbox").getValue();
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("docId", FilterOperator.Contains, sQuery),
                        new Filter("title", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            var sSla = this.byId("cbSla").getSelectedKey();
            if (sSla === "BREACH") { aFilters.push(new Filter("daysPending", FilterOperator.GT, 5)); }
            if (sSla === "RISK")   { aFilters.push(new Filter("daysPending", FilterOperator.BT, 4, 5)); }
            if (sSla === "OK")     { aFilters.push(new Filter("daysPending", FilterOperator.LE, 3)); }

            var sPriority = this.byId("cbPriority").getSelectedKey();
            if (sPriority) { aFilters.push(new Filter("priority", FilterOperator.EQ, sPriority)); }

            // Two separate tables (CAPEX_SESSION_LOG.md Open Issue #100) share
            // these same search/SLA/priority filters - each just adds its own
            // docType on top, splitting the one "inbox>/items" array by
            // document type instead of mixing both in one list.
            this.byId("tblInboxCpe").getBinding("items").filter(
                aFilters.concat([new Filter("docType", FilterOperator.NE, "BUD")]));
            this.byId("tblInboxBudget").getBinding("items").filter(
                aFilters.concat([new Filter("docType", FilterOperator.EQ, "BUD")]));
        },

        onClearFilter: function () {
            this.byId("sfInbox").setValue("");
            this.byId("cbSla").setSelectedKey("");
            this.byId("cbPriority").setSelectedKey("");
            this.onFilter();
        },

        onRefresh: function () {
            this._load();
            this.toast("Refreshed");
        },

        /**
         * Highlights rows that are genuinely waiting on the viewer's own
         * role - needed because bSeesAll (Admin/Unit Initiator) shows every
         * pending item system-wide here, not just the viewer's own queue, so
         * the "Currently With" column needs a visual cue for which rows are
         * actually theirs to act on vs. elsewhere in the chain.
         */
        formatCurrentLevelState: function (sLevel) {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            return sLevel === oUser.role ? "Success" : "None";
        },

        /**
         * Soft hint only, not an authority - computed from whatever's
         * already cached locally in the cpe/budget models (same live-list
         * cache onBulkApprove/onBulkApproveBudget's own pre-check reads),
         * not a fresh backend call on every row render, so it can lag a few
         * minutes behind reality on a long-idle screen. Reuses the exact
         * same "still actually approvable" condition those pre-checks treat
         * as authoritative (Issue #110/#111), so it never disagrees with
         * them - it just surfaces the same fact before the user selects
         * anything instead of only after a failed/filtered bulk-approve
         * attempt. Deliberately doesn't block selection on its own - the
         * live pre-check at approve-time remains the real guard.
         * @param {string} sDocId docId
         * @param {string} sDocType docType ("BUD" or CPE)
         * @returns {boolean} true when this row is no longer actually
         *   awaiting this user's approval
         */
        formatIsStale: function (sDocId, sDocType) {
            return sDocType === "BUD" ? !this._isBudgetStillApprovable(sDocId) : !this._isCpeStillApprovable(sDocId);
        },

        /**
         * A Budget inbox row carries no items of its own (ApprovalInboxSet
         * has no such field) - same cross-reference into the live "budget"
         * list by budgetId that _isBudgetStillApprovable above already uses.
         * @param {string} sDocId the row's docId, which is the budgetId for a BUD row
         * @returns {boolean} true when that budget has at least one line item
         */
        formatHasLineItems: function (sDocId) {
            var oBudget = this.readOne("budget", "/list", "budgetId", sDocId);
            return !!(oBudget && oBudget.items && oBudget.items.length);
        },

        /**
         * Stops a stale row (the "Already Actioned" indicator above,
         * formatIsStale) from ever actually being selected, instead of only
         * being caught later by onBulkApprove/onBulkApproveBudget's own live
         * pre-check at confirm time - reuses formatIsStale itself rather
         * than a separate check, so what's shown and what's blockable never
         * disagree. Shared by both tables (tblInboxCpe and tblInboxBudget).
         *
         * Fires both for a single checkbox click (listItem) and for the
         * header "select all" checkbox (selectAll true, every affected row
         * in listItems at once) - immediately un-checking any stale row
         * caught either way, via a plain setSelected(false) call, which
         * doesn't itself re-fire this event (only the table's own built-in
         * selection handling does, e.g. a checkbox press or selectAll()).
         * @param {sap.ui.base.Event} oEvent selectionChange
         */
        onInboxSelectionChange: function (oEvent) {
            var that = this;
            var aItems = oEvent.getParameter("selectAll")
                ? oEvent.getParameter("listItems")
                : [oEvent.getParameter("listItem")];

            var aBlocked = [];
            aItems.filter(Boolean).forEach(function (oItem) {
                if (!oItem.getSelected()) { return; }
                var oCtx = oItem.getBindingContext("inbox");
                if (that.formatIsStale(oCtx.getProperty("docId"), oCtx.getProperty("docType"))) {
                    oItem.setSelected(false);
                    aBlocked.push(oCtx.getProperty("docId"));
                }
            });

            if (aBlocked.length) {
                this.toast(aBlocked.join(", ") +
                    (aBlocked.length > 1 ? " are" : " is") +
                    " already actioned and can't be selected.");
            }
        },

        /**
         * Priority badge colour - shown for every row now (not just "High"),
         * so Medium/Low read as a set priority rather than as missing data.
         * @param {string} s priority ("High"/"Medium"/"Low")
         * @returns {string} ValueState
         */
        formatPriorityState: function (s) {
            if (s === "High") { return "Error"; }
            if (s === "Medium") { return "Warning"; }
            return "Success";
        },

        // ------------------------------------------------------------------
        // ACTIONS
        // ------------------------------------------------------------------

        onRowPress: function (oEvent) {
            this._navToDetail(oEvent.getSource().getBindingContext("inbox"));
        },

        onReview: function (oEvent) {
            this._navToDetail(oEvent.getSource().getBindingContext("inbox"));
        },

        onShowLineItems: function (oEvent) {
            var sDocId = oEvent.getSource().getBindingContext("inbox").getProperty("docId");
            var oBudget = this.readOne("budget", "/list", "budgetId", sDocId);
            if (!oBudget) { return; }
            this.openLineItemsPopover(oEvent.getSource(), oBudget.items, oBudget.title);
        },

        /**
         * Routes to the Budget or CPE approval screen depending on the row's
         * document type - Budget approval has no vendor/financial-metrics
         * content, so it gets its own lighter screen rather than overloading
         * ApprovalDetail (which is CPE-specific throughout).
         * @param {sap.ui.model.Context} oCtx inbox row context
         */
        _navToDetail: function (oCtx) {
            if (oCtx.getProperty("docType") === "BUD") {
                this.navTo("budgetApprovalDetail", { budgetId: oCtx.getProperty("docId") });
            } else {
                this.navTo("approvalDetail", { cpeId: oCtx.getProperty("docId") });
            }
        },

        /**
         * Bulk approve — useful for a queue of small, routine CPEs. Only
         * ever sees CPE rows now that Budget approvals live in their own
         * table (tblInboxBudget, CAPEX_SESSION_LOG.md Open Issue #100) - no
         * need to filter Budget rows out of the selection any more, since
         * tblInboxCpe's own binding filter (onFilter) never lets one in.
         *
         * Same optimistic-concurrency pre-check as
         * onBulkApproveBudget (CAPEX_SESSION_LOG.md Open Issue #111,
         * bringing this table up to the same standard after Issue #110
         * fixed it for Budget first): re-pulls the live CPE list the moment
         * this button is pressed and drops anything no longer actually
         * approvable before it ever reaches the backend, instead of this
         * table's old behaviour of sending everything straight through and
         * showing a flat, unhelpful "Bulk approval failed. Please retry."
         * on any failure. Unlike Budget's own loop, `BulkApprove` is one
         * real batch call (not a sequential one-at-a-time chain), so a
         * failure here can't point at which specific CPE caused it - only
         * that the batch (already pre-filtered to what looked valid a
         * moment ago) failed.
         */
        onBulkApprove: function () {
            var oTable = this.byId("tblInboxCpe");
            var aSelected = oTable.getSelectedItems();

            if (!aSelected.length) {
                this.warn("Select at least one CPE to approve.");
                return;
            }

            var that = this;
            var aIds = aSelected.map(function (oItem) {
                return oItem.getBindingContext("inbox").getProperty("cpeId");
            });

            that.setBusy(true);
            that.getOwnerComponent()._loadLiveCpeList().then(function () {
                var aValid = aIds.filter(function (sId) { return that._isCpeStillApprovable(sId); });
                var aStale = aIds.filter(function (sId) { return aValid.indexOf(sId) === -1; });

                that.setBusy(false);

                if (!aValid.length) {
                    oTable.removeSelections(true);
                    that._load();
                    that.warn("None of the selected CPEs are still awaiting your approval - the list has been refreshed.");
                    return;
                }

                var nValue = aValid.reduce(function (s, sId) {
                    var oC = that.readOne("cpe", "/list", "cpeId", sId);
                    return s + (oC ? Number(oC.amount) || 0 : 0);
                }, 0);

                var sStaleNote = aStale.length
                    ? "\n\n" + aStale.join(", ") + " already moved on and will be skipped."
                    : "";

                that.confirm(
                    "Approve " + aValid.length + " CPE" + (aValid.length > 1 ? "s" : "") +
                    " totalling " + that.formatter.inLakhs(nValue) + "?\n\n" +
                    aValid.join(", ") + "\n\nEach will move to the next DOA level automatically." +
                    sStaleNote,
                    function () {
                        if (that.isGuarded("bulkApprove")) { return; }
                        that.setBusy(true);
                        that.callFunction("BulkApprove", { CpeIds: aValid.join(",") })
                            .then(function (oResult) {
                                // BulkApprove resolving (HTTP 2xx) only means the
                                // batch call itself went through - the backend's
                                // own Success/Message (ABAP: ls_res-success =
                                // xsdbool(lt_fail IS INITIAL)) is the real signal
                                // for whether every CPE in the batch actually got
                                // approved. Backend team flagged this UI said
                                // "N approved" unconditionally regardless of it.
                                var bSuccess = !oResult || oResult.Success === undefined || oResult.Success === null ||
                                    oResult.Success === true || oResult.Success === "X" || oResult.Success === "true";
                                var sMessage = (oResult && oResult.Message) ||
                                    (aValid.length + " CPE" + (aValid.length > 1 ? "s" : "") + " approved and routed to the next level.");

                                if (bSuccess) {
                                    aValid.forEach(function (sId) {
                                        that.addAudit("CPE", sId, "Approved", "Bulk approved");
                                    });
                                }

                                // Real reload instead of the old _advance() local
                                // patch (hand-mutated approval>/history + cpe>/list)
                                // - see CAPEX_SESSION_LOG.md Open Issue #23.
                                // _loadLiveCpeList alone only refreshes a
                                // fallback row (Component.js's
                                // _mergeCpeApprovals) - a real ApprovalInboxSet
                                // row (confirmed live 2026-11-02) needs its own
                                // re-read to actually drop, chained after so
                                // its merge step sees the fresh cpe list.
                                return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                                    return that.getOwnerComponent()._loadLiveApprovalInbox();
                                }).then(function () {
                                    that.releaseGuard("bulkApprove");
                                    oTable.removeSelections(true);
                                    that._load();
                                    that.setBusy(false);
                                    if (bSuccess) {
                                        that.success(sMessage, "Approved");
                                    } else {
                                        that.warn(sMessage, "Bulk Approve");
                                    }
                                });
                            })
                            .catch(function (oError) {
                                that.getOwnerComponent()._loadLiveCpeList().then(function () {
                                    return that.getOwnerComponent()._loadLiveApprovalInbox();
                                }).then(function () {
                                    that.releaseGuard("bulkApprove");
                                    oTable.removeSelections(true);
                                    that._load();
                                    that.setBusy(false);
                                    if (that._isGenericBackendError(oError)) {
                                        that.warn("One of these may have already been acted on by someone else - the list has been refreshed.");
                                    } else {
                                        that.error("Bulk approval failed.\n\n" + that.extractODataError(oError), "Backend Error");
                                    }
                                });
                            });
                    },
                    "Bulk Approve"
                );
            });
        },

        /**
         * Same "still actually approvable" condition
         * ApprovalDetail.controller.js#_onMatched already uses for its own
         * Approve/Reject/Hold/Rollout panel visibility - mirrors
         * _isBudgetStillApprovable below for the CPE side.
         * @param {string} sCpeId cpe id
         * @returns {boolean} true when this user can still act on it right now
         */
        _isCpeStillApprovable: function (sCpeId) {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            var oCPE = this.readOne("cpe", "/list", "cpeId", sCpeId);
            return !!oCPE && oCPE.status === "IN_APPROVAL" && !!oCPE.currentLevel &&
                (oUser.isAdmin || oUser.role === oCPE.currentLevel);
        },

        /**
         * Bulk approve for the Budget table (CAPEX_SESSION_LOG.md Open
         * Issue #109) - unlike onBulkApprove above, there is no
         * BulkApprove-style batch function import for Budget documents per
         * $metadata, so this loops ApproveDocument (the same single-document
         * call BudgetApprovalDetail.controller.js#onApprove already uses)
         * once per selected Budget via _approveBudgetsSequentially, instead
         * of one batched backend call.
         *
         * Optimistic-concurrency pre-check (Open Issue #110, added after a
         * live bulk attempt hit a generic backend 500 because the selected
         * Budget had already moved past this approver's level by the time
         * it was acted on - the inbox row was a snapshot, not a live read):
         * re-pulls the live Budget list right when this button is pressed
         * and drops anything no longer actually approvable from the batch
         * *before* it's ever sent to the backend, instead of discovering it
         * via a failed call. This can't close the window between that fresh
         * check and the user actually clicking "confirm" on the dialog, or
         * a true same-instant collision with someone else acting on it - see
         * _isGenericBackendError below for how that last sliver is handled.
         */
        onBulkApproveBudget: function () {
            var oTable = this.byId("tblInboxBudget");
            var aSelected = oTable.getSelectedItems();

            if (!aSelected.length) {
                this.warn("Select at least one Budget to approve.");
                return;
            }

            var that = this;
            var aIds = aSelected.map(function (oItem) {
                return oItem.getBindingContext("inbox").getProperty("docId");
            });

            that.setBusy(true);
            that.getOwnerComponent()._loadLiveBudgetList().then(function () {
                var aValid = aIds.filter(function (sId) { return that._isBudgetStillApprovable(sId); });
                var aStale = aIds.filter(function (sId) { return aValid.indexOf(sId) === -1; });

                that.setBusy(false);

                if (!aValid.length) {
                    oTable.removeSelections(true);
                    that._load();
                    that.warn("None of the selected Budgets are still awaiting your approval - the list has been refreshed.");
                    return;
                }

                var nValue = aValid.reduce(function (s, sId) {
                    var oB = that.readOne("budget", "/list", "budgetId", sId);
                    return s + (oB ? Number(oB.approved) || 0 : 0);
                }, 0);

                var sStaleNote = aStale.length
                    ? "\n\n" + aStale.join(", ") + " already moved on and will be skipped."
                    : "";

                that.confirm(
                    "Approve " + aValid.length + " Budget" + (aValid.length > 1 ? "s" : "") +
                    " totalling " + that.formatter.inLakhs(nValue) + "?\n\n" +
                    aValid.join(", ") + "\n\nEach will move to the next DOA level automatically, " +
                    "one at a time - if one fails, the rest stop so it's clear which one needs attention." +
                    sStaleNote,
                    function () {
                        if (that.isGuarded("bulkApproveBudget")) { return; }
                        that.setBusy(true);
                        that._approveBudgetsSequentially(aValid, 0)
                            .then(function () {
                                // _loadLiveBudgetList alone only refreshes a
                                // fallback row (Component.js's
                                // _mergeBudgetApprovals) - a real
                                // ApprovalInboxSet row (confirmed live
                                // 2026-11-02) needs its own re-read to
                                // actually drop, chained after so its merge
                                // step sees the fresh budget list.
                                return that.getOwnerComponent()._loadLiveBudgetList().then(function () {
                                    return that.getOwnerComponent()._loadLiveApprovalInbox();
                                }).then(function () {
                                    that.releaseGuard("bulkApproveBudget");
                                    oTable.removeSelections(true);
                                    that._load();
                                    that.setBusy(false);
                                    that.success(aValid.length + " Budgets approved and routed to the next level.", "Approved");
                                });
                            })
                            .catch(function (oFailure) {
                                // Reload regardless of where the loop stopped, so the
                                // inbox reflects whichever ones already succeeded
                                // before the failure, instead of looking stale.
                                that.getOwnerComponent()._loadLiveBudgetList().then(function () {
                                    return that.getOwnerComponent()._loadLiveApprovalInbox();
                                }).then(function () {
                                    that.releaseGuard("bulkApproveBudget");
                                    oTable.removeSelections(true);
                                    that._load();
                                    that.setBusy(false);
                                    if (that._isGenericBackendError(oFailure.cause)) {
                                        that.warn(oFailure.budgetId + " was likely just acted on by someone else - the list has been refreshed.");
                                    } else {
                                        that.error(
                                            "Bulk approval stopped at " + oFailure.budgetId + ".\n\n" +
                                            that.extractODataError(oFailure.cause),
                                            "Backend Error"
                                        );
                                    }
                                });
                            });
                    },
                    "Bulk Approve Budgets"
                );
            });
        },

        /**
         * Same "still actually approvable" condition
         * BudgetApprovalDetail.controller.js#_onMatched already uses to
         * decide whether to show its own Approve/Reject panel - reused here
         * for the pre-check above so both screens agree on what "stale"
         * means.
         * @param {string} sBudgetId budget id
         * @returns {boolean} true when this user can still act on it right now
         */
        _isBudgetStillApprovable: function (sBudgetId) {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            var oBudget = this.readOne("budget", "/list", "budgetId", sBudgetId);
            return !!oBudget && oBudget.status === "IN_APPROVAL" && !!oBudget.currentLevel &&
                (oUser.isAdmin || oUser.role === oBudget.currentLevel);
        },

        /**
         * Detects the backend's generic internal-error wrapper text ("In
         * the context of Data Services an unknown internal server error
         * occurred" - the same message seen across this whole project for
         * various unhandled backend exceptions, e.g. SubmitDocument/CPESet
         * create/SubmitCPE's own 500s, CAPEX_SESSION_LOG.md Open Issue #1).
         * Used here to soften the one race-condition case
         * onBulkApproveBudget's fresh pre-check can't fully prevent - a
         * Budget acted on by someone else in the exact instant between that
         * check and this call - into a calm "already handled" message
         * instead of raw backend text.
         * @param {object} oError raw OData error
         * @returns {boolean} true when it's that specific generic message
         */
        _isGenericBackendError: function (oError) {
            return /unknown internal server error/i.test(this.extractODataError(oError));
        },

        /**
         * Calls ApproveDocument for aIds[iIndex], then recurses to the next
         * one - sequential, not Promise.all, so a failure stops the chain
         * at a known point instead of leaving an ambiguous mix of
         * in-flight/succeeded/failed calls (same reasoning as
         * CPECreate.controller.js#_uploadAttachments's own sequential
         * upload chain).
         * @param {Array<string>} aIds every selected Budget id
         * @param {number} iIndex current position in aIds
         * @returns {Promise<void>} rejects with {budgetId, cause} on the
         *   first failure
         */
        _approveBudgetsSequentially: function (aIds, iIndex) {
            if (iIndex >= aIds.length) { return Promise.resolve(); }

            var that = this;
            var sId = aIds[iIndex];
            return this.callFunction("ApproveDocument", { DocType: "BUD", DocId: sId, Comment: "Bulk approved." })
                .then(function () {
                    that.addAudit("BUD", sId, "Approved", "Bulk approved.");
                    return that._approveBudgetsSequentially(aIds, iIndex + 1);
                })
                .catch(function (oError) {
                    return Promise.reject({ budgetId: sId, cause: oError });
                });
        }
    });
});
