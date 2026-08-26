import { getCAPAs } from "./storage";
import {
  addNotification,
  getNotifications,
} from "./notifications";

export const generateDueDateReminders = async () => {
  const [capaRecords, notifications] = await Promise.all([
    getCAPAs(),
    getNotifications(),
  ]);

  const today = new Date();

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
