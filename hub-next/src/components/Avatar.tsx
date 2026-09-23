import React from 'react';
import { colors, fonts, fontWeights } from '../theme/tokens';

interface AvatarProps {
  name: string;
  size?: number;
  /** Data URI or URL of the user's uploaded profile photo — falls back to initials when absent. */
  photoUrl?: string | null;
}

export default function Avatar({ name, size = 36, photoUrl }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');

  const circleStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: size / 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  };

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} style={{ ...circleStyle, objectFit: 'cover' }} />;
  }

  return (
    <div style={{ ...circleStyle, background: `linear-gradient(135deg, ${colors.amber}, ${colors.rust})` }}>
      <span style={{ color: colors.white, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, fontSize: size * 0.38 }}>
        {initials}
      </span>
    </div>
  );
}
