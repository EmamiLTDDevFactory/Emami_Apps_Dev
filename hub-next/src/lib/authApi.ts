// Talks to the EmamiApps hub login endpoints on the hub-auth Lambda (backend/server.js,
// backend/hub-auth.js, backend/saml-sso.js), fronted by API Gateway rather than a Lambda
// Function URL — the Function URL was blocked by an unresolved AWS-account-level access issue
// (public traffic getting a 403 despite correct config); API Gateway uses a different invoke
// mechanism that sidesteps it entirely. Both login paths below are gated by the same
// emami_apps.authorized_users table that backs Manage Access (src/lib/accessApi.ts) — an email
// works if and only if it's present there and marked active, regardless of which path (Microsoft
// SAML or direct) it comes through.
const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

// Profile/activity (/me, /events — backend/userProfile.js) need the same Postgres-reachable
// backend as Manage Access (see src/lib/accessApi.ts) — the hub-auth Lambda above has no VPC
// route to 10.17.12.4, so these two calls use NEXT_PUBLIC_ACCESS_API_URL instead, falling back to
// AUTH_API_URL so this doesn't break before the env var is set anywhere.
const ACCESS_API_URL = process.env.NEXT_PUBLIC_ACCESS_API_URL || AUTH_API_URL;

/** Full-page navigation target for "Sign in with Microsoft" — not an XHR call. Microsoft sign-in
 * is SAML 2.0 (backend/saml-sso.js), configured via the "Configure SSO" screen rather than
 * hardcoded — this redirects into that flow, which itself redirects on to Microsoft. */
export function getMicrosoftSignInUrl(): string {
  return `${AUTH_API_URL}/hub-auth/saml/login`;
}

/** Full-page navigation target for ending a Microsoft-SSO session's Entra ID side too (SAML
 * Single Logout) — see AuthContext.tsx's logout(), which only navigates here for a session that
 * actually came in via Microsoft, after already clearing its own local session state. */
export function getMicrosoftSignOutUrl(email: string): string {
  return `${AUTH_API_URL}/hub-auth/saml/logout?email=${encodeURIComponent(email)}`;
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
    // The Lambda above verifies the JWT's signature/expiry, but its own isAuthorized() check
    // can't reach Postgres (no VPC route) and is currently a no-op — so this re-checks Manage
    // Access for real against the Postgres-reachable backend before trusting the SSO login.
    if (!(await checkStillAuthorized(data.email))) {
      return { ok: false, error: 'This email-id is not registered. Contact your admin for access.' };
    }
    return { ok: true, email: data.email };
  } catch {
    return { ok: false, error: 'Could not reach the sign-in server. Please try again.' };
  }
}

/** Re-checks Manage Access status for an email — used both right after Microsoft SSO login
 * (verifySsoToken above) and to re-validate an already-persisted "logged in" session on app start
 * (AuthContext's initial load), since that would otherwise trust local storage forever with no
 * server round-trip. Fails closed (an unreachable check counts as "not authorized"), matching
 * backend/authorizedUsers.js's isAuthorized() convention. */
export async function checkStillAuthorized(email: string): Promise<boolean> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/access/authorized/${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({}));
    return !!(res.ok && data?.success && data.authorized);
  } catch {
    return false;
  }
}

