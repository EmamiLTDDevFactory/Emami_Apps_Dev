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

    return BaseController.extend("zcapexportal.controller.BudgetList", {

        onInit: function () {
            this.getRouter().getRoute("budgetList").attachPatternMatched(this._onMatched, this);
            this.enableSearchByKeyOrText("cbPlant");
            // Local FY ComboBox (cbFY) defaults to the header's current
            // selection but can be overridden per-screen (incl. "All years",
            // i.e. an empty key) without touching the global app>/fiscalYear.
            this._syncFYComboBox();
            // The header's fiscal year selector is visible on every screen -
            // if it changes while already sitting here, resync the local
            // ComboBox to it and rebuild the base filter (and reapply
            // whatever search/combo filters are currently set) rather than
            // waiting for the next route match.
            EventBus.getInstance().subscribe("app", "fiscalYearChanged", function () {
                this._syncFYComboBox();
                this._applyPlantAuthFilter();
                this.onFilter();
            }, this);
        },

        _onMatched: function () {
            this._applyPlantAuthFilter();
            this._updateCount();
        },

        /**
         * Defaults cbFY to the header's currently selected fiscal year.
         */
        _syncFYComboBox: function () {
            var oCbFY = this.byId("cbFY");
            if (oCbFY) {
                oCbFY.setSelectedKey(this.getOwnerComponent().getModel("app").getProperty("/fiscalYear"));
            }
        },

        /**
         * cbFY changed: rebuild the base (auth + FY) filter, then reapply
         * the other active filters on top of it.
         */
        onFYFilterChange: function () {
            this._applyPlantAuthFilter();
            this.onFilter();
        },

        /**
         * Enforces "other plant capex should not be visible" and scopes to
         * cbFY's own selection - an empty key ("All years") means no FY
         * filter at all, rather than silently falling back to the header's.
         */
        _applyPlantAuthFilter: function () {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            var oTable = this.byId("tblBudget");
            var oBinding = oTable.getBinding("items");
            if (!oBinding) { return; }

            this._aAuthFilters = [];
            if (!oUser.isGlobal && (oUser.authorizedPlants || []).length) {
                this._aAuthFilters = [new Filter({
                    filters: oUser.authorizedPlants.map(function (p) {
                        return new Filter("plant", FilterOperator.EQ, p);
                    }),
                    and: false
                })];
            }

            var sFY = fyDigits(this.byId("cbFY").getSelectedKey());
            if (sFY) {
                this._aAuthFilters.push(new Filter({
                    path: "fiscalYear",
                    test: function (v) { return fyDigits(v) === sFY; }
                }));
            }

            oBinding.filter(this._aAuthFilters);
        },

        _updateCount: function () {
            var oBinding = this.byId("tblBudget").getBinding("items");
            var n = oBinding ? oBinding.getLength() : 0;
            this.byId("lblCount").setText("(" + n + ")");
        },

        // ------------------------------------------------------------------
        // FILTERING
        // ------------------------------------------------------------------

        onFilter: function () {
            var aFilters = (this._aAuthFilters || []).slice();

            var sQuery = this.byId("sfBudget").getValue();
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("budgetId", FilterOperator.Contains, sQuery),
                        new Filter("title", FilterOperator.Contains, sQuery),
                        new Filter("plantName", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            var sPlant = this.byId("cbPlant").getSelectedKey();
            if (sPlant) { aFilters.push(new Filter("plant", FilterOperator.EQ, sPlant)); }

            var sType = this.byId("cbType").getSelectedKey();
            if (sType) { aFilters.push(new Filter("capexType", FilterOperator.EQ, sType)); }

            var sStatus = this.byId("cbStatus").getSelectedKey();
            if (sStatus) { aFilters.push(new Filter("status", FilterOperator.EQ, sStatus)); }

            this.byId("tblBudget").getBinding("items").filter(aFilters);
            this._updateCount();
        },

        onClearFilter: function () {
            this.byId("sfBudget").setValue("");
            this.byId("cbPlant").setSelectedKey("");
            this.byId("cbType").setSelectedKey("");
            this.byId("cbStatus").setSelectedKey("");
            this._syncFYComboBox();
            this._applyPlantAuthFilter();
            this.onFilter();
        },

        onRefresh: function () {
            this.getOwnerComponent().getModel("budget").refresh(true);
            this._updateCount();
            this.toast("Refreshed");
        },

        onExport: function () {
            this.toast("Export runs through the Gateway export service once the backend is live.");
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

        /**
         * Available = Approved - Committed - Spent
         * @param {number} a approved
         * @param {number} c committed
         * @param {number} s spent
         * @returns {string} formatted available
         */
        formatAvailable: function (a, c, s) {
            return this.formatter.inLakhs((Number(a) || 0) - (Number(c) || 0) - (Number(s) || 0));
        },

        /**
         * Colour of the available figure — red when exhausted, amber when low.
         * @param {number} a approved
         * @param {number} c committed
         * @param {number} s spent
         * @returns {string} ValueState
         */
        formatAvailState: function (a, c, s) {
            var approved = Number(a) || 0;
            var avail = approved - (Number(c) || 0) - (Number(s) || 0);
            if (approved === 0) { return "None"; }
            if (avail <= 0) { return "Error"; }
            if (avail / approved < 0.2) { return "Warning"; }
            return "Success";
        },

        // ------------------------------------------------------------------
        // NAVIGATION
        // ------------------------------------------------------------------

        onRowPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("budget");
            this.navTo("budgetDetail", { budgetId: oCtx.getProperty("budgetId") });
        },

        onShowLineItems: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("budget");
            var oBudget = oCtx && oCtx.getObject();
            if (!oBudget) { return; }
            this.openLineItemsPopover(oEvent.getSource(), oBudget.items, oBudget.title);
        },

        onCreate: function () {
            this.navTo("budgetCreate");
        }
    });
});
