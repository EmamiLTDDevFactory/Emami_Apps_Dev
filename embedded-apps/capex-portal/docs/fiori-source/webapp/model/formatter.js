sap.ui.define([], function () {
    "use strict";

    // SLA warn/breach thresholds (days pending). Default to the documented
    // 3/5-day policy - the same literals every slaState/slaText/slaRowClass
    // call used to hardcode - and only change once Component.js's
    // _loadLiveSlaConfig() confirms real ConfigSet rows exist, via
    // formatter.setSlaThresholds(). Keeping these as plain module state
    // (not a bound model path) means every existing slaState/slaText/
    // slaRowClass call site across CPEList/ApprovalInbox/ApprovalDetail/
    // Reports/Dashboard picks up a live threshold change with no binding
    // changes needed anywhere - see CAPEX_SESSION_LOG.md Open Issue #95.
    var nSlaWarnDays = 3;
    var nSlaBreachDays = 5;

    var formatter = {

        /**
         * Called once by Component.js#_loadLiveSlaConfig when the backend
         * actually has SLA_WARN_DAYS/SLA_BREACH_DAYS ConfigSet rows - keeps
         * every SLA badge/highlight in the app aligned with the same
         * single source of truth already used to populate the DOA Matrix's
         * own "SLA Configuration" display tile, instead of a second,
         * independently-hardcoded copy of the same two numbers.
         * @param {number} nWarnDays warn threshold (days pending)
         * @param {number} nBreachDays breach threshold (days pending)
         */
        setSlaThresholds: function (nWarnDays, nBreachDays) {
            if (nWarnDays) { nSlaWarnDays = nWarnDays; }
            if (nBreachDays) { nSlaBreachDays = nBreachDays; }
        },

        // ------------------------------------------------------------------
        // CURRENCY / NUMBERS
        // ------------------------------------------------------------------

        /**
         * Indian-format currency in Lakhs, e.g. 6000000 -> "60.00 L"
         * @param {number} v raw rupee amount
         * @returns {string} formatted lakhs
         */
        inLakhs: function (v) {
            if (v === null || v === undefined || isNaN(v)) { return "-"; }
            return (Number(v) / 100000).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) + " L";
        },

        /**
         * Indian-format currency in Crores, e.g. 5000000000 -> "500.00 Cr"
         * @param {number} v raw rupee amount
         * @returns {string} formatted crores
         */
        inCrores: function (v) {
            if (v === null || v === undefined || isNaN(v)) { return "-"; }
            return (Number(v) / 10000000).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) + " Cr";
        },

        /**
         * Auto-scales: uses Cr above 1 crore, otherwise Lakhs.
         * @param {number} v raw rupee amount
         * @returns {string} formatted amount
         */
        money: function (v) {
            if (v === null || v === undefined || isNaN(v)) { return "-"; }
            var n = Number(v);
            return Math.abs(n) >= 10000000 ? formatter.inCrores(n) : formatter.inLakhs(n);
        },

        /**
         * Plain Indian grouping with rupee symbol.
         * @param {number} v raw rupee amount
         * @returns {string} formatted rupees
         */
        rupees: function (v) {
            if (v === null || v === undefined || isNaN(v)) { return "-"; }
            return "₹ " + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
        },

        /**
         * Percentage with one decimal.
         * @param {number} v number, e.g. 18.5
         * @returns {string} "18.5%"
         */
        percent: function (v) {
            if (v === null || v === undefined || isNaN(v)) { return "-"; }
            return Number(v).toFixed(1) + "%";
        },

        /**
         * Share of a total, as a rounded percentage number (for progress bars).
         * @param {number} part part value
         * @param {number} total total value
         * @returns {number} 0-100
         */
        share: function (part, total) {
            if (!total || isNaN(part) || isNaN(total)) { return 0; }
            return Math.max(0, Math.min(100, (Number(part) / Number(total)) * 100));
        },

        /**
         * CSS width string for meter segments.
         * @param {number} part part value
         * @param {number} total total value
         * @returns {string} e.g. "42.5%"
         */
        widthPct: function (part, total) {
            return formatter.share(part, total).toFixed(2) + "%";
        },

        // ------------------------------------------------------------------
        // DATES
        // ------------------------------------------------------------------

        /**
         * dd MMM yyyy
         * @param {string|Date} v date
         * @returns {string} formatted date
         */
        date: function (v) {
            if (!v) { return "-"; }
            var d = (v instanceof Date) ? v : new Date(v);
            if (isNaN(d.getTime())) { return "-"; }
            return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        },

        /**
         * dd MMM yyyy, HH:mm
         * @param {string|Date} v date
         * @returns {string} formatted datetime
         */
        dateTime: function (v) {
            if (!v) { return "-"; }
            var d = (v instanceof Date) ? v : new Date(v);
            if (isNaN(d.getTime())) { return "-"; }
            return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
                ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
        },

        /**
         * Relative ageing, e.g. "3 days".
         * @param {number} n days
         * @returns {string} label
         */
        days: function (n) {
            if (n === null || n === undefined || isNaN(n)) { return "-"; }
            n = Number(n);
            return n === 1 ? "1 day" : n + " days";
        },

        // ------------------------------------------------------------------
        // STATUS -> UI5 SEMANTIC STATE
        // ------------------------------------------------------------------

        /**
         * Maps a document status to a sap.ui.core.ValueState.
         * @param {string} s status code
         * @returns {string} ValueState
         */
        statusState: function (s) {
            switch ((s || "").toUpperCase()) {
                case "APPROVED":
                case "CAPITALIZED":
                case "COMPLETED":
                case "POSTED":
                case "COMPLIANT":
                    return "Success";
                case "PENDING":
                case "IN_APPROVAL":
                case "SUBMITTED":
                case "UNDER_EVALUATION":
                // Backend's Status field is MaxLength 12 - "UNDER_EVALUATION"
                // (16 chars) is silently truncated to this by the database,
                // confirmed live on CPE-2026-0044. Matching both so this
                // works whichever one actually comes back.
                case "UNDER_EVALUA":
                case "HOLD":
                    return "Warning";
                case "REJECTED":
                case "BLOCKED":
                case "BREACHED":
                case "NON_COMPLIANT":
                    return "Error";
                case "DRAFT":
                    return "None";
                default:
                    return "Information";
            }
        },

        /**
         * Maps a status to the .zcpxChip-- modifier class.
         * @param {string} s status code
         * @returns {string} css classes
         */
        statusChipClass: function (s) {
            var map = {
                Success: "zcpxChip zcpxChip--success",
                Warning: "zcpxChip zcpxChip--warning",
                Error: "zcpxChip zcpxChip--error",
                Information: "zcpxChip zcpxChip--info",
                None: "zcpxChip zcpxChip--neutral"
            };
            return map[formatter.statusState(s)] || "zcpxChip zcpxChip--neutral";
        },

        /**
         * Human-readable status text.
         * @param {string} s status code
         * @returns {string} label
         */
        statusText: function (s) {
            var map = {
                DRAFT: "Draft",
                SUBMITTED: "Submitted",
                IN_APPROVAL: "In Approval",
                UNDER_EVALUATION: "Under Evaluation",
                // Same MaxLength-12 truncation as statusState above.
                UNDER_EVALUA: "Under Evaluation",
                PENDING: "Pending",
                APPROVED: "Approved",
                REJECTED: "Rejected",
                HOLD: "On Hold",
                BLOCKED: "Blocked",
                POSTED: "Posted",
                CAPITALIZED: "Capitalized",
                COMPLETED: "Completed",
                COMPLIANT: "Compliant",
                NON_COMPLIANT: "Not Compliant"
            };
            return map[(s || "").toUpperCase()] || s || "-";
        },

        /**
         * Icon for a status.
         * @param {string} s status code
         * @returns {string} sap-icon uri
         */
        statusIcon: function (s) {
            switch (formatter.statusState(s)) {
                case "Success": return "sap-icon://sys-enter-2";
                case "Warning": return "sap-icon://pending";
                case "Error":   return "sap-icon://error";
                default:        return "sap-icon://information";
            }
        },

        // ------------------------------------------------------------------
        // SLA
        // ------------------------------------------------------------------

        /**
         * SLA state from days pending (2-3 day SLA per approval level).
         * @param {number} d days pending
         * @returns {string} ValueState
         */
        slaState: function (d) {
            d = Number(d) || 0;
            if (d > nSlaBreachDays) { return "Error"; }
            if (d > nSlaWarnDays) { return "Warning"; }
            return "Success";
        },

        /**
         * SLA label.
         * @param {number} d days pending
         * @returns {string} label
         */
        slaText: function (d) {
            d = Number(d) || 0;
            if (d > nSlaBreachDays) { return "SLA Breached (" + formatter.days(d) + ")"; }
            if (d > nSlaWarnDays) { return "At Risk (" + formatter.days(d) + ")"; }
            return "On Track (" + formatter.days(d) + ")";
        },

        /**
         * Row highlight class for SLA severity.
         * @param {number} d days pending
         * @returns {string} css class
         */
        slaRowClass: function (d) {
            d = Number(d) || 0;
            if (d > nSlaBreachDays) { return "zcpxRowBreach zcpxSlaBreach"; }
            if (d > nSlaWarnDays) { return "zcpxRowWarn"; }
            return "";
        },

        // ------------------------------------------------------------------
        // FINANCIAL METRIC QUALITY
        // ------------------------------------------------------------------

        // NOTE ON TONES
        // UI5 does not support binding on the "class" attribute, so every
        // conditional colour is emitted as a bound CustomData value with
        // writeToDom:true. That renders data-<key>="<tone>" on the element and
        // the stylesheet matches it with an attribute selector.

        /**
         * IRR quality tone (hurdle rate 15%).
         * @param {number} irr internal rate of return %
         * @returns {string} good | warn | bad | none
         */
        irrTone: function (irr) {
            if (irr === null || irr === undefined || isNaN(irr)) { return "none"; }
            irr = Number(irr);
            if (irr >= 18) { return "good"; }
            if (irr >= 15) { return "warn"; }
            return "bad";
        },

        /**
         * NPV quality tone.
         * @param {number} npv net present value
         * @returns {string} good | bad | none
         */
        npvTone: function (npv) {
            if (npv === null || npv === undefined || isNaN(npv)) { return "none"; }
            return Number(npv) > 0 ? "good" : "bad";
        },

        /**
         * Payback quality tone (target under 4 years).
         * @param {number} yrs payback years
         * @returns {string} good | warn | bad | none
         */
        paybackTone: function (yrs) {
            if (yrs === null || yrs === undefined || isNaN(yrs)) { return "none"; }
            yrs = Number(yrs);
            if (yrs > 0 && yrs <= 3) { return "good"; }
            if (yrs > 0 && yrs <= 5) { return "warn"; }
            return "bad";
        },

        /**
         * Tone for a balance / availability figure.
         * @param {number} v the balance
         * @returns {string} success | error
         */
        balanceTone: function (v) {
            return (Number(v) || 0) > 0 ? "success" : "error";
        },

        // ------------------------------------------------------------------
        // VENDOR
        // ------------------------------------------------------------------

        /**
         * Vendor card tone from rank and selection.
         * @param {string} rank L1 / L2 / L3
         * @param {boolean} selected selected flag
         * @returns {string} selected | l1 | plain
         */
        vendorCardTone: function (rank, selected) {
            if (selected) { return "selected"; }
            return rank === "L1" ? "l1" : "plain";
        },

        /**
         * Star string from a 1-5 rating.
         * @param {number} n rating
         * @returns {string} stars
         */
        stars: function (n) {
            n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
            return "★".repeat(n) + "☆".repeat(5 - n);
        },

        // ------------------------------------------------------------------
        // TIMELINE
        // ------------------------------------------------------------------

        /**
         * Timeline node tone from an approval step outcome.
         * @param {string} s step status
         * @returns {string} done | current | reject | hold | waiting
         */
        timelineTone: function (s) {
            switch ((s || "").toUpperCase()) {
                case "APPROVED": return "done";
                case "PENDING":  return "current";
                case "REJECTED": return "reject";
                case "HOLD":     return "hold";
                default:         return "waiting";
            }
        },

        // ------------------------------------------------------------------
        // MISC
        // ------------------------------------------------------------------

        /**
         * Boolean -> Yes / No.
         * @param {boolean} b flag
         * @returns {string} label
         */
        yesNo: function (b) {
            return b ? "Yes" : "No";
        },

        /**
         * Returns "" for null so Text controls stay clean.
         * @param {*} v value
         * @returns {*} value or dash
         */
        orDash: function (v) {
            return (v === null || v === undefined || v === "") ? "-" : v;
        },

        /**
         * Initials from a full name, for Avatar controls.
         * @param {string} name full name
         * @returns {string} initials
         */
        initials: function (name) {
            if (!name) { return "?"; }
            var parts = String(name).trim().split(/\s+/);
            return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
        }
    };

    return formatter;
});
