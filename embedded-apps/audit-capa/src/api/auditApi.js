// import axios from "axios";

// export const getAuditById = async (id) => {
//     const response = await axios.get(`/api/audits/${id}`);
//     return response.data;
// };

// export const updateAudit = async (id, data) => {
//     const response = await axios.put(
//         `/api/audits/${id}`,
//         data
//     );

//     return response.data;
// };


import {
    apiGet,
    apiPost,
    apiPatch,
    apiDelete
} from "./client";

export const getAudits = () =>
    apiGet("/audits");

export const getAuditById = (id) =>
    apiGet(`/audits/${id}`);

export const createAudit = (audit) =>
    apiPost("/audits", audit);

export const updateAudit = (
    id,
    changes
) =>
    apiPatch(
        `/audits/${id}`,
        changes
    );

export const deleteAudit = (id) =>
    apiDelete(`/audits/${id}`);