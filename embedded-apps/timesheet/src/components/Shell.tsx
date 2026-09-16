'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useApp } from '../context/AppContext';
import SidePane from './SidePane';
import Login from './gates/Login';
import PickManager from './gates/PickManager';
import AwaitingApproval from './gates/AwaitingApproval';

const WIDE_BREAKPOINT = 768;

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

export default function Shell({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, currentUser, resetDemoData } = useApp();
  const isWideScreen = useIsWideScreen();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const previousUserId = useRef<string | null>(null);

  // Switching who's logged in (demo picker) should land back on Dashboard, same as the original
  // app's own behavior - but only on an actual switch, not on first load, so a deep link
  // (bookmarked /my-timesheet/, a refreshed Team Approvals detail URL) survives a page load
  // instead of always snapping back to '/'.
  useEffect(() => {
    if (previousUserId.current && currentUser?.id && previousUserId.current !== currentUser.id) {
      router.push('/');
    }
    previousUserId.current = currentUser?.id ?? null;
  }, [currentUser?.id, router]);

  if (!isLoggedIn) return <Login />;

  // A brand-new (or just-rejected) employee is blocked behind these two screens until a manager
  // approves them - see AppContext.tsx's status field. Managers are never gated (upsertHubUser
  // always gives them status 'active').
  if (currentUser.role === 'employee' && currentUser.status === 'pending') {
    return currentUser.managerId ? <AwaitingApproval currentUser={currentUser} /> : <PickManager />;
  }

  return (
    <div className="flex min-h-screen bg-appBg">
      <SidePane isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!isWideScreen && (
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-white px-4">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-inkSoft focus:outline-none focus-visible:ring-2 focus-visible:ring-rust"
            >
              <Menu size={18} />
            </button>
            <span className="font-semibold text-ink">TimeSheet</span>
          </header>
        )}
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <footer className="px-4 pb-8 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={resetDemoData}
            className="text-xs text-inkSoft hover:text-ink focus:outline-none focus-visible:underline"
          >
            Reset demo data
          </button>
        </footer>
      </div>
    </div>
  );
}
