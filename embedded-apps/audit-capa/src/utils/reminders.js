import { getCAPAs } from "./storage";
import {
  addNotification,
  getNotifications,
} from "./notifications";

// App.js runs this on every page load, for every user — without a throttle it
// re-checks (and previously re-created) reminders on every single refresh.
// Only actually run once per calendar day per browser.
const LAST_RUN_KEY = "lastReminderRunDate";

export const generateDueDateReminders = async () => {
  const today = new Date();
  const todayKey = today.toDateString();

  if (localStorage.getItem(LAST_RUN_KEY) === todayKey) {
    return;
  }

  localStorage.setItem(LAST_RUN_KEY, todayKey);

  // getAllNotifications always filters by role server-side — passing none
  // returns zero rows, which is why the dedupe check below could never see
  // an existing reminder. These are always created with role "Depot".
  const [capaRecords, notifications] = await Promise.all([
    getCAPAs(),
    getNotifications("Depot"),
  ]);

  for (const capa of capaRecords) {
    if (capa.status === "Closed" || !capa.targetDate) {
      continue;
    }

    const targetDate = new Date(capa.targetDate);
    const diffDays = Math.ceil(
      (targetDate - today) / (1000 * 60 * 60 * 24)
    );

    const alreadyExists = notifications.some(
      (notification) =>
        notification.type === "Reminder" &&
        notification.capaId === capa.id
    );

    if (diffDays <= 2 && diffDays >= 0 && !alreadyExists) {
      await addNotification({
        type: "Reminder",
        capaId: capa.id,
        role: "Depot",
        auditId: capa.auditId,
        title: "CAPA Closure Reminder",
        message: `CAPA ${capa.capaNo} is due on ${capa.targetDate}`,
        link: `/capa/${capa.auditId}`,
      });
    }
  }
};
