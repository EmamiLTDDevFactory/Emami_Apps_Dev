sap.ui.define([
    "zcapexportal/controller/BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.NotFound", {

        onBack: function () {
            this.navTo("dashboard", {}, true);
        }
    });
});
