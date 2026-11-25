sap.ui.define([
    "zcapexportal/controller/BaseController"
], function (BaseController) {
    "use strict";

    // Column headers for the downloadable/uploadable Excel template - shared
    // by onDownloadTemplate and _applyUploadedWorkbook so the two always
    // stay in lockstep. One row = one line item; the budget-level columns
    // (Budget Title through Cash Flow Year 10) are read off the first data
    // row only - covers both "one budget/one item" and "one budget/many
    // items" the same way, just with 1 vs N data rows. Parsed/written with
    // the vendored SheetJS build (webapp/thirdparty/xlsx.mini.min.js, global
    // XLSX) - a real .xlsx has no delimiter to get wrong, unlike CSV, whose
    // export dialect varies by the user's own Windows regional settings.
    var TEMPLATE_COLUMNS = [
        "Budget Title", "Plant", "Capex Type", "Category",
        "Justification", "Expected Benefit",
        "Enable Financial Metrics (Yes/No)",
        "Cash Flow Year 1", "Cash Flow Year 2", "Cash Flow Year 3", "Cash Flow Year 4", "Cash Flow Year 5",
        "Cash Flow Year 6", "Cash Flow Year 7", "Cash Flow Year 8", "Cash Flow Year 9", "Cash Flow Year 10",
        "Item Description", "Item Amount", "Item Remarks"
    ];

    return BaseController.extend("zcapexportal.controller.BudgetCreate", {

        onInit: function () {
            // Same view/controller serves two routes: "budgetCreate" (no
            // budgetId - blank draft) and "budgetEdit" (budgetId present -
            // load and edit an existing DRAFT, see Budget Items email:
            // "Edit a DRAFT budget: send the same deep POST to /BudgetSet
            // with the existing Budgetid").
            this.getRouter().getRoute("budgetCreate").attachPatternMatched(this._onMatched, this);
            this.getRouter().getRoute("budgetEdit").attachPatternMatched(this._onMatched, this);
            this.enableSearchByKeyOrText("cbPlant");
        },

        _onMatched: function (oEvent) {
            var sBudgetId = oEvent.getParameter("arguments").budgetId;
            var oBudgetModel = this.getOwnerComponent().getModel("budget");
            var that = this;

            if (sBudgetId) {
                this._loadDraftForEdit(sBudgetId);
            } else {
                oBudgetModel.setProperty("/formTitle", this.i18n("budgetCreateTitle"));
                this._resetDraft();
                this._refreshDOA();
            }

            // BudgetToItems (sub-budgets, transport EDSK9B0EA7) - the whole
            // items card stays hidden (BudgetCreate.view.xml binds on this)
            // until the live service actually exposes the nav property.
            // Waits for whenMetadataLoaded() rather than checking
            // synchronously - this route can match right after a fresh page
            // load, before $metadata's own async request has completed,
            // which would otherwise always read as "not found" (same race
            // fixed in Component.js#_loadLiveBudgetList).
            this.whenMetadataLoaded().then(function () {
                oBudgetModel.setProperty(
                    "/itemsFeatureAvailable",
                    that.hasNavigationProperty("Budget", "BudgetToItems")
                );
            });
        },

        /**
         * Loads an existing DRAFT budget (header + cash flows + items) into
         * the same draft shape _resetDraft builds, so every existing
         * handler (onCalc, onAmountChange, the items handlers, _validate,
         * _buildBudgetPayload) works identically whether the draft came
         * from a blank reset or from here. Bounces back to Budget Detail if
         * the record is missing or is no longer DRAFT (items/cash flows/
         * header can only be changed while DRAFT - Budget Items email).
         * @param {string} sBudgetId the budget to edit
         */
        _loadDraftForEdit: function (sBudgetId) {
            var that = this;
            var oBudgetModel = this.getOwnerComponent().getModel("budget");

            this.resolveRecord("budget", "/list", "budgetId", sBudgetId, function (oBudget) {
                if (!oBudget) {
                    that.error(that.i18n("recordNotFound", [sBudgetId]));
                    that.navTo("budgetList", {}, true);
                    return;
                }
                if (oBudget.status !== "DRAFT") {
                    that.error("Only a DRAFT budget can be edited.");
                    that.navTo("budgetDetail", { budgetId: sBudgetId }, true);
                    return;
                }

                oBudgetModel.setProperty("/formTitle", that.i18n("budgetEditTitle"));

                var aCf = oBudget.cashFlows || [];

                oBudgetModel.setProperty("/draft", {
                    budgetId: oBudget.budgetId,
                    fiscalYear: oBudget.fiscalYear,
                    title: oBudget.title,
                    plant: oBudget.plant,
                    capexType: oBudget.capexType,
                    category: oBudget.categoryCode,
                    amount: oBudget.investment || oBudget.approved || null,
                    justification: oBudget.justification,
                    expectedBenefit: oBudget.expectedBenefit || "",
                    metricsEnabled: oBudget.metricsEnabled,
                    hurdleRate: oBudget.hurdleRate || 8,
                    cf1: aCf[0] || null, cf2: aCf[1] || null, cf3: aCf[2] || null, cf4: aCf[3] || null, cf5: aCf[4] || null,
                    cf6: aCf[5] || null, cf7: aCf[6] || null, cf8: aCf[7] || null, cf9: aCf[8] || null, cf10: aCf[9] || null,
                    irr: oBudget.irr, npv: oBudget.npv, payback: oBudget.payback,
                    // "From Existing Internal Order" was removed as a funding
                    // source option (functional ask, same treatment as the
                    // Common Pool Bucket removal above it in git history) -
                    // every budget is funded as a brand-new allocation now,
                    // regardless of what an older record was saved with.
                    fundingSource: "NEW",
                    sourceInternalOrder: "",
                    items: (oBudget.items || []).map(function (oItem, i) {
                        return { id: "existing-" + i, title: oItem.title, amount: oItem.amount, remarks: oItem.remarks };
                    })
                });

                that.byId("msMetricWarn").setVisible(false);

                that._refreshDOA();
                if (oBudget.metricsEnabled) { that.onCalc(); }
            });
        },

        _resetDraft: function () {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            var sDefaultPlant = (oUser.authorizedPlants && oUser.authorizedPlants[0]) || "1100";

            this.getOwnerComponent().getModel("budget").setProperty("/draft", {
                title: "", plant: sDefaultPlant, capexType: "MANUFACTURING",
                category: "PM", amount: null, justification: "", expectedBenefit: "",
                // Discount / Hurdle Rate is a fixed company policy figure
                // (8%), not user-editable - see the read-only field in
                // BudgetCreate.view.xml. NOT the backend's ConfigSet
                // DEFAULT_HURDLE_RATE (that row is 15 live, but the business
                // confirmed the actual policy figure is 8 - that config row
                // is for something else, don't wire it here).
                metricsEnabled: true, hurdleRate: 8,
                cf1: null, cf2: null, cf3: null, cf4: null, cf5: null,
                cf6: null, cf7: null, cf8: null, cf9: null, cf10: null,
                irr: null, npv: null, payback: null,
                fundingSource: "NEW", sourceInternalOrder: "",
                items: []
            });

            this.byId("msMetricWarn").setVisible(false);
        },

        // ------------------------------------------------------------------
        // DOA PREVIEW
        // ------------------------------------------------------------------

        _refreshDOA: function () {
            var oDraft = this.getOwnerComponent().getModel("budget").getProperty("/draft");
            var aChain = this.resolveDOA(oDraft.capexType, oDraft.amount, "BUD");
            this.getOwnerComponent().getModel("app").setProperty("/doaPreview", aChain);
        },

        onCapexTypeChange: function () { this._refreshDOA(); },

        onAmountChange: function () {
            this._refreshDOA();
            if (this.getOwnerComponent().getModel("budget").getProperty("/draft/metricsEnabled")) {
                this.onCalc();
            }
        },

        // ------------------------------------------------------------------
        // BUDGET LINE ITEMS (sub-budgets, transport EDSK9B0EA7)
        // Adding at least one item switches the header Amount from
        // manually-entered to computed-from-items (see _recalcItemsTotal);
        // removing the last item hands manual entry back to the user. Old-
        // style budgets with zero items are unaffected either way.
        // ------------------------------------------------------------------

        onAddItem: function () {
            var oModel = this.getOwnerComponent().getModel("budget");
            var aItems = oModel.getProperty("/draft/items") || [];
            aItems.push({ id: Date.now() + "-" + aItems.length, title: "", amount: null, remarks: "" });
            oModel.setProperty("/draft/items", aItems);
            this._recalcItemsTotal();
        },

        onRemoveItem: function (oEvent) {
            var oModel = this.getOwnerComponent().getModel("budget");
            var oCtx = oEvent.getSource().getBindingContext("budget");
            var aItems = oModel.getProperty("/draft/items") || [];
            var iIndex = aItems.indexOf(oCtx.getObject());
            if (iIndex > -1) { aItems.splice(iIndex, 1); }
            oModel.setProperty("/draft/items", aItems);
            this._recalcItemsTotal();
        },

        onItemChange: function () {
            this._recalcItemsTotal();
        },

        /**
         * Sums every item's amount into the header Amount field and re-runs
         * the DOA/metrics refresh that normally follows an amount edit.
         * No-op (leaves Amount as the user's own manual entry) once the
         * items list is empty again.
         */
        _recalcItemsTotal: function () {
            var oModel = this.getOwnerComponent().getModel("budget");
            var aItems = oModel.getProperty("/draft/items") || [];
            if (!aItems.length) { return; }

            var nTotal = aItems.reduce(function (n, o) { return n + (Number(o.amount) || 0); }, 0);
            oModel.setProperty("/draft/amount", nTotal);
            this.onAmountChange();
        },

        formatItemsTotal: function (aItems) {
            var nTotal = (aItems || []).reduce(function (n, o) { return n + (Number(o.amount) || 0); }, 0);
            return this.formatter.rupees(nTotal) + " (" + (aItems || []).length + " item" +
                ((aItems || []).length === 1 ? "" : "s") + ")";
        },

        // ------------------------------------------------------------------
        // FINANCIAL CALCULATION
        // ------------------------------------------------------------------

        onToggleMetrics: function (oEvent) {
            var bOn = oEvent.getParameter("state");
            if (bOn) {
                this.onCalc();
            } else {
                var oModel = this.getOwnerComponent().getModel("budget");
                oModel.setProperty("/draft/irr", null);
                oModel.setProperty("/draft/npv", null);
                oModel.setProperty("/draft/payback", null);
                this.byId("msMetricWarn").setVisible(false);
            }
        },

        onCalc: function () {
            var oModel = this.getOwnerComponent().getModel("budget");
            var oDraft = oModel.getProperty("/draft");

            var nInvestment = Number(oDraft.amount) || 0;
            var aCF = [
                oDraft.cf1, oDraft.cf2, oDraft.cf3, oDraft.cf4, oDraft.cf5,
                oDraft.cf6, oDraft.cf7, oDraft.cf8, oDraft.cf9, oDraft.cf10
            ]
                .map(function (v) { return Number(v) || 0; })
                .filter(function (v, i, arr) {
                    // keep leading zeros only if a later year has a value
                    return arr.slice(i).some(function (x) { return x !== 0; });
                });

            if (!nInvestment || !aCF.length) {
                oModel.setProperty("/draft/irr", null);
                oModel.setProperty("/draft/npv", null);
                oModel.setProperty("/draft/payback", null);
                this.byId("msMetricWarn").setVisible(false);
                return;
            }

            var oMetrics = this.calcMetrics(nInvestment, aCF, oDraft.hurdleRate);

            oModel.setProperty("/draft/irr", isNaN(oMetrics.irr) ? null : oMetrics.irr);
            oModel.setProperty("/draft/npv", oMetrics.npv);
            oModel.setProperty("/draft/payback", isNaN(oMetrics.payback) ? null : oMetrics.payback);

            this._evaluateMetricQuality(oMetrics, oDraft.hurdleRate);
        },

        /**
         * Shows a warning strip when the investment does not clear the hurdle.
         * @param {object} oMetrics computed metrics
         * @param {number} nRate hurdle rate
         */
        _evaluateMetricQuality: function (oMetrics, nRate) {
            var oStrip = this.byId("msMetricWarn");
            var aMsg = [];

            if (!isNaN(oMetrics.irr) && oMetrics.irr < Number(nRate)) {
                aMsg.push(this.i18n("irrBelowHurdle", [
                    oMetrics.irr.toFixed(1) + "%",
                    Number(nRate).toFixed(1) + "%"
                ]));
            }
            if (oMetrics.npv < 0) {
                aMsg.push(this.i18n("npvNegative"));
            }

            if (aMsg.length) {
                oStrip.setText(aMsg.join(" "));
                oStrip.setVisible(true);
            } else {
                oStrip.setVisible(false);
            }
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

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

        // ------------------------------------------------------------------
        // VALIDATION & SUBMIT
        // ------------------------------------------------------------------

        /**
         * @returns {Array<string>} list of validation messages
         */
        _validate: function () {
            var oDraft = this.getOwnerComponent().getModel("budget").getProperty("/draft");
            var nJustifMinChars = this.getOwnerComponent().getModel("config").getProperty("/justifMinChars") || 20;
            var aErrors = [];

            if (!oDraft.title || !oDraft.title.trim()) { aErrors.push("Budget title is required."); }
            if (!oDraft.plant) { aErrors.push("Plant / unit is required."); }
            if (!oDraft.capexType) { aErrors.push("Capex type is required."); }
            if (!oDraft.category) { aErrors.push("Category is required."); }
            if (!oDraft.amount || Number(oDraft.amount) <= 0) { aErrors.push("Budget amount must be greater than zero."); }
            if (!oDraft.justification || oDraft.justification.trim().length < nJustifMinChars) {
                aErrors.push("Business justification must be at least " + nJustifMinChars + " characters.");
            }
            (oDraft.items || []).forEach(function (oItem, i) {
                var sLabel = "Item " + (i + 1) + (oItem.title ? " (" + oItem.title + ")" : "");
                if (!oItem.title || !oItem.title.trim()) {
                    aErrors.push("Item " + (i + 1) + ": title is required.");
                }
                if (!oItem.amount || Number(oItem.amount) <= 0) {
                    aErrors.push(sLabel + ": amount must be greater than zero.");
                }
            });

            this.byId("inpTitle").setValueState(oDraft.title ? "None" : "Error");
            this.byId("inpAmount").setValueState(oDraft.amount > 0 ? "None" : "Error");
            this.byId("taJustification").setValueState(
                (oDraft.justification || "").trim().length >= nJustifMinChars ? "None" : "Error"
            );

            return aErrors;
        },

        onSaveDraft: function () {
            var oDraft = this.getOwnerComponent().getModel("budget").getProperty("/draft");
            if (!oDraft.title || !oDraft.title.trim()) {
                this.error("Enter at least a budget title before saving a draft.");
                return;
            }

            if (this.isGuarded("saveDraft")) { return; }

            var that = this;
            var bEditing = !!oDraft.budgetId;
            this.setBusy(true);
            this.createEntity("/BudgetSet", this._buildBudgetPayload(oDraft))
                .then(function (oResult) {
                    var sId = (oResult.data && oResult.data.Budgetid) || oDraft.budgetId || "";
                    that.addAudit("BUD", sId || oDraft.title, bEditing ? "Budget draft updated" : "Budget saved as draft", oDraft.title);
                    return that.getOwnerComponent()._loadLiveBudgetList().then(function () {
                        that.releaseGuard("saveDraft");
                        that.setBusy(false);
                        that.toast(bEditing ? "Draft updated." : "Draft saved.");
                        if (bEditing) {
                            that.navTo("budgetDetail", { budgetId: sId });
                        } else {
                            that.navTo("budgetList");
                        }
                    });
                })
                .catch(function (oError) {
                    that.releaseGuard("saveDraft");
                    that.setBusy(false);
                    that.error("Could not save draft.\n\n" + that.extractODataError(oError), "Backend Error");
                });
        },

        onSubmit: function () {
            var aErrors = this._validate();
            if (aErrors.length) {
                this.error(aErrors.join("\n\n"), "Cannot submit");
                return;
            }

            var that = this;
            var oDraft = this.getOwnerComponent().getModel("budget").getProperty("/draft");
            var aChain = this.resolveDOA(oDraft.capexType, oDraft.amount, "BUD");
            var sFirst = aChain.length ? aChain[0].role : "Finance";

            this.confirm(
                "Submit budget of " + this.formatter.rupees(oDraft.amount) +
                " for approval?\n\nIt will be routed to " + sFirst + " first.",
                function () {
                    if (that.isGuarded("submit")) { return; }
                    that.setBusy(true);
                    that.createEntity("/BudgetSet", that._buildBudgetPayload(oDraft))
                        .then(function (oResult) {
                            var sId = (oResult.data && oResult.data.Budgetid) || oDraft.budgetId || "";
                            // createEntity only ever produces a DRAFT row server-side; the
                            // DOA chain isn't instantiated and the document doesn't move to
                            // IN_APPROVAL until SubmitDocument is called on it explicitly.
                            return that.callFunction("SubmitDocument", { DocType: "BUD", DocId: sId })
                                .then(function () {
                                    that.addAudit("BUD", sId || oDraft.title, "Budget submitted for approval", oDraft.title);
                                    return that.getOwnerComponent()._loadLiveBudgetList().then(function () {
                                        that.releaseGuard("submit");
                                        that.setBusy(false);
                                        that.success(
                                            "Budget " + sId + " submitted.\n\nRouted to " + sFirst +
                                            ". On final approval the SAP Internal Order will be created automatically and the budget reserved.",
                                            "Submitted"
                                        );
                                        that.navTo("budgetList");
                                    });
                                })
                                .catch(function (oError) {
                                    return that.getOwnerComponent()._loadLiveBudgetList().then(function () {
                                        that.releaseGuard("submit");
                                        that.setBusy(false);
                                        that.error(
                                            "Budget " + sId + " was created but could not be routed for approval.\n\n" +
                                            that.extractODataError(oError) +
                                            "\n\nIt has been saved as a draft - open it and submit again.",
                                            "Submission Incomplete"
                                        );
                                        that.navTo("budgetList");
                                    });
                                });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("submit");
                            that.setBusy(false);
                            that.error(
                                "Submission failed.\n\n" + that.extractODataError(oError),
                                "Backend Error"
                            );
                        });
                },
                "Submit Budget"
            );
        },

        /**
         * Maps the working draft onto BudgetSet's writable fields.
         * @param {object} oDraft the draft record
         * @returns {object} OData create payload
         */
        _buildBudgetPayload: function (oDraft) {
            var oApp = this.getOwnerComponent().getModel("app");
            // Editing a DRAFT keeps its original fiscal year rather than
            // silently moving it to "now" - only a brand-new budget (no
            // oDraft.fiscalYear, see _resetDraft) falls back to the current one.
            var sFiscalYear = oDraft.fiscalYear ||
                String(oApp.getProperty("/fiscalYear") || "").replace(/\D/g, "").slice(-4);

            // Irr/Npv/Payback are Nullable="false" on the backend, so a metric
            // that was never calculated (or is NaN because the cash flows don't
            // converge) has to go over as 0, not null/undefined.
            var fnMetric = function (v, nDecimals) {
                return (v === null || v === undefined || isNaN(v)) ? Number(0).toFixed(nDecimals) : Number(v).toFixed(nDecimals);
            };

            var oPayload = {
                Fiscalyear: sFiscalYear,
                Title: oDraft.title,
                Capextype: oDraft.capexType,
                Category: oDraft.category,
                Werks: oDraft.plant,
                Waers: "INR",
                Justification: oDraft.justification,
                // Was never sent at all until now - flagged in the Budget
                // Items email as an existing gap found during backend review.
                // ExpectedBenefit already has a real field on this screen
                // (taBenefit, BudgetCreate.view.xml) that was silently
                // dropped on save.
                ExpectedBenefit: oDraft.expectedBenefit || "",
                AmtApproved: Number(oDraft.amount).toFixed(3),
                Investment: Number(oDraft.amount).toFixed(3),
                HurdleRate: Number(oDraft.hurdleRate || 0).toFixed(2),
                Irr: fnMetric(oDraft.irr, 2),
                Npv: fnMetric(oDraft.npv, 3),
                Payback: fnMetric(oDraft.payback, 2),
                // MetricsOn/IsCommonpool are Edm.String(1) flags on the
                // backend ("X"/""), not booleans - a JS true/false here is
                // rejected with "Failed to read property 'MetricsOn'"
                // before the request even reaches CREATE_ENTITY (confirmed
                // live 2026-09-29).
                MetricsOn: oDraft.metricsEnabled ? "X" : "",
                // "From Common Pool Bucket" was removed as a funding source
                // option (functional ask) - this field stays in the payload
                // since it's a permanent part of BudgetSet, always blank.
                IsCommonpool: "",
                // "From Existing Internal Order" was likewise removed as a
                // funding source option (functional ask) - every budget is
                // now a brand-new allocation, so these two stay fixed too.
                // Both fields stay in the payload since they're permanent
                // parts of BudgetSet, same treatment as IsCommonpool above.
                FundingSrc: "NEW",
                SrcAufnr: "",
                // Also never sent until now - same gap as ExpectedBenefit
                // above. BudgetCashFlow is a live nav property already (no
                // feature gate needed, unlike BudgetToItems below).
                BudgetToCashFlows: this._buildCashFlowPayload(oDraft)
            };

            // Present only when editing an existing DRAFT (_loadDraftForEdit) -
            // its absence is what makes this a create instead of a replace
            // (Budget Items email: "send the same deep POST ... with the
            // existing Budgetid" to edit; a brand-new budget never has one).
            if (oDraft.budgetId) {
                oPayload.Budgetid = oDraft.budgetId;
            }

            // BudgetToItems (sub-budgets, transport EDSK9B0EA7) - only sent
            // when the user actually added items, so a budget with none
            // round-trips exactly as it always has (old budgets have no
            // items and keep working - the backend's sum check only applies
            // when items are sent).
            if (oDraft.items && oDraft.items.length) {
                oPayload.BudgetToItems = this._buildItemsPayload(oDraft);
            }

            return oPayload;
        },

        /**
         * Maps cf1..cf10 onto BudgetCashFlow deep-insert rows, trimming the
         * trailing run of unentered years (same rule onCalc already uses to
         * decide how many years of cash flow were actually entered). Empty
         * when metrics are switched off for this budget.
         * @param {object} oDraft the draft record
         * @returns {Array<object>} BudgetToCashFlows rows
         */
        _buildCashFlowPayload: function (oDraft) {
            if (!oDraft.metricsEnabled) { return []; }

            var aRaw = [
                oDraft.cf1, oDraft.cf2, oDraft.cf3, oDraft.cf4, oDraft.cf5,
                oDraft.cf6, oDraft.cf7, oDraft.cf8, oDraft.cf9, oDraft.cf10
            ];
            var nLast = -1;
            aRaw.forEach(function (v, i) { if (Number(v)) { nLast = i; } });

            return aRaw.slice(0, nLast + 1).map(function (v, i) {
                return {
                    Yearnr: (i + 1 < 10 ? "0" : "") + (i + 1),
                    Amount: (Number(v) || 0).toFixed(3),
                    Waers: "INR"
                };
            });
        },

        /**
         * Maps the draft's items onto BudgetItem deep-insert rows. Itemno is
         * sent blank - it's backend-assigned (NUMC, 0001/0002/...) per the
         * Budget Items email.
         * @param {object} oDraft the draft record
         * @returns {Array<object>} BudgetToItems rows
         */
        _buildItemsPayload: function (oDraft) {
            return (oDraft.items || []).map(function (oItem) {
                return {
                    Itemno: "",
                    ItemTitle: oItem.title,
                    Amount: Number(oItem.amount || 0).toFixed(2),
                    Waers: "INR",
                    Remarks: oItem.remarks || ""
                };
            });
        },

        // ------------------------------------------------------------------
        // EXCEL (.xlsx) IMPORT - fills the whole form from a downloaded-and-
        // filled-in template instead of typing every field by hand. One flat
        // template covers both scenarios the user asked for (one budget/one
        // item, one budget/many items): the budget-level columns are read
        // from the first data row only, and every row whose Item
        // Description or Item Amount is filled in becomes one line item.
        // ------------------------------------------------------------------

        onDownloadTemplate: function () {
            var oBudgetModel = this.getOwnerComponent().getModel("budget");
            var aPlants = oBudgetModel.getProperty("/plants") || [];
            var aCapexTypes = oBudgetModel.getProperty("/capexTypes") || [];
            var aCategories = oBudgetModel.getProperty("/categories") || [];

            var sPlant = (aPlants[0] && aPlants[0].text) || "Pacharia Plant";
            var sCapexType = (aCapexTypes[0] && aCapexTypes[0].text) || "Manufacturing Units";
            var sCategory = (aCategories[0] && aCategories[0].text) || "Plant & Machinery";

            var oWb = XLSX.utils.book_new();

            // The sheet the user actually fills in - header row only, so
            // there is never any "did I remember to delete the example rows"
            // ambiguity on upload: every row on THIS sheet is real data.
            var oTemplateSheet = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS]);
            oTemplateSheet["!cols"] = TEMPLATE_COLUMNS.map(function () { return { wch: 22 }; });
            XLSX.utils.book_append_sheet(oWb, oTemplateSheet, "Budget Template");

            // A second sheet with allowed values and worked examples for both
            // scenarios - kept entirely separate from the data sheet above.
            var aInstructionRows = [
                ["How to fill in the Budget Template sheet"],
                ["One row per budget line item."],
                ["Repeat the budget-level columns (Budget Title through Cash Flow Year 10) " +
                    "identically on every row for the same budget - only Item Description / " +
                    "Item Amount / Item Remarks should differ row to row."],
                ["For a single line item, fill in just one data row."],
                [],
                ["Allowed Plant values"]
            ].concat(aPlants.map(function (o) { return [o.text]; }))
                .concat([[], ["Allowed Capex Type values"]])
                .concat(aCapexTypes.map(function (o) { return [o.text]; }))
                .concat([[], ["Allowed Category values"]])
                .concat(aCategories.map(function (o) { return [o.text]; }))
                .concat([
                    [],
                    ["Enable Financial Metrics (Yes/No) - enter Yes or No"],
                    [],
                    ["EXAMPLE - one budget with 2 line items (as two rows repeating the same budget details):"],
                    TEMPLATE_COLUMNS,
                    [
                        "Expansion of Line 3", sPlant, sCapexType, sCategory,
                        "Capacity constraint on Line 3 during peak season.", "15% throughput increase.",
                        "Yes", 250000, 300000, 300000, 300000, 300000, "", "", "", "", "",
                        "New extrusion machine", 1800000, "Primary equipment"
                    ],
                    [
                        "Expansion of Line 3", sPlant, sCapexType, sCategory,
                        "Capacity constraint on Line 3 during peak season.", "15% throughput increase.",
                        "Yes", 250000, 300000, 300000, 300000, 300000, "", "", "", "", "",
                        "Installation and commissioning", 200000, "Civil + electrical works"
                    ],
                    [],
                    ["EXAMPLE - a second, different budget with a single line item (just one row, " +
                        "a different Budget Title from the one above - each distinct Budget Title " +
                        "found in the file becomes its own budget):"],
                    TEMPLATE_COLUMNS,
                    [
                        "Replacement AHU Unit 2", sPlant, sCapexType, sCategory,
                        "Existing AHU unit has exceeded its useful life.", "Reduced maintenance cost.",
                        "No", "", "", "", "", "", "", "", "", "", "",
                        "Replacement AHU unit", 450000, ""
                    ]
                ]);

            var oInstructionsSheet = XLSX.utils.aoa_to_sheet(aInstructionRows);
            oInstructionsSheet["!cols"] = [{ wch: 70 }];
            XLSX.utils.book_append_sheet(oWb, oInstructionsSheet, "Instructions");

            XLSX.writeFile(oWb, "Budget_Upload_Template.xlsx");
        },

        onUploadTemplate: function (oEvent) {
            var aFiles = oEvent.getParameter("files");
            var oFile = aFiles && aFiles[0];
            var oFileUploader = this.byId("fuBudgetUpload");
            var that = this;
            if (!oFile) { return; }

            var oReader = new FileReader();
            oReader.onload = function () {
                that._applyUploadedWorkbook(oReader.result, oFile.name);
                oFileUploader.clear();
            };
            oReader.onerror = function () {
                that.error(that.i18n("templateUploadInvalid"));
                oFileUploader.clear();
            };
            oReader.readAsArrayBuffer(oFile);
        },

        /**
         * Parses the uploaded workbook and replaces the current draft with
         * what it contains - same whole-object setProperty pattern
         * _loadDraftForEdit uses, so every existing handler (onCalc,
         * the items handlers, _validate, _buildBudgetPayload) keeps working
         * identically afterward. Reads only the "Budget Template" sheet (or
         * the first sheet, if the user renamed it) - the "Instructions"
         * sheet's examples are never touched, so there is no risk of
         * accidentally importing example data.
         * @param {ArrayBuffer} oArrayBuffer raw uploaded file bytes
         * @param {string} sFileName uploaded file's name (for the confirmation message)
         */
        _applyUploadedWorkbook: function (oArrayBuffer, sFileName) {
            var that = this;
            var oWb;
            try {
                oWb = XLSX.read(oArrayBuffer, { type: "array" });
            } catch (e) {
                this.error(this.i18n("templateUploadInvalid"));
                return;
            }

            var sSheetName = oWb.SheetNames.indexOf("Budget Template") > -1 ? "Budget Template" : oWb.SheetNames[0];
            var oSheet = sSheetName && oWb.Sheets[sSheetName];
            if (!oSheet) { this.error(this.i18n("templateUploadInvalid")); return; }

            var aRows = XLSX.utils.sheet_to_json(oSheet, { header: 1, defval: "", blankrows: false })
                .map(function (aRow) {
                    return aRow.map(function (v) {
                        return (v === null || v === undefined) ? "" : String(v).trim();
                    });
                })
                .filter(function (aRow) {
                    return aRow.some(function (s) { return s !== ""; });
                });
            if (!aRows.length) { this.error(this.i18n("templateUploadEmpty")); return; }

            var aHeader = aRows[0].map(function (s) { return s.toLowerCase(); });
            var bHeaderOk = TEMPLATE_COLUMNS.slice(0, 4).every(function (sCol) {
                return aHeader.indexOf(sCol.toLowerCase()) > -1;
            });
            if (!bHeaderOk) { this.error(this.i18n("templateUploadInvalid")); return; }

            function col(aRow, sName) {
                var i = aHeader.indexOf(sName.toLowerCase());
                return i > -1 ? (aRow[i] || "").trim() : "";
            }

            // Every row after the header is real data - examples live only
            // on the separate "Instructions" sheet, never on this one, so
            // there is nothing else to tell apart here.
            var aDataRows = aRows.slice(1).filter(function (aRow) {
                return aRow.some(function (s) { return (s || "").trim() !== ""; });
            });
            if (!aDataRows.length) { this.error(this.i18n("templateUploadEmpty")); return; }

            var oBudgetModel = this.getOwnerComponent().getModel("budget");
            var aPlants = oBudgetModel.getProperty("/plants") || [];
            var aCapexTypes = oBudgetModel.getProperty("/capexTypes") || [];
            var aCategories = oBudgetModel.getProperty("/categories") || [];
            var aUnresolved = [];

            // aWarnings defaults to the shared aUnresolved (used by the
            // title-less fallback path further down); the bulk path below
            // passes its own per-budget array instead, so one budget's
            // unrecognised Plant/Capex Type/Category doesn't get blended
            // into another budget's warning list.
            function resolveKey(aList, sLabel, sValue, aWarnings) {
                var sNeedle = (sValue || "").trim().toLowerCase();
                if (!sNeedle) { return ""; }
                var oMatch = aList.filter(function (o) {
                    return String(o.key).toLowerCase() === sNeedle || String(o.text).toLowerCase() === sNeedle;
                })[0];
                if (!oMatch) { (aWarnings || aUnresolved).push(sLabel + " \"" + sValue + "\""); return ""; }
                return oMatch.key;
            }

            // Every row carries a Budget Title - group by it and save each
            // group straight to the backend as a DRAFT automatically (one
            // budget, or many, it's treated the same way: fill the fields,
            // save the draft, no manual form review or Save Draft click
            // needed). Only when the sheet has no Budget Title at all is
            // there nothing to group by, so that one case still falls back
            // to filling the on-screen form for the user to complete by hand.
            var aTitles = aDataRows.map(function (aRow) { return col(aRow, "Budget Title"); });
            var aUniqueTitles = aTitles.filter(function (s, i) { return s && aTitles.indexOf(s) === i; });
            if (aUniqueTitles.length >= 1) {
                this._bulkImportBudgets(aDataRows, aUniqueTitles, col, resolveKey, sFileName);
                return;
            }

            var oFirst = aDataRows[0];
            var sMetricsRaw = col(oFirst, "Enable Financial Metrics (Yes/No)").toLowerCase();
            var oDraft = oBudgetModel.getProperty("/draft") || {};

            var oNewDraft = Object.assign({}, oDraft, {
                title: col(oFirst, "Budget Title") || oDraft.title,
                plant: resolveKey(aPlants, that.i18n("plant"), col(oFirst, "Plant")) || oDraft.plant,
                capexType: resolveKey(aCapexTypes, that.i18n("capexType"), col(oFirst, "Capex Type")) || oDraft.capexType,
                category: resolveKey(aCategories, that.i18n("category"), col(oFirst, "Category")) || oDraft.category,
                fundingSource: "NEW",
                sourceInternalOrder: "",
                justification: col(oFirst, "Justification") || oDraft.justification,
                expectedBenefit: col(oFirst, "Expected Benefit") || oDraft.expectedBenefit,
                metricsEnabled: sMetricsRaw ? /^y/.test(sMetricsRaw) : true,
                cf1: parseFloat(col(oFirst, "Cash Flow Year 1")) || null,
                cf2: parseFloat(col(oFirst, "Cash Flow Year 2")) || null,
                cf3: parseFloat(col(oFirst, "Cash Flow Year 3")) || null,
                cf4: parseFloat(col(oFirst, "Cash Flow Year 4")) || null,
                cf5: parseFloat(col(oFirst, "Cash Flow Year 5")) || null,
                cf6: parseFloat(col(oFirst, "Cash Flow Year 6")) || null,
                cf7: parseFloat(col(oFirst, "Cash Flow Year 7")) || null,
                cf8: parseFloat(col(oFirst, "Cash Flow Year 8")) || null,
                cf9: parseFloat(col(oFirst, "Cash Flow Year 9")) || null,
                cf10: parseFloat(col(oFirst, "Cash Flow Year 10")) || null,
                items: aDataRows.map(function (aRow, i) {
                    var sDesc = col(aRow, "Item Description");
                    var sAmt = col(aRow, "Item Amount");
                    if (!sDesc && !sAmt) { return null; }
                    return {
                        id: Date.now() + "-" + i,
                        title: sDesc,
                        amount: parseFloat(sAmt) || null,
                        remarks: col(aRow, "Item Remarks")
                    };
                }).filter(Boolean)
            });

            oBudgetModel.setProperty("/draft", oNewDraft);
            this._recalcItemsTotal();
            this._refreshDOA();

            if (aUnresolved.length) {
                this.warn(this.i18n("templateUploadLookupWarning", [sFileName, aUnresolved.join(", ")]));
            } else {
                this.success(this.i18n("templateUploadSuccess", [sFileName, String(oNewDraft.items.length)]));
            }
        },

        /**
         * Handles an uploaded workbook, grouped by Budget Title - one group
         * of rows per title (one group if the sheet only has a single
         * budget, several if it has more), each built into its own draft
         * (same field mapping the old single-budget path used), created via
         * createEntity and then immediately submitted for approval via
         * _saveBudgetFromRows - no manual review, Save Draft, or Submit
         * click needed. The on-screen form itself is left untouched until
         * every budget has been attempted, then reset - there would be no
         * single "right" budget to show in it afterward.
         * @param {Array<Array<string>>} aDataRows every data row from the sheet
         * @param {Array<string>} aUniqueTitles distinct Budget Title values, in sheet order
         * @param {function} fnCol column reader bound to the sheet's header row
         * @param {function} fnResolveKey plant/capexType/category text-to-key lookup
         * @param {string} sFileName uploaded file's name (for the summary toast)
         */
        _bulkImportBudgets: function (aDataRows, aUniqueTitles, fnCol, fnResolveKey, sFileName) {
            if (this.isGuarded("bulkImportBudgets")) { return; }

            var that = this;
            var aGroups = aUniqueTitles.map(function (sTitle) {
                return aDataRows.filter(function (aRow) { return fnCol(aRow, "Budget Title") === sTitle; });
            });
            var aResults = [];

            this.setBusy(true);

            aGroups.reduce(function (pChain, aRows) {
                return pChain.then(function () {
                    return that._saveBudgetFromRows(aRows, fnCol, fnResolveKey)
                        .then(function (oSaved) {
                            aResults.push({
                                ok: true, title: oSaved.title, id: oSaved.id, warnings: oSaved.warnings,
                                submitted: oSaved.submitted, submitError: oSaved.submitError
                            });
                        })
                        .catch(function (oError) {
                            aResults.push({
                                ok: false,
                                title: fnCol(aRows[0], "Budget Title") || "(untitled)",
                                error: that.extractODataError(oError)
                            });
                        });
                });
            }, Promise.resolve())
                .then(function () {
                    return that.getOwnerComponent()._loadLiveBudgetList();
                })
                .then(function () {
                    that.releaseGuard("bulkImportBudgets");
                    that.setBusy(false);
                    that._resetDraft();
                    that._refreshDOA();

                    var aCreated = aResults.filter(function (r) { return r.ok; });
                    var aFail = aResults.filter(function (r) { return !r.ok; });
                    var aSubmitted = aCreated.filter(function (r) { return r.submitted; });
                    var aDraftOnly = aCreated.filter(function (r) { return !r.submitted; });
                    var aWithWarnings = aCreated.filter(function (r) { return r.warnings && r.warnings.length; });

                    aSubmitted.forEach(function (r) {
                        that.addAudit("BUD", r.id || r.title, "Budget submitted for approval (automated Excel import)", r.title);
                    });
                    aDraftOnly.forEach(function (r) {
                        that.addAudit("BUD", r.id || r.title,
                            "Budget saved as draft (automated Excel import) - could not be submitted automatically", r.title);
                    });

                    if (aFail.length || aDraftOnly.length) {
                        var aIssues = aDraftOnly.map(function (r) { return r.title + ": " + r.submitError; })
                            .concat(aFail.map(function (r) { return r.title + ": " + r.error; }));
                        that.error(that.i18n("templateUploadBulkMixed", [
                            sFileName,
                            String(aSubmitted.length),
                            String(aDraftOnly.length),
                            String(aFail.length),
                            aIssues.join("\n")
                        ]), "Bulk Import");
                    } else if (aWithWarnings.length) {
                        that.warn(that.i18n("templateUploadBulkWarning", [
                            sFileName,
                            String(aSubmitted.length),
                            aWithWarnings.map(function (r) { return r.title + ": " + r.warnings.join(", "); }).join("\n")
                        ]), "Bulk Import");
                    } else {
                        that.success(that.i18n("templateUploadBulkSuccess", [sFileName, String(aSubmitted.length)]));
                    }

                    if (aCreated.length) {
                        that.navTo("budgetList");
                    }
                });
        },

        /**
         * Builds one budget draft from a single group of rows (all rows
         * sharing the same Budget Title) and saves it as a DRAFT via
         * createEntity - the same payload shape _buildBudgetPayload already
         * produces for the on-screen form, just assembled straight from the
         * sheet instead of from the "budget" model's /draft. Metrics are
         * computed here (mirrors onCalc) since there is no form bound to
         * trigger that automatically for a row group that was never loaded
         * into the model.
         * Once created, immediately submits it for approval too (SubmitDocument,
         * same call onSubmit makes for the on-screen form) - an automated
         * import is meant to go straight to the approval chain, not sit as a
         * DRAFT waiting for someone to open it and press Submit. If the
         * create itself fails, the whole budget is skipped (caller reports
         * it as failed). If create succeeds but the submit call fails (e.g.
         * the sheet's justification didn't clear the backend's minimum),
         * the budget is left as the DRAFT that createEntity already made -
         * same fallback onSubmit itself uses - and reported back as
         * "created but not submitted" rather than losing the data.
         * @param {Array<Array<string>>} aRows this budget's rows (one per line item)
         * @param {function} fnCol column reader bound to the sheet's header row
         * @param {function} fnResolveKey plant/capexType/category text-to-key lookup
         * @returns {Promise<object>} resolves with {title, id, warnings, submitted, submitError}
         */
        _saveBudgetFromRows: function (aRows, fnCol, fnResolveKey) {
            var that = this;
            var oBudgetModel = this.getOwnerComponent().getModel("budget");
            var aPlants = oBudgetModel.getProperty("/plants") || [];
            var aCapexTypes = oBudgetModel.getProperty("/capexTypes") || [];
            var aCategories = oBudgetModel.getProperty("/categories") || [];
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            var sDefaultPlant = (oUser.authorizedPlants && oUser.authorizedPlants[0]) || "1100";
            // Collected separately per budget (rather than sharing one list
            // across the whole file) so a Plant/Capex Type/Category this
            // budget's own rows didn't recognise - and had to default - is
            // reported against this budget alone in the summary toast.
            var aWarnings = [];

            var oFirst = aRows[0];
            var sMetricsRaw = fnCol(oFirst, "Enable Financial Metrics (Yes/No)").toLowerCase();

            var oDraft = {
                title: fnCol(oFirst, "Budget Title"),
                plant: fnResolveKey(aPlants, this.i18n("plant"), fnCol(oFirst, "Plant"), aWarnings) || sDefaultPlant,
                capexType: fnResolveKey(aCapexTypes, this.i18n("capexType"), fnCol(oFirst, "Capex Type"), aWarnings) || "MANUFACTURING",
                category: fnResolveKey(aCategories, this.i18n("category"), fnCol(oFirst, "Category"), aWarnings) || "PM",
                fundingSource: "NEW",
                sourceInternalOrder: "",
                justification: fnCol(oFirst, "Justification"),
                expectedBenefit: fnCol(oFirst, "Expected Benefit"),
                metricsEnabled: sMetricsRaw ? /^y/.test(sMetricsRaw) : true,
                hurdleRate: 8,
                cf1: parseFloat(fnCol(oFirst, "Cash Flow Year 1")) || null,
                cf2: parseFloat(fnCol(oFirst, "Cash Flow Year 2")) || null,
                cf3: parseFloat(fnCol(oFirst, "Cash Flow Year 3")) || null,
                cf4: parseFloat(fnCol(oFirst, "Cash Flow Year 4")) || null,
                cf5: parseFloat(fnCol(oFirst, "Cash Flow Year 5")) || null,
                cf6: parseFloat(fnCol(oFirst, "Cash Flow Year 6")) || null,
                cf7: parseFloat(fnCol(oFirst, "Cash Flow Year 7")) || null,
                cf8: parseFloat(fnCol(oFirst, "Cash Flow Year 8")) || null,
                cf9: parseFloat(fnCol(oFirst, "Cash Flow Year 9")) || null,
                cf10: parseFloat(fnCol(oFirst, "Cash Flow Year 10")) || null,
                irr: null, npv: null, payback: null,
                items: aRows.map(function (aRow, i) {
                    var sDesc = fnCol(aRow, "Item Description");
                    var sAmt = fnCol(aRow, "Item Amount");
                    if (!sDesc && !sAmt) { return null; }
                    return {
                        id: Date.now() + "-" + i,
                        title: sDesc,
                        amount: parseFloat(sAmt) || null,
                        remarks: fnCol(aRow, "Item Remarks")
                    };
                }).filter(Boolean)
            };

            oDraft.amount = oDraft.items.length
                ? oDraft.items.reduce(function (n, o) { return n + (Number(o.amount) || 0); }, 0)
                : null;

            if (oDraft.metricsEnabled && oDraft.amount) {
                var aCF = [
                    oDraft.cf1, oDraft.cf2, oDraft.cf3, oDraft.cf4, oDraft.cf5,
                    oDraft.cf6, oDraft.cf7, oDraft.cf8, oDraft.cf9, oDraft.cf10
                ]
                    .map(function (v) { return Number(v) || 0; })
                    .filter(function (v, i, arr) { return arr.slice(i).some(function (x) { return x !== 0; }); });

                if (aCF.length) {
                    var oMetrics = this.calcMetrics(oDraft.amount, aCF, oDraft.hurdleRate);
                    oDraft.irr = isNaN(oMetrics.irr) ? null : oMetrics.irr;
                    oDraft.npv = oMetrics.npv;
                    oDraft.payback = isNaN(oMetrics.payback) ? null : oMetrics.payback;
                }
            }

            if (!oDraft.title || !oDraft.amount) {
                return Promise.reject(new Error(this.i18n("templateUploadBulkRowSkipped", [oDraft.title || "(untitled)"])));
            }

            return this.createEntity("/BudgetSet", this._buildBudgetPayload(oDraft)).then(function (oResult) {
                var sId = (oResult.data && oResult.data.Budgetid) || "";
                return that.callFunction("SubmitDocument", { DocType: "BUD", DocId: sId })
                    .then(function () {
                        return { title: oDraft.title, id: sId, warnings: aWarnings, submitted: true };
                    })
                    .catch(function (oSubmitError) {
                        return {
                            title: oDraft.title, id: sId, warnings: aWarnings, submitted: false,
                            submitError: that.extractODataError(oSubmitError)
                        };
                    });
            });
        },

        onBack: function () {
            var sBudgetId = this.getOwnerComponent().getModel("budget").getProperty("/draft/budgetId");
            if (sBudgetId) {
                // Editing - browser history normally lands this back on
                // Budget Detail anyway (onNavBack's own history.go(-1)); this
                // is only the fallback for a direct deep link with no history.
                this.getRouter().navTo("budgetDetail", { budgetId: sBudgetId }, true);
            } else {
                this.onNavBack("budgetList");
            }
        }
    });
});
