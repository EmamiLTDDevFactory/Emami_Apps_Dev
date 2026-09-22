// Reads this app's own per-app role from the hub's central Manage Access system — same
// Postgres-reachable deployment (audit-capa-api.emamiapps.in) endpoint shape dev-tracker's
// public/home.js also uses for its own admin gating (GET /access/me?email=...). Unlike Market
// Rate's ZMarketRoleSet approach, this needs no new SAP entity set: the role here is whatever the
// hub's own Manage Access screen grants for this app — User, Admin, or Finance (the hub backend's
// VALID_ROLES_BY_APP for 'payment-tracking' must list all three, else it 400s on save).
import axios from 'axios';

const ACCESS_API_HOST = 'https://audit-capa-api.emamiapps.in';
const APP_ID = 'payment-tracking';

/** Same dev/prod split every other embedded app in this monorepo makes off the browser's own
 * hostname (see embedded-apps/audit-capa/src/components/layout/emamiAppsUrl.js's
 * `HOSTNAME.includes('dev')`, and the /dev-api/ path prefix embedded-apps/timesheet/server's
 * auth.js already routes through for this exact host) — this app has no build-time env injection
 * of its own the way the hub's own accessApi.ts gets via EXPO_PUBLIC_ACCESS_API_URL, so without
 * this a role granted through dev.emamiapps.in's Manage Access would always read back from prod's
 * database instead and never show up here. */
function accessApiBase(): string {
  const isDev = typeof window !== 'undefined' && window.location.hostname.includes('dev');
  return `${ACCESS_API_HOST}${isDev ? '/dev-api' : ''}/api`;
}

export type PaymentTrackingRole = 'User' | 'Admin' | 'Finance';

interface AccessMeResponse {
  success: boolean;
  accessLevel?: string;
  apps?: Array<{ appId: string; role: string }>;
}

/** This email's role for payment-tracking specifically, per the hub's Manage Access grant.
 * Fails closed to 'User' (least privilege) on any error or missing/unrecognized role, same
 * convention as the hub's own authorizedUsers.js isAuthorized() and Market Rate's
 * fetchUserRole(). */
export async function fetchPaymentTrackingRole(email: string): Promise<PaymentTrackingRole> {
  try {
    const { data } = await axios.get<AccessMeResponse>(`${accessApiBase()}/access/me`, {
      params: { email },
    });
    if (!data?.success) return 'User';
    const role = (data.apps || []).find((a) => a.appId === APP_ID)?.role;
    return role === 'Admin' || role === 'Finance' ? role : 'User';
  } catch {
    return 'User';
  }
}
