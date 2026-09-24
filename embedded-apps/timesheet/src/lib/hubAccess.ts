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

// True when the hub token is past its own `exp` (the hub signs it for 12h). Used only to pick the
// right way out of the "Couldn't verify your access" screen - a dead hub token can't be fixed by
// retrying here, only by signing in to Emami Apps again. Unreadable tokens count as not expired.
export function isHubSessionTokenExpired(): boolean {
  const token = getHubSessionToken();
  if (!token) return false;
  try {
    const part = token.split('.')[1] || '';
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000;
  } catch {
    return false;
  }
}
