// Reads this app's own per-app role from the hub's central Manage Access system - same
// convention as Payment Tracking/PO Followup's own src/lib/hubAccessApi.ts. Unlike those apps
// (which only care about a binary Admin/not-Admin gate), Timesheet maps BOTH roles Manage Access
// can grant into a real in-app role: hub "Admin" becomes Timesheet's "manager", hub "User"
// becomes "employee" (see AppContext.jsx's provisioning call).
//
// Hardcoded (not env-based) on purpose: VITE_HUB_ACCESS_API_URL was set correctly in the Amplify
// console but repeatedly did not end up in the built bundle across several fresh (non-cached)
// deploys, for reasons that weren't worth continuing to chase live - same reasoning as Dev
// Tracker's SAP_BASE_URL, MouldHealthCheck's lib/config.ts, etc. hardcoding their own values.
// This IS environment-specific - dev vs prod each have their own hub Manage Access data (see
// project_dev_prod_backend_split in the hub repo's memory) - so this must be updated by hand if
// this app is ever pointed at the prod hub instead of dev.
const ACCESS_API_BASE = 'https://audit-capa-api.emamiapps.in/dev-api/api'
const APP_ID = 'timesheet'

/**
 * Returns 'Admin', 'User', or null (no grant at all - either never added in Manage Access, or an
 * error talking to it). Fails closed (null) on any error, same convention as the hub's own
 * authorizedUsers.js isAuthorized().
 */
export async function fetchTimesheetHubRole(email) {
  try {
    const res = await fetch(`${ACCESS_API_BASE}/access/me?email=${encodeURIComponent(email)}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.success) return null
    const grant = (data.apps || []).find((a) => a.appId === APP_ID)
    return grant ? grant.role : null
  } catch {
    return null
  }
}
