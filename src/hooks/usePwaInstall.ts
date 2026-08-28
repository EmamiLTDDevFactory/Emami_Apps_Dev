import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface PwaInstallState {
  /** Whether "install as an app" is a meaningful action on this platform at all (web only). */
  isSupported: boolean;
  /** Already running as an installed/standalone app. */
  isStandalone: boolean;
  /**
   * False when the page isn't served over HTTPS or localhost (e.g. opened via
   * a plain-http LAN address like `expo start --lan` gives you). Browsers
   * refuse to ever offer an install prompt in that case — no error, no
   * event, it just silently never fires — so this needs to be surfaced
   * explicitly instead of leaving the button looking broken.
   */
  isSecureContext: boolean;
  /** iOS Safari never fires beforeinstallprompt — it needs manual Share-sheet instructions. */
  isIos: boolean;
  /** True once the browser has offered a native install prompt we can trigger. */
  canPromptInstall: boolean;
  /** Triggers the browser's native install prompt. No-op (returns 'unavailable') if none is queued. */
  promptInstall: () => Promise<PwaInstallOutcome>;
}

const isWeb = Platform.OS === 'web';

/**
 * Module-level singleton, not per-component state: `beforeinstallprompt` is a one-shot event the
 * browser fires shortly after page load (as soon as it's evaluated the manifest/service-worker),
 * and if nothing is listening when it fires it's gone for good — the browser never re-sends it.
 * The only consumer of this hook is Header.tsx, which only mounts once a user is past LoginScreen
 * (see RootNavigator) — i.e. well after the browser has likely already fired and dropped the event.
 * Listening here at module scope instead means the listener attaches as soon as this file is
 * evaluated, which happens at initial bundle load (this is a single, non-code-split bundle),
 * independent of when/whether any component using the hook has mounted yet.
 */
let deferredEvent: any = null;
let isStandalone = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (isWeb && typeof window !== 'undefined') {
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
    isStandalone = true;
    notify();
  });
}

export function usePwaInstall(): PwaInstallState {
  const isSupported = isWeb;
  const [, forceRerender] = useState(0);

  useEffect(() => {
    if (!isSupported) return;
    const onChange = () => forceRerender((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, [isSupported]);

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

  return { isSupported, isStandalone, isSecureContext, isIos, canPromptInstall: !!deferredEvent, promptInstall };
}
