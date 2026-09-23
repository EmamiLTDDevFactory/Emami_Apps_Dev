import { useWindowWidth } from './useWindowWidth';

const WIDE_BREAKPOINT = 768;

export function useIsWideScreen() {
  return useWindowWidth() >= WIDE_BREAKPOINT;
}
