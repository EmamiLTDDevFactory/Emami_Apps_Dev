'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, CheckCircle2, MailCheck } from 'lucide-react';
import { colors, fonts, fontWeights } from '../../theme/tokens';
import { getMicrosoftSignInUrl, requestMagicLink, checkStillAuthorized } from '../../lib/authApi';
import { useAuth, getLastLoginEmail } from '../../context/AuthContext';

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

// One-off hero-card radius (bigger than any step in the shared `radii` scale) — not a missing
// token, just this card's specific treatment.
const CARD_RADIUS = 32;

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

const SIGNIN_STEPS = ['Verifying your Microsoft sign-in', 'Checking your access', 'Loading your apps', 'Almost there'];

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
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    if (!verifyingAuth) { setStepIdx(0); return; }
    const t = setInterval(() => setStepIdx((i) => Math.min(i + 1, SIGNIN_STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, [verifyingAuth]);

  useEffect(() => {
    if (isLoggedIn) router.replace('/');
  }, [isLoggedIn, router]);

  // Pre-fill the email: a ?email= link (e.g. sent to a vendor) wins, otherwise the last email that
  // signed in on this browser. Read after mount - localStorage/the URL don't exist during the static
  // export's prerender. Only fills an empty field, never overwrites what the user has typed; the
  // live access check below then runs on it as if it had been typed.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('email') || '';
    const prefill = (fromLink || getLastLoginEmail()).trim();
    if (prefill) setEmail((cur) => cur || prefill);
  }, []);

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
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #F8F7FB 0%, #EFEDF9 100%)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(21,17,41,0.07) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
      <div style={{ position: 'absolute', width: 620, height: 620, borderRadius: 999, left: '12%', top: '30%', background: 'radial-gradient(circle, rgba(139,111,245,0.32) 0%, rgba(139,111,245,0) 68%)' }} />
      <div style={{ position: 'absolute', width: 560, height: 560, borderRadius: 999, right: '4%', bottom: '4%', background: 'radial-gradient(circle, rgba(245,201,224,0.35) 0%, rgba(245,201,224,0) 68%)' }} />

      <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 430,
            backgroundColor: colors.white,
            borderRadius: CARD_RADIUS,
            padding: '44px 40px 36px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxShadow: '0 30px 70px -12px rgba(79,63,214,0.22), 0 4px 14px rgba(21,17,41,0.05)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/emami-apps-logo.png" alt="Emami Apps" className={verifyingAuth ? 'pulse' : undefined} style={{ width: 200, height: 'auto', marginBottom: 20 }} />
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
              <p style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 28, color: colors.ink, margin: 0 }}>
                {busy ? 'Signing you in…' : 'Welcome back'}
              </p>
              <p style={{ fontFamily: fonts.sansRegular, fontSize: 15, color: colors.inkSoft, marginTop: 8, marginBottom: 30, textAlign: 'center' }}>
                {verifyingAuth ? SIGNIN_STEPS[stepIdx] + '…' : 'Sign in with your Microsoft work account'}
              </p>

              {verifyingAuth ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, marginTop: 6, marginBottom: 6 }}>
                  <div className="orbit" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    {SIGNIN_STEPS.map((_, i) => (
                      <span key={i} style={{ width: i === stepIdx ? 22 : 7, height: 7, borderRadius: 4, background: i <= stepIdx ? 'linear-gradient(90deg,#6D5BF5,#E879B9)' : '#E4E0F5', transition: 'all .4s ease' }} />
                    ))}
                  </div>
                  <div className="bar"><div className="barFill" /></div>
                </div>
              ) : (
                <>
                  {!!shownError && (
                    <p style={{ width: '100%', fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, fontSize: 12.5, color: '#DC2626', marginTop: 4, marginBottom: 6 }}>
                      {shownError}
                    </p>
                  )}

                  <div style={{ width: '100%', position: 'relative', display: 'flex', alignItems: 'center', padding: 3, borderRadius: 22, background: fieldInvalid ? '#FCA5A5' : 'linear-gradient(90deg, #C9BDFB, #F7C6DE)' }}>
                    <div style={{ position: 'absolute', inset: 3, borderRadius: 19, backgroundColor: colors.white }} />
                    <Mail size={18} color={colors.inkSoft} style={{ position: 'absolute', left: 20 }} />
                    <input
                      style={{
                        width: '100%',
                        position: 'relative',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: 19,
                        paddingLeft: 56,
                        paddingRight: 48,
                        paddingTop: 18,
                        paddingBottom: 18,
                        fontFamily: fonts.sansMedium,
                        fontSize: 16,
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
                      <div className="spinner" style={{ position: 'absolute', right: 20, width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.border}`, borderTopColor: colors.inkSoft }} />
                    )}
                    {fieldValid && <CheckCircle2 size={20} color={colors.green} style={{ position: 'absolute', right: 20 }} />}
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
                      borderRadius: 20,
                      padding: '19px 0',
                      marginTop: 16,
                      border: liveStatus === 'sso' ? `2px solid ${colors.ink}55` : 'none',
                      backgroundColor: buttonDisabled ? colors.border : liveStatus === 'sso' ? colors.white : colors.rust,
                      cursor: buttonDisabled ? 'default' : 'pointer',
                      fontFamily: fonts.sansSemiBold,
                      fontWeight: fontWeights.sansSemiBold,
                      fontSize: 17,
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

              <p style={{ marginTop: 24, fontFamily: fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft, textAlign: 'center' }}>
                Use your Emami Microsoft account. No access? Contact IT.
              </p>
            </>
          )}
        </div>

        <div style={{ marginTop: 36, textAlign: 'center', fontFamily: fonts.sansRegular, color: colors.inkSoft }}>
          <p style={{ margin: 0, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 14, letterSpacing: 0.3 }}>Emami Apps</p>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>Powered by AI · © 2026 Emami Group</p>
        </div>
      </div>
      <style jsx>{`
        .orbit {
          width: 54px;
          height: 54px;
          border-radius: 50%;
          background: conic-gradient(from 0deg, rgba(109, 91, 245, 0) 0%, #6d5bf5 55%, #e879b9 100%);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
          animation: login-spin 1s linear infinite;
          filter: drop-shadow(0 4px 10px rgba(109, 91, 245, 0.35));
        }
        .bar {
          width: 100%;
          height: 4px;
          border-radius: 4px;
          background: #ece9f8;
          overflow: hidden;
        }
        .barFill {
          width: 40%;
          height: 100%;
          border-radius: 4px;
          background: linear-gradient(90deg, #6d5bf5, #e879b9);
          animation: login-slide 1.3s ease-in-out infinite;
        }
        .pulse {
          animation: login-pulse 1.8s ease-in-out infinite;
        }
        @keyframes login-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(260%); }
        }
        @keyframes login-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(109, 91, 245, 0)); }
          50% { transform: scale(1.05); filter: drop-shadow(0 8px 18px rgba(109, 91, 245, 0.35)); }
        }
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
