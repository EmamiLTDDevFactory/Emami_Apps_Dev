const express = require("express");
const {
  getNotifications,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} = require("../controllers/notificationController");

const actorCheck = require("../middleware/actorCheck");

const router = express.Router();

// ?userId= is the viewer's own id (src/utils/notifications.js). Log-only; the POST body's userId
// is the notification's recipient, so it is deliberately not checked.
const viewerCheck = actorCheck("/api/notifications", ["query.userId"]);

router.get("/", viewerCheck, getNotifications);
router.post("/", createNotification);
router.patch("/read-all", viewerCheck, markAllNotificationsAsRead);
router.patch("/:id/read", markNotificationAsRead);

module.exports = router;
