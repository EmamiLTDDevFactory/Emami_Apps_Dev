const express = require("express");
const {
  getAudits,
  getAudit,
  createAudit,
  updateAudit,
  deleteAudit,
} = require("../controllers/auditController");

const router = express.Router();

router.get("/", getAudits);
router.get("/:id", getAudit);
router.post("/", createAudit);
router.patch("/:id", updateAudit);
router.put("/:id", updateAudit);
router.delete("/:id", deleteAudit);

module.exports = router;
