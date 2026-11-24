/**
 * Read-only client for the hub backend's Manage Access / Administration endpoints (backend/server.js:
 * /admin/overview, /admin/roster, /admin/apps, /admin/app/:id/users, /admin/user/:email/apps,
 * /access/history). Every one of them is behind requireAccessManager: the caller's hub session JWT
 * (same-origin localStorage, written by the hub at sign-in) goes as a Bearer token, and only an
 * active Super Admin or Admin gets data back - everyone else gets 403. This app never writes; access
 * is still granted and revoked in the hub's own Manage Access screen.
 *
 * Same dev/prod split as payment-tracking's hubAccessApi.ts and dev-tracker's constants.js: a
 * dev.emamiapps.in page reads the dev database through the /dev-api prefix.
 */
import { getHubToken } from './hub';

const ACCESS_API_HOST = 'https://audit-capa-api.emamiapps.in';

function apiBase(): string {
  if (process.env.NEXT_PUBLIC_ACCESS_API_URL) return process.env.NEXT_PUBLIC_ACCESS_API_URL;
  const isDev = typeof window !== 'undefined' && window.location.hostname.includes('dev');
  return `${ACCESS_API_HOST}${isDev ? '/dev-api' : ''}/api`;
}

export type AccessLevel = 'Super Admin' | 'Admin' | 'Viewer';
export type AccessChangeType = 'USER_ADDED' | 'USER_REMOVED' | 'ACTIVE_STATUS' | 'ACCESS_LEVEL' | 'APP_ROLE' | 'MOBILE_SET';

export interface AppGrant {
  appId: string;
  role: string;
  depot?: string | null;
}

export interface Overview {
  totalAuthorizedUsers: number;
  activeAuthorizedUsers: number;
  activeLast7Days: number;
  activeLast30Days: number;
  neverLoggedIn: number;
  totalLogins: number;
  totalAppOpens: number;
  mostUsedApp: { appId: string; opens: number } | null;
}

export interface RosterUser {
  email: string;
  isActive: boolean;
  accessLevel: AccessLevel;
  apps: AppGrant[];
  usage: {
    name: string | null;
    lastLogin: string | null;
    sessionsTotal: number;
    logins: number;
    timeSpent: string;
    appsOpened: number;
    mostUsedApp: string | null;
    hasLoggedIn: boolean;
  };
}

export interface AppStat {
  appId: string;
  opens: number;
  uniqueUsers: number;
  firstOpened: string | null;
  lastOpened: string | null;
}

export interface OpenStat {
  opens: number;
  firstOpened: string | null;
  lastOpened: string | null;
}

export interface AccessChange {
  id: number;
  targetEmail: string;
  changedBy: string | null;
  changeType: AccessChangeType;
  appId: string | null;
  oldValue: string | null;
  newValue: string | null;
  occurredAt: string;
  /** Access Request incident this grant came from (INC-2026-00001), with the requester's reason. */
  incidentRef?: string | null;
  incidentNote?: string | null;
}

/** 401 = no/expired hub session, 403 = signed in but not a Super Admin/Admin. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function get<T>(path: string, key: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { headers: { Authorization: `Bearer ${getHubToken()}` }, cache: 'no-store' });
  } catch {
    throw new ApiError('Could not reach the Emami Apps server. Check the network and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) throw new ApiError(data?.error || 'Something went wrong. Please try again.', res.status);
  return data[key] as T;
}

export const getOverview = () => get<Overview>('/admin/overview', 'overview');
export const getRoster = () => get<RosterUser[]>('/admin/roster', 'users');
export const getAppStats = () => get<AppStat[]>('/admin/apps', 'apps');
export const getHistory = (email?: string) =>
  get<AccessChange[]>(`/access/history${email ? `?email=${encodeURIComponent(email)}` : ''}`, 'changes');
export const getUserAppStats = (email: string) =>
  get<(OpenStat & { appId: string })[]>(`/admin/user/${encodeURIComponent(email)}/apps`, 'apps');
export const getAppUserStats = (appId: string) =>
  get<(OpenStat & { email: string })[]>(`/admin/app/${encodeURIComponent(appId)}/users`, 'users');

export interface UserSession {
  start: string;
  /** null when no sign-out was recorded (tab closed, session expired). */
  end: string | null;
  durationSeconds: number | null;
  apps: { appId: string; at: string }[];
}

export interface UserActivity {
  logins: string[];
  sessions: UserSession[];
  recordedSeconds: number;
  truncated: boolean;
}

/** Sign-in times and sessions (with the apps opened in each) for one user. Needs the backend's
 * /admin/user/:email/activity route; an older backend answers 404. */
export const getUserActivity = (email: string) => get<UserActivity>(`/admin/user/${encodeURIComponent(email)}/activity`, 'activity');
