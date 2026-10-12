const { sendSapFlag } = require("../services/sapNgdService");

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

const notifySap = async (req, res) => {
  const { entitySet, payload } = req.body || {};

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

  const result = await sendSapFlag(entitySet, payload);

  res.json({
    success: result.ok,
    statusCode: result.statusCode,
    error: result.error,
    data: result.data,
  });
};

module.exports = { notifySap };