/** Direct email login — no Microsoft redirect. Succeeds only if the email is active in Manage Access. */
export async function loginWithEmail(email: string): Promise<{ ok: boolean; email?: string; token?: string; error?: string }> {
  try {
    const res = await fetch(`${AUTH_API_URL}/hub-auth/db-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'This email-id is not registered.' };
    return { ok: true, email: data.email, token: data.token };
  } catch {
    return { ok: false, error: 'Could not reach the sign-in server. Please try again.' };
  }
}

/** Magic-link sign-in for non-@emamigroup.com emails (backend/magicLink.js) — @emamigroup.com
 * always uses Microsoft SSO instead (getMicrosoftSignInUrl above) and never calls this. Unlike
 * loginWithEmail/db-login, this doesn't log the user in directly — it only sends an email; the
 * actual login happens when they click the link and land back here with ?magicToken=, handled by
 * verifyMagicLink below (see the root layout's effect for ?magicToken, mirroring how it already
 * handles ?ssoToken).
 *
 * Uses ACCESS_API_URL, not AUTH_API_URL — unlike SAML (which has to run on the Lambda, since
 * that's where Azure's Reply URL points), magic-link has no reason to run there: its only real
 * dependency is Postgres (via isAuthorized()), so it runs on the same Postgres-reachable
 * deployment Manage Access already uses instead. */
export async function requestMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/hub-auth/magic-link/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not send sign-in link.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the sign-in server. Please try again.' };
  }
}

/** Exchanges a clicked magic-link token for a real session — see requestMagicLink above. */
export async function verifyMagicLink(token: string): Promise<{ ok: boolean; email?: string; token?: string; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/hub-auth/magic-link/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'This link is invalid or has expired.' };
    return { ok: true, email: data.email, token: data.token };
  } catch {
    return { ok: false, error: 'Could not reach the sign-in server. Please try again.' };
  }
}

/** Real per-user profile + activity stats (backend/userProfile.js) — backs Dashboard's greeting
 * and the Settings screen's profile card/ACTIVITY grid. */
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
  /** Length of the most recently *completed* session (e.g. "2s", "15m") — null if none has ever
   * closed with an explicit logout yet. */
  lastSessionDuration: string | null;
  /** Top apps by open count, most-opened first — visit counts, not literal time-per-app (nothing
   * tracks how long an app stays open, only that it was opened). */
  topApps: { appId: string; opens: number }[];
  /** Uploaded profile photo as a data URI — null until the user uploads one via the Settings
   * screen's "Upload Photo" button (see uploadProfilePhoto). */
  photoUrl: string | null;
}

export async function getMyProfile(email: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/me?email=${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return null;
    return data.profile as UserProfile;
  } catch {
    return null;
  }
}

/** The signed-in user's own most recently opened apps, newest first, one entry per app — backs
 * Home's "Recently Used" tiles and the standalone Recent screen. Real activity from
 * emami_apps.events (via GET /me/recent-apps), not a hardcoded list. */
export async function getRecentApps(email: string): Promise<{ appId: string; lastOpenedAt: string }[]> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/me/recent-apps?email=${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return [];
    return data.apps as { appId: string; lastOpenedAt: string }[];
  } catch {
    return [];
  }
}

/** Records a login against the Postgres-reachable backend (NEXT_PUBLIC_ACCESS_API_URL), since the
 * hub-auth Lambda already tries to do this server-side (upsertLoginProfile, in both hub-auth.js's
 * direct email login and saml-sso.js's SAML callback) but can't reach 10.17.12.4 to persist it.
 * Call this right after a successful login — either path, direct email or Microsoft SSO — so
 * "last login"/"logins"/"sessions" on Dashboard/Settings stay accurate regardless of which one was
 * used. Fire-and-forget, same posture as logEvent: a missed write here shouldn't block sign-in. */
export function recordLogin(email: string, name?: string): void {
  fetch(`${ACCESS_API_URL}/me/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  }).catch(() => {});
}

/** Uploads (or replaces) the logged-in user's profile photo — imageDataUri is already resized to
 * 512x512 and compressed by the caller (see SettingsScreen.tsx's onPressUploadPhoto). Same
 * Postgres-reachable backend as getMyProfile, since this is stored on emami_apps.users. */
export async function uploadProfilePhoto(email: string, imageDataUri: string): Promise<{ ok: boolean; photoUrl?: string; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/me/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, imageDataUri }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not upload photo.' };
    return { ok: true, photoUrl: data.photoUrl };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** Saves (or replaces) the logged-in user's mobile number — see SettingsScreen.tsx's editable
 * Mobile field. The backend normalizes/validates it as an Indian mobile number and returns the
 * canonical "+91XXXXXXXXXX" form; the client-side check in SettingsScreen is just for fast
 * feedback, this call is the authoritative validation. */
export async function updateMobile(email: string, mobile: string): Promise<{ ok: boolean; mobile?: string; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/me/mobile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, mobile }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not save mobile number.' };
    return { ok: true, mobile: data.mobile };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** Activity event types the ACTIVITY stats grid (Settings screen) counts — see
 * backend/userProfile.js's CLIENT_EVENT_TYPES for the exact whitelist the backend enforces. */
export type ActivityEventType = 'APP_OPEN' | 'DOWNLOAD' | 'FAVORITE_ADD' | 'FAVORITE_REMOVE' | 'NOTIFICATION_READ' | 'SESSION_END';

/** Fire-and-forget activity logging — never throws, since a missed stat shouldn't interrupt
 * whatever the user was actually doing (opening an app, toggling a favorite, signing out). */
export function logEvent(email: string, eventType: ActivityEventType, appId?: string): void {
  fetch(`${ACCESS_API_URL}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, eventType, appId }),
    // APP_OPEN is followed straight away by a same-tab navigation into the app; keepalive lets the
    // request finish after this page unloads instead of being cancelled with it.
    keepalive: true,
  }).catch(() => {});
}
