'use client';

// App frame: the hub-session gate every sibling embedded app uses (see mediclaim's Shell.tsx),
// plus the source Fiori app's tnt:ToolPage side navigation — Home, Masters, Audit Reporting
// System, MIS & Reporting — with the same per-click authorization as
// BaseController.handleNavigationItemPress (re-reads ZST_AUTH_USERSet, then allows or shows
// "You are not authorised to <item> page").
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, Home, Menu, X, Database, ClipboardList, BarChart3, ShieldAlert } from 'lucide-react';
import { hasHubSession, getHubEmail, nameFromEmail } from '../lib/hubEmailLogin';
import { goBack } from '../lib/goBack';
import { AppProvider, useApp } from '../context/AppContext';
import { UiProvider, useUi } from '../context/UiContext';
import { NAV_GROUPS, ROUTES, gateForPath, isGateAllowed, navTextForPath, type NavGroup, type NavLeaf } from '../lib/routes';

const BASE_PATH = '/apps/audit-tool';
const WIDE_BREAKPOINT = 1024;

const GROUP_ICONS: Record<NavGroup['key'], typeof Home> = {
  Masters: Database,
  AuditReportingSystem: ClipboardList,
  MisAndReporting: BarChart3,
};

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

function stripBase(pathname: string | null): string {
  const p = (pathname || '/').replace(new RegExp(`^${BASE_PATH}`), '') || '/';
  return p.endsWith('/') ? p : `${p}/`;
}

function SideNav({ isOpen, onClose, isWideScreen }: { isOpen: boolean; onClose: () => void; isWideScreen: boolean }) {
  const pathname = stripBase(usePathname());
  const router = useRouter();
  const { email, refreshScreenAuth } = useApp();
  const ui = useUi();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Expand the group containing the current screen, like the Fiori app's Expanded/* flags.
  useEffect(() => {
    for (const g of NAV_GROUPS) {
      if (g.items.some((i) => pathname.startsWith(ROUTES[i.route]))) setExpanded((e) => ({ ...e, [g.key]: true }));
    }
  }, [pathname]);

  const go = async (leaf: NavLeaf) => {
    if (!isWideScreen) onClose();
    if (leaf.gate === 'open') {
      router.push(ROUTES[leaf.route]);
      return;
    }
    ui.busy(true);
    try {
      const auth = await refreshScreenAuth();
      if (isGateAllowed(leaf.gate, auth)) router.push(ROUTES[leaf.route]);
      else ui.messageBox.error(`You are not authorised to ${leaf.text} page`);
    } catch {
      ui.messageBox.error('Internal Server error');
    } finally {
      ui.busy(false);
    }
  };

  const paneClasses = isWideScreen
    ? 'sticky top-0 h-screen w-60 shrink-0'
    : `fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;

  return (
    <>
      {!isWideScreen && isOpen && <div className="fixed inset-0 z-30 bg-plumDeep/50 backdrop-blur-sm" onClick={onClose} />}
      <aside className={`glass-panel m-0 flex flex-col rounded-none border-y-0 border-l-0 ${paneClasses}`}>
        <div className="border-b border-glassBorder">
          {!isWideScreen && (
            <div className="flex justify-end px-3 pt-3">
              <button onClick={onClose} aria-label="Close menu" className="p-1 text-inkSoft hover:text-ink">
                <X size={18} />
              </button>
            </div>
          )}
          <div className={`flex flex-col items-center justify-center gap-1 px-4 ${isWideScreen ? 'pt-4' : 'pt-1'} pb-4`}>
            <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={72} height={60} />
            </a>
            <Link
              href="/"
              onClick={() => !isWideScreen && onClose()}
              className="flex flex-col items-center gap-1"
              aria-label="Go to Audit Tool home"
            >
              <span className="text-center text-[12.5px] font-bold leading-tight tracking-tight text-ink">Audit Tool</span>
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-inkSoft">MSD · Internal Audit</span>
            </Link>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2.5">
          <Link
            href="/"
            onClick={() => !isWideScreen && onClose()}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-bold transition-colors ${
              pathname === '/' ? 'bg-glassRust text-rust' : 'text-inkSoft hover:bg-white/50 hover:text-ink'
            }`}
          >
            <Home size={15} />
            Home
          </Link>
          {NAV_GROUPS.map((g) => {
            const Icon = GROUP_ICONS[g.key];
            const isOpenGroup = !!expanded[g.key];
            return (
              <div key={g.key}>
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [g.key]: !e[g.key] }))}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] font-bold text-inkSoft hover:bg-white/50 hover:text-ink"
                >
                  <Icon size={15} />
                  <span className="flex-1">{g.text}</span>
                  <ChevronRight size={14} className={`transition-transform ${isOpenGroup ? 'rotate-90' : ''}`} />
                </button>
                {isOpenGroup && (
                  <div className="mb-1 ml-5 flex flex-col border-l border-border pl-2">
                    {g.items.map((leaf) => {
                      const active = pathname.startsWith(ROUTES[leaf.route]);
                      return (
                        <button
                          key={leaf.route}
                          type="button"
                          onClick={() => go(leaf)}
                          className={`rounded-md px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors ${
                            active ? 'bg-glassRust text-rust' : 'text-inkSoft hover:bg-white/50 hover:text-ink'
                          }`}
                        >
                          {leaf.text}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-glassBorder p-3">
          {email && (
            <div className="truncate rounded-lg border border-border bg-appBg px-2.5 py-1.5 text-[11.5px] font-bold text-ink" title={email}>
              {nameFromEmail(email)}
            </div>
          )}
          <button type="button" onClick={goBack} className="btn-ghost w-full !px-2.5 !py-1.5 text-[11.5px]">
            <ArrowLeft size={13} />
            Back
          </button>
        </div>
      </aside>
    </>
  );
}

/** Page-level version of the side-nav check, so a typed or bookmarked URL to a gated screen gets
 * the same answer a nav click would. */
function ScreenGuard({ children }: { children: React.ReactNode }) {
  const pathname = stripBase(usePathname());
  const { screenAuth, authLoaded } = useApp();
  const gate = gateForPath(pathname);
  if (gate === 'open') return <>{children}</>;
  if (!authLoaded) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }
  if (!isGateAllowed(gate, screenAuth)) {
    return (
      <div className="card mx-auto mt-10 flex max-w-md flex-col items-center gap-3 p-6 text-center">
        <ShieldAlert className="text-red" size={28} />
        <p className="text-[13px] font-semibold text-ink">You are not authorised to {navTextForPath(pathname)} page</p>
        <Link href="/" className="btn-ghost">
          Go to Home
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const isWideScreen = useIsWideScreen();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    getHubEmail();
    if (hasHubSession()) setAuthorized(true);
    else if (typeof window !== 'undefined') window.location.href = '/';
  }, []);

  if (authorized !== true) {
    return (
      <div className="flex h-screen items-center justify-center bg-appBg">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }

  return (
    <AppProvider>
      <div className="flex min-h-screen bg-appBg">
        <SideNav isOpen={menuOpen} onClose={() => setMenuOpen(false)} isWideScreen={isWideScreen} />
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
              <span className="text-[12.5px] font-extrabold text-ink">Audit Tool</span>
            </header>
          )}
          <main className="w-full min-w-0 flex-1 p-3 sm:p-4">
            <ScreenGuard>{children}</ScreenGuard>
          </main>
        </div>
      </div>
    </AppProvider>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>
      <Gate>{children}</Gate>
    </UiProvider>
  );
}
