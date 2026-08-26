const express = require("express");
const {
  getNotifications,
  createNotification,
  markNotificationAsRead,
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/", getNotifications);
router.post("/", createNotification);
router.patch("/:id/read", markNotificationAsRead);

module.exports = router;
