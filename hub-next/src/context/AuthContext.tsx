'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '../lib/storage';
import { resetInstallOfferForNewLogin } from '../hooks/usePwaInstall';
import {
  getMyProfile,
  getMicrosoftSignOutUrl,
  checkStillAuthorized,
  verifySsoToken,
  verifyMagicLink,
  logEvent,
  recordLogin,
  type UserProfile,
} from '../lib/authApi';
import { getMyAccess } from '../lib/accessApi';
import type { MyAccess } from '../types';

const SSO_ERROR_MESSAGES: Record<string, string> = {
  not_registered: 'This email-id is not registered. Contact your admin for access.',
  invalid_response: 'Sign-in failed. Please try again.',
  not_configured: 'Single sign-on is not set up yet. Please contact IT.',
};

export type LoginMethod = 'sso' | 'direct';

const AUTH_STORAGE_KEY = 'emami_apps_is_logged_in';
const AUTH_EMAIL_STORAGE_KEY = 'emami_apps_user_email';
/**
 * The hub's own session JWT (see backend/sessionAuth.js), persisted so same-origin embedded apps
 * — e.g. Audit & CAPA at /apps/audit-capa — can read it straight out of localStorage and use it to
 * establish their own session for this person without a second login screen.
 */
const AUTH_TOKEN_STORAGE_KEY = 'emami_apps_session_token';
/** Which path the current session came in through — 'sso' vs 'direct' — so logout() knows
 * whether there's an Entra ID session on this browser that also needs ending (see its call to
 * getMicrosoftSignOutUrl). Persisted alongside the rest of the session so this still works after
 * a page reload, not just within the tab that actually logged in. */
const AUTH_METHOD_STORAGE_KEY = 'emami_apps_login_method';
/** Last time this browser saw any user activity while signed in — see the inactivity-logout
 * effect below. Stored (not just kept in memory) so a 12-hour-idle browser tab that's still open,
 * or one reopened after being closed, is caught too, not only a tab that stayed active the whole
 * time. */
/** The last email that signed in on this browser. Deliberately NOT cleared by logout (unlike
 * AUTH_EMAIL_STORAGE_KEY above), so the Login page can pre-fill it next time - see
 * getLastLoginEmail. Holds only the address, never a session. */
const LAST_LOGIN_EMAIL_STORAGE_KEY = 'emami_apps_last_login_email';
export function getLastLoginEmail(): string {
  return storage.getItem(LAST_LOGIN_EMAIL_STORAGE_KEY) || '';
}
const LAST_ACTIVITY_STORAGE_KEY = 'emami_apps_last_activity_at';
const INACTIVITY_LIMIT_MS = 12 * 60 * 60 * 1000;
/** How often a fresh activity timestamp is actually written to storage — every mousemove/scroll
 * would otherwise hit localStorage far more than needed. */
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;
/** How often the elapsed-since-last-activity check runs while signed in. */
const INACTIVITY_CHECK_INTERVAL_MS = 60 * 1000;

/** True when the stored hub session JWT is past its own `exp` (backend/sessionAuth.js signs it
 * for 12h). The inactivity check below only measures idle time, so someone active for more than
 * 12 hours used to keep a dead token while the hub still looked signed in — and every embedded
 * app that verifies it (TimeSheet's /auth/hub-login, Audit & CAPA) then refused them with
 * "session has expired". A missing or unreadable token is not treated as expired, so this never
 * signs anyone out on a token it can't read. */
function hubTokenExpired(): boolean {
  const token = storage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!token) return false;
  try {
    const part = token.split('.')[1] || '';
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000;
  } catch {
    return false;
  }
}

