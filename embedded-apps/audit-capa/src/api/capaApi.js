import {
    apiGet,
    apiPost,
    apiPatch
} from "./client";

export const getCAPAs = (
    auditId
) =>
    apiGet(
        `/capas?auditId=${auditId}`
    );

export const createCAPAs = (
    capas
) =>
    apiPost(
        "/capas",
        capas
    );

export const updateCAPA = (
    id,
    changes
) =>
    apiPatch(
        `/capas/${id}`,
        changes
    );