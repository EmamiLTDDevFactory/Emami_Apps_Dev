'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, CheckCircle2, MailCheck } from 'lucide-react';
import { colors, fonts, fontWeights, radii } from '../../theme/tokens';
import { getMicrosoftSignInUrl, requestMagicLink, checkStillAuthorized } from '../../lib/authApi';
import { useAuth } from '../../context/AuthContext';

/**
 * One email field, one action button that redraws itself as the user types — mirrors how
 * Microsoft's own sign-in page (and Entra External ID) resolves an account before showing the
 * right next step. @emamigroup.com emails turn the button into "Sign in with Microsoft" (SAML
 * 2.0, backend/saml-sso.js — only works once the bundled Azure IdP metadata is present and
 * HUB_AUTH_SAML_ENABLED=true; until then the backend redirects back here with
 * ?ssoError=not_configured, which AuthContext turns into the "not set up yet" message). Every
 * other domain keeps the button labeled "Send Sign-In Link" for magic-link email sign-in.
 *
 * Both paths are gated by the same Manage Access check (authApi.ts's checkStillAuthorized,
 * backed by emami_apps.authorized_users) — an email must exist there and be active to log in. The
 * live debounced check below (liveStatus) calls that same function purely for the inline
 * checkmark/error feedback as you type; the actual submit still re-derives from its result rather
 * than trusting client state alone (see signInWithEmail).
 */
const SSO_DOMAIN = '@emamigroup.com';
const LIVE_CHECK_DEBOUNCE_MS = 500;

// Purely decorative accents for this page only — Login intentionally breaks from the brand
// palette here, so these stay local rather than being promoted into theme/tokens.ts.
const LOGIN_ACCENTS = {
  blobTop: '#F7B9A0',
  blobBottom: '#A9C9F5',
  blobMid: '#F5C9E0',
} as const;

// One-off hero-card radius (bigger than any step in the shared `radii` scale) — not a missing
// token, just this card's specific treatment.
const CARD_RADIUS = radii.xxxl + 6;

