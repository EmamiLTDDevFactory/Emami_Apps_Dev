import React from 'react';

interface EmpAppMarkProps {
  /** Rendered width in px — height follows the logo's own aspect ratio. */
  size?: number;
}

// Real aspect ratio of public/emami-apps-logo.png (2272x1880 ≈ 1.208:1). This is the one
// "Emami Apps" logo used everywhere in the hub (also shown on the Login page) — do not swap in a
// different logo asset here, or the app goes back to showing two different logos.
const ASPECT_RATIO = 1.208;

export default function EmpAppMark({ size = 30 }: EmpAppMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/emami-apps-logo.png"
      alt="Emami Apps"
      style={{ width: size, height: size / ASPECT_RATIO, backgroundColor: '#FFFFFF', objectFit: 'contain' }}
    />
  );
}
