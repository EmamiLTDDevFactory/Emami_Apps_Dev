import {
    apiGet,
    apiPost,
    apiPatch
} from "./client";

export const getNotifications = (
    role
) =>
    apiGet(
        `/notifications?role=${role}`
    );

export const createNotification =
    (notification) =>
        apiPost(
            "/notifications",
            notification
        );

export const markAsRead = (id) =>
    apiPatch(
        `/notifications/${id}/read`
    );
