sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/Image",
    "sap/ui/core/HTML"
], function (BaseController, JSONModel, Fragment, Image, HTML) {
    "use strict";

    return BaseController.extend("zcapexportal.controller.CPEDetail", {

        onInit: function () {
            this.setModel(new JSONModel({}), "detail");
            this.getRouter().getRoute("cpeDetail").attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").cpeId;
            this.resolveRecord("cpe", "/list", "cpeId", sId, function (oCPE) {
                if (!oCPE) {
                    this.error(this.i18n("recordNotFound", [sId]));
                    this.navTo("cpeList", {}, true);
                    return;
                }

                var oDetail = Object.assign({}, oCPE);

                oDetail.vendorCount = String((oCPE.vendors || []).length);
                oDetail.docCount = String((oCPE.documents || []).length);
                // Live DOA-based chain (CAPEX_SESSION_LOG.md Open Issue
                // #113) instead of the old mock approval>/history, which
                // was never populated for a real, live-created CPE - this
                // tab was showing "No approval history yet." even while the
                // CPE was genuinely progressing through real approvals.
                // Same algorithm ApprovalDetail.controller.js's own
                // _buildLiveChain already uses for the approver-facing
                // screen, shared via BaseController#buildLiveApprovalChain.
                oDetail.chain = this.buildLiveApprovalChain(
                    oCPE.doaId, oCPE.currentLevel, oCPE.status === "APPROVED");
                oDetail.savingVsL1 = this._calcSavingVsL1(oCPE);

                this.getModel("detail").setData(oDetail);
                this.isDocUploadEnabled();
                this._loadDocuments(sId);
            }.bind(this));
        },

        /**
         * Rev3 T4: refreshes the Documents tab from the live CPEToDocuments
         * navigation property. Leaves whatever's already in the model (the
         * CPESet-mapped empty array, or a previous load) when the backend
         * isn't reachable / doesn't support it yet - see
         * Component.js#loadDocuments.
         * @param {string} sId CPE id
         */
        _loadDocuments: function (sId) {
            var oDetailModel = this.getModel("detail");
            this.getOwnerComponent().loadDocuments("CPE", sId).then(function (aDocs) {
                if (!aDocs) { return; }
                oDetailModel.setProperty("/documents", aDocs);
                oDetailModel.setProperty("/docCount", String(aDocs.length));
            });
        },

        /**
         * Total-cost saving of the selected vendor against L1.
         * @param {object} oCPE cpe record
         * @returns {number} saving in rupees, negative when selected costs more
         */
        _calcSavingVsL1: function (oCPE) {
            var aV = oCPE.vendors || [];
            var oSel = aV.filter(function (v) { return v.selected; })[0];
            var oL1 = aV.filter(function (v) { return v.rank === "L1"; })[0];
            if (!oSel || !oL1 || oSel.id === oL1.id) { return 0; }

            return (Number(oL1.totalCost) || Number(oL1.quote) || 0) -
                (Number(oSel.totalCost) || Number(oSel.quote) || 0);
        },

        // ------------------------------------------------------------------
        // FORMATTERS
        // ------------------------------------------------------------------

        formatSlaBanner: function (nDays, sLevel) {
            if (Number(nDays) > 5) {
                return "SLA breached — pending " + this.formatter.days(nDays) + " with " + sLevel +
                    ". Auto-escalation has been triggered.";
            }
            return "Pending " + this.formatter.days(nDays) + " with " + sLevel + ". SLA is 2-3 days per level.";
        },

        formatSaving: function (n) {
            n = Number(n) || 0;
            if (n === 0) { return ""; }
            return n > 0
                ? "Net saving against L1: " + this.formatter.inLakhs(n)
                : "Premium over L1: " + this.formatter.inLakhs(Math.abs(n));
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
        // ACTIONS
        // ------------------------------------------------------------------

        onBudgetPress: function () {
            this.navTo("budgetDetail", { budgetId: this.getModel("detail").getProperty("/budgetId") });
        },

        /**
         * Resubmits a DRAFT CPE (CAPEX_SESSION_LOG.md #136/#137) by calling
         * SubmitCPE directly against this record's own Cpeid - no re-create
         * involved, so this can't produce the duplicate-CPE problem a
         * create-based retry would. Backend-confirmed: SubmitCPE called
         * against an existing Cpeid already submits that same record
         * correctly. Same call shape CPECreate.controller.js#onSubmit uses,
         * minus the create step and document upload - any document this
         * draft still needs should be attached first via the Documents
         * tab's own Upload action.
         */
        onResubmit: function () {
            var that = this;
            var oDetail = this.getModel("detail").getData();

            this.confirm(
                "Submit " + this.formatter.inLakhs(oDetail.amount) + " CPE for evaluation and approval?",
                function () {
                    // Single guard, set only once the user has actually
                    // pressed Yes - isGuarded() is test-and-set, so a second
                    // call here (after an earlier one already set it) would
                    // always read "already guarded" and silently no-op the
                    // whole confirm callback (EDSK9B0ELF). confirm() has no
                    // No-callback, so if the user presses No this is never
                    // reached and the flag is never set - nothing to release.
                    if (that.isGuarded("resubmit")) { return; }
                    that.setBusy(true);
                    that.callFunction("SubmitCPE", {
                        CpeId: oDetail.cpeId,
                        BudgetId: oDetail.budgetId,
                        Amount: oDetail.amount,
                        PoolBudgetId: oDetail.poolBudgetId || "",
                        PoolAmount: oDetail.poolAmount || 0
                    })
                        .then(function (oResult) {
                            that.addAudit("CPE", oDetail.cpeId, "CPE resubmitted for evaluation", oDetail.title);
                            return that.getOwnerComponent()._loadLiveCpeList().then(function () {
                                that.releaseGuard("resubmit");
                                that.setBusy(false);
                                that.success(
                                    (oResult && oResult.Message) || (oDetail.cpeId + " submitted."),
                                    "Submitted"
                                );
                                that.navTo("cpeList");
                            });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("resubmit");
                            that.setBusy(false);
                            that.error(
                                "Could not resubmit " + oDetail.cpeId + ".\n\n" + that.extractODataError(oError),
                                "Backend Error"
                            );
                        });
                }
            );
        },

        onEvaluate: function () {
            this.navTo("evaluation", { cpeId: this.getModel("detail").getProperty("/cpeId") });
        },

        onCreateCWIP: function () {
            this.navTo("cwipCreate", { cpeId: this.getModel("detail").getProperty("/cpeId") });
        },

        /**
         * @param {string} s CPE status (may be the backend's 12-char
         *   truncated form, e.g. "UNDER_EVALUA" for "UNDER_EVALUATION")
         * @returns {boolean} true while the document can still be edited -
         *   DRAFT, BLOCKED, or under evaluation
         */
        formatCanUpload: function (s) {
            s = s || "";
            return s === "DRAFT" || s === "BLOCKED" || s.indexOf("UNDER_EVALUA") === 0;
        },

        /**
         * Gates the footer's Evaluate button (EDSK9B0EA7) - a CPE
         * UNDER_EVALUATION is now only actionable by its Unit Technical
         * approver(s) or an admin; the initiator and everyone else can still
         * see the CPE (it stays in their list/detail, backend-permitting)
         * but gets no Evaluate button. This is UX only - the backend
         * rejects Save/Submit/Return from anyone else regardless (see
         * Evaluation.controller.js's extractODataError handling).
         * @param {string} s CPE status (may be the truncated "UNDER_EVALUA")
         * @param {string} sRole current user's role (app>/user/role)
         * @param {boolean} bIsAdmin current user's admin flag (app>/user/isAdmin)
         * @returns {boolean} true if the Evaluate button should show
         */
        formatCanEvaluate: function (s, sRole, bIsAdmin) {
            s = s || "";
            var bUnderEvaluation = s === "UNDER_EVALUATION" || s.indexOf("UNDER_EVALUA") === 0;
            return bUnderEvaluation && (!!bIsAdmin || this.isUnitTechnicalRole(sRole));
        },

        onUpload: function () {
            if (!this.isDocUploadEnabled()) {
                this.toast(this.i18n("backendNotReady"));
                return;
            }

            var that = this;
            var oView = this.getView();

            if (!this._pUploadDialog) {
                this._pUploadDialog = Fragment.load({
                    id: oView.getId(),
                    name: "zcapexportal.view.fragment.UploadDocument",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pUploadDialog.then(function (oDialog) {
                that.setModel(new JSONModel({ category: "GEN", title: "", note: "" }), "upload");
                that._oUploadFile = null;
                // The FileUploader keeps its own internally-remembered chosen
                // filename independent of any model binding (same root cause
                // as CPECreate's attachment slots - see CAPEX_SESSION_LOG.md
                // Open Issue #86/#91) - this dialog instance is cached and
                // reopened, so without this a previous upload's filename
                // would still be visually showing here.
                var oUploader = Fragment.byId(oView.getId(), "fuUploadDocument");
                if (oUploader) { oUploader.clear(); }
                oDialog.open();
            });
        },

        onUploadDocFileChange: function (oEvent) {
            var aFiles = oEvent.getParameter("files");
            var oFile = aFiles && aFiles[0];
            if (!oFile) { this._oUploadFile = null; return; }

            var oCheck = this.validateFile(oFile);
            if (!oCheck.ok) {
                this.toast(oCheck.reason);
                oEvent.getSource().clear();
                this._oUploadFile = null;
                return;
            }
            this._oUploadFile = oFile;
        },

        onConfirmUpload: function () {
            if (!this._oUploadFile) {
                this.toast("Choose a file before uploading.");
                return;
            }

            var that = this;
            var oUpload = this.getModel("upload").getData();
            var sCpeId = this.getModel("detail").getProperty("/cpeId");

            this._pUploadDialog.then(function (oDialog) { oDialog.setBusy(true); });

            this.uploadDocument(this._oUploadFile, {
                docType: "CPE",
                docId: sCpeId,
                category: oUpload.category,
                fileName: this._oUploadFile.name,
                title: oUpload.title,
                note: oUpload.note
            }).then(function () {
                that._pUploadDialog.then(function (oDialog) {
                    oDialog.setBusy(false);
                    oDialog.close();
                });
                that.toast(that.i18n("docUploaded"));
                that._loadDocuments(sCpeId);
            }).catch(function (oError) {
                that._pUploadDialog.then(function (oDialog) { oDialog.setBusy(false); });
                that.error(that.i18n("docUploadFailed", [that._oUploadFile.name, that.extractODataError(oError)]));
            });
        },

        onCancelUpload: function () {
            this._pUploadDialog.then(function (oDialog) { oDialog.close(); });
        },

        onDownload: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("detail");
            var sUrl = oCtx && oCtx.getProperty("url");
            if (!sUrl) {
                this.toast(this.i18n("backendNotReady"));
                return;
            }
            window.open(sUrl, "_blank");
        },

        /**
         * Only PDFs and images can be rendered inline in the preview Dialog
         * below - every other allowed extension (doc/docx/xls/xlsx/msg/zip)
         * has no in-browser rendering path, so the View button stays hidden
         * for those and Download remains the only option.
         * @param {string} sMimeType document mime type
         * @returns {boolean} whether the View button should show
         */
        formatCanPreview: function (sMimeType) {
            sMimeType = (sMimeType || "").toLowerCase();
            return sMimeType === "application/pdf" || sMimeType.indexOf("image/") === 0;
        },

        onPreview: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("detail");
            var sUrl = oCtx && oCtx.getProperty("url");
            if (!sUrl) {
                this.toast(this.i18n("backendNotReady"));
                return;
            }
            var sMimeType = (oCtx.getProperty("mimeType") || "").toLowerCase();
            var sTitle = oCtx.getProperty("title") || oCtx.getProperty("fileName");
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
                that.setModel(new JSONModel({ title: sTitle, url: sUrl }), "preview");
                var oContent = Fragment.byId(oView.getId(), "vbPreviewContent");
                oContent.removeAllItems();
                if (sMimeType.indexOf("image/") === 0) {
                    oContent.addItem(new Image({
                        src: sUrl,
                        width: "100%",
                        densityAware: false
                    }).addStyleClass("sapUiTinyMargin"));
                } else {
                    oContent.addItem(new HTML({
                        content: "<iframe src=\"" + sUrl.replace(/"/g, "&quot;") +
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

        /**
         * Rev3 T6: the Actual Vendor Code block only ever shows post-
         * approval, to an admin, and once the live backend actually exposes
         * SetCpeVendorCode - never a guess, see BaseController#hasFunctionImport.
         * @param {string} sStatus CPE status
         * @returns {boolean} visible flag
         */
        formatShowVendorCode: function (sStatus) {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            var aPostApproval = ["APPROVED", "CAPITALIZED", "COMPLETED"];
            return aPostApproval.indexOf(sStatus) > -1 &&
                !!oUser.isAdmin &&
                this.hasFunctionImport("SetCpeVendorCode", ["CpeId", "Lifnr"]);
        },

        onSaveVendorCode: function () {
            var that = this;
            var oDetailModel = this.getModel("detail");
            var sCpeId = oDetailModel.getProperty("/cpeId");
            var sLifnr = (oDetailModel.getProperty("/vendorCode") || "").trim();

            if (!sLifnr) {
                this.toast(this.i18n("vendorCodeMissing"));
                return;
            }

            this.setBusy(true);
            this.callFunction("SetCpeVendorCode", { CpeId: sCpeId, Lifnr: sLifnr })
                .then(function () {
                    return that.getOwnerComponent()._loadLiveCpeList();
                })
                .then(function () {
                    that.setBusy(false);
                    that.toast(that.i18n("vendorCodeSaved"));
                })
                .catch(function (oError) {
                    that.setBusy(false);
                    that.error("Could not save vendor code.\n\n" + that.extractODataError(oError));
                });
        },

        /**
         * Rev3 T8: same admin-only, metadata-confirmed-first gating as the
         * vendor code block above, keyed off ReviseCpeAmount instead.
         * @returns {boolean} visible flag
         */
        formatShowReviseAmount: function () {
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            return !!oUser.isAdmin &&
                this.hasFunctionImport("ReviseCpeAmount", ["CpeId", "NewAmount", "Reason"]);
        },

        onReviseAmount: function () {
            if (!this.isDocUploadEnabled()) {
                this.toast(this.i18n("backendNotReady"));
                return;
            }

            var that = this;
            var oView = this.getView();
            var nAmount = this.getModel("detail").getProperty("/amount");

            if (!this._pReviseDialog) {
                this._pReviseDialog = Fragment.load({
                    id: oView.getId(),
                    name: "zcapexportal.view.fragment.ReviseAmount",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pReviseDialog.then(function (oDialog) {
                that.setModel(new JSONModel({ newAmount: nAmount, reason: "" }), "revise");
                that._oReviseFile = null;
                // Same stale-filename fix as onUpload above (Open Issue #91)
                // - this dialog instance is cached and reopened too.
                var oUploader = Fragment.byId(oView.getId(), "fuReviseDoc");
                if (oUploader) { oUploader.clear(); }
                oDialog.open();
            });
        },

        onReviseDocFileChange: function (oEvent) {
            var aFiles = oEvent.getParameter("files");
            var oFile = aFiles && aFiles[0];
            if (!oFile) { this._oReviseFile = null; return; }

            var oCheck = this.validateFile(oFile);
            if (!oCheck.ok) {
                this.toast(oCheck.reason);
                oEvent.getSource().clear();
                this._oReviseFile = null;
                return;
            }
            this._oReviseFile = oFile;
        },

        /**
         * Upload-then-call order (Rev3 T8): the supporting document is
         * uploaded first and ReviseCpeAmount is only called once that
         * succeeds, same "don't act on half the evidence" shape as
         * CPECreate's submit chain.
         */
        onConfirmReviseAmount: function () {
            var that = this;
            var oRevise = this.getModel("revise").getData();
            var sCpeId = this.getModel("detail").getProperty("/cpeId");

            var aErrors = [];
            if (!oRevise.newAmount || Number(oRevise.newAmount) <= 0) { aErrors.push("Enter a new amount greater than zero."); }
            if (!oRevise.reason || !oRevise.reason.trim()) { aErrors.push(this.i18n("reviseAmountReason") + " is required."); }
            if (!this._oReviseFile) { aErrors.push(this.i18n("reviseAmountDoc") + " is required."); }
            if (aErrors.length) {
                this.error(aErrors.join("\n\n"));
                return;
            }

            this._pReviseDialog.then(function (oDialog) { oDialog.setBusy(true); });

            this.uploadDocument(this._oReviseFile, {
                docType: "CPE",
                docId: sCpeId,
                category: "AMT_REV",
                fileName: this._oReviseFile.name,
                title: "Amount Revision",
                note: oRevise.reason
            })
                .then(function () {
                    return that.callFunction("ReviseCpeAmount", {
                        CpeId: sCpeId,
                        NewAmount: oRevise.newAmount,
                        Reason: oRevise.reason
                    });
                })
                .then(function () {
                    return that.getOwnerComponent()._loadLiveCpeList();
                })
                .then(function () {
                    that._pReviseDialog.then(function (oDialog) {
                        oDialog.setBusy(false);
                        oDialog.close();
                    });
                    that.toast("Amount revised.");
                    that._loadDocuments(sCpeId);
                })
                .catch(function (oError) {
                    that._pReviseDialog.then(function (oDialog) { oDialog.setBusy(false); });
                    that.error("Could not revise the amount.\n\n" + that.extractODataError(oError));
                });
        },

        onCancelReviseAmount: function () {
            this._pReviseDialog.then(function (oDialog) { oDialog.close(); });
        },

        onPrint: function () {
            window.print();
        },

        onBack: function () {
            this.onNavBack("cpeList");
        }
    });
});
