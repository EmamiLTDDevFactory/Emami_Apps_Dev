import { SAP_BASE_URL } from '../config/api';
import { UserRole } from '../types';

const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

/** Reads the email captured by the EmamiApps hub login — same-origin localStorage, written by
 * the hub's own AuthContext (AUTH_EMAIL_STORAGE_KEY) on every login. Web only; this app isn't
 * served same-origin with the hub on native, so there's nothing to read there. */
export function getHubEmail(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(HUB_EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Exact copies of login.tsx's role-resolution helpers, kept separate (not imported from
// login.tsx) so this new hub-email path can never change behavior of the existing
// Employee ID + OTP flow, which stays as the fallback when no hub email is present.
const normalizeRole = (role: unknown): UserRole => {
  const normalized = (role || '').toString().toLowerCase();
  return normalized === 'manager' || normalized === 'finance' || normalized === 'employee'
    ? (normalized as UserRole)
    : 'employee';
};

const mapSapRole = (rawRole: unknown): UserRole | null => {
  if (!rawRole) return null;
  const role = rawRole.toString().trim().toUpperCase();
  if (role === 'M' || role === 'MANAGER') return 'manager';
  if (role === 'F' || role === 'FINANCE') return 'finance';
  if (role === 'E' || role === 'EMPLOYEE') return 'employee';
  return null;
};

const encodeODataFilter = (filter: string) => encodeURIComponent(filter).replace(/%20/g, '%20');

const detectUserRole = async (loginId: string): Promise<UserRole> => {
  const sanitizedLoginId = (loginId || '').toString().trim().replace(/\D/g, '').padStart(8, '0');
  const entityCandidates = ['ZEXP_MASTERSet', 'ZEXP_MASTER', 'Zexp_MasterSet', 'Zexp_Master'];
  const filterCandidates = [
    `PERNR_D eq '${sanitizedLoginId}' or L1 eq '${sanitizedLoginId}' or L2 eq '${sanitizedLoginId}'`,
    `PERNR_D eq '${sanitizedLoginId}' or ManagerL1 eq '${sanitizedLoginId}' or ManagerL2 eq '${sanitizedLoginId}'`,
    `PERNR eq '${sanitizedLoginId}' or L1 eq '${sanitizedLoginId}' or L2 eq '${sanitizedLoginId}'`,
  ];

  for (const entityName of entityCandidates) {
    for (const filter of filterCandidates) {
      const url = `${SAP_BASE_URL}/${entityName}?$format=json&$filter=${encodeODataFilter(filter)}`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        const results = data?.d?.results || data?.results || [];
        if (Array.isArray(results) && results.length > 0) return 'manager';
        if (results && typeof results === 'object' && !Array.isArray(results) && Object.keys(results).length > 0) return 'manager';
      } catch {
        // try next entity/filter candidate
      }
    }
  }
  return 'employee';
};

export interface HubEmailLoginResult {
  ok: boolean;
  employeeId?: string;
  role?: UserRole;
  name?: string;
  info?: any;
  error?: string;
}

/** Logs in via SAP's LoginSet using only the email the EmamiApps hub already captured at its own
 * login — same entity set, same POST, same response handling as login.tsx's OTP-verify step, but
 * LoginId/Otp are sent blank so SAP resolves the employee by Email instead. No GET step, no OTP
 * screen — see AuthContext.tsx's restoreSession, which calls this before ever falling back to
 * showing the login screen. */
export async function loginWithHubEmail(email: string): Promise<HubEmailLoginResult> {
  try {
    const response = await fetch(`${SAP_BASE_URL}/LoginSet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'DataServiceVersion': '2.0' },
      body: JSON.stringify({ LoginId: '', Otp: '', Email: email }),
    });

    const rawText = await response.text();
    let raw: any = null;
    try {
      raw = JSON.parse(rawText);
    } catch {
      return { ok: false, error: `Server returned unexpected response (${response.status}).` };
    }

    const sapResponse = raw?.d || raw || {};
    const sapErrorType = (sapResponse.Type || sapResponse.type || '').toString().toUpperCase();
    if (!response.ok || sapErrorType === 'E') {
      return { ok: false, error: sapResponse.Message || sapResponse.message || 'Login failed.' };
    }

    const employeeId = (sapResponse.LoginId || sapResponse.EmployeeId || sapResponse.PERNR || sapResponse.Pernr || '')
      .toString()
      .trim();
    if (!employeeId) {
      return { ok: false, error: 'SAP did not return an employee ID for this email.' };
    }

    const sapRole = mapSapRole(sapResponse.Role || sapResponse.role);
    const computedRole = sapRole || normalizeRole(await detectUserRole(employeeId));
    const info = { ...sapResponse, role: computedRole };

    const explicitRole = typeof sapResponse.Role === 'string' ? sapResponse.Role.trim() : '';
    const role: UserRole = explicitRole.toUpperCase() === 'B' ? 'B' : computedRole;

    return { ok: true, employeeId: employeeId.toUpperCase(), role, name: sapResponse.Name, info };
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
}
