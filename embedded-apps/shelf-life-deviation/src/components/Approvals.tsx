"use client";
/**
 * Port of view/Approvals.view.xml + controller/Approvals.controller.js
 *
 * Backend calls (user = Emami Apps hub email):
 *   GET  UserSet(Email='<email>')?$expand=NAV_UserToAction  (after a decision — the first rows come
 *                                                      from ShelfLifeApp's own read of it)
 *   POST ActionSet                                     (approve / reject)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { odata } from "@/lib/odata";
import formatter from "@/lib/formatter";
import { formatMediumDate } from "@/lib/dateFormat";
import { getLoggedInUser, userSetPath } from "@/lib/user";
import type { ActionEntity, UserEntity } from "@/lib/types";
import { useAppModels } from "./AppContext";
import { MessageBox, MessageToast } from "./ui/feedback";
import {
  BusyOverlay,
  Button,
  CellText,
  GridColumn,
  GridTable,
  MessageStrip,
  ObjectStatus,
} from "./ui/controls";
import { Icon } from "./ui/Icon";
import { ApprovalDialog } from "./ApprovalDialog";

/** _formatODataTime: "PT" + h + "H" + m + "M" + s + "S" (no zero padding, as in UI5 code) */
function formatODataTime(oDate: Date): string {
  return "PT" + oDate.getHours() + "H" + oDate.getMinutes() + "M" + oDate.getSeconds() + "S";
}

function toCsvDate(v: any): string {
  return v ? new Date(v).toLocaleDateString() : "";
}

/** Rows matching the search box text (empty text -> every row). */
function filterRows(aData: ActionEntity[], sQuery: string): ActionEntity[] {
  const sValue = (sQuery || "").toLowerCase().trim();
  if (!sValue) return aData;
  return aData.filter((oData) => {
    let sStatus = "";
    switch (oData.Status) {
      case "A":
        sStatus = "approved";
        break;
      case "R":
        sStatus = "rejected";
        break;
      case "NOUD":
        sStatus = "pending";
        break;
      default:
        sStatus = oData.Status || "";
    }
    return (
      (oData.InspectLot || "").toLowerCase().includes(sValue) ||
      (oData.Plant || "").toLowerCase().includes(sValue) ||
      (oData.StorageLoc || "").toLowerCase().includes(sValue) ||
      (oData.Matnr || "").toLowerCase().includes(sValue) ||
      (oData.Batch || "").toLowerCase().includes(sValue) ||
      (oData.MatDesc || "").toLowerCase().includes(sValue) ||
      (oData.VendName || "").toLowerCase().includes(sValue) ||
      String(oData.GrnQty || "").toLowerCase().includes(sValue) ||
      (oData.ApprName || "").toLowerCase().includes(sValue) ||
      String(oData.ManfuctDate || "").toLowerCase().includes(sValue) ||
      sStatus.includes(sValue)
    );
  });
}

