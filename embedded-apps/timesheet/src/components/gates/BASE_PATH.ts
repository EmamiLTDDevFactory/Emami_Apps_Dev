// next/link's `href` and next/navigation's router both auto-prepend next.config.js's basePath —
// so nav hrefs/router.push calls throughout this app are written WITHOUT it. Plain <img>/<a> tags
// get no such help, so this constant spells it out for those, matching fm-po-deviation's Shell.tsx
// convention.
export const BASE_PATH = '/apps/timesheet';
