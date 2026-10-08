import React from 'react';
import { fonts, fontWeights, radii } from '../theme/tokens';
import { stageDef } from '../data/appStages';
import type { AppStage } from '../types';

/** Release-stage pill on an app tile (colour and long name from data/appStages.ts). LIVE gets a soft
 * pulsing dot (keyframes in globals.css, stilled under prefers-reduced-motion); every other stage a steady one. */
export default function StageBadge({ stage, compact = false }: { stage: AppStage; compact?: boolean }) {
  const s = stageDef(stage);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 5,
        borderRadius: radii.pill,
        padding: compact ? '2px 6px' : '2px 8px',
        backgroundColor: `${s.color}17`,
        border: `1px solid ${s.color}33`,
        flexShrink: 0,
      }}
      title={s.name}
    >
      <span className={stage === 'Live' ? 'live-badge-dot' : undefined} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: s.color }} />
      <span style={{ fontSize: compact ? 8.5 : 9, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap', color: s.color }}>
        {stage}
      </span>
    </span>
  );
}