interface AuthContextValue {
  /** True once startup (persisted-session restore + any ?ssoToken=/?magicToken=/?logout= query
   * param on this URL) has resolved — gates the very first render so the app never flashes the
   * login page before a real session has had a chance to restore. */
  ready: boolean;
  isLoggedIn: boolean;
  /** The email that logged in, via either path (Microsoft or direct) — null until known. */
  userEmail: string | null;
  /** Real name/last-login/activity stats for the logged-in user (backend/userProfile.js) — null
   * until the first fetch resolves, so screens can fall back to a loading state. */
  profile: UserProfile | null;
  refreshProfile: () => void;
  /** This user's own hub-wide access level + granted apps (backend/server.js's GET /access/me) —
   * null until the first fetch resolves. Gates the Manage Access nav item/screen and which app
   * tiles render unlocked. */
  access: MyAccess | null;
  refreshAccess: () => void;
  login: (email?: string, token?: string, method?: LoginMethod) => void;
  /** `skipSsoRedirect` is used only by the 12-hour inactivity auto-logout (see the effect below)
   * — every other caller (the profile menu's "Sign out", an embedded app's own logout button)
   * omits it, which still ends the Entra ID session too for an SSO login. */
  logout: (opts?: { skipSsoRedirect?: boolean }) => void;
  /** Set while a Microsoft SSO or magic-link callback (?ssoToken=/?magicToken=) is being
   * exchanged for a real session — see the startup effect below. The Login page shows a
   * "Verifying…" state while this is true. */
  verifyingAuth: boolean;
  /** Surfaced by the same startup effect — an SSO/magic-link sign-in that failed verification.
   * The Login page renders this as its error banner; dismissAuthError clears it once shown or
   * once the person starts typing a new email. */
  authError: string | null;
  dismissAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loginMethod, setLoginMethod] = useState<LoginMethod | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [verifyingAuth, setVerifyingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Mirrors state into refs so logout() (called from the startup effect, from a same-origin
  // embedded app's ?logout=1, and from the profile menu) always reads the CURRENT session even
  // when called from a stable (non-recreated) callback.
  const userEmailRef = useRef(userEmail);
  userEmailRef.current = userEmail;
  const loginMethodRef = useRef(loginMethod);
  loginMethodRef.current = loginMethod;

  const dismissAuthError = useCallback(() => setAuthError(null), []);

  const login = useCallback((email?: string, token?: string, method?: LoginMethod) => {
    // Do NOT push a history entry here — the URL is still the login page's own at the moment
    // login() runs. The login page's own redirect-to-Home effect (once isLoggedIn flips true)
    // puts the correct URL in the address bar; nothing extra is needed here.
    setIsLoggedIn(true);
    storage.setItem(AUTH_STORAGE_KEY, 'true');
    resetInstallOfferForNewLogin();
    if (email) {
      setUserEmail(email);
      storage.setItem(AUTH_EMAIL_STORAGE_KEY, email);
      storage.setItem(LAST_LOGIN_EMAIL_STORAGE_KEY, email);
      // Covers both login paths — direct email (Login page) and SSO/magic-link (the startup
      // effect below) — since both call this function with the authenticated email. See
      // recordLogin's comment in authApi.ts for why this is needed on top of the Lambda's own
      // (currently failing) server-side write.
      recordLogin(email);
    }
    if (token) {
      storage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    }
    if (method) {
      setLoginMethod(method);
      storage.setItem(AUTH_METHOD_STORAGE_KEY, method);
    }
  }, []);

  const logout = useCallback((opts?: { skipSsoRedirect?: boolean }) => {
    const prevEmail = userEmailRef.current;
    const wasSso = loginMethodRef.current === 'sso';
    if (prevEmail) logEvent(prevEmail, 'SESSION_END');
    setIsLoggedIn(false);
    setUserEmail(null);
    setProfile(null);
    setAccess(null);
    setLoginMethod(null);
    storage.removeItems([
      AUTH_STORAGE_KEY,
      AUTH_EMAIL_STORAGE_KEY,
      AUTH_TOKEN_STORAGE_KEY,
      AUTH_METHOD_STORAGE_KEY,
      LAST_ACTIVITY_STORAGE_KEY,
    ]);
    // Ends the Entra ID session too (SAML Single Logout) — without this, the browser still had a
    // live Microsoft session after "signing out" of the app, which is what previously let a
    // different person on the same browser get silently signed in as whoever logged out last.
    // Only for SSO sessions — a direct-email login never created a Microsoft session to end.
    //
    // Skipped for the 12-hour inactivity auto-logout (see the effect below): that's just this
    // browser tab deciding the LOCAL session went stale, not a real "sign out" the person asked
    // for — ending their Microsoft/Entra session too would be surprising (and would sign them out
    // of every other Microsoft-backed app in this browser, not just this hub) for something that
    // happened purely because they stepped away for a while.
    if (wasSso && prevEmail && !opts?.skipSsoRedirect) {
      window.location.href = getMicrosoftSignOutUrl(prevEmail);
    }
  }, []);

  // Single startup sequence, run once: restore (and re-validate) a persisted session, THEN handle
  // any ?ssoToken=/?ssoError=/?magicToken=/?logout=1 on this URL, THEN mark the provider ready.
  // These have to run in that order and share one `ready` gate rather than being two independent
  // effects — a same-origin embedded app's ?logout=1, or a Microsoft SSO callback's ?ssoToken=,
  // must act on top of whatever the persisted session actually was, not race it.
  //
  // ?ssoToken=/?ssoError= come from Microsoft SSO completing with a full-page redirect back to
  // this app's own URL (not a fetch response); ?magicToken= is the equivalent for magic-link
  // sign-in (non-@emamigroup.com emails); ?logout=1 is how a same-origin embedded app's own
  // "Logout" button triggers a REAL hub logout rather than just leaving that sub-app. All three
  // are handled here, in the provider itself, rather than in any one page/route — the backend can
  // redirect to whichever URL it's configured with, and this runs regardless of which route that
  // happens to land on.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const persistedLoggedIn = storage.getItem(AUTH_STORAGE_KEY) === 'true';
      const persistedEmail = storage.getItem(AUTH_EMAIL_STORAGE_KEY);
      const persistedMethodRaw = storage.getItem(AUTH_METHOD_STORAGE_KEY);
      const persistedMethod = persistedMethodRaw === 'sso' || persistedMethodRaw === 'direct' ? persistedMethodRaw : null;

      let restoredLoggedIn = persistedLoggedIn;
      let restoredEmail = persistedEmail;
      const restoredMethod = persistedMethod;

      // An expired hub token ends the persisted session here, so the person signs in again and
      // gets a fresh token instead of a hub that looks signed in but whose token every
      // embedded app rejects (see hubTokenExpired).
      if (persistedLoggedIn && (hubTokenExpired() || (persistedEmail && !(await checkStillAuthorized(persistedEmail))))) {
        storage.removeItems([AUTH_STORAGE_KEY, AUTH_EMAIL_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY, AUTH_METHOD_STORAGE_KEY]);
        restoredLoggedIn = false;
        restoredEmail = null;
      }
      if (cancelled) return;

      setIsLoggedIn(restoredLoggedIn);
      setUserEmail(restoredEmail);
      setLoginMethod(restoredMethod);
      userEmailRef.current = restoredEmail;
      loginMethodRef.current = restoredMethod;

      const params = new URLSearchParams(window.location.search);
      const ssoToken = params.get('ssoToken');
      const ssoError = params.get('ssoError');
      const magicToken = params.get('magicToken');
      const shouldLogout = params.get('logout') === '1';

      if (!ssoToken && !ssoError && !magicToken && !shouldLogout) {
        setReady(true);
        return;
      }

      window.history.replaceState({}, '', window.location.pathname);

      if (shouldLogout) {
        logout();
        setReady(true);
        return;
      }
      if (ssoToken) {
        setVerifyingAuth(true);
        const result = await verifySsoToken(ssoToken);
        if (cancelled) return;
        setVerifyingAuth(false);
        if (result.ok) {
          // `ssoToken` here is the same hub JWT verified above — reuse it as-is rather than
          // minting a new one, so it's the identical token same-origin embedded apps (e.g. Audit &
          // CAPA) can trust.
          login(result.email, ssoToken, 'sso');
        } else {
          setAuthError(result.error || 'Sign-in could not be verified.');
        }
        setReady(true);
        return;
      }
      if (ssoError) {
        setAuthError(SSO_ERROR_MESSAGES[ssoError] || 'Sign-in failed. Please try again.');
        setReady(true);
        return;
      }
      if (magicToken) {
        setVerifyingAuth(true);
        const result = await verifyMagicLink(magicToken);
        if (cancelled) return;
        setVerifyingAuth(false);
        if (result.ok && result.email && result.token) {
          login(result.email, result.token, 'direct');
        } else {
          setAuthError(result.error || 'This link is invalid or has expired.');
        }
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Runs once on mount only — login/logout are stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshProfile = useCallback(() => {
    if (!userEmail) return;
    getMyProfile(userEmail).then((p) => { if (p) setProfile(p); });
  }, [userEmail]);

  const refreshAccess = useCallback(() => {
    if (!userEmail) return;
    getMyAccess(userEmail).then((a) => { if (a) setAccess(a); });
  }, [userEmail]);

  // Fetches (or re-fetches) the real profile whenever the logged-in email changes — covers both
  // a fresh login and restoring a persisted session on app start.
  useEffect(() => {
    if (!isLoggedIn || !userEmail) {
      setProfile(null);
      setAccess(null);
      return;
    }
    getMyProfile(userEmail).then((p) => { if (p) setProfile(p); });
    getMyAccess(userEmail).then((a) => { if (a) setAccess(a); });
  }, [isLoggedIn, userEmail]);

  // `access` is otherwise only fetched once per session (above), so an app grant made by an admin
  // in Manage Access never reached an already-open tab until that person signed out and back in.
  // Re-fetching whenever the tab regains focus — the moment someone comes back to try an app again
  // after being told they don't have access yet — closes that gap without any push/polling infra.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      refreshAccess();
      refreshProfile();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshAccess, refreshProfile]);

  // 12-hour inactivity auto-logout — NOT the same thing as a real sign-out: this only clears the
  // hub's own local session (see logout's skipSsoRedirect above), it never touches an SSO
  // session. Reading/writing LAST_ACTIVITY_STORAGE_KEY (not just an in-memory timestamp) means a
  // browser tab left open overnight, or reopened after being closed, is caught too — not only a
  // tab that happened to stay running the whole 12 hours.
  useEffect(() => {
    if (!isLoggedIn) return;

    const recordActivity = () => {
      storage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now()));
    };

    const lastRecordedRaw = storage.getItem(LAST_ACTIVITY_STORAGE_KEY);
    const lastRecorded = lastRecordedRaw ? Number(lastRecordedRaw) : Date.now();
    if (Date.now() - lastRecorded > INACTIVITY_LIMIT_MS || hubTokenExpired()) {
      logout({ skipSsoRedirect: true });
      return;
    }
    if (!lastRecordedRaw) recordActivity();

    let lastWriteAt = Date.now();
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWriteAt < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWriteAt = now;
      recordActivity();
    };

    const activityEvents: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    activityEvents.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }));

    const intervalId = setInterval(() => {
      const raw = storage.getItem(LAST_ACTIVITY_STORAGE_KEY);
      const last = raw ? Number(raw) : Date.now();
      // Same local-only sign-out once the hub token itself runs out, even for an active user.
      if (Date.now() - last > INACTIVITY_LIMIT_MS || hubTokenExpired()) {
        logout({ skipSsoRedirect: true });
      }
    }, INACTIVITY_CHECK_INTERVAL_MS);

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, onActivity));
      clearInterval(intervalId);
    };
  }, [isLoggedIn, logout]);

  const value = useMemo(
    () => ({
      ready,
      isLoggedIn,
      userEmail,
      profile,
      refreshProfile,
      access,
      refreshAccess,
      login,
      logout,
      verifyingAuth,
      authError,
      dismissAuthError,
    }),
    [ready, isLoggedIn, userEmail, profile, refreshProfile, access, refreshAccess, login, logout, verifyingAuth, authError, dismissAuthError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
