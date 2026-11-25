sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.Reports", {

        onInit: function () {
            this.setModel(new JSONModel({
                catalogue: [
                    {
                        key: "BUDGET_UTIL", icon: "sap-icon://money-bills",
                        title: "Budget Utilisation",
                        description: "Approved, committed, spent and available by unit, category and financial year."
                    },
                    {
                        key: "CYCLE_TIME", icon: "sap-icon://timesheet",
                        title: "Approval Cycle Time",
                        description: "Average days per DOA level, SLA breaches and auto-escalations."
                    },
                    {
                        key: "VENDOR", icon: "sap-icon://supplier",
                        title: "Vendor Selection Analysis",
                        description: "L1 vs selected vendor, negotiation savings and non-L1 justifications."
                    },
                    {
                        key: "CWIP", icon: "sap-icon://building",
                        title: "CWIP Ageing",
                        description: "Open capital work in progress by age band, with capitalization risk."
                    },
                    {
                        key: "SAVINGS", icon: "sap-icon://line-chart",
                        title: "Negotiation Savings",
                        description: "Savings realised against L1 quotes, by unit and by procurement officer."
                    },
                    {
                        key: "QUOTA", icon: "sap-icon://sales-quote",
                        title: "Unit Quota Consumption",
                        description: "Quota capex used and remaining against the ₹2 L annual cap per unit."
                    },
                    {
                        key: "SAP_RECON", icon: "sap-icon://synchronize",
                        title: "Portal vs SAP Reconciliation",
                        description: "Differences between portal commitments and SAP internal order balances."
                    },
                    {
                        key: "AUDIT", icon: "sap-icon://history",
                        title: "Compliance Audit Extract",
                        description: "Full approval trail for a date range, formatted for statutory audit."
                    }
                ]
            }), "rep");
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

        formatBalance: function (nApproved, nSpent) {
            return this.formatter.money((Number(nApproved) || 0) - (Number(nSpent) || 0));
        },

        formatPctText: function (nSpent, nApproved) {
            return Math.round(this.formatter.share(nSpent, nApproved)) + "%";
        },

        formatUtilState: function (nSpent, nApproved) {
            var p = this.formatter.share(nSpent, nApproved);
            if (p >= 90) { return "Error"; }
            if (p >= 75) { return "Warning"; }
            return "Success";
        },

        formatTrendText: function (nCommitted, nSpent) {
            return this.formatter.money(nSpent) + " spent of " + this.formatter.money(nCommitted) + " committed";
        },

        // ------------------------------------------------------------------
        // ACTIONS
        // ------------------------------------------------------------------

        onRunReport: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("rep");
            var sTitle = oCtx ? oCtx.getProperty("title") : "Report";
            this.toast(sTitle + " runs against the Gateway analytics service once the backend is live.");
        },

        onExportReport: function () {
            this.toast("Export to Excel is served by the Gateway export service once the backend is live.");
        }
    });
});
