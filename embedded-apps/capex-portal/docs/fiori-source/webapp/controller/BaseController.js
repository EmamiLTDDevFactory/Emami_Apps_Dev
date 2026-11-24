sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/UIComponent",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/routing/History",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "zcapexportal/model/formatter",
    "sap/ui/thirdparty/jquery"
], function (Controller, UIComponent, MessageToast, MessageBox, History, Fragment, JSONModel, formatter, jQuery) {
    "use strict";

    return Controller.extend("zcapexportal.controller.BaseController", {

        formatter: formatter,

        // ------------------------------------------------------------------
        // SHORTCUTS
        // ------------------------------------------------------------------

        /**
         * @returns {sap.ui.core.routing.Router} the router
         */
        getRouter: function () {
            return UIComponent.getRouterFor(this);
        },

        /**
         * @param {string} sName model name
         * @returns {sap.ui.model.Model} the model
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        /**
         * @param {sap.ui.model.Model} oModel model
         * @param {string} sName model name
         * @returns {sap.ui.core.mvc.Controller} this for chaining
         */
        setModel: function (oModel, sName) {
            this.getView().setModel(oModel, sName);
            return this;
        },

        /**
         * @returns {sap.base.i18n.ResourceBundle} the resource bundle
         */
        getBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        /**
         * Translated text.
         * @param {string} sKey i18n key
         * @param {Array} [aArgs] placeholder values
         * @returns {string} translated text
         */
        i18n: function (sKey, aArgs) {
            return this.getBundle().getText(sKey, aArgs);
        },

        // ------------------------------------------------------------------
        // COMBOBOX SEARCH
        // ------------------------------------------------------------------

        /**
         * sap.m.ComboBox's default suggestion filter only matches typed text
         * against the item's displayed *text*, never its *key* - so typing a
         * plant/unit code (e.g. "A021") never finds it even though the item
         * is fully present in the bound data, only its name ("Emami Limited
         * Amazon") would. Call this once per ComboBox (by sap.ui.core ID) to
         * make it match on either key or text, case-insensitive, anywhere in
         * the string rather than only at the start.
         * @param {string} sComboBoxId the ComboBox's view-local id
         */
        enableSearchByKeyOrText: function (sComboBoxId) {
            var oComboBox = this.byId(sComboBoxId);
            if (!oComboBox) { return; }

            oComboBox.setFilterFunction(function (sTerm, oItem) {
                var s = (sTerm || "").toLowerCase();
                if (!s) { return true; }
                return oItem.getText().toLowerCase().indexOf(s) > -1 ||
                    oItem.getKey().toLowerCase().indexOf(s) > -1;
            });
        },

        // ------------------------------------------------------------------
        // NAVIGATION
        // ------------------------------------------------------------------

        /**
         * Navigate to a named route.
         * @param {string} sRoute route name
         * @param {object} [oParams] route parameters
         * @param {boolean} [bReplace] replace history entry
         */
        navTo: function (sRoute, oParams, bReplace) {
            this.getRouter().navTo(sRoute, oParams, bReplace);
        },

        /**
         * Back with a safe fallback when there is no history (deep link / FLP entry).
         * @param {string} [sFallbackRoute] route to use when history is empty
         */
        onNavBack: function (sFallbackRoute) {
            var sPrevHash = History.getInstance().getPreviousHash();
            if (sPrevHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getRouter().navTo(sFallbackRoute || "dashboard", {}, true);
            }
        },

        /**
         * Generic side-navigation handler used by App.controller.
         * @param {string} sKey navigation key
         */
        navByKey: function (sKey) {
            this.getRouter().navTo(sKey);
        },

        // ------------------------------------------------------------------
        // MESSAGING
        // ------------------------------------------------------------------

        /**
         * @param {string} sMsg message
         */
        toast: function (sMsg) {
            MessageToast.show(sMsg, { duration: 2600, width: "auto" });
        },

        /**
         * @param {string} sMsg message
         * @param {string} [sTitle] title
         */
        success: function (sMsg, sTitle) {
            MessageBox.success(sMsg, { title: sTitle || "Success" });
        },

        /**
         * @param {string} sMsg message
         * @param {string} [sTitle] title
         */
        error: function (sMsg, sTitle) {
            MessageBox.error(sMsg, { title: sTitle || "Error" });
        },

        /**
         * @param {string} sMsg message
         * @param {string} [sTitle] title
         */
        warn: function (sMsg, sTitle) {
            MessageBox.warning(sMsg, { title: sTitle || "Warning" });
        },

        /**
         * Yes/No confirmation.
         * @param {string} sMsg message
         * @param {function} fnYes callback on confirm
         * @param {string} [sTitle] title
         */
        confirm: function (sMsg, fnYes, sTitle) {
            MessageBox.confirm(sMsg, {
                title: sTitle || "Please Confirm",
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                emphasizedAction: MessageBox.Action.YES,
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.YES) { fnYes(); }
                }
            });
        },

        // ------------------------------------------------------------------
        // LINE ITEMS POPOVER
        // Shared "expand to see line items" affordance for a multi-item
        // budget row, used by both BudgetList ("All Budgets") and
        // ApprovalInbox ("My Approvals") - one fragment/popover instance per
        // view, same lazy-load-once pattern as CPEDetail#onPreview's dialog.
        // ------------------------------------------------------------------

        /**
         * @param {sap.ui.core.Control} oOpenBy control to anchor the popover to (the pressed icon button)
         * @param {Array<object>} aItems the budget's line items (itemNo/title/amount/remarks)
         * @param {string} sTitle popover title, e.g. the budget's own title
         * @returns {Promise<void>}
         */
        openLineItemsPopover: function (oOpenBy, aItems, sTitle) {
            var oView = this.getView();
            var that = this;

            if (!this._pLineItemsPopover) {
                this._pLineItemsPopover = Fragment.load({
                    id: oView.getId(),
                    name: "zcapexportal.view.fragment.BudgetLineItemsPopover",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }

            return this._pLineItemsPopover.then(function (oPopover) {
                that.setModel(new JSONModel({ title: sTitle, items: aItems || [] }), "lineItems");
                oPopover.openBy(oOpenBy);
            });
        },

        // ------------------------------------------------------------------
        // BUSY
        // ------------------------------------------------------------------

        /**
         * @param {boolean} b busy state
         */
        setBusy: function (b) {
            this.getView().setBusy(!!b);
        },

        // ------------------------------------------------------------------
        // REENTRY GUARD
        // ------------------------------------------------------------------

        /**
         * Guards an async action (createEntity/callFunction/updateEntity)
         * against firing twice from a fast double-click or repeat press -
         * the busy overlay from setBusy() alone doesn't block button
         * presses, and has its own ~1s show delay, so this is the actual
         * guard (originally only applied to CPECreate's Save Draft/Submit -
         * see CAPEX_SESSION_LOG.md Open Issue #90). Call at the very top of
         * the handler with a flag name unique to that action; call
         * releaseGuard with the same name once the async work settles, on
         * both the success and error paths.
         * @param {string} sFlag unique guard name for this action
         * @returns {boolean} true if a call is already in progress - caller
         *   should return immediately without doing anything else
         */
        isGuarded: function (sFlag) {
            this._mGuards = this._mGuards || {};
            if (this._mGuards[sFlag]) { return true; }
            this._mGuards[sFlag] = true;
            return false;
        },

        /**
         * @param {string} sFlag the same name passed to isGuarded
         */
        releaseGuard: function (sFlag) {
            this._mGuards = this._mGuards || {};
            this._mGuards[sFlag] = false;
        },

        // ------------------------------------------------------------------
        // DATA ACCESS
        // Reads from the JSON models in mock mode; swap the bodies of these
        // two helpers for OData calls once ZCAPEX_PORTAL_SRV is live.
        // ------------------------------------------------------------------

        /**
         * Reads an array from a named JSON model.
         * @param {string} sModel model name
         * @param {string} sPath path inside the model
         * @returns {Array} data array
         */
        readList: function (sModel, sPath) {
            var oModel = this.getOwnerComponent().getModel(sModel);
            return (oModel && oModel.getProperty(sPath)) || [];
        },

        /**
         * Finds one entry of a list model by a key field.
         * @param {string} sModel model name
         * @param {string} sPath path inside the model
         * @param {string} sKeyField key field name
         * @param {string} sKeyValue key value
         * @returns {object|null} the record
         */
        readOne: function (sModel, sPath, sKeyField, sKeyValue) {
            var aList = this.readList(sModel, sPath);
            for (var i = 0; i < aList.length; i++) {
                if (String(aList[i][sKeyField]) === String(sKeyValue)) { return aList[i]; }
            }
            return null;
        },

        /**
         * Same lookup as readOne, but retries once after the app's initial
         * live-data load lands if the record isn't found straight away. On
         * a hard refresh of a deep-linked detail route, _onMatched can fire
         * before Component.js's async OData read for this list has
         * returned - without this, an empty-so-far list gets misread as
         * "record doesn't exist" and the user is bounced back to the list
         * screen for a record that's perfectly real (CAPEX_SESSION_LOG.md
         * Open Issue #97). fnFound is called exactly once, either
         * synchronously (record already loaded) or after the retry.
         * @param {string} sModel model name
         * @param {string} sPath path inside the model
         * @param {string} sKeyField key field name
         * @param {string} sKeyValue key value
         * @param {function(object|null)} fnFound called with the record,
         *   or null if it's still missing once the initial load has landed
         */
        resolveRecord: function (sModel, sPath, sKeyField, sKeyValue, fnFound) {
            var oFound = this.readOne(sModel, sPath, sKeyField, sKeyValue);
            if (oFound) { fnFound(oFound); return; }

            var pInitialLoad = this.getOwnerComponent()._pInitialLoad;
            if (!pInitialLoad) { fnFound(null); return; }

            pInitialLoad.then(function () {
                fnFound(this.readOne(sModel, sPath, sKeyField, sKeyValue));
            }.bind(this));
        },

        /**
         * Calls a Gateway function import. In mock mode it resolves immediately
         * so the UI flow stays identical between mock and live.
         * @param {string} sFunctionName function import name
         * @param {object} oParams url parameters
         * @returns {Promise} resolves with the response
         */
        callFunction: function (sFunctionName, oParams) {
            var oComponent = this.getOwnerComponent();

            if (oComponent.isMock()) {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        resolve({ Success: true, Message: sFunctionName + " simulated (mock mode)", Params: oParams });
                    }, 450);
                });
            }

            var oOData = oComponent.getModel("odataModel");
            return new Promise(function (resolve, reject) {
                oOData.callFunction("/" + sFunctionName, {
                    method: "POST",
                    urlParameters: oParams || {},
                    success: resolve,
                    error: reject
                });
            });
        },

        /**
         * Creates an entity against the live Gateway OData model.
         * @param {string} sPath entity set path, e.g. "/BudgetSet"
         * @param {object} oPayload entity payload
         * @returns {Promise<object>} resolves with {data, response}
         */
        createEntity: function (sPath, oPayload) {
            var oOData = this.getOwnerComponent().getModel("odataModel");
            return new Promise(function (resolve, reject) {
                oOData.create(sPath, oPayload, {
                    success: function (oData, oResponse) { resolve({ data: oData, response: oResponse }); },
                    error: reject
                });
            });
        },

        /**
         * Updates an existing entity by its full keyed path, e.g.
         * updateEntity("/InstallCertSet('IC-2026-0021')", payload).
         */
        updateEntity: function (sPath, oPayload) {
            var oOData = this.getOwnerComponent().getModel("odataModel");
            return new Promise(function (resolve, reject) {
                oOData.update(sPath, oPayload, {
                    success: function (oData, oResponse) { resolve({ data: oData, response: oResponse }); },
                    error: reject
                });
            });
        },

        /**
         * Pulls the readable message out of a failed OData request, falling
         * back gracefully when the response isn't the usual SAP error JSON.
         * @param {object} oError jQuery/OData error object
         * @returns {string} message
         */
        extractODataError: function (oError) {
            try {
                var oBody = JSON.parse(oError.responseText);
                return (oBody.error && oBody.error.message && oBody.error.message.value) ||
                    oError.message || "Unknown error";
            } catch (e) {
                return (oError && oError.message) || "Unknown error";
            }
        },

        // ------------------------------------------------------------------
        // BACKEND FEATURE DETECTION (Rev3 section 3)
        // Reads the LIVE odataModel's $metadata (never the local mock copy
        // under webapp/localService, which is a stale subset) so a
        // not-yet-deployed function import / entity property degrades the
        // UI (hide the control / toast) instead of throwing. In mock mode,
        // or before $metadata has actually arrived, both report "not found"
        // rather than guessing.
        // ------------------------------------------------------------------

        /**
         * @param {string} sName function import name, e.g. "SetCpeVendorCode"
         * @param {Array<string>} [aParams] parameter names that must all be present
         * @returns {boolean} true when the live service exposes it
         */
        /**
         * Resolves once the live service's $metadata has actually loaded -
         * resolves immediately in mock mode or before the OData model even
         * exists. Await this before hasFunctionImport/hasEntityProperty/
         * hasNavigationProperty whenever the caller might run before
         * $metadata's own async load has completed (e.g. right as a route
         * first matches after a fresh page load) - checking those
         * synchronously too early always reads as "not found" and, unless
         * something else happens to re-check later, stays wrong for the
         * rest of the session (see Component.js#_loadLiveBudgetList's own
         * fix for the same race, 2026-11-17). Never rejects - a genuine
         * metadata failure is already surfaced separately by
         * Component.js#_createODataModel's attachMetadataFailed handler.
         * @returns {Promise<void>}
         */
        whenMetadataLoaded: function () {
            var oComponent = this.getOwnerComponent();
            if (oComponent.isMock()) { return Promise.resolve(); }

            var oModel = oComponent.getModel("odataModel");
            if (!oModel || !oModel.metadataLoaded) { return Promise.resolve(); }

            return oModel.metadataLoaded().then(function () {}, function () {});
        },

        hasFunctionImport: function (sName, aParams) {
            var oComponent = this.getOwnerComponent();
            if (oComponent.isMock()) { return false; }

            var oModel = oComponent.getModel("odataModel");
            var oMeta = oModel && oModel.getServiceMetadata();
            if (!oMeta) { return false; }

            var bFound = false;
            (oMeta.dataServices.schema || []).forEach(function (s) {
                (s.entityContainer || []).forEach(function (c) {
                    (c.functionImport || []).forEach(function (f) {
                        if (f.name !== sName) { return; }
                        var aNames = (f.parameter || []).map(function (p) { return p.name; });
                        bFound = (aParams || []).every(function (p) { return aNames.indexOf(p) > -1; });
                    });
                });
            });
            return bFound;
        },

        /**
         * @param {string} sEntityType entity type name, e.g. "DoaRule"
         * @param {string} sProp property name, e.g. "Doctype"
         * @returns {boolean} true when the live service's entity type has that property
         */
        hasEntityProperty: function (sEntityType, sProp) {
            var oComponent = this.getOwnerComponent();
            if (oComponent.isMock()) { return false; }

            var oModel = oComponent.getModel("odataModel");
            var oMeta = oModel && oModel.getServiceMetadata();
            if (!oMeta) { return false; }

            var bFound = false;
            (oMeta.dataServices.schema || []).forEach(function (s) {
                (s.entityType || []).forEach(function (e) {
                    if (e.name !== sEntityType) { return; }
                    bFound = (e.property || []).some(function (p) { return p.name === sProp; });
                });
            });
            return bFound;
        },

        /**
         * Same metadata-walk as hasEntityProperty, but over navigationProperty
         * instead of property - used to feature-gate a brand-new nav property
         * (e.g. Budget/BudgetToItems) that may not exist yet on the live
         * service, the same way hasFunctionImport gates an undeployed
         * function import. Duplicated in Component.js as
         * _hasNavigationProperty for the same reason noted there (its loader
         * runs outside any controller).
         * @param {string} sEntityType entity type name, e.g. "Budget"
         * @param {string} sNavProp navigation property name, e.g. "BudgetToItems"
         * @returns {boolean} true when the live service's entity type exposes it
         */
        hasNavigationProperty: function (sEntityType, sNavProp) {
            var oComponent = this.getOwnerComponent();
            if (oComponent.isMock()) { return false; }

            var oModel = oComponent.getModel("odataModel");
            var oMeta = oModel && oModel.getServiceMetadata();
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
         * Reads the live sap:creatable flag off an entity set - the actual
         * authoritative signal for "will a POST to this entity set be
         * accepted", unlike a guessed entity-type property name. Defaults to
         * true when the attribute is absent (OData v2's own default),
         * false when the entity set isn't found or $metadata hasn't loaded.
         * @param {string} sEntitySet entity set name, e.g. "DocumentSet"
         * @returns {boolean} true when the live service marks it creatable
         */
        isEntitySetCreatable: function (sEntitySet) {
            var oComponent = this.getOwnerComponent();
            if (oComponent.isMock()) { return false; }

            var oModel = oComponent.getModel("odataModel");
            var oMeta = oModel && oModel.getServiceMetadata();
            if (!oMeta) { return false; }

            var bFound = false;
            var bCreatable = true;
            (oMeta.dataServices.schema || []).forEach(function (s) {
                (s.entityContainer || []).forEach(function (c) {
                    (c.entitySet || []).forEach(function (e) {
                        if (e.name !== sEntitySet) { return; }
                        bFound = true;
                        if (e.hasOwnProperty("creatable")) {
                            bCreatable = e.creatable !== "false" && e.creatable !== false;
                        } else {
                            var aExt = e.extensions || [];
                            var oExt = aExt.filter(function (x) { return x.name === "creatable"; })[0];
                            bCreatable = !oExt || oExt.value !== "false";
                        }
                    });
                });
            });
            return bFound && bCreatable;
        },

        // ------------------------------------------------------------------
        // DOCUMENTS (Rev3 T2)
        // ------------------------------------------------------------------

        /**
         * Client-side guard before even attempting an upload - max size from
         * config>/docMaxMb (default 10) and allowed extensions from
         * config>/docExtensions (default the documented list), both
         * overridden live from ConfigSet(DOC_MAX_MB/DOC_EXTENSIONS) when the
         * backend has rows for them - see Component.js#_loadLiveQuotaCaps's
         * sibling loader for the same "fall back to a documented default,
         * never go blank" pattern.
         * @param {File} oFile the browser File object
         * @returns {{ok: boolean, reason: string}} validation result
         */
        validateFile: function (oFile) {
            if (!oFile) { return { ok: false, reason: "No file selected." }; }

            var oConfig = this.getOwnerComponent().getModel("config");
            var nMaxMb = Number(oConfig.getProperty("/docMaxMb")) || 10;
            var sExtensions = oConfig.getProperty("/docExtensions") ||
                "pdf,xls,xlsx,doc,docx,jpg,jpeg,png,msg,zip";
            var aAllowed = sExtensions.split(",").map(function (s) { return s.trim().toLowerCase(); });

            if (oFile.size > nMaxMb * 1024 * 1024) {
                return { ok: false, reason: this.i18n("docFileTooBig") };
            }

            var sExt = (oFile.name.split(".").pop() || "").toLowerCase();
            if (aAllowed.indexOf(sExt) === -1) {
                return { ok: false, reason: this.i18n("docBadType") };
            }

            return { ok: true, reason: "" };
        },

        /**
         * Uploads one file to the DocumentSet media entity set. Resolves to
         * null (no-op) in mock mode so callers can treat mock and
         * not-yet-ready-backend the same way as every other feature-detected
         * call here.
         * @param {File} oFile the browser File object
         * @param {object} mMeta {docType, docId, category, fileName, title, note}
         * @returns {Promise<object|null>} resolves with the upload response, or null in mock mode
         */
        uploadDocument: function (oFile, mMeta) {
            var oComponent = this.getOwnerComponent();
            if (oComponent.isMock()) { return Promise.resolve(null); }

            var oModel = oComponent.getModel("odataModel");
            var sServiceUrl = oModel.sServiceUrl.replace(/\/$/, "");
            var sSlug = [
                mMeta.docType, mMeta.docId, mMeta.category,
                mMeta.fileName, mMeta.title || "", mMeta.note || ""
            ].map(function (s) { return encodeURIComponent(s || ""); }).join("|");

            return new Promise(function (resolve, reject) {
                oModel.refreshSecurityToken(function () {
                    jQuery.ajax({
                        url: sServiceUrl + "/DocumentSet",
                        type: "POST",
                        data: oFile,
                        processData: false,
                        contentType: oFile.type || "application/octet-stream",
                        headers: {
                            "x-csrf-token": oModel.getHeaders()["x-csrf-token"],
                            "slug": sSlug
                        },
                        success: resolve,
                        error: function (oXhr) {
                            reject({ responseText: oXhr.responseText, message: "Upload failed (HTTP " + oXhr.status + ")" });
                        }
                    });
                }, function (oError) {
                    reject({ responseText: oError && oError.responseText, message: "Could not refresh the security token" });
                }, true);
            });
        },

        /**
         * Shared sap.ui.unified.FileUploader typeMissmatch/fileSizeExceed
         * handlers - every attachment FileUploader in the app (CPECreate's
         * slots, CPEDetail's upload dialog, the Revise Amount dialog) wires
         * both of these to the same two toasts, client-side mirrors of
         * #validateFile.
         */
        onAttachmentTypeMismatch: function () {
            this.toast(this.i18n("docBadType"));
        },

        onAttachmentFileSizeExceed: function () {
            this.toast(this.i18n("docFileTooBig"));
        },

        /**
         * @param {string} sExtensions comma-separated list, e.g. config>/docExtensions
         * @returns {Array<string>} for FileUploader's fileType property
         */
        formatFileTypes: function (sExtensions) {
            var s = sExtensions || "pdf,xls,xlsx,doc,docx,jpg,jpeg,png,msg,zip";
            return s.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
        },

        /**
         * Rev3 feature flag: true once the live backend looks ready to
         * actually store an uploaded file's content. Three independent
         * signals, any one of which is enough:
         * - DocumentSet is live-marked creatable (the actual thing that
         *   matters - a direct read of whether POST will be accepted -
         *   added after the Content-property check alone proved unreliable:
         *   Revision 3 moved storage off the Content field entirely, so a
         *   live service can be fully upload-ready without ever exposing it)
         * - the Document entity type still exposes its Content field
         *   (older/compat services)
         * - the backend has configured DOC_MAX_MB (a signal it intends to
         *   accept uploads)
         * Mirrored onto app>/docUploadEnabled so a view's MessageStrip can
         * bind to it directly. Recomputed on every call rather than cached,
         * since $metadata may not have arrived yet the first time this runs.
         * @returns {boolean} upload-enabled flag
         */
        isDocUploadEnabled: function () {
            var oComponent = this.getOwnerComponent();
            var bEnabled = this.isEntitySetCreatable("DocumentSet") ||
                this.hasEntityProperty("Document", "Content") ||
                !!oComponent.getModel("config").getProperty("/docMaxMb");
            oComponent.getModel("app").setProperty("/docUploadEnabled", bEnabled);
            return bEnabled;
        },

        // ------------------------------------------------------------------
        // FINANCIAL ENGINE  (IRR / NPV / Payback)
        // Shared by BudgetCreate and CPECreate; toggled on/off by the user.
        // ------------------------------------------------------------------

        /**
         * Net Present Value.
         * @param {number} initialOutflow positive investment amount at t0
         * @param {Array<number>} aCashFlows yearly net inflows
         * @param {number} rate discount rate in percent
         * @returns {number} NPV
         */
        calcNPV: function (initialOutflow, aCashFlows, rate) {
            var r = (Number(rate) || 0) / 100;
            var npv = -Math.abs(Number(initialOutflow) || 0);
            (aCashFlows || []).forEach(function (cf, i) {
                npv += (Number(cf) || 0) / Math.pow(1 + r, i + 1);
            });
            return npv;
        },

        /**
         * Internal Rate of Return via bisection (robust, no divergence).
         * @param {number} initialOutflow positive investment amount at t0
         * @param {Array<number>} aCashFlows yearly net inflows
         * @returns {number} IRR in percent, or NaN when it cannot be bracketed
         */
        calcIRR: function (initialOutflow, aCashFlows) {
            var self = this;
            var f = function (rate) { return self.calcNPV(initialOutflow, aCashFlows, rate); };

            var lo = -90, hi = 1000;
            var fLo = f(lo), fHi = f(hi);
            if (isNaN(fLo) || isNaN(fHi) || fLo * fHi > 0) { return NaN; }

            for (var i = 0; i < 200; i++) {
                var mid = (lo + hi) / 2;
                var fMid = f(mid);
                if (Math.abs(fMid) < 1e-6 || (hi - lo) < 1e-7) { return mid; }
                if (fLo * fMid < 0) { hi = mid; } else { lo = mid; fLo = fMid; }
            }
            return (lo + hi) / 2;
        },

        /**
         * Discounted payback period in years (fractional).
         * @param {number} initialOutflow positive investment amount at t0
         * @param {Array<number>} aCashFlows yearly net inflows
         * @param {number} rate discount rate in percent; 0 for simple payback
         * @returns {number} years, or NaN when never recovered
         */
        calcPayback: function (initialOutflow, aCashFlows, rate) {
            var r = (Number(rate) || 0) / 100;
            var remaining = Math.abs(Number(initialOutflow) || 0);
            var flows = aCashFlows || [];

            for (var i = 0; i < flows.length; i++) {
                var cf = (Number(flows[i]) || 0) / Math.pow(1 + r, i + 1);
                if (cf <= 0) { continue; }
                if (cf >= remaining) {
                    return i + (remaining / cf);
                }
                remaining -= cf;
            }
            return NaN;
        },

        /**
         * Runs all three metrics at once.
         * @param {number} investment investment amount
         * @param {Array<number>} aCashFlows yearly net inflows
         * @param {number} rate discount / hurdle rate in percent
         * @returns {object} {irr, npv, payback}
         */
        calcMetrics: function (investment, aCashFlows, rate) {
            return {
                irr: this.calcIRR(investment, aCashFlows),
                npv: this.calcNPV(investment, aCashFlows, rate),
                payback: this.calcPayback(investment, aCashFlows, rate)
            };
        },

        // ------------------------------------------------------------------
        // DOA ROUTING
        // ------------------------------------------------------------------

        /**
         * Resolves the approver chain for a document type, capex type and
         * amount from the DOA matrix held in the config model. A rule whose
         * docType is empty ("") matches any document type (the generic/
         * fallback case, e.g. every rule until the backend's DoaRule entity
         * actually carries Doctype - see Component.js#mapDoaRuleEntity); a
         * rule with an exact docType match is preferred over a generic one
         * covering the same amount range.
         * @param {string} sCapexType e.g. "MANUFACTURING", "MOULDS", "IT"
         * @param {number} nAmount amount in rupees
         * @param {string} [sDocType] "CPE" or "BUD"; omitted matches any rule
         * @returns {Array<object>} ordered approver steps
         */
        resolveDOA: function (sCapexType, nAmount, sDocType) {
            var aMatrix = this.readList("config", "/doaMatrix");
            var nAmt = Number(nAmount) || 0;

            var aCandidates = aMatrix.filter(function (r) {
                return (r.active !== false) &&
                    (r.capexType === sCapexType || r.capexType === "*") &&
                    nAmt >= Number(r.amountFrom) &&
                    (r.amountTo === null || nAmt <= Number(r.amountTo)) &&
                    (!r.docType || r.docType === sDocType);
            });

            // Exact docType match sorts before a generic ("") rule covering
            // the same range, so a doc-type-specific chain always wins.
            aCandidates.sort(function (a, b) { return (b.docType ? 1 : 0) - (a.docType ? 1 : 0); });

            var oRule = aCandidates[0];
            if (!oRule) { return []; }

            return oRule.chain.map(function (step, idx) {
                return {
                    level: idx + 1,
                    role: step.role,
                    approver: step.approver,
                    slaDays: step.slaDays,
                    status: idx === 0 ? "PENDING" : "WAITING",
                    actedOn: null,
                    comment: ""
                };
            });
        },

        /**
         * True if a DOA chain role is a "Unit Technical *" step (e.g. "Unit
         * Technical Head") - matched case-insensitively by prefix, same rule
         * the backend uses to pick the technical evaluator (EDSK9B0EA7).
         * @param {string} sRole a chain step's role
         * @returns {boolean} true for a Unit Technical role
         */
        isUnitTechnicalRole: function (sRole) {
            return /^unit technical/i.test(sRole || "");
        },

        /**
         * Drops any "Unit Technical *" row from a DOA chain - CPE technical
         * evaluation is handled entirely by Evaluation.controller.js (a
         * separate step, auto-completed on Submit Evaluation) and is never a
         * repeated *approval* level, so every "who approves next"/"it will
         * go to X first" chain preview must skip it (EDSK9B0EA7) even though
         * DoaChainSet/resolveDOA still returns it as part of the raw chain -
         * DOAMatrix is the one screen that intentionally shows the chain
         * unfiltered and should keep doing so.
         * Also renumbers the remaining rows' "level" sequentially from 1 -
         * callers that render a level badge (e.g. CPECreate's DOA preview
         * timeline) would otherwise show a gap (1, 3, 4...) where the
         * dropped step used to be.
         * @param {Array<object>} aChain a DOA chain (resolveDOA or doaPreview)
         * @returns {Array<object>} the same rows, minus any Unit Technical step
         */
        skipUnitTechnical: function (aChain) {
            var that = this;
            return (aChain || [])
                .filter(function (o) { return !that.isUnitTechnicalRole(o.role); })
                .map(function (o, i) { return Object.assign({}, o, { level: i + 1 }); });
        },

        /**
         * Builds a live approval timeline for an already-submitted document
         * from live config>/doaMatrix data (matched by the document's own
         * resolved doaId) - the real, step-by-step progress of a real
         * approval chain, as opposed to resolveDOA's preview of what chain
         * *would* apply before submission. Same algorithm
         * ApprovalDetail.controller.js and BudgetApprovalDetail.controller.js
         * each had their own private copy of for CPE/Budget respectively -
         * shared here so CPEDetail.controller.js's own Approval Chain tab
         * (CAPEX_SESSION_LOG.md Open Issue #113) can use the same live logic
         * instead of a third copy.
         * @param {string} sDoaId the document's live, resolved DOA rule id
         * @param {string} sCurrentLevel the document's live current approval level
         * @param {boolean} bFinal true once the document's own status is a
         *   final "approved" state, marking every step APPROVED regardless
         *   of currentLevel
         * @returns {Array<object>} timeline rows {role, approver, status, actedOn, comment}
         */
        buildLiveApprovalChain: function (sDoaId, sCurrentLevel, bFinal) {
            var aMatrix = this.readList("config", "/doaMatrix");
            var oRule = aMatrix.filter(function (r) { return r.id === sDoaId; })[0];
            if (!oRule) { return []; }

            var iCurrent = -1;
            oRule.chain.forEach(function (step, idx) {
                if (step.role === sCurrentLevel) { iCurrent = idx; }
            });

            return oRule.chain.map(function (step, idx) {
                var sStatus = "WAITING";
                if (bFinal || (iCurrent > -1 && idx < iCurrent)) {
                    sStatus = "APPROVED";
                } else if (idx === iCurrent) {
                    sStatus = "PENDING";
                }
                return { role: step.role, approver: step.approver, status: sStatus, actedOn: null, comment: "" };
            });
        },

        // ------------------------------------------------------------------
        // BUDGET AVAILABILITY
        // ------------------------------------------------------------------

        /**
         * Real-time budget check: Approved - Committed - Spent = Available.
         * @param {object} oBudget budget record
         * @param {number} nRequest requested amount
         * @returns {object} {available, sufficient, shortfall}
         */
        checkBudget: function (oBudget, nRequest) {
            if (!oBudget) {
                return { available: 0, sufficient: false, shortfall: Number(nRequest) || 0 };
            }
            var available = Number(oBudget.approved || 0) -
                Number(oBudget.committed || 0) -
                Number(oBudget.spent || 0);
            var req = Number(nRequest) || 0;
            return {
                available: available,
                sufficient: req <= available,
                shortfall: Math.max(0, req - available)
            };
        },

        /**
         * Unit quota rule: caps come from the "config">/quota/yearCap and
         * /quota/singleCap live values (see Component.js#_loadLiveQuotaCaps),
         * not hardcoded here - they fall back to the documented ₹2,00,000 /
         * ₹50,000 policy defaults only until the backend has real ConfigSet
         * rows for them. When sPlant is given and config>/quota/plantCaps
         * has its own cap for that plant (from a QUOTA_YEAR_CAP_<WERKS>
         * ConfigSet row, e.g. Pacharia's ₹5,00,000 exception), that
         * plant-specific cap is used instead of the default yearCap; the
         * single-item cap is never plant-specific.
         * @param {number} nUsedThisFY already consumed this FY
         * @param {number} nRequest requested amount
         * @param {string} [sPlant] plant (WERKS) the request is for
         * @returns {object} {ok, reason}
         */
        checkQuota: function (nUsedThisFY, nRequest, sPlant) {
            var oConfig = this.getOwnerComponent().getModel("config");
            var mPlantCaps = oConfig.getProperty("/quota/plantCaps") || {};
            var nYearCap = (sPlant && mPlantCaps[sPlant] !== undefined) ?
                mPlantCaps[sPlant] : (oConfig.getProperty("/quota/yearCap") || 200000);
            var nSingleCap = oConfig.getProperty("/quota/singleCap") || 50000;
            var used = Number(nUsedThisFY) || 0;
            var req = Number(nRequest) || 0;

            if (req > nSingleCap) {
                return {
                    ok: false,
                    reason: "Single capex under unit quota cannot exceed ₹ " +
                        nSingleCap.toLocaleString("en-IN") + ". Requested ₹ " +
                        req.toLocaleString("en-IN") + "."
                };
            }
            if (used + req > nYearCap) {
                return {
                    ok: false,
                    reason: "Annual unit quota of ₹ " + nYearCap.toLocaleString("en-IN") +
                        " would be exceeded. Used ₹ " + used.toLocaleString("en-IN") +
                        ", remaining ₹ " + (nYearCap - used).toLocaleString("en-IN") + "."
                };
            }
            return { ok: true, reason: "Within unit quota limits." };
        },

        // ------------------------------------------------------------------
        // AUDIT
        // ------------------------------------------------------------------

        /**
         * Appends an entry to the audit trail model.
         * @param {string} sDocType document type
         * @param {string} sDocId document id
         * @param {string} sAction action performed
         * @param {string} [sComment] optional comment
         */
        addAudit: function (sDocType, sDocId, sAction, sComment) {
            var oCfg = this.getOwnerComponent().getModel("config");
            var aAudit = oCfg.getProperty("/auditTrail") || [];
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};

            aAudit.unshift({
                id: "A" + Date.now(),
                docType: sDocType,
                docId: sDocId,
                action: sAction,
                comment: sComment || "",
                user: oUser.name || "System",
                role: oUser.role || "-",
                timestamp: new Date().toISOString()
            });

            oCfg.setProperty("/auditTrail", aAudit);
        },

        // ------------------------------------------------------------------
        // PLANT AUTHORIZATION
        // ------------------------------------------------------------------

        /**
         * Filters any list down to the plants the logged-in user is authorised for.
         * Enforces "other plant capex should not be visible".
         * @param {Array} aList records carrying a plant field
         * @param {string} [sPlantField] field name, default "plant"
         * @returns {Array} filtered list
         */
        applyPlantAuth: function (aList, sPlantField) {
            var sField = sPlantField || "plant";
            var oUser = this.getOwnerComponent().getModel("app").getProperty("/user") || {};
            var aPlants = oUser.authorizedPlants || [];

            if (oUser.isGlobal || aPlants.length === 0) { return aList; }

            return (aList || []).filter(function (r) {
                return aPlants.indexOf(r[sField]) > -1;
            });
        }
    });
});
