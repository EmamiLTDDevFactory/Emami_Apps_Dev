const { sendSapFlag } = require("../services/sapNgdService");
const { getDepotEmailForAudit } = require("../models/userModel");

// Fire-and-forget bridge to SAP's ZQM_CAPA_AUDIT_SRV OData service. SAP owns the
// actual email; this endpoint just relays the entitySet + flagged payload.
//
// This still answers HTTP 200 even when SAP rejects the notification, so a notification
// problem can never break the caller's own action. What changed is that the body now tells
// the truth: `success` reflects SAP's actual response instead of being hardcoded true, and
// `error` carries SAP's own message. The full request and response are in the server log
// (see services/sapNgdService.js).
// entitySet ends up in the SAP URL path (services/sapNgdService.js), so only the entity sets the
// frontend actually uses are accepted — both come from src/utils/sapNotify.js
// (notifyAuditTypesSet / notifyCapaSet). Add new ones here when the frontend starts using them.
const ALLOWED_ENTITY_SETS = new Set(["AuditTypesSet", "CapaSet"]);

// CapaSet flags whose Email is the depot's (CAPA accepted & closed, CAPA sent back). The
// browser has no depot users' emails, so it sends the audit id and the email is looked up
// here: the audit's depot user granted access first (models/userModel.js).
const DEPOT_EMAIL_FLAGS = new Set(["F", "G"]);

// Flag C is also sent on Generate CAPA (CAPA assigned to the depot), marked with
// emailTo: "depot" so it gets the depot's email; the self-assessment-submitted C keeps
// the email the browser sends.
const wantsDepotEmail = (flag, emailTo) =>
  DEPOT_EMAIL_FLAGS.has(flag) || (flag === "C" && emailTo === "depot");

const notifySap = async (req, res) => {
  const { entitySet, auditId, emailTo } = req.body || {};
  let { payload } = req.body || {};

  if (!entitySet || !payload || !payload.Flag) {
    return res.status(400).json({
      message: "entitySet and payload (with Flag) are required",
    });
  }

  if (typeof entitySet !== "string" || !ALLOWED_ENTITY_SETS.has(entitySet)) {
    return res.status(400).json({
      message: "Unsupported entitySet",
    });
  }

  if (entitySet === "CapaSet" && wantsDepotEmail(payload.Flag, emailTo)) {
    let email = null;

    try {
      email = auditId ? await getDepotEmailForAudit(auditId) : null;
    } catch (error) {
      console.error(`SAP notify (Flag ${payload.Flag}): depot email lookup failed:`, error);
    }

    if (!email) {
      console.warn(
        `SAP notify (Flag ${payload.Flag}, audit ${auditId || "?"}): no active Depot user for the audit's depot - Email sent empty`
      );
    }

    payload = { ...payload, Email: email || "" };
  }

  const result = await sendSapFlag(entitySet, payload);

  res.json({
    success: result.ok,
    statusCode: result.statusCode,
    error: result.error,
    data: result.data,
  });
};

module.exports = { notifySap };
