'use client';
import { useEffect } from 'react';

export const UNSAVED_TEXT = 'You have unsaved changes. If you leave this page they are lost. Leave anyway?';

/**
 * Warns before unsaved changes are lost, while `when` is true:
 *  - closing, reloading or leaving the site: the browser's own beforeunload prompt;
 *  - a click on any link inside the app (header menu, lists, Next links): a confirm dialog, the click is cancelled on "Cancel".
 * The browser's Back button inside the app cannot be intercepted reliably in the Next.js app router; it only gets the
 * beforeunload prompt when it leaves the app.
 */
export function UnsavedGuard({ when }: { when: boolean }) {
  useEffect(() => {
    if (!when) return;
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) return; // same page, hash only
      if (!window.confirm(UNSAVED_TEXT)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', onClick, true); };
  }, [when]);
  return null;
}
