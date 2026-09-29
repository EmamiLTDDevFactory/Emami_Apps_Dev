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

const router = express.Router();

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
router.patch("/:id", updateAudit);
router.put("/:id", updateAudit);
router.delete("/:id", deleteAudit);

module.exports = router;
