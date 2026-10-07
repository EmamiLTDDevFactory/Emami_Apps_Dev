'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FilePlus2, LayoutDashboard, ListChecks, Wallet, FileCheck2, type LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useClaim } from '../context/ClaimContext';
import { hasHubSession } from '../lib/hubEmailLogin';
import { Spinner, cx } from './ui';

// next/link prepends next.config.mjs's basePath automatically; plain <img>/<a> don't.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '/apps/expense';

type NavItem = { href: string; label: string; subtitle: string; icon: LucideIcon; badge?: number };

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
    if (!c.currentApprover) return false;
    if (activeRole === 'manager') {
      return normalizeId(c.currentApprover) === myNumeric && (c.rawStatus === 'N' || c.rawStatus === 'A');
    }
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

  const items: NavItem[] = [
    { href: '/', label: 'Dashboard', subtitle: 'Overview & Analytics', icon: LayoutDashboard },
    { href: '/create/', label: 'Create', subtitle: 'New Claim', icon: FilePlus2 },
    { href: '/my-claims/', label: 'My Claims', subtitle: 'View & Track Claims', icon: ListChecks },
  ];
  if (activeRole === 'manager' || activeRole === 'B') {
    items.push({ href: '/approvals/', label: 'Approvals', subtitle: 'Manager Review', icon: FileCheck2, badge: approvalsCount });
  }
  if (activeRole === 'finance') {
    items.push({ href: '/finance/', label: 'Finance', subtitle: 'Finance & Reports', icon: Wallet, badge: financeCount });
  }

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 border-t border-border bg-white px-3 py-2">
      {items.map((item) => {
        const active = pathname === norm(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            replace
            className={cx(
              'relative flex min-w-[110px] items-center gap-2 rounded-xl border px-3 py-2 transition-colors',
              active ? 'border-brand bg-brand text-white shadow-lift' : 'border-border bg-white text-ink hover:bg-appBg'
            )}
          >
            <Icon size={18} />
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
    </nav>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { currentUser, isInitializing } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Mirrors the Expo version's _layout.tsx auth gate: a visitor with no hub session is bounced
  // back to the hub root (full page nav, not an in-app route change) rather than shown a login
  // screen of this app's own.
  useEffect(() => {
    if (hasHubSession()) {
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a href="/" className="bg-brandDeep px-4 py-2 text-sm font-semibold text-white hover:bg-brand">
        ← Back to Emami Apps
      </a>

      <div className="flex items-center justify-between border-b border-border bg-white px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-logo1.png.jpg`} alt="Emami Apps" className="h-8 w-8 rounded-full object-cover" />
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
