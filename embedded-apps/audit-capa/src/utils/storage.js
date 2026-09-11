import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  API_ORIGIN,
} from "../api/client";

export const getAudits = () =>
  apiGet("/audits");

export const getAudit = (auditId) =>
  apiGet(`/audits/${auditId}`);

export const createAudit = (audit) =>
  apiPost("/audits", audit);

export const updateAudit = (auditId, changes) =>
  apiPatch(`/audits/${auditId}`, changes);

export const deleteAudit = (auditId) =>
  apiDelete(`/audits/${auditId}`);

export const saveAudits = async (audits) => {
  const currentAudits = await getAudits();
  const currentById = new Map(
    currentAudits.map((audit) => [String(audit.id), audit])
  );
  const incomingIds = new Set(
    audits.map((audit) => String(audit.id))
  );

  const results = await Promise.all(
    audits.map((audit) =>
      currentById.has(String(audit.id))
        ? updateAudit(audit.id, audit)
        : createAudit(audit)
    )
  );

  await Promise.all(
    currentAudits
      .filter((audit) => !incomingIds.has(String(audit.id)))
      .map((audit) => deleteAudit(audit.id))
  );

  return results;
};

export const getCAPAs = (auditId) =>
  apiGet(
    auditId === undefined
      ? "/capas"
      : `/capas?auditId=${encodeURIComponent(auditId)}`
  );

export const createCAPAs = (capas) =>
  apiPost("/capas", capas);

export const updateCAPA = (capaId, changes) =>
  apiPatch(`/capas/${capaId}`, changes);

// Used when a self-assessment is sent back for rework — the CAPAs auto-
// generated from that (now-superseded) submission need clearing so the
// resubmission isn't blocked by the "already submitted" guard, and so a
// clean set gets generated from the corrected checklist.
export const deleteCAPAsForAudit = (auditId) =>
  apiDelete(`/capas?auditId=${auditId}`);

// Kept with the old function name so the existing UI can be migrated
// without changing CAPA business logic all at once.
// export const saveCAPAs = (capas) =>
//   apiPut("/capas/sync", capas);
export const saveCAPAs = (capas) =>
  apiPost("/capas", capas);


// Checklist drafts are now stored as part of the audit record.
export const saveChecklistDraft = (auditId, checklist) =>
  updateAudit(auditId, { checklist });

export const getChecklistDraft = async (auditId) => {
  const audit = await getAudit(auditId);
  return audit?.checklist || null;
};

export const uploadCAPAEvidence = async (
  capaId,
  file,
  uploadedBy = "Depot"
) => {

  if (!file) {
    throw new Error(
      "Evidence file is required."
    );
  }

  const formData = new FormData();

  formData.append(
    "evidence",
    file
  );

  formData.append(
    "uploadedBy",
    uploadedBy
  );

  const response = await fetch(
    `${API_ORIGIN}/api/capas/${capaId}/evidence`,
    {
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) {

    const error =
      await response.json()
        .catch(() => ({}));

    throw new Error(
      error.message ||
      "Unable to upload evidence."
    );
  }

  return response.json();
};

export const getEvidenceUrl = (filePath) => {
  if (!filePath) {
    return null;
  }

  // Already a complete URL
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  // Backend serves /uploads as static files
  return `${API_ORIGIN}${filePath}`;
};

export const downloadCAPAEvidence = async (
  filePath,
  fileName
) => {
  if (!filePath) {
    throw new Error("Evidence file is not available.");
  }

  const response = await fetch(
    `${API_ORIGIN}${filePath}`
  );

  if (!response.ok) {
    throw new Error("Unable to download evidence.");
  }

  const blob = await response.blob();

  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "evidence";

  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
};
