sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (BaseController, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.ICList", {

        onInit: function () {
            this.getRouter().getRoute("icList").attachPatternMatched(this._onMatched, this);
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
            var sQuery = this.byId("sfIC").getValue();

            if (sQuery) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("icId", FilterOperator.Contains, sQuery),
                        new Filter("cpeId", FilterOperator.Contains, sQuery),
                        new Filter("title", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }

            var oBinding = this.byId("tblIC").getBinding("items");
            if (oBinding) { oBinding.filter(aFilters); }
        },

        onRowPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("asset");
            this.navTo("icDetail", { icId: oCtx.getProperty("icId") });
        },

        onCreate: function () {
            // Pick an eligible CPE: approved, GRN posted, no IC yet.
            var aIC = this.readList("asset", "/ic");
            var aDone = aIC.map(function (i) { return i.cpeId; });
            var aEligible = this.readList("procure", "/po").filter(function (p) {
                return p.grnPosted && aDone.indexOf(p.cpeId) === -1;
            });

            if (!aEligible.length) {
                this.warn(
                    "No CPE is ready for an installation certificate.\n\n" +
                    "A goods receipt must be posted before the IC can be uploaded."
                );
                return;
            }

            this.navTo("icDetail", { icId: "NEW-" + aEligible[0].cpeId });
        }
    });
});
