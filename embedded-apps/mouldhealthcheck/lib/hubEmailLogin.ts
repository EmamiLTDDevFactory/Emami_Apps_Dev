// Same-origin localStorage keys the hub's own AuthContext.tsx writes on login (see
// emami_apps_user_email/emami_apps_session_token in the main app's src/context/AuthContext.tsx).
// Reading them here is what lets this app skip its own login screen entirely — anyone who reached
// /apps/mouldhealthcheck already signed in through the hub. Same pattern as
// non-ctc-expense/rc-portal/market-rate.
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

/** This app has no login screen of its own (same shape as Audit & CAPA) — reaching it at all is
 * only ever valid because the hub already authenticated the visitor. Checking the session token,
 * not just the presence of an email, matches Audit & CAPA's own guard (src/App.js there): an
 * email alone could be a stale/cleared-elsewhere localStorage leftover, but the token is what the
 * hub's own AuthContext actually clears on logout. */
export function hasHubSession(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return Boolean(window.localStorage.getItem(HUB_TOKEN_STORAGE_KEY) && getHubEmail());
  } catch {
    return false;
  }
}

/** Navigates to the hub's own real logout — see RootNavigator.tsx's ?logout=1 handler in the main
 * app. Clears the hub's emami_apps_* session (not just this app's own in-memory user) and, for an
 * SSO session, redirects through SAML Single Logout too — a real "log all the way out of Emami
 * Apps", unlike every other embedded app's own Logout button today, which deliberately only ends
 * that one sub-app's session and leaves the hub signed in.
 */
export function hubLogoutUrl(): string {
  return '/?logout=1';
}

/** "first.last@emamigroup.com" -> "First Last" — same helper as the other embedded apps'
 * hubEmailLogin.ts, for the title bar's signed-in-user pill. */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
  return name || email;
}
