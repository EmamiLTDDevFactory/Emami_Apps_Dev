const express = require("express");
const {
  getCAPAs,
  // replaceCAPAs,
  createCAPAs,
  updateCAPA,
  addCAPAEvidenceController,
  removeCAPAEvidenceController,
  cancelCAPAController,
  deleteCAPAsForAudit
} = require("../controllers/capaController");

const allowFields = require("../middleware/fieldAllowlist");
const actorCheck = require("../middleware/actorCheck");

const router = express.Router();

// Every field the frontend sends on a CAPA update (src/pages/CAPAManagement.js updateCAPA(...)
// calls, incl. handleSaveDraft's rootCause / preventiveAction / cqaRemarks / targetDate, and the
// Depot "Add CAPA" entries in additionalActions) — also exactly the fields models/capaModel.js
// updateCAPA writes. Anything else is logged (and dropped when ENFORCE_AUTH=on).
const capaUpdateFields = allowFields("/api/capas/:id", [
  "rootCause",
  "preventiveAction",
  "cqaRemarks",
  "targetDate",
  "status",
  "submittedDate",
  "additionalActions",
]);

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
  // After multer, so the multipart body is parsed. Log-only.
  actorCheck("/api/capas/:id/evidence", ["body.uploadedBy:role"]),
  addCAPAEvidenceController
);

// Soft remove (hidden from the list; file and record are kept).
router.patch(
  "/:id/evidence/:fileId/remove",
  removeCAPAEvidenceController
);

// Soft cancel of an added CAPA (CQA).
router.patch("/:id/cancel", cancelCAPAController);

router.get("/", getCAPAs);
router.post("/", createCAPAs);
// router.put("/sync", replaceCAPAs);
router.delete("/", deleteCAPAsForAudit);
router.patch("/:id", capaUpdateFields, updateCAPA);
router.put("/:id", capaUpdateFields, updateCAPA);

module.exports = router;
