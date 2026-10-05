"use client";
/**
 * Port of Component.js + view/App.view.xml + controller/App.controller.js, inside the same frame
 * every Emami Apps embedded app uses (see fm-po-deviation/src/components/Shell.tsx): hub-session
 * guard, "Back to Emami Apps" bar, Emami Apps sidebar, header with the signed-in user.
 *
 * The App.view IconTabBar's two tabs (Approval Worklist / Deviation Report) are the sidebar's nav
 * items; their logic is unchanged (approval tab hidden unless UserSet Flag === "X", selecting the
 * report reloads it).
 *
 * Backend calls (user = Emami Apps hub email):
 *   GET UserSet(Email='<email>')?$expand=NAV_UserToAction (_loadUser -> tab visibility, "user" model;
 *                                                         Approvals takes its first rows from it)
 *   GET ActionSet                                        (_loadData -> KPI model)
 */
import React, { useEffect, useRef, useState } from "react";
import { odata, sapErrorMessage } from "@/lib/odata";
import { userSetPath } from "@/lib/user";
import { getHubEmail, hasHubSession, nameFromEmail } from "@/lib/hubEmailLogin";
import { BASE_PATH } from "@/lib/config";
import { contentDensityClass, useDevice } from "@/lib/device";
import type { ActionEntity, Kpi, UserEntity } from "@/lib/types";
import { AppProvider } from "./AppContext";
import Approvals from "./Approvals";
import ZReport, { ZReportHandle } from "./ZReport";
import { FeedbackHost, MessageBox, MessageToast } from "./ui/feedback";
import { Icon } from "./ui/Icon";

type TabKey = "APPROVAL" | "REPORT" | "NOTIFICATION";

const WIDE_BREAKPOINT = 768; // matches the hub's own useIsWideScreen + every sibling embedded app

function useIsWideScreen() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= WIDE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return wide;
}

