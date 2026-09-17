'use client';

import React, { useRef, useState } from 'react';
import { ChevronRight, LayoutGrid, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DashboardHero from '../../components/DashboardHero';
import CompanyPulseCard from '../../components/CompanyPulseCard';
import FilterBar from '../../components/FilterBar';
import { useAuth } from '../../context/AuthContext';
import { useUnlockedAppIds } from '../../hooks/useAppAccess';
import { setScrollActivity } from '../../hooks/useScrollActivity';
import { logEvent } from '../../lib/authApi';
import { RECENT, APPS, appById } from '../../data/mockData';
import { colors, fonts, fontWeights, radii, appColor } from '../../theme/tokens';
import type { AppItem, CategoryFilter } from '../../types';

export default function HomePage() {
  const router = useRouter();
  const { userEmail, profile } = useAuth();
  const unlockedAppIds = useUnlockedAppIds();
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Home shows only the category segregation itself — clicking a tile expands an inline dropdown
  // of that category's apps right below the tile row (no navigation); clicking it again, or a
  // different tile, collapses/switches it. Only one open at a time.
  const [expandedCategory, setExpandedCategory] = useState<CategoryFilter | null>(null);

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

  const onCategoryChange = (c: CategoryFilter) => {
    setExpandedCategory((prev) => (prev === c ? null : c));
  };

  const onScroll = () => {
    setScrollActivity(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => setScrollActivity(false), 150);
  };

  const visibleRecent = RECENT.filter((r) => unlockedAppIds.has(r.id));
  const expandedApps = expandedCategory
    ? expandedCategory === 'All'
      ? APPS
      : APPS.filter((a) => a.cat === expandedCategory)
    : [];

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

      <FilterBar category={expandedCategory} onCategoryChange={onCategoryChange} unlockedAppIds={unlockedAppIds} hideSort expandable />

      {expandedCategory && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.lg, backgroundColor: colors.white, overflow: 'hidden', marginBottom: 20 }}>
          {expandedApps.map((app, i) => {
            const Icon = app.icon;
            const accent = appColor(app.id);
            const locked = !unlockedAppIds.has(app.id);
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => openApp(app)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  background: 'none',
                  border: 'none',
                  borderBottom: i < expandedApps.length - 1 ? `1px solid ${colors.border}` : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  opacity: locked ? 0.6 : 1,
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: radii.sm + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}1a`, flexShrink: 0 }}>
                  {locked ? <Lock size={13} color={accent} /> : <Icon size={15} color={accent} />}
                </div>
                <p style={{ flex: 1, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {app.name}
                </p>
                {locked ? (
                  <span style={{ fontSize: 9, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.3, textTransform: 'uppercase', color: colors.inkSoft, flexShrink: 0 }}>Locked</span>
                ) : (
                  <ChevronRight size={14} color={colors.inkSoft} style={{ flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}

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
