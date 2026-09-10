// Reuses the exact same "catch who's Admin / who's User" pattern every other EmamiApps embedded
// app already uses to read Manage Access (see the hub's embedded-apps/dev-tracker/public/admin.js
// checkAdminAccess, and embedded-apps/rc-portal/src/lib/hubEmailLogin.js) - not a new mechanism.

const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email'

// The EmamiApps hub's own Manage Access backend (see its backend/server.js). This app is
// currently only deployed on the Emami_Apps_Dev environment, so this points at the dev-pointed
// hub backend (port 4001/Devhubfactory, proxied under /dev-api/) rather than the prod one -
// otherwise every Manage Access grant made on Emami_Apps_Dev (e.g. Admin for 'timesheet') would
// be invisible here, since prod and dev keep entirely separate Manage Access data (see
// project_dev_prod_backend_split in the hub repo). Update this if/when this app is ever also
// deployed to the prod hub.
const HUB_ACCESS_API_BASE = 'https://audit-capa-api.emamiapps.in/dev-api/api'

// The id this app is registered under on the hub (src/data/mockData.ts's RAW_APPS/EMBEDDED_APP_URLS).
const APP_ID = 'timesheet'

/** Reads the email the EmamiApps hub captured at its own login - same-origin localStorage,
 * written by the hub's own AuthContext. TimeSheet is served same-origin at /apps/timesheet once
 * merged into the hub's build, same as every other embedded app. Returns null outside the hub
 * (e.g. running `npm run dev` standalone), so callers should fall back to normal behaviour. */
export function getHubEmail() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    return window.localStorage.getItem(HUB_EMAIL_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Looks up this email's Manage Access grant for TimeSheet specifically (Admin/User - see the
 * hub's backend/server.js GET /access/me) so this app can tell a manager-level user (hub Admin)
 * from a regular one (hub User) without needing its own separate access screen.
 *
 * Returns null if the hub can't be reached, or this email has no grant for 'timesheet' yet -
 * shouldn't normally happen, since the hub's own tile lock (AppDetailScreen.tsx/useAppAccess.ts)
 * already keeps anyone without a grant from reaching /apps/timesheet at all.
 */
export async function getHubRoleForTimesheet(email) {
  try {
    const res = await fetch(`${HUB_ACCESS_API_BASE}/access/me?email=${encodeURIComponent(email)}`)
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return null
    const apps = Array.isArray(data.apps) ? data.apps : []
    return apps.find((a) => a.appId === APP_ID)?.role || null // 'Admin' | 'User' | null
  } catch {
    return null
  }
}
