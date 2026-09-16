'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, LayoutGrid, HeartPulse, ShieldCheck, BarChart3, Menu, X } from 'lucide-react';
import { getHubEmail, hasHubSession, nameFromEmail } from '../lib/hubEmailLogin';
import { AppProvider, useApp } from '../context/AppContext';

// next/link's `href` and next/navigation's router both auto-prepend next.config.js's basePath —
// nav hrefs below are written WITHOUT it. Plain <img> tags get no such help, so this is the one
// place that constant is spelled out, same convention every sibling app's Shell.tsx follows.
const BASE_PATH = '/apps/insurance-policy';
const WIDE_BREAKPOINT = 640;

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

function NavTabs({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isAdmin } = useApp();
  const items = [
    { href: '/', label: 'Home', icon: LayoutGrid },
    { href: '/mediclaim/', label: 'Mediclaim', icon: HeartPulse },
    { href: '/term-policy/', label: 'Term Policy', icon: ShieldCheck },
    ...(isAdmin ? [{ href: '/admin/', label: 'Admin', icon: BarChart3 }] : []),
  ];
  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition-colors ${
              active ? 'bg-rust text-white' : 'text-inkSoft hover:bg-appBg hover:text-ink'
            }`}
          >
            <Icon size={13} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function Header({ hubEmail }: { hubEmail: string | null }) {
  const isWideScreen = useIsWideScreen();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white">
      <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={26} height={22} />
        <h1 className="truncate text-[13.5px] font-extrabold text-ink">Mediclaim &amp; Term Policy</h1>

        {isWideScreen ? (
          <nav className="ml-3 flex items-center gap-1">
            <NavTabs />
          </nav>
        ) : (
          <button onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle menu" className="ml-2 p-1 text-ink">
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        )}

        <div className="flex-1" />

        {hubEmail && (
          <span className="hidden sm:inline-flex max-w-[140px] truncate rounded-full border border-border bg-appBg px-2 py-0.5 text-[11px] font-bold text-ink">
            {nameFromEmail(hubEmail)}
          </span>
        )}
        <a
          href="/"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold text-inkSoft hover:bg-appBg hover:text-ink"
        >
          <ArrowLeft size={12} />
          <span className="hidden sm:inline">Back to Emami Apps</span>
        </a>
      </div>
      {!isWideScreen && menuOpen && (
        <nav className="flex items-center gap-1 border-t border-border px-3 py-1.5">
          <NavTabs onNavigate={() => setMenuOpen(false)} />
        </nav>
      )}
    </header>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [hubEmail, setHubEmail] = useState<string | null>(null);

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
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-appBg">
      <Header hubEmail={hubEmail} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-4">{children}</main>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Gate>{children}</Gate>
    </AppProvider>
  );
}
