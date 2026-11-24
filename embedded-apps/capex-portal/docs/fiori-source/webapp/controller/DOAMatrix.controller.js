sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.DOAMatrix", {

        onInit: function () {
            this.setModel(new JSONModel({ chain: [] }), "sim");
            this.getRouter().getRoute("doaMatrix").attachPatternMatched(this._onMatched, this);
            this.enableSearchByKeyOrText("cbSimType");
        },

        _onMatched: function () {
            this.onSimulate();
        },

        /**
         * Resolves and displays the approver chain for the entered scenario.
         */
        onSimulate: function () {
            var sDocType = this.byId("cbSimDocType").getSelectedKey();
            var sType = this.byId("cbSimType").getSelectedKey();
            var nAmount = Number(this.byId("inpSimAmount").getValue()) || 0;

            var aChain = this.resolveDOA(sType, nAmount, sDocType);
            this.getModel("sim").setProperty("/chain", aChain);

            var oStrip = this.byId("msSim");

            if (!aChain.length) {
                oStrip.setText("No DOA rule matches " + this.formatter.rupees(nAmount) +
                    " for this capex type. The CPE would be blocked until the matrix is extended.");
                oStrip.setType("Error");
            } else {
                var nSla = aChain.reduce(function (s, r) { return s + (Number(r.slaDays) || 0); }, 0);
                oStrip.setText(
                    this.formatter.rupees(nAmount) + " routes through " + aChain.length +
                    " approval level" + (aChain.length > 1 ? "s" : "") +
                    ", ending at " + aChain[aChain.length - 1].role +
                    ". Total SLA " + nSla + " days."
                );
                oStrip.setType("Success");
            }

            oStrip.setVisible(true);
        },

        /**
         * Sums the SLA days across a chain.
         * @param {Array} aChain approval chain
         * @returns {string} label
         */
        formatTotalSla: function (aChain) {
            if (!aChain || !aChain.length) { return "-"; }
            var n = aChain.reduce(function (s, r) { return s + (Number(r.slaDays) || 0); }, 0);
            return n + " days";
        },

        onExport: function () {
            this.toast("DOA matrix export runs through the Gateway export service once the backend is live.");
        },

        /**
         * Filters the matrix table by the selected document type. An empty
         * docType on a rule ("" = generic/fallback, see
         * Component.js#mapDoaRuleEntity) always matches regardless of the
         * filter so rules not yet tagged with a doc type stay visible.
         */
        onMatrixFilter: function () {
            var sDocType = this.byId("cbMatrixDocType").getSelectedKey();
            var oBinding = this.byId("tblDoaMatrix").getBinding("items");
            if (!oBinding) { return; }

            if (!sDocType) {
                oBinding.filter([]);
                return;
            }
            oBinding.filter([new Filter({
                filters: [
                    new Filter("docType", FilterOperator.EQ, sDocType),
                    new Filter("docType", FilterOperator.EQ, "")
                ],
                and: false
            })]);
        },

        /**
         * @param {string} s "CPE", "BUD", or "" (generic/fallback rule)
         * @returns {string} display text for the Document Type column
         */
        formatDocType: function (s) {
            if (s === "CPE") { return "CPE"; }
            if (s === "BUD") { return "Budget (CJN)"; }
            return "Any";
        },

        /**
         * Like formatter.yesNo, but stays blank rather than showing "No"
         * while the backend hasn't configured this value yet.
         * @param {boolean|null} b flag, or null when unconfigured
         * @returns {string} Yes / No / "-"
         */
        formatAutoEscalate: function (b) {
            return (b === null || b === undefined) ? "-" : this.formatter.yesNo(b);
        }
    });
});
