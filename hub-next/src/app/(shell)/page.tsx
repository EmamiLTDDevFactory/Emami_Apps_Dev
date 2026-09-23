'use client';

import React, { useRef } from 'react';
import { LayoutGrid, Landmark, Grid3x3, Lock, ClipboardCheck, Globe, Box, ShieldCheck, Monitor, Users, Shuffle, Package, Handshake, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DashboardHero from '../../components/DashboardHero';
import CompanyPulseCard from '../../components/CompanyPulseCard';
import { useAuth } from '../../context/AuthContext';
import { useUnlockedAppIds } from '../../hooks/useAppAccess';
import { useRecentApps } from '../../hooks/useRecentApps';
import { useIsWideScreen } from '../../hooks/useIsWideScreen';
import { setScrollActivity } from '../../hooks/useScrollActivity';
import { logEvent } from '../../lib/authApi';
import { APPS, CATEGORIES, appById } from '../../data/mockData';
import { colors, fonts, fontWeights, radii, appColor, catColor, motion } from '../../theme/tokens';
import { useTiltHover } from '../../hooks/useTiltHover';
import type { AppItem, CategoryFilter } from '../../types';

/** One icon per category tile — 'All' isn't a real category (see catColor's fallback-to-rust for
 * it too), so it gets a neutral catalog glyph rather than something that'd imply it's just another
 * segment. IBD/Supply Chain/CPD/HR/IT match the reference Emami Apps sidebar's own icon glyphs. */
const CATEGORY_ICONS: Record<string, typeof LayoutGrid> = {
  All: LayoutGrid,
  CQA: ClipboardCheck,
  CPD: ShieldCheck,
  IT: Monitor,
  'Supply Chain': Box,
  IBD: Globe,
  HR: Users,
  'Cross-Function': Shuffle,
  Packaging: Package,
  Finance: Landmark,
  Sales: Handshake,
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  All: 'Every application in one place',
  CQA: 'Audits & CAPA tracking',
  CPD: 'Market rates & delivery confirmation',
  IT: 'Development tracker & timesheets',
  'Supply Chain': 'Dispatch tracking',
  IBD: 'IBD provision & payment tracking',
  HR: 'Recruitment consultant management',
  'Cross-Function': 'Mediclaim, term policy & PO approval',
  Packaging: 'Mould health inspection',
  Finance: 'Non-CTC expense claims',
  Sales: 'SAP SD · Salescode',
};

/** A square Home tile (category or Recently Used) — tilts toward the cursor and lifts its shadow
 * on hover (see useTiltHover), then eases back flat on mouse-leave. Kept as its own component
 * (not inlined in the .map() below) since a tilt hook needs one hook instance per tile. */
function HoverTile({
  tileStyle, tileNameStyle, iconBox, iconSize, accent, locked, disabled, onClick, ariaLabel, title, icon: Icon, name, subtitle,
}: {
  tileStyle: React.CSSProperties;
  tileNameStyle: React.CSSProperties;
  iconBox: number;
  iconSize: number;
  accent: string;
  locked?: boolean;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
  title?: string;
  icon: LucideIcon;
  name: string;
  subtitle: React.ReactNode;
}) {
  const { ref, hovered, tiltTransform, handlers } = useTiltHover<HTMLButtonElement>();
  const active = hovered && !disabled;
  const scale = active ? motion.hoverScale : 1;

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      {...(disabled ? {} : handlers)}
      style={{
        ...tileStyle,
        backgroundColor: locked ? colors.appBg : colors.white,
        boxShadow: locked ? 'none' : active ? `0 14px 24px 0 ${accent}26` : `0 3px 8px 0 ${accent}1a`,
        opacity: locked ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: disabled ? undefined : `${tiltTransform} scale(${scale})`,
        transformStyle: 'preserve-3d',
        transition: `transform ${motion.duration.base}ms ${motion.easeSmooth}, box-shadow ${motion.duration.base}ms ${motion.easeSmooth}`,
        willChange: 'transform',
      }}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      title={title}
    >
      <div style={{ width: iconBox, height: iconBox, borderRadius: radii.sm + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}1f`, flexShrink: 0 }}>
        {locked ? <Lock size={iconSize - 1} color={accent} strokeWidth={2.1} /> : <Icon size={iconSize} color={accent} strokeWidth={2.1} />}
      </div>
      <p style={{ ...tileNameStyle, color: locked ? colors.inkSoft : colors.ink }}>{name}</p>
      {subtitle}
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { userEmail, profile } = useAuth();
  const unlockedAppIds = useUnlockedAppIds();
  const recent = useRecentApps();
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Home's tiles get a bit more room on desktop only. useIsWideScreen is >=768px and reports false
  // until the real window width is measured, so mobile keeps exactly the sizes it had — these
  // values are only ever larger than the mobile ones, never different on a phone.
  const isWide = useIsWideScreen();
  const tileMin = isWide ? 132 : 96;
  const tileGap = isWide ? 12 : 10;
  const tileIconBox = isWide ? 38 : 32;
  const tileIconSize = isWide ? 19 : 16;

  // Shared by both tile grids so a category tile and a Recently Used tile are always the same
  // shape. aspectRatio keeps them square; overflow hidden is what makes that binding — without it
  // a long name (e.g. "Recruitment Consultant Management Portal") sets the box's automatic minimum
  // height and that one tile grows taller than the rest of the row.
  const tileStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    aspectRatio: '1',
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
    borderRadius: radii.lg,
    padding: 10,
  };

  // Long names are clamped rather than allowed to wrap indefinitely — same reason as above.
  const tileNameStyle: React.CSSProperties = {
    fontSize: 11.5,
    lineHeight: '14px',
    fontFamily: fonts.sansSemiBold,
    fontWeight: fontWeights.sansSemiBold,
    margin: 0,
    textAlign: 'center',
    maxWidth: '100%',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };

  const openApp = (app: AppItem) => {
    // Every app now always renders as a tile (locked ones just look locked, see AppCard) — tapping
    // a locked one routes to /apps/[id]'s own "you don't have access" message instead of opening it.
    if (!unlockedAppIds.has(app.id)) {
      router.push(`/apps/${app.id}`);
      return;
    }
    if (userEmail) logEvent(userEmail, 'APP_OPEN', app.id);
    if (app.url) {
      window.open(app.url, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(`/apps/${app.id}`);
  };

  // Home shows only the category segregation itself, as square tiles — clicking an unlocked one
  // navigates in place to that category's own app list (/my-applications already seeds its filter
  // from ?category=).
  //
  // Deliberately router.push, NOT window.open: a category is hub navigation, so it stays inside
  // Emami Apps and keeps the shell, the sidebar and the browser's own Back button working. Only a
  // real application gets a new browser tab — see openApp above, which is where window.open
  // belongs, since those are separate applications rather than another view of this one.
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

      <CompanyPulseCard />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 26, height: 26, borderRadius: radii.md, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <LayoutGrid size={13} color={colors.rust} />
        </div>
        <p style={{ fontSize: 14, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>My Applications</p>
      </div>
      <p style={{ fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 0, marginBottom: 10 }}>Choose a category to see its applications</p>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${tileMin}px, 1fr))`, gap: tileGap, marginBottom: 20 }}>
        {CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICONS[c] || Grid3x3;
          const accent = catColor(c);
          const categoryApps = c === 'All' ? [] : APPS.filter((a) => a.cat === c);
          const locked = c !== 'All' && categoryApps.length > 0 && categoryApps.every((a) => !unlockedAppIds.has(a.id));
          return (
            <HoverTile
              key={c}
              tileStyle={tileStyle}
              tileNameStyle={tileNameStyle}
              iconBox={tileIconBox}
              iconSize={tileIconSize}
              accent={accent}
              locked={locked}
              disabled={locked}
              onClick={() => openCategory(c)}
              icon={Icon}
              name={c}
              ariaLabel={locked ? `${c}, locked — no apps in this category yet` : `Open ${c} applications in a new tab`}
              subtitle={
                locked ? (
                  <span style={{ fontSize: 8, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.3, textTransform: 'uppercase', color: colors.inkSoft }}>
                    Locked
                  </span>
                ) : (
                  <p
                    style={{
                      fontSize: 9.5,
                      lineHeight: '12px',
                      color: colors.inkSoft,
                      fontFamily: fonts.sansRegular,
                      margin: 0,
                      textAlign: 'center',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {CATEGORY_DESCRIPTIONS[c]}
                  </p>
                )
              }
            />
          );
        })}
      </div>

      {visibleRecent.length > 0 && (
        <>
          <p style={{ fontSize: 15, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 20, marginBottom: 12 }}>Recently Used</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${tileMin}px, 1fr))`, gap: tileGap }}>
            {visibleRecent.map((r) => {
              const app = appById(r.id);
              if (!app) return null;
              const Icon = app.icon;
              const accent = appColor(app.id);
              return (
                <HoverTile
                  key={r.id}
                  tileStyle={tileStyle}
                  tileNameStyle={tileNameStyle}
                  iconBox={tileIconBox}
                  iconSize={tileIconSize}
                  accent={accent}
                  onClick={() => openApp(app)}
                  icon={Icon}
                  name={app.name}
                  ariaLabel={`Open ${app.name}`}
                  title={app.name}
                  subtitle={
                    <p
                      style={{
                        fontSize: 9.5,
                        lineHeight: '12px',
                        color: colors.inkSoft,
                        fontFamily: fonts.sansRegular,
                        margin: 0,
                        textAlign: 'center',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {r.when}
                    </p>
                  }
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
