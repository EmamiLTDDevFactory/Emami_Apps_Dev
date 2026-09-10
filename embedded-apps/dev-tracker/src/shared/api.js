import { API_BASE, ACCESS_API_BASE, HUB_EMAIL_STORAGE_KEY } from './constants.js';

// Reads the hub's logged-in user email straight out of localStorage. Dev Tracker is
// served same-origin under /apps/dev-tracker (not in an iframe/WebView), so it shares
// the hub shell's localStorage exactly like the original app did.
export function getCurrentUserEmail() {
  try {
    return localStorage.getItem(HUB_EMAIL_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}
export function getLoginMethod() {
  try {
    return localStorage.getItem('emami_apps_login_method');
  } catch {
    return null;
  }
}

async function json(res) {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

// --- Items -----------------------------------------------------------
export async function apiList() {
  return json(await fetch(`${API_BASE}/items`));
}
export async function apiHistory(id) {
  return json(await fetch(`${API_BASE}/items/${id}/history`));
}
export async function apiCreate(fields, email) {
  return json(
    await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': email || '' },
      body: JSON.stringify(fields),
    })
  );
}
export async function apiUpdate(id, fields, email) {
  return json(
    await fetch(`${API_BASE}/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': email || '' },
      body: JSON.stringify(fields),
    })
  );
}
export async function apiDelete(id) {
  // Matches the original exactly: no X-User-Email header sent on delete.
  return json(await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE' }));
}

// --- Master data -------------------------------------------------------
export async function apiMasterData() {
  return json(await fetch(`${API_BASE}/master-data`));
}
export async function apiMasterDataCreate(payload, email) {
  return json(
    await fetch(`${API_BASE}/master-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': email || '' },
      body: JSON.stringify(payload),
    })
  );
}
export async function apiMasterDataUpdate(id, payload, email) {
  return json(
    await fetch(`${API_BASE}/master-data/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': email || '' },
      body: JSON.stringify(payload),
    })
  );
}

// --- Activity / AI -----------------------------------------------------
export async function apiActivity() {
  return json(await fetch(`${API_BASE}/activity`));
}
export async function apiAiCommand(message) {
  return json(
    await fetch(`${API_BASE}/ai/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
  );
}

// --- Hub identity / access ----------------------------------------------
export async function apiMe(email) {
  if (!email) return null;
  try {
    const res = await fetch(`${ACCESS_API_BASE}/me?email=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
export async function apiAccessMe(email) {
  if (!email) return null;
  try {
    const res = await fetch(`${ACCESS_API_BASE}/access/me?email=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
export async function isDevTrackerAdmin(email) {
  const data = await apiAccessMe(email);
  return !!data?.success && Array.isArray(data.apps) && data.apps.some((a) => a.appId === 'dev-tracker' && a.role === 'Admin');
}
