"use client";
/** Lightweight equivalents of the sap.m / sap.ui.table controls used by the views. */
import React, { useEffect, useRef, useState } from "react";
import { Icon, IconName } from "./Icon";
import type { ValueState } from "@/lib/formatter";

/* ------------------------------------------------------------ MessageStrip */
export function MessageStrip({
  text,
  type = "Information",
  showCloseButton,
  showIcon,
  className,
}: {
  text: string;
  type?: "Information" | "Success" | "Warning" | "Error";
  showCloseButton?: boolean;
  showIcon?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className={`message-strip strip-${type.toLowerCase()} ${className || ""}`} role="note">
      {showIcon ? <Icon name="information" size={16} className="strip-icon" /> : null}
      <span className="strip-text">{text}</span>
      {showCloseButton ? (
        <button className="strip-close" aria-label="Close" onClick={() => setVisible(false)}>
          <Icon name="decline" size={12} />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ ObjectStatus */
export function ObjectStatus({ text, state = "None" }: { text: string; state?: ValueState }) {
  return <span className={`object-status state-${state.toLowerCase()}`}>{text}</span>;
}

/* ------------------------------------------------------------ Button */
export function Button({
  text,
  icon,
  type = "Default",
  onPress,
  disabled,
}: {
  text: string;
  icon?: IconName;
  type?: "Default" | "Emphasized" | "Accept" | "Reject" | "Transparent";
  onPress?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn btn-${type.toLowerCase()}`}
      onClick={(e) => {
        e.stopPropagation(); // a Button press in a table row does not select the row
        onPress?.(e);
      }}
      disabled={disabled}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      <span>{text}</span>
    </button>
  );
}

/* ------------------------------------------------------------ BusyOverlay
 * control.setBusy(true): UI5 shows the indicator after the default
 * busyIndicatorDelay of 1000 ms, but blocks interaction immediately.      */
export function BusyOverlay({ busy, delay = 1000 }: { busy: boolean; delay?: number }) {
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    if (!busy) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), delay);
    return () => clearTimeout(t);
  }, [busy, delay]);
  if (!busy) return null;
  return (
    <div className={"busy-overlay" + (showSpinner ? " visible" : "")} aria-busy="true">
      {showSpinner ? (
        <div className="busy-dots" role="progressbar" aria-label="Please wait">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ GridTable
 * Replacement for sap.ui.table.Table with
 *   visibleRowCountMode="Fixed" visibleRowCount="5" columnHeaderHeight="36"
 * Fixed column widths (rem), horizontal + vertical scrolling inside the table.
 */
export interface GridColumn<T> {
  key: string;
  label: string;
  width: string;
  render: (row: T, index: number) => React.ReactNode;
  align?: "start" | "center" | "end";
}

export function GridTable<T>({
  id,
  columns,
  rows,
  visibleRowCount = 5,
  selectionMode = "None",
  noDataText = "No data",
  getRowKey,
}: {
  id?: string;
  columns: GridColumn<T>[];
  rows: T[] | undefined;
  visibleRowCount?: number;
  /** "MultiToggle" with selectionBehavior="RowOnly" = click a row to (de)select it */
  selectionMode?: "None" | "MultiToggle";
  noDataText?: string;
  getRowKey?: (row: T, index: number) => string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const prevRows = useRef(rows);
  useEffect(() => {
    // Like sap.ui.table: a new rows binding clears the selection
    if (prevRows.current !== rows) setSelected(new Set());
    prevRows.current = rows;
  }, [rows]);

  const data = rows || [];
  const keyOf = (r: T, i: number) => (getRowKey ? getRowKey(r, i) : String(i));
  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const templateCols = columns.map((c) => c.width).join(" ");

  return (
    <div
      id={id}
      className="grid-table"
      style={{ ["--visible-rows" as any]: visibleRowCount }}
      role="grid"
      aria-rowcount={data.length + 1}
      aria-multiselectable={selectionMode === "MultiToggle" || undefined}
    >
      <div className="grid-scroll">
        <div className="grid-inner" style={{ ["--cols" as any]: templateCols }}>
          <div className="grid-row grid-header" role="row">
            {columns.map((c) => (
              <div key={c.key} className="grid-cell grid-hcell" role="columnheader">
                <span className="cell-text">{c.label}</span>
              </div>
            ))}
          </div>
          {data.map((row, i) => {
              const k = keyOf(row, i);
              const isSel = selected.has(k);
              return (
                <div
                  key={k}
                  role="row"
                  aria-selected={selectionMode === "MultiToggle" ? isSel : undefined}
                  className={
                    "grid-row" +
                    (i % 2 ? " odd" : "") +
                    (isSel ? " selected" : "") +
                    (selectionMode === "MultiToggle" ? " selectable" : "")
                  }
                  onClick={selectionMode === "MultiToggle" ? () => toggle(k) : undefined}
                >
                  {columns.map((c) => (
                    <div
                      key={c.key}
                      role="gridcell"
                      className={"grid-cell" + (c.align ? " align-" + c.align : "")}
                    >
                      {c.render(row, i)}
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
        {data.length === 0 ? (
          <div className="grid-nodata" role="row">
            <span>{noDataText}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** <Text wrapping="false"/> inside a table cell */
export function CellText({ children, align }: { children: React.ReactNode; align?: "center" }) {
  const s = children === null || children === undefined ? "" : String(children);
  return (
    <span className="cell-text" title={s} style={align ? { textAlign: align, width: "100%" } : undefined}>
      {s}
    </span>
  );
}

/* ------------------------------------------------------------ Dialog
 * sap.m.Dialog draggable + resizable, Escape closes.
 */
export function Dialog({
  open,
  title,
  contentWidth,
  contentHeight,
  onEscape,
  buttons,
  children,
}: {
  open: boolean;
  title: string;
  contentWidth?: string;
  contentHeight?: string;
  onEscape?: () => void;
  buttons?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!open) setPos(null); // re-centre on next open
  }, [open]);

  useEffect(() => {
    if (open) {
      const el = ref.current?.querySelector<HTMLElement>("textarea, input, button");
      el?.focus();
    }
  }, [open]);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = drag.current;
    setPos({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="dialog resizable"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: contentWidth,
          height: contentHeight
            ? `calc(${contentHeight} + var(--dialog-chrome-height))`
            : undefined,
          ...(pos ? { position: "fixed", left: pos.x, top: pos.y, margin: 0 } : {}),
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onEscape?.();
        }}
      >
        <header
          className="dialog-header draggable"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <h2>{title}</h2>
        </header>
        <div className="dialog-content">{children}</div>
        {buttons ? <footer className="dialog-footer">{buttons}</footer> : null}
      </div>
    </div>
  );
}
