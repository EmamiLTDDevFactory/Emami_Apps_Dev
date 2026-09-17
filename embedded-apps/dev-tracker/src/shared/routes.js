// Extensionless "folder" style routes, matching every hardcoded <a href>/redirect target
// in the original app (home.js's AI-bar handoff, admin.js's non-admin redirect, every
// page's back-link) so nothing that links into Dev Tracker from outside needs to change.
export const BASE_PATH = '/apps/dev-tracker';
export const ROUTES = {
  home: BASE_PATH,
  // Trailing slash matters: each of these is its own on-disk directory
  // (dashboard/index.html, etc.) — without it, Vite's dev server falls back
  // to serving the Home bundle instead of the requested page (production's
  // static server redirects to add the slash, but dev doesn't).
  dashboard: `${BASE_PATH}/dashboard/`,
  admin: `${BASE_PATH}/admin/`,
  resourceUtilization: `${BASE_PATH}/resource-utilization/`,
  qaSupport: `${BASE_PATH}/qa-support/`,
  evaluation: `${BASE_PATH}/evaluation/`,
  importCenter: `${BASE_PATH}/import-center/`,
  settings: `${BASE_PATH}/settings/`,
};
