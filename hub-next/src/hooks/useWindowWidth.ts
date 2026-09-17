'use client';

import { useEffect, useState } from 'react';

/** Replaces react-native's useWindowDimensions on web — every breakpoint hook in this app only
 * ever read `.width` from it, so this returns just that. Returns 0 on the server/first paint
 * (before hydration can read window.innerWidth) so every breakpoint hook consistently treats an
 * unmeasured screen as narrowest until the real width is known. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}
