sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.Evaluation", {

        onInit: function () {
            this.setModel(new JSONModel({}), "detail");
            this.getRouter().getRoute("evaluation").attachPatternMatched(this._onMatched, this);
        },

        /**
         * Re-reads the live CPE list before resolving the route (rather
         * than trusting whatever was cached at app load) - the backend now
         * omits a CPE UNDER_EVALUATION from anyone but its Unit Technical
         * approver(s), the initiator, or an admin (EDSK9B0EA7), so a stale
         * cache could otherwise show this page for a CPE the user can no
         * longer - or not yet - see, e.g. right after clicking a
         * notification for one submitted since the list last loaded. Once
         * refreshed, "not in my list" and "genuinely doesn't exist" are
         * indistinguishable from here (both read as a 404 from the backend's
         * point of view) and are handled the same way: bounced out, never
         * an empty form. A CPE that IS visible but isn't (or no longer is)
         * UNDER_EVALUATION gets redirected to its read-only detail page
         * instead.
         */
        _onMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").cpeId;
            var that = this;

            this.getOwnerComponent()._loadLiveCpeList().then(function () {
                that.resolveRecord("cpe", "/list", "cpeId", sId, function (oCPE) {
                    if (!oCPE) {
                        that.error(that.i18n("cpeNotAvailable", [sId]));
                        that.navTo("cpeList", {}, true);
                        return;
                    }
                    var sStatus = oCPE.status || "";
                    if (sStatus !== "UNDER_EVALUATION" && sStatus.indexOf("UNDER_EVALUA") !== 0) {
                        that.warn(that.i18n("cpeNotUnderEvaluation", [sId]));
                        that.navTo("cpeDetail", { cpeId: sId }, true);
                        return;
                    }

                    var oDetail = Object.assign({}, oCPE);
                    oDetail.vendors = (oCPE.vendors || []).map(function (v) { return Object.assign({}, v); });

                    that.getModel("detail").setData(oDetail);
                    that._evaluateVendorRule();
                });
            });
        },

        // ------------------------------------------------------------------
        // TECHNICAL
        // ------------------------------------------------------------------

        onComplianceChange: function () {
            // The remark becomes mandatory either way; highlight it.
            this.byId("taTechRemark").setValueState("None");
        },

        // ------------------------------------------------------------------
        // COMMERCIAL
        // ------------------------------------------------------------------

        onVendorSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oCtx = oItem.getBindingContext("detail");
            var iIndex = parseInt(oCtx.getPath().split("/").pop(), 10);

            var oModel = this.getModel("detail");
            var aVendors = oModel.getProperty("/vendors");

            aVendors.forEach(function (v, i) { v.selected = (i === iIndex); });
            oModel.setProperty("/vendors", aVendors);
            oModel.setProperty("/selectedVendorId", aVendors[iIndex].id);

            this._evaluateVendorRule();
        },

        /**
         * Shows the mandatory justification box when the pick is not L1.
         */
        _evaluateVendorRule: function () {
            var oModel = this.getModel("detail");
            var aVendors = oModel.getProperty("/vendors") || [];

            var oSel = aVendors.filter(function (v) { return v.selected; })[0];
            var oL1 = aVendors.filter(function (v) { return v.rank === "L1"; })[0];
            var bNonL1 = !!(oSel && oL1 && oSel.id !== oL1.id);

            oModel.setProperty("/showNonL1", bNonL1);

            if (bNonL1) {
                var nSaving = (Number(oL1.totalCost) || Number(oL1.quote) || 0) -
                    (Number(oSel.totalCost) || Number(oSel.quote) || 0);
                var nDays = (Number(oL1.deliveryDays) || 0) - (Number(oSel.deliveryDays) || 0);

                var aParts = [];
                aParts.push(nSaving >= 0
                    ? "TCO saving vs L1: " + this.formatter.inLakhs(nSaving)
                    : "TCO premium over L1: " + this.formatter.inLakhs(Math.abs(nSaving)));
                if (nDays !== 0) {
                    aParts.push(nDays > 0 ? nDays + " days faster" : Math.abs(nDays) + " days slower");
                }
                // Quality is hidden from the UI (functional ask) - no longer
                // surfaced in this narrative either, though the field itself
                // still exists on the vendor row unchanged.

                this.byId("txtSaving").setText(aParts.join(" · "));
            }
        },

        // ------------------------------------------------------------------
        // SAVE / SUBMIT
        // ------------------------------------------------------------------

        _validate: function () {
            var oDetail = this.getModel("detail").getData();
            var oConfig = this.getOwnerComponent().getModel("config");
            var nSpecsMinChars = oConfig.getProperty("/specsMinChars") || 15;
            var nNonL1MinChars = oConfig.getProperty("/nonL1MinChars") || 25;
            var nThreeQuoteLimit = oConfig.getProperty("/threeQuoteLimit") || 1000000;
            var aErrors = [];

            if (!oDetail.technicalRemark || oDetail.technicalRemark.trim().length < nSpecsMinChars) {
                aErrors.push("Technical remarks are required (at least " + nSpecsMinChars + " characters).");
                this.byId("taTechRemark").setValueState("Error");
            } else {
                this.byId("taTechRemark").setValueState("None");
            }

            var aVendors = oDetail.vendors || [];
            if (!aVendors.some(function (v) { return v.selected; })) {
                aErrors.push("Select the recommended vendor.");
            }
            if (Number(oDetail.amount) > nThreeQuoteLimit && aVendors.length < 3) {
                aErrors.push("Capex above ₹10 L requires three quotes (L1, L2 and L3).");
            }
            if (oDetail.showNonL1 && (!oDetail.nonL1Justification || oDetail.nonL1Justification.trim().length < nNonL1MinChars)) {
                aErrors.push("A non-L1 selection requires a written justification of at least " + nNonL1MinChars + " characters.");
                this.byId("taNonL1").setValueState("Error");
            }

            return aErrors;
        },

        onSave: function () {
            var oDetail = this.getModel("detail").getData();
            var oSelVendor = (oDetail.vendors || []).filter(function (v) { return v.selected; })[0];
            var that = this;

            if (this.isGuarded("save")) { return; }

            this.setBusy(true);
            this.callFunction("SaveEvaluation", {
                CpeId: oDetail.cpeId,
                // Edm.String(5) flag on the backend ("X"/""), same convention as
                // MetricsOn/IsCommonpool on Budget - not a JS boolean.
                TechCompliant: oDetail.technicalCompliant ? "X" : "",
                TechRemark: oDetail.technicalRemark || "",
                VendorSeq: (oSelVendor && oSelVendor.id) || "",
                Justification: oDetail.nonL1Justification || ""
            })
                .then(function () {
                    that.addAudit("CPE", oDetail.cpeId, "Technical compliance certified", oDetail.technicalRemark);
                    if (oDetail.nonL1Justification) {
                        that.addAudit("CPE", oDetail.cpeId, "Vendor selected (non-L1)", oDetail.nonL1Justification);
                    }
                    // Re-pulls the real persisted technical/vendor fields
                    // instead of hand-patching the local "cpe" model (the old
                    // _writeBack pattern) - see CAPEX_SESSION_LOG.md Open
                    // Issue #23.
                    return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                        that.releaseGuard("save");
                        that.setBusy(false);
                        that.toast("Evaluation saved.");
                    });
                })
                .catch(function (oError) {
                    that.releaseGuard("save");
                    that.setBusy(false);
                    that.error("Could not save evaluation.\n\n" + that.extractODataError(oError), "Backend Error");
                });
        },

        onSubmitEvaluation: function () {
            var aErrors = this._validate();
            if (aErrors.length) {
                this.error(aErrors.join("\n\n"), "Cannot submit evaluation");
                return;
            }

            var that = this;
            var oDetail = this.getModel("detail").getData();
            var oSelVendor = (oDetail.vendors || []).filter(function (v) { return v.selected; })[0];

            if (!oDetail.technicalCompliant) {
                this.confirm(
                    "The equipment is marked NOT compliant. The CPE will be returned to " +
                    oDetail.createdBy + " with your remarks.\n\nContinue?",
                    function () {
                        if (that.isGuarded("return")) { return; }
                        that.setBusy(true);
                        // Real backend call (ReturnCPE / zcl_capex_cpe=>return_cpe) -
                        // the old client-side _writeBack("DRAFT") never told the
                        // backend anything, so the CPE's real status/remarks never
                        // actually changed there (EDSK9B0EA7 test script step 6).
                        that.callFunction("ReturnCPE", {
                            CpeId: oDetail.cpeId,
                            Comment: oDetail.technicalRemark || ""
                        })
                            .then(function () {
                                that.addAudit("CPE", oDetail.cpeId, "Returned — technical non-compliance", oDetail.technicalRemark);
                                return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                                    that.releaseGuard("return");
                                    that.setBusy(false);
                                    that.toast("CPE returned to the initiator.");
                                    that.navTo("cpeList");
                                });
                            })
                            .catch(function (oError) {
                                that.releaseGuard("return");
                                that.setBusy(false);
                                that.error("Could not return the CPE.\n\n" + that.extractODataError(oError), "Backend Error");
                            });
                    },
                    "Return CPE"
                );
                return;
            }

            // Unit Technical is never a repeated *approval* level (it's
            // evaluation, auto-completed on Submit Evaluation above) - skip
            // it so this preview names the real next approver (EDSK9B0EA7).
            var aChain = this.skipUnitTechnical(this.resolveDOA(oDetail.capexType, oDetail.amount, "CPE"));
            var sFirst = aChain.length ? aChain[0].role : "HOD";

            this.confirm(
                "Submit the evaluation and route this CPE for approval?\n\nIt will go to " + sFirst + " first.",
                function () {
                    if (that.isGuarded("submit")) { return; }
                    that.setBusy(true);
                    that.callFunction("SubmitEvaluation", {
                        CpeId: oDetail.cpeId,
                        TechCompliant: oDetail.technicalCompliant ? "X" : "",
                        TechRemark: oDetail.technicalRemark || "",
                        VendorSeq: (oSelVendor && oSelVendor.id) || "",
                        Justification: oDetail.nonL1Justification || ""
                    })
                        .then(function () {
                            // Real reload instead of the old _writeBack/
                            // _seedApprovalChain local fakery - SubmitEvaluation
                            // itself sets Status/CurrLevel server-side, and
                            // _loadLiveCpeList's own _mergeCpeApprovals already
                            // derives the Approval Inbox entry from those live
                            // fields (same mechanism CPE approval already uses -
                            // see Open Issue #19), so no local chain-seeding is
                            // needed at all.
                            return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                                that.releaseGuard("submit");
                                that.setBusy(false);
                                that.success(that.i18n("evalSubmitted"), "Evaluation Submitted");
                                that.navTo("cpeList");
                            });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("submit");
                            that.setBusy(false);
                            that.error("Submission failed.\n\n" + that.extractODataError(oError));
                        });
                },
                "Submit Evaluation"
            );
        },

        onBack: function () {
            this.onNavBack("cpeList");
        }
    });
});
