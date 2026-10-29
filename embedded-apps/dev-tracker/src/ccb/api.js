import { ACCESS_API_BASE } from '../shared/constants.js';

// Client for the Change Control Board routes (backend/changeControl.js, mounted at
// /api/change-control). Same host and dev/prod split as the rest of Dev Tracker (ACCESS_API_BASE),
// and the same hub session token as Bearer — the server takes the caller's identity and CCB roles
// from that token, never from anything this page claims.
const BASE = `${ACCESS_API_BASE}/change-control`;
const HUB_TOKEN_STORAGE_KEY = 'emami_apps_session_token';

export class CcbError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(path, { method = 'GET', body } = {}) {
  let token = null;
  try { token = localStorage.getItem(HUB_TOKEN_STORAGE_KEY); } catch { /* storage blocked */ }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new CcbError('Could not reach the server. Check your connection and try again.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok || !data?.success) throw new CcbError(data?.error || `Something went wrong (${res.status}). Please try again.`, res.status);
  return data;
}

export const ccbApi = {
  me: () => call('/me'),
  people: (role) => call(role ? `/people?role=${encodeURIComponent(role)}` : '/people'),
  overview: () => call('/overview'),
  requests: () => call('/requests'),
  request: (key) => call(`/requests/${encodeURIComponent(key)}`),
  createRequest: (fields, intent) => call('/requests', { method: 'POST', body: { ...fields, intent } }),
  updateRequest: (id, fields) => call(`/requests/${id}`, { method: 'PUT', body: fields }),
  act: (id, action, extra = {}) => call(`/requests/${id}/actions`, { method: 'POST', body: { action, ...extra } }),
  comment: (id, body) => call(`/requests/${id}/comments`, { method: 'POST', body: { body } }),
  meetings: () => call('/meetings'),
  meeting: (id) => call(`/meetings/${id}`),
  scheduleMeeting: (fields) => call('/meetings', { method: 'POST', body: fields }),
  updateMeeting: (id, fields) => call(`/meetings/${id}`, { method: 'PUT', body: fields }),
  refreshAgenda: (id) => call(`/meetings/${id}/agenda/refresh`, { method: 'POST', body: {} }),
  removeAgendaItem: (id, itemId) => call(`/meetings/${id}/items/${itemId}`, { method: 'DELETE' }),
  startMeeting: (id) => call(`/meetings/${id}/start`, { method: 'POST', body: {} }),
  setAttendance: (id, email, present) => call(`/meetings/${id}/attendance`, { method: 'PUT', body: { email, present } }),
  decide: (id, itemId, decision, notes) => call(`/meetings/${id}/items/${itemId}/decision`, { method: 'POST', body: { decision, notes } }),
  completeMeeting: (id, minutes) => call(`/meetings/${id}/complete`, { method: 'POST', body: { minutes } }),
  cancelMeeting: (id, note) => call(`/meetings/${id}/cancel`, { method: 'POST', body: { note } }),
  syncTeams: (id) => call(`/meetings/${id}/teams`, { method: 'POST', body: {} }),
  roles: () => call('/roles'),
  saveSettings: (fields) => call('/settings', { method: 'PUT', body: fields }),
  reviewItem: (id, itemId, position, note) => call(`/meetings/${id}/items/${itemId}/review`, { method: 'PUT', body: { position, note } }),
  actions: () => call('/actions'),
  addAction: (fields) => call('/actions', { method: 'POST', body: fields }),
  updateAction: (id, fields) => call(`/actions/${id}`, { method: 'PUT', body: fields }),
  insights: () => call('/insights'),
};

// Supporting documents on a request (backend: /requests/:id/attachments). Mirrors the server's checks so a
// wrong file is refused before it is sent.
export const ATTACHMENT_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'msg', 'eml', 'zip', 'vsdx'];
export const ATTACHMENT_MAX_MB = 8;
export function attachmentProblem(file) {
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] || '').toLowerCase();
  if (!ATTACHMENT_EXTS.includes(ext)) return `${file.name}: this file type is not allowed.`;
  if (file.size > ATTACHMENT_MAX_MB * 1024 * 1024) return `${file.name} is larger than ${ATTACHMENT_MAX_MB} MB.`;
  if (!file.size) return `${file.name} is empty.`;
  return null;
}

function authHeader() {
  let token = null;
  try { token = localStorage.getItem(HUB_TOKEN_STORAGE_KEY); } catch { /* storage blocked */ }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadAttachment(requestId, file) {
  let res;
  try {
    res = await fetch(`${BASE}/requests/${requestId}/attachments?name=${encodeURIComponent(file.name)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...authHeader() }, body: file,
    });
  } catch {
    throw new CcbError(`Could not upload ${file.name}. Check your connection and try again.`, 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new CcbError(data?.error || (res.status === 413 ? `${file.name} is too large.` : `Could not upload ${file.name} (${res.status}).`), res.status);
  return data.attachment;
}

/** Fetches the file with the session token and hands it to the browser as a download. */
export async function downloadAttachment(requestId, a) {
  const res = await fetch(`${BASE}/requests/${requestId}/attachments/${a.id}`, { headers: authHeader() }).catch(() => null);
  if (!res || !res.ok) throw new CcbError('Could not download the document.', res?.status || 0);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = a.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const removeAttachment = (requestId, attId) => call(`/requests/${requestId}/attachments/${attId}`, { method: 'DELETE' });

/** People search over active Emami Apps users (Admin Center), names from Entra ID — backend/orgProfile.js. */
export async function searchDirectory(q) {
  let token = null;
  try { token = localStorage.getItem(HUB_TOKEN_STORAGE_KEY); } catch { /* storage blocked */ }
  const res = await fetch(`${ACCESS_API_BASE}/me/directory-search?q=${encodeURIComponent(q)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new CcbError(data?.error || 'Could not search the directory.', res.status);
  return data;
}
