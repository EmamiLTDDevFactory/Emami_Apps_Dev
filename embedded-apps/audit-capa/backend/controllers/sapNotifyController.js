const { sendSapFlag } = require("../services/sapNgdService");

// Fire-and-forget bridge to SAP's ZQM_CAPA_AUDIT_SRV OData service. SAP owns the
// actual email; this endpoint just relays the entitySet + flagged payload.
//
// This still answers HTTP 200 even when SAP rejects the notification, so a notification
// problem can never break the caller's own action. What changed is that the body now tells
// the truth: `success` reflects SAP's actual response instead of being hardcoded true, and
// `error` carries SAP's own message. The full request and response are in the server log
// (see services/sapNgdService.js).
const notifySap = async (req, res) => {
  const { entitySet, payload } = req.body || {};

  if (!entitySet || !payload || !payload.Flag) {
    return res.status(400).json({
      message: "entitySet and payload (with Flag) are required",
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
