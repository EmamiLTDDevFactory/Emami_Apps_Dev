/**
 * Gate Entry is desktop-only. True on a phone or tablet: mobile/tablet user agents, iPadOS (reports as a Mac but has
 * touch), or a touch-only device (coarse primary pointer, no hover) with a handheld-sized screen. Client-side check.
 */
export function isPhoneOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|PlayBook|BlackBerry|Opera Mini|IEMobile|webOS/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  const touchOnly = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches;
  return touchOnly && Math.min(window.screen.width, window.screen.height) < 1024;
}
