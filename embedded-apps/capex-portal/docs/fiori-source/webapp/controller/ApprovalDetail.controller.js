sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.ApprovalDetail", {

        onInit: function () {
            this.setModel(new JSONModel({}), "detail");
            this.getRouter().getRoute("approvalDetail").attachPatternMatched(this._onMatched, this);
            this._wireBudgetKpiTiles();
        },

        /**
         * The 4 Budget Position tiles jump to this CPE's own Budget Detail
         * page - same handler as the header's budget-id Link (onBudgetPress).
         * sap.m.VBox has no "press" event of its own (see
         * Dashboard.controller.js#_wireKpiTiles for the same note), hence
         * attachBrowserEvent instead of a declarative press binding.
         */
        _wireBudgetKpiTiles: function () {
            var aIds = ["tileTotalBudget", "tileAllocated", "tileSpentKpi", "tileBalance"];
            aIds.forEach(function (sId) {
                var oTile = this.byId(sId);
                if (oTile) {
                    oTile.attachBrowserEvent("click", this.onBudgetPress, this);
                }
            }, this);
        },

        _onMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").cpeId;
            this.resolveRecord("cpe", "/list", "cpeId", sId, function (oCPE) {
                if (!oCPE) {
                    this.error(this.i18n("recordNotFound", [sId]));
                    this.navTo("approvalInbox", {}, true);
                    return;
                }

                var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
                var aChain = this._buildLiveChain(oCPE);

                // Mirrors BudgetApprovalDetail's canAct check - driven by the
                // CPE's own live Status/CurrLevel (both real fields on CPESet),
                // not the old mock approval>/history (which only ever had a
                // handful of seeded demo CPE ids and never any real one).
                var bCanAct = oCPE.status === "IN_APPROVAL" && !!oCPE.currentLevel &&
                    (oUser.isAdmin || oUser.role === oCPE.currentLevel);

                var oBudget = this.readOne("budget", "/list", "budgetId", oCPE.budgetId) || {};
                var oBudgetPos = {
                    approved: Number(oBudget.approved) || 0,
                    committed: Number(oBudget.committed) || 0,
                    spent: Number(oBudget.spent) || 0,
                    available: (Number(oBudget.approved) || 0) -
                        (Number(oBudget.committed) || 0) -
                        (Number(oBudget.spent) || 0)
                };

                var oDetail = Object.assign({}, oCPE, {
                    chain: aChain,
                    budget: oBudgetPos,
                    canAct: bCanAct,
                    currentLevel: oCPE.currentLevel || "-",
                    daysPending: oCPE.daysPending || 0,
                    savingVsL1: this._calcSavingVsL1(oCPE),
                    comment: ""
                });

                this.getModel("detail").setData(oDetail);
                this._loadDocuments(sId);
            }.bind(this));
        },

        /**
         * Rev3 T5: approvers see every document read-only (no upload action
         * exists anywhere on this screen) - see Component.js#loadDocuments.
         * @param {string} sId CPE id
         */
        _loadDocuments: function (sId) {
            var oDetailModel = this.getModel("detail");
            this.getOwnerComponent().loadDocuments("CPE", sId).then(function (aDocs) {
                if (!aDocs) { return; }
                oDetailModel.setProperty("/documents", aDocs);
            });
        },

        /**
         * Builds the approval timeline from live DOA data (config>/doaMatrix,
         * already live-loaded from DoaRuleSet/DoaChainSet - see
         * Component.js#_loadLiveDoaMatrix) matched by the CPE's own Doaid,
         * instead of the old mock approval>/history. Steps before the CPE's
         * live CurrLevel are APPROVED, the matching step is PENDING, the
         * rest are WAITING; a fully APPROVED CPE marks every step APPROVED.
         * @param {object} oCPE mapped CPE record (see mapCpeEntity)
         * @returns {Array<object>} timeline rows for the view
         */
        _buildLiveChain: function (oCPE) {
            var aMatrix = this.readList("config", "/doaMatrix");
            var oRule = aMatrix.filter(function (r) { return r.id === oCPE.doaId; })[0];
            if (!oRule) { return []; }

            var bFinal = oCPE.status === "APPROVED";
            var iCurrent = -1;
            oRule.chain.forEach(function (step, idx) {
                if (step.role === oCPE.currentLevel) { iCurrent = idx; }
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

        _calcSavingVsL1: function (oCPE) {
            var aV = oCPE.vendors || [];
            var oSel = aV.filter(function (v) { return v.selected; })[0];
            var oL1 = aV.filter(function (v) { return v.rank === "L1"; })[0];
            if (!oSel || !oL1 || oSel.id === oL1.id) { return 0; }
            return (Number(oL1.totalCost) || Number(oL1.quote) || 0) -
                (Number(oSel.totalCost) || Number(oSel.quote) || 0);
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

        formatMeter: function (spent, committed, approved) {
            var pct = function (v) {
                if (!approved) { return 0; }
                return Math.max(0, Math.min(100, (Number(v) || 0) / Number(approved) * 100));
            };
            return '<div class="zcpxMeter" style="margin-top:0.75rem" role="img" aria-label="Budget position">' +
                '<div class="zcpxMeterSeg zcpxMeterSeg--spent" style="width:' + pct(spent).toFixed(2) + '%"></div>' +
                '<div class="zcpxMeterSeg zcpxMeterSeg--committed" style="width:' + pct(committed).toFixed(2) + '%"></div>' +
                '</div>';
        },

        formatBudgetVerdict: function (nAmount, nAvailable) {
            var a = Number(nAmount) || 0;
            var v = Number(nAvailable) || 0;
            if (a <= v) {
                return "This CPE of " + this.formatter.inLakhs(a) +
                    " is fully covered. Balance after approval: " + this.formatter.inLakhs(v - a) + ".";
            }
            return "This CPE of " + this.formatter.inLakhs(a) + " exceeds the available balance of " +
                this.formatter.inLakhs(v) + ". Shortfall " + this.formatter.inLakhs(a - v) +
                " — a budget increase or common pool draw is required.";
        },

        formatBudgetVerdictType: function (nAmount, nAvailable) {
            return (Number(nAmount) || 0) <= (Number(nAvailable) || 0) ? "Success" : "Error";
        },

        formatSaving: function (n) {
            n = Number(n) || 0;
            if (n === 0) { return ""; }
            return n > 0
                ? "Net saving against L1: " + this.formatter.inLakhs(n)
                : "Premium over L1: " + this.formatter.inLakhs(Math.abs(n));
        },

        formatNotYoursMsg: function (sLevel) {
            return "This CPE is currently with " + sLevel + ". You are viewing it in read-only mode.";
        },

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
                ? "This is the final approval. On confirming, the SAP Internal Order and CWIP will be created automatically."
                : "Approve and route to " + sNext + "?";

            this.confirm(sMsg, function () {
                // Guards against a double-click on the confirm dialog's Yes
                // button firing ApproveCPE twice (e.g. advancing the DOA
                // chain two levels at once) - see CAPEX_SESSION_LOG.md Open
                // Issue #90.
                if (that.isGuarded("approve")) { return; }
                that.setBusy(true);
                that.callFunction("ApproveCPE", { CpeId: oDetail.cpeId, Comment: sComment })
                    .then(function () {
                        that.addAudit("CPE", oDetail.cpeId, "Approved at " + oDetail.currentLevel, sComment);
                        // Reload must land BEFORE navigating back to the inbox -
                        // otherwise the inbox renders from pre-approval data
                        // (CAPEX_SESSION_LOG.md Open Issue #23). _loadLiveCpeList
                        // alone was enough while ApprovalInboxSet returned no
                        // real rows (everything in approval>/inbox was a
                        // fallback row, recomputed from cpe>/list by
                        // _mergeCpeApprovals as a side effect of the call
                        // above) - but now that ApprovalInboxSet returns real
                        // rows too (confirmed live 2026-11-02), a real row is
                        // never dropped by the merge, only by re-reading
                        // ApprovalInboxSet itself. Chained after, not in
                        // parallel, so its own internal merge step
                        // (Component.js#_loadLiveApprovalInbox) computes
                        // fallback rows from the now-fresh cpe>/list rather
                        // than the stale one.
                        return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                            return that.getOwnerComponent()._loadLiveApprovalInbox();
                        }).then(function () {
                            that.releaseGuard("approve");
                            that.setBusy(false);
                            that.success(
                                bFinal
                                    ? that.i18n("approvedFinalMsg", [oDetail.cpeId])
                                    : that.i18n("approvedMsg", [oDetail.cpeId, sNext]),
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
            }, this.i18n("approveTitle"));
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
                "Reject " + oDetail.cpeId + " and return it to " + oDetail.createdBy + "?\n\n" +
                "The committed amount will be released back to budget " + oDetail.budgetId + ".",
                function () {
                    if (that.isGuarded("reject")) { return; }
                    that.setBusy(true);
                    that.callFunction("RejectCPE", { CpeId: oDetail.cpeId, Comment: sComment })
                        .then(function () {
                            that.addAudit("CPE", oDetail.cpeId, "Rejected at " + oDetail.currentLevel, sComment);
                            return Promise.all([
                                that.getOwnerComponent()._loadLiveCpeList(),
                                that.getOwnerComponent()._loadLiveBudgetList()
                            ]).then(function () {
                                // See onApprove's comment above - a real
                                // ApprovalInboxSet row needs its own re-read to
                                // actually drop, not just a cpe/budget reload.
                                return that.getOwnerComponent()._loadLiveApprovalInbox();
                            }).then(function () {
                                that.releaseGuard("reject");
                                that.setBusy(false);
                                that.success(that.i18n("rejectedMsg", [oDetail.cpeId]), "Rejected");
                                that.navTo("approvalInbox");
                            });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("reject");
                            that.setBusy(false);
                            that.error("Rejection failed.\n\n" + that.extractODataError(oError), "Backend Error");
                        });
                },
                this.i18n("rejectTitle")
            );
        },

        onHold: function () {
            var oDetail = this.getModel("detail").getData();
            var sComment = (oDetail.comment || "").trim();
            var nCommentMinChars = this.getOwnerComponent().getModel("config").getProperty("/commentMinChars") || 10;

            if (sComment.length < nCommentMinChars) {
                this.byId("taComment").setValueState("Error");
                this.error(this.i18n("commentRequiredHold"));
                return;
            }
            this.byId("taComment").setValueState("None");

            var that = this;
            this.confirm(
                "Place " + oDetail.cpeId + " on hold?\n\n" + oDetail.createdBy +
                " will be notified and the SLA clock paused until the clarification is provided.",
                function () {
                    if (that.isGuarded("hold")) { return; }
                    that.setBusy(true);
                    that.callFunction("HoldCPE", { CpeId: oDetail.cpeId, Comment: sComment })
                        .then(function () {
                            that.addAudit("CPE", oDetail.cpeId, "On hold at " + oDetail.currentLevel, sComment);
                            // See onApprove's comment above re: why this also
                            // needs its own ApprovalInboxSet re-read now.
                            return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                                return that.getOwnerComponent()._loadLiveApprovalInbox();
                            }).then(function () {
                                that.releaseGuard("hold");
                                that.setBusy(false);
                                that.success(that.i18n("heldMsg", [oDetail.cpeId]), "On Hold");
                                that.navTo("approvalInbox");
                            });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("hold");
                            that.setBusy(false);
                            that.error("Could not place on hold.\n\n" + that.extractODataError(oError), "Backend Error");
                        });
                },
                this.i18n("holdTitle")
            );
        },

        /**
         * Capex rollout — available at any approval stage per the requirement.
         */
        onRollout: function () {
            var that = this;
            var oDetail = this.getModel("detail").getData();
            var sComment = (oDetail.comment || "").trim() || "Marked for capex rollout.";

            this.confirm(
                "Mark " + oDetail.cpeId + " for capex rollout?\n\n" +
                "The CPE is approved at this level and flagged for rollout to other units. " +
                "It continues through the remaining DOA levels.",
                function () {
                    if (that.isGuarded("rollout")) { return; }
                    that.setBusy(true);
                    that.callFunction("RolloutCPE", { CpeId: oDetail.cpeId, Comment: sComment })
                        .then(function () {
                            that.addAudit("CPE", oDetail.cpeId, "Marked for rollout", sComment);
                            // See onApprove's comment above re: why this also
                            // needs its own ApprovalInboxSet re-read now.
                            return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                                return that.getOwnerComponent()._loadLiveApprovalInbox();
                            }).then(function () {
                                that.releaseGuard("rollout");
                                that.setBusy(false);
                                that.success(that.i18n("rolloutMsg", [oDetail.cpeId]), "Rollout Flagged");
                                that.navTo("approvalInbox");
                            });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("rollout");
                            that.setBusy(false);
                            that.error("Rollout flagging failed.\n\n" + that.extractODataError(oError), "Backend Error");
                        });
                },
                this.i18n("rolloutTitle")
            );
        },

        // ------------------------------------------------------------------
        // STATE TRANSITIONS
        // ------------------------------------------------------------------

        _pendingIndex: function (aChain) {
            for (var i = 0; i < aChain.length; i++) {
                if (aChain[i].status === "PENDING") { return i; }
            }
            return -1;
        },

        // ------------------------------------------------------------------
        // NAV
        // ------------------------------------------------------------------

        onBudgetPress: function () {
            this.navTo("budgetDetail", { budgetId: this.getModel("detail").getProperty("/budgetId") });
        },

        onDownload: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("detail");
            var sUrl = oCtx && oCtx.getProperty("url");
            if (!sUrl) {
                this.toast(this.i18n("backendNotReady"));
                return;
            }
            window.open(sUrl, "_blank");
        },

        onBack: function () {
            this.onNavBack("approvalInbox");
        }
    });
});
