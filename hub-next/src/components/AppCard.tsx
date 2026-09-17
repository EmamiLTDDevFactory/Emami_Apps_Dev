'use client';

import React, { useState } from 'react';
import { Star, Lock } from 'lucide-react';
import type { AppItem, AppRole } from '../types';
import { colors, fonts, fontWeights, radii, appColor, motion, focusRing } from '../theme/tokens';
import { useIsMobile } from '../hooks/useColumnCount';

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

  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);

  const scale = pressed ? motion.pressScale : hovered ? motion.hoverScale : 1;
  const translateY = hovered && !pressed ? motion.hoverLift : 0;
  const shadowOpacity = pressed ? 0.18 : hovered ? 0.14 : 0.1;

  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onPress(app);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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
        boxShadow: `0 4px 10px 0 ${accent}${Math.round(shadowOpacity * 255).toString(16).padStart(2, '0')}`,
        transform: `translateY(${translateY}px) scale(${scale})`,
        transition: `transform ${motion.duration.fast}ms ease-out, box-shadow ${motion.duration.fast}ms ease-out`,
        cursor: 'pointer',
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
      </div>

      {/* Mobile shows the full app name (no truncation) — desktop/tablet keeps the
          single-line-with-ellipsis it already had, since card width there is generous enough that
          a long name truncating was never actually a problem there. */}
      <p
        style={{
          fontSize: isMobile ? 12.5 : 14.5,
          fontFamily: fonts.sansSemiBold,
          fontWeight: fontWeights.sansSemiBold,
          color: locked ? colors.inkSoft : colors.ink,
          marginTop: isMobile ? 8 : 14,
          marginBottom: 0,
          lineHeight: isMobile ? '16px' : 'normal',
          ...(isMobile
            ? {}
            : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
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
