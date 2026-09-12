'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, LayoutDashboard, Menu, X, ArrowLeft, User, Calendar } from 'lucide-react';
import { getHubEmail, hasHubSession, nameFromEmail } from '../lib/hubEmailLogin';

const WIDE_BREAKPOINT = 768; // matches the hub's own useIsWideScreen + every sibling embedded app

// next/link's `href` and next/navigation's router both auto-prepend next.config.js's basePath —
// so nav hrefs/router.push calls throughout this app are written WITHOUT it (see page.tsx/
// details/page.tsx). Plain <img>/<a> tags get no such help, so this is the one place that constant
// is spelled out, for the logo image below.
const BASE_PATH = '/apps/fm-po-deviation';

const NAV_ITEMS = [
  { href: '/', label: 'Approvals', icon: ClipboardCheck },
  { href: '/dashboard/', label: 'Dashboard', icon: LayoutDashboard },
];

function formatDateCompact(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function useIsWideScreen() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= WIDE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return wide;
}

function NavPane({ isOpen, onClose, isWideScreen }: { isOpen: boolean; onClose: () => void; isWideScreen: boolean }) {
  const pathname = usePathname();

  const paneClasses = isWideScreen
    ? 'relative w-64 shrink-0 border-r border-border bg-white'
    : `fixed inset-y-0 left-0 z-40 w-72 max-w-[80vw] bg-white shadow-pop transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;

  return (
    <>
      {!isWideScreen && isOpen && (
        <div className="fixed inset-0 z-30 bg-plumDeep/50 backdrop-blur-sm" onClick={onClose} />
      )}
      <aside className={paneClasses}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={30} height={26} className="rounded" />
            <span className="text-sm font-extrabold text-ink">PO Deviation</span>
          </div>
          {!isWideScreen && (
            <button onClick={onClose} aria-label="Close menu" className="p-1 text-inkSoft hover:text-ink">
              <X size={20} />
            </button>
          )}
        </div>
        <nav className="p-3 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { if (!isWideScreen) onClose(); }}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors ${
                  active ? 'bg-rust/10 text-rust' : 'text-inkSoft hover:bg-appBg hover:text-ink'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const isWideScreen = useIsWideScreen();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hubEmail, setHubEmail] = useState<string | null>(null);
  const [today] = useState(() => formatDateCompact(new Date()));

  useEffect(() => {
    setHubEmail(getHubEmail());
    if (hasHubSession()) {
      setAuthorized(true);
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, []);

  if (authorized !== true) {
    return (
      <div className="flex h-screen items-center justify-center bg-appBg">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-plum">
      <div className="flex flex-1">
        <NavPane isOpen={menuOpen} onClose={() => setMenuOpen(false)} isWideScreen={isWideScreen} />

        <div className="flex min-w-0 flex-1 flex-col bg-appBg">
          <a
            href="/"
            className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plumDeep"
          >
            <ArrowLeft size={14} />
            Back to Emami Apps
          </a>

          <header className="flex items-center gap-2.5 border-b border-border bg-white px-4 py-2.5">
            {!isWideScreen && (
              <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="p-1 text-ink">
                <Menu size={22} />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={32} height={26} className="rounded" />
            <h1 className="truncate text-[15px] font-extrabold text-ink">PO Deviation Approval</h1>
            <span className="hidden sm:inline-flex rounded-full bg-rust/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rust">
              Command Center
            </span>
            <div className="flex-1" />
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-appBg px-2.5 py-1">
              <User size={13} className="text-rust" />
              <span className="max-w-[140px] truncate text-[11.5px] font-bold text-ink">
                {hubEmail ? nameFromEmail(hubEmail) : 'Guest'}
              </span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 rounded-full border border-border bg-appBg px-2.5 py-1">
              <Calendar size={13} className="text-rust" />
              <span className="text-[11.5px] font-bold text-ink">{today}</span>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
