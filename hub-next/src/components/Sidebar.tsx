'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Grid3x3, Lock } from 'lucide-react';
import { colors, fonts, fontWeights, radii, appColor, catColor, categoryTint, navColor, shadows } from '../theme/tokens';
import { NAV, NAV_ROUTES, APPS, CATEGORIES } from '../data/mockData';
import { CATEGORY_ICONS } from '../data/categoryMeta';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import { useUnlockedAppIds } from '../hooks/useAppAccess';
import { logEvent } from '../lib/authApi';
import EmpAppMark from './EmpAppMark';
import type { CategoryFilter } from '../types';

/** Strips a trailing slash (except on root `/`) so the active-route check below can't be fooled
 * by it either way — this site's static export uses `trailingSlash: true`, so the real browser
 * URL (and what `usePathname()` reports) is `/administration/`, not the bare `/administration`
 * NAV_ROUTES lists; without this, the string-equality check never matched anything and no nav
 * item ever showed as selected. */
function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** One nav-row look, shared by the top-level items, the category section, and the bottom-level
 * items below — pulled out so those three groups render identically. Styled after the reference
 * Emami Apps home screen: every row carries its icon in a pale accent-tinted chip, and the active
 * row is a soft accent-tinted pill with the label in the accent color. */
function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
  accentColor,
  locked,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  /** Per-item accent — category rows use catColor, every other row uses navColor (see
   * theme/tokens.ts) — so every icon in the sidebar is color-coded, not just Categories. */
  accentColor?: string;
  /** Shows a small lock at the row's right edge — a category whose apps are all locked for this
   * user, same rule as the Home tile's own lock. */
  locked?: boolean;
}) {
  const accent = accentColor || colors.rust;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 8px',
        marginBottom: 4,
        borderRadius: radii.xl,
        backgroundColor: active ? categoryTint(accent) : 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
      aria-current={active ? 'page' : undefined}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: radii.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? colors.white : categoryTint(accent),
          flexShrink: 0,
        }}
      >
        <Icon size={17} color={accent} strokeWidth={1.8} />
      </span>
      <span
        style={{
          fontSize: 13.5,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: active ? accent : colors.ink,
          fontFamily: active ? fonts.sansSemiBold : fonts.sansMedium,
          fontWeight: active ? fontWeights.sansSemiBold : fontWeights.sansMedium,
        }}
      >
        {label}
      </span>
      {locked && <Lock size={13} color="#9CA3AF" strokeWidth={1.8} style={{ flexShrink: 0 }} />}
    </button>
  );
}

interface SidebarProps {
  /** True only for the permanent desktop/laptop sidebar (see the shell layout) — shrinks the
   * brand mark a bit further than the mobile drawer's copy of this same component, to match the
   * narrower desktop sidebar width. */
  compact?: boolean;
}

