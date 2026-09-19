import { API_BASE, ACCESS_API_BASE, HUB_EMAIL_STORAGE_KEY } from './constants.js';

// Reads the hub's logged-in user email straight out of localStorage. Dev Tracker is
// served same-origin under /apps/dev-tracker (not in an iframe/WebView), so it shares
// the hub shell's localStorage exactly like the original app did.
//
// The `?devEmail=` override only exists so `npm run dev` can be previewed standalone,
// outside the hub shell that would normally have already set this key — every page here
// redirects to '/' the instant it finds no email, so there's no other in-app moment to set
// it by hand. Gated on import.meta.env.DEV, which Vite statically replaces with `false` in
// `vite build`, so this whole branch is dead code (and stripped) in the real production build.
export function getCurrentUserEmail() {
  try {
    if (import.meta.env.DEV) {
      const devEmail = new URLSearchParams(window.location.search).get('devEmail');
      if (devEmail) {
        localStorage.setItem(HUB_EMAIL_STORAGE_KEY, devEmail);
        return devEmail;
      }
    }
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
export async function apiList(email) {
  return json(await fetch(`${API_BASE}/items`, { headers: { 'X-User-Email': email || '' } }));
}
export async function apiHistory(id, email) {
  return json(await fetch(`${API_BASE}/items/${id}/history`, { headers: { 'X-User-Email': email || '' } }));
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
export async function apiDelete(id, email) {
  return json(await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE', headers: { 'X-User-Email': email || '' } }));
}

// --- Master data -------------------------------------------------------
export async function apiMasterData(email) {
  return json(await fetch(`${API_BASE}/master-data`, { headers: { 'X-User-Email': email || '' } }));
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

// --- Import Center -------------------------------------------------------
export async function apiImportList(email) {
  return json(await fetch(`${API_BASE}/import-center/imports`, { headers: { 'X-User-Email': email || '' } }));
}
export async function apiImportRun(fileName, rows, email) {
  return json(
    await fetch(`${API_BASE}/import-center/imports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': email || '' },
      body: JSON.stringify({ fileName, rows }),
    })
  );
}
export async function apiImportDelete(id, email) {
  return json(await fetch(`${API_BASE}/import-center/imports/${id}`, { method: 'DELETE', headers: { 'X-User-Email': email || '' } }));
}

// --- Activity / AI -----------------------------------------------------
export async function apiActivity(email) {
  return json(await fetch(`${API_BASE}/activity`, { headers: { 'X-User-Email': email || '' } }));
}
export async function apiAiCommand(message, email) {
  return json(
    await fetch(`${API_BASE}/ai/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': email || '' },
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
