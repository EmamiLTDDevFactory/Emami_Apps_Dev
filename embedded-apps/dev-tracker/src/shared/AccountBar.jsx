import React, { useEffect, useState } from 'react';
import { getCurrentUserEmail, getLoginMethod, apiMe } from './api.js';
import { HUB_AUTH_API_BASE } from './constants.js';
import { initialsHome } from './utils.js';
import emamiLogo from './assets/emami-apps-logo.png';

// Leaves the app and returns to the Emami Apps hub itself - distinct from
// clearHubSessionAndRedirect below, which actually signs the user out.
function backToEmamiApps() {
  window.location.href = '/';
}

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

/** Shared account strip: avatar + name, with a sign-out menu on pages that had one
 * in the original (Home, Resource Utilization). Dashboard/Admin render it without. */
export default function AccountBar({ showSignOut = false }) {
  const [name, setName] = useState(null);
  const [open, setOpen] = useState(false);
  const email = getCurrentUserEmail();

  useEffect(() => {
    let cancelled = false;
    apiMe(email).then((data) => {
      if (!cancelled && data?.success && data.profile?.name) setName(data.profile.name);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  if (!email) return <div className="account-strip" />;

  const displayName = name || email;

  return (
    <div className="account-strip">
      <div className="account-strip-brand">
        <img src={emamiLogo} alt="Emami Apps" className="account-strip-logo" />
        <button type="button" className="btn btn-ghost" onClick={backToEmamiApps}>
          <span aria-hidden="true">🏠</span>
          Back to Emami Apps
        </button>
      </div>
      <div className="account-strip-inner">
        <div className="avatar mono">{initialsHome(displayName)}</div>
        <span className="account-name">{displayName}</span>
        {showSignOut ? (
          <>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ cursor: 'pointer' }}
              onClick={() => setOpen((o) => !o)}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {open && (
              <div className="account-menu" onMouseLeave={() => setOpen(false)}>
                <button onClick={clearHubSessionAndRedirect}>Sign out</button>
              </div>
            )}
          </>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </div>
    </div>
  );
}
