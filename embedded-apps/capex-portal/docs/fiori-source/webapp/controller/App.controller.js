sap.ui.define([
    "zcapexportal/controller/BaseController",
    "sap/ui/Device",
    "sap/ui/core/Fragment",
    "sap/ui/core/EventBus"
], function (BaseController, Device, Fragment, EventBus) {
    "use strict";

    // Maps a route name to the side-navigation key that should light up.
    var ROUTE_TO_NAV = {
        dashboard: "dashboard",
        budgetList: "budgetList",
        budgetCreate: "budgetCreate",
        budgetDetail: "budgetList",
        cpeList: "cpeList",
        cpeCreate: "cpeCreate",
        cpeDetail: "cpeList",
        evaluation: "cpeList",
        approvalInbox: "approvalInbox",
        approvalDetail: "approvalInbox",
        budgetApprovalDetail: "approvalInbox",
        cwipCreate: "cpeList",
        poList: "poList",
        poDetail: "poList",
        grnList: "grnList",
        icList: "icList",
        icDetail: "icList",
        capitalization: "capitalization",
        unitQuota: "unitQuota",
        reports: "reports",
        auditTrail: "auditTrail",
        doaMatrix: "doaMatrix"
    };

    return BaseController.extend("zcapexportal.controller.App", {

        onInit: function () {
            var oComponent = this.getOwnerComponent();

            this.getView().addStyleClass(oComponent.getContentDensityClass());

            // Marker class so the CSS can turn the side nav into an overlay
            // on small screens instead of letting it squeeze the content.
            if (Device.system.phone || Device.system.tablet) {
                this.getView().addStyleClass("zcpxTouch");
            }

            // Keep the side-nav highlight in sync with the current route.
            this.getRouter().attachRouteMatched(this._onRouteMatched, this);

            // Collapse the side nav automatically when the window narrows.
            Device.media.attachHandler(this._onMediaChange, this, Device.media.RANGESETS.SAP_STANDARD);
        },

        onExit: function () {
            Device.media.detachHandler(this._onMediaChange, this, Device.media.RANGESETS.SAP_STANDARD);
            if (this._pNotifPopover) {
                this._pNotifPopover.then(function (o) { o.destroy(); });
            }
            if (this._pUserPopover) {
                this._pUserPopover.then(function (o) { o.destroy(); });
            }
        },

        // ------------------------------------------------------------------
        // ROUTING / RESPONSIVE
        // ------------------------------------------------------------------

        _onRouteMatched: function (oEvent) {
            var sRoute = oEvent.getParameter("name");
            var oApp = this.getOwnerComponent().getModel("app");

            oApp.setProperty("/selectedNav", ROUTE_TO_NAV[sRoute] || sRoute);

            // Where the nav is an overlay, close it after navigating so the
            // content the user just asked for is actually visible.
            if (!this.getOwnerComponent().hasRoomForSideNav()) {
                oApp.setProperty("/sideExpanded", false);
            }
        },

        /**
         * Collapses the nav when the window narrows past the overlay threshold,
         * and restores it when there is room again.
         */
        _onMediaChange: function () {
            var oComponent = this.getOwnerComponent();
            var oApp = oComponent.getModel("app");
            var bRoom = oComponent.hasRoomForSideNav();

            if (!bRoom) {
                oApp.setProperty("/sideExpanded", false);
            } else if (!this._bUserCollapsed) {
                oApp.setProperty("/sideExpanded", true);
            }
        },

        onToggleNav: function () {
            var oApp = this.getOwnerComponent().getModel("app");
            var bNext = !oApp.getProperty("/sideExpanded");

            // Remember a deliberate collapse on desktop so a window resize
            // does not spring the nav back open against the user's wish.
            this._bUserCollapsed = !bNext;
            oApp.setProperty("/sideExpanded", bNext);
        },

        onNavItemSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            if (sKey) { this.navTo(sKey); }
        },

        onFYChange: function (oEvent) {
            var sFY = oEvent.getSource().getSelectedKey();
            this.getOwnerComponent().getModel("app").setProperty("/fiscalYear", sFY);
            this.toast(this.i18n("fyChanged", [sFY]));
            // Whatever screen is currently open needs to refilter to the new
            // year right away, not just the next time its route is matched -
            // Dashboard/BudgetList/CPEList each subscribe to this in their
            // own onInit and re-run their own existing filter/rollup logic.
            EventBus.getInstance().publish("app", "fiscalYearChanged", { fiscalYear: sFY });
        },

        // ------------------------------------------------------------------
        // HEADER ACTIONS
        // ------------------------------------------------------------------

        onOpenSearch: function () {
            this.toast(this.i18n("searchHint"));
        },

        onOpenNotifications: function (oEvent) {
            var oSource = oEvent.getSource();
            var oView = this.getView();

            if (!this._pNotifPopover) {
                this._pNotifPopover = Fragment.load({
                    id: oView.getId(),
                    name: "zcapexportal.view.fragment.Notifications",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }

            this._pNotifPopover.then(function (oPopover) {
                oPopover.openBy(oSource);
            });
        },

        onNotificationPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext("app");
            if (!oCtx) { return; }
            var oItem = oCtx.getObject();

            this._pNotifPopover.then(function (o) { o.close(); });

            if (oItem.route) {
                this.navTo(oItem.route, oItem.params || {});
            }
        },

        onMarkAllRead: function () {
            var oApp = this.getOwnerComponent().getModel("app");
            var aNotif = (oApp.getProperty("/notifications") || []).map(function (n) {
                return Object.assign({}, n, { unread: false });
            });
            oApp.setProperty("/notifications", aNotif);
            oApp.setProperty("/unreadCount", 0);
            this.toast(this.i18n("allMarkedRead"));
        },

        onOpenUserMenu: function (oEvent) {
            var oSource = oEvent.getSource();
            var oView = this.getView();

            if (!this._pUserPopover) {
                this._pUserPopover = Fragment.load({
                    id: oView.getId(),
                    name: "zcapexportal.view.fragment.UserMenu",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }

            this._pUserPopover.then(function (oPopover) {
                oPopover.openBy(oSource);
            });
        },

        onSwitchRole: function (oEvent) {
            // Demo aid: lets you preview the portal as each persona in the DOA chain.
            var sRole = oEvent.getSource().data("role");
            var oApp = this.getOwnerComponent().getModel("app");
            var aPersonas = oApp.getProperty("/personas") || [];
            var oPersona = aPersonas.filter(function (p) { return p.role === sRole; })[0];

            if (oPersona) {
                oApp.setProperty("/user", Object.assign({}, oPersona));
                this.toast(this.i18n("roleSwitched", [oPersona.name, oPersona.role]));
            }

            this._pUserPopover.then(function (o) { o.close(); });
            this.getRouter().navTo("dashboard");
        }
    });
});
