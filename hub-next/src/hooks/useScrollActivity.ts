import { useEffect, useState } from 'react';

// Module-level so any screen's scroll container can report drag/momentum activity and any
// component (ticker animation, header typewriter effect) can pause expensive work
// while it's happening — mobile web has a single UI thread, so anything still
// animating during a touch-scroll competes directly with the scroll gesture.
let isScrolling = false;
const listeners = new Set<(v: boolean) => void>();

export function setScrollActivity(scrolling: boolean) {
  if (isScrolling === scrolling) return;
  isScrolling = scrolling;
  listeners.forEach((listener) => listener(scrolling));
}

export function useIsScrolling(): boolean {
  const [value, setValue] = useState(isScrolling);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
