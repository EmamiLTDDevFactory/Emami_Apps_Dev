'use client';

import { useEffect, useState } from 'react';

// Matches the hub's own useIsWideScreen breakpoint and every sibling embedded app's own copy of
// this constant (see e.g. fm-po-deviation/src/components/Shell.tsx) — the side pane docks
// permanently at the same viewport width every other app in this hub does.
const WIDE_BREAKPOINT = 768;

/** JS-driven (not pure CSS-media-query) wide-screen check, same as every sibling embedded app's
 * own Shell — this is what actually drives whether the sidebar renders docked-permanent or as an
 * overlay drawer, so the two stay in sync with no separate CSS breakpoint to keep aligned. */
export function useIsWideScreen(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= WIDE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return wide;
}
