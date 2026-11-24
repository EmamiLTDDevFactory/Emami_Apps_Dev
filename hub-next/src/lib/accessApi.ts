// Talks to the Manage Access endpoints, which read/write emami_apps.authorized_users and
// emami_apps.authorized_user_apps in the Postgres database (10.17.12.4). This same table is also
// what gates login itself (see authApi.ts).
//
// Deliberately its OWN env var (NEXT_PUBLIC_ACCESS_API_URL), separate from authApi.ts's
// NEXT_PUBLIC_AUTH_API_URL: this backend runs on an always-on server (172.17.2.21, exposed as
// audit-capa-api.emamiapps.in) that can actually reach Postgres, whereas the hub-auth Lambda
// (still fronting login + Microsoft SAML) has no VPC route to 10.17.12.4 and can't. Splitting the
// URL means Manage Access gets a working Postgres connection without moving the SAML/login flow
// off the Lambda — which would also require re-registering the SAML Reply URL (ACS URL) with
// Microsoft Entra, since that's derived from the same base URL. Falls back to
// NEXT_PUBLIC_AUTH_API_URL so this doesn't break if the new env var isn't set yet.
import type { AccessChangeEntry, AccessLevel, AppRole, MyAccess, UserAccessEntry, UserAppGrant } from '../types';
import { authFetch } from './authFetch';

const ACCESS_API_URL =
  process.env.NEXT_PUBLIC_ACCESS_API_URL || process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

type ApiResult = { ok: boolean; error?: string };

/** Fired on window after any successful access change made from this tab; AuthContext re-reads the
 * signed-in person's own grants on it, so an admin who grants themselves an app sees it unlock at once. */
export const ACCESS_CHANGED_EVENT = 'emami-apps:access-changed';
const announceAccessChange = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
};

/** Only the mutating calls use this, so a success here always means someone's access changed. */
async function parseResult(res: Response): Promise<ApiResult> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    return { ok: false, error: data?.error || 'Something went wrong. Please try again.' };
  }
  announceAccessChange();
  return { ok: true };
}

export async function listAuthorizedUsers(): Promise<{ ok: boolean; users?: UserAccessEntry[]; error?: string }> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/access/users`);
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
 * true granted apps immediately instead of only after a page refresh.
 *
 * `mobile`, if given, only lands on the person's real Profile once they log in for the first time
 * (see backend/userProfile.js's upsertLoginProfile) — there's no profile row to attach it to yet.
 * `actingEmail` is who's doing the adding, recorded on the change-history audit trail. */
export async function addAuthorizedUser(
  email: string,
  names: { firstName: string; lastName: string },
  actingEmail?: string,
  mobile?: string
): Promise<ApiResult & { apps?: UserAppGrant[] }> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/access/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, firstName: names.firstName, lastName: names.lastName, actingEmail, mobile: mobile || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error || 'Something went wrong. Please try again.' };
    }
    announceAccessChange();
    return { ok: true, apps: data.apps };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export async function removeAuthorizedUser(email: string, actingEmail?: string): Promise<ApiResult> {
  try {
    const qs = actingEmail ? `?actingEmail=${encodeURIComponent(actingEmail)}` : '';
    const res = await authFetch(`${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}${qs}`, { method: 'DELETE' });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** Flips a user active/inactive — inactive users keep their app grants but are blocked at login. */
/** Admin Center — change someone's first and last name (both required). */
export async function setUserName(email: string, firstName: string, lastName: string): Promise<ApiResult> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName }),
    });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export async function setUserActive(email: string, isActive: boolean, actingEmail?: string): Promise<ApiResult> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}/active`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive, actingEmail }),
    });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** Grants (or changes the role on) one app for a user. Pass role=null to revoke it entirely.
 * `depot` only matters for Audit & CAPA's 'Depot' role (see UserAccessScreen.tsx) — ignored by the
 * server for every other app/role. `actingEmail` is recorded on the change-history audit trail. */
export async function setAppAccess(
  email: string,
  appId: string,
  role: AppRole | null,
  depot?: string | null,
  actingEmail?: string,
  /** undefined = leave the saved screen limit as it is; null = no limit; a list = only those screens. */
  tiles?: string[] | null
): Promise<ApiResult> {
  try {
    const url = `${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}/apps/${encodeURIComponent(appId)}`;
    const res = role
      ? await authFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, depot: depot ?? null, actingEmail, ...(tiles === undefined ? {} : { tiles }) }),
        })
      : await authFetch(url + (actingEmail ? `?actingEmail=${encodeURIComponent(actingEmail)}` : ''), { method: 'DELETE' });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** Change-history audit feed — pass `email` for one user's own history (the roster's user-detail
 * dialog), omit it for the org-wide feed (Administration's own Change History section). */
export async function getAccessHistory(email?: string): Promise<{ ok: boolean; changes?: AccessChangeEntry[]; error?: string }> {
  try {
    const qs = email ? `?email=${encodeURIComponent(email)}` : '';
    const res = await authFetch(`${ACCESS_API_URL}/access/history${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not load change history.' };
    return { ok: true, changes: data.changes };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** The signed-in user's own hub-wide access level + personal app grants — used to gate the Manage
 * Access nav item/screen and to decide which app tiles render unlocked (see AuthContext.tsx). */
export async function getMyAccess(email: string): Promise<MyAccess | null> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/access/me?email=${encodeURIComponent(email)}`);
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
    const res = await authFetch(`${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}/access-level`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessLevel, actingEmail }),
    });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

/** CCB roles (Change Control Board & CR Tracker > Change Control Board), assigned here instead of inside the app.
 * `available: null` when this server has no Change Control (the drawer then hides the section). */
export const CCB_APP_ID = 'dev-tracker';
export async function getCcbRoles(email: string): Promise<{ ok: boolean; roles: string[]; available: string[] | null; error?: string }> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}/ccb-roles`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, roles: [], available: null, error: data?.error };
    return { ok: true, roles: data.roles || [], available: data.available || [] };
  } catch {
    return { ok: false, roles: [], available: null };
  }
}

export async function setCcbRoles(email: string, roles: string[]): Promise<ApiResult> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/access/users/${encodeURIComponent(email)}/ccb-roles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles }),
    });
    return await parseResult(res);
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export interface AppTile { id: string; label: string; group: string }

/** Screens each app's grant can be limited to (backend/appTiles.js). Empty on any failure: the picker just stays hidden. */
export async function getAppTiles(): Promise<Record<string, AppTile[]>> {
  try {
    const res = await authFetch(`${ACCESS_API_URL}/access/app-tiles`);
    const data = await res.json().catch(() => ({}));
    return res.ok && data?.success ? data.apps || {} : {};
  } catch {
    return {};
  }
}
