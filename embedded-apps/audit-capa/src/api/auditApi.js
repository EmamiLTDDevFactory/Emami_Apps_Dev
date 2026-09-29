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
import { withChecklistCompliance } from "../utils/complianceUtils";

export const getAudits = () =>
    apiGet("/audits").then((audits) =>
        Array.isArray(audits) ? audits.map(withChecklistCompliance) : audits
    );

export const getAuditById = (id) =>
    apiGet(`/audits/${id}`).then(withChecklistCompliance);

export const createAudit = (audit) =>
    apiPost("/audits", audit).then(withChecklistCompliance);

export const updateAudit = (
    id,
    changes
) =>
    apiPatch(
        `/audits/${id}`,
        changes
    ).then(withChecklistCompliance);

export const deleteAudit = (id) =>
    apiDelete(`/audits/${id}`);