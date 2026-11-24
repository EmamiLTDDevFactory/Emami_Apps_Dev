sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.QuotaItemDetail", {

        onInit: function () {
            this.setModel(new JSONModel({}), "detail");
            this.getRouter().getRoute("quotaItemDetail").attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").quotaId;

            this.resolveRecord("config", "/quota/items", "id", sId, function (oItem) {
                if (!oItem) {
                    this.error(this.i18n("recordNotFound", [sId]));
                    this.navTo("unitQuota", {}, true);
                    return;
                }
                this.getModel("detail").setData(oItem);
            }.bind(this));
        },

        onBack: function () {
            this.onNavBack("unitQuota");
        }
    });
});
