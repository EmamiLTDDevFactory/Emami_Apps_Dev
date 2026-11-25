sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.GRNList", {

        onInit: function () {
            this.getRouter().getRoute("grnList").attachPatternMatched(this._onMatched, this);
            this.enableSearchByKeyOrText("cbPlant");
        },

        _onMatched: function () {
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
            this.onFilter();
        },

        onFilter: function () {
            var aFilters = (this._aAuthFilters || []).slice();

            var sQuery = this.byId("sfGRN").getValue();
            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("grnId", FilterOperator.Contains, sQuery),
                        new Filter("poId", FilterOperator.Contains, sQuery),
                        new Filter("title", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            var sPlant = this.byId("cbPlant").getSelectedKey();
            if (sPlant) { aFilters.push(new Filter("plant", FilterOperator.EQ, sPlant)); }

            var oBinding = this.byId("tblGRN").getBinding("items");
            if (oBinding) { oBinding.filter(aFilters); }
        },

        onClearFilter: function () {
            this.byId("sfGRN").setValue("");
            this.byId("cbPlant").setSelectedKey("");
            this.onFilter();
        },

        onRefresh: function () {
            this.getOwnerComponent().getModel("procure").refresh(true);
            this.toast("Synced from SAP MM.");
        },

        onPOPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("procure");
            this.navTo("poDetail", { poId: oCtx.getProperty("poId") });
        }
    });
});
