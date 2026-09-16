// Same-origin localStorage keys the hub's own AuthContext.tsx writes on login (see
// emami_apps_user_email/emami_apps_session_token in the main app's src/context/AuthContext.tsx).
// Identical copy to every sibling embedded app's own file of the same name — no shared package
// between them, so this is duplicated rather than imported.
const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';
const HUB_TOKEN_STORAGE_KEY = 'emami_apps_session_token';

export function getHubEmail(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(HUB_EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** This app has no login screen of its own — reaching it at all is only ever valid because the
 * hub already authenticated the visitor. Checking the session token, not just the presence of an
 * email, matches every sibling app's own guard: an email alone could be a stale/cleared-elsewhere
 * localStorage leftover, but the token is what the hub's own AuthContext actually clears on
 * logout. */
export function hasHubSession(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return Boolean(window.localStorage.getItem(HUB_TOKEN_STORAGE_KEY) && getHubEmail());
  } catch {
    return false;
  }
}

/** Title-cases an email's local part as a display name — same last-resort every sibling app and
 * the hub's own backend/userProfile.js fall back to when no real name is known. */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
  return name || email;
}
