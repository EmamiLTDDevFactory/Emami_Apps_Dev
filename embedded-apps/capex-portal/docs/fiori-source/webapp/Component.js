sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/m/MessageBox",
    "zcapexportal/model/models",
    "zcapexportal/model/MockData",
    "zcapexportal/model/formatter"
], function (UIComponent, Device, ODataModel, MessageBox, models, MockData, formatter) {
    "use strict";

    /**
     * Normalises an SAP order number: strips padding zeros/blanks, e.g.
     * "000004500012876" -> "4500012876", "000000000000" -> "".
     * @param {string} s raw order number
     * @returns {string} normalised order number
     */
    function normOrder(s) {
        var t = (s || "").trim();
        if (!t || /^0+$/.test(t)) { return ""; }
        return t.replace(/^0+/, "") || t;
    }

    /**
     * The v2 ODataModel already parses Edm.DateTime into JS Date instances.
     * @param {Date|string} d raw value
     * @returns {string|null} ISO string
     */
    function toIso(d) {
        if (!d) { return null; }
        return (d instanceof Date) ? d.toISOString() : d;
    }

    /**
     * Looks up the display text for a code in a {key, text} picklist.
     * @param {Array<object>} aList picklist
     * @param {string} sKey code to resolve
     * @returns {string} display text, or the raw code when not found
     */
    function textFor(aList, sKey) {
        var oMatch = (aList || []).filter(function (o) { return o.key === sKey; })[0];
        return oMatch ? oMatch.text : sKey;
    }

    /**
     * Whole days between a raw OData date and now.
     * @param {Date|string} d raw value
     * @returns {number} days elapsed, 0 when unparsable
     */
    function daysSince(d) {
        if (!d) { return 0; }
        var oDate = (d instanceof Date) ? d : new Date(d);
        if (isNaN(oDate.getTime())) { return 0; }
        return Math.max(0, Math.floor((Date.now() - oDate.getTime()) / 86400000));
    }

    /**
     * Maps an ApprovalInboxSet entity onto the "approval">/inbox row shape.
     * @param {object} oRaw raw OData entity
     * @param {Array<object>} aPlants plant picklist
     * @returns {object} mapped inbox row
     */
    function mapApprovalInboxEntity(oRaw, aPlants) {
        return {
            docType: oRaw.Doctype || "CPE",
            docId: oRaw.Cpeid,
            cpeId: oRaw.Cpeid,
            title: oRaw.Title,
            plant: oRaw.Werks,
            plantName: textFor(aPlants, oRaw.Werks),
            amount: Number(oRaw.Amount) || 0,
            capexType: oRaw.Capextype,
            submittedBy: oRaw.SubmittedBy,
            submittedOn: toIso(oRaw.SubmittedOn),
            currentLevel: oRaw.CurrLevel,
            daysPending: daysSince(oRaw.SubmittedOn),
            budgetId: oRaw.Budgetid,
            priority: oRaw.Priority
        };
    }

    /**
     * Builds a pending-approval inbox row directly from a live Budget record
     * (Budget/mapBudgetEntity already carries Doaid/CurrLevel from
     * BudgetSet - see the DOA routing note on mapBudgetEntity). Used only as
     * a fallback for Budget documents that ApprovalInboxSet itself doesn't
     * (yet) return a row for - see _mergeBudgetApprovals, which is the only
     * caller. `isFallback: true` marks the row as one of these derived rows
     * so the merge never mistakes it for (or overwrites) a real
     * ApprovalInboxSet row.
     * @param {object} oBudget mapped budget row (see mapBudgetEntity)
     * @returns {object} inbox row in the same shape as mapApprovalInboxEntity
     */
    function mapBudgetToInboxRow(oBudget) {
        return {
            docType: "BUD",
            docId: oBudget.budgetId,
            cpeId: null,
            title: oBudget.title,
            plant: oBudget.plant,
            plantName: oBudget.plantName,
            amount: oBudget.approved,
            capexType: oBudget.capexType,
            submittedBy: oBudget.submittedBy,
            submittedOn: oBudget.submittedOn,
            currentLevel: oBudget.currentLevel,
            daysPending: daysSince(oBudget.submittedOn),
            budgetId: oBudget.budgetId,
            priority: "Normal",
            isFallback: true
        };
    }

    /**
     * Builds a pending-approval inbox row directly from a live CPE record -
     * the CPE equivalent of mapBudgetToInboxRow, same fallback role and the
     * same `isFallback: true` marker (see that function's doc comment and
     * _mergeCpeApprovals, its only caller).
     * @param {object} oCpe mapped CPE row (see mapCpeEntity)
     * @returns {object} inbox row in the same shape as mapApprovalInboxEntity
     */
    function mapCpeToInboxRow(oCpe) {
        return {
            docType: "CPE",
            docId: oCpe.cpeId,
            cpeId: oCpe.cpeId,
            title: oCpe.title,
            plant: oCpe.plant,
            plantName: oCpe.plantName,
            amount: oCpe.amount,
            capexType: oCpe.capexType,
            submittedBy: oCpe.submittedBy,
            submittedOn: oCpe.submittedOn,
            currentLevel: oCpe.currentLevel,
            daysPending: daysSince(oCpe.submittedOn),
            budgetId: oCpe.budgetId,
            priority: "Normal",
            isFallback: true
        };
    }

    /**
     * Maps a CwipAgeingSet entity onto the "asset">/cwipAgeing row shape.
     * @param {object} oRaw raw OData entity
     * @returns {object} mapped CWIP ageing row
     */
    function mapCwipAgeingEntity(oRaw) {
        return {
            cwipId: oRaw.Cwipid,
            title: oRaw.Title,
            plant: oRaw.Werks,
            value: Number(oRaw.Amount) || 0,
            ageDays: (oRaw.AgeDays === null || oRaw.AgeDays === undefined) ? null : Number(oRaw.AgeDays),
            icStatus: oRaw.IcStatus || "",
            risk: oRaw.Risk || "None"
        };
    }

    /**
     * Maps a PurchaseOrderSet entity onto the "procure">/po row shape.
     * @param {object} oRaw raw OData entity
     * @param {Array<object>} aPlants plant picklist
     * @returns {object} mapped PO row
     */
    function mapPurchaseOrderEntity(oRaw, aPlants) {
        return {
            poId: oRaw.Ebeln,
            cpeId: oRaw.Cpeid,
            cwipId: oRaw.Cwipid,
            vendor: oRaw.Vendorname,
            vendorCode: oRaw.Lifnr,
            title: oRaw.Title,
            plant: oRaw.Werks,
            plantName: textFor(aPlants, oRaw.Werks),
            amount: Number(oRaw.Amount) || 0,
            status: oRaw.Status,
            issuedOn: toIso(oRaw.IssuedOn),
            expectedDelivery: toIso(oRaw.ExpDelivery),
            paymentTerms: oRaw.PaymentTerms,
            grnPosted: !!oRaw.GrnPosted,
            grnValue: Number(oRaw.GrnValue) || 0,
            incoterm: [oRaw.Inco1, oRaw.Inco2].filter(Boolean).join(" ")
        };
    }

    /**
     * Maps a GRNSet entity onto the "procure">/grn row shape.
     * @param {object} oRaw raw OData entity
     * @returns {object} mapped GRN row
     */
    function mapGrnEntity(oRaw) {
        return {
            grnId: oRaw.Mblnr,
            poId: oRaw.Ebeln,
            title: oRaw.Title,
            plant: oRaw.Werks,
            qty: Number(oRaw.Qty) || 0,
            uom: oRaw.Meins,
            value: Number(oRaw.Value) || 0,
            postedOn: toIso(oRaw.PostedOn),
            status: oRaw.Status,
            material: oRaw.Matnr
        };
    }

    /**
     * Maps a CWIPSet entity onto the "procure">/cwip row shape. CWIPSet has
     * no creation timestamp, so createdOn stays null rather than guessed.
     * @param {object} oRaw raw OData entity
     * @returns {object} mapped CWIP row
     */
    function mapCwipEntity(oRaw) {
        return {
            cwipId: oRaw.Cwipid,
            cpeId: oRaw.Cpeid,
            title: oRaw.Title,
            plant: oRaw.Werks,
            amount: Number(oRaw.Amount) || 0,
            status: oRaw.Status,
            sapWbs: oRaw.Pspnr,
            assetClass: oRaw.Anlkl,
            costCenter: oRaw.Kostl,
            createdOn: null
        };
    }

    /**
     * Maps an InstallCertSet entity onto the "asset">/ic row shape. Photos
     * aren't expanded yet, so that stays an empty array rather than guessed.
     * @param {object} oRaw raw OData entity
     * @param {Array<object>} aPlants plant picklist
     * @returns {object} mapped IC row
     */
    function mapInstallCertEntity(oRaw, aPlants) {
        return {
            icId: oRaw.Icid,
            cpeId: oRaw.Cpeid,
            cwipid: oRaw.Cwipid,
            anlkl: oRaw.Anlkl,
            kostl: oRaw.Kostl,
            poId: oRaw.Ebeln,
            grnId: oRaw.Mblnr,
            title: oRaw.Title,
            plant: oRaw.Werks,
            plantName: textFor(aPlants, oRaw.Werks),
            commissioningDate: toIso(oRaw.CommissionDt),
            status: oRaw.Status,
            equipmentCost: Number(oRaw.EquipCost) || 0,
            freightCost: Number(oRaw.FreightCost) || 0,
            installationCost: Number(oRaw.InstallCost) || 0,
            totalCapitalCost: Number(oRaw.TotalCost) || 0,
            techSignOff: oRaw.TechSignoff,
            techSignOffDate: toIso(oRaw.TechSignDt),
            remarks: oRaw.Remarks,
            assetNumber: oRaw.Anln1,
            capitalizedOn: toIso(oRaw.CapitalizedOn),
            photos: []
        };
    }

    /**
     * Maps an AuditLogSet entity onto the "config">/auditTrail row shape.
     * @param {object} oRaw raw OData entity
     * @returns {object} mapped audit row
     */
    function mapAuditLogEntity(oRaw) {
        return {
            id: oRaw.Auditid,
            docType: oRaw.Doctype,
            docId: oRaw.Docid,
            action: oRaw.Action,
            comment: oRaw.Comments,
            user: oRaw.Userid,
            role: oRaw.Role,
            timestamp: toIso(oRaw.LogDate)
        };
    }

    /**
     * Maps a QuotaItemSet entity onto the "config">/quota/items row shape.
     * @param {object} oRaw raw OData entity
     * @returns {object} mapped quota item
     */
    function mapQuotaItemEntity(oRaw) {
        return {
            id: oRaw.Quotaid,
            plant: oRaw.Werks,
            plantName: oRaw.PlantName,
            fiscalYear: oRaw.Fiscalyear,
            title: oRaw.Title,
            amount: Number(oRaw.Amount) || 0,
            waers: oRaw.Waers,
            status: oRaw.Status,
            currentLevel: oRaw.CurrLevel,
            justification: oRaw.Justification,
            createdBy: oRaw.CreatedBy,
            createdByName: oRaw.CreatedByName,
            createdOn: toIso(oRaw.CreatedOn),
            approvedBy: oRaw.ApprovedBy || "",
            approvedByName: oRaw.ApprovedByName || "",
            approvedOn: toIso(oRaw.ApprovedOn)
        };
    }

    /**
     * Rolls quota items up per plant (unit quota is ≤ its own yearCap per
     * FY). mPlantCaps (Rev3 T10, {WERKS: amount} from
     * Component.js#_loadLiveQuotaCaps) overrides nYearCap for any plant it
     * names (e.g. Pacharia's ₹5,00,000 exception); every other plant keeps
     * the default nYearCap.
     * @param {Array<object>} aItems mapped quota items
     * @param {Array<object>} aPlants plant picklist
     * @param {number} nYearCap default annual per-unit cap
     * @param {object} [mPlantCaps] per-plant cap overrides, {WERKS: amount}
     * @returns {Array<object>} per-plant rollup rows
     */
    function rollupQuotaByUnit(aItems, aPlants, nYearCap, mPlantCaps) {
        var mCaps = mPlantCaps || {};
        var mByPlant = {};
        aItems.forEach(function (it) {
            if (it.status !== "APPROVED") { return; }
            if (!mByPlant[it.plant]) {
                mByPlant[it.plant] = { plant: it.plant, plantName: textFor(aPlants, it.plant), used: 0, count: 0 };
            }
            mByPlant[it.plant].used += it.amount;
            mByPlant[it.plant].count += 1;
        });
        return Object.keys(mByPlant).map(function (k) {
            var nCap = mCaps[k] !== undefined ? mCaps[k] : nYearCap;
            mByPlant[k].remaining = Math.max(0, nCap - mByPlant[k].used);
            return mByPlant[k];
        });
    }

    /**
     * Maps a DoaRuleSet entity (expanded with DoaRuleToChain) onto the
     * "config">/doaMatrix row shape used by BaseController#resolveDOA.
     * AmountTo has no null representation in the entity (Nullable="false"),
     * so 0 is read as "no upper bound" until real rows confirm the convention.
     * docType/active (Rev3 T9) default to "" (any document type) / true
     * until the backend's DoaRule entity actually carries Doctype - see
     * resolveDOA, which treats an empty docType as a generic/fallback rule.
     * @param {object} oRaw raw OData entity
     * @param {Array<object>} aCapexTypes capex type picklist
     * @returns {object} mapped DOA rule
     */
    function mapDoaRuleEntity(oRaw, aCapexTypes) {
        var aChainRows = (oRaw.DoaRuleToChain && oRaw.DoaRuleToChain.results) || [];
        var aChain = aChainRows
            .slice()
            .sort(function (a, b) { return String(a.Seqnr).localeCompare(String(b.Seqnr)); })
            .map(function (r) {
                return { role: r.Role, approver: r.Approver, slaDays: Number(r.SlaDays) || 0 };
            });

        return {
            id: oRaw.Doaid,
            capexType: oRaw.Capextype,
            capexTypeText: textFor(aCapexTypes, oRaw.Capextype),
            amountFrom: Number(oRaw.AmountFrom) || 0,
            amountTo: Number(oRaw.AmountTo) || null,
            rangeText: oRaw.RangeText,
            docType: oRaw.Doctype || "",
            // Edm.String(1) flag, Nullable="false" - the live service always
            // sends "X" or "" here, never JS undefined/null, so the old
            // "default true when absent" guess (written before real Active
            // data existed) silently read every "" row as false instead of
            // the intended "inactive means explicitly X-ed out" - same
            // "X"/"" convention as every other flag read in this file
            // (GstCompliant/TechCompliant/MetricsOn/etc. below). See
            // CAPEX_SESSION_LOG.md Open Issue #94.
            active: oRaw.Active === "X",
            chain: aChain
        };
    }

    /**
     * Maps a DocumentSet entity (CPEToDocuments/BudgetToDocuments child row)
     * onto the shape CPECreate/CPEDetail/ApprovalDetail's Documents tab uses.
     * @param {object} oRaw raw Document entity
     * @param {string} sServiceUrl the live odataModel's service root (already
     *   stripped of its trailing slash - see ODataModel#sServiceUrl)
     * @returns {object} mapped document row
     */
    function mapDocumentEntity(oRaw, sServiceUrl) {
        return {
            docSeq: oRaw.Docseq,
            fileName: oRaw.Filename,
            category: oRaw.Category,
            categoryText: oRaw.CategoryText,
            title: oRaw.DocTitle,
            note: oRaw.Note,
            mimeType: oRaw.Mimetype,
            size: Number(oRaw.Filesize) || 0,
            sizeText: oRaw.SizeText,
            uploadedBy: oRaw.UploadedBy,
            uploadedByName: oRaw.UploadedByName,
            uploadedOn: toIso(oRaw.UploadedOn),
            url: sServiceUrl + "/DocumentSet(Doctype='" + encodeURIComponent(oRaw.Doctype) +
                "',Docid='" + encodeURIComponent(oRaw.Docid) + "',Docseq='" +
                encodeURIComponent(oRaw.Docseq) + "')/$value"
        };
    }

    /**
     * Maps a CPESet entity onto the shape the UI's "cpe" model expects.
     * CPEToVendors/CPEToCashFlows/CPEToDocuments/CPEToApprovalSteps are real
     * navigation properties in $metadata, but vendor comparison, cash flow
     * chart, documents and approval history all need those expanded and
     * mapped in their own right (plus a CPECreate/Evaluation rewrite to
     * actually write through them) - out of scope for this pass, so they
     * stay empty here rather than guessed. slaState is deliberately not
     * read from SlaState - the UI already derives it from daysPending via
     * formatter.slaState, the same as every other worklist.
     * @param {object} oRaw raw OData entity
     * @param {Array<object>} aPlants plant picklist
     * @param {Array<object>} aCategories category picklist
     * @returns {object} mapped CPE record
     */
    /**
     * Maps a Vendor entity (CPEToVendors child row) back onto the shape
     * CPECreate/Evaluation's vendor tables use - the exact reverse of
     * CPECreate.controller.js#_buildCpePayload's own vendor row mapping.
     * @param {object} oRaw raw Vendor entity
     * @returns {object} mapped vendor row
     */
    function mapVendorEntity(oRaw) {
        return {
            id: oRaw.Vendorseq,
            // Live data has been observed with Ranking already carrying the
            // "L" prefix (e.g. "L1") - handle both that and a bare number
            // ("1") rather than assuming one specific stored format.
            rank: oRaw.Ranking ? (String(oRaw.Ranking).charAt(0) === "L" ? oRaw.Ranking : "L" + oRaw.Ranking) : "",
            name: oRaw.Vendorname,
            // SAP vendor master code (Rev3 T6) - only present once a vendor
            // has actually been resolved against VendSet (see
            // CPECreate.controller.js#onVendorNameSelected); blank for a
            // free-typed vendor name with no match.
            lifnr: oRaw.Lifnr || "",
            quote: Number(oRaw.QuoteAmt) || 0,
            totalCost: Number(oRaw.Totalcost) || 0,
            deliveryDays: Number(oRaw.DeliveryDays) || 0,
            quality: Number(oRaw.Quality) || 0,
            warrantyMonths: Number(oRaw.WarrantyMon) || 0,
            gstCompliant: oRaw.GstCompliant === "X",
            selected: oRaw.Selected === "X"
        };
    }

    function mapCpeEntity(oRaw, aPlants, aCategories) {
        return {
            cpeId: oRaw.Cpeid,
            budgetId: oRaw.Budgetid,
            budgetTitle: oRaw.BudgetTitle,
            title: oRaw.Title,
            plant: oRaw.Werks,
            plantName: oRaw.PlantName || textFor(aPlants, oRaw.Werks),
            fiscalYear: oRaw.Fiscalyear,
            capexType: oRaw.Capextype,
            category: textFor(aCategories, oRaw.Category),
            amount: Number(oRaw.Amount) || 0,
            waers: oRaw.Waers,
            status: oRaw.Status,
            currentLevel: oRaw.CurrLevel,
            daysPending: Number(oRaw.DaysPending) || 0,
            doaId: oRaw.Doaid,
            createdBy: oRaw.CreatedBy,
            createdByName: oRaw.CreatedByName,
            createdOn: toIso(oRaw.CreatedOn),
            submittedBy: oRaw.SubmittedBy,
            submittedOn: toIso(oRaw.SubmittedOn),
            approvedOn: toIso(oRaw.ApprovedOn),
            changedBy: oRaw.ChangedBy,
            changedOn: toIso(oRaw.ChangedOn),
            specs: oRaw.Specs,
            terms: oRaw.Terms,
            deliveryWeeks: (oRaw.DeliveryWeeks === null || oRaw.DeliveryWeeks === undefined) ? null : Number(oRaw.DeliveryWeeks),
            technicalCompliant: oRaw.TechCompliant === "X",
            technicalRemark: oRaw.TechRemark,
            techBy: oRaw.TechBy,
            techOn: toIso(oRaw.TechOn),
            selectedVendorId: oRaw.SelVendor,
            nonL1Justification: oRaw.Nonl1Justif,
            savingVsL1: (oRaw.SavingVsL1 === null || oRaw.SavingVsL1 === undefined) ? null : Number(oRaw.SavingVsL1),
            metricsEnabled: oRaw.MetricsOn === "X",
            investment: Number(oRaw.Investment) || 0,
            hurdleRate: Number(oRaw.HurdleRate) || 0,
            irr: (oRaw.Irr === null || oRaw.Irr === undefined) ? null : Number(oRaw.Irr),
            npv: (oRaw.Npv === null || oRaw.Npv === undefined) ? null : Number(oRaw.Npv),
            payback: (oRaw.Payback === null || oRaw.Payback === undefined) ? null : Number(oRaw.Payback),
            poolBudgetId: oRaw.PoolBudgetid,
            poolAmount: (oRaw.PoolAmount === null || oRaw.PoolAmount === undefined) ? null : Number(oRaw.PoolAmount),
            // PR number (backend task EDSK9B0EM1, CPESet's own Banfn field -
            // not a join against another entity set like poId/cpeId are).
            // Filled only after "Push to SAP" creates the PR; read-what's-
            // there-or-stay-blank, same convention as vendorCode above -
            // blank until the transport importing this field is live.
            prNumber: oRaw.Banfn || "",
            blockReason: oRaw.BlockReason,
            rolloutFlag: oRaw.RolloutFlag === "X",
            isQuota: oRaw.IsQuota === "X",
            vendors: ((oRaw.CPEToVendors && oRaw.CPEToVendors.results) || []).map(mapVendorEntity),
            // Actual (post-approval) vendor code (Rev3 T6) - oRaw.Lifnr/
            // VendorCodeLocked don't exist on the live CPE entity type yet
            // (confirmed against $metadata 2026-11-02); both stay blank/
            // false until the backend adds them, same
            // read-what's-there-or-stay-blank convention as everything else
            // in this mapper.
            vendorCode: oRaw.Lifnr || "",
            vendorCodeLocked: oRaw.VendorCodeLocked === "X" || oRaw.VendorCodeLocked === true,
            documents: [],
            cashFlows: []
        };
    }

    /**
     * Maps a Notification1Set entity onto the "app">/notifications row
     * shape. ParamName/ParamValue is a single key-value pair (not a full
     * params object), so it's only included when ParamName is set.
     * @param {object} oRaw raw OData entity
     * @returns {object} mapped notification
     */
    function mapNotificationEntity(oRaw) {
        var oParams;
        if (oRaw.ParamName) {
            oParams = {};
            oParams[oRaw.ParamName] = oRaw.ParamValue;
        }
        return {
            id: oRaw.Notifid,
            unread: oRaw.IsRead !== "X",
            icon: oRaw.Icon,
            title: oRaw.Title,
            text: oRaw.Message,
            time: toIso(oRaw.SentTs),
            route: oRaw.Route,
            params: oParams
        };
    }

    /**
     * Maps a BudgetSet entity (expanded with BudgetToCashFlows) onto the
     * shape the UI's "budget" JSON model expects.
     * @param {object} oRaw raw OData entity
     * @param {Array<object>} aPlants plant picklist
     * @param {Array<object>} aCategories category picklist
     * @returns {object} mapped budget record
     */
    function mapBudgetEntity(oRaw, aPlants, aCategories) {
        var aCashFlowRows = (oRaw.BudgetToCashFlows && oRaw.BudgetToCashFlows.results) || [];
        var aCashFlows = aCashFlowRows
            .slice()
            .sort(function (a, b) { return String(a.Yearnr).localeCompare(String(b.Yearnr)); })
            .map(function (r) { return Number(r.Amount) || 0; });

        // BudgetToItems (transport EDSK9B0EA7) - only present once the
        // backend has shipped it and _loadLiveBudgetList's $expand picked it
        // up (see hasNavigationProperty gate there); absent otherwise, which
        // this maps to a plain empty array rather than undefined.
        var aItemRows = (oRaw.BudgetToItems && oRaw.BudgetToItems.results) || [];
        var aItems = aItemRows
            .slice()
            .sort(function (a, b) { return String(a.Itemno).localeCompare(String(b.Itemno)); })
            .map(function (r) {
                return {
                    itemNo: r.Itemno,
                    title: r.ItemTitle,
                    amount: Number(r.Amount) || 0,
                    currency: r.Waers,
                    remarks: r.Remarks || ""
                };
            });

        return {
            budgetId: oRaw.Budgetid,
            fiscalYear: oRaw.Fiscalyear,
            title: oRaw.Title,
            plant: oRaw.Werks,
            plantName: textFor(aPlants, oRaw.Werks),
            capexType: oRaw.Capextype,
            category: textFor(aCategories, oRaw.Category),
            categoryCode: oRaw.Category,
            approved: Number(oRaw.AmtApproved) || 0,
            committed: Number(oRaw.AmtCommitted) || 0,
            spent: Number(oRaw.AmtSpent) || 0,
            status: oRaw.Status,
            internalOrder: normOrder(oRaw.Aufnr),
            submittedBy: oRaw.SubmittedBy,
            submittedOn: toIso(oRaw.SubmittedOn),
            approvedOn: toIso(oRaw.ApprovedOn),
            justification: oRaw.Justification,
            expectedBenefit: oRaw.ExpectedBenefit || "",
            investment: Number(oRaw.Investment) || 0,
            cashFlows: aCashFlows,
            hurdleRate: Number(oRaw.HurdleRate) || 0,
            irr: (oRaw.Irr === null || oRaw.Irr === undefined) ? null : Number(oRaw.Irr),
            npv: (oRaw.Npv === null || oRaw.Npv === undefined) ? null : Number(oRaw.Npv),
            payback: (oRaw.Payback === null || oRaw.Payback === undefined) ? null : Number(oRaw.Payback),
            metricsEnabled: !!oRaw.MetricsOn,
            isCommonPool: !!oRaw.IsCommonpool,
            fundingSource: oRaw.FundingSrc,
            sourceInternalOrder: normOrder(oRaw.SrcAufnr),
            doaId: oRaw.Doaid,
            currentLevel: oRaw.CurrLevel,
            items: aItems
        };
    }

    return UIComponent.extend("zcapexportal.Component", {

        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Device model (phone / tablet / desktop flags used across all views)
            this.setModel(models.createDeviceModel(), "device");

            // JSONModel's default sizeLimit (100) silently caps any list
            // binding (ComboBox items, Table rows, ...) at the first 100
            // entries even when the underlying array holds more - a classic
            // SAPUI5 gotcha (see sap/ui/model/ClientListBinding#getContexts,
            // which falls back to Math.min(arrayLength, oModel.iSizeLimit)
            // whenever no explicit length is requested). This bit the plant
            // dropdown once /plants grew from 5 mock rows to 252 real ones
            // (Component.js#_loadLivePlants) - entries past #100 were bound
            // correctly but never rendered. Raised here for every named
            // model so any live-loaded list (budgets, CPEs, POs, GRNs, audit
            // trail, ...) can keep growing without silently losing rows.
            ["app", "budget", "cpe", "approval", "procure", "asset", "config"].forEach(function (sName) {
                var oNamedModel = this.getModel(sName);
                if (oNamedModel && oNamedModel.setSizeLimit) { oNamedModel.setSizeLimit(1000); }
            }, this);

            // ------------------------------------------------------------------
            // DATA SOURCE
            // Set USE_MOCK to false once ZCAPEX_PORTAL_SRV is active in Gateway.
            // With mock data the whole app is clickable in BAS with no backend.
            //
            // ZCAPEX_PORTAL_SRV is live. As of the 2026-09-29 backend rebuild,
            // every one of its 26 EntitySets reads successfully (previously
            // all 501 "not implemented in data provider class"). Live-backed
            // below: Budget/ApprovalInbox/CwipAgeing/PurchaseOrder/GRN/CWIP/
            // InstallCert/AuditLog/QuotaItem/DoaRule/CPE/plants (ValueHelpSet
            // Domain='PLANT')/app.user+authorisedPlants(CurrentUserSet+
            // UserPlantSet)/notifications(Notification1Set).
            // Still NOT wired here, deliberately:
            //  - CPEToVendors/CPEToCashFlows/CPEToDocuments/
            //    CPEToApprovalSteps: real navigation properties exist, but
            //    vendor comparison, the cash-flow chart, documents and
            //    approval history need those $expand-ed and mapped, plus a
            //    CPECreate/Evaluation rewrite to create/update through them
            //    (they currently only call SubmitCPE/SubmitEvaluation with a
            //    couple of scalar params, never createEntity) - a bigger,
            //    separate pass.
            //  - DashboardKpiSet: now reads fine, but Dashboard.controller.js
            //    already derives the same numbers live from Budget/
            //    ApprovalInbox/CwipAgeing, so switching adds risk for no
            //    behavioural gain and was left alone.
            //  - ConfigSet (Param/Value): reads fine but has zero rows on the
            //    backend right now, and none of quota.yearCap/singleCap or
            //    slaConfig are meant to come from it anyway (see
            //    MockData.getConfigData - they're documented business-policy
            //    constants, not backend data).
            // BudgetCreate posts straight to BudgetSet (see createEntity in
            // BaseController) - confirmed working live 2026-09-29, but only
            // after MetricsOn/IsCommonpool were fixed to send "X"/"" instead
            // of JS booleans (see _buildBudgetPayload). The follow-on
            // SubmitDocument function import still fails there with a live
            // HTTP 500 - unrelated to anything wired here, needs the
            // backend team.
            // ------------------------------------------------------------------
            this._bUseMock = false;

            MockData.load(this);

            if (!this._bUseMock) {
                this._initLiveData();
            }

            // NOTE: these must be set AFTER MockData.load, which replaces the
            // whole "app" model payload and would otherwise discard them.
            this.getModel("app").setProperty("/density", this.getContentDensityClass());

            // Side navigation starts expanded only when there is genuinely room
            // for it. Device.system alone is user-agent based, so a narrow
            // desktop window would still open it and squeeze the content —
            // the viewport width is the reliable signal.
            this.getModel("app").setProperty("/sideExpanded", this.hasRoomForSideNav());

            this.getRouter().initialize();
        },

        /**
         * Every model path that has a live EntitySet behind it (see the class
         * comment above init). Cleared to empty before the live reads are even
         * requested, so nothing ever renders the MockData seed rows for these -
         * not even for the moment between component start and the response
         * arriving, and not as a silent fallback if the read fails. A screen
         * with no data shows an empty state; it never lies and shows fake rows
         * as if they were real.
         * budget>/plants is deliberately NOT cleared here even though it is
         * now live-backed (ValueHelpSet Domain='PLANT'): other loaders below
         * resolve plantName via textFor(plants, ...) inside their OWN success
         * handlers, at whatever moment each of them happens to finish, so an
         * empty plants list here would just make plantName blank for
         * whichever list happens to resolve before _loadLivePlants does. The
         * mock plant list stays as an immediate bootstrap value instead and
         * is overwritten in place once the live read completes - the exact
         * same tolerance already relied on for the "budget" model itself
         * (mock visible until _loadLiveBudgetList's own read replaces it).
         * DashboardKpi and config values (SLA/quota caps) stay out of this
         * list entirely - see the class comment above init for why.
         */
        _clearLiveBackedSeedData: function () {
            this.getModel("budget").setProperty("/list", []);
            this.getModel("cpe").setProperty("/list", []);
            this.getModel("approval").setProperty("/inbox", []);
            this.getModel("asset").setProperty("/cwipAgeing", []);
            this.getModel("asset").setProperty("/ic", []);
            this.getModel("procure").setProperty("/po", []);
            this.getModel("procure").setProperty("/grn", []);
            this.getModel("procure").setProperty("/cwip", []);
            this.getModel("config").setProperty("/auditTrail", []);
            this.getModel("config").setProperty("/quota/items", []);
            this.getModel("config").setProperty("/quota/byUnit", []);
            this.getModel("config").setProperty("/doaMatrix", []);
            this.getModel("app").setProperty("/notifications", []);
            this.getModel("app").setProperty("/unreadCount", 0);
            this.getModel("app").setProperty("/user", {});
            // Stays blank (not the old hardcoded 3/5/Yes) until ConfigSet
            // actually has matching rows - see _loadLiveSlaConfig.
            this.getModel("config").setProperty("/slaConfig", {
                warnDays: null, breachDays: null, autoEscalate: null
            });
        },

        /**
         * Creates the live OData model and kicks off every live list load.
         * Each step is wrapped individually: a failure here (a bad manifest
         * entry, a model not being ready, anything unexpected) must never
         * stop the router from initialising and the shell from rendering -
         * every affected screen just shows an empty state instead (see
         * _clearLiveBackedSeedData), but that only works if a setup-time
         * exception can't crash init() before the router even starts.
         */
        _initLiveData: function () {
            this._clearLiveBackedSeedData();

            try {
                this._createODataModel();
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error("Could not create the OData model - the live-backed screens will stay empty.", e);
                return;
            }

            var aLoaders = [
                // Returning the promise here (where it wasn't before) is
                // purely additive - _pInitialLoad below just observes "the
                // initial batch landed", it doesn't change when/how any of
                // these fire. Only the handful Dashboard's rollup actually
                // depends on need this; the rest are unchanged.
                function () { return this._loadLiveBudgetList(); },
                function () { return this._loadLiveApprovalInbox(); },
                function () { return this._loadLiveList("asset", "/cwipAgeing", "CwipAgeingSet", mapCwipAgeingEntity); },
                function () { return this._loadLivePOList(); },
                function () { this._loadLiveList("procure", "/grn", "GRNSet", mapGrnEntity); },
                function () { this._loadLiveCwipList(); },
                function () { return this._loadLiveIcList(); },
                function () { this._loadLiveList("config", "/auditTrail", "AuditLogSet", mapAuditLogEntity); },
                function () { this._loadLiveQuotaCaps(); },
                function () { this._loadLiveQuota(); },
                function () { this._loadLiveDoaMatrix(); },
                function () { this._loadLiveSlaConfig(); },
                function () { this._loadLivePlants(); },
                function () { return this._loadLiveCpeList(); },
                function () { return this._loadLiveUser(); },
                function () { this._loadLiveNotifications(); }
            ];

            // Each loader already fires immediately, exactly as before -
            // this only ALSO collects whichever ones return a Promise (most
            // do now) so other code (Dashboard's rollup) can observe "the
            // initial batch has landed" without re-triggering any of these
            // reads itself. Firing order/timing/error-handling above is
            // unchanged.
            var aPromises = [];
            aLoaders.forEach(function (fnLoader) {
                try {
                    var vResult = fnLoader.call(this);
                    if (vResult && typeof vResult.then === "function") {
                        aPromises.push(vResult);
                    }
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error("A live data loader failed to start - its screen keeps showing seed data instead.", e);
                }
            }, this);
            this._pInitialLoad = Promise.all(aPromises);
        },

        /**
         * Returns sapUiSizeCompact on desktop, sapUiSizeCozy on touch devices.
         * @returns {string} density css class
         */
        getContentDensityClass: function () {
            if (this._sContentDensityClass === undefined) {
                if (!Device.support.touch) {
                    this._sContentDensityClass = "sapUiSizeCompact";
                } else {
                    this._sContentDensityClass = "sapUiSizeCozy";
                }
            }
            return this._sContentDensityClass;
        },

        /**
         * Creates the OData v2 model against ZCAPEX_PORTAL_SRV.
         * Deliberately not declared in manifest.json: a declared model is
         * instantiated at start-up and fires a $metadata request immediately,
         * which fails noisily until the Gateway service is activated.
         */
        _createODataModel: function () {
            var oSource = this.getManifestEntry("/sap.app/dataSources/mainService");

            var oModel = new ODataModel(oSource.uri, {
                defaultBindingMode: "TwoWay",
                defaultCountMode: "Inline",
                useBatch: false
            });

            oModel.attachMetadataFailed(function () {
                MessageBox.error(
                    "Could not reach the CAPEX Gateway service.\n\n" +
                    "Check that ZCAPEX_PORTAL_SRV is activated in /IWFND/MAINT_SERVICE " +
                    "and that your user has the required authorisations.",
                    { title: "Service Unavailable" }
                );
            });

            this.setModel(oModel, "odataModel");
        },

        /**
         * Reads BudgetSet (expanded with cash flows) and replaces the seed
         * rows in the "budget" model with live data. /plants is separately
         * live-backed by _loadLivePlants below; categories/capexTypes/
         * assetClasses/executionProcesses/draft have no backend equivalent
         * yet (ValueHelpSet has no rows for those domains) and stay seeded.
         */
        /**
         * Returns a Promise that resolves once the live read actually lands
         * (success or error - a reload failure shouldn't block whatever
         * write action triggered it from completing its own success flow).
         * Callers that need the model to genuinely be up to date before
         * navigating away or reporting success (e.g. after an approve/
         * reject/submit) must chain off this, not fire-and-forget it - see
         * CAPEX_SESSION_LOG.md Open Issue #23 for the bug this fixes.
         */
        _loadLiveBudgetList: function () {
            var oBudgetModel = this.getModel("budget");
            var oODataModel = this.getModel("odataModel");
            var aPlants = oBudgetModel.getProperty("/plants") || [];
            var aCategories = oBudgetModel.getProperty("/categories") || [];
            var that = this;

            function doRead() {
                // BudgetToItems (sub-budget line items, transport EDSK9B0EA7)
                // only goes into $expand once the live service actually
                // exposes it - expanding a nav property $metadata doesn't
                // know about yet would fail the whole BudgetSet read, not
                // just silently omit it. Same gate as
                // hasFunctionImport/hasEntityProperty elsewhere.
                var sExpand = "BudgetToCashFlows";
                if (that._hasNavigationProperty("Budget", "BudgetToItems")) {
                    sExpand += ",BudgetToItems";
                }

                return new Promise(function (resolve) {
                    oODataModel.read("/BudgetSet", {
                        urlParameters: { "$expand": sExpand },
                        success: function (oData) {
                            var aList = (oData.results || []).map(function (oRaw) {
                                return mapBudgetEntity(oRaw, aPlants, aCategories);
                            });
                            oBudgetModel.setProperty("/list", aList);
                            that._mergeBudgetApprovals(aList);
                            that._recalcFiscalYears();
                            resolve(aList);
                        },
                        error: function (oError) {
                            // Live Budget read failed - the seeded rows from MockData
                            // stay visible so the screen isn't left blank.
                            // eslint-disable-next-line no-console
                            console.error("BudgetSet read failed, showing seed data instead.", oError);
                            resolve(null);
                        }
                    });
                });
            }

            // This loader fires immediately inside _initLiveData, right after
            // _createODataModel() constructs the OData model - long before
            // its own async $metadata request could possibly have completed.
            // Deciding the $expand synchronously at that point always saw
            // "not found yet", and since nothing else re-triggers this exact
            // read on a quiet browsing session, that permanently hid
            // BudgetToItems for the rest of the session even after the
            // backend activated it (confirmed live 2026-11-17 - $metadata
            // and a direct read both had it, only this timing hid it).
            // metadataLoaded() is awaited instead of checked synchronously,
            // so the $expand decision is made once metadata has actually
            // arrived; it never rejects into a dead end here - a genuine
            // metadata failure is already surfaced separately by
            // _createODataModel's attachMetadataFailed handler, so either
            // branch just proceeds to doRead().
            return oODataModel.metadataLoaded().then(doRead, doRead);
        },

        /**
         * Reads ApprovalInboxSet - it used to return zero rows for every
         * document type (Budget and CPE alike), which is why
         * _mergeBudgetApprovals/_mergeCpeApprovals exist as a fallback, but
         * it has since started returning real rows (confirmed live
         * 2026-11-02, e.g. a HOLD-status CPE). Whatever it returns here is
         * now treated as authoritative and is never overwritten by the
         * fallback merges below - they only ever add/replace their own
         * previously-derived (`isFallback: true`) rows for documents this
         * read didn't already cover. Runs independently of
         * _loadLiveBudgetList/_loadLiveCpeList's own timing: whichever of the
         * three finishes last simply recomputes the derived rows from the
         * list as it stands then, so the merge is correct regardless of
         * order.
         */
        _loadLiveApprovalInbox: function () {
            var oApprovalModel = this.getModel("approval");
            var oODataModel = this.getModel("odataModel");
            var aPlants = this.getModel("budget").getProperty("/plants") || [];

            return new Promise(function (resolve) {
                oODataModel.read("/ApprovalInboxSet", {
                    success: function (oData) {
                        var aList = (oData.results || []).map(function (r) { return mapApprovalInboxEntity(r, aPlants); });
                        oApprovalModel.setProperty("/inbox", aList);
                        this._mergeBudgetApprovals(this.getModel("budget").getProperty("/list") || []);
                        this._mergeCpeApprovals(this.getModel("cpe").getProperty("/list") || []);
                        resolve(aList);
                    }.bind(this),
                    error: function (oError) {
                        // eslint-disable-next-line no-console
                        console.error("ApprovalInboxSet read failed, showing seed data instead.", oError);
                        resolve(null);
                    }
                });
            }.bind(this));
        },

        /**
         * Folds pending Budget approvals into the live "approval">/inbox
         * list, keyed off Budget's own live Doaid/CurrLevel fields - see
         * mapBudgetToInboxRow. Only a fallback for Budget documents
         * ApprovalInboxSet doesn't already return a row for (real rows are
         * never touched - see the `isFallback` check below); any previous
         * fallback BUD row is recomputed each time so re-running this after
         * an approval naturally drops/advances it.
         * @param {Array<object>} aBudgets mapped budget rows (see mapBudgetEntity)
         */
        _mergeBudgetApprovals: function (aBudgets) {
            var oApprovalModel = this.getModel("approval");
            var aInbox = oApprovalModel.getProperty("/inbox") || [];

            var aLiveBudgetIds = aInbox
                .filter(function (r) { return r.docType === "BUD" && !r.isFallback; })
                .map(function (r) { return r.docId; });

            var aPendingBudgets = aBudgets
                .filter(function (b) {
                    return b.status === "IN_APPROVAL" && b.currentLevel &&
                        aLiveBudgetIds.indexOf(b.budgetId) === -1;
                })
                .map(mapBudgetToInboxRow);

            var aKept = aInbox.filter(function (r) { return !(r.docType === "BUD" && r.isFallback); });

            oApprovalModel.setProperty("/inbox", aKept.concat(aPendingBudgets));
        },

        /**
         * CPE equivalent of _mergeBudgetApprovals, same fallback-only role -
         * pending CPE approvals are derived from CPESet's own live Status/
         * CurrLevel only for documents ApprovalInboxSet doesn't already have
         * a real row for.
         * @param {Array<object>} aCpes mapped CPE rows (see mapCpeEntity)
         */
        _mergeCpeApprovals: function (aCpes) {
            var oApprovalModel = this.getModel("approval");
            var aInbox = oApprovalModel.getProperty("/inbox") || [];

            var aLiveCpeIds = aInbox
                .filter(function (r) { return r.docType === "CPE" && !r.isFallback; })
                .map(function (r) { return r.docId; });

            var aPendingCpes = aCpes
                .filter(function (c) {
                    return c.status === "IN_APPROVAL" && c.currentLevel &&
                        aLiveCpeIds.indexOf(c.cpeId) === -1;
                })
                .map(mapCpeToInboxRow);

            var aKept = aInbox.filter(function (r) { return !(r.docType === "CPE" && r.isFallback); });

            oApprovalModel.setProperty("/inbox", aKept.concat(aPendingCpes));
        },

        /**
         * Rebuilds app>/fiscalYears from whatever fiscal years actually
         * exist across the live Budget and CPE lists - replaces MockData's
         * seeded 3-year placeholder (FY2026/25/24) once real data has
         * loaded. Called after both _loadLiveBudgetList and _loadLiveCpeList
         * so it's correct regardless of which finishes first, same pattern
         * as _mergeBudgetApprovals/_mergeCpeApprovals above. Also keeps
         * app>/fiscalYear pointing at a year that still exists - if the
         * previously selected one doesn't (e.g. the seed had 2024/2025 but
         * live data only has 2026), falls forward to the newest real year
         * instead of silently filtering every screen down to nothing.
         */
        _recalcFiscalYears: function () {
            var oApp = this.getModel("app");
            var aBudgets = this.getModel("budget").getProperty("/list") || [];
            var aCPEs = this.getModel("cpe").getProperty("/list") || [];

            var mSeen = {};
            aBudgets.concat(aCPEs).forEach(function (r) {
                var sYear = String(r.fiscalYear || "").replace(/\D/g, "").slice(-4);
                if (sYear) { mSeen[sYear] = true; }
            });
            var aYears = Object.keys(mSeen).sort(function (a, b) { return b.localeCompare(a); });
            if (!aYears.length) { return; }

            var aFiscalYears = aYears.map(function (sYear) {
                var iNext = (Number(sYear) + 1) % 100;
                var sNext = iNext < 10 ? "0" + iNext : String(iNext);
                return { key: "FY" + sYear, text: "FY " + sYear + "-" + sNext };
            });
            oApp.setProperty("/fiscalYears", aFiscalYears);

            var sCurrent = oApp.getProperty("/fiscalYear");
            var bStillValid = aFiscalYears.some(function (o) { return o.key === sCurrent; });
            if (!bStillValid) {
                oApp.setProperty("/fiscalYear", aFiscalYears[0].key);
            }
        },

        /**
         * Generic list loader: reads an EntitySet and replaces the seed rows
         * at sModel>sPath with the mapped live results.
         * @param {string} sModelName model name
         * @param {string} sPath property path inside that model
         * @param {string} sEntitySet EntitySet name, e.g. "GRNSet"
         * @param {function} fnMap maps one raw entity to a UI row
         * @param {object} [mUrlParameters] extra OData URL parameters (e.g. $expand)
         */
        /**
         * Returns a Promise that resolves once the live read actually lands
         * (success or error) - see _loadLiveBudgetList's doc comment.
         */
        _loadLiveList: function (sModelName, sPath, sEntitySet, fnMap, mUrlParameters) {
            var oModel = this.getModel(sModelName);
            var oODataModel = this.getModel("odataModel");

            return new Promise(function (resolve) {
                oODataModel.read("/" + sEntitySet, {
                    urlParameters: mUrlParameters || {},
                    success: function (oData) {
                        var aList = (oData.results || []).map(fnMap);
                        oModel.setProperty(sPath, aList);
                        resolve(aList);
                    },
                    error: function (oError) {
                        // eslint-disable-next-line no-console
                        console.error(sEntitySet + " read failed, showing seed data instead.", oError);
                        resolve(null);
                    }
                });
            });
        },

        /**
         * Reads PurchaseOrderSet live, replacing the seeded /po list. Exposed
         * as its own method (rather than an inline lambda in the loader
         * array) so screens that change a PO's status via a function import
         * (e.g. PODetail's ConfirmPO) can re-pull the real backend state
         * afterwards instead of only patching the local list optimistically.
         */
        _loadLivePOList: function () {
            var aPlants = this.getModel("budget").getProperty("/plants") || [];
            return this._loadLiveList("procure", "/po", "PurchaseOrderSet",
                function (r) { return mapPurchaseOrderEntity(r, aPlants); });
        },

        /**
         * Same convenience-wrapper shape as _loadLivePOList above, for
         * CWIPCreate's "Push to SAP" to re-pull real CWIP rows afterward
         * instead of fabricating one locally (mapCwipEntity is only
         * accessible inside this closure, not from the controller).
         */
        _loadLiveCwipList: function () {
            return this._loadLiveList("procure", "/cwip", "CWIPSet", mapCwipEntity);
        },

        /**
         * Same convenience-wrapper shape as _loadLivePOList/_loadLiveCwipList,
         * for ICDetail to re-pull the real InstallCertSet record after a real
         * save/capitalize instead of patching the local "asset" model.
         */
        _loadLiveIcList: function () {
            var aPlants = this.getModel("budget").getProperty("/plants") || [];
            return this._loadLiveList("asset", "/ic", "InstallCertSet",
                function (r) { return mapInstallCertEntity(r, aPlants); });
        },

        /**
         * Reads the generic Param/Value ConfigSet live and overrides the
         * unit-quota caps (/quota/yearCap, /quota/singleCap) when the
         * backend has matching rows. Unlike SLA Configuration, these caps
         * are load-bearing - BaseController#checkQuota actively uses them to
         * block or allow a submission - so they fall back to the documented
         * ₹2,00,000 / ₹50,000 policy defaults rather than going blank when
         * unconfigured; a blank cap would make the quota check meaningless.
         * Runs before _loadLiveQuota so that call's own rollup calc picks up
         * whatever cap this resolves to.
         * Expected Param keys - confirmed live against the backend's
         * ZCAPEX_CONFIG table on 2026-11-13: QUOTA_YEAR_CAP (200000),
         * QUOTA_SINGLE_CAP (50000), THREE_QUOTE_LIMIT (1000000),
         * SPECS_MIN_CHARS (15), NONL1_MIN_CHARS (25), JUSTIF_MIN_CHARS (20),
         * COMMENT_MIN_CHARS (10), CWIP_OVERDUE_DAYS (45) all exist there -
         * see BudgetCreate/CPECreate/Evaluation/ApprovalDetail/
         * BudgetApprovalDetail/Capitalization controllers for where each is
         * consumed with a matching inline fallback.
         *
         * The ZCAPEX_CONFIG table also has CYCLE_TIME_BASELINE (24) and
         * DEFAULT_HURDLE_RATE (15), deliberately NOT mapped here:
         * CYCLE_TIME_BASELINE has no frontend consumer to wire it to, and
         * DEFAULT_HURDLE_RATE must NOT drive the CPECreate/BudgetCreate
         * draft default - the business confirmed the real hurdle-rate
         * policy figure is 8%, so that backend row is for something else.
         *
         * Also maps DOC_MAX_MB / DOC_EXTENSIONS (Rev3 T2) into
         * config>/docMaxMb and config>/docExtensions, same
         * fall-back-to-documented-default treatment, and any
         * QUOTA_YEAR_CAP_<WERKS> row (Rev3 T10) into
         * config>/quota/plantCaps as {WERKS: amount} - read by
         * BaseController#checkQuota to cap a specific plant above/below the
         * QUOTA_YEAR_CAP default (e.g. Pacharia's ₹5,00,000 exception).
         */
        _loadLiveQuotaCaps: function () {
            var oConfigModel = this.getModel("config");

            this.getModel("odataModel").read("/ConfigSet", {
                success: function (oData) {
                    var mByParam = {};
                    (oData.results || []).forEach(function (r) { mByParam[r.Param] = r.Value; });

                    if ("QUOTA_YEAR_CAP" in mByParam) {
                        oConfigModel.setProperty("/quota/yearCap", Number(mByParam.QUOTA_YEAR_CAP) || 200000);
                    }
                    if ("QUOTA_SINGLE_CAP" in mByParam) {
                        oConfigModel.setProperty("/quota/singleCap", Number(mByParam.QUOTA_SINGLE_CAP) || 50000);
                    }
                    if ("DOC_MAX_MB" in mByParam) {
                        oConfigModel.setProperty("/docMaxMb", Number(mByParam.DOC_MAX_MB) || 10);
                    }
                    if ("DOC_EXTENSIONS" in mByParam) {
                        oConfigModel.setProperty("/docExtensions", mByParam.DOC_EXTENSIONS);
                    }
                    if ("THREE_QUOTE_LIMIT" in mByParam) {
                        oConfigModel.setProperty("/threeQuoteLimit", Number(mByParam.THREE_QUOTE_LIMIT) || 1000000);
                    }
                    if ("SPECS_MIN_CHARS" in mByParam) {
                        oConfigModel.setProperty("/specsMinChars", Number(mByParam.SPECS_MIN_CHARS) || 15);
                    }
                    if ("NONL1_MIN_CHARS" in mByParam) {
                        oConfigModel.setProperty("/nonL1MinChars", Number(mByParam.NONL1_MIN_CHARS) || 25);
                    }
                    if ("JUSTIF_MIN_CHARS" in mByParam) {
                        oConfigModel.setProperty("/justifMinChars", Number(mByParam.JUSTIF_MIN_CHARS) || 20);
                    }
                    if ("COMMENT_MIN_CHARS" in mByParam) {
                        oConfigModel.setProperty("/commentMinChars", Number(mByParam.COMMENT_MIN_CHARS) || 10);
                    }
                    if ("CWIP_OVERDUE_DAYS" in mByParam) {
                        oConfigModel.setProperty("/cwipOverdueDays", Number(mByParam.CWIP_OVERDUE_DAYS) || 45);
                    }

                    var mPlantCaps = {};
                    Object.keys(mByParam).forEach(function (sParam) {
                        if (sParam.indexOf("QUOTA_YEAR_CAP_") !== 0) { return; }
                        var sPlant = sParam.slice("QUOTA_YEAR_CAP_".length);
                        mPlantCaps[sPlant] = Number(mByParam[sParam]) || 0;
                    });
                    oConfigModel.setProperty("/quota/plantCaps", mPlantCaps);
                },
                error: function (oError) {
                    // eslint-disable-next-line no-console
                    console.error("ConfigSet read failed, quota caps and document config stay at their documented defaults.", oError);
                }
            });
        },

        /**
         * Reads QuotaItemSet live, then derives the per-plant /quota/byUnit
         * rollup from those items (QuotaSummarySet's shape doesn't actually
         * carry a used/count/remaining rollup, so it's computed client-side
         * instead of read directly).
         */
        /**
         * Returns a Promise that resolves once the live read actually lands
         * (success or error) - see _loadLiveBudgetList's doc comment.
         */
        _loadLiveQuota: function () {
            var oConfigModel = this.getModel("config");
            var oODataModel = this.getModel("odataModel");
            var aPlants = this.getModel("budget").getProperty("/plants") || [];
            var nYearCap = oConfigModel.getProperty("/quota/yearCap") || 200000;
            var mPlantCaps = oConfigModel.getProperty("/quota/plantCaps") || {};

            return new Promise(function (resolve) {
                oODataModel.read("/QuotaItemSet", {
                    success: function (oData) {
                        var aItems = (oData.results || []).map(mapQuotaItemEntity);
                        oConfigModel.setProperty("/quota/items", aItems);
                        oConfigModel.setProperty("/quota/byUnit", rollupQuotaByUnit(aItems, aPlants, nYearCap, mPlantCaps));
                        resolve(aItems);
                    },
                    error: function (oError) {
                        // eslint-disable-next-line no-console
                        console.error("QuotaItemSet read failed, showing seed data instead.", oError);
                        resolve(null);
                    }
                });
            });
        },

        /**
         * Reads DoaRuleSet (expanded with its chain) and replaces the seed
         * rows in the "config" model's /doaMatrix with live data. This drives
         * approval routing on both BudgetCreate and CPECreate.
         */
        _loadLiveDoaMatrix: function () {
            var oConfigModel = this.getModel("config");
            var oODataModel = this.getModel("odataModel");
            var aCapexTypes = this.getModel("budget").getProperty("/capexTypes") || [];

            oODataModel.read("/DoaRuleSet", {
                urlParameters: { "$expand": "DoaRuleToChain" },
                success: function (oData) {
                    var aMatrix = (oData.results || []).map(function (oRaw) {
                        return mapDoaRuleEntity(oRaw, aCapexTypes);
                    });
                    oConfigModel.setProperty("/doaMatrix", aMatrix);
                },
                error: function (oError) {
                    // eslint-disable-next-line no-console
                    console.error("DoaRuleSet read failed, showing seed data instead.", oError);
                }
            });
        },

        /**
         * Reads the generic Param/Value ConfigSet live and overrides the SLA
         * constants (warn days, breach days, auto-escalate) when the backend
         * has matching rows, leaving MockData's documented defaults in place
         * for any Param not yet configured there instead of showing a blank
         * screen. This way the screen starts reflecting real values the
         * moment the backend team adds the rows, with no further frontend
         * change needed.
         * Expected Param keys - NOT confirmed with the backend team, since
         * ConfigSet is currently empty and there's nothing to read the real
         * names from: SLA_WARN_DAYS, SLA_BREACH_DAYS, SLA_AUTO_ESCALATE
         * ("X"/"" like every other flag in this service).
         */
        _loadLiveSlaConfig: function () {
            var oConfigModel = this.getModel("config");

            this.getModel("odataModel").read("/ConfigSet", {
                success: function (oData) {
                    var mByParam = {};
                    (oData.results || []).forEach(function (r) { mByParam[r.Param] = r.Value; });

                    if ("SLA_WARN_DAYS" in mByParam) {
                        oConfigModel.setProperty("/slaConfig/warnDays", Number(mByParam.SLA_WARN_DAYS) || 0);
                    }
                    if ("SLA_BREACH_DAYS" in mByParam) {
                        oConfigModel.setProperty("/slaConfig/breachDays", Number(mByParam.SLA_BREACH_DAYS) || 0);
                    }
                    if ("SLA_AUTO_ESCALATE" in mByParam) {
                        oConfigModel.setProperty("/slaConfig/autoEscalate", mByParam.SLA_AUTO_ESCALATE === "X");
                    }
                    // Keeps every slaState/slaText/slaRowClass badge across
                    // CPEList/ApprovalInbox/ApprovalDetail/Reports/Dashboard
                    // aligned with this same ConfigSet-backed policy instead
                    // of their own separately-hardcoded 3/5-day copy - see
                    // CAPEX_SESSION_LOG.md Open Issue #95.
                    formatter.setSlaThresholds(
                        Number(mByParam.SLA_WARN_DAYS) || 0,
                        Number(mByParam.SLA_BREACH_DAYS) || 0
                    );
                },
                error: function (oError) {
                    // eslint-disable-next-line no-console
                    console.error("ConfigSet read failed, SLA values stay at their documented defaults.", oError);
                }
            });
        },

        /**
         * Reads ValueHelpSet filtered to Domain='PLANT' (the only domain the
         * backend has seeded so far - category/capexType/assetClass/
         * executionProcess all come back empty, so those stay on MockData's
         * seeded picklists rather than being overwritten with nothing) and
         * replaces the "budget" model's /plants picklist in place.
         * $top on this service is confirmed live not to be honoured by
         * DPC_EXT (a $top=2 test returned every row), so $filter can't be
         * trusted either without checking - Domain is filtered again
         * client-side as a safety net rather than assuming the server-side
         * $filter actually ran.
         */
        _loadLivePlants: function () {
            var oBudgetModel = this.getModel("budget");
            var oODataModel = this.getModel("odataModel");

            oODataModel.read("/ValueHelpSet", {
                urlParameters: { "$filter": "Domain eq 'PLANT'" },
                success: function (oData) {
                    var aPlants = (oData.results || [])
                        .filter(function (r) { return r.Domain === "PLANT"; })
                        .sort(function (a, b) { return String(a.Sortorder).localeCompare(String(b.Sortorder)); })
                        .map(function (r) { return { key: r.Keyval, text: r.Textval }; });
                    if (aPlants.length) {
                        oBudgetModel.setProperty("/plants", aPlants);
                    }
                },
                error: function (oError) {
                    // eslint-disable-next-line no-console
                    console.error("ValueHelpSet(PLANT) read failed, keeping the seeded plant list.", oError);
                }
            });
        },

        /**
         * Reads CPESet (expanded with CPEToVendors) and replaces the seed
         * rows in the "cpe" model's /list with live data (see mapCpeEntity
         * for what's still missing - documents/cash flows/approval history
         * need $expand-ing and a rewrite that isn't part of this pass).
         */
        /**
         * Returns a Promise that resolves once the live read actually lands
         * (success or error) - see _loadLiveBudgetList's doc comment for why
         * this matters to callers.
         */
        _loadLiveCpeList: function () {
            var oCpeModel = this.getModel("cpe");
            var oODataModel = this.getModel("odataModel");
            var aPlants = this.getModel("budget").getProperty("/plants") || [];
            var aCategories = this.getModel("budget").getProperty("/categories") || [];

            return new Promise(function (resolve) {
                oODataModel.read("/CPESet", {
                    urlParameters: { "$expand": "CPEToVendors" },
                    success: function (oData) {
                        var aList = (oData.results || []).map(function (oRaw) {
                            return mapCpeEntity(oRaw, aPlants, aCategories);
                        });
                        oCpeModel.setProperty("/list", aList);
                        this._mergeCpeApprovals(aList);
                        this._recalcFiscalYears();
                        resolve(aList);
                    }.bind(this),
                    error: function (oError) {
                        // eslint-disable-next-line no-console
                        console.error("CPESet read failed, CPE worklist stays empty.", oError);
                        resolve(null);
                    }
                });
            }.bind(this));
        },

        /**
         * Reads CurrentUserSet (the Gateway resolves this to exactly one row
         * for sy-uname, no key needed) and then UserPlantSet for the
         * authorised-plants list, replacing "app">/user in place. Left
         * untouched on either failure - the persona switcher (a demo aid,
         * see README) still works over whatever is there.
         */
        _loadLiveUser: function () {
            var oAppModel = this.getModel("app");
            var oODataModel = this.getModel("odataModel");

            return new Promise(function (resolve) {
                oODataModel.read("/CurrentUserSet", {
                    success: function (oData) {
                        var oRaw = (oData.results || [])[0];
                        if (!oRaw) { resolve(null); return; }

                        oODataModel.read("/UserPlantSet", {
                            success: function (oPlantData) {
                                oAppModel.setProperty("/user", {
                                    id: oRaw.Userid,
                                    name: oRaw.Fullname,
                                    role: oRaw.Role,
                                    unit: oRaw.Unit,
                                    email: oRaw.Email,
                                    isAdmin: oRaw.IsAdmin === "X",
                                    isGlobal: oRaw.IsGlobal === "X",
                                    authorizedPlants: (oPlantData.results || []).map(function (r) { return r.Werks; })
                                });
                                resolve(oAppModel.getProperty("/user"));
                            },
                            error: function (oError) {
                                // Plant list failed but the user identity itself
                                // is real - show it with no plant restriction
                                // rather than discarding a good read.
                                // eslint-disable-next-line no-console
                                console.error("UserPlantSet read failed, authorizedPlants stays empty.", oError);
                                oAppModel.setProperty("/user", {
                                    id: oRaw.Userid,
                                    name: oRaw.Fullname,
                                    role: oRaw.Role,
                                    unit: oRaw.Unit,
                                    email: oRaw.Email,
                                    isAdmin: oRaw.IsAdmin === "X",
                                    isGlobal: oRaw.IsGlobal === "X",
                                    authorizedPlants: []
                                });
                                resolve(oAppModel.getProperty("/user"));
                            }
                        });
                    },
                    error: function (oError) {
                        // eslint-disable-next-line no-console
                        console.error("CurrentUserSet read failed, app>/user stays empty.", oError);
                        resolve(null);
                    }
                });
            });
        },

        /**
         * Reads Notification1Set and replaces "app">/notifications and
         * /unreadCount with live data.
         */
        _loadLiveNotifications: function () {
            var oAppModel = this.getModel("app");
            var oODataModel = this.getModel("odataModel");

            oODataModel.read("/Notification1Set", {
                success: function (oData) {
                    var aList = (oData.results || []).map(mapNotificationEntity);
                    oAppModel.setProperty("/notifications", aList);
                    oAppModel.setProperty("/unreadCount", aList.filter(function (n) { return n.unread; }).length);
                },
                error: function (oError) {
                    // eslint-disable-next-line no-console
                    console.error("Notification1Set read failed, notifications stay empty.", oError);
                }
            });
        },

        /**
         * True when the window is wide enough to show the side navigation
         * alongside the content rather than as an overlay.
         * @returns {boolean} room flag
         */
        hasRoomForSideNav: function () {
            if (Device.system.phone) { return false; }
            return window.innerWidth >= 1024;
        },

        /**
         * True while the app runs on local mock data.
         * @returns {boolean} mock flag
         */
        isMock: function () {
            return this._bUseMock;
        },

        /**
         * True when the live service's entity type exposes a given
         * navigation property. Same metadata-walk as
         * BaseController#hasEntityProperty/hasFunctionImport, duplicated
         * here because Component.js's document loader runs outside any
         * controller and has no `this.getOwnerComponent()` of its own.
         * @param {string} sEntityType entity type name, e.g. "Budget"
         * @param {string} sNavProp navigation property name, e.g. "BudgetToDocuments"
         * @returns {boolean} true when found
         */
        _hasNavigationProperty: function (sEntityType, sNavProp) {
            var oODataModel = this.getModel("odataModel");
            var oMeta = oODataModel && oODataModel.getServiceMetadata();
            if (!oMeta) { return false; }

            var bFound = false;
            (oMeta.dataServices.schema || []).forEach(function (s) {
                (s.entityType || []).forEach(function (e) {
                    if (e.name !== sEntityType) { return; }
                    bFound = (e.navigationProperty || []).some(function (n) { return n.name === sNavProp; });
                });
            });
            return bFound;
        },

        /**
         * Reads a document's/CPE's/Budget's/IC's attachment list live.
         * Resolves null in mock mode or on a read failure (caller keeps
         * whatever it already had); resolves [] when the document type has
         * no documents nav property on the live service yet (e.g. Budget
         * before BudgetToDocuments ships).
         * @param {string} sDocType "CPE", "BUD" or "IC"
         * @param {string} sDocId the CPE id, Budget id or IC id
         * @returns {Promise<Array<object>|null>} mapped document rows
         */
        loadDocuments: function (sDocType, sDocId) {
            if (this.isMock()) { return Promise.resolve(null); }

            var oODataModel = this.getModel("odataModel");
            if (!oODataModel) { return Promise.resolve(null); }

            var sPath, mUrlParameters;
            if (sDocType === "BUD") {
                if (!this._hasNavigationProperty("Budget", "BudgetToDocuments")) {
                    return Promise.resolve([]);
                }
                sPath = "/BudgetSet('" + encodeURIComponent(sDocId) + "')/BudgetToDocuments";
            } else if (sDocType === "CPE") {
                sPath = "/CPESet('" + encodeURIComponent(sDocId) + "')/CPEToDocuments";
            } else {
                // No dedicated nav property on the live service for this
                // doctype (confirmed for IC - DOCUMENTSET_GET_ENTITYSET only
                // recognises CpeId/BudgetId as navigation keys) - read the
                // flat DocumentSet directly with its own generic $filter
                // fallback instead, which the same backend method already
                // supports for any doctype.
                sPath = "/DocumentSet";
                mUrlParameters = {
                    "$filter": "Doctype eq '" + sDocType.replace(/'/g, "''") +
                        "' and Docid eq '" + sDocId.replace(/'/g, "''") + "'"
                };
            }

            var sServiceUrl = oODataModel.sServiceUrl.replace(/\/$/, "");
            return new Promise(function (resolve) {
                oODataModel.read(sPath, {
                    urlParameters: mUrlParameters,
                    success: function (oData) {
                        resolve((oData.results || []).map(function (r) { return mapDocumentEntity(r, sServiceUrl); }));
                    },
                    error: function (oError) {
                        // eslint-disable-next-line no-console
                        console.error(sPath + " read failed.", oError);
                        resolve(null);
                    }
                });
            });
        }
    });
});
