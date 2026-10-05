"use client";
/**
 * Port of view/ZReport.view.xml + controller/ZReport.controller.js
 *
 * Backend calls (unchanged):
 *   GET ActionSet   (on init, and every time the "Deviation Report" tab is selected)
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { odata } from "@/lib/odata";
import formatter from "@/lib/formatter";
import { formatMediumDate } from "@/lib/dateFormat";
import type { ActionEntity } from "@/lib/types";
import { MessageToast } from "./ui/feedback";
import {
  BusyOverlay,
  Button,
  CellText,
  GridColumn,
  GridTable,
  MessageStrip,
  ObjectStatus,
} from "./ui/controls";

export interface ZReportHandle {
  loadReport: () => void;
}

/** One CSV field: always quoted, embedded quotes doubled (RFC 4180). */
function csvField(v: unknown): string {
  return '"' + String(v ?? "").replace(/"/g, '""') + '"';
}

interface AppliedFilters {
  status: string;
  from: Date | null;
  to: Date | null;
}

/** DatePicker valueFormat="yyyy-MM-dd" -> getDateValue() (local midnight) */
function parseDateValue(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * sap.ui.model.Filter(path, FilterOperator.EQ, value) on a JSON list binding:
 * strings are compared case-insensitively (caseSensitive defaults to false
 * for client models).
 */
function eqFilter(v: any, key: string): boolean {
  if (typeof v === "string") return v.normalize("NFC").toUpperCase() === key.normalize("NFC").toUpperCase();
  return v === key;
}

const ZReport = forwardRef<ZReportHandle>(function ZReport(_props, ref) {
  // local>/ActionSet  (undefined until the first successful read)
  const [rows, setRows] = useState<ActionEntity[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // control values
  const [statusKey, setStatusKey] = useState("");
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");
  // filters applied to the rows binding (set in onFilterChange)
  const [applied, setApplied] = useState<AppliedFilters>({ status: "", from: null, to: null });

  /* ---------------------------------------------------------- loadReport */
  const loadReport = useCallback(() => {
    setBusy(true);
    odata
      .read<{ results: ActionEntity[] }>("/ActionSet")
      .then((oData) => {
        setRows(oData.results);
        setBusy(false);
      })
      .catch(() => {
        setBusy(false);
      });
  }, []);

  useImperativeHandle(ref, () => ({ loadReport }), [loadReport]);

  /* -------------------------------------------------------------- onInit */
  useEffect(() => {
    loadReport();
  }, [loadReport]);

  /* ------------------------------------------------------ onFilterChange */
  const onFilterChange = (next: { status?: string; from?: string; to?: string }) => {
    const sStatus = next.status ?? statusKey;
    let oFrom = parseDateValue(next.from ?? fromValue);
    let oTo = parseDateValue(next.to ?? toValue);

    if (oFrom) {
      oFrom = new Date(oFrom);
      oFrom.setHours(0, 0, 0, 0);
    }
    if (oTo) {
      oTo = new Date(oTo);
      oTo.setHours(23, 59, 59, 999);
    }
    setApplied({ status: sStatus, from: oFrom, to: oTo });
  };

  /** Rows as seen through the filtered binding */
  const filteredRows = useMemo(() => {
    if (!rows) return undefined;
    const { status, from, to } = applied;
    return rows.filter((r) => {
      if (status && !eqFilter(r.Status, status)) return false;
      if (from || to) {
        const vDate: any = r.ActSledDate;
        if (!vDate) return false;
        const d = new Date(vDate);
        if (from && d.getTime() < from.getTime()) return false;
        if (to && d.getTime() > to.getTime()) return false;
      }
      return true;
    });
  }, [rows, applied]);

  /* --------------------------------------------------------- onExportCsv */
  const onExportCsv = () => {
    const headers = [
      "Plant",
      "Storage Location",
      "Inspection Lot",
      "Material Code",
      "Batch",
      "Description",
      "Vendor Name",
      "GRN Quantity",
      "Manufacturing Date",
      "GRN Date",
      "Actual SLED",
      "Approver",
      "Approval Date",
      "Approval Time",
      "Status",
    ];

    const out = [headers.map(csvField).join(",")];
    // every row that passes the current filters (the UI5 export stopped at 100)
    const aContexts = filteredRows || [];

    aContexts.forEach((o) => {
      const sGrnDate = o.GrnDate ? new Date(o.GrnDate).toLocaleDateString() : "";
      const sManufacturingDate = o.ManfuctDate ? new Date(o.ManfuctDate).toLocaleDateString() : "";
      const sActualSled = o.ActSledDate ? new Date(o.ActSledDate).toLocaleDateString() : "";
      const sApprovalDate = o.ApprDate ? new Date(o.ApprDate).toLocaleDateString() : "";

      let sApprovalTime = "";
      const t: any = o.ApprTime;
      if (t && t.ms !== undefined) {
        const total = Math.floor(t.ms / 1000);
        const h = String(Math.floor(total / 3600)).padStart(2, "0");
        const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
        const s = String(total % 60).padStart(2, "0");
        sApprovalTime = h + ":" + m + ":" + s;
      }

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

      // same order as the headers above (the UI5 export had GRN Date and
      // Manufacturing Date swapped)
      out.push(
        [
          o.Plant || "",
          o.StorageLoc || "",
          o.InspectLot || "",
          o.Matnr || "",
          o.Batch || "",
          o.MatDesc || "",
          o.VendName || "",
          o.GrnQty || "",
          sManufacturingDate,
          sGrnDate,
          sActualSled,
          o.ApprName || "",
          sApprovalDate,
          sApprovalTime,
          sStatus,
        ]
          .map(csvField)
          .join(",")
      );
    });

    const csv = out.join("\n");
    // BOM so Excel reads non-ASCII descriptions/vendor names as UTF-8 (same as the worklist export)
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Z_Shelf_Life_Deviation_Report.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    MessageToast.show("Z-Report exported successfully.");
  };

  /* ---------------------------------------------------------------- view */
  const columns: GridColumn<ActionEntity>[] = [
    { key: "plant", label: "Plant", width: "5rem", render: (r) => <CellText>{r.Plant}</CellText> },
    { key: "sloc", label: "Storage Loc", width: "6.5rem", render: (r) => <CellText>{r.StorageLoc}</CellText> },
    { key: "lot", label: "Inspection Lot", width: "8rem", render: (r) => <CellText>{r.InspectLot}</CellText> },
    { key: "matnr", label: "Material Code", width: "8rem", render: (r) => <CellText>{r.Matnr}</CellText> },
    { key: "batch", label: "Batch", width: "6rem", render: (r) => <CellText>{r.Batch}</CellText> },
    { key: "desc", label: "Description", width: "9rem", render: (r) => <CellText>{r.MatDesc}</CellText> },
    { key: "vend", label: "Vendor Name", width: "8rem", render: (r) => <CellText>{r.VendName}</CellText> },
    { key: "qty", label: "GRN Qty", width: "6rem", render: (r) => <CellText>{r.GrnQty}</CellText> },
    { key: "grn", label: "GRN Date", width: "8rem", render: (r) => <CellText>{formatMediumDate(r.GrnDate)}</CellText> },
    { key: "mfd", label: "Manufact Date", width: "8rem", render: (r) => <CellText>{formatMediumDate(r.ManfuctDate)}</CellText> },
    { key: "sled", label: "Actual SLED Date", width: "8rem", render: (r) => <CellText>{formatMediumDate(r.ActSledDate)}</CellText> },
    { key: "appr", label: "Approver", width: "8rem", render: (r) => <CellText>{r.ApprName ? r.ApprName : ""}</CellText> },
    {
      key: "apprDate",
      label: "Approval Date",
      width: "8rem",
      render: (r) => <CellText>{formatter.approvalDateTime(r.ApprDate, r.ApprTime)}</CellText>,
    },
    {
      key: "status",
      label: "Status",
      width: "7rem",
      render: (r) => (
        <ObjectStatus
          text={formatter.statusText(r.Status || "")}
          state={formatter.userStatusState(r.Status || "")}
        />
      ),
    },
    { key: "rej", label: "Rejection Reason", width: "15rem", render: (r) => <CellText>{r.RejRes}</CellText> },
  ];

  return (
    <div className="view">
      <div className="vbox">
        <h2 className="title title-h2">Shelf-Life Deviation Report</h2>

        <MessageStrip
          text="This report is used by the CADE team for monitoring all shelf-life deviation transactions."
          type="Information"
          showCloseButton
          showIcon
        />

        <div className="overflow-toolbar sapUiTinyMarginTop">
          <h3 className="title title-h3">Deviation Report</h3>
          <span className="toolbar-spacer" />

          <label className="label" htmlFor="statusFilter">
            Status
          </label>
          <select
            id="statusFilter"
            className="select"
            style={{ width: 150 }}
            value={statusKey}
            onChange={(e) => {
              setStatusKey(e.target.value);
              onFilterChange({ status: e.target.value });
            }}
          >
            <option value="">All Statuses</option>
            <option value="A">Approved</option>
            <option value="R">Rejected</option>
            <option value="NOUD">NOUD</option>
          </select>

          <span className="toolbar-separator" />

          <label className="label" htmlFor="fromDate">
            From
          </label>
          <input
            id="fromDate"
            type="date"
            className="datepicker"
            style={{ width: 140 }}
            value={fromValue}
            onChange={(e) => {
              setFromValue(e.target.value);
              onFilterChange({ from: e.target.value });
            }}
          />

          <label className="label" htmlFor="toDate">
            To
          </label>
          <input
            id="toDate"
            type="date"
            className="datepicker"
            style={{ width: 140 }}
            value={toValue}
            onChange={(e) => {
              setToValue(e.target.value);
              onFilterChange({ to: e.target.value });
            }}
          />

          <span className="toolbar-separator" />

          <Button text="Export" icon="excel-attachment" onPress={onExportCsv} />

          {/* {= ${local>/ActionSet}.length + ' Records'} : count of the loaded (unfiltered) data */}
          <ObjectStatus text={rows ? rows.length + " Records" : ""} state="Information" />
        </div>
      </div>

      <div className="vbox">
        <GridTable id="zreportTable" columns={columns} rows={filteredRows} visibleRowCount={5} selectionMode="None" />
      </div>

      <BusyOverlay busy={busy} />
    </div>
  );
});

export default ZReport;
