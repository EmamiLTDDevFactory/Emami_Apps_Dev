// Extensionless "folder" style routes, matching every hardcoded <a href>/redirect target
// in the original app (home.js's AI-bar handoff, admin.js's non-admin redirect, every
// page's back-link) so nothing that links into Dev Tracker from outside needs to change.
export const BASE_PATH = '/apps/dev-tracker';
export const ROUTES = {
  home: BASE_PATH,
  dashboard: `${BASE_PATH}/dashboard`,
  admin: `${BASE_PATH}/admin`,
  resourceUtilization: `${BASE_PATH}/resource-utilization`,
};
