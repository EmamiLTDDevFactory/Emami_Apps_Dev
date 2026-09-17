// Talks to the Administration tab's read-only aggregate endpoints (backend/server.js's
// /admin/overview and /admin/roster) — same Postgres-reachable backend as Manage Access
// (src/lib/accessApi.ts), reusing its env var rather than introducing a third one. Kept in its
// own file rather than accessApi.ts since that one owns Manage Access *mutations*; this is
// read-only aggregate data for a different screen/audience.
import type { AccessLevel, UserAppGrant } from '../types';

const ACCESS_API_URL =
  process.env.NEXT_PUBLIC_ACCESS_API_URL || process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

export interface AdminOverview {
  totalAuthorizedUsers: number;
  activeAuthorizedUsers: number;
  activeLast7Days: number;
  activeLast30Days: number;
  neverLoggedIn: number;
  totalLogins: number;
  totalAppOpens: number;
  mostUsedApp: { appId: string; opens: number } | null;
}

export interface AdminRosterUsage {
  name: string | null;
  lastLogin: string | null;
  sessionsTotal: number;
  logins: number;
  timeSpent: string;
  appsOpened: number;
  mostUsedApp: string | null;
  /** false for an authorized user who has never actually signed in yet — the drill-down should
   * show an empty state for these instead of calling getMyProfile (which 404s with no profile row). */
  hasLoggedIn: boolean;
}

export interface AdminRosterEntry {
  email: string;
  isActive: boolean;
  accessLevel: AccessLevel;
  apps: UserAppGrant[];
  usage: AdminRosterUsage;
}

export async function getAdminOverview(): Promise<{ ok: boolean; overview?: AdminOverview; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/admin/overview`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not load the overview.' };
    return { ok: true, overview: data.overview };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export async function getAdminRoster(): Promise<{ ok: boolean; users?: AdminRosterEntry[]; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/admin/roster`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not load the user roster.' };
    return { ok: true, users: data.users };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export interface AdminUserAppStat {
  appId: string;
  opens: number;
  firstOpened: string | null;
  lastOpened: string | null;
}

/** Per-app drill-down for one user — backs the app-tile tap in the roster's user-detail dialog. */
export async function getAdminUserAppStats(email: string): Promise<{ ok: boolean; apps?: AdminUserAppStat[]; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/admin/user/${encodeURIComponent(email)}/apps`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not load per-app stats.' };
    return { ok: true, apps: data.apps };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export interface AdminAppStat {
  appId: string;
  opens: number;
  uniqueUsers: number;
  firstOpened: string | null;
  lastOpened: string | null;
}

/** Org-wide, app-wise usage — every app's total opens/unique users, not scoped to one user.
 * Backs the "App-wise Usage" sheet in the Excel export. */
export async function getAdminAppStats(): Promise<{ ok: boolean; apps?: AdminAppStat[]; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/admin/apps`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not load app-wise usage.' };
    return { ok: true, apps: data.apps };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export interface AdminAppUserStat {
  email: string;
  opens: number;
  firstOpened: string | null;
  lastOpened: string | null;
}

/** Per-user breakdown for ONE specific app — the inverse of getAdminUserAppStats (that one's "all
 * apps for one user"; this is "all users for one app"). Backs the App-wise Usage section's
 * per-app drill-down dialog and its own standalone Excel export. */
export async function getAdminAppUserStats(appId: string): Promise<{ ok: boolean; users?: AdminAppUserStat[]; error?: string }> {
  try {
    const res = await fetch(`${ACCESS_API_URL}/admin/app/${encodeURIComponent(appId)}/users`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not load per-user stats for this app.' };
    return { ok: true, users: data.users };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}
