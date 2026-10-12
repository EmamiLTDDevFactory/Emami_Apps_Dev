const express = require("express");

const { login } = require("../controllers/authController");
const rateLimit = require("../middleware/rateLimit");

const router = express.Router();

// Generous on purpose — behind nginx every caller can share one bucket (see middleware/rateLimit.js).
// Log-only unless ENFORCE_AUTH=on.
const loginLimiter = rateLimit({
  name: "POST /api/auth/login",
  windowMs: 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_PER_MIN) || 60
});

router.post("/login", loginLimiter, login);

module.exports = router;