sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/Image",
    "sap/ui/core/HTML"
], function (BaseController, JSONModel, Fragment, Image, HTML) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.CPECreate", {

        onInit: function () {
            this.getRouter().getRoute("cpeCreate").attachPatternMatched(this._onMatched, this);
            this._wireKpiTiles();
        },

        /**
         * "Committed"/"Spent" jump to PO List/GRN List, same pattern as
         * BudgetDetail#_wireKpiTiles (sap.m.VBox has no own "press" event,
         * hence attachBrowserEvent). Lands on the full list, unfiltered -
         * same known limitation BudgetDetail's own tiles already have,
         * neither list screen has a budget filter today.
         */
        _wireKpiTiles: function () {
            var that = this;
            var oCommitted = this.byId("tileCpeCommitted");
            if (oCommitted) {
                oCommitted.attachBrowserEvent("click", function () {
                    that._bResumeDraft = true;
                    that.navTo("poList");
                });
            }

            var oSpent = this.byId("tileCpeSpent");
            if (oSpent) {
                oSpent.attachBrowserEvent("click", function () {
                    that._bResumeDraft = true;
                    that.navTo("grnList");
                });
            }
        },

        /**
         * Normally re-matching this route always wipes the draft back to
         * empty (see #_resetDraft) - correct for a genuinely fresh Create
         * CPE navigation, but wrong for the one case added alongside the
         * Committed/Spent KPI tiles above: the user left via those tiles to
         * check PO List/GRN List and came straight back. `_bResumeDraft`
         * (set right before that one navTo, nowhere else) distinguishes
         * that round trip from every other way of landing on this route,
         * so the in-progress CPE survives it instead of being discarded.
         */
        _onMatched: function () {
            if (this._bResumeDraft) {
                this._bResumeDraft = false;
                return;
            }

            var oModel = this.getOwnerComponent().getModel("cpe");
            var sPreselected = oModel.getProperty("/draft/budgetId");

            this.isDocUploadEnabled();
            this._resetDraft(sPreselected);

            if (sPreselected) {
                this.byId("cbBudget").setSelectedKey(sPreselected);
                this._applyBudget(sPreselected);
            }
        },

        _resetDraft: function (sKeepBudgetId) {
            this._bSaving = false;
            this.getOwnerComponent().getModel("cpe").setProperty("/draft", {
                budgetId: sKeepBudgetId || "",
                title: "", plant: "", plantName: "", capexType: "", category: "", categoryCode: "",
                amount: null, specs: "", terms: "", deliveryWeeks: null,
                // Discount / Hurdle Rate is a fixed company policy figure
                // (8%), not user-editable - see the read-only field in
                // CPECreate.view.xml. NOT the backend's ConfigSet
                // DEFAULT_HURDLE_RATE (that row is 15 live, but the business
                // confirmed the actual policy figure is 8 - that config row
                // is for something else, don't wire it here).
                metricsEnabled: true, hurdleRate: 8,
                cf1: null, cf2: null, cf3: null, cf4: null, cf5: null,
                irr: null, npv: null, payback: null,
                vendors: [],
                selectedVendorId: "", nonL1Justification: "", showNonL1: false,
                doaPreview: [],
                // "Single Vendor" checkbox (functional ask, 2026-11-06; UI
                // label changed from "Single CPE" later - internal draft key
                // kept as singleCpe to avoid touching every binding) - shown
                // once a budget is selected; shrinks RFQ/Quotation to 1 slot
                // each instead of the usual 3 (see onSingleCpeChange).
                // Frontend-only, same as every other attachment-matrix flag
                // here - nothing is sent to the backend about this choice,
                // it only controls how many slots render/validate locally.
                singleCpe: false,
                // Mandatory once singleCpe is ticked (enforced in _validate,
                // same treatment as nonL1Justification below) - shown beside
                // the checkbox, not under it. Sent to the backend as
                // SingleVendJust (see _buildCpePayload) - singleCpe itself
                // stays frontend-only, the backend only needs this text.
                singleVendorJustification: "",
                // Document attachment matrix (functional ask, 2026-11-02;
                // RFQ/Quotation fixed at 3 slots each, 2026-11-06) -
                // TCC/Negotiation History/Justification Note are always
                // exactly one each, General/Additional is an open-ended
                // user-managed list. See _buildEmptyAttachments.
                // Backend has no way to actually store an uploaded file's
                // content yet (see CAPEX_SESSION_LOG.md Open Issue #51) -
                // this captures the selection locally only, flagged in the
                // view with a message strip, not silently pretended to work.
                attachments: this._buildEmptyAttachments(),
                budgetCheck: {
                    approved: 0, committed: 0, spent: 0,
                    available: 0, sufficient: true, shortfall: 0, checked: false
                }
            });

            this.byId("msBudget").setVisible(false);
            this._clearAttachmentFileUploaders();
        },

        /**
         * sap.ui.unified.FileUploader keeps its own internally-remembered
         * chosen filename, independent of any model binding - resetting
         * /draft/attachments above genuinely clears the data (no _file
         * reference survives, so a stale display here can never cause a
         * re-upload), but every FileUploader control itself still visually
         * shows whatever was last picked in it until told otherwise. The
         * attachment slots are all dynamically bound (RFQ/Quotation/General
         * are variable-length aggregations), so there's no fixed set of
         * control ids to byId() - sweep the whole view instead.
         */
        _clearAttachmentFileUploaders: function () {
            this.getView().findAggregatedObjects(true, function (oControl) {
                return oControl.isA("sap.ui.unified.FileUploader");
            }).forEach(function (oFileUploader) { oFileUploader.clear(); });
        },

        // ------------------------------------------------------------------
        // DOCUMENT ATTACHMENTS
        // ------------------------------------------------------------------

        /**
         * Builds a fresh attachments structure - RFQ/Quotation get
         * iSlots slots each (default 3, independent of vendor count per
         * 2026-11-06's earlier fix; the "Single CPE" checkbox added the
         * same day calls this with 1 instead via onSingleCpeChange),
         * TCC/Negotiation History/Justification Note are always exactly
         * one slot, General/Additional starts empty (user-added).
         * @param {number} [iSlots] RFQ/Quotation slot count, default 3
         * @returns {object} attachments structure
         */
        _buildEmptyAttachments: function (iSlots) {
            var iCount = iSlots || 3;
            var fnSlot = function (sPrefix, i) {
                return { id: sPrefix + i, label: sPrefix === "RFQ" ? "RFQ " + i : "Quotation " + i, fileName: "", fileSize: 0, fileType: "", title: "", note: "", previewUrl: "" };
            };
            var aRfq = [], aQuotation = [], i;
            for (i = 1; i <= iCount; i++) {
                aRfq.push(fnSlot("RFQ", i));
                aQuotation.push(fnSlot("QUOTE", i));
            }
            return {
                rfq: aRfq,
                quotation: aQuotation,
                tcc: { fileName: "", fileSize: 0, fileType: "", title: "", note: "", previewUrl: "" },
                negotiation: { fileName: "", fileSize: 0, fileType: "", title: "", note: "", previewUrl: "" },
                justification: { fileName: "", fileSize: 0, fileType: "", title: "", note: "", previewUrl: "" },
                general: []
            };
        },

        /**
         * "Single CPE" checkbox (functional ask, 2026-11-06) - shrinks
         * RFQ/Quotation to 1 slot each when ticked, back to 3 when
         * unticked. Keeps slot 1's already-picked file (if any) across the
         * switch either way; slots 2/3 are dropped silently when shrinking
         * - checking the box is itself a deliberate action, not something
         * that needs a confirm dialog. TCC/Negotiation History/
         * Justification Note/General are untouched - they were already
         * single/optional regardless of this flag.
         * @param {sap.ui.base.Event} oEvent CheckBox select event
         */
        onSingleCpeChange: function (oEvent) {
            var bSingle = oEvent.getParameter("selected");
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oDraft = oModel.getProperty("/draft");
            var oFresh = this._buildEmptyAttachments(bSingle ? 1 : 3);

            ["rfq", "quotation"].forEach(function (sCategory) {
                var oOldFirst = (oDraft.attachments[sCategory] || [])[0];
                if (oOldFirst) {
                    oFresh[sCategory][0].fileName = oOldFirst.fileName;
                    oFresh[sCategory][0].fileSize = oOldFirst.fileSize;
                    oFresh[sCategory][0].fileType = oOldFirst.fileType;
                    oFresh[sCategory][0].title = oOldFirst.title;
                    oFresh[sCategory][0].note = oOldFirst.note;
                    oFresh[sCategory][0]._file = oOldFirst._file;
                    oFresh[sCategory][0].previewUrl = oOldFirst.previewUrl;
                }
            });

            oModel.setProperty("/draft/attachments/rfq", oFresh.rfq);
            oModel.setProperty("/draft/attachments/quotation", oFresh.quotation);
        },

        /**
         * Shared handler for the repeating slots in the attachment matrix
         * (RFQ/Quotation/General, each bound as a list item so a binding
         * context is available) - captures the picked file's name/size onto
         * that one slot via an indexed setProperty, not a whole-array
         * replace (same stomping bug/fix as the vendor table - see Open
         * Issue #46). Does not actually upload anywhere - the backend has
         * no endpoint to receive the file content yet (see the message
         * strip in the view and Open Issue #51); this only records what the
         * user picked.
         */
        onAttachmentFileChange: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("cpe");
            if (!oCtx) { return; }

            var aFiles = oEvent.getParameter("files");
            var oFile = aFiles && aFiles[0];

            if (oFile) {
                var oCheck = this.validateFile(oFile);
                if (!oCheck.ok) {
                    this.toast(oCheck.reason);
                    oEvent.getSource().clear();
                    return;
                }
            }

            var sFileName = oFile ? oFile.name : (oEvent.getParameter("newValue") || "");
            var iFileSize = oFile ? oFile.size : 0;
            var sFileType = oFile ? oFile.type : "";

            var oModel = this.getOwnerComponent().getModel("cpe");
            var sOldPreviewUrl = oModel.getProperty(oCtx.getPath() + "/previewUrl");
            if (sOldPreviewUrl && sOldPreviewUrl.indexOf("blob:") === 0) {
                URL.revokeObjectURL(sOldPreviewUrl);
            }
            oModel.setProperty(oCtx.getPath() + "/fileName", sFileName);
            oModel.setProperty(oCtx.getPath() + "/fileSize", iFileSize);
            oModel.setProperty(oCtx.getPath() + "/fileType", sFileType);
            // Not bound by any control - the raw File object actually
            // uploaded by _uploadAttachments, kept alongside the slot's
            // displayed metadata (fileName/fileSize/fileType above).
            oModel.setProperty(oCtx.getPath() + "/_file", oFile || null);
            oModel.setProperty(oCtx.getPath() + "/previewUrl", oFile ? URL.createObjectURL(oFile) : "");
        },

        /**
         * TCC/Negotiation History/Justification Note aren't repeating slots
         * (always exactly one each), so there's no list binding context for
         * them to share onAttachmentFileChange - same capture logic, fixed
         * path instead.
         * @param {string} sSlot "tcc"|"negotiation"|"justification"
         */
        _setAttachmentFile: function (sSlot, oEvent) {
            var aFiles = oEvent.getParameter("files");
            var oFile = aFiles && aFiles[0];

            if (oFile) {
                var oCheck = this.validateFile(oFile);
                if (!oCheck.ok) {
                    this.toast(oCheck.reason);
                    oEvent.getSource().clear();
                    return;
                }
            }

            var sFileName = oFile ? oFile.name : (oEvent.getParameter("newValue") || "");
            var iFileSize = oFile ? oFile.size : 0;
            var sFileType = oFile ? oFile.type : "";

            var oModel = this.getOwnerComponent().getModel("cpe");
            var sOldPreviewUrl = oModel.getProperty("/draft/attachments/" + sSlot + "/previewUrl");
            if (sOldPreviewUrl && sOldPreviewUrl.indexOf("blob:") === 0) {
                URL.revokeObjectURL(sOldPreviewUrl);
            }
            oModel.setProperty("/draft/attachments/" + sSlot + "/fileName", sFileName);
            oModel.setProperty("/draft/attachments/" + sSlot + "/fileSize", iFileSize);
            oModel.setProperty("/draft/attachments/" + sSlot + "/fileType", sFileType);
            oModel.setProperty("/draft/attachments/" + sSlot + "/_file", oFile || null);
            oModel.setProperty("/draft/attachments/" + sSlot + "/previewUrl", oFile ? URL.createObjectURL(oFile) : "");
        },

        onTccFileChange: function (oEvent) { this._setAttachmentFile("tcc", oEvent); },
        onNegotiationFileChange: function (oEvent) { this._setAttachmentFile("negotiation", oEvent); },
        onJustificationFileChange: function (oEvent) { this._setAttachmentFile("justification", oEvent); },

        /**
         * Only PDFs and images can be rendered inline in the preview Dialog
         * below (same rule CPEDetail#formatCanPreview already applies to a
         * saved CPE's attachments) - every other allowed extension
         * (xls/xlsx/doc/docx/msg/zip) has no in-browser rendering path, so
         * the eye icon stays hidden for those slots.
         * @param {string} sFileType picked file's MIME type
         * @returns {boolean} whether the View icon should show
         */
        formatCanPreview: function (sFileType) {
            sFileType = (sFileType || "").toLowerCase();
            return sFileType === "application/pdf" || sFileType.indexOf("image/") === 0;
        },

        /**
         * Combines the View icon's two bound parts (previewUrl/fileType)
         * into the single boolean `visible` needs - a plain `visible`
         * expression binding can't call a formatter with two different
         * binding paths, so this takes both as explicit parts instead.
         * @param {string} sPreviewUrl the slot's local blob preview
         * @param {string} sFileType picked file's MIME type
         * @returns {boolean} whether the View icon should show
         */
        formatCanPreviewAttachment: function (sPreviewUrl, sFileType) {
            return !!sPreviewUrl && this.formatCanPreview(sFileType);
        },

        /**
         * Opens a picked-but-not-yet-saved attachment inline, reusing the
         * same DocumentPreview fragment/dialog CPEDetail#onPreview uses for
         * a saved CPE's own attachments. Works off `previewUrl` (a local
         * blob: URL from the File just picked) rather than a real backend
         * `url` - nothing is uploaded yet at this stage of CPE Create.
         * Repeating slots (RFQ/Quotation/General) carry a list binding
         * context; TCC/Negotiation History/Justification Note don't (fixed
         * single paths), so those three pass their slot key via the
         * button's own customData instead.
         */
        onViewAttachment: function (oEvent) {
            var oSource = oEvent.getSource();
            var oCtx = oSource.getBindingContext("cpe");
            var oModel = this.getOwnerComponent().getModel("cpe");
            var sPreviewUrl, sFileType, sTitle;

            if (oCtx) {
                sPreviewUrl = oCtx.getProperty("previewUrl");
                sFileType = oCtx.getProperty("fileType");
                sTitle = oCtx.getProperty("fileName") || oCtx.getProperty("label");
            } else {
                var sSlot = oSource.data("slot");
                var sPath = "/draft/attachments/" + sSlot + "/";
                sPreviewUrl = oModel.getProperty(sPath + "previewUrl");
                sFileType = oModel.getProperty(sPath + "fileType");
                sTitle = oModel.getProperty(sPath + "fileName");
            }

            if (!sPreviewUrl) { return; }

            var that = this;
            var oView = this.getView();

            if (!this._pPreviewDialog) {
                this._pPreviewDialog = Fragment.load({
                    id: oView.getId(),
                    name: "zcapexportal.view.fragment.DocumentPreview",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pPreviewDialog.then(function (oDialog) {
                that.setModel(new JSONModel({ title: sTitle, url: sPreviewUrl }), "preview");
                var oContent = Fragment.byId(oView.getId(), "vbPreviewContent");
                oContent.removeAllItems();
                if ((sFileType || "").toLowerCase().indexOf("image/") === 0) {
                    oContent.addItem(new Image({
                        src: sPreviewUrl,
                        width: "100%",
                        densityAware: false
                    }).addStyleClass("sapUiTinyMargin"));
                } else {
                    oContent.addItem(new HTML({
                        content: "<iframe src=\"" + sPreviewUrl.replace(/"/g, "&quot;") +
                            "\" style=\"width:100%;height:100%;border:0;\"></iframe>"
                    }));
                }
                oDialog.open();
            });
        },

        onDownloadFromPreview: function () {
            var sUrl = this.getModel("preview").getProperty("/url");
            if (sUrl) { window.open(sUrl, "_blank"); }
        },

        onClosePreview: function () {
            this._pPreviewDialog.then(function (oDialog) { oDialog.close(); });
        },

        onAddGeneralAttachment: function () {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var aGeneral = oModel.getProperty("/draft/attachments/general") || [];

            // Same id-uniqueness fix as onAddVendor (Open Issue #46) - the
            // list below is keyed by `id` for the same reason.
            var iMaxId = aGeneral.reduce(function (m, a) {
                var n = parseInt(String(a.id || "").replace(/\D/g, ""), 10);
                return isNaN(n) ? m : Math.max(m, n);
            }, 0);

            aGeneral.push({ id: "GEN" + (iMaxId + 1), label: "Additional Document", fileName: "", fileSize: 0, fileType: "", note: "", previewUrl: "" });
            oModel.setProperty("/draft/attachments/general", aGeneral);
        },

        onRemoveGeneralAttachment: function (oEvent) {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oCtx = oEvent.getSource().getBindingContext("cpe");
            var iIndex = parseInt(oCtx.getPath().split("/").pop(), 10);

            var aGeneral = oModel.getProperty("/draft/attachments/general");
            var sPreviewUrl = aGeneral[iIndex] && aGeneral[iIndex].previewUrl;
            if (sPreviewUrl && sPreviewUrl.indexOf("blob:") === 0) {
                URL.revokeObjectURL(sPreviewUrl);
            }
            aGeneral.splice(iIndex, 1);
            oModel.setProperty("/draft/attachments/general", aGeneral);
        },

        /**
         * Required documents per the attachment matrix: an RFQ+Quotation
         * slot for every vendor currently present, plus TCC, Negotiation
         * History and Justification Note always. Only ever called from
         * onSubmit (via _validate) - Save Draft allows missing documents.
         * @returns {Array<string>} validation messages (0 or 1 entry)
         */
        _validateAttachments: function () {
            var oDraft = this.getOwnerComponent().getModel("cpe").getProperty("/draft");
            var aMissing = [];

            (oDraft.attachments.rfq || []).forEach(function (s) { if (!s.fileName) { aMissing.push(s.label); } });
            (oDraft.attachments.quotation || []).forEach(function (s) { if (!s.fileName) { aMissing.push(s.label); } });
            if (!oDraft.attachments.tcc.fileName) { aMissing.push(this.i18n("attachmentTcc")); }
            if (!oDraft.attachments.negotiation.fileName) { aMissing.push(this.i18n("attachmentNegotiation")); }
            if (!oDraft.attachments.justification.fileName) { aMissing.push(this.i18n("attachmentJustification")); }

            return aMissing.length ? [this.i18n("docMissing", [aMissing.join(", ")])] : [];
        },

        /**
         * Uploads every filled attachment slot to the live DocumentSet
         * media entity set via BaseController#uploadDocument, one at a time
         * (a sequential next(i) chain, not Promise.all - keeps slot order
         * predictable and makes "which one failed" unambiguous). Skips
         * slots with no file picked. General slots all share the flat
         * "GEN" category (per the Rev3 backend contract's category list);
         * every other slot's own id ("RFQ1", "QUOTE2", "TCC", ...) already
         * matches a real category code 1:1 - see _buildEmptyAttachments.
         * Callers are expected to have already checked isDocUploadEnabled().
         * @param {string} sCpeId the just-created CPE's id
         * @returns {Promise<void>} rejects with an Error carrying
         *   `failedUpload` (the slot's label) on the first failure
         */
        _uploadAttachments: function (sCpeId) {
            var that = this;
            var oDraft = this.getOwnerComponent().getModel("cpe").getProperty("/draft");
            var aSlots = [];

            (oDraft.attachments.rfq || []).forEach(function (s) {
                aSlots.push({ slot: s, category: s.id, label: s.label });
            });
            (oDraft.attachments.quotation || []).forEach(function (s) {
                aSlots.push({ slot: s, category: s.id, label: s.label });
            });
            aSlots.push({ slot: oDraft.attachments.tcc, category: "TCC", label: this.i18n("attachmentTcc") });
            aSlots.push({ slot: oDraft.attachments.negotiation, category: "NEGOTIATION", label: this.i18n("attachmentNegotiation") });
            aSlots.push({ slot: oDraft.attachments.justification, category: "JUSTIFICATION", label: this.i18n("attachmentJustification") });
            (oDraft.attachments.general || []).forEach(function (s) {
                aSlots.push({ slot: s, category: "GEN", label: s.label });
            });

            var aFilled = aSlots.filter(function (o) { return o.slot._file; });

            return new Promise(function (resolve, reject) {
                function next(i) {
                    if (i >= aFilled.length) { resolve(); return; }
                    var o = aFilled[i];

                    that.uploadDocument(o.slot._file, {
                        docType: "CPE",
                        docId: sCpeId,
                        category: o.category,
                        fileName: o.slot.fileName,
                        title: o.slot.title || o.label,
                        note: o.slot.note || ""
                    }).then(function () {
                        next(i + 1);
                    }).catch(function (oError) {
                        var oErr = new Error("Upload failed for " + o.label + ": " + that.extractODataError(oError));
                        oErr.failedUpload = o.label;
                        reject(oErr);
                    });
                }
                next(0);
            });
        },

        // ------------------------------------------------------------------
        // BUDGET SELECTION + AUTO-FILL
        // ------------------------------------------------------------------

        onBudgetSelect: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) { return; }
            this._applyBudget(oItem.getKey());
        },

        /**
         * Pulls plant, capex type and category from the budget so the user
         * never re-types them, then runs the availability check.
         * @param {string} sBudgetId budget id
         */
        _applyBudget: function (sBudgetId) {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oBudget = this.readOne("budget", "/list", "budgetId", sBudgetId);
            if (!oBudget) { return; }

            oModel.setProperty("/draft/budgetId", sBudgetId);
            oModel.setProperty("/draft/plant", oBudget.plant);
            oModel.setProperty("/draft/plantName", oBudget.plantName);
            oModel.setProperty("/draft/capexType", oBudget.capexType);
            oModel.setProperty("/draft/category", oBudget.category);
            oModel.setProperty("/draft/categoryCode", oBudget.categoryCode);

            this._runBudgetCheck();
            this._refreshDOA();
        },

        onAmountChange: function () {
            this._runBudgetCheck();
            this._refreshDOA();
            this._evaluateVendorRule();
            if (this.getOwnerComponent().getModel("cpe").getProperty("/draft/metricsEnabled")) {
                this.onCalc();
            }
        },

        /**
         * Real-time budget control. Blocks the CPE when the request exceeds
         * what is left after commitments and actual spend.
         */
        _runBudgetCheck: function () {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oDraft = oModel.getProperty("/draft");
            var oBudget = this.readOne("budget", "/list", "budgetId", oDraft.budgetId);
            if (!oBudget) { return; }

            var oCheck = this.checkBudget(oBudget, oDraft.amount);

            oModel.setProperty("/draft/budgetCheck", {
                approved: Number(oBudget.approved) || 0,
                committed: Number(oBudget.committed) || 0,
                spent: Number(oBudget.spent) || 0,
                available: oCheck.available,
                sufficient: oCheck.sufficient,
                shortfall: oCheck.shortfall,
                checked: true
            });

            this._renderBudgetVerdict(oDraft.amount, oCheck);
        },

        /**
         * Paints the availability message strip and enables / disables submit.
         * @param {number} nAmount requested amount
         * @param {object} oCheck result of checkBudget
         */
        _renderBudgetVerdict: function (nAmount, oCheck) {
            var oStrip = this.byId("msBudget");
            var oSubmit = this.byId("btnSubmit");

            if (!nAmount || Number(nAmount) <= 0) {
                oStrip.setVisible(false);
                oSubmit.setEnabled(true);
                return;
            }

            if (oCheck.sufficient) {
                oStrip.setText(this.i18n("budgetOk", [
                    this.formatter.inLakhs(nAmount),
                    this.formatter.inLakhs(oCheck.available)
                ]));
                oStrip.setType("Success");
                oSubmit.setEnabled(true);
            } else {
                oStrip.setText(this.i18n("budgetBlocked", [
                    this.formatter.inLakhs(nAmount),
                    this.formatter.inLakhs(oCheck.available),
                    this.formatter.inLakhs(oCheck.shortfall)
                ]));
                oStrip.setType("Error");
                oSubmit.setEnabled(false);
            }

            oStrip.setVisible(true);
        },

        // ------------------------------------------------------------------
        // VENDORS
        // ------------------------------------------------------------------

        onAddVendor: function () {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var aVendors = oModel.getProperty("/draft/vendors") || [];

            // id must stay unique for the lifetime of the draft, not just
            // derived from the current length - the vendor table's binding
            // now keys rows by `id` (CPECreate.view.xml) to fix the row-
            // stomping bug, which breaks if two rows ever share an id (e.g.
            // add 3, remove the 2nd, add again - length-based "V" + length+1
            // would reissue the id still held by the 3rd row).
            var iMaxId = aVendors.reduce(function (m, v) {
                var n = parseInt(String(v.id || "").replace(/\D/g, ""), 10);
                return isNaN(n) ? m : Math.max(m, n);
            }, 0);

            aVendors.push({
                id: "V" + (iMaxId + 1),
                rank: "",
                name: "",
                lifnr: "",
                // Own isolated suggestion-results slot - not a shared
                // top-level array across every row (see onVendorNameSuggest's
                // doc comment for why that was a bug).
                searchResults: [],
                quote: null,
                totalCost: null,
                deliveryDays: null,
                quality: 3,
                warrantyMonths: 12,
                gstCompliant: true,
                selected: false
            });

            oModel.setProperty("/draft/vendors", aVendors);
            this._rankVendors();
        },

        onRemoveVendor: function (oEvent) {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oCtx = oEvent.getSource().getBindingContext("cpe");
            var iIndex = parseInt(oCtx.getPath().split("/").pop(), 10);

            var aVendors = oModel.getProperty("/draft/vendors");
            aVendors.splice(iIndex, 1);
            oModel.setProperty("/draft/vendors", aVendors);

            this._rankVendors();
            this._evaluateVendorRule();
        },

        onQuoteChange: function () {
            this._rankVendors();
            this._evaluateVendorRule();
        },

        /**
         * Fires on every keystroke in the vendor name Input (debounced below
         * before anything is actually sent). Issues a live `VendSet` read
         * filtered to the typed term (`substringof(term,Name1)`) and shows
         * the matches as suggestions. Clears any previously-resolved `lifnr`
         * on this row immediately - the user is actively searching again, so
         * a stale vendor code from an earlier pick shouldn't silently survive
         * until they either pick a new suggestion (`onVendorNameSelected`
         * re-sets it) or leave it cleared (free-typed text with no match).
         * `VendSet`'s server-side $filter support is unconfirmed (same class
         * of doubt as ValueHelpSet's $top, noted in `_loadLivePlants`), so
         * results are re-checked client-side as a safety net in case the
         * backend ignores $filter and returns everything unfiltered.
         *
         * Results are written to THIS ROW's own `searchResults` (indexed
         * setProperty), never a shared top-level property - live `VendSet`
         * has 56,842 records (confirmed live 2026-11-02), far too many to
         * load once and filter client-side, so the live-per-keystroke search
         * itself is correct and stays. The bug was that every row's
         * suggestion dropdown used to point at one single shared
         * `/vendorSearchResults` array - searching in one row overwrote the
         * exact slot every other row's dropdown was also reading from. Each
         * row now has its own isolated slot instead, and the debounce timer
         * is keyed per row too (a single shared timer would let typing in
         * one row cancel another row's in-flight search).
         */
        onVendorNameSuggest: function (oEvent) {
            var that = this;
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oCtx = oEvent.getSource().getBindingContext("cpe");
            var sPath = oCtx.getPath();
            var sTerm = (oEvent.getParameter("suggestValue") || "").trim();

            oModel.setProperty(sPath + "/lifnr", "");

            this._mVendorSearchTimers = this._mVendorSearchTimers || {};
            window.clearTimeout(this._mVendorSearchTimers[sPath]);

            if (sTerm.length < 2) {
                oModel.setProperty(sPath + "/searchResults", []);
                return;
            }

            this._mVendorSearchTimers[sPath] = window.setTimeout(function () {
                var oODataModel = that.getOwnerComponent().getModel("odataModel");
                var sLower = sTerm.toLowerCase();

                oODataModel.read("/VendSet", {
                    urlParameters: { "$filter": "substringof('" + sTerm.replace(/'/g, "''") + "',Name1)" },
                    success: function (oData) {
                        var aResults = (oData.results || [])
                            .filter(function (r) { return (r.Name1 || "").toLowerCase().indexOf(sLower) > -1; })
                            .slice(0, 50)
                            .map(function (r) { return { key: r.Lifnr, text: r.Name1 }; });
                        oModel.setProperty(sPath + "/searchResults", aResults);
                    },
                    error: function (oError) {
                        // eslint-disable-next-line no-console
                        console.error("Live vendor search failed.", oError);
                        oModel.setProperty(sPath + "/searchResults", []);
                    }
                });
            }, 300);
        },

        /**
         * Fires when the user picks a real vendor from the live suggestion
         * list - captures its SAP vendor code (`Lifnr`) onto the row so
         * `_buildCpePayload` can send a real `Vendor.Lifnr` instead of blank.
         */
        onVendorNameSelected: function (oEvent) {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oCtx = oEvent.getSource().getBindingContext("cpe");
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) { return; }

            oModel.setProperty(oCtx.getPath() + "/name", oItem.getText());
            oModel.setProperty(oCtx.getPath() + "/lifnr", oItem.getKey());
            oModel.setProperty(oCtx.getPath() + "/searchResults", []);
        },

        /**
         * Re-ranks vendors L1..Ln by quote value, lowest first.
         * Patches each row's `rank` in place (indexed setProperty) instead of
         * replacing the whole `/draft/vendors` array - a whole-array replace
         * re-applies every bound Input's value from the model on every row,
         * stomping any other field's in-progress (uncommitted) typing in the
         * same table, e.g. Total Cost of Ownership mid-edit when Quote commits.
         */
        _rankVendors: function () {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var aVendors = oModel.getProperty("/draft/vendors") || [];

            var aSorted = aVendors
                .map(function (v, i) { return { v: v, i: i }; })
                .filter(function (o) { return Number(o.v.quote) > 0; })
                .sort(function (a, b) { return Number(a.v.quote) - Number(b.v.quote); });

            var aRanks = aVendors.map(function () { return ""; });
            aSorted.forEach(function (o, idx) { aRanks[o.i] = "L" + (idx + 1); });

            aVendors.forEach(function (v, i) {
                if (v.rank !== aRanks[i]) {
                    oModel.setProperty("/draft/vendors/" + i + "/rank", aRanks[i]);
                }
            });
        },

        onVendorSelect: function (oEvent) {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oCtx = oEvent.getSource().getBindingContext("cpe");
            var iIndex = parseInt(oCtx.getPath().split("/").pop(), 10);
            var aVendors = oModel.getProperty("/draft/vendors");

            aVendors.forEach(function (v, i) { v.selected = (i === iIndex); });
            oModel.setProperty("/draft/vendors", aVendors);
            oModel.setProperty("/draft/selectedVendorId", aVendors[iIndex].id);

            this._evaluateVendorRule();
        },

        /**
         * Enforces the two vendor rules from the requirement:
         *  - capex above ₹10 L needs L1/L2/L3 quotes
         *  - a non-L1 selection forces a written justification
         */
        _evaluateVendorRule: function () {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oDraft = oModel.getProperty("/draft");
            var aVendors = oDraft.vendors || [];

            var oSelected = aVendors.filter(function (v) { return v.selected; })[0];
            var oL1 = aVendors.filter(function (v) { return v.rank === "L1"; })[0];

            var bNonL1 = !!(oSelected && oL1 && oSelected.id !== oL1.id);
            oModel.setProperty("/draft/showNonL1", bNonL1);

            if (bNonL1) {
                var nSaving = (Number(oL1.totalCost) || Number(oL1.quote) || 0) -
                    (Number(oSelected.totalCost) || Number(oSelected.quote) || 0);
                var sText;

                if (nSaving > 0) {
                    sText = "Total cost of ownership is " + this.formatter.inLakhs(nSaving) +
                        " lower than L1. Delivery " +
                        (Number(oL1.deliveryDays) - Number(oSelected.deliveryDays)) + " days faster.";
                } else {
                    sText = "Selected vendor costs " + this.formatter.inLakhs(Math.abs(nSaving)) +
                        " more than L1. The justification must explain the value received for the premium.";
                }
                this.byId("txtSaving").setText(sText);
            }
        },

        // ------------------------------------------------------------------
        // DOA + METRICS
        // ------------------------------------------------------------------

        _refreshDOA: function () {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oDraft = oModel.getProperty("/draft");
            // Unit Technical evaluation isn't a repeated *approval* level
            // (it's a separate step on Evaluation.controller.js, auto-
            // completed on Submit Evaluation) - skip it here too so this
            // preview (and the "it will go to X first" text in onSubmit
            // below, which reads doaPreview[0]) names the real next
            // approver, not the evaluator (EDSK9B0EA7).
            oModel.setProperty("/draft/doaPreview", this.skipUnitTechnical(this.resolveDOA(oDraft.capexType, oDraft.amount, "CPE")));
        },

        onToggleMetrics: function (oEvent) {
            if (oEvent.getParameter("state")) {
                this.onCalc();
            } else {
                var oModel = this.getOwnerComponent().getModel("cpe");
                oModel.setProperty("/draft/irr", null);
                oModel.setProperty("/draft/npv", null);
                oModel.setProperty("/draft/payback", null);
            }
        },

        onCalc: function () {
            var oModel = this.getOwnerComponent().getModel("cpe");
            var oDraft = oModel.getProperty("/draft");

            var nInvestment = Number(oDraft.amount) || 0;
            var aCF = [oDraft.cf1, oDraft.cf2, oDraft.cf3, oDraft.cf4, oDraft.cf5]
                .map(function (v) { return Number(v) || 0; });

            while (aCF.length && aCF[aCF.length - 1] === 0) { aCF.pop(); }

            if (!nInvestment || !aCF.length) {
                oModel.setProperty("/draft/irr", null);
                oModel.setProperty("/draft/npv", null);
                oModel.setProperty("/draft/payback", null);
                return;
            }

            var oMetrics = this.calcMetrics(nInvestment, aCF, oDraft.hurdleRate);
            oModel.setProperty("/draft/irr", isNaN(oMetrics.irr) ? null : oMetrics.irr);
            oModel.setProperty("/draft/npv", oMetrics.npv);
            oModel.setProperty("/draft/payback", isNaN(oMetrics.payback) ? null : oMetrics.payback);
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

        // ------------------------------------------------------------------
        // VALIDATE & SUBMIT
        // ------------------------------------------------------------------

        _validate: function () {
            var oDraft = this.getOwnerComponent().getModel("cpe").getProperty("/draft");
            var oConfig = this.getOwnerComponent().getModel("config");
            var nSpecsMinChars = oConfig.getProperty("/specsMinChars") || 15;
            var nNonL1MinChars = oConfig.getProperty("/nonL1MinChars") || 25;
            var nThreeQuoteLimit = oConfig.getProperty("/threeQuoteLimit") || 1000000;
            var aErrors = [];

            if (!oDraft.budgetId) { aErrors.push("Select an approved budget."); }
            if (!oDraft.title || !oDraft.title.trim()) { aErrors.push("CPE title is required."); }
            if (!oDraft.amount || Number(oDraft.amount) <= 0) { aErrors.push("CPE amount must be greater than zero."); }
            if (!oDraft.specs || oDraft.specs.trim().length < nSpecsMinChars) {
                aErrors.push("Technical specifications are required (at least " + nSpecsMinChars + " characters).");
            }

            if (!oDraft.budgetCheck.sufficient) {
                aErrors.push("Budget is insufficient. Draw from the common pool or route for a budget increase.");
            }

            var aVendors = (oDraft.vendors || []).filter(function (v) { return v.name && Number(v.quote) > 0; });
            if (!aVendors.length) {
                aErrors.push("At least one vendor quote is required.");
            }
            if (Number(oDraft.amount) > nThreeQuoteLimit && aVendors.length < 3) {
                aErrors.push("Capex above ₹10 L requires three quotes (L1, L2 and L3).");
            }
            if (!aVendors.some(function (v) { return v.selected; })) {
                aErrors.push("Select the recommended vendor.");
            }
            if (oDraft.showNonL1 && (!oDraft.nonL1Justification || oDraft.nonL1Justification.trim().length < nNonL1MinChars)) {
                aErrors.push("A non-L1 selection requires a written justification of at least " + nNonL1MinChars + " characters.");
            }
            if (oDraft.singleCpe && (!oDraft.singleVendorJustification || !oDraft.singleVendorJustification.trim())) {
                aErrors.push("A justification is required when Single Vendor is checked.");
            }

            this.byId("inpTitle").setValueState(oDraft.title ? "None" : "Error");
            this.byId("inpAmount").setValueState(oDraft.amount > 0 ? "None" : "Error");
            this.byId("taSpecs").setValueState((oDraft.specs || "").trim().length >= nSpecsMinChars ? "None" : "Error");
            if (oDraft.showNonL1) {
                this.byId("taNonL1").setValueState(
                    (oDraft.nonL1Justification || "").trim().length >= nNonL1MinChars ? "None" : "Error"
                );
            }
            if (oDraft.singleCpe) {
                this.byId("inpSingleVendorJustification").setValueState(
                    (oDraft.singleVendorJustification || "").trim() ? "None" : "Error"
                );
            }

            // Document completeness is only enforced on Submit, never on
            // Save Draft - this method is only ever called from onSubmit.
            return aErrors.concat(this._validateAttachments());
        },

        onSaveDraft: function () {
            // Guard against a double-click (or any re-entrant press) firing a
            // second createEntity("/CPESet") before the first one resolves -
            // the busy overlay alone doesn't block the buttons, and has its
            // own ~1s show delay, so this flag + disabling the buttons is the
            // actual guard.
            if (this._bSaving) { return; }

            var oDraft = this.getOwnerComponent().getModel("cpe").getProperty("/draft");
            if (!oDraft.title || !oDraft.title.trim()) {
                this.error("Enter at least a CPE title before saving a draft.");
                return;
            }
            if (!oDraft.budgetId) {
                this.error("Select a budget before saving a draft.");
                return;
            }

            var that = this;
            this._bSaving = true;
            this.byId("btnSaveDraft").setEnabled(false);
            this.byId("btnSubmit").setEnabled(false);
            this.setBusy(true);
            this.createEntity("/CPESet", this._buildCpePayload(oDraft))
                .then(function (oResult) {
                    var sId = (oResult.data && oResult.data.Cpeid) || "";
                    that.addAudit("CPE", sId || oDraft.title, "CPE saved as draft", oDraft.title);

                    // Drafts keep whatever documents were already picked -
                    // upload is attempted but never blocks the draft save
                    // itself (missing documents are only enforced on Submit).
                    var pUpload = that.isDocUploadEnabled() ? that._uploadAttachments(sId) : Promise.resolve();

                    return pUpload
                        .catch(function (oError) {
                            that.toast(oError && oError.failedUpload ? oError.message : "Document upload failed.");
                        })
                        .then(function () {
                            return that.getOwnerComponent()._loadLiveCpeList();
                        })
                        .then(function () {
                            that._bSaving = false;
                            that.setBusy(false);
                            that.toast("Draft saved.");
                            that.navTo("cpeList");
                        });
                })
                .catch(function (oError) {
                    that._bSaving = false;
                    that.setBusy(false);
                    that.byId("btnSaveDraft").setEnabled(true);
                    that.byId("btnSubmit").setEnabled(true);
                    that.error("Could not save draft.\n\n" + that.extractODataError(oError), "Backend Error");
                });
        },

        onSubmit: function () {
            // Same re-entry guard as onSaveDraft - shared flag since both
            // buttons ultimately hit the same createEntity("/CPESet") call.
            if (this._bSaving) { return; }

            var aErrors = this._validate();
            if (aErrors.length) {
                this.error(aErrors.join("\n\n"), "Cannot submit");
                return;
            }

            var that = this;
            var oDraft = this.getOwnerComponent().getModel("cpe").getProperty("/draft");
            // doaPreview already excludes Unit Technical (see _refreshDOA) -
            // it's always evaluated first regardless, so the real question
            // here is who approves after evaluation.
            var sNext = oDraft.doaPreview.length ? oDraft.doaPreview[0].role : "the next approver";

            this.confirm(
                "Submit " + this.formatter.inLakhs(oDraft.amount) + " CPE for evaluation and approval?\n\n" +
                "It will go to Unit Technical for evaluation first, then to " + sNext + ".",
                function () {
                    if (that._bSaving) { return; }
                    that._bSaving = true;
                    that.byId("btnSubmit").setEnabled(false);
                    that.byId("btnSaveDraft").setEnabled(false);
                    that.setBusy(true);
                    that.createEntity("/CPESet", that._buildCpePayload(oDraft))
                        .then(function (oResult) {
                            var sId = (oResult.data && oResult.data.Cpeid) || "";

                            // Documents must finish uploading BEFORE SubmitCPE
                            // (not parallel - see Rev3 T3): if the upload fails,
                            // SubmitCPE is never called and the CPE stays a
                            // DRAFT rather than getting routed with missing
                            // attachments.
                            var pUpload;
                            if (that.isDocUploadEnabled()) {
                                pUpload = that._uploadAttachments(sId);
                            } else {
                                that.toast(that.i18n("backendNotReady"));
                                pUpload = Promise.resolve();
                            }

                            return pUpload
                                .then(function () {
                                    return that.callFunction("SubmitCPE", {
                                        CpeId: sId,
                                        BudgetId: oDraft.budgetId,
                                        Amount: oDraft.amount,
                                        PoolBudgetId: (oDraft.fundingTopUp && oDraft.fundingTopUp.source) || "",
                                        PoolAmount: (oDraft.fundingTopUp && oDraft.fundingTopUp.amount) || 0
                                    });
                                })
                                .then(function (oResult) {
                                    that.addAudit("CPE", sId, "CPE submitted for evaluation", oDraft.title);
                                    return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                                        that._bSaving = false;
                                        that.setBusy(false);
                                        // Shows the backend's own routing message as-is
                                        // (e.g. "CPE-… submitted. Routed to Unit
                                        // Technical for evaluation.") instead of the old
                                        // hardcoded "Technical and Procurement" text,
                                        // which no longer matches who actually gets it
                                        // (EDSK9B0EA7).
                                        that.success(
                                            ((oResult && oResult.Message) || (sId + " submitted.")) +
                                            "\n\nBudget availability has been re-checked and the commitment reserved.",
                                            "Submitted"
                                        );
                                        that.navTo("cpeList");
                                    });
                                })
                                .catch(function (oError) {
                                    // Either the upload or SubmitCPE failed - SubmitCPE
                                    // is only ever reached after a successful upload, so
                                    // this can't double-submit either way.
                                    return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                                        that._bSaving = false;
                                        that.setBusy(false);
                                        var sReason = (oError && oError.failedUpload)
                                            ? oError.message
                                            : that.extractODataError(oError);
                                        that.error(
                                            "CPE " + sId + " was created but could not be routed for evaluation.\n\n" +
                                            sReason +
                                            "\n\nIt has been saved as a draft - open it and submit again.",
                                            "Submission Incomplete"
                                        );
                                        that.navTo("cpeList");
                                    });
                                });
                        })
                        .catch(function (oError) {
                            that._bSaving = false;
                            that.setBusy(false);
                            that.byId("btnSubmit").setEnabled(true);
                            that.byId("btnSaveDraft").setEnabled(true);
                            that.error("Submission failed.\n\n" + that.extractODataError(oError), "Backend Error");
                        });
                },
                "Submit CPE"
            );
        },

        /**
         * Maps the working draft onto CPESet's writable fields.
         * @param {object} oDraft the draft record
         * @returns {object} OData create payload
         */
        _buildCpePayload: function (oDraft) {
            var oApp = this.getOwnerComponent().getModel("app");
            var sFiscalYear = String(oApp.getProperty("/fiscalYear") || "").replace(/\D/g, "").slice(-4);

            var fnMetric = function (v, nDecimals) {
                return (v === null || v === undefined || isNaN(v)) ? Number(0).toFixed(nDecimals) : Number(v).toFixed(nDecimals);
            };

            // Vendor/CashFlow are sap:creatable="false" as standalone entity
            // sets - $metadata only allows them to be created nested under
            // CPESet's own create (a "deep insert"), never on their own.
            // Vendorseq is generated here (not collected anywhere in the UI)
            // since it's purely a sequence number for this CPE's own vendor
            // list, same convention as CpeCashFlow's Yearnr below. Lifnr now
            // comes from v.lifnr, resolved by onVendorNameChange against the
            // live VendSet master list - still blank for free-typed vendor
            // names that don't match a real backend vendor.
            var aVendors = oDraft.vendors || [];
            var aVendorRows = aVendors.map(function (v, i) {
                return {
                    Vendorseq: String(i + 1).padStart(4, "0"),
                    Vendorname: v.name || "",
                    Lifnr: v.lifnr || "",
                    QuoteAmt: Number(v.quote || 0).toFixed(3),
                    Totalcost: Number(v.totalCost || 0).toFixed(3),
                    Waers: "INR",
                    DeliveryDays: Number(v.deliveryDays) || 0,
                    // Quality must be a raw JSON number despite $metadata
                    // declaring it Edm.String - sending it quoted throws a
                    // CX_SXML_PARSE_ERROR on the backend (live-verified);
                    // WarrantyMon doesn't have this issue and stays a string.
                    Quality: Number(v.quality) || 0,
                    WarrantyMon: String(Number(v.warrantyMonths) || 0),
                    GstCompliant: v.gstCompliant ? "X" : "",
                    Selected: v.selected ? "X" : "",
                    Ranking: (v.rank || "").replace(/^L/, "")
                };
            });

            var oSelectedVendor = aVendors.filter(function (v) { return v.selected; })[0];
            var sSelVendorSeq = oSelectedVendor
                ? aVendorRows[aVendors.indexOf(oSelectedVendor)].Vendorseq
                : "";

            var aCashFlowRows = [oDraft.cf1, oDraft.cf2, oDraft.cf3, oDraft.cf4, oDraft.cf5]
                .map(function (v, i) {
                    return {
                        Yearnr: String(i + 1).padStart(2, "0"),
                        Amount: Number(v || 0).toFixed(3),
                        Waers: "INR"
                    };
                });

            return {
                Budgetid: oDraft.budgetId,
                Fiscalyear: sFiscalYear,
                Title: oDraft.title,
                Werks: oDraft.plant,
                Capextype: oDraft.capexType,
                Category: oDraft.categoryCode,
                Waers: "INR",
                Amount: Number(oDraft.amount).toFixed(3),
                Investment: Number(oDraft.amount).toFixed(3),
                HurdleRate: Number(oDraft.hurdleRate || 0).toFixed(2),
                Irr: fnMetric(oDraft.irr, 2),
                Npv: fnMetric(oDraft.npv, 3),
                Payback: fnMetric(oDraft.payback, 2),
                // Edm.String(1) flag on the backend ("X"/""), same convention
                // as Budget's MetricsOn/IsCommonpool - not a JS boolean.
                MetricsOn: oDraft.metricsEnabled ? "X" : "",
                Specs: oDraft.specs || "",
                Terms: oDraft.terms || "",
                DeliveryWeeks: Number(oDraft.deliveryWeeks) || 0,
                SelVendor: sSelVendorSeq,
                Nonl1Justif: oDraft.nonL1Justification || "",
                // SingleVendJust added to the backend (no companion flag
                // field - the backend only needs the justification text
                // itself, not a redundant singleCpe boolean). Sent whenever
                // the checkbox was ticked, same condition _validate already
                // uses to require it - a quiet "" otherwise.
                SingleVendJust: oDraft.singleCpe ? (oDraft.singleVendorJustification || "") : "",
                IsQuota: "",
                PoolBudgetid: (oDraft.fundingTopUp && oDraft.fundingTopUp.source) || "",
                PoolAmount: (oDraft.fundingTopUp && Number(oDraft.fundingTopUp.amount).toFixed(3)) || Number(0).toFixed(3),
                CPEToVendors: { results: aVendorRows },
                CPEToCashFlows: { results: aCashFlowRows }
            };
        },

        onBack: function () {
            this.onNavBack("cpeList");
        }
    });
});
