const express = require("express");
const { notifySap } = require("../controllers/sapNotifyController");

const router = express.Router();

router.post("/", notifySap);

module.exports = router;
