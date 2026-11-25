sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.Capitalization", {

        onInit: function () {
            this.setModel(new JSONModel({ summary: {}, overdueFilterActive: false }), "cap");
            this.getRouter().getRoute("capitalization").attachPatternMatched(this._onMatched, this);
            this._wireKpiTiles();
        },

        _onMatched: function () {
            this._buildSummary();
        },

        /**
         * "Over 45 Days" filters the CWIP ageing table already on this same
         * screen - not a page jump, same reasoning as Approval Inbox's SLA
         * tiles (data is already here). The other 3 tiles summarize the
         * whole list (no subset to filter to) and are left as plain
         * display. sap.m.VBox has no "press" event, hence attachBrowserEvent.
         */
        _wireKpiTiles: function () {
            var oTile = this.byId("tileCapOverdue");
            if (oTile) {
                oTile.attachBrowserEvent("click", this.onFilterOverdue, this);
            }
        },

        onFilterOverdue: function () {
            var nOverdueDays = this.getOwnerComponent().getModel("config").getProperty("/cwipOverdueDays") || 45;
            var oBinding = this.byId("tblAgeing").getBinding("items");
            if (oBinding) {
                oBinding.filter([new Filter("ageDays", FilterOperator.GT, nOverdueDays)]);
            }
            this.getModel("cap").setProperty("/overdueFilterActive", true);
        },

        onClearAgeingFilter: function () {
            var oBinding = this.byId("tblAgeing").getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
            }
            this.getModel("cap").setProperty("/overdueFilterActive", false);
        },

        _buildSummary: function () {
            var aAgeing = this.applyPlantAuth(this.readList("asset", "/cwipAgeing"));
            var nOverdueDays = this.getOwnerComponent().getModel("config").getProperty("/cwipOverdueDays") || 45;

            var nValue = aAgeing.reduce(function (s, r) { return s + (Number(r.value) || 0); }, 0);
            var nAge = aAgeing.reduce(function (s, r) { return s + (Number(r.ageDays) || 0); }, 0);

            this.getModel("cap").setProperty("/summary", {
                count: aAgeing.length,
                value: nValue,
                avgAge: aAgeing.length ? Math.round(nAge / aAgeing.length) : 0,
                overdue: aAgeing.filter(function (r) { return Number(r.ageDays) > nOverdueDays; }).length
            });
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

        formatSummaryFoot: function (nCount, nAge) {
            return nCount + " assets · avg " + nAge + " days old";
        },

        formatOverdueMsg: function (n, nOverdueDays) {
            return n + " CWIP item" + (n === 1 ? " has" : "s have") +
                " been open more than " + (nOverdueDays || 45) + " days. Depreciation is not running on these assets and the" +
                " balance sheet overstates capital work in progress.";
        },

        formatIcStatus: function (s) {
            var map = { PENDING: "IC Pending", NOT_STARTED: "IC Not Started", CAPITALIZED: "Capitalized" };
            return map[s] || s;
        },

        // ------------------------------------------------------------------
        // ACTIONS
        // ------------------------------------------------------------------

        onUploadIC: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("asset");
            var sCwipId = oCtx.getProperty("cwipId");

            var oCwip = this.readOne("procure", "/cwip", "cwipId", sCwipId);
            if (!oCwip) {
                this.warn(
                    "This CWIP has no linked CPE in the current data set.\n\n" +
                    "On the live system the IC screen opens directly from the CWIP element."
                );
                return;
            }

            this.navTo("icDetail", { icId: "NEW-" + oCwip.cpeId });
        },

        onICPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("asset");
            this.navTo("icDetail", { icId: oCtx.getProperty("icId") });
        }
    });
});
