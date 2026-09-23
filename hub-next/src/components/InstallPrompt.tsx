'use client';

import React, { useEffect, useState } from 'react';
import { MonitorDown, Smartphone, CheckCircle2, X } from 'lucide-react';
import { colors, fonts, fontWeights, radii, shadows } from '../theme/tokens';
import { usePwaInstall, installOfferedThisLogin, markInstallOfferedThisLogin } from '../hooks/usePwaInstall';

/**
 * The "Install Emami Apps" pop-up — same pattern as emamianalytics.in. Opens automatically once
 * per login, and from the header's install button.
 *
 * A web page can't itself create a desktop/home-screen shortcut, pin to the taskbar or add a
 * bookmark. What it can do per platform:
 *  - Desktop Chrome/Edge and Android Chrome/Edge/Samsung Internet: trigger the browser's native
 *    PWA install, which creates the shortcut (desktop + Start menu on Windows, home screen + app
 *    drawer on Android; Edge/Chrome also offer "Pin to taskbar"). Then we explain pin/bookmark.
 *  - iOS/iPadOS (Safari, and Chrome/Edge on iOS 16.4+): Apple exposes no install API at all, so
 *    the pop-up walks through the Share -> "Add to Home Screen" taps for that browser instead.
 *  - Anywhere else the browser hasn't offered a native install (already installed, Firefox,
 *    non-HTTPS): manual instructions, from the header button only.
 */

const SHOW_DELAY_MS = 1500;

type Platform = 'desktop' | 'android' | 'ios';

