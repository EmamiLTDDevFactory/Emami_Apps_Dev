'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FilePlus2, LayoutDashboard, ListChecks, Wallet, FileCheck2, ShieldAlert, type LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useClaim } from '../context/ClaimContext';
import { hasHubSession, isHubTokenExpired } from '../lib/hubEmailLogin';
import { ScreenHistoryTracker, useScreenBack } from '../lib/screenHistory';
import { Spinner, cx } from './ui';

// next/link prepends next.config.mjs's basePath automatically; plain <img>/<a> don't.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '/apps/expense';

type NavItem = { href: string; label: string; subtitle: string; icon: LucideIcon; badge?: number; accent: string };

const normalizeId = (id?: string) => (id || '').toString().replace(/\D/g, '').padStart(8, '0');
const norm = (p: string | null) => (p || '/').replace(/\/?$/, '/');

// Every tab link uses `next/link replace` (never a raw <a> or router.push()), so switching tabs
// never grows window.history — ported from the Expo tab bar's own documented requirement (back
// button previously needed several presses because tab switches pushed history entries).
function TabBar() {
  const pathname = norm(usePathname());
  const { activeRole, currentUser } = useAuth();
  const { claims } = useClaim();
  const myNumeric = normalizeId(currentUser?.employeeId);

  const approvalsCount = claims.filter((c) => {
    if (activeRole === 'manager') {
      // Under the DOA chain, SAP only ever returns ONE CurrentApprover even for a parallel (rule
      // O/A) level, so this user can be a valid pending approver without being that single value.
      // `claims` is already scoped server-side to this user's LoginId (see ClaimContext.fetchClaims),
      // so status alone is the right check here too - same fix as ClaimContext.filterClaims('manager').
      return c.rawStatus === 'N' || c.rawStatus === 'A';
    }
    if (!c.currentApprover) return false;
    if (activeRole === 'B') {
      const employeeNumeric = normalizeId(c.employeeId);
      if (employeeNumeric === myNumeric) return false;
      return c.rawStatus === 'H' || c.rawStatus === 'P';
    }
    return false;
  }).length;

  const financeCount = claims.filter((c) => {
    if (c.rawStatus !== 'H') return false;
    if (!currentUser?.employeeId) return false;
    return normalizeId(c.employeeId) !== myNumeric;
  }).length;

  // Same per-tab identity colors the original Expo app's tab bar already used (Dashboard=green,
  // Create=blue, My Claims=orange, Approvals=purple, Finance=sky blue) — carried over rather than
  // invented fresh, so the web version still reads as the same app.
  const items: NavItem[] = [
    { href: '/', label: 'Dashboard', subtitle: 'Overview & Analytics', icon: LayoutDashboard, accent: '#10B981' },
    { href: '/create/', label: 'Create', subtitle: 'New Claim', icon: FilePlus2, accent: '#2563EB' },
    { href: '/my-claims/', label: 'My Claims', subtitle: 'View & Track Claims', icon: ListChecks, accent: '#F97316' },
  ];
  if (activeRole === 'manager' || activeRole === 'B') {
    items.push({ href: '/approvals/', label: 'Approvals', subtitle: 'Manager Review', icon: FileCheck2, badge: approvalsCount, accent: '#8B5CF6' });
  }
  if (activeRole === 'finance') {
    items.push({ href: '/finance/', label: 'Finance', subtitle: 'Finance & Reports', icon: Wallet, badge: financeCount, accent: '#0EA5E9' });
  }
  // Additive admin capability (ZEXP_ADMIN PERNR list) - independent of activeRole, so an admin
  // who is also a manager/finance user sees this tab alongside their normal ones.
  if (currentUser?.isAdmin) {
    items.push({ href: '/admin/', label: 'Admin', subtitle: 'Search & DOA Chain', icon: ShieldAlert, accent: '#DC2626' });
  }

  // 3 tabs (employee role) already fit comfortably on one row even on a narrow phone, so they
  // keep the flex-wrap/stretch layout that lines their edges up with the cards above. 4 tabs
  // (manager/finance/Boss, who also get Approvals or Finance) don't fit four-across below ~440px
  // — without this, the 4th tab wrapped alone onto its own full-width row instead of a clean grid.
  const needsMobileGrid = items.length >= 4;

  return (
    <nav className="border-t border-border bg-white px-3 py-2">
      <div
        className={cx(
          'mx-auto w-full max-w-[1280px] gap-2',
          needsMobileGrid ? 'grid grid-cols-2 sm:flex sm:flex-wrap sm:items-stretch' : 'flex flex-wrap items-stretch'
        )}
      >
        {items.map((item, index) => {
          const active = pathname === norm(item.href);
          const Icon = item.icon;
          // An admin who is also a manager/finance user gets a 5th tab - an odd count in the
          // 2-col mobile grid would otherwise strand the last tab alone with an empty gap beside
          // it (the same problem already fixed for 4 tabs, reintroduced by a 5th). Spanning the
          // trailing tab full-width when the count is odd keeps it looking intentional instead.
          const isTrailingOdd = needsMobileGrid && items.length % 2 === 1 && index === items.length - 1;
          return (
            <Link
              key={item.href}
              href={item.href}
              replace
              style={active ? { backgroundColor: item.accent, borderColor: item.accent } : { backgroundColor: `${item.accent}0D`, borderColor: `${item.accent}40` }}
              className={cx(
                'relative flex items-center justify-center gap-2 rounded-xl border px-3 py-2 transition-colors',
                needsMobileGrid ? 'sm:min-w-[110px] sm:flex-1' : 'min-w-[110px] flex-1',
                isTrailingOdd && 'col-span-2 sm:col-span-1',
                active ? 'text-white shadow-lift' : 'text-ink hover:brightness-95'
              )}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : `${item.accent}26` }}
              >
                <Icon size={16} color={active ? '#FFFFFF' : item.accent} />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-bold">{item.label}</span>
                <span className={cx('text-2xs', active ? 'text-white/80' : 'text-inkSoft')}>{item.subtitle}</span>
              </span>
              {!!item.badge && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red px-1 text-2xs font-bold text-white">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { currentUser, isInitializing } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Mirrors the Expo version's _layout.tsx auth gate: a visitor with no hub session is bounced
  // back to the hub root (full page nav, not an in-app route change) rather than shown a login
  // screen of this app's own. A PRESENT but expired token (the normal 12h hub timeout, checked the
  // same way the hub itself checks it - see isHubTokenExpired) gets the same bounce, instead of
  // being let through to silently fail the first backend call that needs it (see ClaimContext.tsx
  // fetchClaims's 2026-11-24 incident: a session that expired mid-use looked like lost data because
  // nothing caught this case before now).
  useEffect(() => {
    if (hasHubSession() && !isHubTokenExpired()) {
      setAuthorized(true);
    } else if (!isInitializing) {
      // AuthContext's own restoreSession effect already does this bounce when there's no hub
      // session at all; this is just the Shell's own belt-and-braces check once auth has settled.
      window.location.href = '/';
    }
  }, [isInitializing]);

  if (authorized !== true || isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-appBg">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-appBg">
      <Suspense fallback={null}>
        <ScreenHistoryTracker />
      </Suspense>
      {/* Single Back control — useScreenBack's own fallback chain (previous in-app screen, else
          browser back, else the hub) already covers returning to the hub, so a separate "Back to
          Emami Apps" link next to it was redundant. */}
      <div className="bg-brandDeep">
        <BackButton />
      </div>

      <div className="flex items-center justify-between border-b border-border bg-white px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-logo1.png.jpg`} alt="Emami Apps" className="h-[53px] w-16 shrink-0 object-contain" />
          <div>
            <p className="text-2xs font-semibold text-brand">Logged in as</p>
            <p className="text-sm font-extrabold text-ink">{currentUser?.employeeName || currentUser?.name || '—'}</p>
          </div>
        </div>
        <LogoutButton />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1280px] p-4">{children}</div>
      </div>

      <TabBar />
    </div>
  );
}

function BackButton() {
  const goBack = useScreenBack();
  return (
    <button
      type="button"
      onClick={goBack}
      className="w-full bg-brandDeep px-4 py-2 text-left text-sm font-semibold text-white hover:bg-brand"
    >
      ← Back
    </button>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return (
    <button
      type="button"
      onClick={() => {
        logout();
        window.location.href = '/';
      }}
      className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-bold text-ink hover:bg-appBg"
    >
      Logout
    </button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <ShellInner>{children}</ShellInner>;
}
