const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

// Duplicated from src/services/odataService.js (SAP_BASE_URL isn't exported there) rather than
// importing it, so this new hub-email login path can't accidentally affect the existing
// Employee ID + OTP flow in odataService.js/Login.jsx.
const SAP_BASE_URL = 'https://emamiapi.emamigroup.com/api/NGD/ZRCPORTAL_SRV';

/** Reads the email captured by the EmamiApps hub login — same-origin localStorage, written by
 * the hub's own AuthContext on every login. RC Portal is served same-origin at /apps/rc-portal,
 * same as Non CTC Expense. */
export function getHubEmail() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(HUB_EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Logs in via SAP's LoginSet using only the email the EmamiApps hub already captured at its own
 * login — same entity set, same POST, same response handling as odataService.js's loginUser(),
 * but LoginId/Otp are sent blank so SAP resolves the employee by Email instead. No GET step, no
 * OTP screen — see App.jsx, which calls this before ever rendering the login page.
 *
 * Treats an all-zero LoginId (e.g. "00000000") the same as a missing one — SAP has been observed
 * echoing back a blank zero-padded placeholder instead of a real employee ID for some email-only
 * calls (seen on Non CTC Expense's equivalent service), which would otherwise silently log
 * someone in against no real employee record. */
export async function loginWithHubEmail(email) {
  try {
    const response = await fetch(`${SAP_BASE_URL}/LoginSet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'DataServiceVersion': '2.0' },
      body: JSON.stringify({ LoginId: '', Otp: '', Email: email }),
    });

    const rawText = await response.text();
    let raw = null;
    try {
      raw = JSON.parse(rawText);
    } catch {
      return { ok: false, error: `Server returned unexpected response (${response.status}).` };
    }

    const result = raw?.d || raw || {};
    if (result.Type === 'E' || (result.Message && /invalid|error|failed/i.test(result.Message))) {
      return { ok: false, error: result.Message || 'Login failed.' };
    }

    const loginId = (result.LoginId || result.login_id || '').toString().trim();
    if (!loginId || /^0+$/.test(loginId)) {
      return { ok: false, error: 'SAP did not return a real employee ID for this email.' };
    }

    return {
      ok: true,
      loginId,
      name: result.Name || result.Ename || '',
      role: result.Role || 'USER',
      ta: result.Ta || '',
      tm: result.Tm || '',
      ld: result.Ld || '',
      od: result.Od || '',
    };
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
}
