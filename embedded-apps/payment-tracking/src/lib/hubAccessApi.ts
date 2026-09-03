// Reads this app's own per-app role from the hub's central Manage Access system — same
// Postgres-reachable deployment (audit-capa-api.emamiapps.in) and endpoint shape dev-tracker's
// public/home.js already uses for its own admin gating (GET /access/me?email=...). Unlike Market
// Rate's ZMarketRoleSet approach, this needs no new SAP entity set: "Admin" here means the role the
// hub's own Manage Access screen already grants for this app.
import axios from 'axios';

const ACCESS_API_BASE = 'https://audit-capa-api.emamiapps.in/api';
const APP_ID = 'payment-tracking';

interface AccessMeResponse {
  success: boolean;
  accessLevel?: string;
  apps?: Array<{ appId: string; role: string }>;
}

/** True only if the hub's Manage Access grants this email an "Admin" role specifically for
 * payment-tracking. Fails closed (false) on any error, same convention as the hub's own
 * authorizedUsers.js isAuthorized(). */
export async function fetchIsPaymentTrackingAdmin(email: string): Promise<boolean> {
  try {
    const { data } = await axios.get<AccessMeResponse>(`${ACCESS_API_BASE}/access/me`, {
      params: { email },
    });
    if (!data?.success) return false;
    return (data.apps || []).some((a) => a.appId === APP_ID && a.role === 'Admin');
  } catch {
    return false;
  }
}