export default function Sidebar({ compact = false }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { favorites } = useFavorites();
  const { access, userEmail } = useAuth();
  const unlockedAppIds = useUnlockedAppIds();
  const favoriteApps = APPS.filter((a) => favorites.has(a.id) && unlockedAppIds.has(a.id));

  const onOpenApp = (app: (typeof APPS)[number]) => {
    if (!unlockedAppIds.has(app.id)) return;
    if (userEmail) logEvent(userEmail, 'APP_OPEN', app.id);
    if (app.url) window.open(app.url, '_blank', 'noopener,noreferrer');
  };

  // Manage Access and Administration are only for Super Admin/Admin — each of those pages also
  // enforces the same rule server-side too; this just keeps the nav items from showing to a
  // Viewer at all. Favorites is dropped from the side pane entirely, per instruction — the page
  // and route (NAV_ROUTES.Favorites) still exist, just unlinked from here.
  const canManageAccess = access?.accessLevel === 'Super Admin' || access?.accessLevel === 'Admin';
  const ADMIN_ONLY_NAV_IDS = new Set(['UserAccess', 'Administration']);
  const HIDDEN_NAV_IDS = new Set(['Favorites']);
  const navItems = NAV.filter((item) => !HIDDEN_NAV_IDS.has(item.id) && (!ADMIN_ONLY_NAV_IDS.has(item.id) || canManageAccess));

  // My Applications' own category segregation (see the Home page's tiles, which this mirrors) —
  // rendered as its own section between "My Applications" and the rest of the nav, same idea as
  // openCategory there: navigates in place to /my-applications?category=..., not a new tab.
  const TOP_NAV_IDS = new Set(['Home', 'MyApplications']);
  const topNavItems = navItems.filter((item) => TOP_NAV_IDS.has(item.id));
  const bottomNavItems = navItems.filter((item) => !TOP_NAV_IDS.has(item.id));
  const activeCategory = normalizePath(pathname) === normalizePath(NAV_ROUTES.MyApplications) ? searchParams.get('category') : null;
  const openCategory = (c: CategoryFilter) => router.push(`/my-applications?category=${encodeURIComponent(c)}`);
  // Same rule as the Home tiles: a category is locked when it has apps and every one is locked.
  const isCategoryLocked = (c: CategoryFilter) => {
    const categoryApps = APPS.filter((a) => a.cat === c);
    return categoryApps.length > 0 && categoryApps.every((a) => !unlockedAppIds.has(a.id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: colors.sidebar, paddingTop: 16 }}>
      <button
        type="button"
        onClick={() => router.push('/')}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', marginBottom: 18, background: 'none', border: 'none', cursor: 'pointer' }}
        aria-label="Go to Home"
      >
        {/* The one Emami Apps logo used across the whole hub (same asset as the Login page's hero
            logo — see EmpAppMark.tsx) — sized to fill the sidebar width so the "APPS" wordmark
            stays legible. */}
        <EmpAppMark size={compact ? 132 : 172} />
      </button>

      {favoriteApps.length > 0 && (
        <div style={{ padding: '14px 16px', borderTop: `1px solid ${colors.sidebarBorder}`, borderBottom: `1px solid ${colors.sidebarBorder}`, marginBottom: 8 }}>
          <p style={{ color: colors.sidebarTextSoft, fontSize: 10.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 0 }}>
            Quick access
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {favoriteApps.map((app) => {
              const Icon = app.icon;
              const c = appColor(app.id);
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => onOpenApp(app)}
                  style={{
                    width: 27,
                    height: 27,
                    borderRadius: radii.sm,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: `${c}2e`,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: shadows.sm,
                  }}
                  aria-label={`Open ${app.name}`}
                >
                  <Icon size={14} color={c} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <nav style={{ flex: 1, padding: '0 10px', overflowY: 'auto' }}>
        {topNavItems.map((item) => {
          // My Applications itself only counts as active on the unfiltered list — once a
          // category's selected below, that category owns the highlight instead so only one
          // item in this whole nav is ever lit up at a time.
          const active = normalizePath(pathname) === normalizePath(NAV_ROUTES[item.id]) && (item.id !== 'MyApplications' || !activeCategory);
          return <NavButton key={item.id} icon={item.icon} label={item.label} active={active} onClick={() => router.push(NAV_ROUTES[item.id])} accentColor={navColor(item.id)} />;
        })}

        <p style={{ color: colors.sidebarTextSoft, fontSize: 10.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.8, textTransform: 'uppercase', margin: '10px 7px 6px' }}>
          Categories
        </p>
        {CATEGORIES.filter((c) => c !== 'All').map((c) => (
          <NavButton
            key={c}
            icon={CATEGORY_ICONS[c] || Grid3x3}
            label={c}
            active={activeCategory === c}
            onClick={() => openCategory(c)}
            accentColor={catColor(c)}
            locked={isCategoryLocked(c)}
          />
        ))}

        {bottomNavItems.map((item) => (
          <NavButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={normalizePath(pathname) === normalizePath(NAV_ROUTES[item.id])}
            onClick={() => router.push(NAV_ROUTES[item.id])}
            accentColor={navColor(item.id)}
          />
        ))}
      </nav>

      <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${colors.sidebarBorder}` }}>
        <span style={{ color: colors.sidebarTextSoft, fontSize: 11, fontFamily: fonts.sansRegular }}>© {new Date().getFullYear()} Emami Limited</span>
      </div>
    </div>
  );
}
