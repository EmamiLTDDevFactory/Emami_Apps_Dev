sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.BudgetDetail", {

        onInit: function () {
            this.setModel(new JSONModel({}), "detail");
            this.getRouter().getRoute("budgetDetail").attachPatternMatched(this._onMatched, this);
            this._wireKpiTiles();
        },

        /**
         * "Committed"/"Spent" jump to PO List/GRN List - their own footers
         * already say "Open POs"/"Posted GRNs". Lands on the full list, not
         * filtered to this budget - neither screen has a budget filter
         * today, flagged rather than silently built. sap.m.VBox has no
         * "press" event (see Dashboard.controller.js#_wireKpiTiles), hence
         * attachBrowserEvent.
         */
        _wireKpiTiles: function () {
            var that = this;
            var oCommitted = this.byId("tileBudgetCommitted");
            if (oCommitted) { oCommitted.attachBrowserEvent("click", function () { that.navTo("poList"); }); }

            var oSpent = this.byId("tileBudgetSpent");
            if (oSpent) { oSpent.attachBrowserEvent("click", function () { that.navTo("grnList"); }); }
        },

        _onMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").budgetId;
            this.resolveRecord("budget", "/list", "budgetId", sId, function (oBudget) {
                if (!oBudget) {
                    this.error(this.i18n("recordNotFound", [sId]));
                    this.navTo("budgetList", {}, true);
                    return;
                }

                var oDetail = Object.assign({}, oBudget);

                // Derived position
                oDetail.available = (Number(oBudget.approved) || 0) -
                    (Number(oBudget.committed) || 0) -
                    (Number(oBudget.spent) || 0);

                // Cash-flow schedule with discounting and cumulative recovery
                oDetail.cashFlowRows = this._buildCashFlowRows(oBudget);

                // CPEs raised against this budget
                var aCPE = this.applyPlantAuth(this.readList("cpe", "/list")).filter(function (c) {
                    return c.budgetId === sId;
                });
                oDetail.cpes = aCPE;
                oDetail.cpeCount = String(aCPE.length);

                // Audit entries for this budget
                oDetail.audit = this.readList("config", "/auditTrail").filter(function (a) {
                    return a.docId === sId;
                });

                this.getModel("detail").setData(oDetail);
            }.bind(this));
        },

        /**
         * Builds the year-by-year discounted cash-flow table.
         * @param {object} oBudget budget record
         * @returns {Array<object>} rows
         */
        _buildCashFlowRows: function (oBudget) {
            var aFlows = oBudget.cashFlows || [];
            var r = (Number(oBudget.hurdleRate) || 0) / 100;
            var cumulative = -Math.abs(Number(oBudget.investment) || 0);
            var aRows = [];

            aFlows.forEach(function (cf, i) {
                var discounted = (Number(cf) || 0) / Math.pow(1 + r, i + 1);
                cumulative += discounted;
                aRows.push({
                    year: "Year " + (i + 1),
                    flow: Number(cf) || 0,
                    discounted: discounted,
                    cumulative: cumulative
                });
            });

            return aRows;
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

        /**
         * Stacked meter for this budget's position.
         * @param {number} spent spent amount
         * @param {number} committed committed amount
         * @param {number} approved approved amount
         * @returns {string} html
         */
        formatMeter: function (spent, committed, approved) {
            var pct = function (v) {
                if (!approved) { return 0; }
                return Math.max(0, Math.min(100, (Number(v) || 0) / Number(approved) * 100));
            };
            var pSpent = pct(spent);
            var pCommitted = Math.max(0, pct(committed));

            return '<div class="zcpxMeter" role="img" aria-label="Budget position">' +
                '<div class="zcpxMeterSeg zcpxMeterSeg--spent" style="width:' + pSpent.toFixed(2) + '%"></div>' +
                '<div class="zcpxMeterSeg zcpxMeterSeg--committed" style="width:' + pCommitted.toFixed(2) + '%"></div>' +
                '</div>';
        },

        formatIrr: function (v) {
            return (v === null || v === undefined || isNaN(v)) ? "—" : Number(v).toFixed(1) + "%";
        },

        formatNpv: function (v) {
            return (v === null || v === undefined || isNaN(v)) ? "—" : this.formatter.inLakhs(v);
        },

        formatPayback: function (v) {
            return (v === null || v === undefined || isNaN(v)) ? "—" : Number(v).toFixed(1) + " yrs";
        },

        formatHurdleFoot: function (r) {
            return "hurdle " + (Number(r) || 0).toFixed(1) + "%";
        },

        formatItemsTotal: function (aItems) {
            var nTotal = (aItems || []).reduce(function (n, o) { return n + (Number(o.amount) || 0); }, 0);
            return this.formatter.rupees(nTotal) + " (" + (aItems || []).length + " item" +
                ((aItems || []).length === 1 ? "" : "s") + ")";
        },

        // ------------------------------------------------------------------
        // ACTIONS
        // ------------------------------------------------------------------

        /**
         * Submits an existing DRAFT budget for approval. The record already
         * exists in BudgetSet (created when it was saved as a draft), so
         * this only calls SubmitDocument - it must never call createEntity
         * again, which would create a duplicate budget.
         */
        onSubmitPress: function () {
            var oDetail = this.getModel("detail").getData();
            var that = this;
            var aChain = this.resolveDOA(oDetail.capexType, oDetail.investment, "BUD");
            var sFirst = aChain.length ? aChain[0].role : "Finance";

            this.confirm(
                "Submit budget of " + this.formatter.rupees(oDetail.investment) +
                " for approval?\n\nIt will be routed to " + sFirst + " first.",
                function () {
                    that.setBusy(true);
                    that.callFunction("SubmitDocument", { DocType: "BUD", DocId: oDetail.budgetId })
                        .then(function () {
                            that.addAudit("BUD", oDetail.budgetId, "Budget submitted for approval", oDetail.title);
                            return that.getOwnerComponent()._loadLiveBudgetList().then(function () {
                                that.setBusy(false);
                                that.success(
                                    "Budget " + oDetail.budgetId + " submitted.\n\nRouted to " + sFirst + ".",
                                    "Submitted"
                                );
                                that.navTo("budgetList");
                            });
                        })
                        .catch(function (oError) {
                            that.setBusy(false);
                            that.error(
                                "Could not submit for approval.\n\n" + that.extractODataError(oError),
                                "Backend Error"
                            );
                        });
                },
                "Submit Budget"
            );
        },

        /**
         * Only ever shown for a DRAFT (view binds visible on
         * detail>/status) - items/cash flows/header can only be changed
         * while DRAFT, see the Budget Items email.
         */
        onEditPress: function () {
            this.navTo("budgetEdit", { budgetId: this.getModel("detail").getProperty("/budgetId") });
        },

        onCPEPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("detail");
            this.navTo("cpeDetail", { cpeId: oCtx.getProperty("cpeId") });
        },

        onCreateCPE: function () {
            // Pre-select this budget on the CPE creation screen.
            this.getOwnerComponent().getModel("cpe")
                .setProperty("/draft/budgetId", this.getModel("detail").getProperty("/budgetId"));
            this.navTo("cpeCreate");
        },

        onPrint: function () {
            window.print();
        },

        onBack: function () {
            this.onNavBack("budgetList");
        }
    });
});
