import React from 'react';
import { colors, fonts, fontWeights, radii } from '../theme/tokens';
import type { AppStage } from '../types';

const STAGE_STYLE: Record<AppStage, { color: string; tint: string; border: string; title: string }> = {
  Live: { color: colors.green, tint: colors.greenTint, border: colors.greenBorder, title: 'Live in production' },
  'Partial Live': { color: colors.partial, tint: colors.partialTint, border: colors.partialBorder, title: 'Partly live in production' },
  UAT: { color: colors.uat, tint: colors.uatTint, border: colors.uatBorder, title: 'In user acceptance testing' },
  IAT: { color: colors.iat, tint: colors.iatTint, border: colors.iatBorder, title: 'In internal acceptance testing' },
  WIP: { color: colors.wip, tint: colors.wipTint, border: colors.wipBorder, title: 'Work in progress' },
};

/** Release-stage pill on an app tile (AppItem.stage). LIVE gets a soft pulsing green dot
 * (keyframes in globals.css, stilled under prefers-reduced-motion); every other stage a steady one. */
export default function StageBadge({ stage, compact = false }: { stage: AppStage; compact?: boolean }) {
  const s = STAGE_STYLE[stage];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 5,
        borderRadius: radii.pill,
        padding: compact ? '2px 6px' : '2px 8px',
        backgroundColor: s.tint,
        border: `1px solid ${s.border}`,
        flexShrink: 0,
      }}
      title={s.title}
    >
      <span className={stage === 'Live' ? 'live-badge-dot' : undefined} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: s.color }} />
      <span style={{ fontSize: compact ? 8.5 : 9, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap', color: s.color }}>
        {stage}
      </span>
    </span>
  );
}
