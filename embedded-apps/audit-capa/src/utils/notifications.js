import {
  apiGet,
  apiPatch,
  apiPost,
} from "../api/client";

const buildQuery = (role, userId) => {
  const params = new URLSearchParams();

  if (role) params.set("role", role);
  if (userId) params.set("userId", userId);

  const qs = params.toString();

  return qs ? `?${qs}` : "";
};

// `userId` only narrows the feed for Depot (a per-depot-user inbox) — CQA
// stays a shared, role-wide feed regardless of which CQA user asks.
export const getNotifications = (role, userId) =>
  apiGet(`/notifications${buildQuery(role, userId)}`);

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

export const markAllAsRead = (role, userId) =>
  apiPatch(`/notifications/read-all${buildQuery(role, userId)}`, {});
