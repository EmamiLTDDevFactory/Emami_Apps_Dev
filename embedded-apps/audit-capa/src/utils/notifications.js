import {
  apiGet,
  apiPatch,
  apiPost,
} from "../api/client";

export const getNotifications = (role) =>
  apiGet(
    role
      ? `/notifications?role=${encodeURIComponent(role)}`
      : "/notifications"
  );

export const addNotification = (notification) =>
  apiPost("/notifications", {
    ...notification,
    id: Date.now(),
    createdOn: new Date().toLocaleString(),
    read: false,
    ...notification,
  });

export const markAsRead = (id) =>
  apiPatch(`/notifications/${id}/read`, {});
