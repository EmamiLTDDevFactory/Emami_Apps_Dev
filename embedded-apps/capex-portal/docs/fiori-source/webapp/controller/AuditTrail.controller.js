sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.AuditTrail", {

        onInit: function () {
            this.getRouter().getRoute("auditTrail").attachPatternMatched(this._onMatched, this);
            this.enableSearchByKeyOrText("cbDocType");
        },

        _onMatched: function () {
            this._stampPlants();
            this._buildAuthFilter();
            this.onFilter();
        },

        /**
         * AuditLogSet carries no plant field of its own (Open Issue #2), so
         * plant auth can't filter it directly like every other screen does.
         * Cross-references each row's docId back to its source document's
         * plant instead - same pattern BudgetDetail.controller.js already
         * uses for linked CPEs. Rows whose source document can't be found
         * (not loaded yet, or deleted) get plant: null, which fails closed -
         * they simply won't match any authorized-plant filter below, rather
         * than leaking to a user who shouldn't see them.
         */
        _stampPlants: function () {
            var mSources = {
                BUD: ["budget", "/list", "budgetId"],
                CPE: ["cpe", "/list", "cpeId"],
                PO: ["procure", "/po", "poId"],
                GRN: ["procure", "/grn", "grnId"],
                CWIP: ["procure", "/cwip", "cwipId"],
                IC: ["asset", "/ic", "icId"],
                QUOTA: ["config", "/quota/items", "id"]
            };

            var aStamped = this.readList("config", "/auditTrail").map(function (oRow) {
                var aSrc = mSources[oRow.docType];
                var oDoc = aSrc && this.readOne(aSrc[0], aSrc[1], aSrc[2], oRow.docId);
                return Object.assign({}, oRow, { plant: oDoc ? oDoc.plant : null });
            }, this);

            this.getOwnerComponent().getModel("config").setProperty("/auditTrail", aStamped);
        },

        /**
         * Builds the plant-auth filter from the now-stamped "plant" field,
         * same shape as CPEList.controller.js#_buildAuthFilter.
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
        },

        onFilter: function () {
            var aFilters = (this._aAuthFilters || []).slice();

            var sQuery = this.byId("sfAudit").getValue();
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("docId", FilterOperator.Contains, sQuery),
                        new Filter("action", FilterOperator.Contains, sQuery),
                        new Filter("user", FilterOperator.Contains, sQuery),
                        new Filter("comment", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            var sType = this.byId("cbDocType").getSelectedKey();
            if (sType) { aFilters.push(new Filter("docType", FilterOperator.EQ, sType)); }

            var oRange = this.byId("drsAudit");
            var dFrom = oRange.getDateValue();
            var dTo = oRange.getSecondDateValue();
            if (dFrom && dTo) {
                // Include the whole end day.
                var dEnd = new Date(dTo);
                dEnd.setHours(23, 59, 59, 999);
                aFilters.push(new Filter("timestamp", FilterOperator.BT,
                    dFrom.toISOString(), dEnd.toISOString()));
            }

            var oBinding = this.byId("tblAudit").getBinding("items");
            if (oBinding) {
                oBinding.filter(aFilters);
                this.byId("lblCount").setText("(" + oBinding.getLength() + ")");
            }
        },

        onClearFilter: function () {
            this.byId("sfAudit").setValue("");
            this.byId("cbDocType").setSelectedKey("");
            this.byId("drsAudit").setValue("");
            this.onFilter();
        },

        /**
         * Colour-codes the document type chip.
         * @param {string} s doc type
         * @returns {string} ValueState
         */
        formatDocTypeState: function (s) {
            var map = {
                BUD: "Information",
                CPE: "Success",
                PO: "Warning",
                IC: "Information",
                QUOTA: "None"
            };
            return map[s] || "None";
        },

        /**
         * Jumps to the source document from an audit line.
         * @param {sap.ui.base.Event} oEvent press event
         */
        onDocPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("config");
            var sType = oCtx.getProperty("docType");
            var sId = oCtx.getProperty("docId");

            switch (sType) {
                case "BUD": this.navTo("budgetDetail", { budgetId: sId }); break;
                case "CPE": this.navTo("cpeDetail", { cpeId: sId }); break;
                case "PO":  this.navTo("poDetail", { poId: sId }); break;
                case "IC":  this.navTo("icDetail", { icId: sId }); break;
                default:    this.toast("No detail screen for this document type.");
            }
        },

        onExport: function () {
            this.toast("Audit extract is generated by the Gateway export service once the backend is live.");
        },

        onPrint: function () {
            window.print();
        }
    });
});
