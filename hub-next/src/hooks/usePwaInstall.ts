'use client';

import { useEffect, useState } from 'react';

export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface PwaInstallState {
  /** Whether "install as an app" is a meaningful action here at all. */
  isSupported: boolean;
  /** Already running as an installed/standalone app. */
  isStandalone: boolean;
  /**
   * False when the page isn't served over HTTPS or localhost. Browsers refuse to ever offer an
   * install prompt in that case — no error, no event, it just silently never fires — so this
   * needs to be surfaced explicitly instead of leaving the button looking broken.
   */
  isSecureContext: boolean;
  /** iOS Safari never fires beforeinstallprompt — it needs manual Share-sheet instructions. */
  isIos: boolean;
  /** True once the browser has offered a native install prompt we can trigger. */
  canPromptInstall: boolean;
  /**
   * Set by the browser's `appinstalled` event during this page's lifetime — however the install
   * was started (our pop-up, the header button, or the browser's own address-bar icon).
   */
  justInstalled: boolean;
  clearJustInstalled: () => void;
  /** The shared install pop-up card (components/InstallPrompt.tsx) — opened by the header's
   * install button and automatically once per login. */
  installCardOpen: boolean;
  openInstallCard: () => void;
  closeInstallCard: () => void;
  /** Triggers the browser's native install prompt. No-op (returns 'unavailable') if none is queued. */
  promptInstall: () => Promise<PwaInstallOutcome>;
}

/**
 * Module-level singleton, not per-component state: `beforeinstallprompt` is a one-shot event the
 * browser fires shortly after page load (as soon as it's evaluated the manifest/service-worker),
 * and if nothing is listening when it fires it's gone for good — the browser never re-sends it.
 * Listening at module scope means the listener attaches as soon as this file is evaluated
 * (client-side, on initial bundle load), independent of when/whether any component using the hook
 * has mounted yet. Guarded for SSR/build (`typeof window === 'undefined'` during `next build`'s
 * static export pass).
 */
let deferredEvent: any = null;
let isStandalone = false;
let justInstalled = false;
let installCardOpen = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    deferredEvent = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredEvent = null;
    // Not `isStandalone = true`: this tab is still a browser tab — the installed app opens in its
    // own separate window.
    justInstalled = true;
    notify();
  });
}

export function usePwaInstall(): PwaInstallState {
  const [isSupported, setIsSupported] = useState(false);
  const [, forceRerender] = useState(0);

  useEffect(() => {
    setIsSupported(true);
    const onChange = () => forceRerender((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  // iPadOS 13+ Safari reports a desktop-Mac user agent, so /ipad/i alone
  // misses it — fall back to the touch-capable "MacIntel" trick to catch it.
  const isIos =
    isSupported &&
    (/iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1));

  const promptInstall = async (): Promise<PwaInstallOutcome> => {
    if (!deferredEvent) return 'unavailable';
    deferredEvent.prompt();
    const choice = await deferredEvent.userChoice;
    deferredEvent = null;
    notify();
    return choice.outcome;
  };

  const isSecureContext = !isSupported || window.isSecureContext;

  const clearJustInstalled = () => {
    justInstalled = false;
    notify();
  };
  const openInstallCard = () => {
    installCardOpen = true;
    notify();
  };
  const closeInstallCard = () => {
    installCardOpen = false;
    notify();
  };

  return {
    isSupported,
    isStandalone,
    isSecureContext,
    isIos,
    canPromptInstall: !!deferredEvent,
    justInstalled,
    clearJustInstalled,
    installCardOpen,
    openInstallCard,
    closeInstallCard,
    promptInstall,
  };
}

/**
 * The install pop-up opens automatically once per login (not once per page load — the hub fully
 * reloads every time someone comes back from an embedded app, and it shouldn't re-nag each time).
 * This flag records that it's been offered for the current login; AuthContext's login() clears it.
 */
const OFFERED_THIS_LOGIN_KEY = 'emami.installPrompt.offeredThisLogin';

export function installOfferedThisLogin(): boolean {
  try {
    return window.localStorage.getItem(OFFERED_THIS_LOGIN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markInstallOfferedThisLogin() {
  try {
    window.localStorage.setItem(OFFERED_THIS_LOGIN_KEY, '1');
  } catch {
    // Storage blocked (private window etc.) — it just offers again on the next page load.
  }
}

export function resetInstallOfferForNewLogin() {
  try {
    window.localStorage.removeItem(OFFERED_THIS_LOGIN_KEY);
  } catch {
    // See markInstallOfferedThisLogin.
  }
}
