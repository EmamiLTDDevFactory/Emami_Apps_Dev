'use client';

import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { getHubEmail, hasHubSession } from '../lib/hubEmailLogin';
import { AppProvider, useApp } from '../context/AppContext';
import ServiceUnavailable from './ServiceUnavailable';
import SidePane from './SidePane';

const WIDE_BREAKPOINT = 768; // matches every sibling embedded app's own SidePane breakpoint

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

function Gate({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const isWideScreen = useIsWideScreen();
  const [menuOpen, setMenuOpen] = useState(false);
  const { error, refresh } = useApp();

  useEffect(() => {
    getHubEmail();
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
    <div className="flex min-h-screen bg-appBg">
      <SidePane isOpen={menuOpen} onClose={() => setMenuOpen(false)} isWideScreen={isWideScreen} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!isWideScreen && (
          <header className="sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-border bg-white px-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-inkSoft"
            >
              <Menu size={16} />
            </button>
            <span className="text-[12.5px] font-extrabold text-ink">Term Life Policy</span>
          </header>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-4">{error ? <ServiceUnavailable error={error} onRetry={refresh} /> : children}</main>
      </div>
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
