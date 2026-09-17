import React from 'react';
import { colors, fonts, fontWeights, radii } from '../theme/tokens';

interface BadgeProps {
  label: string;
  color?: string;
}

export default function Badge({ label, color = colors.rust }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        alignSelf: 'flex-start',
        padding: '3px 9px',
        borderRadius: radii.pill,
        border: `1px solid ${color}55`,
        backgroundColor: `${color}22`,
        color,
        fontSize: 10.5,
        fontFamily: fonts.sansBold,
        fontWeight: fontWeights.sansBold,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}
