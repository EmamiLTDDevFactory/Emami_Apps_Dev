const express = require("express");
const {
  getCAPAs,
  // replaceCAPAs,
  createCAPAs,
  updateCAPA,
  uploadCAPAEvidenceController,
  deleteCAPAsForAudit
} = require("../controllers/capaController");

const router = express.Router();

const uploadCAPAEvidence =
  require("../middleware/uploadCAPAEvidence");

// const {
//   uploadCAPAEvidenceController
// } = require("../controllers/capaController");

router.post(
  "/:id/evidence",
  uploadCAPAEvidence.single("evidence"),
  uploadCAPAEvidenceController
);

router.get("/", getCAPAs);
router.post("/", createCAPAs);
// router.put("/sync", replaceCAPAs);
router.delete("/", deleteCAPAsForAudit);
router.patch("/:id", updateCAPA);
router.put("/:id", updateCAPA);

module.exports = router;
