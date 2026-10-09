import { useEffect } from 'react';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';

// In-app screen history for the layout's "Back" control. The side pane switches sections with
// router.replace (no window.history entries), so window.history.back() alone would skip those
// switches — this keeps its own list of visited in-app locations (pathname + search, as Expo
// Router's hooks return them) in sessionStorage. It never touches window.history itself, so the
// browser's own back button behaves exactly as before.
const STORAGE_KEY = 'emami_back_stack_market-rate';
const MAX_ENTRIES = 50;

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

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function readStack(): string[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(stack.slice(-MAX_ENTRIES)));
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

function toSearch(params: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  Object.keys(params)
    .filter((k) => !k.startsWith('__EXPO_ROUTER'))
    .sort()
    .forEach((k) => {
      const v = params[k];
      (Array.isArray(v) ? v : v === undefined ? [] : [v]).forEach((x) => qs.append(k, x));
    });
  return qs.toString();
}

/** Call once from the app's _layout (present on every screen). */
export function useScreenHistoryTracker() {
  const pathname = usePathname();
  const search = toSearch(useGlobalSearchParams() as Record<string, string | string[] | undefined>);

  useEffect(() => {
    if (!pathname || !storage()) return;
    resetOnFreshEntry();
    listenForBrowserNavigation();
    const loc = search ? `${pathname}?${search}` : pathname;
    if (skipLocation !== null) {
      const skip = skipLocation;
      skipLocation = null;
      if (skip === loc) return;
    }
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
}

/** Back: previous in-app screen, else browser back, else the hub. */
export function goScreenBack() {
  const stack = readStack();
  stack.pop(); // the current screen
  writeStack(stack);
  const prev = stack[stack.length - 1];
  if (prev) {
    skipLocation = prev;
    router.replace(prev as any);
    return;
  }
  if (typeof window === 'undefined') return;
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/';
}
