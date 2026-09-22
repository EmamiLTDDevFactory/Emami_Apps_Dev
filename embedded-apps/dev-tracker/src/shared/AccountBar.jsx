import { getCurrentUserEmail, getLoginMethod } from './api.js';
import { HUB_AUTH_API_BASE } from './constants.js';

export function clearHubSessionAndRedirect() {
  const loginMethod = getLoginMethod();
  const email = getCurrentUserEmail();
  try {
    ['emami_apps_is_logged_in', 'emami_apps_user_email', 'emami_apps_session_token', 'emami_apps_login_method'].forEach((k) =>
      localStorage.removeItem(k)
    );
  } catch {
    /* ignore */
  }
  if (loginMethod === 'sso') {
    window.location.href = `${HUB_AUTH_API_BASE}/hub-auth/saml/logout?email=${encodeURIComponent(email || '')}`;
  } else {
    window.location.href = '/';
  }
}
