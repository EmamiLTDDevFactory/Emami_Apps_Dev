'use client';

import React, { useRef } from 'react';
import { ChevronRight, LayoutGrid, Landmark, Cog, Wallet, Grid3x3, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DashboardHero from '../../components/DashboardHero';
import CompanyPulseCard from '../../components/CompanyPulseCard';
import { useAuth } from '../../context/AuthContext';
import { useUnlockedAppIds } from '../../hooks/useAppAccess';
import { useColumnCount } from '../../hooks/useColumnCount';
import { setScrollActivity } from '../../hooks/useScrollActivity';
import { logEvent } from '../../lib/authApi';
import { RECENT, APPS, CATEGORIES, appById } from '../../data/mockData';
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

export default function HomePage() {
  const router = useRouter();
  const { userEmail, profile } = useAuth();
  const unlockedAppIds = useUnlockedAppIds();
  const numColumns = useColumnCount();
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // opens that category's own app list in a fresh tab (/my-applications already seeds its filter
  // from ?category=), rather than navigating away from Home or expanding anything in place.
  const openCategory = (c: CategoryFilter) => {
    window.open(`/my-applications?category=${encodeURIComponent(c)}`, '_blank', 'noopener,noreferrer');
  };

  const onScroll = () => {
    setScrollActivity(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => setScrollActivity(false), 150);
  };

  const visibleRecent = RECENT.filter((r) => unlockedAppIds.has(r.id));

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

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`, gap: 12, marginBottom: 20 }}>
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
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                aspectRatio: '1',
                border: locked ? `1px solid ${colors.border}` : `1px solid ${colors.border}`,
                borderRadius: radii.xl,
                backgroundColor: locked ? colors.appBg : colors.white,
                boxShadow: locked ? 'none' : `0 4px 10px 0 ${accent}1a`,
                opacity: locked ? 0.6 : 1,
                cursor: locked ? 'not-allowed' : 'pointer',
                padding: 12,
              }}
              aria-disabled={locked}
              aria-label={locked ? `${c}, locked — no apps in this category yet` : `Open ${c} applications in a new tab`}
            >
              <div style={{ width: 44, height: 44, borderRadius: radii.md, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}1f` }}>
                {locked ? <Lock size={19} color={accent} strokeWidth={2.1} /> : <Icon size={21} color={accent} strokeWidth={2.1} />}
              </div>
              <p style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: locked ? colors.inkSoft : colors.ink, margin: 0, textAlign: 'center' }}>
                {c}
              </p>
              {locked && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, borderRadius: radii.pill, padding: '2px 8px', backgroundColor: colors.white }}>
                  <Lock size={8} color={colors.inkSoft} strokeWidth={2.4} />
                  <span style={{ fontSize: 9, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.3, textTransform: 'uppercase', color: colors.inkSoft }}>
                    Locked
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 15, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 20, marginBottom: 12 }}>Recently Used</p>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.lg, backgroundColor: colors.white, overflow: 'hidden' }}>
        {visibleRecent.map((r, i) => {
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
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                background: 'none',
                border: 'none',
                borderBottom: i < visibleRecent.length - 1 ? `1px solid ${colors.border}` : 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ width: 34, height: 34, borderRadius: radii.sm + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}1a`, flexShrink: 0 }}>
                <Icon size={16} color={accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</p>
                <p style={{ fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansRegular, marginTop: 2, marginBottom: 0 }}>{r.when}</p>
              </div>
              <ChevronRight size={15} color={colors.inkSoft} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
