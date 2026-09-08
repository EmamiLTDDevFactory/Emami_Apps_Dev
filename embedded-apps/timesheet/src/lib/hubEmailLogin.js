// Same-origin localStorage keys the hub's own AuthContext.tsx writes on login (see
// emami_apps_user_email/emami_apps_session_token in the main app's src/context/AuthContext.tsx).
// Identical convention to Payment Tracking/PO Followup/Market Rate/RC Portal's own
// src/lib/hubEmailLogin — each embedded app is a separate frontend project with no shared
// package between them, so this is duplicated rather than imported.
const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email'
const HUB_TOKEN_STORAGE_KEY = 'emami_apps_session_token'

export function getHubEmail() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    return window.localStorage.getItem(HUB_EMAIL_STORAGE_KEY)
  } catch {
    return null
  }
}

// This app has no login screen of its own — reaching it at all is only ever valid because the
// hub already authenticated the visitor. Checking the session token, not just the presence of an
// email, matches the other embedded apps' guard: an email alone could be a stale/cleared-elsewhere
// localStorage leftover, but the token is what the hub's own AuthContext actually clears on logout.
export function hasHubSession() {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try {
    return Boolean(window.localStorage.getItem(HUB_TOKEN_STORAGE_KEY) && getHubEmail())
  } catch {
    return false
  }
}
