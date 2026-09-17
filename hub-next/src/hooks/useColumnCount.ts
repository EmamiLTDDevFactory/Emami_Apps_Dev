import { useWindowWidth } from './useWindowWidth';

// Breakpoints for the app-launcher grid specifically. Kept separate from
// useIsWideScreen (which drives the drawer mode) since that hook's single
// 768px breakpoint is a different concern with its own consumers.
const MEDIUM_BREAKPOINT = 480;
const WIDE_BREAKPOINT = 1024;

export function useColumnCount() {
  const width = useWindowWidth();
  if (width >= WIDE_BREAKPOINT) return 4;
  if (width >= MEDIUM_BREAKPOINT) return 3;
  return 2;
}

/** Below the same phone/tablet boundary useColumnCount already treats as "narrowest" (2-column)
 * — used where a component needs a tighter, mobile-only layout (smaller padding, no text
 * truncation) rather than just fewer columns. Kept as its own hook (not folded into
 * useColumnCount's return) since not every caller needs the column count too. */
export function useIsMobile() {
  const width = useWindowWidth();
  return width > 0 && width < MEDIUM_BREAKPOINT;
}
