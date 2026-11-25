sap.ui.define([], function () {
    "use strict";

    var L = 100000;          // 1 Lakh
    var CR = 10000000;       // 1 Crore

    /**
     * Returns an ISO date string n days before today.
     * @param {number} n days back
     * @returns {string} ISO date
     */
    function daysAgo(n) {
        var d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString();
    }

    /**
     * Returns an ISO date string n days ahead of today.
     * @param {number} n days ahead
     * @returns {string} ISO date
     */
    function daysAhead(n) {
        return daysAgo(-n);
    }

    return {

        /**
         * Loads all mock data sets into the component's JSON models.
         * Replace each block with an OData read once ZCAPEX_PORTAL_SRV is live.
         * @param {sap.ui.core.UIComponent} oComponent the component
         */
        load: function (oComponent) {
            oComponent.getModel("app").setData(this.getAppData());
            oComponent.getModel("budget").setData(this.getBudgetData());
            oComponent.getModel("cpe").setData(this.getCPEData());
            oComponent.getModel("approval").setData(this.getApprovalData());
            oComponent.getModel("procure").setData(this.getProcureData());
            oComponent.getModel("asset").setData(this.getAssetData());
            oComponent.getModel("config").setData(this.getConfigData());
        },

        // ==================================================================
        // APP  -  user, personas, notifications, dashboard rollup
        // ==================================================================

        getAppData: function () {
            var aPersonas = [
                {
                    id: "U001", name: "Jeevan Thapa", role: "Unit Initiator",
                    unit: "Pacharia Plant", isAdmin: true, isGlobal: false,
                    authorizedPlants: ["1100", "1200"]
                },
                {
                    id: "U002", name: "Ramesh Iyer", role: "HOD Operations",
                    unit: "Pacharia Plant", isAdmin: false, isGlobal: false,
                    authorizedPlants: ["1100", "1200"]
                },
                {
                    id: "U003", name: "Anita Bose", role: "VP Operations",
                    unit: "Head Office", isAdmin: false, isGlobal: true,
                    authorizedPlants: []
                },
                {
                    id: "U004", name: "S. Krishnan", role: "President Operations",
                    unit: "Head Office", isAdmin: false, isGlobal: true,
                    authorizedPlants: []
                },
                {
                    id: "U005", name: "Debashish Roy", role: "Finance (HO)",
                    unit: "Head Office", isAdmin: true, isGlobal: true,
                    authorizedPlants: []
                },
                {
                    id: "U006", name: "Meera Nair", role: "Procurement (HO)",
                    unit: "Head Office", isAdmin: false, isGlobal: true,
                    authorizedPlants: []
                }
            ];

            return {
                user: Object.assign({}, aPersonas[0]),
                personas: aPersonas,
                fiscalYear: "FY2026",
                // Seeded fallback only, visible until live Budget/CPE data
                // loads - Component.js#_recalcFiscalYears then replaces this
                // with whatever fiscal years actually exist live (see that
                // function's doc comment).
                fiscalYears: [
                    { key: "FY2026", text: "FY 2026-27" },
                    { key: "FY2025", text: "FY 2025-26" },
                    { key: "FY2024", text: "FY 2024-25" }
                ],
                sideExpanded: true,
                selectedNav: "dashboard",
                unreadCount: 4,
                notifications: [
                    {
                        id: "N1", unread: true, icon: "sap-icon://approvals",
                        title: "CPE-2026-0042 awaiting your approval",
                        text: "Packaging Machine · ₹50.00 L · Pacharia",
                        time: daysAgo(0), route: "approvalDetail", params: { cpeId: "CPE-2026-0042" }
                    },
                    {
                        id: "N2", unread: true, icon: "sap-icon://alert",
                        title: "SLA breach — 3 CPEs pending over 5 days",
                        text: "President Operations queue",
                        time: daysAgo(1), route: "approvalInbox"
                    },
                    {
                        id: "N3", unread: true, icon: "sap-icon://money-bills",
                        title: "Budget B-2026-001 approved",
                        text: "₹100.00 L reserved · SAP IO 4500012876 created",
                        time: daysAgo(2), route: "budgetDetail", params: { budgetId: "B-2026-001" }
                    },
                    {
                        id: "N4", unread: true, icon: "sap-icon://building",
                        title: "CWIP ageing alert",
                        text: "14 assets pending capitalization · ₹30.00 Cr",
                        time: daysAgo(3), route: "capitalization"
                    },
                    {
                        id: "N5", unread: false, icon: "sap-icon://shipping-status",
                        title: "GRN posted for PO 4500098213",
                        text: "Commitment converted to actual spend",
                        time: daysAgo(5), route: "grnList"
                    }
                ],

                // Dashboard rollup - zeroed placeholder shape only. The real
                // values are computed live by Dashboard.controller.js's
                // _recalcRollup() from BudgetSet/ApprovalInboxSet/CwipAgeingSet
                // as soon as the dashboard route is hit; nothing here is
                // ever shown as-is.
                dashboard: {
                    totalBudget: 0, approvedCPE: 0, committed: 0, spent: 0,
                    capitalized: 0, available: 0, cwipPending: 0, cwipAssets: 0,
                    cwipAvgAge: 0, pendingCount: 0, pendingValue: 0, slaBreachCount: 0,
                    cycleTimeDays: 0, cycleTimeBefore: 0, savingsYTD: 0,
                    queue: [], byCategory: [], monthlyTrend: []
                }
            };
        },

        // ==================================================================
        // BUDGET
        // ==================================================================

        getBudgetData: function () {
            return {
                list: [
                    {
                        budgetId: "B-2026-001", fiscalYear: "FY2026",
                        title: "Manufacturing Capacity Expansion",
                        plant: "1100", plantName: "Pacharia Plant",
                        capexType: "MANUFACTURING", category: "Plant & Machinery",
                        approved: 100 * L, committed: 60 * L, spent: 20 * L,
                        status: "APPROVED", internalOrder: "4500012876",
                        submittedBy: "Jeevan Thapa", submittedOn: daysAgo(96),
                        approvedOn: daysAgo(88),
                        justification: "Line 3 capacity is at 94% utilisation. Additional filling line required to meet FY27 volume plan of 18% growth.",
                        investment: 100 * L,
                        cashFlows: [28 * L, 32 * L, 35 * L, 35 * L, 30 * L],
                        hurdleRate: 15,
                        irr: 17.6, npv: 6.48 * L, payback: 4.6,
                        metricsEnabled: true,
                        isCommonPool: false
                    },
                    {
                        budgetId: "B-2026-002", fiscalYear: "FY2026",
                        title: "Mould Replacement Programme",
                        plant: "1200", plantName: "Dongari Plant",
                        capexType: "MOULDS", category: "Moulds & Tooling",
                        approved: 75 * L, committed: 45 * L, spent: 30 * L,
                        status: "APPROVED", internalOrder: "4500012901",
                        submittedBy: "Ramesh Iyer", submittedOn: daysAgo(84),
                        approvedOn: daysAgo(77),
                        justification: "12 moulds beyond design life of 1.2 M cycles. Rejection rate has risen from 1.1% to 3.4%.",
                        investment: 75 * L,
                        cashFlows: [22 * L, 24 * L, 26 * L, 26 * L, 20 * L],
                        hurdleRate: 15,
                        irr: 17.3, npv: 4.18 * L, payback: 4.6,
                        metricsEnabled: true,
                        isCommonPool: false
                    },
                    {
                        budgetId: "B-2026-003", fiscalYear: "FY2026",
                        title: "IT Infrastructure Refresh",
                        plant: "1000", plantName: "Head Office",
                        capexType: "IT", category: "IT Hardware",
                        approved: 40 * L, committed: 18 * L, spent: 9 * L,
                        status: "APPROVED", internalOrder: "4500012955",
                        submittedBy: "Debashish Roy", submittedOn: daysAgo(70),
                        approvedOn: daysAgo(64),
                        justification: "Server estate out of OEM support from Mar-2027. Refresh required for SAP S/4 readiness.",
                        investment: 40 * L,
                        cashFlows: [10 * L, 12 * L, 13 * L, 13 * L, 11 * L],
                        hurdleRate: 15,
                        irr: 14.2, npv: -0.78 * L, payback: null,
                        metricsEnabled: true,
                        isCommonPool: false
                    },
                    {
                        budgetId: "B-2026-004", fiscalYear: "FY2026",
                        title: "Unbudgeted Capex — Common Pool",
                        plant: "1000", plantName: "Head Office",
                        capexType: "MANUFACTURING", category: "Common Pool",
                        approved: 250 * L, committed: 60 * L, spent: 15 * L,
                        status: "APPROVED", internalOrder: "4500013000",
                        submittedBy: "Debashish Roy", submittedOn: daysAgo(100),
                        approvedOn: daysAgo(95),
                        justification: "Central bucket for mid-year unbudgeted capex per Finance policy CX-04.",
                        investment: 0, cashFlows: [], hurdleRate: 15,
                        irr: null, npv: null, payback: null,
                        metricsEnabled: false,
                        isCommonPool: true
                    },
                    {
                        budgetId: "B-2026-005", fiscalYear: "FY2026",
                        title: "Utilities — Boiler Upgrade",
                        plant: "1100", plantName: "Pacharia Plant",
                        capexType: "MANUFACTURING", category: "Utilities",
                        approved: 55 * L, committed: 0, spent: 0,
                        status: "IN_APPROVAL", internalOrder: "",
                        submittedBy: "Jeevan Thapa", submittedOn: daysAgo(4),
                        approvedOn: null,
                        justification: "Existing boiler efficiency at 71% against design 86%. Fuel saving of ₹14 L per annum expected.",
                        investment: 55 * L,
                        cashFlows: [14 * L, 15 * L, 16 * L, 16 * L, 14 * L],
                        hurdleRate: 15,
                        irr: 11.2, npv: -4.86 * L, payback: null,
                        metricsEnabled: true,
                        isCommonPool: false
                    },
                    {
                        budgetId: "B-2026-006", fiscalYear: "FY2026",
                        title: "Warehouse Racking — Phase 2",
                        plant: "1200", plantName: "Dongari Plant",
                        capexType: "MANUFACTURING", category: "Infrastructure",
                        approved: 32 * L, committed: 0, spent: 0,
                        status: "DRAFT", internalOrder: "",
                        submittedBy: "Ramesh Iyer", submittedOn: null,
                        approvedOn: null,
                        justification: "",
                        investment: 32 * L,
                        cashFlows: [9 * L, 10 * L, 10 * L, 9 * L, 8 * L],
                        hurdleRate: 15,
                        irr: null, npv: null, payback: null,
                        metricsEnabled: true,
                        isCommonPool: false
                    }
                ],

                categories: [
                    { key: "PM",   text: "Plant & Machinery" },
                    { key: "MT",   text: "Moulds & Tooling" },
                    { key: "IT",   text: "IT Hardware" },
                    { key: "SW",   text: "Software & Licences" },
                    { key: "UTIL", text: "Utilities" },
                    { key: "INFRA", text: "Infrastructure" },
                    { key: "VEH",  text: "Vehicles" },
                    { key: "OTH",  text: "Others" }
                ],

                capexTypes: [
                    { key: "MANUFACTURING", text: "Manufacturing Units" },
                    { key: "MOULDS",        text: "Moulds" },
                    { key: "IT",            text: "IT" }
                ],

                plants: [
                    { key: "1000", text: "Head Office" },
                    { key: "1100", text: "Pacharia Plant" },
                    { key: "1200", text: "Dongari Plant" },
                    { key: "1300", text: "Masat Plant" },
                    { key: "1400", text: "Guwahati Plant" }
                ],

                // Working draft used by BudgetCreate
                draft: {
                    title: "", plant: "1100", capexType: "MANUFACTURING",
                    category: "PM", amount: null, justification: "",
                    expectedBenefit: "", metricsEnabled: true, hurdleRate: 15,
                    cf1: null, cf2: null, cf3: null, cf4: null, cf5: null,
                    cf6: null, cf7: null, cf8: null, cf9: null, cf10: null,
                    irr: null, npv: null, payback: null,
                    fundingSource: "NEW",
                    sourceInternalOrder: ""
                }
            };
        },

        // ==================================================================
        // CPE
        // ==================================================================

        getCPEData: function () {
            return {
                list: [
                    {
                        cpeId: "CPE-2026-0042", budgetId: "B-2026-001",
                        title: "Automatic Packaging Machine — Line 3",
                        plant: "1100", plantName: "Pacharia Plant",
                        capexType: "MANUFACTURING", category: "Plant & Machinery",
                        amount: 50 * L, status: "IN_APPROVAL",
                        currentLevel: "VP Operations", daysPending: 3,
                        createdBy: "Jeevan Thapa", createdOn: daysAgo(6),
                        specs: "Servo-driven cartoner, 120 packs/min, PLC Siemens S7-1500, IP65, CE certified.",
                        terms: "30% advance, 60% against dispatch, 10% after commissioning. Warranty 24 months.",
                        deliveryWeeks: 7,
                        technicalCompliant: true,
                        technicalRemark: "Meets all specs in RFQ ENG/2026/118. Throughput validated at vendor site.",
                        selectedVendorId: "V3",
                        nonL1Justification: "PQR Tech offers 40-day delivery against L1's 45 days, and a total cost of ownership ₹11.00 L below L1 after negotiation. Quality rated 4/5 by our Nashik unit on an identical machine.",
                        vendors: [
                            { id: "V1", rank: "L1", name: "ABC Machinery Pvt Ltd",  quote: 60 * L, totalCost: 61 * L, deliveryDays: 45, quality: 5, warrantyMonths: 24, gstCompliant: true,  selected: false },
                            { id: "V2", rank: "L2", name: "XYZ Equipment Ltd",      quote: 52 * L, totalCost: 54 * L, deliveryDays: 50, quality: 4, warrantyMonths: 18, gstCompliant: true,  selected: false },
                            { id: "V3", rank: "L3", name: "PQR Tech Solutions",     quote: 48 * L, totalCost: 50 * L, deliveryDays: 40, quality: 4, warrantyMonths: 24, gstCompliant: true,  selected: true }
                        ],
                        metricsEnabled: true, hurdleRate: 15,
                        investment: 50 * L,
                        cashFlows: [16 * L, 18 * L, 19 * L, 18 * L, 15 * L],
                        irr: 21.4, npv: 7.77 * L, payback: 4.0,
                        documents: [
                            { name: "RFQ_ENG_2026_118.pdf",       type: "RFQ",       size: "412 KB", uploadedOn: daysAgo(12) },
                            { name: "Quote_ABC_Machinery.pdf",    type: "Quote",     size: "288 KB", uploadedOn: daysAgo(10) },
                            { name: "Quote_XYZ_Equipment.pdf",    type: "Quote",     size: "301 KB", uploadedOn: daysAgo(10) },
                            { name: "Quote_PQR_Tech.pdf",         type: "Quote",     size: "276 KB", uploadedOn: daysAgo(9) },
                            { name: "Technical_Evaluation.xlsx",  type: "Evaluation","size": "88 KB", uploadedOn: daysAgo(7) }
                        ],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0041", budgetId: "B-2026-002",
                        title: "Injection Mould Set — 500ml Bottle",
                        plant: "1200", plantName: "Dongari Plant",
                        capexType: "MOULDS", category: "Moulds & Tooling",
                        amount: 28 * L, status: "APPROVED",
                        currentLevel: "Completed", daysPending: 0,
                        createdBy: "Ramesh Iyer", createdOn: daysAgo(34),
                        specs: "8-cavity hot runner mould, P20 steel, 1.5 M cycle design life.",
                        terms: "40% advance, 60% on FAT clearance. Warranty 12 months / 500K cycles.",
                        deliveryWeeks: 10,
                        technicalCompliant: true,
                        technicalRemark: "Cavity layout approved by CPD. Flow analysis report accepted.",
                        selectedVendorId: "V1",
                        nonL1Justification: "",
                        vendors: [
                            { id: "V1", rank: "L1", name: "Precision Moulds India", quote: 28 * L, totalCost: 29 * L, deliveryDays: 70, quality: 5, warrantyMonths: 12, gstCompliant: true, selected: true },
                            { id: "V2", rank: "L2", name: "Tooltech Engineering",   quote: 31 * L, totalCost: 32 * L, deliveryDays: 65, quality: 4, warrantyMonths: 12, gstCompliant: true, selected: false }
                        ],
                        metricsEnabled: true, hurdleRate: 15,
                        investment: 28 * L,
                        cashFlows: [9 * L, 10 * L, 11 * L, 10 * L, 8 * L],
                        irr: 21.4, npv: 4.32 * L, payback: 3.9,
                        documents: [
                            { name: "Mould_Drawing_Rev3.pdf", type: "Technical", size: "1.2 MB", uploadedOn: daysAgo(40) },
                            { name: "Quote_Precision.pdf",    type: "Quote",     size: "244 KB", uploadedOn: daysAgo(38) }
                        ],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0040", budgetId: "B-2026-003",
                        title: "Rack Servers & Storage Array",
                        plant: "1000", plantName: "Head Office",
                        capexType: "IT", category: "IT Hardware",
                        amount: 18 * L, status: "IN_APPROVAL",
                        currentLevel: "President IT", daysPending: 6,
                        createdBy: "Debashish Roy", createdOn: daysAgo(11),
                        specs: "2 × Dell PowerEdge R760, 512 GB RAM each, 40 TB usable NVMe storage, 3-year ProSupport.",
                        terms: "100% against delivery and installation. Warranty 36 months on-site.",
                        deliveryWeeks: 5,
                        technicalCompliant: true,
                        technicalRemark: "Sizing validated against S/4 readiness assessment dated 12-Jul-2026.",
                        selectedVendorId: "V2",
                        nonL1Justification: "L1 could not commit 36-month on-site support at the quoted price. Selected vendor includes 36-month ProSupport and 4-hour response, worth ₹2.10 L over the term.",
                        vendors: [
                            { id: "V1", rank: "L1", name: "TechSource Systems",  quote: 16.5 * L, totalCost: 19.4 * L, deliveryDays: 35, quality: 3, warrantyMonths: 12, gstCompliant: true, selected: false },
                            { id: "V2", rank: "L2", name: "Infocom Solutions",   quote: 18 * L,   totalCost: 18.6 * L, deliveryDays: 35, quality: 5, warrantyMonths: 36, gstCompliant: true, selected: true },
                            { id: "V3", rank: "L3", name: "Netserve Pvt Ltd",    quote: 19.8 * L, totalCost: 21 * L,   deliveryDays: 42, quality: 4, warrantyMonths: 24, gstCompliant: false, selected: false }
                        ],
                        metricsEnabled: false, hurdleRate: 15,
                        investment: 18 * L, cashFlows: [],
                        irr: null, npv: null, payback: null,
                        documents: [
                            { name: "S4_Readiness_Sizing.pdf", type: "Technical", size: "640 KB", uploadedOn: daysAgo(14) }
                        ],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0039", budgetId: "B-2026-001",
                        title: "Conveyor Belt Replacement — Line 1",
                        plant: "1100", plantName: "Pacharia Plant",
                        capexType: "MANUFACTURING", category: "Plant & Machinery",
                        amount: 5 * L, status: "APPROVED",
                        currentLevel: "Completed", daysPending: 0,
                        createdBy: "Jeevan Thapa", createdOn: daysAgo(48),
                        specs: "Modular plastic belt, 12 m length, food-grade, stainless steel frame.",
                        terms: "100% on delivery. Warranty 12 months.",
                        deliveryWeeks: 3,
                        technicalCompliant: true,
                        technicalRemark: "Standard replacement. No deviation from existing spec.",
                        selectedVendorId: "V1",
                        nonL1Justification: "",
                        vendors: [
                            { id: "V1", rank: "L1", name: "Conveytech India", quote: 5 * L, totalCost: 5.2 * L, deliveryDays: 21, quality: 4, warrantyMonths: 12, gstCompliant: true, selected: true }
                        ],
                        metricsEnabled: false, hurdleRate: 15,
                        investment: 5 * L, cashFlows: [],
                        irr: null, npv: null, payback: null,
                        documents: [],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0043", budgetId: "B-2026-001",
                        title: "Air Compressor — Utility Block",
                        plant: "1100", plantName: "Pacharia Plant",
                        capexType: "MANUFACTURING", category: "Utilities",
                        amount: 25 * L, status: "BLOCKED",
                        currentLevel: "Budget Check", daysPending: 1,
                        createdBy: "Jeevan Thapa", createdOn: daysAgo(1),
                        specs: "Screw compressor, 75 kW, VFD, integrated dryer.",
                        terms: "50% advance, 50% on commissioning.",
                        deliveryWeeks: 8,
                        technicalCompliant: false,
                        technicalRemark: "Awaiting technical sign-off.",
                        selectedVendorId: "",
                        nonL1Justification: "",
                        vendors: [
                            { id: "V1", rank: "L1", name: "Atlas Air Systems", quote: 25 * L, totalCost: 26 * L, deliveryDays: 56, quality: 5, warrantyMonths: 24, gstCompliant: true, selected: false }
                        ],
                        metricsEnabled: true, hurdleRate: 15,
                        investment: 25 * L,
                        cashFlows: [7 * L, 8 * L, 8 * L, 8 * L, 7 * L],
                        irr: 15.8, npv: 0.45 * L, payback: 4.9,
                        documents: [],
                        isQuota: false,
                        blockReason: "Requested ₹25.00 L exceeds available ₹20.00 L on budget B-2026-001. Shortfall ₹5.00 L."
                    },
                    {
                        cpeId: "CPE-2026-0044", budgetId: "B-2026-005",
                        title: "Boiler Economiser Retrofit",
                        plant: "1100", plantName: "Pacharia Plant",
                        capexType: "MANUFACTURING", category: "Utilities",
                        amount: 12 * L, status: "UNDER_EVALUATION",
                        currentLevel: "Technical Evaluation", daysPending: 2,
                        createdBy: "Jeevan Thapa", createdOn: daysAgo(2),
                        specs: "Finned-tube economiser, 1.5 TPH recovery, stainless steel 304.",
                        terms: "30% advance, balance on commissioning. Warranty 18 months.",
                        deliveryWeeks: 6,
                        technicalCompliant: false,
                        technicalRemark: "",
                        selectedVendorId: "",
                        nonL1Justification: "",
                        vendors: [
                            { id: "V1", rank: "L1", name: "Thermax Boilers",    quote: 12 * L,   totalCost: 12.8 * L, deliveryDays: 42, quality: 5, warrantyMonths: 18, gstCompliant: true, selected: false },
                            { id: "V2", rank: "L2", name: "Forbes Marshall",    quote: 13.2 * L, totalCost: 13.6 * L, deliveryDays: 38, quality: 5, warrantyMonths: 24, gstCompliant: true, selected: false }
                        ],
                        metricsEnabled: true, hurdleRate: 15,
                        investment: 12 * L,
                        cashFlows: [4 * L, 4.5 * L, 4.5 * L, 4 * L, 3.5 * L],
                        irr: 21.5, npv: 1.87 * L, payback: 3.9,
                        documents: [],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0038", budgetId: "B-2026-002",
                        title: "Effluent Treatment Plant Upgrade",
                        plant: "1200", plantName: "Dongari Plant",
                        capexType: "MANUFACTURING", category: "Utilities",
                        amount: 62 * L, status: "IN_APPROVAL",
                        currentLevel: "President Operations", daysPending: 7,
                        createdBy: "Ramesh Iyer", createdOn: daysAgo(9),
                        specs: "Upgraded ETP with tertiary treatment, 500 KLD capacity, MPCB compliant.",
                        terms: "30% advance, 60% on delivery, 10% after commissioning. Warranty 24 months.",
                        deliveryWeeks: 12,
                        technicalCompliant: true,
                        technicalRemark: "Design meets revised MPCB discharge norms effective FY27.",
                        selectedVendorId: "V1",
                        nonL1Justification: "",
                        vendors: [
                            { id: "V1", rank: "L1", name: "Enviro Engineers Pvt Ltd", quote: 62 * L, totalCost: 64 * L, deliveryDays: 84, quality: 5, warrantyMonths: 24, gstCompliant: true, selected: true }
                        ],
                        metricsEnabled: true, hurdleRate: 15,
                        investment: 62 * L,
                        cashFlows: [18 * L, 19 * L, 19 * L, 18 * L, 16 * L],
                        irr: 16.8, npv: 2.10 * L, payback: 4.7,
                        documents: [
                            { name: "ETP_Upgrade_Scope.pdf", type: "Technical", size: "350 KB", uploadedOn: daysAgo(11) }
                        ],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0037", budgetId: "B-2026-001",
                        title: "Forklift — 3 Ton Diesel",
                        plant: "1100", plantName: "Pacharia Plant",
                        capexType: "MANUFACTURING", category: "Plant & Machinery",
                        amount: 9 * L, status: "IN_APPROVAL",
                        currentLevel: "HOD Operations", daysPending: 2,
                        createdBy: "Jeevan Thapa", createdOn: daysAgo(4),
                        specs: "3-tonne diesel forklift, 4.5 m lift height, solid pneumatic tyres.",
                        terms: "100% against delivery. Warranty 12 months.",
                        deliveryWeeks: 4,
                        technicalCompliant: true,
                        technicalRemark: "Standard spec match for yard operations.",
                        selectedVendorId: "V1",
                        nonL1Justification: "",
                        vendors: [
                            { id: "V1", rank: "L1", name: "Godrej Material Handling", quote: 9 * L, totalCost: 9.3 * L, deliveryDays: 28, quality: 4, warrantyMonths: 12, gstCompliant: true, selected: true }
                        ],
                        metricsEnabled: false, hurdleRate: 15,
                        investment: 9 * L, cashFlows: [],
                        irr: null, npv: null, payback: null,
                        documents: [],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0036", budgetId: "B-2026-002",
                        title: "Laboratory HPLC System",
                        plant: "1200", plantName: "Dongari Plant",
                        capexType: "MANUFACTURING", category: "Plant & Machinery",
                        amount: 34 * L, status: "IN_APPROVAL",
                        currentLevel: "VP Operations", daysPending: 4,
                        createdBy: "Ramesh Iyer", createdOn: daysAgo(8),
                        specs: "HPLC system with PDA detector, autosampler, USP <621> compliant.",
                        terms: "50% advance, 50% on installation & qualification. Warranty 24 months.",
                        deliveryWeeks: 9,
                        technicalCompliant: true,
                        technicalRemark: "Matches QC lab upgrade plan for FY27 audit readiness.",
                        selectedVendorId: "V2",
                        nonL1Justification: "L2 vendor bundles on-site IQ/OQ/PQ qualification at no extra cost, a ₹1.20 L saving over L1.",
                        vendors: [
                            { id: "V1", rank: "L1", name: "Shimadzu Analytics", quote: 32 * L, totalCost: 34.5 * L, deliveryDays: 60, quality: 4, warrantyMonths: 12, gstCompliant: true, selected: false },
                            { id: "V2", rank: "L2", name: "Waters India",      quote: 34 * L, totalCost: 34.3 * L, deliveryDays: 55, quality: 5, warrantyMonths: 24, gstCompliant: true, selected: true }
                        ],
                        metricsEnabled: true, hurdleRate: 15,
                        investment: 34 * L,
                        cashFlows: [11 * L, 12 * L, 12 * L, 11 * L, 9 * L],
                        irr: 18.9, npv: 3.05 * L, payback: 4.3,
                        documents: [],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0035", budgetId: "B-2026-002",
                        title: "Mould Polishing Machine",
                        plant: "1200", plantName: "Dongari Plant",
                        capexType: "MOULDS", category: "Moulds & Tooling",
                        amount: 7 * L, status: "IN_APPROVAL",
                        currentLevel: "DGM Purchase", daysPending: 1,
                        createdBy: "Ramesh Iyer", createdOn: daysAgo(3),
                        specs: "CNC mould polishing station, mirror finish up to Ra 0.02 µm.",
                        terms: "40% advance, 60% on delivery. Warranty 12 months.",
                        deliveryWeeks: 6,
                        technicalCompliant: true,
                        technicalRemark: "Reduces manual polishing time by 60%.",
                        selectedVendorId: "V1",
                        nonL1Justification: "",
                        vendors: [
                            { id: "V1", rank: "L1", name: "SurfaceTech Machines", quote: 7 * L, totalCost: 7.3 * L, deliveryDays: 42, quality: 4, warrantyMonths: 12, gstCompliant: true, selected: true }
                        ],
                        metricsEnabled: false, hurdleRate: 15,
                        investment: 7 * L, cashFlows: [],
                        irr: null, npv: null, payback: null,
                        documents: [],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0034", budgetId: "B-2026-001",
                        title: "Fire Alarm System Modernisation",
                        plant: "1100", plantName: "Pacharia Plant",
                        capexType: "MANUFACTURING", category: "Utilities",
                        amount: 15 * L, status: "IN_APPROVAL",
                        currentLevel: "President Operations", daysPending: 6,
                        createdBy: "Jeevan Thapa", createdOn: daysAgo(10),
                        specs: "Addressable fire alarm panel, 200 detection points, integrated with sprinkler interlock.",
                        terms: "30% advance, 60% on commissioning, 10% after 3-month trial. Warranty 24 months.",
                        deliveryWeeks: 8,
                        technicalCompliant: true,
                        technicalRemark: "Compliant with revised factory fire safety norms.",
                        selectedVendorId: "V1",
                        nonL1Justification: "",
                        vendors: [
                            { id: "V1", rank: "L1", name: "Honeywell Fire Systems", quote: 15 * L, totalCost: 15.6 * L, deliveryDays: 50, quality: 5, warrantyMonths: 24, gstCompliant: true, selected: true }
                        ],
                        metricsEnabled: false, hurdleRate: 15,
                        investment: 15 * L, cashFlows: [],
                        irr: null, npv: null, payback: null,
                        documents: [],
                        isQuota: false
                    },
                    {
                        cpeId: "CPE-2026-0033", budgetId: "B-2026-004",
                        title: "Solar Rooftop — 250 kWp",
                        plant: "1400", plantName: "Guwahati Plant",
                        capexType: "MANUFACTURING", category: "Utilities",
                        amount: 95 * L, status: "IN_APPROVAL",
                        currentLevel: "MD", daysPending: 2,
                        createdBy: "S. Krishnan", createdOn: daysAgo(7),
                        specs: "250 kWp rooftop solar PV, grid-tied, Tier-1 modules, 25-year performance warranty.",
                        terms: "20% advance, 70% on commissioning, 10% after 1-year performance validation.",
                        deliveryWeeks: 14,
                        technicalCompliant: true,
                        technicalRemark: "Structural load assessment cleared. Net-metering approval in process with state DISCOM.",
                        selectedVendorId: "V1",
                        nonL1Justification: "",
                        vendors: [
                            { id: "V1", rank: "L1", name: "Tata Power Solar", quote: 95 * L, totalCost: 97 * L, deliveryDays: 98, quality: 5, warrantyMonths: 300, gstCompliant: true, selected: true }
                        ],
                        metricsEnabled: true, hurdleRate: 15,
                        investment: 95 * L,
                        cashFlows: [24 * L, 26 * L, 27 * L, 26 * L, 24 * L],
                        irr: 16.1, npv: 5.40 * L, payback: 4.6,
                        documents: [],
                        isQuota: false
                    }
                ],

                draft: {
                    budgetId: "", title: "", plant: "", capexType: "",
                    category: "", amount: null, specs: "", terms: "",
                    deliveryWeeks: null, metricsEnabled: true, hurdleRate: 15,
                    cf1: null, cf2: null, cf3: null, cf4: null, cf5: null,
                    irr: null, npv: null, payback: null,
                    vendors: [],
                    selectedVendorId: "", nonL1Justification: "",
                    budgetCheck: { available: 0, sufficient: true, shortfall: 0, checked: false }
                },

                // Populated on demand per search term by
                // CPECreate.controller.js#onVendorNameSuggest (live VendSet
                // read), not preloaded - empty until the user actually types
                // a vendor name to search for.
                vendorSearchResults: []
            };
        },

        // ==================================================================
        // APPROVALS
        // ==================================================================

        getApprovalData: function () {
            return {
                // Live-loaded from ApprovalInboxSet in Component.js's
                // _loadLiveApprovalInbox() - this stays empty rather than
                // flashing demo rows before that read resolves.
                inbox: [],

                // Approval history keyed by CPE id
                history: {
                    "CPE-2026-0042": [
                        { level: 1, role: "Unit Initiator",        approver: "Jeevan Thapa",  status: "APPROVED", actedOn: daysAgo(6), slaDays: 1, comment: "CPE raised against approved budget B-2026-001." },
                        { level: 2, role: "Technical Team",        approver: "A. Deshmukh",   status: "APPROVED", actedOn: daysAgo(5), slaDays: 2, comment: "Specs verified against RFQ ENG/2026/118. Compliant." },
                        { level: 3, role: "Procurement (HO)",      approver: "Meera Nair",    status: "APPROVED", actedOn: daysAgo(4), slaDays: 2, comment: "L3 recommended after negotiation. ₹4.00 L saving vs L1, 5 days faster." },
                        { level: 4, role: "HOD Operations",        approver: "Ramesh Iyer",   status: "APPROVED", actedOn: daysAgo(3), slaDays: 2, comment: "Capacity case is sound. Approved." },
                        { level: 5, role: "VP Operations",         approver: "Anita Bose",    status: "PENDING",  actedOn: null,        slaDays: 3, comment: "" },
                        { level: 6, role: "President Operations",  approver: "S. Krishnan",   status: "WAITING",  actedOn: null,        slaDays: 3, comment: "" },
                        { level: 7, role: "MD",                    approver: "R. S. Agarwal", status: "WAITING",  actedOn: null,        slaDays: 3, comment: "" }
                    ],
                    "CPE-2026-0041": [
                        { level: 1, role: "Unit Initiator",   approver: "Ramesh Iyer",    status: "APPROVED", actedOn: daysAgo(34), slaDays: 1, comment: "Mould replacement per CPD plan." },
                        { level: 2, role: "Technical Team",   approver: "K. Subramanian", status: "APPROVED", actedOn: daysAgo(32), slaDays: 2, comment: "Cavity layout and flow analysis accepted." },
                        { level: 3, role: "DGM Purchase",     approver: "Meera Nair",     status: "APPROVED", actedOn: daysAgo(30), slaDays: 2, comment: "L1 selected. No deviation." },
                        { level: 4, role: "AVP CPD",          approver: "P. Venkatesh",   status: "APPROVED", actedOn: daysAgo(28), slaDays: 2, comment: "Approved." },
                        { level: 5, role: "MD",               approver: "R. S. Agarwal",  status: "APPROVED", actedOn: daysAgo(26), slaDays: 3, comment: "Approved. Proceed with PO." }
                    ],
                    "CPE-2026-0040": [
                        { level: 1, role: "Unit Initiator", approver: "Debashish Roy", status: "APPROVED", actedOn: daysAgo(11), slaDays: 1, comment: "Refresh required for S/4 readiness." },
                        { level: 2, role: "Manager IT",     approver: "V. Sharma",     status: "APPROVED", actedOn: daysAgo(9),  slaDays: 2, comment: "Sizing validated." },
                        { level: 3, role: "President IT",   approver: "N. Chatterjee", status: "PENDING",  actedOn: null,         slaDays: 3, comment: "" },
                        { level: 4, role: "CEO Finance",    approver: "Debashish Roy", status: "WAITING",  actedOn: null,         slaDays: 3, comment: "" },
                        { level: 5, role: "Director",       approver: "A. Agarwal",    status: "WAITING",  actedOn: null,         slaDays: 3, comment: "" }
                    ],
                    "CPE-2026-0038": [
                        { level: 1, role: "Unit Initiator",        approver: "Ramesh Iyer",   status: "APPROVED", actedOn: daysAgo(9), slaDays: 1, comment: "Raised against approved budget B-2026-002." },
                        { level: 2, role: "Technical Team",        approver: "A. Deshmukh",   status: "APPROVED", actedOn: daysAgo(9), slaDays: 2, comment: "Design meets revised MPCB discharge norms." },
                        { level: 3, role: "Procurement (HO)",      approver: "Meera Nair",    status: "APPROVED", actedOn: daysAgo(8), slaDays: 2, comment: "Single vendor, rates in line with last ETP contract." },
                        { level: 4, role: "HOD Operations",        approver: "Ramesh Iyer",   status: "APPROVED", actedOn: daysAgo(8), slaDays: 2, comment: "Compliance-driven, approved." },
                        { level: 5, role: "VP Operations",         approver: "Anita Bose",    status: "APPROVED", actedOn: daysAgo(7), slaDays: 3, comment: "Approved." },
                        { level: 6, role: "President Operations",  approver: "S. Krishnan",   status: "PENDING",  actedOn: null,        slaDays: 3, comment: "" },
                        { level: 7, role: "MD",                    approver: "R. S. Agarwal", status: "WAITING",  actedOn: null,        slaDays: 3, comment: "" }
                    ],
                    "CPE-2026-0037": [
                        { level: 1, role: "Unit Initiator",        approver: "Jeevan Thapa",  status: "APPROVED", actedOn: daysAgo(4), slaDays: 1, comment: "Raised against approved budget B-2026-001." },
                        { level: 2, role: "Technical Team",        approver: "A. Deshmukh",   status: "APPROVED", actedOn: daysAgo(3), slaDays: 2, comment: "Standard spec match for yard operations." },
                        { level: 3, role: "Procurement (HO)",      approver: "Meera Nair",    status: "APPROVED", actedOn: daysAgo(2), slaDays: 2, comment: "Single quote, rate matches last purchase." },
                        { level: 4, role: "HOD Operations",        approver: "Ramesh Iyer",   status: "PENDING",  actedOn: null,        slaDays: 2, comment: "" },
                        { level: 5, role: "VP Operations",         approver: "Anita Bose",    status: "WAITING",  actedOn: null,        slaDays: 3, comment: "" },
                        { level: 6, role: "President Operations",  approver: "S. Krishnan",   status: "WAITING",  actedOn: null,        slaDays: 3, comment: "" },
                        { level: 7, role: "MD",                    approver: "R. S. Agarwal", status: "WAITING",  actedOn: null,        slaDays: 3, comment: "" }
                    ],
                    "CPE-2026-0036": [
                        { level: 1, role: "Unit Initiator",        approver: "Ramesh Iyer",   status: "APPROVED", actedOn: daysAgo(8), slaDays: 1, comment: "Raised against approved budget B-2026-002." },
                        { level: 2, role: "Technical Team",        approver: "A. Deshmukh",   status: "APPROVED", actedOn: daysAgo(7), slaDays: 2, comment: "Matches QC lab upgrade plan." },
                        { level: 3, role: "Procurement (HO)",      approver: "Meera Nair",    status: "APPROVED", actedOn: daysAgo(6), slaDays: 2, comment: "L2 selected — bundled IQ/OQ/PQ, ₹1.20 L saving vs L1." },
                        { level: 4, role: "HOD Operations",        approver: "Ramesh Iyer",   status: "APPROVED", actedOn: daysAgo(4), slaDays: 2, comment: "Approved." },
                        { level: 5, role: "VP Operations",         approver: "Anita Bose",    status: "PENDING",  actedOn: null,        slaDays: 3, comment: "" },
                        { level: 6, role: "President Operations",  approver: "S. Krishnan",   status: "WAITING",  actedOn: null,        slaDays: 3, comment: "" },
                        { level: 7, role: "MD",                    approver: "R. S. Agarwal", status: "WAITING",  actedOn: null,        slaDays: 3, comment: "" }
                    ],
                    "CPE-2026-0035": [
                        { level: 1, role: "Unit Initiator",   approver: "Ramesh Iyer",    status: "APPROVED", actedOn: daysAgo(3), slaDays: 1, comment: "Raised against approved budget B-2026-002." },
                        { level: 2, role: "Technical Team",   approver: "K. Subramanian", status: "APPROVED", actedOn: daysAgo(1), slaDays: 2, comment: "Reduces manual polishing time by 60%." },
                        { level: 3, role: "DGM Purchase",     approver: "Meera Nair",     status: "PENDING",  actedOn: null,        slaDays: 2, comment: "" },
                        { level: 4, role: "AVP CPD",          approver: "P. Venkatesh",   status: "WAITING",  actedOn: null,        slaDays: 2, comment: "" },
                        { level: 5, role: "MD",               approver: "R. S. Agarwal",  status: "WAITING",  actedOn: null,        slaDays: 3, comment: "" }
                    ],
                    "CPE-2026-0034": [
                        { level: 1, role: "Unit Initiator",        approver: "Jeevan Thapa",  status: "APPROVED", actedOn: daysAgo(10), slaDays: 1, comment: "Raised against approved budget B-2026-001." },
                        { level: 2, role: "Technical Team",        approver: "A. Deshmukh",   status: "APPROVED", actedOn: daysAgo(9),  slaDays: 2, comment: "Compliant with revised factory fire safety norms." },
                        { level: 3, role: "Procurement (HO)",      approver: "Meera Nair",    status: "APPROVED", actedOn: daysAgo(8),  slaDays: 2, comment: "Single vendor, safety-critical, no deviation." },
                        { level: 4, role: "HOD Operations",        approver: "Ramesh Iyer",   status: "APPROVED", actedOn: daysAgo(7),  slaDays: 2, comment: "Approved." },
                        { level: 5, role: "VP Operations",         approver: "Anita Bose",    status: "APPROVED", actedOn: daysAgo(6),  slaDays: 3, comment: "Approved." },
                        { level: 6, role: "President Operations",  approver: "S. Krishnan",   status: "PENDING",  actedOn: null,         slaDays: 3, comment: "" },
                        { level: 7, role: "MD",                    approver: "R. S. Agarwal", status: "WAITING",  actedOn: null,         slaDays: 3, comment: "" }
                    ],
                    "CPE-2026-0033": [
                        { level: 1, role: "Unit Initiator",        approver: "S. Krishnan",   status: "APPROVED", actedOn: daysAgo(7), slaDays: 1, comment: "Raised against common pool budget B-2026-004." },
                        { level: 2, role: "Technical Team",        approver: "A. Deshmukh",   status: "APPROVED", actedOn: daysAgo(6), slaDays: 2, comment: "Structural load assessment cleared." },
                        { level: 3, role: "Procurement (HO)",      approver: "Meera Nair",    status: "APPROVED", actedOn: daysAgo(5), slaDays: 2, comment: "L1 selected. No deviation." },
                        { level: 4, role: "HOD Operations",        approver: "Ramesh Iyer",   status: "APPROVED", actedOn: daysAgo(4), slaDays: 2, comment: "Approved." },
                        { level: 5, role: "VP Operations",         approver: "Anita Bose",    status: "APPROVED", actedOn: daysAgo(3), slaDays: 3, comment: "Approved." },
                        { level: 6, role: "President Operations",  approver: "S. Krishnan",   status: "APPROVED", actedOn: daysAgo(2), slaDays: 3, comment: "Approved. Net-metering approval to be tracked post-commissioning." },
                        { level: 7, role: "MD",                    approver: "R. S. Agarwal", status: "PENDING",  actedOn: null,        slaDays: 3, comment: "" }
                    ]
                }
            };
        },

        // ==================================================================
        // PROCUREMENT  -  CWIP / PO / GRN
        // ==================================================================

        getProcureData: function () {
            return {
                // po/grn/cwip are live-loaded in Component.js from
                // PurchaseOrderSet/GRNSet/CWIPSet - stay empty rather than
                // flashing demo rows before those reads resolve.
                cwip: [],
                po: [],
                grn: [],

                cwipDraft: {
                    cpeId: "", assetClass: "3000", wbsElement: "",
                    paymentTerms: "", timeframeWeeks: null, executionProcess: "TURNKEY",
                    costCenter: "", profitCenter: "", remarks: ""
                },

                assetClasses: [
                    { key: "3000", text: "3000 — Plant & Machinery" },
                    { key: "3100", text: "3100 — Moulds & Dies" },
                    { key: "3200", text: "3200 — Electrical Installations" },
                    { key: "4000", text: "4000 — Computers & IT Equipment" },
                    { key: "5000", text: "5000 — Furniture & Fixtures" },
                    { key: "6000", text: "6000 — Vehicles" }
                ],

                executionProcesses: [
                    { key: "TURNKEY",  text: "Turnkey (Supply + Install + Commission)" },
                    { key: "SUPPLY",   text: "Supply Only" },
                    { key: "SI",       text: "Supply & Installation" },
                    { key: "SERVICE",  text: "Service / AMC" }
                ]
            };
        },

        // ==================================================================
        // ASSETS  -  Installation Certificate / Capitalization
        // ==================================================================

        getAssetData: function () {
            return {
                // Live-loaded from InstallCertSet in Component.js -  stays
                // empty rather than flashing demo rows before that resolves.
                ic: [],

                // Live-loaded from CwipAgeingSet in Component.js's
                // _loadLiveCwipAgeing() - stays empty rather than flashing
                // demo rows before that read resolves.
                cwipAgeing: [],

                icDraft: {
                    cpeId: "", commissioningDate: null,
                    equipmentCost: null, freightCost: null, installationCost: null,
                    techSignOff: "", remarks: "", photos: []
                }
            };
        },

        // ==================================================================
        // CONFIG  -  DOA matrix, quota, audit trail
        // ==================================================================

        getConfigData: function () {
            return {
                // Live-loaded from DoaRuleSet (+DoaRuleToChain) in
                // Component.js's _loadLiveDoaMatrix() - stays empty rather
                // than flashing demo rows before that resolves.
                doaMatrix: [],

                // Unit quota capex: ≤ ₹2 L per FY, ≤ ₹50 K per single item.
                // yearCap/singleCap are business policy constants, not
                // backend data. items/byUnit are live-loaded (and byUnit
                // derived) in Component.js's _loadLiveQuota().
                quota: {
                    yearCap: 200000,
                    singleCap: 50000,
                    byUnit: [],
                    items: [],
                    draft: { plant: "1100", title: "", amount: null, justification: "" }
                },

                // Live-loaded from AuditLogSet in Component.js - stays empty
                // rather than flashing demo rows before that resolves. Actions
                // taken in-app still append to this locally via addAudit()
                // for immediate feedback, since AuditLogSet has no create.
                auditTrail: [],

                slaConfig: { warnDays: 3, breachDays: 5, autoEscalate: true },

                sapSync: [
                    { action: "Budget Approved",             sapResult: "Internal Order created in SAP", timing: "Immediately",  status: "APPROVED" },
                    { action: "CPE Final Approved",          sapResult: "CWIP created in SAP",           timing: "Immediately",  status: "APPROVED" },
                    { action: "PO Issued",                   sapResult: "Posted to SAP MM",              timing: "Automatically", status: "APPROVED" },
                    { action: "GRN Received",                sapResult: "Commitment updated to actual",  timing: "Synced hourly", status: "APPROVED" },
                    { action: "Installation Cert Approved",  sapResult: "Fixed Asset created + Depreciation starts", timing: "Automatically", status: "APPROVED" }
                ]
            };
        }
    };
});
