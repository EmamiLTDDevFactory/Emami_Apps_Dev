// Reads this app's own per-app role from the hub's central Manage Access system - same
// convention as Payment Tracking/PO Followup's own src/lib/hubAccessApi.ts. Unlike those apps
// (which only care about a binary Admin/not-Admin gate), Timesheet maps BOTH roles Manage Access
// can grant into a real in-app role: hub "Admin" becomes Timesheet's "manager", hub "User"
// becomes "employee" (see AppContext.jsx's provisioning call).
//
// The base URL is env-specific (dev vs prod each have their own hub Manage Access data - see
// project_dev_prod_backend_split in the hub repo's memory), injected the same way as
// VITE_TIMESHEET_API_URL via amplify.yml/the Amplify console, not hardcoded.
const ACCESS_API_BASE = `${import.meta.env.VITE_HUB_ACCESS_API_URL ?? ''}`
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