export default function Approvals() {
  const { user } = useAppModels();
  // this._allData
  const allDataRef = useRef<ActionEntity[] | undefined>(undefined);
  // local>/ActionSet  (undefined until the "local" model is set, like UI5)
  const [rows, setRows] = useState<ActionEntity[] | undefined>(undefined);
  // this._oSelectedModel (holds the SAME object reference as the table row)
  const selectedRef = useRef<ActionEntity>({});
  // this._oRejectModel  { reason }
  const [reason, setReason] = useState("");
  const reasonRef = useRef("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // current search box text, re-applied whenever the rows are reloaded
  const searchRef = useRef("");

  const setReasonBoth = (v: string) => {
    reasonRef.current = v;
    setReason(v);
  };

  const showData = useCallback((aData: ActionEntity[]) => {
    allDataRef.current = aData;
    setRows(filterRows(aData, searchRef.current));
  }, []);

  /* ------------------------------------------------------------- onInit */
  // UserSet is read once at start-up by ShelfLifeApp; its expanded actions are the first rows.
  useEffect(() => {
    if (user) showData(user.NAV_UserToAction?.results || []);
  }, [user, showData]);

  /* ------------------------------------------------------ onOpenApproval */
  const onOpenApproval = (oData: ActionEntity) => {
    selectedRef.current = oData;
    setReasonBoth("");
    setDialogOpen(true);
  };

  const closeDialog = () => setDialogOpen(false);

  /* ------------------------------------------------------- _postDecision */
  const postDecision = useCallback((sStatus: "A" | "R") => {
    const oData = selectedRef.current;

    // Preserved from the UI5 controller: the selected row object itself is
    // mutated (JSONModel.setData kept the same reference).
    oData.Status = sStatus;

    const oPayload: Record<string, any> = {
      InspectLot: oData.InspectLot,
      Plant: oData.Plant,
      StorageLoc: oData.StorageLoc,
      Matnr: oData.Matnr,
      Batch: oData.Batch,
      MatDesc: oData.MatDesc || "",
      VendName: oData.VendName,
      GrnQty: oData.GrnQty,
      ManfuctDate: oData.ManfuctDate,
      ActSledDate: oData.ActSledDate,

      Status: sStatus,
      RejRes: reasonRef.current,
    };

    if (sStatus === "A") {
      const oNow = new Date();
      oPayload.ApprName = getLoggedInUser();
      oPayload.ApprDate = oNow;
      oPayload.ApprTime = formatODataTime(oNow);
    }

    console.log("POST ACTIONSET PAYLOAD", oPayload);

    setBusy(true);

    odata
      .create("/ActionSet", oPayload)
      .then(() => {
        setBusy(false);
        MessageToast.show("Decision saved successfully");
        closeDialog();

        odata
          .read<UserEntity>(userSetPath(), {
            urlParameters: { $expand: "NAV_UserToAction" },
          })
          .then((oUser) => {
            showData(oUser.NAV_UserToAction?.results || []);
          })
          .catch((oError) => {
            console.error(oError);
            MessageBox.error("Decision saved, but the worklist could not be refreshed. Please reopen the app.");
          });
      })
      .catch((oError) => {
        setBusy(false);
        console.error(oError);
        MessageBox.error("Failed to update Inspection Lot");
      });
  }, [showData]);

  const onApprove = () => postDecision("A");

  const onReject = () => {
    const sReason = reasonRef.current;
    if (!sReason.trim()) {
      MessageToast.show("Rejection reason is mandatory.");
      return;
    }
    postDecision("R");
  };

  const onCancel = () => closeDialog();

  /* ------------------------------------------------------------ onSearch */
  const onSearch = (newValue: string) => {
    searchRef.current = newValue || "";
    setRows(filterRows(allDataRef.current || [], searchRef.current));
  };

  /* ------------------------------------------------------------ onExport */
  const onExport = () => {
    const aRows = rows;
    if (!aRows || aRows.length === 0) {
      MessageToast.show("No data available to export.");
      return;
    }

    let sCSV =
      "Inspection Lot,Plant,Storage Location,Material,Batch,Material Description,Vendor,GRN Quantity,GRN Date,Manufacturing Date,Actual SLED,Approver,Approval Date,Approval Time,Status\n";

    aRows.forEach((o) => {
      const sGrnDate = toCsvDate(o.GrnDate);
      const sPostingDate = toCsvDate(o.ActSledDate);
      const sApprovalDate = toCsvDate(o.ApprDate);

      let sTime = "";
      const t: any = o.ApprTime;
      if (t && t.ms !== undefined) {
        const total = Math.floor(t.ms / 1000);
        const h = String(Math.floor(total / 3600)).padStart(2, "0");
        const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
        const s = String(total % 60).padStart(2, "0");
        sTime = h + ":" + m + ":" + s;
      }

      const sManufacturingDate = toCsvDate(o.ManfuctDate);

      let sStatus = "";
      switch (o.Status) {
        case "A":
          sStatus = "Approved";
          break;
        case "R":
          sStatus = "Rejected";
          break;
        default:
          sStatus = "Pending";
      }

      const aColumns = [
        o.InspectLot || "",
        o.Plant || "",
        o.StorageLoc || "",
        o.Matnr || "",
        o.Batch || "",
        o.MatDesc || "",
        o.VendName || "",
        o.GrnQty || "",
        sGrnDate,
        sManufacturingDate,
        sPostingDate,
        o.ApprName || "",
        sApprovalDate,
        sTime,
        sStatus,
      ];

      sCSV +=
        aColumns.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(",") + "\n";
    });

    const blob = new Blob(["\uFEFF" + sCSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ShelfLifeApproval.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    MessageToast.show("Excel exported successfully.");
  };

  /* --------------------------------------------------------------- view */
  const columns: GridColumn<ActionEntity>[] = [
    {
      key: "action",
      label: "Action",
      width: "8rem",
      render: (r) =>
        r.Status === "NOUD" ? (
          <Button
            text="Review"
            icon="inspection"
            type="Emphasized"
            onPress={() => onOpenApproval(r)}
          />
        ) : null,
    },
    { key: "lot", label: "Inspection Lot", width: "8rem", render: (r) => <CellText>{r.InspectLot}</CellText> },
    { key: "plant", label: "Plant", width: "5rem", render: (r) => <CellText>{r.Plant}</CellText> },
    { key: "sloc", label: "Storage Loc.", width: "6.5rem", render: (r) => <CellText>{r.StorageLoc}</CellText> },
    { key: "matnr", label: "Material Code", width: "8rem", render: (r) => <CellText>{r.Matnr}</CellText> },
    { key: "batch", label: "Batch", width: "5.5rem", render: (r) => <CellText>{r.Batch}</CellText> },
    { key: "desc", label: "Description", width: "12rem", render: (r) => <CellText>{r.MatDesc}</CellText> },
    { key: "vend", label: "Vendor Name", width: "10rem", render: (r) => <CellText>{r.VendName}</CellText> },
    { key: "qty", label: "GRN Qty", width: "6rem", render: (r) => <CellText>{r.GrnQty}</CellText> },
    { key: "grn", label: "GRN Date", width: "8rem", render: (r) => <CellText>{formatMediumDate(r.GrnDate)}</CellText> },
    { key: "mfd", label: "Manufact Date", width: "8rem", render: (r) => <CellText>{formatMediumDate(r.ManfuctDate)}</CellText> },
    { key: "sled", label: "Actual SLED Date", width: "8rem", render: (r) => <CellText>{formatMediumDate(r.ActSledDate)}</CellText> },
    {
      key: "appr",
      label: "Approver",
      width: "8rem",
      render: (r) => <CellText align="center">{formatter.approver(r.ApprName)}</CellText>,
    },
    { key: "apprDate", label: "Approval Date", width: "8rem", render: (r) => <CellText>{formatter.approvalDate(r.ApprDate)}</CellText> },
    { key: "apprTime", label: "Time", width: "6rem", render: (r) => <CellText>{formatter.approvalTime(r.ApprTime as any)}</CellText> },
    {
      key: "status",
      label: "Status",
      width: "7rem",
      render: (r) => (
        <ObjectStatus
          text={formatter.statusText(r.Status || "")}
          state={formatter.statusState(r.Status || "")}
        />
      ),
    },
  ];

  return (
    <div className="view fill">
      <div className="vbox grow sapUiSmallMargin">
        <MessageStrip
          text="Inspection Lots awaiting approval."
          type="Information"
          showCloseButton
          showIcon
        />

        <div className="overflow-toolbar">
          <h3 className="title title-h3">Approval Worklist</h3>
          <span className="toolbar-spacer" />
          <div className="search-field" style={{ width: 250 }}>
            <input
              type="search"
              placeholder="Search Inspection Lot"
              aria-label="Search Inspection Lot"
              onChange={(e) => onSearch(e.target.value)}
            />
            <Icon name="search" size={14} className="search-icon" />
          </div>
          <Button text="Export" icon="excel-attachment" onPress={onExport} />
        </div>

        <GridTable
          id="approvalsTable"
          columns={columns}
          rows={rows}
          visibleRowCount={5}
          selectionMode="MultiToggle"
          fill
        />
      </div>

      <BusyOverlay busy={busy} />

      <ApprovalDialog
        open={dialogOpen}
        reason={reason}
        onReasonChange={setReasonBoth}
        onApprove={onApprove}
        onReject={onReject}
        onCancel={onCancel}
      />
    </div>
  );
}
