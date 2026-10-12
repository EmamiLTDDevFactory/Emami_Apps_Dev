import { apiGet } from "./client";

// Active CQA auditors (users flagged is_auditor) for the Auditor dropdown.
export const getAuditors = () => apiGet("/users/auditors");

// Depots that have an active Depot user, for the Depot dropdown.
export const getDepots = () => apiGet("/users/depots");
