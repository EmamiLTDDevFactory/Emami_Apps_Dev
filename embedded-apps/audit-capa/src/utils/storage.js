import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  API_ORIGIN,
  getAuthHeader,
} from "../api/client";
import { withChecklistCompliance } from "./complianceUtils";

export const getAudits = () =>
  apiGet("/audits").then((audits) =>
    Array.isArray(audits) ? audits.map(withChecklistCompliance) : audits
  );

export const getAudit = (auditId) =>
  apiGet(`/audits/${auditId}`).then(withChecklistCompliance);

export const createAudit = (audit) =>
  apiPost("/audits", audit).then(withChecklistCompliance);

export const updateAudit = (auditId, changes) =>
  apiPatch(`/audits/${auditId}`, changes).then(withChecklistCompliance);

export const deleteAudit = (auditId) =>
  apiDelete(`/audits/${auditId}`);

// Soft on/off switch (CQA). Deactivated audits stay visible, greyed and read-only.
export const deactivateAudit = (auditId, reason, by = "") =>
  apiPatch(`/audits/${auditId}/deactivate`, { reason, by }).then(
    withChecklistCompliance
  );

export const activateAudit = (auditId, by = "") =>
  apiPatch(`/audits/${auditId}/activate`, { by }).then(
    withChecklistCompliance
  );

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

// Soft cancel of an added CAPA (status "Cancelled"; never deleted).
export const cancelCAPA = (capaId, cancelledBy = "") =>
  apiPatch(`/capas/${capaId}/cancel`, { cancelledBy });

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

// Evidence upload shared by CAPA and checklist: one request, many files
// (multipart field "evidence"). Backend caps at 10 files / 10 MB each.
const postEvidenceFiles = async (url, files, fields) => {

  const list = Array.from(files || []);

  if (list.length === 0) {
    throw new Error(
      "Evidence file is required."
    );
  }

  const formData = new FormData();

  list.forEach((file) =>
    formData.append("evidence", file)
  );

  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value);
    }
  });

  const response = await fetch(url, {
    method: "POST",
    // Auth header only — no Content-Type, so the browser sets the multipart boundary itself.
    headers: getAuthHeader(),
    body: formData
  });

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

// Accepts a single File or a list of Files; returns the updated CAPA
// (with its full evidenceFiles list).
export const uploadCAPAEvidence = (
  capaId,
  files,
  uploadedBy = "Depot"
) =>
  postEvidenceFiles(
    `${API_ORIGIN}/api/capas/${capaId}/evidence`,
    files instanceof File ? [files] : files,
    { uploadedBy }
  );

// Soft remove: hidden from the list, the file itself is kept on the server.
export const removeCAPAEvidence = (
  capaId,
  fileId,
  removedBy = ""
) =>
  apiPatch(
    `/capas/${capaId}/evidence/${encodeURIComponent(fileId)}/remove`,
    { removedBy }
  );

// Stores the files and returns their metadata, to be kept on the checklist
// question (item.evidences) and saved with the audit's checklist.
export const uploadChecklistEvidence = (
  auditId,
  questionId,
  files,
  uploadedBy = "CQA"
) =>
  postEvidenceFiles(
    `${API_ORIGIN}/api/audits/${auditId}/checklist-evidence`,
    files,
    { questionId, uploadedBy }
  );

// Active (not removed) evidence files of a checklist question. Questions saved
// before multi-evidence may carry a single `evidence` object; only one that was
// really stored on the server (has a filePath) is shown.
export const getChecklistEvidences = (item) => {
  if (Array.isArray(item?.evidences)) {
    return item.evidences.filter((file) => !file.removed);
  }

  return item?.evidence?.filePath ? [item.evidence] : [];
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
