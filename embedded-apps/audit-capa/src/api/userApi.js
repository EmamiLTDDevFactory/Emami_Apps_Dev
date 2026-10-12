import { apiGet } from "./client";

// Active CQA auditors (users flagged is_auditor) for the Auditor dropdown.
export const getAuditors = () => apiGet("/users/auditors");
