/**
 * 1:1 port of webapp/model/formatter.js
 *
 * NOTE: formatter.js defined `statusState` twice inside the same object
 * literal. In JavaScript the LAST definition wins, so the effective one is:
 *   NOUD -> Warning, A -> Success, R -> Error, default -> None
 * That effective behaviour is what is exported here. The overridden
 * first definition is kept as `statusStateLegacy` for reference only.
 */
import { formatPattern } from "./dateFormat";
import type { EdmTime } from "./odata";

export type ValueState = "Success" | "Error" | "Warning" | "Information" | "None";

/** Overridden in the original file (dead code) – not used by any view. */
export function statusStateLegacy(status: string): ValueState {
  if (status === "Approved") return "Success";
  if (status === "Rejected") return "Error";
  if (status === "Pending") return "Warning";
  return "None";
}

export function userStatusState(sStatus: string): ValueState {
  switch (sStatus) {
    case "NOUD": return "Error";
    case "A":    return "Success";
    case "R":    return "Error";
    default:     return "Warning";
  }
}

export function remainingState(pct: number): ValueState {
  return pct < 30 ? "Error" : "Success";
}

export function statusText(sStatus: string): string {
  switch (sStatus) {
    case "A":    return "Approved";
    case "R":    return "Rejected";
    case "NOUD": return "NOUD";
    default:     return sStatus || "";
  }
}

/** Effective statusState (second definition in formatter.js). */
export function statusState(sStatus: string): ValueState {
  switch (sStatus) {
    case "NOUD": return "Warning";
    case "A":    return "Success";
    case "R":    return "Error";
    default:     return "None";
  }
}

export function approvalDateTime(oDate: any, oTime: any): string {
  if (!oDate) return "";
  let d = new Date(oDate);
  if (oTime && oTime.ms !== undefined) {
    d = new Date(d.getTime() + oTime.ms);
  }
  return formatPattern(d, "dd MMM yyyy HH:mm:ss");
}

export function notifTypeState(type: string): ValueState {
  switch (type) {
    case "Approval Request": return "Warning";
    case "Rejection Notice": return "Error";
    case "Approved":         return "Success";
    default:                 return "Information";
  }
}

export function pendingStripText(n: number): string {
  return (n || 0) + " shelf life deviation(s) awaiting CPD Category Head approval.";
}

export function formatTime(oTime: any): string {
  if (!oTime) return "";
  if (typeof oTime === "object" && oTime.ms !== undefined) {
    const totalSeconds = Math.floor(oTime.ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return (
      String(h).padStart(2, "0") + ":" +
      String(m).padStart(2, "0") + ":" +
      String(s).padStart(2, "0")
    );
  }
  return oTime;
}

export function approver(sValue: any): string {
  if (!sValue) return "";
  return sValue;
}

export function approvalDate(oDate: any): string {
  if (!oDate) return "";
  return formatPattern(new Date(oDate), "dd.MM.yyyy");
}

export function approvalTime(oTime: EdmTime | string | null | undefined): string {
  if (!oTime) return "";
  if (typeof oTime === "object" && oTime.ms !== undefined) {
    const totalSeconds = Math.floor(oTime.ms / 1000);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    return h + ":" + m + ":" + s;
  }
  return oTime as string;
}

const formatter = {
  statusStateLegacy,
  userStatusState,
  remainingState,
  statusText,
  statusState,
  approvalDateTime,
  notifTypeState,
  pendingStripText,
  formatTime,
  approver,
  approvalDate,
  approvalTime,
};
export default formatter;
