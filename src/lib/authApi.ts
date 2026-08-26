// Talks to the EmamiApps hub login endpoints on the hub-auth Lambda (backend/server.js,
// backend/hub-auth.js, backend/saml-sso.js), fronted by API Gateway rather than a Lambda
// Function URL — the Function URL was blocked by an unresolved AWS-account-level access issue
// (public traffic getting a 403 despite correct config); API Gateway uses a different invoke
// mechanism that sidesteps it entirely. Both login paths below are gated by the same
// emami_apps.authorized_users table that backs Manage Access (src/lib/accessApi.ts) — an email
// works if and only if it's present there and marked active, regardless of which path (Microsoft
// SAML or direct) it comes through.
const AUTH_API_URL = process.env.EXPO_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

/** Full-page navigation target for "Sign in with Microsoft" — not an XHR call. Microsoft sign-in
 * is SAML 2.0 (backend/saml-sso.js), configured via the "Configure SSO" screen rather than
 * hardcoded — this redirects into that flow, which itself redirects on to Microsoft. */
export function getMicrosoftSignInUrl(): string {
  return `${AUTH_API_URL}/hub-auth/saml/login`;
}

export async function verifySsoToken(token: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const res = await fetch(`${AUTH_API_URL}/hub-auth/session/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Sign-in could not be verified.' };
    return { ok: true, email: data.email };
  } catch {
    return { ok: false, error: 'Could not reach the sign-in server. Please try again.' };
  }
}

/** Direct email login — no Microsoft redirect. Succeeds only if the email is active in Manage Access. */
export async function loginWithEmail(email: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const res = await fetch(`${AUTH_API_URL}/hub-auth/db-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'This email does not have access.' };
    return { ok: true, email: data.email };
  } catch {
    return { ok: false, error: 'Could not reach the sign-in server. Please try again.' };
  }
}

/** Real per-user profile + activity stats (backend/userProfile.js) — backs Dashboard's greeting
 * and the Settings screen's profile card/ACTIVITY grid, replacing the old mock CURRENT_USER /
 * ACTIVITY_STATS (src/data/mockData.ts). */
export interface UserProfile {
  name: string;
  email: string;
  mobile: string;
  role: string;
  status: string;
  lastLogin: string | null;
  sessionsTotal: number;
  logins: number;
  timeSpent: string;
  appsOpened: number;
  downloads: number;
  favoritesAdded: number;
  notificationsRead: number;
  mostUsedApp: string;
}

export async function getMyProfile(email: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${AUTH_API_URL}/me?email=${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return null;
    return data.profile as UserProfile;
  } catch {
    return null;
  }
}

/** Activity event types the ACTIVITY stats grid (Settings screen) counts — see
 * backend/userProfile.js's CLIENT_EVENT_TYPES for the exact whitelist the backend enforces. */
export type ActivityEventType = 'APP_OPEN' | 'DOWNLOAD' | 'FAVORITE_ADD' | 'FAVORITE_REMOVE' | 'NOTIFICATION_READ' | 'SESSION_END';

/** Fire-and-forget activity logging — never throws, since a missed stat shouldn't interrupt
 * whatever the user was actually doing (opening an app, toggling a favorite, signing out). */
export function logEvent(email: string, eventType: ActivityEventType, appId?: string): void {
  fetch(`${AUTH_API_URL}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, eventType, appId }),
  }).catch(() => {});
}
