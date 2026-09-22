'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { colors, fonts, fontWeights, radii, appColor, shadows } from '../theme/tokens';
import { NAV, NAV_ROUTES, APPS } from '../data/mockData';
import { useFavorites } from '../context/FavoritesContext';
import { useAuth } from '../context/AuthContext';
import { useUnlockedAppIds } from '../hooks/useAppAccess';
import { logEvent } from '../lib/authApi';
import EmpAppMark from './EmpAppMark';

/** Strips a trailing slash (except on root `/`) so the active-route check below can't be fooled
 * by it either way — this site's static export uses `trailingSlash: true`, so the real browser
 * URL (and what `usePathname()` reports) is `/administration/`, not the bare `/administration`
 * NAV_ROUTES lists; without this, the string-equality check never matched anything and no nav
 * item ever showed as selected. */
function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
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
  // Viewer at all.
  const canManageAccess = access?.accessLevel === 'Super Admin' || access?.accessLevel === 'Admin';
  const ADMIN_ONLY_NAV_IDS = new Set(['UserAccess', 'Administration']);
  const navItems = NAV.filter((item) => !ADMIN_ONLY_NAV_IDS.has(item.id) || canManageAccess);

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
        {navItems.map((item) => {
          const route = NAV_ROUTES[item.id];
          const active = normalizePath(pathname) === normalizePath(route);
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(route)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 7px',
                marginBottom: 4,
                borderRadius: radii.lg,
                borderLeft: `3px solid ${active ? colors.rust : 'transparent'}`,
                backgroundColor: active ? colors.sidebarActive : 'transparent',
                border: 'none',
                borderLeftWidth: 3,
                borderLeftStyle: 'solid',
                borderLeftColor: active ? colors.rust : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              aria-current={active ? 'page' : undefined}
            >
              <span
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: radii.sm + 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colors.rust : 'transparent',
                  flexShrink: 0,
                }}
              >
                <Icon size={15} color={active ? colors.white : colors.sidebarTextSoft} strokeWidth={2.2} />
              </span>
              <span style={{ fontSize: 13, flex: 1, color: active ? colors.rust : colors.sidebarTextSoft, fontFamily: active ? fonts.sansBold : fonts.sansMedium, fontWeight: active ? fontWeights.sansBold : fontWeights.sansMedium }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${colors.sidebarBorder}` }}>
        <span style={{ color: colors.sidebarTextSoft, fontSize: 11, fontFamily: fonts.sansRegular }}>© {new Date().getFullYear()} Emami Limited</span>
      </div>
    </div>
  );
}
