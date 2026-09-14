// Reads this app's own per-app role from the hub's central Manage Access system — same
// Postgres-reachable deployment (audit-capa-api.emamiapps.in) and endpoint shape dev-tracker's
// public/home.js already uses for its own admin gating (GET /access/me?email=...). Unlike Market
// Rate's ZMarketRoleSet approach, this needs no new SAP entity set: the role here is whatever the
// hub's own Manage Access screen grants for this app — User, Admin, or Finance (the hub backend's
// VALID_ROLES_BY_APP for 'payment-tracking' must list all three, else it 400s on save).
import axios from 'axios';

const ACCESS_API_BASE = 'https://audit-capa-api.emamiapps.in/api';
const APP_ID = 'payment-tracking';

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
    const { data } = await axios.get<AccessMeResponse>(`${ACCESS_API_BASE}/access/me`, {
      params: { email },
    });
    if (!data?.success) return 'User';
    const role = (data.apps || []).find((a) => a.appId === APP_ID)?.role;
    return role === 'Admin' || role === 'Finance' ? role : 'User';
  } catch {
    return 'User';
  }
}
