const express = require("express");
const {
  getAudits,
  getAudit,
  createAudit,
  updateAudit,
  deleteAudit,
  deactivateAudit,
  activateAudit,
} = require("../controllers/auditController");
const {
  uploadChecklistEvidenceController,
} = require("../controllers/capaController");
const {
  checklistEvidenceArray,
} = require("../middleware/uploadCAPAEvidence");
const allowFields = require("../middleware/fieldAllowlist");

const router = express.Router();

// Every field the frontend sends on an audit update (src/pages/Annexure1.js and
// src/pages/CAPAManagement.js updateAudit(...) calls, src/utils/storage.js saveChecklistDraft).
// auditDate is only sent by a currently commented-out date editor in Annexure1.js — kept so it
// works again if that's re-enabled. auditCategory / auditType / depot / auditor / dueDate come
// from the Edit Audit dialog (src/components/audit/AuditAdminDialogs.js). Anything else is logged
// (and dropped when ENFORCE_AUTH=on).
const auditUpdateFields = allowFields("/api/audits/:id", [
  "status",
  "compliance",
  "checklist",
  "generalInfo",
  "auditDate",
  "depotInchargeName",
  "depotSignature",
  "depotSignatureSubmitted",
  "depotSignatureDate",
  "auditorSignature",
  "auditorSignatureSubmitted",
  "auditorSignatureDate",
  "auditCategory",
  "auditType",
  "depot",
  "auditor",
  "dueDate",
]);

router.get("/", getAudits);
router.get("/:id", getAudit);
router.post("/", createAudit);
router.post(
  "/:id/checklist-evidence",
  checklistEvidenceArray,
  uploadChecklistEvidenceController
);
router.patch("/:id/deactivate", deactivateAudit);
router.patch("/:id/activate", activateAudit);
router.patch("/:id", auditUpdateFields, updateAudit);
router.put("/:id", auditUpdateFields, updateAudit);
router.delete("/:id", deleteAudit);

module.exports = router;
