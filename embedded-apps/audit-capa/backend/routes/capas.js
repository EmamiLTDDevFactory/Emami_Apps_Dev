const express = require("express");
const {
  getCAPAs,
  // replaceCAPAs,
  createCAPAs,
  updateCAPA,
  addCAPAEvidenceController,
  removeCAPAEvidenceController,
  deleteCAPAsForAudit
} = require("../controllers/capaController");

const router = express.Router();

const uploadCAPAEvidence =
  require("../middleware/uploadCAPAEvidence");

// const {
//   uploadCAPAEvidenceController
// } = require("../controllers/capaController");

// Multi-evidence: one or more files per request (field "evidence"), appended
// to the CAPA's evidence list. A single-file upload still works the same way.
router.post(
  "/:id/evidence",
  uploadCAPAEvidence.capaEvidenceArray,
  addCAPAEvidenceController
);

// Soft remove (hidden from the list; file and record are kept).
router.patch(
  "/:id/evidence/:fileId/remove",
  removeCAPAEvidenceController
);

router.get("/", getCAPAs);
router.post("/", createCAPAs);
// router.put("/sync", replaceCAPAs);
router.delete("/", deleteCAPAsForAudit);
router.patch("/:id", updateCAPA);
router.put("/:id", updateCAPA);

module.exports = router;
