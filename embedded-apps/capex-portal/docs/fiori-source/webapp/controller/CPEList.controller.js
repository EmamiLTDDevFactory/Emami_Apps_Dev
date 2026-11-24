sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/EventBus"
], function (BaseController, Filter, FilterOperator, EventBus) {
    "use strict";

    /**
     * Fiscal year values aren't stored the same way everywhere - see the
     * identical helper and comment in Dashboard.controller.js.
     * @param {string} v a fiscal year in either shape
     * @returns {string} last 4 digits, e.g. "2026"
     */
    function fyDigits(v) {
        return String(v || "").replace(/\D/g, "").slice(-4);
    }

    return BaseController.extend("zcapexportal.controller.CPEList", {

        onInit: function () {
            this.getRouter().getRoute("cpeList").attachPatternMatched(this._onMatched, this);
            this.enableSearchByKeyOrText("cbPlant");
            // The header's fiscal year selector is visible on every screen -
            // if it changes while already sitting here, rebuild the base
            // filter and tab counts rather than waiting for the next route
            // match.
            EventBus.getInstance().subscribe("app", "fiscalYearChanged", function () {
                this._buildAuthFilter();
                this._updateCounts();
                this.onFilter();
            }, this);
        },

        _onMatched: function () {
            this._buildAuthFilter();
            this._updateCounts();
            this._applyInitialStatus();
            this.onFilter();

            // Recompute once the initial live load actually lands - on a
            // hard refresh/direct nav this route can match before
            // Component.js's async _loadLiveCpeList has returned, so the
            // call above alone computes every tab count as 0 from the
            // still-empty list and nothing ever corrects it (same class of
            // bug as Dashboard's Open Issue #28). _pInitialLoad never
            // triggers a second read itself - it only observes the already
            // in-flight batch.
            var pInitialLoad = this.getOwnerComponent()._pInitialLoad;
            if (pInitialLoad) {
                pInitialLoad.then(function () {
                    this._updateCounts();
                    this.onFilter();
                }.bind(this));
            }
        },

        /**
         * One-shot hand-off from the Dashboard's "Approved CPEs" KPI tile
         * (Dashboard.controller.js#onKpiApprovedCPE) - if it set a status to
         * land on, select that tab and clear the flag so a later, ordinary
         * navigation to this screen (nav menu, back button) isn't stuck on
         * it.
         */
        _applyInitialStatus: function () {
            var oApp = this.getOwnerComponent().getModel("app");
            var sStatus = oApp.getProperty("/cpeListInitialStatus");
            if (sStatus) {
                this.byId("itbStatus").setSelectedKey(sStatus);
                oApp.setProperty("/cpeListInitialStatus", null);
            }
        },

        /**
         * Builds the plant-auth filter and scopes it to the header's
         * selected fiscal year.
         */
        _buildAuthFilter: function () {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            this._aAuthFilters = [];
            if (!oUser.isGlobal && (oUser.authorizedPlants || []).length) {
                this._aAuthFilters = [new Filter({
                    filters: oUser.authorizedPlants.map(function (p) {
                        return new Filter("plant", FilterOperator.EQ, p);
                    }),
                    and: false
                })];
            }

            var sFY = fyDigits(this.getOwnerComponent().getModel("app").getProperty("/fiscalYear"));
            this._aAuthFilters.push(new Filter({
                path: "fiscalYear",
                test: function (v) { return fyDigits(v) === sFY; }
            }));
        },

        /**
         * Populates the counts shown on the status tabs, scoped to the same
         * selected fiscal year as the list itself.
         */
        _updateCounts: function () {
            var sFY = fyDigits(this.getOwnerComponent().getModel("app").getProperty("/fiscalYear"));
            var aList = this.applyPlantAuth(this.readList("cpe", "/list"))
                .filter(function (c) { return fyDigits(c.fiscalYear) === sFY; });
            var count = function (s) {
                return String(aList.filter(function (c) { return c.status === s; }).length);
            };
            this.getOwnerComponent().getModel("app").setProperty("/cpeCounts", {
                all: String(aList.length),
                draft: count("DRAFT"),
                // Backend's Status field is MaxLength 12 - "UNDER_EVALUATION"
                // (16 chars) is silently truncated to "UNDER_EVALUA" by the
                // database, confirmed live on a real CPE.
                eval: count("UNDER_EVALUA"),
                appr: count("IN_APPROVAL"),
                done: count("APPROVED"),
                blocked: count("BLOCKED")
            });
        },

        // ------------------------------------------------------------------
        // FILTERING
        // ------------------------------------------------------------------

        onStatusTabSelect: function () {
            this.onFilter();
        },

        onFilter: function () {
            var aFilters = (this._aAuthFilters || []).slice();

            var sStatus = this.byId("itbStatus").getSelectedKey();
            if (sStatus && sStatus !== "ALL") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            var sQuery = this.byId("sfCPE").getValue();
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("cpeId", FilterOperator.Contains, sQuery),
                        new Filter("title", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            var sPlant = this.byId("cbPlant").getSelectedKey();
            if (sPlant) { aFilters.push(new Filter("plant", FilterOperator.EQ, sPlant)); }

            var sBudget = this.byId("cbBudget").getSelectedKey();
            if (sBudget) { aFilters.push(new Filter("budgetId", FilterOperator.EQ, sBudget)); }

            var oBinding = this.byId("tblCPE").getBinding("items");
            if (oBinding) {
                oBinding.filter(aFilters);
                this.byId("lblCount").setText("(" + oBinding.getLength() + ")");
            }
        },

        onClearFilter: function () {
            this.byId("sfCPE").setValue("");
            this.byId("cbPlant").setSelectedKey("");
            this.byId("cbBudget").setSelectedKey("");
            this.byId("itbStatus").setSelectedKey("ALL");
            this.onFilter();
        },

        onRefresh: function () {
            this.getOwnerComponent().getModel("cpe").refresh(true);
            this._updateCounts();
            this.toast("Refreshed");
        },

        onExport: function () {
            this.toast("Export runs through the Gateway export service once the backend is live.");
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

        /**
         * First PurchaseOrderSet row raised against this CPE - same
         * first-match convention ICDetail.controller.js already uses
         * (`this.readList("procure", "/po").filter(p => p.cpeId === ...)[0]`).
         * A CPE only gets a PO once it's progressed to that stage (CWIP
         * push → PO), so most rows legitimately have none yet.
         * @param {string} sCpeId this row's CPE id
         * @param {Array<object>} aPoList live procure>/po list
         * @returns {object|undefined} the matching PO row, if any
         */
        _findPoForCpe: function (sCpeId, aPoList) {
            return (aPoList || []).filter(function (p) { return p.cpeId === sCpeId; })[0];
        },

        formatPoNumber: function (sCpeId, aPoList) {
            var oPO = this._findPoForCpe(sCpeId, aPoList);
            return oPO ? oPO.poId : "-";
        },

        formatHasPo: function (sCpeId, aPoList) {
            return !!this._findPoForCpe(sCpeId, aPoList);
        },

        // ------------------------------------------------------------------
        // NAVIGATION
        // ------------------------------------------------------------------

        onRowPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("cpe");
            this.navTo("cpeDetail", { cpeId: oCtx.getProperty("cpeId") });
        },

        onBudgetPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("cpe");
            this.navTo("budgetDetail", { budgetId: oCtx.getProperty("budgetId") });
        },

        onPoPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("cpe");
            var oPO = this._findPoForCpe(oCtx.getProperty("cpeId"), this.readList("procure", "/po"));
            if (oPO) { this.navTo("poDetail", { poId: oPO.poId }); }
        },

        onCreate: function () {
            this.navTo("cpeCreate");
        }
    });
});
