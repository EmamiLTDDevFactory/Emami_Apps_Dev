// Talks to the Manage Access endpoints, which read/write emami_apps.authorized_users and
// emami_apps.authorized_user_apps in the Postgres database (10.17.12.4). This same table is also
// what gates login itself (see authApi.ts).
//
// Deliberately its OWN env var (EXPO_PUBLIC_ACCESS_API_URL), separate from authApi.ts's
// EXPO_PUBLIC_AUTH_API_URL: this backend runs on an always-on server (172.17.2.21, exposed as
// audit-capa-api.emamiapps.in) that can actually reach Postgres, whereas the hub-auth Lambda
// (still fronting login + Microsoft SAML) has no VPC route to 10.17.12.4 and can't. Splitting the
// URL means Manage Access gets a working Postgres connection without moving the SAML/login flow
// off the Lambda — which would also require re-registering the SAML Reply URL (ACS URL) with
// Microsoft Entra, since that's derived from the same base URL. Falls back to
// EXPO_PUBLIC_AUTH_API_URL so this doesn't break if the new env var isn't set yet.
import type { AccessLevel, AppRole, MyAccess, UserAccessEntry, UserAppGrant } from '../types';

const ACCESS_API_URL =
  process.env.EXPO_PUBLIC_ACCESS_API_URL || process.env.EXPO_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

type ApiResult = { ok: boolean; error?: string };

async function parseResult(res: Response): Promise<ApiResult> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    return { ok: false, error: data?.error || 'Something went wrong. Please try again.' };
  }
  return { ok: true };
}

export async function listAuthorizedUsers(): Promise<{ ok: boolean; users?: UserAccessEntry[]; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/access/users`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not load authorized users.' };
    return { ok: true, users: data.users };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** `apps` on a successful result is whatever the backend auto-granted (see server.js's
 * DEFAULT_GRANTED_APPS) on top of the bare "authorized to sign in" row — currently
 * Mediclaim/Term Policy's base User role. Callers should fold this into whatever roles the admin
 * additionally picked in the Add User dialog, not discard it, so the just-added row shows its
 * true granted apps immediately instead of only after a page refresh. */
export async function addAuthorizedUser(email: string): Promise<ApiResult & { apps?: UserAppGrant[] }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/access/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error || 'Something went wrong. Please try again.' };
    }
    return { ok: true, apps: data.apps };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export async function removeAuthorizedUser(email: string): Promise<ApiResult> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}`, { method: 'DELETE' });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** Flips a user active/inactive — inactive users keep their app grants but are blocked at login. */
export async function setUserActive(email: string, isActive: boolean): Promise<ApiResult> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}/active`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** Grants (or changes the role on) one app for a user. Pass role=null to revoke it entirely.
 * `depot` only matters for Audit & CAPA's 'Depot' role (see UserAccessScreen.tsx) — ignored by the
 * server for every other app/role. */
export async function setAppAccess(
  email: string,
  appId: string,
  role: AppRole | null,
  depot?: string | null
): Promise<ApiResult> {
  try {
    const url = `${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}/apps/${encodeURIComponent(appId)}`;
    const res = role
      ? await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, depot: depot ?? null }),
        })
      : await fetch(url, { method: 'DELETE' });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** The signed-in user's own hub-wide access level + personal app grants — used to gate the Manage
 * Access nav item/screen and to decide which app tiles render unlocked (see AuthContext.tsx). */
export async function getMyAccess(email: string): Promise<MyAccess | null> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/access/me?email=${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return null;
    return { accessLevel: data.accessLevel, apps: data.apps };
  } catch {
    return null;
  }
}

/** Changes a user's hub-wide access level. `actingEmail` is the signed-in caller, checked
 * server-side against the permission matrix (Super Admin grants Admin/Viewer, Admin grants Viewer
 * only, the permanent Super Admin's own level can never change) — see server.js's PATCH
 * /access/users/:email/access-level for the authoritative rules; this is not enforced client-side
 * beyond disabling the controls the caller couldn't use anyway. */
export async function setAccessLevel(email: string, accessLevel: AccessLevel, actingEmail: string): Promise<ApiResult> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}/access-level`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessLevel, actingEmail }),
    });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}
