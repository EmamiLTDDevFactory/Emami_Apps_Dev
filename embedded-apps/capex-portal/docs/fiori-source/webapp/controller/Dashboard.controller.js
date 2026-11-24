sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/core/format/NumberFormat",
    "sap/ui/core/EventBus"
], function (BaseController, NumberFormat, EventBus) {
    "use strict";

    /**
     * Fiscal year values aren't stored the same way everywhere: the header
     * selector and MockData's seed use "FY2026", live BudgetSet/CPESet
     * return plain "2026" (confirmed live 2026-11-02). Reducing both sides
     * to their last 4 digits before comparing makes the filter correct
     * regardless of which shape a given record happens to be in - same
     * technique BudgetCreate.controller.js/CPECreate.controller.js already
     * use when stamping a new document's Fiscalyear.
     * @param {string} v a fiscal year in either shape
     * @returns {string} last 4 digits, e.g. "2026"
     */
    function fyDigits(v) {
        return String(v || "").replace(/\D/g, "").slice(-4);
    }

    return BaseController.extend("zcapexportal.controller.Dashboard", {

        onInit: function () {
            this.getRouter().getRoute("dashboard").attachPatternMatched(this._onMatched, this);
            this._wireKpiTiles();
            // The header's fiscal year selector is visible (and changeable)
            // on every screen, not just this one - if it changes while
            // already sitting on the Dashboard, recompute immediately rather
            // than waiting for the next time this route is matched.
            EventBus.getInstance().subscribe("app", "fiscalYearChanged", this._recalcRollup, this);
        },

        /**
         * Makes the 8 data-backed KPI tiles clickable, each jumping to the
         * screen that actually explains its number. sap.m.VBox (what these
         * tiles are built from) has no "press" event of its own, so this
         * attaches a plain DOM click listener instead - same visual design,
         * just clickable. "Avg Approval Cycle" and "Negotiation Savings YTD"
         * are deliberately left out: both are still hardcoded to 0 with no
         * backend source (see _recalcRollup's comment), so there is nothing
         * for either of them to navigate to yet.
         */
        _wireKpiTiles: function () {
            var mTiles = {
                tileApprovedCPE: this.onKpiApprovedCPE,
                tileCommitted: this.onKpiCommitted,
                tileSpent: this.onKpiSpent,
                tileCapitalized: this.onKpiCapitalized,
                tileAvailable: this.onKpiAvailable,
                tileCwipPending: this.onGoCapitalization,
                tilePendingApprovals: this.onGoApprovals,
                tileSlaBreach: this.onKpiSlaBreach
            };

            Object.keys(mTiles).forEach(function (sId) {
                var oTile = this.byId(sId);
                if (oTile) {
                    oTile.attachBrowserEvent("click", mTiles[sId], this);
                }
            }, this);
        },

        _onMatched: function () {
            // Recompute immediately (correct right away if the initial live
            // load already landed, e.g. navigating back here after visiting
            // other screens) AND again once the initial batch of loaders
            // Component.js kicks off at startup actually resolves - on a
            // hard refresh this route matches before any of those reads can
            // possibly have returned, so the first call alone always computed
            // zeros from freshly-cleared arrays and nothing ever corrected it
            // (see CAPEX_SESSION_LOG.md Open Issue #28). _pInitialLoad never
            // triggers a second read itself - it only observes the already
            // in-flight batch.
            this._recalcRollup();
            var pInitialLoad = this.getOwnerComponent()._pInitialLoad;
            if (pInitialLoad) {
                pInitialLoad.then(this._recalcRollup.bind(this));
            }
        },

        /**
         * Builds the dashboard rollup entirely from live entity sets - no
         * demo/fabricated figures. approvedCPE/capitalized are now summed
         * from the live CPE/InstallCert lists (CAPEX_SESSION_LOG.md Open
         * Issue #28) - cwip ageing, cycle time, savings and the by-category
         * split still have no backend source and are left at zero/empty
         * rather than guessed.
         *
         * Scoped to the header's selected fiscal year (app>/fiscalYear).
         * Only BudgetSet/CPESet actually carry a Fiscalyear field on the
         * backend, so only the figures derived from Budgets/CPEs (and the
         * approval queue, cross-referenced back to its underlying Budget/CPE
         * below) are scoped by it. CwipAgeingSet/InstallCertSet have no
         * fiscal year field at all - Capitalized and CWIP Pending
         * Capitalization deliberately stay unscoped (always all years)
         * rather than guessed via a join the backend doesn't support.
         */
        _recalcRollup: function () {
            var sFY = fyDigits(this.getOwnerComponent().getModel("app").getProperty("/fiscalYear"));
            var aAllBudgets = this.applyPlantAuth(this.readList("budget", "/list"));
            var aAllCPEs = this.applyPlantAuth(this.readList("cpe", "/list"));
            var aBudgets = aAllBudgets.filter(function (b) { return fyDigits(b.fiscalYear) === sFY; });
            var aCPEs = aAllCPEs.filter(function (c) { return fyDigits(c.fiscalYear) === sFY; });

            var mBudgetFY = {};
            aAllBudgets.forEach(function (b) { mBudgetFY[b.budgetId] = fyDigits(b.fiscalYear); });
            var mCpeFY = {};
            aAllCPEs.forEach(function (c) { mCpeFY[c.cpeId] = fyDigits(c.fiscalYear); });
            var aInbox = this.applyPlantAuth(this.readList("approval", "/inbox")).filter(function (r) {
                var sRowFY = r.docType === "BUD" ? mBudgetFY[r.docId] : mCpeFY[r.docId];
                return sRowFY === sFY;
            });

            var aCwip = this.applyPlantAuth(this.readList("asset", "/cwipAgeing"));
            var aIC = this.applyPlantAuth(this.readList("asset", "/ic"));
            var oApp = this.getOwnerComponent().getModel("app");

            var totalBudget = 0, committed = 0, spent = 0;
            aBudgets.forEach(function (b) {
                totalBudget += Number(b.approved) || 0;
                committed += Number(b.committed) || 0;
                spent += Number(b.spent) || 0;
            });

            var cwipPending = 0;
            aCwip.forEach(function (c) { cwipPending += Number(c.value) || 0; });

            var aCwipAges = aCwip
                .map(function (c) { return c.ageDays; })
                .filter(function (d) { return d !== null && d !== undefined; });
            var cwipAvgAge = aCwipAges.length
                ? Math.round(aCwipAges.reduce(function (s, d) { return s + d; }, 0) / aCwipAges.length)
                : 0;

            var approvedCPE = aCPEs
                .filter(function (c) { return c.status === "APPROVED"; })
                .reduce(function (s, c) { return s + (Number(c.amount) || 0); }, 0);

            var capitalized = aIC
                .filter(function (i) { return i.status === "CAPITALIZED"; })
                .reduce(function (s, i) { return s + (Number(i.totalCapitalCost) || 0); }, 0);

            oApp.setProperty("/dashboard", {
                totalBudget: totalBudget,
                approvedCPE: approvedCPE,
                committed: committed,
                spent: spent,
                capitalized: capitalized,
                available: Math.max(0, totalBudget - committed - spent),
                cwipPending: cwipPending,
                cwipAssets: aCwip.length,
                cwipAvgAge: cwipAvgAge,
                pendingCount: aInbox.length,
                pendingValue: aInbox.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0),
                slaBreachCount: aInbox.filter(function (r) { return Number(r.daysPending) > 5; }).length,
                cycleTimeDays: 0,   // no backend source yet
                cycleTimeBefore: 0, // no backend source yet
                savingsYTD: 0,      // no backend source yet
                byCategory: this._buildByCategory(aBudgets),
                // The queue table must agree with the KPI tiles above it, so
                // it is derived from the same live inbox.
                queue: this._buildQueue(aInbox)
            });
        },

        /**
         * Groups live budgets by CAPEX category for the "Budget by category" card.
         * @param {Array} aBudgets plant-filtered live budgets
         * @returns {Array} one row per category, highest approved first
         */
        _buildByCategory: function (aBudgets) {
            var mCategories = {};

            aBudgets.forEach(function (b) {
                var k = b.category || "Uncategorised";
                if (!mCategories[k]) {
                    mCategories[k] = { category: k, approved: 0, spent: 0 };
                }
                mCategories[k].approved += Number(b.approved) || 0;
                mCategories[k].spent += Number(b.spent) || 0;
            });

            return Object.keys(mCategories)
                .map(function (k) { return mCategories[k]; })
                .sort(function (a, b) { return b.approved - a.approved; });
        },

        /**
         * Groups the approval inbox by DOA level for the queue table. Each
         * row can mix document types (Budget/CPE) at the same level, so
         * `byType` tallies a per-docType count alongside the overall
         * `count` - see formatQueueItems, which only renders this breakdown
         * when a row actually mixes more than one type.
         * @param {Array} aInbox pending approvals
         * @returns {Array} one row per level, worst ageing first
         */
        _buildQueue: function (aInbox) {
            var mLevels = {};

            aInbox.forEach(function (r) {
                var k = r.currentLevel || "Unassigned";
                if (!mLevels[k]) {
                    mLevels[k] = { level: k, count: 0, value: 0, days: 0, maxDays: 0, byType: {} };
                }
                var o = mLevels[k];
                o.count += 1;
                o.value += Number(r.amount) || 0;
                o.days += Number(r.daysPending) || 0;
                o.maxDays = Math.max(o.maxDays, Number(r.daysPending) || 0);
                var sType = r.docType || "Other";
                o.byType[sType] = (o.byType[sType] || 0) + 1;
            });

            return Object.keys(mLevels).map(function (k) {
                var o = mLevels[k];
                o.days = Math.round(o.days / o.count);
                o.state = o.maxDays > 5 ? "Error" : (o.maxDays > 3 ? "Warning" : "Success");
                return o;
            }).sort(function (a, b) { return b.maxDays - a.maxDays; });
        },

        // ------------------------------------------------------------------
        // FORMATTERS local to this view
        // ------------------------------------------------------------------

        /**
         * Renders the stacked utilisation meter as inline HTML.
         * @param {number} spent spent amount
         * @param {number} committed committed amount
         * @param {number} approvedCPE approved CPE value
         * @param {number} total total budget
         * @returns {string} html
         */
        formatMeter: function (spent, committed, approvedCPE, total) {
            var pct = function (v) {
                if (!total) { return 0; }
                return Math.max(0, Math.min(100, (Number(v) || 0) / Number(total) * 100));
            };

            var pSpent = pct(spent);
            var pCommitted = Math.max(0, pct(committed) - pSpent);
            var pReserved = Math.max(0, pct(approvedCPE) - pct(committed));

            return '<div class="zcpxMeter" role="img" aria-label="Budget utilisation">' +
                '<div class="zcpxMeterSeg zcpxMeterSeg--spent" style="width:' + pSpent.toFixed(2) + '%"></div>' +
                '<div class="zcpxMeterSeg zcpxMeterSeg--committed" style="width:' + pCommitted.toFixed(2) + '%"></div>' +
                '<div class="zcpxMeterSeg zcpxMeterSeg--reserved" style="width:' + pReserved.toFixed(2) + '%"></div>' +
                '</div>';
        },

        /**
         * "60% of total budget"
         * @param {number} part part value
         * @param {number} total total value
         * @returns {string} label
         */
        formatShareText: function (part, total) {
            if (!total) { return ""; }
            return Math.round((Number(part) || 0) / Number(total) * 100) + "% of total budget";
        },

        /**
         * Approval queue row's "Items" cell, second line - a small caption
         * under the plain count ("3") breaking it down by document type
         * ("2 CPE · 1 Budget") so Budget and CPE rows aren't
         * indistinguishable once they share a DOA level. Empty when the row
         * is only one document type - CAPEX_SESSION_LOG.md Open Issue #104
         * replaced the old single-line "3 (2 CPE · 1 Budget)" cell (a long
         * string squeezed into a narrow numeric column) with this as a
         * second, muted line instead - see hasQueueBreakdown for the
         * matching visibility check.
         * @param {object} mByType count per docType, e.g. {BUD: 1, CPE: 2}
         * @returns {string} caption text, or "" when there's only one type
         */
        formatQueueBreakdown: function (mByType) {
            var mLabels = { BUD: "Budget", CPE: "CPE" };
            var aTypes = mByType ? Object.keys(mByType) : [];

            if (aTypes.length <= 1) { return ""; }

            return aTypes.map(function (k) {
                return mByType[k] + " " + (mLabels[k] || k);
            }).join(" · ");
        },

        /**
         * @param {object} mByType count per docType
         * @returns {boolean} true when the row mixes more than one type -
         *   same condition formatQueueBreakdown uses to decide whether to
         *   return anything, reused here to hide the second line entirely
         *   rather than rendering an empty one.
         */
        hasQueueBreakdown: function (mByType) {
            return !!(mByType && Object.keys(mByType).length > 1);
        },

        /**
         * "14 assets, avg 35 days old"
         * @param {number} count asset count
         * @param {number} age average age
         * @returns {string} label
         */
        formatCwipFoot: function (count, age) {
            return count + " assets, avg " + age + " days old";
        },

        /**
         * "down from 24 days"
         * @param {string} sTemplate i18n template
         * @param {number} before previous value
         * @returns {string} label
         */
        formatDownFrom: function (sTemplate, before) {
            return "down from " + before + " days";
        },

        /**
         * SLA alert strip text.
         * @param {number} n breach count
         * @returns {string} label
         */
        formatSlaStrip: function (n) {
            return n + " CPE" + (n === 1 ? " has" : "s have") +
                " been pending more than 5 days and breached SLA. Auto-escalation has been triggered.";
        },

        /**
         * "95.00 L of 1.80 Cr" - each side auto-scales independently
         * (formatter.money), so a small spent-vs-large-approved pair
         * doesn't force the smaller one into an awkward "0.XX Cr".
         * @param {number} spent spent amount
         * @param {number} approved approved amount
         * @returns {string} label
         */
        formatSpentOfApproved: function (spent, approved) {
            return this.formatter.money(spent) + " of " + this.formatter.money(approved);
        },

        /**
         * Progress bar state from utilisation.
         * @param {number} spent spent amount
         * @param {number} approved approved amount
         * @returns {string} ValueState
         */
        formatUtilState: function (spent, approved) {
            var p = this.formatter.share(spent, approved);
            if (p >= 90) { return "Error"; }
            if (p >= 75) { return "Warning"; }
            return "Success";
        },

        /**
         * Readable IC status.
         * @param {string} s status
         * @returns {string} label
         */
        formatIcStatus: function (s) {
            var map = { PENDING: "IC Pending", NOT_STARTED: "IC Not Started", CAPITALIZED: "Capitalized" };
            return map[s] || s;
        },

        // ------------------------------------------------------------------
        // ACTIONS
        // ------------------------------------------------------------------

        onGoApprovals: function () { this.navTo("approvalInbox"); },
        onGoCapitalization: function () { this.navTo("capitalization"); },
        onGoIC: function () { this.navTo("icList"); },
        onNewBudget: function () { this.navTo("budgetCreate"); },
        onNewCPE: function () { this.navTo("cpeCreate"); },

        /**
         * "Approved CPEs" tile - jumps to the CPE list pre-filtered to the
         * Approved tab, via the same transient hand-off property CPEList's
         * own _onMatched reads and clears (see that file).
         */
        onKpiApprovedCPE: function () {
            this.getOwnerComponent().getModel("app").setProperty("/cpeListInitialStatus", "APPROVED");
            this.navTo("cpeList");
        },

        onKpiCommitted: function () { this.navTo("poList"); },
        onKpiSpent: function () { this.navTo("grnList"); },

        /**
         * "Capitalized" tile - jumps to the IC list. Unlike Approved
         * CPEs/SLA Breaches, ICList has no status filter at all today (only
         * a free-text search - see ICList.controller.js), so this lands on
         * every IC, not only the capitalized ones. Flagged rather than
         * silently adding a new filter control there.
         */
        onKpiCapitalized: function () { this.navTo("icList"); },

        onKpiAvailable: function () { this.navTo("budgetList"); },

        /**
         * "SLA Breaches" tile - jumps to the Approval Inbox pre-filtered to
         * Breached, via the same transient hand-off property
         * ApprovalInbox's own _onMatched reads and clears (see that file).
         */
        onKpiSlaBreach: function () {
            this.getOwnerComponent().getModel("app").setProperty("/approvalInboxInitialSla", "BREACH");
            this.navTo("approvalInbox");
        }
    });
});
