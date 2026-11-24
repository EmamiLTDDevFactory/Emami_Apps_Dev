sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.PODetail", {

        onInit: function () {
            this.setModel(new JSONModel({}), "detail");
            this.getRouter().getRoute("poDetail").attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").poId;
            this.resolveRecord("procure", "/po", "poId", sId, function (oPO) {
                if (!oPO) {
                    this.error(this.i18n("recordNotFound", [sId]));
                    this.navTo("poList", {}, true);
                    return;
                }

                var aGrns = this.readList("procure", "/grn").filter(function (g) {
                    return g.poId === sId;
                });

                this.getModel("detail").setData(Object.assign({}, oPO, { grns: aGrns }));
            }.bind(this));
        },

        onConfirmPO: function () {
            var that = this;
            var oDetail = this.getModel("detail").getData();

            this.confirm(
                "Confirm PO " + oDetail.poId + " with " + oDetail.vendor + "?\n\n" +
                "The commitment of " + this.formatter.inLakhs(oDetail.amount) +
                " will be deducted from the available budget in real time.",
                function () {
                    if (that.isGuarded("confirmPo")) { return; }
                    that.setBusy(true);
                    that.callFunction("ConfirmPO", { PoId: oDetail.poId })
                        .then(function () {
                            that.addAudit("PO", oDetail.poId, "PO confirmed",
                                oDetail.vendor + " · " + that.formatter.inLakhs(oDetail.amount));
                            // Reload must land before re-deriving /detail - the
                            // old code set /status="APPROVED" optimistically
                            // regardless of what the backend actually did (see
                            // CAPEX_SESSION_LOG.md Open Issue #23).
                            return that.getOwnerComponent()._loadLivePOList().then(function () {
                                var oRefreshed = that.readOne("procure", "/po", "poId", oDetail.poId);
                                if (oRefreshed) {
                                    that.getModel("detail").setData(
                                        Object.assign({}, oRefreshed, { grns: that.getModel("detail").getProperty("/grns") })
                                    );
                                }
                                that.releaseGuard("confirmPo");
                                that.setBusy(false);
                                that.success(that.i18n("poConfirmed"), "Confirmed");
                            });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("confirmPo");
                            that.setBusy(false);
                            that.error("Confirmation failed.\n\n" + that.extractODataError(oError));
                        });
                },
                "Confirm PO"
            );
        },

        onCPEPress: function () {
            this.navTo("cpeDetail", { cpeId: this.getModel("detail").getProperty("/cpeId") });
        },

        onCreateIC: function () {
            this.navTo("icList");
        },

        onPrint: function () {
            window.print();
        },

        onBack: function () {
            this.onNavBack("poList");
        }
    });
});
