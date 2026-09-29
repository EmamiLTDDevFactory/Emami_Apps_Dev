import { apiPost } from "../api/client";

// Flags per the SAP OData Integration Guide for CAPA & Audit Notifications
// (service ZQM_CAPA_AUDIT_SRV). SAP sends the actual email off the Flag; this
// just relays the entitySet + payload through our backend (which handles the
// CSRF handshake with the SAP gateway).
export const SAP_FLAG = {
  DESKTOP_AUDIT_ASSIGNED: "A", // AuditTypesSet
  ONSITE_AUDIT_SCHEDULED: "B", // AuditTypesSet
  SELF_ASSESSMENT_SUBMITTED: "C", // CapaSet
  SELF_ASSESSMENT_ACCEPTED: "D", // CapaSet
  CAPA_SUBMITTED: "E", // CapaSet
  CAPA_ACCEPTED_CLOSED: "F", // CapaSet
  CAPA_SENT_BACK: "G", // CapaSet
};

// Never let a SAP/NGD failure break the calling action — log and move on.
const notifySap = async (entitySet, payload) => {
  try {
    return await apiPost("/sap-notify", { entitySet, payload });
  } catch (error) {
    console.error(`SAP notify (${entitySet}, Flag ${payload?.Flag}) failed:`, error);
    return null;
  }
};

// SAP OData v2 Edm.DateTime literal, e.g. /Date(1725421200000)/ — confirmed
// against the real service; the doc's plain "DD.MM.YYYY" example is rejected
// with CX_SY_CONVERSION_NO_DATE_TIME.
const toSapDate = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : `/Date(${date.getTime()})/`;
};

// SAP OData v2 Edm.Time literal, e.g. PT00H00M00S — confirmed against the
// real service; a plain "" is rejected as an invalid value despite the doc
// saying to pass an empty string when time isn't required.
const toSapTime = (value) => {
  if (!value) return "PT00H00M00S";

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);

  if (!match) return "PT00H00M00S";

  const [, hours, minutes, seconds = "00"] = match;

  return `PT${hours.padStart(2, "0")}H${minutes}M${seconds}S`;
};

export const notifyAuditTypesSet = ({ flag, depot, dueDate, time = "", email = "" }) =>
  notifySap("AuditTypesSet", {
    Flag: flag,
    // SAP's Depot field is a 4-char Plant code, not the depot's full name —
    // never send anything longer than that, even if a caller passes one in.
    Depot: (depot || "").slice(0, 4),
    DueDate: toSapDate(dueDate),
    Time: toSapTime(time),
    Email: email || "",
  });

export const notifyCapaSet = ({
  flag,
  auditNo,
  findingNo = "",
  capaId = "",
  totalCapa = "",
  capaSubm = "",
  capaOpen = "",
  usrId = "",
  email = "",
}) =>
  notifySap("CapaSet", {
    Flag: flag,
    AuditNo: auditNo || "",
    // SAP's FindingNo field is capped at 25 characters.
    FindingNo: (findingNo || "").slice(0, 25),
    CapaId: capaId,
    TotalCapa: totalCapa === "" ? "" : String(totalCapa),
    CapaSubm: capaSubm === "" ? "" : String(capaSubm),
    CapaOpen: capaOpen === "" ? "" : String(capaOpen),
    // SAP's UsrId field is capped at 12 characters.
    UsrId: (usrId || "").slice(0, 12),
    Email: email || "",
  });
