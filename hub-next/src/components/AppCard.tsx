'use client';

import React, { useEffect, useState } from 'react';
import { Star, Lock } from 'lucide-react';
import type { AppItem, AppRole } from '../types';
import { colors, fonts, fontWeights, radii, appColor, motion, focusRing } from '../theme/tokens';
import { useIsMobile } from '../hooks/useColumnCount';
import { useTiltHover } from '../hooks/useTiltHover';
import StageBadge from './StageBadge';
import { useAppStages } from '../context/AppStagesContext';

interface AppCardProps {
  app: AppItem;
  isFavorite: boolean;
  isTopUsed: boolean;
  /** True when the signed-in user has no grant for this app (see useUnlockedAppIds) — the tile
   * still renders (every app is now always visible), just dimmed with a "Locked" badge instead of
   * the accent color/most-used badge. Still tappable: the caller's onPress is expected to route to
   * a "you don't have access" message rather than opening the real app. */
  locked?: boolean;
  /** The signed-in user's own role for this app (User/Admin/CQA/Depot/Finance — see
   * useAppRoles), when unlocked — shown as its own chip so someone can tell at a glance what
   * level of access they have for this app without opening it first. Undefined/null when
   * locked or not yet known. */
  role?: AppRole | null;
  onPress: (app: AppItem) => void;
  onToggleFavorite: (id: string) => void;
}

export default function AppCard({ app, isFavorite, isTopUsed, locked = false, role, onPress, onToggleFavorite }: AppCardProps) {
  const Icon = app.icon;
  const accent = locked ? colors.inkSoft : appColor(app.id);
  const isMobile = useIsMobile();
  const stage = useAppStages().stageOf(app.id);

  const [focused, setFocused] = useState(false);
  // A missing or broken preview image just drops the preview instead of leaving an empty frame.
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => setPreviewFailed(false), [app.preview]);
  const showPreview = !!app.preview && !previewFailed;
  const { ref, hovered, pressed, tiltTransform, handlers } = useTiltHover<HTMLAnchorElement>();

  const scale = pressed ? motion.pressScale : hovered ? motion.hoverScale : 1;
  const translateY = hovered && !pressed ? motion.hoverLift : 0;
  const shadowOpacity = pressed ? 0.18 : hovered ? 0.16 : 0.1;

  return (
    <a
      ref={ref}
      href={locked ? undefined : '#'}
      onClick={(e) => {
        e.preventDefault();
        if (!locked) onPress(app);
      }}
      {...(locked ? {} : handlers)}
      tabIndex={locked ? -1 : undefined}
      aria-disabled={locked || undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (!locked) handlers.onBlur();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        textDecoration: 'none',
        backgroundColor: colors.white,
        border: `1px solid ${colors.border}`,
        borderRadius: isMobile ? radii.lg : radii.xl,
        padding: isMobile ? 10 : 16,
        minHeight: isMobile ? 92 : 150,
        opacity: locked ? 0.6 : 1,
        boxShadow: hovered
          ? `0 ${pressed ? 10 : 16}px ${pressed ? 18 : 26}px 0 ${accent}${Math.round(shadowOpacity * 255).toString(16).padStart(2, '0')}`
          : `0 4px 10px 0 ${accent}${Math.round(shadowOpacity * 255).toString(16).padStart(2, '0')}`,
        transform: `${tiltTransform} translateY(${translateY}px) scale(${scale})`,
        transformStyle: 'preserve-3d',
        transition: `transform ${motion.duration.base}ms ${motion.easeSmooth}, box-shadow ${motion.duration.base}ms ${motion.easeSmooth}`,
        willChange: 'transform',
        cursor: locked ? 'not-allowed' : 'pointer',
        ...(focused ? focusRing : null),
      }}
      aria-label={locked ? `${app.name}, locked — you don't have access` : `Open ${app.name}`}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div
          style={{
            width: isMobile ? 30 : 40,
            height: isMobile ? 30 : 40,
            borderRadius: radii.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${accent}1f`,
          }}
        >
          {locked ? <Lock size={isMobile ? 14 : 17} color={accent} strokeWidth={2.1} /> : <Icon size={isMobile ? 16 : 19} color={accent} strokeWidth={2.1} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {stage && <StageBadge stage={stage} compact={isMobile} />}
        {!locked && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(app.id);
          }}
          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
          aria-label={isFavorite ? `Remove ${app.name} from favorites` : `Add ${app.name} to favorites`}
        >
          <Star size={16} color={isFavorite ? colors.amber : colors.border} fill={isFavorite ? colors.amber : 'transparent'} strokeWidth={1.8} />
        </button>
        )}
        </div>
      </div>

      {showPreview && (
        <div
          style={{
            position: 'relative',
            marginTop: isMobile ? 8 : 12,
            borderRadius: isMobile ? radii.md : radii.lg,
            overflow: 'hidden',
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.appBg,
            aspectRatio: '16 / 9',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={app.preview}
            alt={`${app.name} preview`}
            loading="lazy"
            decoding="async"
            onError={() => setPreviewFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left', display: 'block', filter: locked ? 'grayscale(1)' : undefined }}
          />
        </div>
      )}

      {/* Mobile shows the full app name (no truncation). Desktop/tablet wraps a long name onto a
          second line (e.g. "Change Control Board & CR Tracker") instead of cutting it off with an
          ellipsis; anything longer than two lines is clamped. */}
      <p
        style={{
          fontSize: isMobile ? 12.5 : 14.5,
          fontFamily: fonts.sansSemiBold,
          fontWeight: fontWeights.sansSemiBold,
          color: locked ? colors.inkSoft : colors.ink,
          marginTop: showPreview ? (isMobile ? 6 : 10) : isMobile ? 8 : 14,
          marginBottom: 0,
          lineHeight: isMobile ? '16px' : '20px',
          ...(isMobile
            ? {}
            : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }),
        }}
      >
        {app.name}
      </p>

      {locked ? (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            alignSelf: 'flex-start',
            borderRadius: radii.pill,
            padding: '2px 8px',
            marginTop: 6,
            backgroundColor: colors.appBg,
          }}
        >
          <Lock size={8} color={colors.inkSoft} strokeWidth={2.4} />
          <span style={{ fontSize: 9, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.3, textTransform: 'uppercase', color: colors.inkSoft }}>
            Locked
          </span>
        </span>
      ) : (
        (role || isTopUsed) && (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {role && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: radii.pill,
                  padding: '2px 8px',
                  backgroundColor: `${accent}20`,
                }}
              >
                <span style={{ fontSize: 9, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.3, textTransform: 'uppercase', color: accent }}>
                  Your role: {role}
                </span>
              </span>
            )}
            {isTopUsed && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: radii.pill,
                  padding: '2px 8px',
                  backgroundColor: `${accent}14`,
                }}
              >
                <span style={{ fontSize: 9, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.3, textTransform: 'uppercase', color: accent }}>
                  Most used
                </span>
              </span>
            )}
          </span>
        )
      )}

      {!isMobile && (
        <p
          style={{
            fontSize: 12.5,
            color: colors.inkSoft,
            fontFamily: fonts.sansRegular,
            lineHeight: '18px',
            marginTop: 8,
            marginBottom: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {app.desc}
        </p>
      )}
    </a>
  );
}
