// Extensionless "folder" style routes, matching every hardcoded <a href>/redirect target
// in the original app (home.js's AI-bar handoff, admin.js's non-admin redirect, every
// page's back-link) so nothing that links into Dev Tracker from outside needs to change.
export const BASE_PATH = '/apps/dev-tracker';
export const ROUTES = {
  // Trailing slash matters here too: without it, Vite's dev server treats this as
  // outside its configured base and serves its "did you mean /apps/dev-tracker/"
  // notice instead of Home (production's static server redirects to add the slash,
  // but dev doesn't).
  home: `${BASE_PATH}/`,
  // Same reasoning — each of these is its own on-disk directory (dashboard/index.html,
  // etc.) — without the trailing slash, Vite's dev server falls back to serving the
  // Home bundle instead of the requested page.
  dashboard: `${BASE_PATH}/dashboard/`,
  admin: `${BASE_PATH}/admin/`,
  resourceUtilization: `${BASE_PATH}/resource-utilization/`,
  qaSupport: `${BASE_PATH}/qa-support/`,
  // Not its own page — the Dashboard filtered to the signed-in person's items (see the
  // ?preset= handoff it reads). Kept here so the sidebar links to one place rather than
  // hard-coding the query string.
  myWork: `${BASE_PATH}/dashboard/?preset=mine#list`,
  // Project workspace views (Jira-style) — all the same page, switched by hash.
  board: `${BASE_PATH}/dashboard/#board`,
  backlog: `${BASE_PATH}/dashboard/#backlog`,
  issues: `${BASE_PATH}/dashboard/#list`,
  timeline: `${BASE_PATH}/dashboard/#timeline`,
  reports: `${BASE_PATH}/dashboard/#reports`,
  changeLog: `${BASE_PATH}/change-log/`,
  importCenter: `${BASE_PATH}/import-center/`,
  settings: `${BASE_PATH}/settings/`,
};
