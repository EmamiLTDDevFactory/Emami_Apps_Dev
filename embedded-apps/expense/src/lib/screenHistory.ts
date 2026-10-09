'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// In-app screen history for the "Back" control in the Shell. Tabs switch with <Link replace> (no
// window.history entries), so window.history.back() alone would skip tab switches — this keeps
// its own list of visited in-app locations (pathname + search, WITHOUT basePath, exactly as the
// next/navigation hooks return them) in sessionStorage. It never touches window.history itself,
// so the browser's own back button behaves exactly as before.
const STORAGE_KEY = 'emami_back_stack_expense';
const MAX_ENTRIES = 50;
/** Locations never recorded (none for this app). */
const IGNORED: ReadonlySet<string> = new Set();

let skipLocation: string | null = null;
let entryChecked = false;
let browserNavigated = false;
let popListening = false;
function listenForBrowserNavigation() {
  if (popListening || typeof window === 'undefined') return;
  popListening = true;
  window.addEventListener('popstate', () => {
    browserNavigated = true;
  });
}

function readStack(): string[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack.slice(-MAX_ENTRIES)));
  } catch {
    /* storage unavailable — Back just falls back to window.history */
  }
}

/** A fresh entry into the app (typed URL / link from the hub, not a reload or browser back/forward)
 * starts a new list, so Back never jumps to a screen from an earlier visit in the same tab. */
function resetOnFreshEntry() {
  if (entryChecked) return;
  entryChecked = true;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.type === 'navigate') writeStack([]);
  } catch {
    /* ignore */
  }
}

/** Renders nothing; mount once in the Shell, inside a <Suspense> (useSearchParams + static export). */
export function ScreenHistoryTracker() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';

  useEffect(() => {
    if (!pathname) return;
    resetOnFreshEntry();
    listenForBrowserNavigation();
    const loc = search ? `${pathname}?${search}` : pathname;
    if (skipLocation !== null) {
      const skip = skipLocation;
      skipLocation = null;
      if (skip === loc) return;
    }
    if (IGNORED.has(loc)) return;
    const stack = readStack();
    if (stack[stack.length - 1] === loc) return;
    // The browser's own back button landing on the screen just before the current one is a step
    // back, not a new visit (a deliberate A -> B -> A click is still recorded as a visit).
    const fromBrowser = browserNavigated;
    browserNavigated = false;
    if (fromBrowser && stack[stack.length - 2] === loc) {
      stack.pop();
      writeStack(stack);
      return;
    }
    stack.push(loc);
    writeStack(stack);
  }, [pathname, search]);

  return null;
}

/** Returns the Back handler: previous in-app screen, else browser back, else the hub. */
export function useScreenBack() {
  const router = useRouter();
  return useCallback(() => {
    const stack = readStack();
    stack.pop(); // the current screen
    writeStack(stack);
    const prev = stack[stack.length - 1];
    if (prev) {
      skipLocation = prev;
      router.replace(prev);
      return;
    }
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/';
  }, [router]);
}
