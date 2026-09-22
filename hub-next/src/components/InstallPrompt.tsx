'use client';

import React, { useEffect, useState } from 'react';
import { MonitorDown, CheckCircle2, X } from 'lucide-react';
import { colors, fonts, fontWeights, radii, shadows } from '../theme/tokens';
import { usePwaInstall, installOfferedThisLogin, markInstallOfferedThisLogin } from '../hooks/usePwaInstall';

/**
 * The "Install Emami Apps on this computer" pop-up — same pattern as emamianalytics.in. Opens
 * automatically once per login (desktop/laptop only), and from the header's install button on
 * any device.
 *
 * A web page can't itself create a desktop shortcut, pin to the taskbar or add a bookmark; the
 * browser's native PWA install does the first two (Chrome/Edge on Windows create the desktop +
 * Start-menu shortcut, and Edge/Chrome offer "Pin to taskbar" in their post-install dialog). So
 * this pop-up's job is to surface that native install, then tell people how to pin/bookmark once
 * it's done. Where the browser hasn't offered a native install (already installed, Firefox/Safari,
 * iOS, non-HTTPS), the header button's pop-up shows manual instructions instead.
 */

const SHOW_DELAY_MS = 1500;

function isDesktop() {
  const ua = window.navigator.userAgent;
  if (/android|iphone|ipad|ipod|mobi/i.test(ua)) return false;
  // iPadOS 13+ reports a desktop-Mac UA — same trick as usePwaInstall's isIos.
  if (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1) return false;
  return true;
}

function isMac() {
  return /mac/i.test(window.navigator.platform || window.navigator.userAgent);
}

export default function InstallPrompt() {
  const pwa = usePwaInstall();
  const [autoEligible, setAutoEligible] = useState(false);

  useEffect(() => {
    setAutoEligible(isDesktop() && !installOfferedThisLogin());
  }, []);

  // `beforeinstallprompt` can arrive before or after this mounts — wait until it has (no point
  // auto-offering an install the browser can't perform, e.g. when it's already installed), plus a
  // short beat so the pop-up doesn't land on top of the dashboard's first paint.
  const canAutoOffer = autoEligible && pwa.canPromptInstall && !pwa.isStandalone;
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
              {mac
                ? 'It now opens in its own window and is in your Applications (Launchpad). To keep it in the Dock: right-click its Dock icon → Options → Keep in Dock.'
                : 'A shortcut has been added to your desktop and Start menu. To pin it: right-click the Emami Apps icon on the taskbar → Pin to taskbar.'}
            </Body>
            <Body style={{ marginTop: 8 }}>
              Want a browser bookmark too? Press <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd> + <Kbd>D</Kbd>.
            </Body>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <PrimaryButton onClick={pwa.clearJustInstalled}>Got it</PrimaryButton>
        </div>
      </Card>
    );
  }

  if (!pwa.installCardOpen) return null;

  const fallback = pwa.canPromptInstall
    ? null
    : pwa.isStandalone
      ? 'Emami Apps is already installed on this device.'
      : !pwa.isSecureContext
        ? "This page was opened over an insecure connection (not HTTPS), so browsers block app installs here. Open the app's regular https:// address (or http://localhost during development) and try again."
        : pwa.isIos
          ? 'Tap the Share icon in Safari (the square with an arrow), then choose "Add to Home Screen".'
          : 'If Emami Apps is already installed, open it from your desktop shortcut or Start menu. Otherwise look for the install icon (⊕ or a monitor with an arrow) at the right of your browser\'s address bar — or open the browser\'s ⋮ menu and choose "Install Emami Apps". (Chrome or Edge recommended.)';

  return (
    <Card onClose={pwa.closeInstallCard}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: radii.md, flexShrink: 0, border: `1px solid ${colors.border}` }} />
        <div>
          <Title>Install Emami Apps on this computer</Title>
          <Body>
            {fallback ??
              'Get a desktop shortcut and open Emami Apps in its own window, one click from your taskbar, without searching for the site.'}
          </Body>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        {fallback ? (
          <PrimaryButton onClick={pwa.closeInstallCard}>OK</PrimaryButton>
        ) : (
          <>
            <button type="button" onClick={pwa.closeInstallCard} style={secondaryButton}>
              Not now
            </button>
            <PrimaryButton onClick={install}>
              <MonitorDown size={16} /> Install
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
