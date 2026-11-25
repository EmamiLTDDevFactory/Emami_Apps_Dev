sap.ui.define([
    "zcapexportal/controller/BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.UnitQuota", {

        onInit: function () {
            this.getRouter().getRoute("unitQuota").attachPatternMatched(this._onMatched, this);
            this.enableSearchByKeyOrText("cbQuotaPlant");
            this._wireKpiTiles();
        },

        /**
         * Year Cap / Single Cap are fixed policy constants, not a count or
         * sum of rows - there's no subset of data for them to filter or
         * navigate to the way Dashboard/Capitalization's tiles do. The only
         * useful click behaviour is jumping to "Quota Consumption by Unit"
         * below, which is where these caps actually become actionable
         * (which units are near/over them). sap.m.VBox has no "press" event,
         * hence attachBrowserEvent - same approach as Dashboard/
         * Capitalization's own KPI tiles.
         */
        _wireKpiTiles: function () {
            ["tileQuotaYearCap", "tileQuotaSingleCap"].forEach(function (sId) {
                var oTile = this.byId(sId);
                if (oTile) {
                    oTile.attachBrowserEvent("click", this.onKpiCapPress, this);
                }
            }, this);
        },

        onKpiCapPress: function () {
            var oCard = this.byId("cardQuotaConsumption");
            if (oCard && oCard.getDomRef()) {
                oCard.getDomRef().scrollIntoView({ behavior: "smooth", block: "start" });
            }
        },

        _onMatched: function () {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            var sPlant = (oUser.authorizedPlants && oUser.authorizedPlants[0]) || "1100";
            var oConfig = this.getOwnerComponent().getModel("config");

            oConfig.setProperty("/quota/draft", {
                plant: sPlant, title: "", amount: null, justification: ""
            });

            this.byId("txtQuotaSubtitle").setText(this.i18n("quotaSubtitle", [
                this.formatter.rupees(this._yearCap(sPlant)),
                this.formatter.rupees(oConfig.getProperty("/quota/singleCap") || 50000)
            ]));

            this.byId("msQuota").setVisible(false);
        },

        onQuotaItemPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("config");
            this.navTo("quotaItemDetail", { quotaId: oCtx.getProperty("id") });
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

        /**
         * @returns {number} the live default year cap (falls back to the
         * ₹2,00,000 policy default until the backend has a ConfigSet row
         * for it). Only used where no specific plant's own cap applies yet
         * (e.g. the draft form before a plant is picked) - every row in the
         * per-unit list below derives its own cap from used+remaining
         * instead, which already reflects that plant's own
         * QUOTA_YEAR_CAP_<WERKS> override if the backend has one (Rev3 T10,
         * see Component.js#rollupQuotaByUnit).
         */
        _yearCap: function (sPlant) {
            var oConfig = this.getOwnerComponent().getModel("config");
            var mPlantCaps = oConfig.getProperty("/quota/plantCaps") || {};
            if (sPlant && mPlantCaps[sPlant] !== undefined) { return mPlantCaps[sPlant]; }
            return oConfig.getProperty("/quota/yearCap") || 200000;
        },

        /**
         * cap = used + remaining - rollupQuotaByUnit already resolved
         * `remaining` against this plant's own cap, so no separate lookup
         * is needed here (see Component.js#rollupQuotaByUnit).
         */
        formatUsedOf: function (nUsed, nRemaining) {
            var nCap = (Number(nUsed) || 0) + (Number(nRemaining) || 0);
            return this.formatter.rupees(nUsed) + " of " + this.formatter.rupees(nCap);
        },

        formatQuotaPct: function (nUsed, nRemaining) {
            var nCap = (Number(nUsed) || 0) + (Number(nRemaining) || 0);
            return nCap ? Math.min(100, ((Number(nUsed) || 0) / nCap) * 100) : 0;
        },

        formatQuotaState: function (nUsed, nRemaining) {
            var nCap = (Number(nUsed) || 0) + (Number(nRemaining) || 0);
            var p = nCap ? ((Number(nUsed) || 0) / nCap) * 100 : 0;
            if (p >= 90) { return "Error"; }
            if (p >= 70) { return "Warning"; }
            return "Success";
        },

        // ------------------------------------------------------------------
        // QUOTA RULE CHECK
        // ------------------------------------------------------------------

        onQuotaCheck: function () {
            var oDraft = this.getOwnerComponent().getModel("config").getProperty("/quota/draft");
            var oStrip = this.byId("msQuota");
            var oBtn = this.byId("btnQuotaSubmit");

            if (!oDraft.amount || Number(oDraft.amount) <= 0) {
                oStrip.setVisible(false);
                oBtn.setEnabled(true);
                return;
            }

            var oUnit = this.readList("config", "/quota/byUnit").filter(function (u) {
                return u.plant === oDraft.plant;
            })[0] || { used: 0, remaining: this._yearCap(oDraft.plant) };

            var oResult = this.checkQuota(oUnit.used, oDraft.amount, oDraft.plant);

            oStrip.setText(oResult.ok
                ? this.i18n("quotaOk", [
                    "Remaining after this item: " +
                    this.formatter.rupees(oUnit.remaining - Number(oDraft.amount)) + "."
                ])
                : oResult.reason);
            oStrip.setType(oResult.ok ? "Success" : "Error");
            oStrip.setVisible(true);
            oBtn.setEnabled(oResult.ok);
        },

        // ------------------------------------------------------------------
        // SUBMIT
        // ------------------------------------------------------------------

        onQuotaSubmit: function () {
            var oModel = this.getOwnerComponent().getModel("config");
            var oDraft = oModel.getProperty("/quota/draft");
            var aErrors = [];

            if (!oDraft.plant) { aErrors.push("Select the unit."); }
            if (!oDraft.title || !oDraft.title.trim()) {
                aErrors.push("Description is required.");
                this.byId("inpQuotaTitle").setValueState("Error");
            } else {
                this.byId("inpQuotaTitle").setValueState("None");
            }
            if (!oDraft.amount || Number(oDraft.amount) <= 0) {
                aErrors.push("Amount must be greater than zero.");
                this.byId("inpQuotaAmount").setValueState("Error");
            } else {
                this.byId("inpQuotaAmount").setValueState("None");
            }
            if (!oDraft.justification || !oDraft.justification.trim()) {
                aErrors.push("Justification is required.");
            }

            var oUnit = this.readList("config", "/quota/byUnit").filter(function (u) {
                return u.plant === oDraft.plant;
            })[0] || { used: 0 };

            var oCheck = this.checkQuota(oUnit.used, oDraft.amount, oDraft.plant);
            if (!oCheck.ok) { aErrors.push(oCheck.reason); }

            if (aErrors.length) {
                this.error(aErrors.join("\n\n"), this.i18n("quotaBlocked"));
                return;
            }

            var that = this;
            this.confirm(
                "Submit " + this.formatter.rupees(oDraft.amount) + " under the unit quota?\n\n" +
                "Unit quota capex is approved at unit level and does not go through the DOA chain.",
                function () {
                    that.setBusy(true);
                    that.callFunction("SubmitQuotaCapex", {
                        Plant: oDraft.plant,
                        Amount: oDraft.amount,
                        Title: oDraft.title,
                        Justification: oDraft.justification
                    })
                        .then(function () {
                            that.addAudit("QUOTA", "", "Unit quota capex submitted",
                                oDraft.title + " · " + that.formatter.rupees(oDraft.amount));
                            return that.getOwnerComponent()._loadLiveQuota().then(function () {
                                that.setBusy(false);
                                that.success("Quota capex submitted for unit approval.", "Submitted");
                                oModel.setProperty("/quota/draft", {
                                    plant: oDraft.plant, title: "", amount: null, justification: ""
                                });
                                that.byId("msQuota").setVisible(false);
                            });
                        })
                        .catch(function (oError) {
                            that.setBusy(false);
                            that.error("Submission failed.\n\n" + that.extractODataError(oError));
                        });
                },
                "Submit Quota Capex"
            );
        }
    });
});
