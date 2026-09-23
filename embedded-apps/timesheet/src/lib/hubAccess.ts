// Reads the EmamiApps hub's own signed session token - written by the hub's own AuthContext at
// its login (see backend/sessionAuth.js at the repo root), same-origin localStorage. TimeSheet is
// served same-origin at /apps/timesheet once merged into the hub's build, same as every other
// embedded app. Returns null outside the hub (e.g. running `npm run dev` standalone), so callers
// should fall back to normal behaviour.
//
// Deliberately does NOT call the hub's Manage Access API directly from the browser anymore (an
// earlier version of this file did, keyed off a bare emami_apps_user_email string with no proof
// it was genuine) - that lookup now happens server-side, in embedded-apps/timesheet/server's own
// /auth/hub-login, only after this token's signature has actually been verified. See
// AppContext.tsx's bootstrapFromHub.
const HUB_SESSION_TOKEN_KEY = 'emami_apps_session_token';

export function getHubSessionToken(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(HUB_SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}