function detectPlatform(): Platform {
  const ua = window.navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports a desktop-Mac UA — same trick as usePwaInstall's isIos.
  if (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

function isMac() {
  return /mac/i.test(window.navigator.platform || window.navigator.userAgent);
}

/** The iOS browser's own steps to "Add to Home Screen" — every iOS browser is WebKit, but each
 * puts the Share button somewhere different. */
function iosSteps(): string[] {
  const ua = window.navigator.userAgent;
  const isIpad = !/iphone|ipod/i.test(ua);
  if (/CriOS|EdgiOS/i.test(ua)) {
    return [
      'Tap the Share icon (square with an arrow) at the right of the address bar.',
      'Scroll down and tap "Add to Home Screen" (under "More" if you don\'t see it).',
      'Tap "Add" — the Emami Apps icon appears on your home screen.',
    ];
  }
  if (/FxiOS/i.test(ua)) {
    return [
      'Tap the ☰ menu, then "Share".',
      'Tap "Add to Home Screen".',
      'Tap "Add" — the Emami Apps icon appears on your home screen.',
    ];
  }
  return [
    `Tap the Share icon (square with an arrow) ${isIpad ? 'at the top of the screen' : 'in the bar at the bottom of the screen'}.`,
    'Scroll down and tap "Add to Home Screen".',
    'Tap "Add" — the Emami Apps icon appears on your home screen.',
  ];
}

export default function InstallPrompt() {
  const pwa = usePwaInstall();
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [autoEligible, setAutoEligible] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setAutoEligible(!installOfferedThisLogin());
  }, []);

  const isPhone = platform !== 'desktop';

  // Only auto-offer something actionable: a native install the browser has queued (desktop and
  // Android — it's never queued once already installed), or the iOS Add-to-Home-Screen steps when
  // not already running from the home screen. `beforeinstallprompt` can arrive before or after
  // this mounts; the short delay keeps the pop-up off the dashboard's first paint.
  const canAutoOffer =
    autoEligible && !pwa.isStandalone && (pwa.canPromptInstall || (platform === 'ios' && pwa.isSecureContext));
  useEffect(() => {
    if (!canAutoOffer) return;
    const t = window.setTimeout(() => {
      markInstallOfferedThisLogin();
      setAutoEligible(false);
      pwa.openInstallCard();
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoOffer]);

  const install = async () => {
    pwa.closeInstallCard();
    await pwa.promptInstall();
  };

  if (pwa.justInstalled) {
    const mac = isMac();
    return (
      <Card onClose={pwa.clearJustInstalled}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CheckCircle2 size={22} color={colors.green} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <Title>Emami Apps is installed</Title>
            <Body>
              {isPhone
                ? 'The Emami Apps icon has been added to your home screen and app drawer. Open it from there — it runs full-screen, like any other app.'
                : mac
                  ? 'It now opens in its own window and is in your Applications (Launchpad). To keep it in the Dock: right-click its Dock icon → Options → Keep in Dock.'
                  : 'A shortcut has been added to your desktop and Start menu. To pin it: right-click the Emami Apps icon on the taskbar → Pin to taskbar.'}
            </Body>
            {!isPhone && (
              <Body style={{ marginTop: 8 }}>
                Want a browser bookmark too? Press <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd> + <Kbd>D</Kbd>.
              </Body>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <PrimaryButton onClick={pwa.clearJustInstalled}>Got it</PrimaryButton>
        </div>
      </Card>
    );
  }

  if (!pwa.installCardOpen) return null;

  const title = isPhone ? 'Add Emami Apps to your home screen' : 'Install Emami Apps on this computer';
  const offer = isPhone
    ? 'Get an Emami Apps icon on your home screen that opens it full-screen, like any other app — no need to find the website each time.'
    : 'Get a desktop shortcut and open Emami Apps in its own window, one click from your taskbar, without searching for the site.';

  const steps = !pwa.isStandalone && pwa.isSecureContext && platform === 'ios' ? iosSteps() : null;
  // Chrome/Edge/Firefox on iOS only got "Add to Home Screen" in iOS 16.4 — on older iPhones it's
  // Safari-only, so point people there if the option is missing.
  const nonSafariIos = steps !== null && /CriOS|EdgiOS|FxiOS/i.test(window.navigator.userAgent);

  const fallback = pwa.canPromptInstall || steps
    ? null
    : pwa.isStandalone
      ? 'Emami Apps is already installed on this device.'
      : !pwa.isSecureContext
        ? "This page was opened over an insecure connection (not HTTPS), so browsers block app installs here. Open the app's regular https:// address (or http://localhost during development) and try again."
        : platform === 'android'
          ? 'If Emami Apps is already on your home screen, open it from there. Otherwise open the browser\'s ⋮ menu (top right) and tap "Add to Home screen" or "Install app". (Chrome recommended.)'
          : 'If Emami Apps is already installed, open it from your desktop shortcut or Start menu. Otherwise look for the install icon (⊕ or a monitor with an arrow) at the right of your browser\'s address bar — or open the browser\'s ⋮ menu and choose "Install Emami Apps". (Chrome or Edge recommended.)';

  return (
    <Card onClose={pwa.closeInstallCard}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: radii.md, flexShrink: 0, border: `1px solid ${colors.border}` }} />
        <div>
          <Title>{title}</Title>
          {steps ? (
            <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {steps.map((step) => (
                <li key={step} style={{ fontSize: 12.5, lineHeight: '18px', fontFamily: fonts.sansRegular, color: colors.inkSoft, marginBottom: 4 }}>
                  {step}
                </li>
              ))}
            </ol>
          ) : null}
          {steps && nonSafariIos ? (
            <Body style={{ marginTop: 4 }}>
              Don&apos;t see &quot;Add to Home Screen&quot;? Your iPhone may be older than iOS 16.4 — open{' '}
              <strong style={{ color: colors.ink }}>{window.location.host}</strong> in Safari, tap the Share icon, then &quot;Add to Home Screen&quot;.
            </Body>
          ) : null}
          {steps ? null : <Body>{fallback ?? offer}</Body>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        {steps || fallback ? (
          <PrimaryButton onClick={pwa.closeInstallCard}>{steps ? 'Got it' : 'OK'}</PrimaryButton>
        ) : (
          <>
            <button type="button" onClick={pwa.closeInstallCard} style={secondaryButton}>
              Not now
            </button>
            <PrimaryButton onClick={install}>
              {isPhone ? <Smartphone size={16} /> : <MonitorDown size={16} />} {isPhone ? 'Add to home screen' : 'Install'}
            </PrimaryButton>
          </>
        )}
      </div>
    </Card>
  );
}

function Card({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-label="Install Emami Apps"
      style={{
        position: 'fixed',
        top: 64,
        right: 16,
        width: 'min(360px, calc(100vw - 32px))',
        backgroundColor: colors.white,
        borderRadius: radii.xl,
        border: `1px solid ${colors.border}`,
        boxShadow: shadows.xl,
        padding: 16,
        zIndex: 90,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{ position: 'absolute', top: 8, right: 8, padding: 4, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
      >
        <X size={16} color={colors.inkSoft} />
      </button>
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 20px 4px 0', fontSize: 14.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>
      {children}
    </p>
  );
}

function Body({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ margin: 0, fontSize: 12.5, lineHeight: '18px', fontFamily: fonts.sansRegular, color: colors.inkSoft, ...style }}>
      {children}
    </p>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{ padding: '1px 5px', borderRadius: 4, border: `1px solid ${colors.border}`, backgroundColor: colors.cream, fontSize: 11.5, fontFamily: 'inherit', color: colors.ink }}>
      {children}
    </kbd>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        borderRadius: radii.md,
        border: 'none',
        cursor: 'pointer',
        backgroundColor: colors.rust,
        color: colors.white,
        fontSize: 13,
        fontFamily: fonts.sansSemiBold,
        fontWeight: fontWeights.sansSemiBold,
      }}
    >
      {children}
    </button>
  );
}

const secondaryButton: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: radii.md,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.white,
  cursor: 'pointer',
  color: colors.ink,
  fontSize: 13,
  fontFamily: fonts.sansRegular,
};