function formatDateCompact(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function AppView() {
  const device = useDevice();
  const isWideScreen = useIsWideScreen();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hubEmail] = useState<string | null>(() => getHubEmail());
  const [today] = useState(() => formatDateCompact(new Date()));

  const [kpi, setKpi] = useState<Kpi>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [user, setUser] = useState<UserEntity | null>(null);
  // null until UserSet answers — the Approval Worklist only shows once SAP has said Flag = 'X'
  const [approvalTabVisible, setApprovalTabVisible] = useState<boolean | null>(null);
  const [selectedKey, setSelectedKey] = useState<TabKey>("APPROVAL");
  const zreportRef = useRef<ZReportHandle>(null);

  /* ------------------------------------------------------------- onInit */
  useEffect(() => {
    _loadUser();
    _loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------------------- _loadUser */
  function _loadUser() {
    odata
      .read<UserEntity>(userSetPath(), {
        urlParameters: { $expand: "NAV_UserToAction" },
      })
      .then((oData) => {
        const bApproval = oData.Flag === "X";
        setApprovalTabVisible(bApproval);
        if (!bApproval) {
          // setSelectedKey() does not fire the "select" event in UI5,
          // so the report is NOT reloaded here (it already loaded on init).
          setSelectedKey("REPORT");
        }
        setUser(oData);
      })
      .catch((oError) => {
        console.error("UserSet Error", oError);
        setApprovalTabVisible(false);
        setSelectedKey("REPORT");
        MessageBox.error(
          "Unable to load your approval details: " +
            sapErrorMessage(oError, "SAP did not respond") +
            ". Only the Deviation Report is available."
        );
      });
  }

  /* ----------------------------------------------------------- _loadData */
  function _loadData() {
    odata
      .read<{ results: ActionEntity[] }>("/ActionSet")
      .then((oData) => {
        console.log("ActionSet Loaded", oData.results);
        _calculateKPI(oData.results);
      })
      .catch((oError) => {
        console.error("ActionSet Error", oError);
        MessageBox.error("Unable to load inspection lots");
      });
  }

  /* -------------------------------------------------------- _calculateKPI */
  function _calculateKPI(aData: ActionEntity[]) {
    let iPending = 0;
    let iApproved = 0;
    let iRejected = 0;
    aData.forEach((oItem) => {
      switch (oItem.Status) {
        case "NOUD":
          iPending++;
          break;
        case "A":
          iApproved++;
          break;
        case "R":
          iRejected++;
          break;
      }
    });
    setKpi({ total: aData.length, pending: iPending, approved: iApproved, rejected: iRejected });
  }

  /* ---------------------------------------------------------- onTabSelect */
  function onTabSelect(sKey: TabKey) {
    if (!isWideScreen) setMenuOpen(false);
    if (sKey === selectedKey) return; // re-pressing the selected tab fires nothing (expandable=false)
    setSelectedKey(sKey);
    if (sKey === "REPORT") {
      zreportRef.current?.loadReport();
    }
  }

  /* ---- Handlers present in App.controller.js but not wired to any control
   *      in App.view.xml. Kept for parity; not rendered.                    */
  function onRefresh() {
    _loadData();
    MessageToast.show("Latest data loaded");
  }
  function onExport() {
    MessageToast.show("Excel export will be implemented with Spreadsheet API.");
  }
  function onNotification() {
    setSelectedKey("NOTIFICATION");
  }
  void onRefresh;
  void onExport;
  void onNotification;

  const tabs: { key: TabKey; text: string; icon: "task" | "business-objects-experience"; visible: boolean; id: string }[] = [
    { key: "APPROVAL", text: "Approval Worklist", icon: "task", visible: approvalTabVisible === true, id: "approvalTab" },
    { key: "REPORT", text: "Deviation Report", icon: "business-objects-experience", visible: true, id: "reportTab" },
  ];

  const paneClass = isWideScreen ? "nav-pane wide" : "nav-pane drawer" + (menuOpen ? " open" : "");

  return (
    <AppProvider value={{ user, kpi, device }}>
      <div className={"emami-shell " + contentDensityClass(device)}>
        {!isWideScreen && menuOpen ? <div className="nav-scrim" onClick={() => setMenuOpen(false)} /> : null}
        <aside className={paneClass}>
          <div className="nav-brand">
            {!isWideScreen ? (
              <div className="nav-close">
                <button onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <Icon name="decline" size={18} />
                </button>
              </div>
            ) : null}
            <a href={`${BASE_PATH}/`} className="nav-logo" aria-label="Go to Shelf Life Deviation home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
            </a>
          </div>
          <nav className="nav-list" role="tablist" id="mainTabBar" aria-orientation="vertical">
            {tabs
              .filter((t) => t.visible)
              .map((t) => (
                <button
                  key={t.key}
                  id={t.id}
                  role="tab"
                  aria-selected={selectedKey === t.key}
                  aria-controls={"panel-" + t.key}
                  className={"nav-item" + (selectedKey === t.key ? " active" : "")}
                  onClick={() => onTabSelect(t.key)}
                >
                  <Icon name={t.icon} size={18} />
                  <span>{t.text}</span>
                </button>
              ))}
          </nav>
        </aside>

        <div className="shell-main">
          <a href="/" className="back-bar">
            <Icon name="arrow-left" size={14} />
            Back to Emami Apps
          </a>

          <header className="shell-header">
            {!isWideScreen ? (
              <button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                <Icon name="menu" size={22} />
              </button>
            ) : null}
            <h1>Shelf-Life Deviation Workflow</h1>
            <span className="flex-spacer" />
            <span className="chip hide-xs">
              <Icon name="user" size={13} />
              <span className="chip-text">{hubEmail ? nameFromEmail(hubEmail) : "Guest"}</span>
            </span>
            <span className="chip hide-sm">
              <Icon name="calendar" size={13} />
              <span className="chip-text">{today}</span>
            </span>
          </header>

          <main className="shell-content">
            {approvalTabVisible === null && selectedKey === "APPROVAL" ? (
              <div className="boot-spinner-wrap" style={{ height: "50vh", background: "transparent" }}>
                <div className="boot-spinner" />
              </div>
            ) : null}
            {/* Both views are created at start-up (like nested XMLViews) and kept alive */}
            <div
              id="panel-APPROVAL"
              role="tabpanel"
              className="tab-panel"
              hidden={!(approvalTabVisible === true && selectedKey === "APPROVAL")}
            >
              <Approvals />
            </div>
            <div id="panel-REPORT" role="tabpanel" className="tab-panel" hidden={selectedKey !== "REPORT"}>
              <ZReport ref={zreportRef} />
            </div>
          </main>
        </div>
      </div>
    </AppProvider>
  );
}

/**
 * Same guard as every sibling embedded app's Shell: this app has no login screen of its own —
 * reaching it is only valid because the hub already authenticated the visitor. No hub session ->
 * back to the hub, which shows its own login.
 */
export default function ShelfLifeApp() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (hasHubSession()) {
      setAuthorized(true);
    } else if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, []);

  return (
    <>
      {authorized === true ? (
        <AppView />
      ) : (
        <div className="boot-spinner-wrap">
          <div className="boot-spinner" />
        </div>
      )}
      <FeedbackHost />
    </>
  );
}
