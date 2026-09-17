'use client';

import React, { useRef } from 'react';
import { LayoutGrid, Landmark, Cog, Wallet, Grid3x3, Lock } from 'lucide-react';
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
import { colors, fonts, fontWeights, radii, appColor, catColor } from '../../theme/tokens';
import type { AppItem, CategoryFilter } from '../../types';

/** One icon per category tile — 'All' isn't a real category (see catColor's fallback-to-rust for
 * it too), so it gets a neutral catalog glyph rather than something that'd imply it's just another
 * segment. */
const CATEGORY_ICONS: Record<string, typeof LayoutGrid> = {
  All: LayoutGrid,
  Finance: Landmark,
  Operations: Cog,
  IBD: Wallet,
  General: Grid3x3,
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  All: 'Every application in one place',
  Finance: 'Expenses, market rates & PO deviations',
  Operations: 'Dispatch, audits, timesheets & tracking',
  IBD: 'IBD provision & payment tracking',
  General: 'Mediclaim & term policy submissions',
};

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
            <button
              key={c}
              type="button"
              disabled={locked}
              onClick={() => openCategory(c)}
              style={{
                ...tileStyle,
                backgroundColor: locked ? colors.appBg : colors.white,
                boxShadow: locked ? 'none' : `0 3px 8px 0 ${accent}1a`,
                opacity: locked ? 0.6 : 1,
                cursor: locked ? 'not-allowed' : 'pointer',
              }}
              aria-disabled={locked}
              aria-label={locked ? `${c}, locked — no apps in this category yet` : `Open ${c} applications in a new tab`}
            >
              <div style={{ width: tileIconBox, height: tileIconBox, borderRadius: radii.sm + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}1f`, flexShrink: 0 }}>
                {locked ? <Lock size={tileIconSize - 1} color={accent} strokeWidth={2.1} /> : <Icon size={tileIconSize} color={accent} strokeWidth={2.1} />}
              </div>
              <p style={{ ...tileNameStyle, color: locked ? colors.inkSoft : colors.ink }}>
                {c}
              </p>
              {locked ? (
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
              )}
            </button>
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
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openApp(app)}
                  style={{
                    ...tileStyle,
                    backgroundColor: colors.white,
                    boxShadow: `0 3px 8px 0 ${accent}1a`,
                    cursor: 'pointer',
                  }}
                  aria-label={`Open ${app.name}`}
                  title={app.name}
                >
                  <div style={{ width: tileIconBox, height: tileIconBox, borderRadius: radii.sm + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}1f`, flexShrink: 0 }}>
                    <Icon size={tileIconSize} color={accent} strokeWidth={2.1} />
                  </div>
                  <p style={{ ...tileNameStyle, color: colors.ink }}>
                    {app.name}
                  </p>
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
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
