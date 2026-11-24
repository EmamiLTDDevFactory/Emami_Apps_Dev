sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.BudgetApprovalDetail", {

        onInit: function () {
            this.setModel(new JSONModel({}), "detail");
            this.getRouter().getRoute("budgetApprovalDetail").attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").budgetId;
            this.resolveRecord("budget", "/list", "budgetId", sId, function (oBudget) {
                if (!oBudget) {
                    this.error(this.i18n("recordNotFound", [sId]));
                    this.navTo("approvalInbox", {}, true);
                    return;
                }

                var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
                var bCanAct = oBudget.status === "IN_APPROVAL" && !!oBudget.currentLevel &&
                    (oUser.isAdmin || oUser.role === oBudget.currentLevel);

                this.getModel("detail").setData(Object.assign({}, oBudget, {
                    chain: this._buildLiveChain(oBudget),
                    canAct: bCanAct,
                    comment: "",
                    // Cash-flow schedule with discounting/cumulative recovery -
                    // same computation as BudgetDetail.controller.js, needed
                    // here too so an approver can see the actual financial
                    // case (items/IRR/NPV/payback/cash flows) instead of only
                    // the DOA chain and free-text justification (user report:
                    // "no details ... only Flow and Approve/Reject").
                    cashFlowRows: this._buildCashFlowRows(oBudget)
                }));
            }.bind(this));
        },

        /**
         * Builds the year-by-year discounted cash-flow table - identical
         * logic to BudgetDetail.controller.js#_buildCashFlowRows, duplicated
         * here rather than shared since neither controller has a common base
         * beyond BaseController today.
         * @param {object} oBudget budget record
         * @returns {Array<object>} rows
         */
        _buildCashFlowRows: function (oBudget) {
            var aFlows = oBudget.cashFlows || [];
            var r = (Number(oBudget.hurdleRate) || 0) / 100;
            var cumulative = -Math.abs(Number(oBudget.investment) || 0);
            var aRows = [];

            aFlows.forEach(function (cf, i) {
                var discounted = (Number(cf) || 0) / Math.pow(1 + r, i + 1);
                cumulative += discounted;
                aRows.push({
                    year: "Year " + (i + 1),
                    flow: Number(cf) || 0,
                    discounted: discounted,
                    cumulative: cumulative
                });
            });

            return aRows;
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

        formatIrr: function (v) {
            return (v === null || v === undefined || isNaN(v)) ? "—" : Number(v).toFixed(1) + "%";
        },

        formatNpv: function (v) {
            return (v === null || v === undefined || isNaN(v)) ? "—" : this.formatter.inLakhs(v);
        },

        formatPayback: function (v) {
            return (v === null || v === undefined || isNaN(v)) ? "—" : Number(v).toFixed(1) + " yrs";
        },

        formatHurdleFoot: function (r) {
            return "hurdle " + (Number(r) || 0).toFixed(1) + "%";
        },

        formatItemsTotal: function (aItems) {
            var nTotal = (aItems || []).reduce(function (n, o) { return n + (Number(o.amount) || 0); }, 0);
            return this.formatter.rupees(nTotal) + " (" + (aItems || []).length + " item" +
                ((aItems || []).length === 1 ? "" : "s") + ")";
        },

        /**
         * Builds the approval timeline from live DOA data, same technique as
         * ApprovalDetail.controller.js#_buildLiveChain (CPE) - added so an
         * Admin/Unit-Initiator account (who can act at every step, not just
         * their own role) gets step-by-step progress instead of an identical
         * generic dialog on every click, which was making real, correctly-
         * advancing approvals look like nothing was happening (see
         * CAPEX_SESSION_LOG.md Open Issue #29).
         * @param {object} oBudget mapped Budget record
         * @returns {Array<object>} timeline rows for the view
         */
        _buildLiveChain: function (oBudget) {
            var aMatrix = this.readList("config", "/doaMatrix");
            var oRule = aMatrix.filter(function (r) { return r.id === oBudget.doaId; })[0];
            if (!oRule) { return []; }

            var bFinal = oBudget.status === "APPROVED";
            var iCurrent = -1;
            oRule.chain.forEach(function (step, idx) {
                if (step.role === oBudget.currentLevel) { iCurrent = idx; }
            });

            return oRule.chain.map(function (step, idx) {
                var sStatus = "WAITING";
                if (bFinal || (iCurrent > -1 && idx < iCurrent)) {
                    sStatus = "APPROVED";
                } else if (idx === iCurrent) {
                    sStatus = "PENDING";
                }
                return { role: step.role, approver: step.approver, status: sStatus, actedOn: null, comment: "" };
            });
        },

        _pendingIndex: function (aChain) {
            for (var i = 0; i < aChain.length; i++) {
                if (aChain[i].status === "PENDING") { return i; }
            }
            return -1;
        },

        formatNotYoursMsg: function (sLevel) {
            return "This budget is currently with " + sLevel + ". You are viewing it in read-only mode.";
        },

        // ------------------------------------------------------------------
        // DECISIONS
        // ------------------------------------------------------------------

        onApprove: function () {
            var that = this;
            var oDetail = this.getModel("detail").getData();
            var sComment = (oDetail.comment || "").trim() || "Approved.";

            var aChain = oDetail.chain;
            var iPending = this._pendingIndex(aChain);
            var bFinal = (iPending === aChain.length - 1);
            var sNext = bFinal ? null : aChain[iPending + 1].role;

            var sMsg = bFinal
                ? "This is the final approval. On confirming, the SAP Internal Order will be created automatically."
                : "Approve and route to " + sNext + "?";

            this.confirm(sMsg, function () {
                if (that.isGuarded("approve")) { return; }
                that.setBusy(true);
                that.callFunction("ApproveDocument", { DocType: "BUD", DocId: oDetail.budgetId, Comment: sComment })
                    .then(function () {
                        that.addAudit("BUD", oDetail.budgetId,
                            "Approved at " + oDetail.currentLevel, sComment);
                        // _loadLiveBudgetList alone only refreshes a fallback
                        // My-Approvals row (via Component.js's
                        // _mergeBudgetApprovals) - a real ApprovalInboxSet row
                        // (confirmed live 2026-11-02) needs its own re-read to
                        // actually drop after approving, same gap as CPE's
                        // ApprovalDetail.controller.js#onApprove. Chained
                        // after, not in parallel, so the merge step inside it
                        // sees the now-fresh budget list.
                        return that.getOwnerComponent()._loadLiveBudgetList().then(function () {
                            return that.getOwnerComponent()._loadLiveApprovalInbox();
                        }).then(function () {
                            that.releaseGuard("approve");
                            that.setBusy(false);
                            that.success(
                                bFinal
                                    ? that.i18n("budgetApprovedFinalMsg", [oDetail.budgetId])
                                    : that.i18n("budgetApprovedNextMsg", [oDetail.budgetId, sNext]),
                                "Approved"
                            );
                            that.navTo("approvalInbox");
                        });
                    })
                    .catch(function (oError) {
                        that.releaseGuard("approve");
                        that.setBusy(false);
                        that.error("Approval failed.\n\n" + that.extractODataError(oError), "Backend Error");
                    });
            }, this.i18n("approveBudgetTitle"));
        },

        onReject: function () {
            var oDetail = this.getModel("detail").getData();
            var sComment = (oDetail.comment || "").trim();
            var nCommentMinChars = this.getOwnerComponent().getModel("config").getProperty("/commentMinChars") || 10;

            if (sComment.length < nCommentMinChars) {
                this.byId("taComment").setValueState("Error");
                this.error(this.i18n("commentRequiredReject"));
                return;
            }
            this.byId("taComment").setValueState("None");

            var that = this;
            this.confirm(
                "Reject budget " + oDetail.budgetId + " and return it to " + oDetail.submittedBy + "?",
                function () {
                    if (that.isGuarded("reject")) { return; }
                    that.setBusy(true);
                    that.callFunction("RejectDocument", { DocType: "BUD", DocId: oDetail.budgetId, Comment: sComment })
                        .then(function () {
                            that.addAudit("BUD", oDetail.budgetId,
                                "Rejected at " + oDetail.currentLevel, sComment);
                            // See onApprove's comment above re: why this also
                            // needs its own ApprovalInboxSet re-read now.
                            return that.getOwnerComponent()._loadLiveBudgetList().then(function () {
                                return that.getOwnerComponent()._loadLiveApprovalInbox();
                            }).then(function () {
                                that.releaseGuard("reject");
                                that.setBusy(false);
                                that.success(that.i18n("budgetRejectedMsg", [oDetail.budgetId]), "Rejected");
                                that.navTo("approvalInbox");
                            });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("reject");
                            that.setBusy(false);
                            that.error("Rejection failed.\n\n" + that.extractODataError(oError), "Backend Error");
                        });
                },
                this.i18n("rejectBudgetTitle")
            );
        },

        // ------------------------------------------------------------------
        // NAV
        // ------------------------------------------------------------------

        onBack: function () {
            this.onNavBack("approvalInbox");
        }
    });
});
