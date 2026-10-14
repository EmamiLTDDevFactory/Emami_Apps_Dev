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
  people: () => call('/people'),
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
