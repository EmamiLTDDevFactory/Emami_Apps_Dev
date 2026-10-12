const express = require("express");

const { getAuditors } = require("../models/userModel");

const router = express.Router();

// Auditor dropdown on Create / Edit Audit.
router.get("/auditors", async (req, res) => {
  try {
    res.json(await getAuditors());
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load auditors" });
  }
});

module.exports = router;