/** Classic four-square Microsoft glyph — lucide has no brand icon for this, so it's drawn directly. */
function MicrosoftGlyph() {
  const squares = ['#F25022', '#7FBA00', '#00A4EF', '#FFB900'];
  return (
    <span style={{ width: 16, height: 16, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {squares.map((color) => (
        <span key={color} style={{ width: 7.5, height: 7.5, backgroundColor: color }} />
      ))}
    </span>
  );
}

/** Mirrors Microsoft's own account-resolution UX: as the user finishes typing, the field/button
 * redraw themselves before any click. Manage Access is checked live for every domain, including
 * @emamigroup.com — an unregistered corporate email never gets a "Sign in with Microsoft" button
 * at all, just the same 'unauthorized' error every other domain gets. Only an *authorized*
 * corporate email resolves to 'sso'. */
type LiveStatus = 'idle' | 'checking' | 'sso' | 'authorized' | 'unauthorized';

export default function LoginPage() {
  const router = useRouter();
  const { isLoggedIn, login, authError, verifyingAuth, dismissAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState('');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');
  // Non-@emamigroup.com sign-in doesn't log the user in directly on submit — it only sends a
  // magic link (backend/magicLink.js); the actual login happens when they click it and land back
  // here with ?magicToken=, handled by AuthContext's startup effect the same way it handles
  // ?ssoToken=. @emamigroup.com is entirely unaffected — that path still goes straight to
  // Microsoft via signInWithMicrosoft below.
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn) router.replace('/');
  }, [isLoggedIn, router]);

  const trimmedEmail = email.trim().toLowerCase();
  const looksLikeEmail = /^\S+@\S+\.\S+$/.test(trimmedEmail);
  const isSsoDomain = trimmedEmail.endsWith(SSO_DOMAIN);

  // Debounced live check — same checkStillAuthorized() call authApi.ts already uses to re-verify
  // a persisted session and the post-SSO callback (verifySsoToken). Calling it here too, on a
  // timer instead of a click, is what lets the field show "not registered" (or a checkmark)
  // before the user ever presses the button — for every domain, @emamigroup.com included, so an
  // unregistered corporate email never even gets offered the Microsoft button.
  useEffect(() => {
    if (!looksLikeEmail) {
      setLiveStatus('idle');
      return;
    }
    setLiveStatus('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const authorized = await checkStillAuthorized(trimmedEmail);
      if (cancelled) return;
      if (!authorized) {
        setLiveStatus('unauthorized');
      } else {
        setLiveStatus(isSsoDomain ? 'sso' : 'authorized');
      }
    }, LIVE_CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedEmail, looksLikeEmail, isSsoDomain]);

  const signInWithMicrosoft = () => {
    window.location.href = getMicrosoftSignInUrl();
  };

  const signInWithEmail = async () => {
    setLocalError('');
    dismissAuthError();
    if (liveStatus === 'idle' || liveStatus === 'checking') return; // button is disabled here anyway

    if (liveStatus === 'sso') {
      // The live check (above) already confirmed this exact email is authorized before the
      // button ever offered "Sign in with Microsoft" — no need to re-check here.
      signInWithMicrosoft();
      return;
    }

    if (liveStatus === 'unauthorized') {
      setLocalError('This email-id is not registered. Contact your admin for access.');
      return;
    }

    setCheckingAccess(true);
    const result = await requestMagicLink(trimmedEmail);
    setCheckingAccess(false);
    if (!result.ok) {
      setLiveStatus('unauthorized');
      setLocalError(result.error || 'This email-id is not registered.');
      return;
    }
    setLinkSentTo(trimmedEmail);
  };

  const shownError = authError || localError;
  const busy = verifyingAuth || checkingAccess;
  const buttonDisabled = checkingAccess || liveStatus === 'idle' || liveStatus === 'checking';
  const fieldInvalid = liveStatus === 'unauthorized';
  const fieldValid = liveStatus === 'authorized' || liveStatus === 'sso';

  return (
    <div style={{ position: 'relative', minHeight: '100vh', backgroundColor: colors.cream2, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', borderRadius: 999, opacity: 0.22, width: 420, height: 420, backgroundColor: LOGIN_ACCENTS.blobTop, top: -200, right: -160 }} />
      <div style={{ position: 'absolute', borderRadius: 999, opacity: 0.22, width: 360, height: 360, backgroundColor: LOGIN_ACCENTS.blobBottom, bottom: -160, left: -130 }} />
      <div style={{ position: 'absolute', borderRadius: 999, opacity: 0.16, width: 300, height: 300, backgroundColor: LOGIN_ACCENTS.blobMid, top: 100, left: -130 }} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/emami-apps-logo.png" alt="Emami Apps" style={{ width: 240, height: 240 / 1.208, objectFit: 'contain', marginBottom: 20 }} />

        <div
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: colors.white,
            borderRadius: CARD_RADIUS,
            padding: '32px 28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxShadow: '0 16px 30px 0 rgba(21,17,41,0.12)',
          }}
        >
          {linkSentTo ? (
            <>
              <div style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <MailCheck size={26} color={colors.rust} />
              </div>
              <p style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 22, color: colors.ink, margin: 0 }}>Check your email</p>
              <p style={{ fontFamily: fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft, marginTop: 6, marginBottom: 0, textAlign: 'center' }}>
                We sent a sign-in link to
                <br />
                <span style={{ fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{linkSentTo}</span>
                <br />
                It expires in 15 minutes.
              </p>
              <button
                type="button"
                onClick={() => { setLinkSentTo(null); setEmail(''); setLiveStatus('idle'); }}
                style={{ marginTop: 20, background: 'none', border: 'none', cursor: 'pointer', fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, fontSize: 13, color: colors.rust }}
              >
                Use a different email
              </button>
            </>
          ) : (
            <>
              <p style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 22, color: colors.ink, margin: 0 }}>
                {busy ? 'Signing you in…' : 'Welcome back'}
              </p>
              <p style={{ fontFamily: fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft, marginTop: 6, marginBottom: 24, textAlign: 'center' }}>
                {verifyingAuth ? 'Verifying your Microsoft sign-in.' : 'Sign in with your Emami work email'}
              </p>

              {verifyingAuth ? (
                <div className="spinner" style={{ width: 22, height: 22, borderRadius: '50%', border: `3px solid ${colors.border}`, borderTopColor: colors.plumDeep, marginTop: 10 }} />
              ) : (
                <>
                  {!!shownError && (
                    <p style={{ width: '100%', fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, fontSize: 12.5, color: '#DC2626', marginTop: 4, marginBottom: 6 }}>
                      {shownError}
                    </p>
                  )}

                  <div style={{ width: '100%', position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Mail size={16} color={colors.inkSoft} style={{ position: 'absolute', left: 16 }} />
                    <input
                      style={{
                        width: '100%',
                        backgroundColor: colors.cream2,
                        border: `1px solid ${fieldInvalid ? '#DC2626' : fieldValid ? colors.rust : 'transparent'}`,
                        borderRadius: radii.pill,
                        paddingLeft: 42,
                        paddingRight: 40,
                        paddingTop: 14,
                        paddingBottom: 14,
                        fontFamily: fonts.sansMedium,
                        fontSize: 14.5,
                        color: colors.ink,
                        outline: 'none',
                      }}
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setLocalError(''); dismissAuthError(); }}
                      placeholder="you@company.com"
                      autoCapitalize="none"
                      autoCorrect="off"
                      type="email"
                      disabled={checkingAccess}
                      onKeyDown={(e) => { if (e.key === 'Enter') signInWithEmail(); }}
                    />
                    {liveStatus === 'checking' && (
                      <div className="spinner" style={{ position: 'absolute', right: 16, width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.border}`, borderTopColor: colors.inkSoft }} />
                    )}
                    {fieldValid && <CheckCircle2 size={18} color={colors.green} style={{ position: 'absolute', right: 16 }} />}
                  </div>
                  {fieldInvalid && (
                    <p style={{ width: '100%', fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, fontSize: 11.5, color: '#DC2626', marginTop: 6, marginBottom: 0 }}>
                      This email-id is not registered. Contact your admin for access.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={signInWithEmail}
                    disabled={buttonDisabled}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      borderRadius: radii.pill,
                      padding: '14px 0',
                      marginTop: 16,
                      border: liveStatus === 'sso' ? `1px solid ${colors.border}` : 'none',
                      backgroundColor: buttonDisabled ? colors.border : liveStatus === 'sso' ? colors.white : colors.rust,
                      cursor: buttonDisabled ? 'default' : 'pointer',
                      fontFamily: fonts.sansSemiBold,
                      fontWeight: fontWeights.sansSemiBold,
                      fontSize: 14.5,
                      color: buttonDisabled ? colors.inkSoft : liveStatus === 'sso' ? colors.ink : colors.white,
                    }}
                  >
                    {checkingAccess ? (
                      <div className="spinner" style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${liveStatus === 'sso' ? colors.border : 'rgba(255,255,255,0.4)'}`, borderTopColor: liveStatus === 'sso' ? colors.ink : colors.white }} />
                    ) : liveStatus === 'sso' ? (
                      <>
                        <MicrosoftGlyph />
                        Sign in with Microsoft
                      </>
                    ) : (
                      'Send Sign-In Link →'
                    )}
                  </button>
                </>
              )}

              <p style={{ marginTop: 20, fontFamily: fonts.sansRegular, fontSize: 11.5, color: colors.inkSoft, textAlign: 'center' }}>
                <span style={{ fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.rust }}>@emamigroup.com signs in with Microsoft. </span>
                No access? Contact your admin.
              </p>
            </>
          )}
        </div>
      </div>
      <style jsx>{`
        .spinner {
          animation: login-spin 0.8s linear infinite;
        }
        @keyframes login-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
