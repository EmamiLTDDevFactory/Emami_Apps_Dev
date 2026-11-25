import axios from 'axios';
import { SAP_BASE_URL } from '../config/api';
import { UserRole } from '../types';

const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';
const HUB_TOKEN_STORAGE_KEY = 'emami_apps_session_token';

/** Reads the email captured by the EmamiApps hub login — same-origin localStorage, written by
 * the hub's own AuthContext on every login. */
export function getHubEmail(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(HUB_EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Same two-key guard every Next.js sibling embedded app uses (payment-tracking/gate-entry/
 * mediclaim) — this app has no login of its own: it opens only for a visitor the hub signed in. */
export function hasHubSession(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return Boolean(window.localStorage.getItem(HUB_TOKEN_STORAGE_KEY) && getHubEmail());
  } catch {
    return false;
  }
}

/** The hub's own signed session JWT (same one Timesheet's and audit-capa's backends already
 * verify independently via the shared HUB_AUTH_JWT_SECRET) — sent as Bearer auth to this app's own
 * backend proxy routes (see ClaimContext.tsx's sensitiveApiClient), so the backend can verify who's
 * really calling instead of trusting whatever identity a request claims. */
export function getHubToken(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(HUB_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Same check the hub itself runs (hub-next's AuthContext.hubTokenExpired) before letting someone
 * use a 12h-old token - mirrored here so this app can catch an expired session proactively (bounce
 * back to the hub to sign in again) instead of finding out only when a backend proxy call (see
 * ClaimContext.tsx's requireHubAuth-gated routes) rejects it mid-use with no explanation. A missing
 * or unreadable token is NOT treated as expired - same conservative choice as the hub's own check,
 * so this never signs someone out over a token it simply can't parse. */
export function isHubTokenExpired(): boolean {
  const token = getHubToken();
  if (!token) return false;
  try {
    const part = token.split('.')[1] || '';
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000;
  } catch {
    return false;
  }
}

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
  return name || email;
}

// SAP's LoginSet now always returns an explicit Role (M/F/B/E) - the ZEXP_MASTERSet manager-
// detection probe this used to fall back to (12 failed requests per login: 4 candidate entity
// names x 3 filter shapes, none of which ever existed) is dead weight now that Role is reliable.
const mapSapRole = (rawRole: unknown): UserRole | null => {
  if (!rawRole) return null;
  const role = rawRole.toString().trim().toUpperCase();
  if (role === 'M' || role === 'MANAGER') return 'manager';
  if (role === 'F' || role === 'FINANCE') return 'finance';
  if (role === 'E' || role === 'EMPLOYEE') return 'employee';
  return null;
};

// SAP's LoginSet returns these as either a real boolean or the legacy XFELD string 'X' - same
// ambiguity ExptypeSet.IsMobile and MobCapSet.NoCap already needed this exact check for.
const asFlag = (value: unknown): boolean => value === true || value === 'X';

export interface HubEmailLoginResult {
  ok: boolean;
  employeeId?: string;
  role?: UserRole;
  isManager?: boolean;
  isFinance?: boolean;
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
    const response = await axios.post(
      `${SAP_BASE_URL}/LoginSet`,
      { LoginId: '', Otp: '', Email: email },
      { headers: { 'Content-Type': 'application/json', 'DataServiceVersion': '2.0' }, validateStatus: () => true }
    );

    const raw = response.data;
    const sapResponse = raw?.d || raw || {};
    const sapErrorType = (sapResponse.Type || sapResponse.type || '').toString().toUpperCase();
    // SAP's OData gateway sometimes returns HTTP 200 with an error body — check Type==='E' too.
    if (response.status < 200 || response.status >= 300 || sapErrorType === 'E') {
      return { ok: false, error: sapResponse.Message || sapResponse.message || 'Login failed.' };
    }

    const employeeId = (sapResponse.LoginId || sapResponse.EmployeeId || sapResponse.PERNR || sapResponse.Pernr || '')
      .toString()
      .trim();
    if (!employeeId) {
      return { ok: false, error: 'SAP did not return an employee ID for this email.' };
    }

    const sapRole = mapSapRole(sapResponse.Role || sapResponse.role);
    const computedRole = sapRole || 'employee';
    const info = { ...sapResponse, role: computedRole };

    // Explicit Role='B' always wins - mapSapRole doesn't recognise 'B' on its own, so without this
    // it would fall through to the 'employee' default above.
    const explicitRole = typeof sapResponse.Role === 'string' ? sapResponse.Role.trim() : '';
    const role: UserRole = explicitRole.toUpperCase() === 'B' ? 'B' : computedRole;

    // Independent capability flags (live 2026-11-25) - tabs/lists/actions gate on these directly,
    // not on Role (which still comes back, B/F overwriting M, but is kept only as a display label).
    // IsAdmin is deliberately NOT read here - resolveIsAdmin(info, employeeId) in AuthContext stays
    // the single source of truth for it, since it also covers the local/QA test-PERNR allowlist.
    const isManager = asFlag(sapResponse.IsManager);
    const isFinance = asFlag(sapResponse.IsFinance);

    return { ok: true, employeeId: employeeId.toUpperCase(), role, isManager, isFinance, name: sapResponse.Name, info };
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
}
