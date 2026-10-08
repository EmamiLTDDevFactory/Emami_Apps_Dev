import React from 'react';
import { colors, fonts, fontWeights, radii } from '../theme/tokens';

/** "LIVE" pill for apps released to production (AppItem.isLive) — a green dot with a soft pulse
 * (keyframes in globals.css, stilled under prefers-reduced-motion) so a live app reads apart from
 * one still in development at a glance. */
export default function LiveBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 5,
        borderRadius: radii.pill,
        padding: compact ? '2px 6px' : '2px 8px',
        backgroundColor: colors.greenTint,
        border: `1px solid ${colors.greenBorder}`,
        flexShrink: 0,
      }}
      title="Live in production"
    >
      <span className="live-badge-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: colors.green }} />
      <span style={{ fontSize: compact ? 8.5 : 9, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.green }}>
        Live
      </span>
    </span>
  );
}
