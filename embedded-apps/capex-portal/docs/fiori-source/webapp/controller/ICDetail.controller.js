sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/m/Image"
], function (BaseController, JSONModel, Fragment, Image) {
    "use strict";

    var PHOTO_LABELS = [
        "Installed equipment",
        "Nameplate / serial number",
        "Equipment in operation"
    ];

    return BaseController.extend("zcapexportal.controller.ICDetail", {

        onInit: function () {
            this.setModel(new JSONModel({}), "detail");
            this.getRouter().getRoute("icDetail").attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function (oEvent) {
            var sId = oEvent.getParameter("arguments").icId;

            if (sId.indexOf("NEW-") === 0) {
                this._newFromCPE(sId.substring(4));
            } else {
                this._loadExisting(sId);
            }
        },

        /**
         * Opens an existing installation certificate.
         * @param {string} sId ic id
         */
        _loadExisting: function (sId) {
            this.resolveRecord("asset", "/ic", "icId", sId, function (oIC) {
                if (!oIC) {
                    this.error(this.i18n("recordNotFound", [sId]));
                    this.navTo("icList", {}, true);
                    return;
                }

                var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
                var bFinance = /finance/i.test(oUser.role || "");

                var oDetail = Object.assign({}, oIC, {
                    editable: oIC.status === "PENDING" && !bFinance,
                    canApprove: oIC.status === "PENDING" && (bFinance || oUser.isAdmin),
                    photoSlots: this._buildSlots(oIC.photos),
                    photoCount: (oIC.photos || []).filter(function (p) { return p.uploaded; }).length
                });

                this.getModel("detail").setData(oDetail);
                this._loadDocuments(sId);
            }.bind(this));
        },

        /**
         * Overlays the real DocumentSet rows (category PHOTO1/2/3) onto the
         * photo slots built above, so an already-saved IC shows what's
         * actually on the backend (including a working download link), not
         * just whatever this browser session happens to remember. No
         * InstallCertToPhotos nav property exists on the live service for
         * IC (DOCUMENTSET_GET_ENTITYSET only recognises CpeId/BudgetId) -
         * Component#loadDocuments falls back to a flat DocumentSet $filter
         * read instead, which the same backend method already supports for
         * any doctype.
         * @param {string} sId ic id
         */
        _loadDocuments: function (sId) {
            var that = this;
            this.getOwnerComponent().loadDocuments("IC", sId).then(function (aDocs) {
                if (!aDocs) { return; }

                var oModel = that.getModel("detail");
                var aSlots = oModel.getProperty("/photoSlots") || [];
                aDocs.forEach(function (oDoc) {
                    var oMatch = /^PHOTO(\d)$/.exec(oDoc.category || "");
                    if (!oMatch) { return; }
                    var iIndex = Number(oMatch[1]) - 1;
                    if (!aSlots[iIndex]) { return; }
                    if (aSlots[iIndex].previewUrl && aSlots[iIndex].previewUrl.indexOf("blob:") === 0) {
                        URL.revokeObjectURL(aSlots[iIndex].previewUrl);
                    }
                    aSlots[iIndex].uploaded = true;
                    aSlots[iIndex].name = oDoc.title || oDoc.fileName;
                    aSlots[iIndex].url = oDoc.url;
                    aSlots[iIndex].previewUrl = oDoc.url;
                });
                oModel.setProperty("/photoSlots", aSlots);
                oModel.setProperty("/photoCount", aSlots.filter(function (s) { return s.uploaded; }).length);
            });
        },

        /**
         * Creates a fresh IC pre-filled from the CPE, PO and GRN.
         * @param {string} sCpeId cpe id
         */
        _newFromCPE: function (sCpeId) {
            this.resolveRecord("cpe", "/list", "cpeId", sCpeId, function (oCPE) {
                if (!oCPE) {
                    this.error(this.i18n("recordNotFound", [sCpeId]));
                    this.navTo("icList", {}, true);
                    return;
                }

                var oPO = this.readList("procure", "/po").filter(function (p) { return p.cpeId === sCpeId; })[0] || {};
                var oGRN = this.readList("procure", "/grn").filter(function (g) { return g.poId === oPO.poId; })[0] || {};
                // CWIP carries the asset class (Anlkl) and cost center (Kostl) the
                // user entered at CWIP Create, and is itself the Cwipid every IC
                // must reference - none of this was being looked up here before
                // (see CAPEX_SESSION_LOG.md Open Issue #25), even though all three
                // screens already read live from the same backend.
                var oCwip = this.readList("procure", "/cwip").filter(function (c) { return c.cpeId === sCpeId; })[0] || {};
                var aIC = this.readList("asset", "/ic");

                var nEquipment = Number(oGRN.value) || Number(oPO.amount) || Number(oCPE.amount) || 0;

                this.getModel("detail").setData({
                    icId: "IC-2026-" + String(20 + aIC.length).padStart(4, "0"),
                    isNew: true,
                    cpeId: sCpeId,
                    cwipid: oCwip.cwipId || "",
                    anlkl: oCwip.assetClass || "",
                    kostl: oCwip.costCenter || "",
                    poId: oPO.poId || "",
                    grnId: oGRN.grnId || "",
                    title: oCPE.title,
                    plant: oCPE.plant,
                    plantName: oCPE.plantName,
                    commissioningDate: new Date().toISOString(),
                    status: "PENDING",
                    equipmentCost: nEquipment,
                    freightCost: 0,
                    installationCost: 0,
                    totalCapitalCost: nEquipment,
                    techSignOff: "",
                    techSignOffDate: null,
                    remarks: "",
                    photos: PHOTO_LABELS.map(function (l, i) {
                        return { name: "", uploaded: false, label: l, index: i };
                    }),
                    photoSlots: this._buildSlots(null),
                    photoCount: 0,
                    assetNumber: "",
                    capitalizedOn: null,
                    editable: true,
                    canApprove: false
                });
            }.bind(this));
        },

        /**
         * Builds the three photo slots for the grid.
         * @param {Array} aPhotos existing photos
         * @returns {Array} slot descriptors
         */
        _buildSlots: function (aPhotos) {
            return PHOTO_LABELS.map(function (sLabel, i) {
                var oPhoto = (aPhotos || [])[i] || {};
                return {
                    index: i,
                    label: sLabel,
                    name: oPhoto.name || "",
                    uploaded: !!oPhoto.uploaded,
                    previewUrl: oPhoto.url || ""
                };
            });
        },

        // ------------------------------------------------------------------
        // COSTS
        // ------------------------------------------------------------------

        onCostChange: function () {
            var oModel = this.getModel("detail");
            var nTotal = (Number(oModel.getProperty("/equipmentCost")) || 0) +
                (Number(oModel.getProperty("/freightCost")) || 0) +
                (Number(oModel.getProperty("/installationCost")) || 0);
            oModel.setProperty("/totalCapitalCost", nTotal);
        },

        // ------------------------------------------------------------------
        // PHOTOS
        // ------------------------------------------------------------------

        /**
         * Captures a real picked file (genuine name/size from the browser's
         * File API, not fabricated). Held locally in `_photoFiles` until
         * Save, same convention as CPECreate's attachment slots - the actual
         * upload (via BaseController#uploadDocument, category PHOTO1/2/3)
         * only fires from #onSave once the IC itself is confirmed to exist
         * on the backend, since the upload needs a real Icid.
         */
        onPhotoFileChange: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("detail");
            var iIndex = oCtx.getProperty("index");
            var oModel = this.getModel("detail");

            var oFile = (oEvent.getParameter("files") || [])[0];
            var sName = oFile ? oFile.name : oEvent.getParameter("newValue");
            if (!sName) { return; }

            this._photoFiles = this._photoFiles || {};
            this._photoFiles[iIndex] = oFile || null;

            var aSlots = oModel.getProperty("/photoSlots");
            if (aSlots[iIndex].previewUrl && aSlots[iIndex].previewUrl.indexOf("blob:") === 0) {
                URL.revokeObjectURL(aSlots[iIndex].previewUrl);
            }
            aSlots[iIndex].uploaded = true;
            aSlots[iIndex].name = sName;
            aSlots[iIndex].previewUrl = oFile ? URL.createObjectURL(oFile) : "";
            oModel.setProperty("/photoSlots", aSlots);
            oModel.setProperty("/photoCount", aSlots.filter(function (s) { return s.uploaded; }).length);

            this.toast(
                sName + (oFile ? " (" + Math.round(oFile.size / 1024) + " KB)" : "") +
                (this.isDocUploadEnabled()
                    ? " attached - will be uploaded when you Save."
                    : " attached for this session. Not yet sent to SAP - backend upload isn't ready yet.")
            );
        },

        onPhotoSizeExceed: function () {
            this.error("That photo is larger than 10 MB. Choose a smaller file.");
        },

        /**
         * Clears a picked photo back to empty, same convention as
         * CPECreate#onRemoveGeneralAttachment - local-only, no backend
         * DELETE call exists for DocumentSet anywhere in this app, so this
         * only undoes a pick made this session (before Save re-sends
         * whatever's left in `_photoFiles`). Clearing a slot that was
         * already saved on a prior visit (has a real backend `url`, not
         * just a local blob: preview) only hides it until the next reload
         * - it does not delete the SAP-side document.
         */
        onRemovePhoto: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("detail");
            var iIndex = oCtx.getProperty("index");
            var oModel = this.getModel("detail");
            var aSlots = oModel.getProperty("/photoSlots");

            if (aSlots[iIndex].previewUrl && aSlots[iIndex].previewUrl.indexOf("blob:") === 0) {
                URL.revokeObjectURL(aSlots[iIndex].previewUrl);
            }
            aSlots[iIndex].uploaded = false;
            aSlots[iIndex].name = "";
            aSlots[iIndex].url = "";
            aSlots[iIndex].previewUrl = "";
            oModel.setProperty("/photoSlots", aSlots);
            oModel.setProperty("/photoCount", aSlots.filter(function (s) { return s.uploaded; }).length);

            this._photoFiles = this._photoFiles || {};
            this._photoFiles[iIndex] = null;
        },

        /**
         * Opens an already-uploaded photo in a new tab - only present once
         * #_loadDocuments has confirmed a real DocumentSet row exists for
         * that slot (never for a file only picked locally this session).
         */
        onDownloadPhoto: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("detail");
            var sUrl = oCtx.getProperty("url");
            if (sUrl) { window.open(sUrl, "_blank"); }
        },

        /**
         * Opens a commissioning photo inline, reusing the same
         * DocumentPreview fragment/dialog CPEDetail#onPreview already uses
         * for its attachments - every commissioning photo is a jpg/png
         * (FileUploader's own mimeType restriction), so it's always
         * rendered as an <Image>, never the iframe/PDF branch. Reads
         * `previewUrl`, not `url` - a file just picked this session (not
         * yet saved) has a local blob: preview but no real backend `url`
         * yet, and should still be viewable immediately.
         */
        onViewPhoto: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("detail");
            var sUrl = oCtx && oCtx.getProperty("previewUrl");
            if (!sUrl) { return; }

            var sTitle = oCtx.getProperty("label");
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
                oContent.addItem(new Image({
                    src: sUrl,
                    width: "100%",
                    densityAware: false
                }).addStyleClass("sapUiTinyMargin"));
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
         * Uploads every picked-but-not-yet-sent photo to the live
         * DocumentSet, one at a time, in slot order. Skips slots with no new
         * file (an already-saved photo from a prior session is left alone -
         * one file per fixed PHOTO1/2/3 category replaces the old row on the
         * backend, same "fixed slot" rule CPE's attachments use - it is
         * deliberately not "GEN*", which would accumulate instead).
         * @param {string} sIcId the confirmed (backend) IC id
         * @returns {Promise<void>} rejects with an Error carrying
         *   `failedUpload` (the slot's label) on the first failure
         */
        _uploadPhotos: function (sIcId) {
            var that = this;
            var aSlots = this.getModel("detail").getProperty("/photoSlots") || [];
            var aFilled = aSlots
                .map(function (oSlot, i) { return { slot: oSlot, index: i, file: that._photoFiles && that._photoFiles[i] }; })
                .filter(function (o) { return o.file; });

            return new Promise(function (resolve, reject) {
                function next(i) {
                    if (i >= aFilled.length) { resolve(); return; }
                    var o = aFilled[i];

                    that.uploadDocument(o.file, {
                        docType: "IC",
                        docId: sIcId,
                        category: "PHOTO" + (o.index + 1),
                        fileName: o.file.name,
                        title: o.slot.label,
                        note: ""
                    }).then(function () {
                        next(i + 1);
                    }).catch(function (oError) {
                        var oErr = new Error("Upload failed for " + o.slot.label + ": " + that.extractODataError(oError));
                        oErr.failedUpload = o.slot.label;
                        reject(oErr);
                    });
                }
                next(0);
            });
        },

        formatPhotoStatus: function (n) {
            n = Number(n) || 0;
            return n + " of 3 attached";
        },

        formatPhotoState: function (n) {
            return (Number(n) || 0) >= 3 ? "Success" : "Warning";
        },

        // ------------------------------------------------------------------
        // SAVE / APPROVE
        // ------------------------------------------------------------------

        _validate: function () {
            var oDetail = this.getModel("detail").getData();
            var aErrors = [];

            if (!oDetail.commissioningDate) {
                aErrors.push("Commissioning date is required.");
                this.byId("dpCommissioning").setValueState("Error");
            } else {
                this.byId("dpCommissioning").setValueState("None");
            }

            if (!oDetail.techSignOff || !oDetail.techSignOff.trim()) {
                aErrors.push("Technical sign-off name is required.");
                this.byId("inpSignOff").setValueState("Error");
            } else {
                this.byId("inpSignOff").setValueState("None");
            }

            if (!oDetail.equipmentCost || Number(oDetail.equipmentCost) <= 0) {
                aErrors.push("Equipment cost must be greater than zero.");
                this.byId("inpEquipment").setValueState("Error");
            } else {
                this.byId("inpEquipment").setValueState("None");
            }

            if (Number(oDetail.photoCount) < 3) {
                aErrors.push("All three commissioning photographs are mandatory.");
            }

            return aErrors;
        },

        /**
         * Maps the working draft onto InstallCertSet's writable fields.
         * Cwipid/Anlkl/Kostl/Ebeln/Mblnr all trace back to data this app
         * already reads live elsewhere (CWIP/PurchaseOrder/GRN) - see
         * CAPEX_SESSION_LOG.md Open Issue #25 for where each one comes from.
         * @param {object} oDraft the draft record
         * @returns {object} OData create/update payload
         */
        _buildIcPayload: function (oDraft) {
            var fnMoney = function (v) { return Number(v || 0).toFixed(3); };

            return {
                Cwipid: oDraft.cwipid || "",
                Cpeid: oDraft.cpeId || "",
                Anlkl: oDraft.anlkl || "",
                // Ebeln/Mblnr are the IC screen's own poId/grnId fields - both
                // already ARE the real SAP purchasing/material document
                // numbers (they're each entity's own key), not a separate
                // portal-internal id as previously assumed.
                Ebeln: oDraft.poId || "",
                Kostl: oDraft.kostl || "",
                Mblnr: oDraft.grnId || "",
                Title: oDraft.title || "",
                Werks: oDraft.plant || "",
                CommissionDt: new Date(oDraft.commissioningDate),
                PhotoCount: Number(oDraft.photoCount) || 0,
                Status: "PENDING",
                EquipCost: fnMoney(oDraft.equipmentCost),
                FreightCost: fnMoney(oDraft.freightCost),
                InstallCost: fnMoney(oDraft.installationCost),
                TotalCost: fnMoney(oDraft.totalCapitalCost),
                Waers: "INR",
                // MaxLength=12 on the backend (sap:label "User Name" - same
                // label/length as the real CurrentUser.Userid field, strongly
                // suggesting this is meant to hold a short SAP user id, not an
                // arbitrary typed name - flagged, not guessed; this truncation
                // is just a crash guard pending that decision).
                TechSignoff: (oDraft.techSignOff || "").trim().slice(0, 12),
                TechSignDt: new Date(),
                Remarks: oDraft.remarks || ""
            };
        },

        onSave: function () {
            var aErrors = this._validate();
            if (aErrors.length) {
                this.error(aErrors.join("\n\n"), "Cannot save");
                return;
            }

            var that = this;
            var oDetail = this.getModel("detail").getData();
            var oPayload = this._buildIcPayload(oDetail);

            if (this.isGuarded("save")) { return; }

            this.setBusy(true);

            // A brand-new IC (via _newFromCPE) has never been persisted, so
            // it's a real createEntity; re-opening an already-saved PENDING
            // one (via _loadExisting, still /editable) must update that same
            // record instead of creating a duplicate.
            var pRequest = oDetail.isNew
                ? this.createEntity("/InstallCertSet", oPayload)
                : this.updateEntity("/InstallCertSet('" + oDetail.icId + "')", oPayload);

            pRequest
                .then(function (oResult) {
                    var sId = (oDetail.isNew && oResult.data && oResult.data.Icid) || oDetail.icId;
                    that.addAudit("IC", sId, "Installation certificate submitted",
                        "Capital cost " + that.formatter.inLakhs(oDetail.totalCapitalCost));

                    // Upload only once the IC itself is confirmed saved (needs
                    // a real Icid, same create-then-attach order CPE uses). A
                    // photo-upload failure doesn't undo the save - there's no
                    // draft/resubmit concept for IC to roll back to - it's
                    // surfaced so the user knows to reopen and retry.
                    var pUpload = that.isDocUploadEnabled() ? that._uploadPhotos(sId) : Promise.resolve();
                    return pUpload
                        .catch(function (oUploadError) {
                            that.error(
                                "Installation certificate saved, but " + oUploadError.message +
                                ". Reopen " + sId + " to retry that photo.",
                                "Photo Upload Failed"
                            );
                        })
                        .then(function () {
                            return that.getOwnerComponent()._loadLiveIcList();
                        })
                        .then(function () {
                            that.releaseGuard("save");
                            that.setBusy(false);
                            that.toast("Installation certificate saved and sent to Finance.");
                            that.navTo("icList");
                        });
                })
                .catch(function (oError) {
                    that.releaseGuard("save");
                    that.setBusy(false);
                    that.error("Could not save.\n\n" + that.extractODataError(oError), "Backend Error");
                });
        },

        onApproveIC: function () {
            var aErrors = this._validate();
            if (aErrors.length) {
                this.error(aErrors.join("\n\n"), "Cannot approve");
                return;
            }

            var that = this;
            var oDetail = this.getModel("detail").getData();

            this.confirm(
                "Approve and capitalize " + oDetail.icId + "?\n\n" +
                "Capital cost: " + this.formatter.rupees(oDetail.totalCapitalCost) + "\n" +
                "Commissioning date: " + this.formatter.date(oDetail.commissioningDate) + "\n\n" +
                "SAP will create the fixed asset, generate the GL posting and start depreciation.",
                function () {
                    if (that.isGuarded("approveIc")) { return; }
                    that.setBusy(true);
                    that.callFunction("CapitalizeAsset", {
                        IcId: oDetail.icId,
                        Amount: oDetail.totalCapitalCost
                    })
                        .then(function () {
                            that.addAudit("IC", oDetail.icId, "Asset capitalized", "Capitalization confirmed by SAP.");
                            that._removeFromAgeing(oDetail.cpeId);
                            // Real reload instead of the old _persist(
                            // "CAPITALIZED") local fakery (which fabricated
                            // its own asset number client-side) - CapitalizeAsset
                            // is a real backend call, so re-read the IC to show
                            // the asset number SAP actually assigned.
                            return that.getOwnerComponent()._loadLiveIcList().then(function () {
                                var oRefreshed = that.readOne("asset", "/ic", "icId", oDetail.icId);
                                var sAsset = (oRefreshed && oRefreshed.assetNumber) || "";
                                that.releaseGuard("approveIc");
                                that.setBusy(false);
                                that.success(
                                    that.i18n("icApproved") + "\n\nAsset number: " + sAsset,
                                    "Capitalized"
                                );
                                that.navTo("capitalization");
                            });
                        })
                        .catch(function (oError) {
                            that.releaseGuard("approveIc");
                            that.setBusy(false);
                            that.error("Capitalization failed.\n\n" + that.extractODataError(oError), "Backend Error");
                        });
                },
                "Approve & Capitalize"
            );
        },

        /**
         * Clears the capitalized item out of the CWIP ageing list.
         * @param {string} sCpeId cpe id
         */
        _removeFromAgeing: function (sCpeId) {
            var oProcure = this.getOwnerComponent().getModel("procure");
            var aCwip = oProcure.getProperty("/cwip") || [];
            var oCwip = aCwip.filter(function (c) { return c.cpeId === sCpeId; })[0];
            if (!oCwip) { return; }

            var oAsset = this.getOwnerComponent().getModel("asset");
            var aAgeing = (oAsset.getProperty("/cwipAgeing") || []).filter(function (a) {
                return a.cwipId !== oCwip.cwipId;
            });
            oAsset.setProperty("/cwipAgeing", aAgeing);
        },

        onPrint: function () {
            window.print();
        },

        onBack: function () {
            this.onNavBack("icList");
        }
    });
});
