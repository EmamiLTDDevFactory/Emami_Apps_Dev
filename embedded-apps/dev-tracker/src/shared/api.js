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

// --- Saved views ---------------------------------------------------------
export async function apiSavedViews(email) {
  return json(await fetch(`${API_BASE}/saved-views`, { headers: { 'X-User-Email': email || '' } }));
}
export async function apiSavedViewCreate(name, config, shared, email) {
  return json(
    await fetch(`${API_BASE}/saved-views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': email || '' },
      body: JSON.stringify({ name, config, shared }),
    })
  );
}
export async function apiSavedViewUpdate(id, patch, email) {
  return json(
    await fetch(`${API_BASE}/saved-views/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': email || '' },
      body: JSON.stringify(patch),
    })
  );
}
export async function apiSavedViewDelete(id, email) {
  return json(await fetch(`${API_BASE}/saved-views/${id}`, { method: 'DELETE', headers: { 'X-User-Email': email || '' } }));
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
// Sample rows shown by apiActivityLog below only in `npm run dev`, only until the deployed
// API grows the /activity/log route this hits (see backend/devTracker.js) — lets the Change
// Log page be previewed standalone before that ships. Dead code (and stripped) in the real
// production build, same reasoning as getCurrentUserEmail's devEmail override.
function buildDummyActivityLog() {
  const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
  const items = {
    mm: { itemId: 'demo-mm', devList: 'SAP MM — Vendor Master Automation', area: 'MM' },
    sd: { itemId: 'demo-sd', devList: 'SD Pricing Procedure Update', area: 'SD' },
    ar: { itemId: 'demo-ar', devList: 'FI-AR Credit Memo Workflow', area: 'FI-AR' },
    wm: { itemId: 'demo-wm', devList: 'WM Bin Replenishment Fix', area: 'WM' },
    pp: { itemId: 'demo-pp', devList: 'PP Production Order Enhancement', area: 'PP' },
    cf: { itemId: 'demo-cf', devList: 'Cross-Functional SSO Integration', area: 'Cross-Functional' },
  };
  const rows = [
    { item: items.mm, field: '__created__', oldValue: null, newValue: items.mm.devList, by: 'Priya Sharma', status: 'Not Started', hours: 720 },
    { item: items.mm, field: 'status', oldValue: 'Not Started', newValue: 'Requirement Discussion', by: 'Priya Sharma', status: 'Requirement Discussion', hours: 692 },
    { item: items.mm, field: 'spocIT', oldValue: '', newValue: 'Rahul Verma', by: 'Priya Sharma', status: 'Requirement Discussion', hours: 690 },
    { item: items.mm, field: 'status', oldValue: 'Requirement Discussion', newValue: 'FS Preparation', by: 'Rahul Verma', status: 'FS Preparation', hours: 610 },
    { item: items.mm, field: 'targetDate', oldValue: '2026-08-15', newValue: '2026-09-01', by: 'Rahul Verma', status: 'FS Preparation', hours: 540 },
    { item: items.sd, field: '__created__', oldValue: null, newValue: items.sd.devList, by: 'Admin User', status: 'Not Started', hours: 500 },
    { item: items.sd, field: 'priority', oldValue: 'P3', newValue: 'P1', by: 'Admin User', status: 'Not Started', hours: 498 },
    { item: items.sd, field: 'status', oldValue: 'Not Started', newValue: 'In Progress', by: 'Neha Kulkarni', status: 'In Progress', hours: 420 },
    { item: items.sd, field: 'developer', oldValue: '', newValue: 'Neha Kulkarni', by: 'Admin User', status: 'In Progress', hours: 419 },
    { item: items.ar, field: '__created__', oldValue: null, newValue: items.ar.devList, by: 'Rahul Verma', status: 'Not Started', hours: 380 },
    { item: items.ar, field: 'complexity', oldValue: 'Low', newValue: 'High', by: 'Rahul Verma', status: 'Not Started', hours: 378 },
    { item: items.ar, field: 'status', oldValue: 'Not Started', newValue: 'Requirement Discussion', by: 'Rahul Verma', status: 'Requirement Discussion', hours: 340 },
    { item: items.ar, field: 'reasonDelay', oldValue: '', newValue: 'Waiting on vendor sign-off', by: 'Priya Sharma', status: 'On Hold', hours: 300 },
    { item: items.ar, field: 'status', oldValue: 'Requirement Discussion', newValue: 'On Hold', by: 'Priya Sharma', status: 'On Hold', hours: 300 },
    { item: items.wm, field: '__created__', oldValue: null, newValue: items.wm.devList, by: 'Neha Kulkarni', status: 'In Progress', hours: 260 },
    { item: items.wm, field: 'status', oldValue: 'Not Started', newValue: 'In Progress', by: 'Neha Kulkarni', status: 'In Progress', hours: 258 },
    { item: items.wm, field: 'devFactory', oldValue: 'Offshore Team', newValue: 'Onsite Team', by: 'Admin User', status: 'In Progress', hours: 200 },
    { item: items.wm, field: 'status', oldValue: 'In Progress', newValue: 'IT Testing', by: 'Neha Kulkarni', status: 'IT Testing', hours: 96 },
    { item: items.pp, field: '__created__', oldValue: null, newValue: items.pp.devList, by: 'Rahul Verma', status: 'Not Started', hours: 72 },
    { item: items.pp, field: 'impact', oldValue: 'Medium', newValue: 'High', by: 'Rahul Verma', status: 'Not Started', hours: 70 },
    { item: items.cf, field: 'status', oldValue: 'User Testing', newValue: 'Hypercare', by: 'Admin User', status: 'Hypercare', hours: 48 },
    { item: items.cf, field: 'hypercareDate', oldValue: '', newValue: '2026-09-18', by: 'Admin User', status: 'Hypercare', hours: 48 },
    { item: items.cf, field: 'remarks', oldValue: 'Monitoring post go-live', newValue: 'No incidents in first 48h', by: 'Priya Sharma', status: 'Hypercare', hours: 6 },
    { item: items.sd, field: 'status', oldValue: 'In Progress', newValue: 'Completed', by: 'Neha Kulkarni', status: 'Completed', hours: 2 },
  ];
  return rows.map((r, i) => ({
    id: `demo-${i}`,
    itemId: r.item.itemId,
    field: r.field,
    oldValue: r.oldValue,
    newValue: r.newValue,
    changedAt: hoursAgo(r.hours),
    changedByUsername: r.by,
    devList: r.item.devList,
    area: r.item.area,
    status: r.status,
  }));
}
export async function apiActivityLog(email) {
  try {
    return await json(await fetch(`${API_BASE}/activity/log`, { headers: { 'X-User-Email': email || '' } }));
  } catch (err) {
    if (import.meta.env.DEV) return buildDummyActivityLog();
    throw err;
  }
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

// --- Project management (comments, sprints) ------------------------------
// Both 404 on an API that predates these routes; callers treat that as "feature not deployed
// yet" (see useWorkspaceData's pmReady) rather than an error.
function withJson(method, body, email) {
  return {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Email': email || '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
export async function apiComments(itemId, email) {
  return json(await fetch(`${API_BASE}/items/${itemId}/comments`, { headers: { 'X-User-Email': email || '' } }));
}
export async function apiCommentCreate(itemId, body, email) {
  return json(await fetch(`${API_BASE}/items/${itemId}/comments`, withJson('POST', { body }, email)));
}
export async function apiCommentUpdate(id, body, email) {
  return json(await fetch(`${API_BASE}/comments/${id}`, withJson('PUT', { body }, email)));
}
export async function apiCommentDelete(id, email) {
  return json(await fetch(`${API_BASE}/comments/${id}`, { method: 'DELETE', headers: { 'X-User-Email': email || '' } }));
}
export async function apiSprints(email) {
  return json(await fetch(`${API_BASE}/sprints`, { headers: { 'X-User-Email': email || '' } }));
}
export async function apiSprintCreate(fields, email) {
  return json(await fetch(`${API_BASE}/sprints`, withJson('POST', fields, email)));
}
export async function apiSprintUpdate(id, fields, email) {
  return json(await fetch(`${API_BASE}/sprints/${id}`, withJson('PUT', fields, email)));
}
export async function apiSprintStart(id, fields, email) {
  return json(await fetch(`${API_BASE}/sprints/${id}/start`, withJson('POST', fields, email)));
}
export async function apiSprintComplete(id, moveTo, email) {
  return json(await fetch(`${API_BASE}/sprints/${id}/complete`, withJson('POST', { moveTo }, email)));
}
export async function apiSprintDelete(id, email) {
  return json(await fetch(`${API_BASE}/sprints/${id}`, { method: 'DELETE', headers: { 'X-User-Email': email || '' } }));
}
