sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.CWIPCreate", {

        onInit: function () {
            this.setModel(new JSONModel({}), "detail");
            this.getRouter().getRoute("cwipCreate").attachPatternMatched(this._onMatched, this);
            // Same key-vs-text ComboBox search gap originally fixed for every
            // Plant dropdown (CAPEX_SESSION_LOG.md Open Issue #8) - Asset
            // Class has the identical key/text split and was missed then.
            // See Open Issue #92.
            this.enableSearchByKeyOrText("cbAssetClass");
        },

        _onMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").cpeId;
            this.resolveRecord("cpe", "/list", "cpeId", sId, function (oCPE) {
                if (!oCPE) {
                    this.error(this.i18n("recordNotFound", [sId]));
                    this.navTo("cpeList", {}, true);
                    return;
                }

                var oVendor = (oCPE.vendors || []).filter(function (v) { return v.selected; })[0] || {};

                // Rev3 T6: only enforced once the live backend's CPE entity
                // type actually carries a vendor code field - never guessed,
                // see BaseController#hasEntityProperty. Until then every CPE
                // behaves exactly as before.
                var bVendorCodeRequired = this.hasEntityProperty("CPE", "Lifnr");

                this.getModel("detail").setData(Object.assign({}, oCPE, {
                    vendorName: oVendor.name || "-",
                    vendorDelivery: oVendor.deliveryDays || null,
                    vendorCodeBlocked: bVendorCodeRequired && !oCPE.vendorCode
                }));

                var sAssetClass = this._suggestAssetClass(oCPE.capexType);

                // Seed the draft from the CPE so the user re-types nothing.
                this.getOwnerComponent().getModel("procure").setProperty("/cwipDraft", {
                    cpeId: sId,
                    assetClass: sAssetClass,
                    // Rev3 T7: editable asset description, pre-filled from the
                    // suggested asset class's own display text.
                    assetDesc: this._assetClassText(sAssetClass),
                    wbsElement: "",
                    paymentTerms: oCPE.terms || "",
                    timeframeWeeks: oCPE.deliveryWeeks || null,
                    executionProcess: "TURNKEY",
                    costCenter: "",
                    profitCenter: "PC-" + oCPE.plant,
                    remarks: ""
                });
            }.bind(this));
        },

        /**
         * Maps a capex type to the most likely SAP asset class.
         * @param {string} sType capex type
         * @returns {string} asset class key
         */
        _suggestAssetClass: function (sType) {
            var map = { MANUFACTURING: "3000", MOULDS: "3100", IT: "4000" };
            return map[sType] || "3000";
        },

        /**
         * @param {string} sKey asset class key
         * @returns {string} its display text from procure>/assetClasses, or "" if unknown
         */
        _assetClassText: function (sKey) {
            var oMatch = this.readOne("procure", "/assetClasses", "key", sKey);
            return oMatch ? oMatch.text : "";
        },

        /**
         * Refreshes the (still-editable) description whenever the user picks
         * a different asset class - a convenience default, not a lock.
         */
        onAssetClassChange: function () {
            var sKey = this.byId("cbAssetClass").getSelectedKey();
            this.getOwnerComponent().getModel("procure").setProperty("/cwipDraft/assetDesc", this._assetClassText(sKey));
        },

        // ------------------------------------------------------------------
        // ACTIONS
        // ------------------------------------------------------------------

        _validate: function () {
            var oDraft = this.getOwnerComponent().getModel("procure").getProperty("/cwipDraft");
            var aErrors = [];

            if (!oDraft.assetClass) { aErrors.push("Asset class is required."); }
            if (!oDraft.costCenter) {
                aErrors.push("Cost center is required.");
                this.byId("inpCostCenter").setValueState("Error");
            } else {
                this.byId("inpCostCenter").setValueState("None");
            }
            if (!oDraft.timeframeWeeks || Number(oDraft.timeframeWeeks) <= 0) {
                aErrors.push("Execution timeframe is required.");
                this.byId("inpTimeframe").setValueState("Error");
            } else {
                this.byId("inpTimeframe").setValueState("None");
            }
            if (!oDraft.paymentTerms || oDraft.paymentTerms.trim().length < 15) {
                aErrors.push("Payment terms are required (at least 15 characters).");
                this.byId("taPaymentTerms").setValueState("Error");
            } else {
                this.byId("taPaymentTerms").setValueState("None");
            }

            return aErrors;
        },

        onSaveDraft: function () {
            this.toast("CWIP draft saved.");
        },

        onPushToSap: function () {
            var oDetail = this.getModel("detail").getData();
            if (oDetail.vendorCodeBlocked) {
                this.error(this.i18n("vendorCodeMissing"), "Cannot push to SAP");
                return;
            }

            var aErrors = this._validate();
            if (aErrors.length) {
                this.error(aErrors.join("\n\n"), "Cannot push to SAP");
                return;
            }

            var that = this;
            var oDraft = this.getOwnerComponent().getModel("procure").getProperty("/cwipDraft");

            this.confirm(
                "Push " + oDetail.cpeId + " to SAP?\n\n" +
                "This creates the Internal Order, the CWIP element and the Purchase Order for " +
                oDetail.vendorName + " at " + this.formatter.inLakhs(oDetail.amount) + ".",
                function () {
                    if (that.isGuarded("pushToSap")) { return; }
                    that.setBusy(true);

                    var oParams = {
                        CpeId: oDetail.cpeId,
                        AssetClass: oDraft.assetClass,
                        CostCenter: oDraft.costCenter,
                        WbsElement: oDraft.wbsElement,
                        PaymentTerms: oDraft.paymentTerms,
                        TimeframeWeeks: oDraft.timeframeWeeks,
                        ExecProcess: oDraft.executionProcess,
                        ProfitCenter: oDraft.profitCenter,
                        Remarks: oDraft.remarks
                    };
                    // Rev3 T7: only sent once the live service's CreateCWIP
                    // function import actually declares this parameter -
                    // otherwise OData rejects the call outright for an
                    // unknown parameter.
                    if (that.hasFunctionImport("CreateCWIP", ["AssetDesc"])) {
                        oParams.AssetDesc = oDraft.assetDesc;
                    }

                    that.callFunction("CreateCWIP", oParams)
                        .then(function (oResult) {
                            // Real reload of CWIP/PO instead of the old
                            // _createRecords() (fabricated ids client-side,
                            // e.g. "CW-2026-0030" - never what SAP actually
                            // created). CreateCWIP's return type (ActionResult)
                            // only carries one generic SapObject/Message field,
                            // not separate cwip/wbs/po ids, so the backend's own
                            // Message is shown verbatim rather than guessing a
                            // structured breakdown - see CAPEX_SESSION_LOG.md
                            // Open Issue #23.
                            that.addAudit("CPE", oDetail.cpeId, "CWIP pushed to SAP", oResult.Message || "");
                            return Promise.all([
                                that.getOwnerComponent()._loadLiveCwipList(),
                                that.getOwnerComponent()._loadLivePOList()
                            ]).then(function () {
                                that.releaseGuard("pushToSap");
                                that.setBusy(false);
                                that.success(
                                    (oResult.Message || "Pushed to SAP successfully.") +
                                    "\n\nThe budget commitment has been updated in real time.",
                                    "Posted to SAP"
                                );
                                that.navTo("poList");
                            });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("pushToSap");
                            that.setBusy(false);
                            that.error("SAP posting failed.\n\n" + that.extractODataError(oError));
                        });
                },
                "Push to SAP"
            );
        },

        onBack: function () {
            this.onNavBack("cpeList");
        }
    });
});
