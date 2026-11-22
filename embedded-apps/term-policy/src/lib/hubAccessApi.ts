// Reads this app's own per-app role from the hub's central Manage Access system — same
// Postgres-reachable deployment (audit-capa-api.emamiapps.in) endpoint shape payment-tracking's
// hubAccessApi.ts and dev-tracker's public/home.js also use for their own admin gating (GET
// /access/me?email=...). This app only ever needs the default User/Admin pair, so no change to
// the hub backend's VALID_ROLES_BY_APP is required — 'term-policy' falls through to its default
// ['User', 'Admin'] list.
import axios from 'axios';

const ACCESS_API_HOST = 'https://audit-capa-api.emamiapps.in';
const APP_ID = 'term-policy';

/** Same dev/prod split every other embedded app in this monorepo makes off the browser's own
 * hostname (see payment-tracking's hubAccessApi.ts) — this app has no build-time env injection of
 * its own, so without this a role granted through dev.emamiapps.in's Manage Access would always
 * read back from prod's database instead and never show up here. */
function accessApiBase(): string {
  const isDev = typeof window !== 'undefined' && window.location.hostname.includes('dev');
  return `${ACCESS_API_HOST}${isDev ? '/dev-api' : ''}/api`;
}

export type TermPolicyRole = 'User' | 'Admin';

interface AccessMeResponse {
  success: boolean;
  accessLevel?: string;
  apps?: Array<{ appId: string; role: string }>;
}

/** This email's role for the Term Policy app specifically, per the hub's Manage Access grant. Fails
 * closed to 'User' (least privilege) on any error, missing data, or unrecognized role, same
 * convention as the hub's own authorizedUsers.js isAuthorized() and every sibling app's own
 * fetch*Role() helper. */
export async function fetchTermPolicyRole(email: string): Promise<TermPolicyRole> {
  try {
    const { data } = await axios.get<AccessMeResponse>(`${accessApiBase()}/access/me`, {
      params: { email },
    });
    if (!data?.success) return 'User';
    const role = (data.apps || []).find((a) => a.appId === APP_ID)?.role;
    return role === 'Admin' ? 'Admin' : 'User';
  } catch {
    return 'User';
  }
}
