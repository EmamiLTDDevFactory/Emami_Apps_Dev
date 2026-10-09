'use client';

import React, { useRef } from 'react';
import { LayoutGrid, Grid3x3, Lock, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DashboardHero from '../../components/DashboardHero';
import { useAuth } from '../../context/AuthContext';
import { useUnlockedAppIds } from '../../hooks/useAppAccess';
import { useRecentApps } from '../../hooks/useRecentApps';
import { useIsWideScreen } from '../../hooks/useIsWideScreen';
import { setScrollActivity } from '../../hooks/useScrollActivity';
import { logEvent } from '../../lib/authApi';
import { APPS, CATEGORIES, appById } from '../../data/mockData';
import { CATEGORY_ICONS, CATEGORY_DESCRIPTIONS, SIMPLE_ICON_FIT, categoryIconFit, type IconFit } from '../../data/categoryMeta';
import type { CategoryIcon } from '../../components/CategoryIcons';
import { colors, fonts, fontWeights, radii, appColor, catColor, categoryTint, motion } from '../../theme/tokens';
import { useTiltHover } from '../../hooks/useTiltHover';
import type { AppItem, AppStage, CategoryFilter } from '../../types';
import StageBadge from '../../components/StageBadge';
import { useAppStages } from '../../context/AppStagesContext';

/** A Home card (category or Recently Used), styled after the reference Emami Apps home screen:
 * white card, pale accent-tinted icon chip, bold name, one-line description, and a lock (no
 * access) or arrow (open) in the bottom-right corner. Tilts toward the cursor and lifts its
 * shadow on hover (see useTiltHover). Kept as its own component since a tilt hook needs one hook
 * instance per tile. */
function HoverTile({
  compact, accent, locked, onClick, ariaLabel, title, icon: Icon, iconFit = SIMPLE_ICON_FIT, name, subtitle, stage,
}: {
  /** Mobile sizing — smaller padding/chip/type so two cards still fit side by side on a phone. */
  compact: boolean;
  accent: string;
  locked?: boolean;
  onClick: () => void;
  ariaLabel: string;
  title?: string;
  icon: CategoryIcon;
  /** Size and line weight inside the chip — see categoryIconFit. */
  iconFit?: IconFit;
  name: string;
  subtitle: string;
  /** Release-stage badge in the top-right corner (app tiles only, see AppItem.stage). */
  stage?: AppStage;
}) {
  const { ref, hovered, tiltTransform, handlers } = useTiltHover<HTMLButtonElement>();
  const active = hovered && !locked;
  const scale = active ? motion.hoverScale : 1;
  const chip = compact ? 40 : 48;

  return (
    <button
      ref={ref}
      type="button"
      disabled={locked}
      onClick={onClick}
      {...(locked ? {} : handlers)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        textAlign: 'left',
        minWidth: 0,
        padding: compact ? '14px 14px 30px' : '20px 20px 36px',
        backgroundColor: colors.white,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.xxxl,
        boxShadow: active ? `0 14px 28px 0 ${accent}22` : '0 2px 6px 0 rgba(31,27,51,0.04)',
        cursor: locked ? 'not-allowed' : 'pointer',
        transform: locked ? undefined : `${tiltTransform} scale(${scale})`,
        transformStyle: 'preserve-3d',
        transition: `transform ${motion.duration.base}ms ${motion.easeSmooth}, box-shadow ${motion.duration.base}ms ${motion.easeSmooth}`,
        willChange: 'transform',
      }}
      aria-disabled={locked}
      aria-label={ariaLabel}
      title={title}
    >
      {stage && (
        <span style={{ position: 'absolute', top: compact ? 12 : 16, right: compact ? 12 : 16, display: 'flex' }}>
          <StageBadge stage={stage} compact={compact} />
        </span>
      )}
      <div style={{ width: chip, height: chip, borderRadius: radii.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: categoryTint(accent), flexShrink: 0, marginBottom: compact ? 12 : 18 }}>
        <Icon size={Math.round((compact ? 30 : 36) * iconFit.scale)} color={accent} strokeWidth={iconFit.strokeWidth} />
      </div>
      <p
        style={{
          fontSize: compact ? 14 : 16.5,
          lineHeight: compact ? '18px' : '22px',
          fontFamily: fonts.sansBold,
          fontWeight: fontWeights.sansBold,
          color: colors.ink,
          margin: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </p>
      <p
        style={{
          fontSize: compact ? 11.5 : 13.5,
          lineHeight: compact ? '15px' : '19px',
          fontFamily: fonts.sansRegular,
          fontWeight: fontWeights.sansRegular,
          color: colors.inkSoft,
          margin: '6px 0 0',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {subtitle}
      </p>
      <span style={{ position: 'absolute', right: compact ? 12 : 18, bottom: compact ? 10 : 14, display: 'flex' }}>
        {locked ? <Lock size={14} color="#9CA3AF" strokeWidth={1.8} /> : <ArrowRight size={16} color={colors.inkSoft} strokeWidth={1.8} />}
      </span>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { userEmail, profile } = useAuth();
  const unlockedAppIds = useUnlockedAppIds();
  const { stageOf } = useAppStages();
  const recent = useRecentApps();
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wider cards on desktop only. useIsWideScreen is >=768px and reports false until the real
  // window width is measured, so a phone gets two compact cards per row.
  const isWide = useIsWideScreen();
  const tileMin = isWide ? 240 : 150;
  const tileGap = isWide ? 20 : 10;

  const openApp = (app: AppItem) => {
    // Every app always renders as a tile, but a locked one isn't clickable (see AppCard) — nothing
    // happens for it here either. /apps/[id] still shows its own "no access" message if reached by URL.
    if (!unlockedAppIds.has(app.id)) return;
    if (userEmail) logEvent(userEmail, 'APP_OPEN', app.id);
    if (app.url) {
      // Same tab: browser Back returns to the hub.
      window.location.assign(app.url);
      return;
    }
    router.push(`/apps/${app.id}`);
  };

  // Home shows only the category segregation itself, as square tiles — clicking an unlocked one
  // navigates in place to that category's own app list (/my-applications already seeds its filter
  // from ?category=).
  //
  // router.push: a category is hub navigation, so it stays inside the shell with the sidebar and
  // the browser's own Back button working. An application is a full same-tab page load instead
  // (see openApp above), since each app is its own build under /apps/<slug>.
  const openCategory = (c: CategoryFilter) => {
    router.push(`/my-applications?category=${encodeURIComponent(c)}`);
  };

  const onScroll = () => {
    setScrollActivity(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => setScrollActivity(false), 150);
  };

  const visibleRecent = recent.filter((r) => unlockedAppIds.has(r.id));

  return (
    <div onScroll={onScroll} style={{ height: '100%', overflowY: 'auto', padding: 16, paddingBottom: 40 }}>
      <DashboardHero name={profile?.name || userEmail || ''} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: radii.lg, backgroundColor: categoryTint(colors.rust), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <LayoutGrid size={19} color={colors.rust} strokeWidth={1.8} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 17, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>My Applications</p>
          <p style={{ fontSize: 13, fontFamily: fonts.sansRegular, color: colors.inkSoft, margin: '2px 0 0' }}>Quick access to the tools and insights you use most</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${tileMin}px, 1fr))`, gap: tileGap, marginBottom: 24 }}>
        {CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICONS[c] || Grid3x3;
          const accent = catColor(c);
          const categoryApps = c === 'All' ? [] : APPS.filter((a) => a.cat === c);
          const locked = c !== 'All' && categoryApps.length > 0 && categoryApps.every((a) => !unlockedAppIds.has(a.id));
          return (
            <HoverTile
              key={c}
              compact={!isWide}
              accent={accent}
              locked={locked}
              onClick={() => openCategory(c)}
              icon={Icon}
              iconFit={categoryIconFit(c)}
              name={c === 'All' ? 'All Apps' : c}
              subtitle={CATEGORY_DESCRIPTIONS[c] || ''}
              title={locked ? `${c} — no access` : undefined}
              ariaLabel={locked ? `${c}, locked — no access to its apps yet` : `Open ${c} applications`}
            />
          );
        })}
      </div>

      {visibleRecent.length > 0 && (
        <>
          <p style={{ fontSize: 17, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 8, marginBottom: 14 }}>Recently Used</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${tileMin}px, 1fr))`, gap: tileGap }}>
            {visibleRecent.map((r) => {
              const app = appById(r.id);
              if (!app) return null;
              return (
                <HoverTile
                  key={r.id}
                  compact={!isWide}
                  accent={appColor(app.id)}
                  onClick={() => openApp(app)}
                  icon={app.icon}
                  name={app.name}
                  subtitle={r.when}
                  stage={stageOf(app.id)}
                  ariaLabel={`Open ${app.name}`}
                  title={app.name}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
