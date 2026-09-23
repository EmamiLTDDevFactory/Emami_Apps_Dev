'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, Menu } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { avatarGradient } from '../utils/avatar';
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
  const { isLoggedIn, currentUser, directReports, getUserById } = useApp();
  const isWideScreen = useIsWideScreen();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

  if (!isLoggedIn) return <Login />;

  // A brand-new (or just-rejected) employee is blocked behind these two screens until a manager
  // approves them - see AppContext.tsx's status field. Managers are never gated (upsertHubUser
  // always gives them status 'active').
  if (currentUser.role === 'employee' && currentUser.status === 'pending') {
    return currentUser.managerId ? <AwaitingApproval currentUser={currentUser} /> : <PickManager />;
  }

  const isManager = currentUser?.role === 'manager';
  const manager = currentUser?.managerId ? getUserById(currentUser.managerId) : null;

  return (
    <div className="flex min-h-screen bg-appBg">
      <SidePane isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-white px-4 sm:px-6 lg:px-8">
          {!isWideScreen && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-inkSoft focus:outline-none focus-visible:ring-2 focus-visible:ring-rust"
            >
              <Menu size={18} />
            </button>
          )}

          <a href="/" className="btn-ghost">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back to Emami Apps</span>
          </a>

          <div ref={profileRef} className="relative ml-auto">
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              aria-label={`Account menu for ${currentUser?.name}`}
              aria-expanded={profileOpen}
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-rust"
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(
                  currentUser?.id
                )} text-xs font-semibold text-white shadow-xs`}
              >
                {currentUser?.name?.[0]}
              </div>
              <div className="hidden flex-col items-start leading-tight sm:flex">
                <span className="max-w-[140px] truncate text-sm font-semibold text-ink">{currentUser?.name}</span>
                <span className="flex items-center gap-1 text-xs text-inkSoft">
                  {isManager ? 'Manager' : 'Employee'}
                  <ChevronDown size={12} className={`transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                </span>
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl2 border border-border bg-white p-4 shadow-pop">
                <p className="truncate text-sm font-semibold text-ink">{currentUser?.name}</p>
                <p className="truncate text-xs text-inkSoft">{currentUser?.email}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-rust">{isManager ? 'Manager' : 'Employee'}</p>
                {manager && <p className="mt-1 text-xs text-inkSoft">Reports to {manager.name}</p>}
                {isManager && (
                  <p className="mt-1 text-xs text-inkSoft">
                    {directReports.length} direct report{directReports.length === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
