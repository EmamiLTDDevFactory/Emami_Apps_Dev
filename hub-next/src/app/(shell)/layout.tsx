'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { colors } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { useIsWideScreen } from '../../hooks/useIsWideScreen';
import { SearchProvider, useSearch } from '../../context/SearchContext';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import InstallPrompt from '../../components/InstallPrompt';

function ShellChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isWideScreen = useIsWideScreen();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { searchValue, setSearchValue } = useSearch();

  // Closes the mobile drawer whenever navigation actually happens (matches React Navigation's own
  // drawer-closes-on-navigate behavior) and resets the search box between pages — each page owned
  // its own query state before this was lifted into shared context for the Header to write into.
  useEffect(() => {
    setDrawerOpen(false);
    setSearchValue('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {isWideScreen ? (
        <div style={{ width: 184, flexShrink: 0, borderRight: `1px solid ${colors.sidebarBorder}` }}>
          <Sidebar compact />
        </div>
      ) : (
        drawerOpen && (
          <>
            <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(31,27,51,0.35)', zIndex: 60 }} />
            <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 218, zIndex: 70, boxShadow: '0 0 30px rgba(21,17,41,0.2)' }}>
              <Sidebar />
            </div>
          </>
        )
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: colors.appBg }}>
        <Header
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenSettings={() => router.push('/settings')}
        />
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
      <InstallPrompt />
    </div>
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, isLoggedIn } = useAuth();

  useEffect(() => {
    if (ready && !isLoggedIn) router.replace('/login');
  }, [ready, isLoggedIn, router]);

  // Avoids flashing the shell (or a blank page) for the instant between `ready` becoming true and
  // the redirect above actually landing on /login.
  if (!isLoggedIn) return null;

  return (
    <SearchProvider>
      <ShellChrome>{children}</ShellChrome>
    </SearchProvider>
  );
}
