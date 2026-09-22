'use client';

import { useEffect } from 'react';

/** Two small pieces of runtime PWA plumbing that only make sense client-side — everything else
 * (manifest link, theme-color, title/description/OG tags) is now handled declaratively by
 * app/layout.tsx's Metadata export instead of the runtime <head> tag injection the pre-conversion
 * app needed (Expo's web export had no editable index.html template to put them in). */
export default function PwaRuntime() {
  useEffect(() => {
    // When the browser restores this page from bfcache (e.g. hitting Back after a full-page
    // navigation into an embedded app), it can resurrect an old in-memory copy of this bundle
    // instead of the current one. Force a real reload so the page that's showing always matches
    // what's actually deployed.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return null;
}
