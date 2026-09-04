const { sendSapFlag } = require("../services/sapNgdService");

// Fire-and-forget bridge to SAP's ZQM_CAPA_AUDIT_SRV OData service. SAP owns the
// actual email; this endpoint just relays the entitySet + flagged payload.
const notifySap = async (req, res) => {
  const { entitySet, payload } = req.body || {};

  if (!entitySet || !payload || !payload.Flag) {
    return res.status(400).json({
      message: "entitySet and payload (with Flag) are required",
    });
  }

  const data = await sendSapFlag(entitySet, payload);

  res.json({ success: true, data });
};

module.exports = { notifySap };
