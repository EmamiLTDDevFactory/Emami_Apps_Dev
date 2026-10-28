'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft, Menu, X, User, CalendarDays, LayoutGrid, Layers, CalendarRange, Wrench, CalendarClock,
  CheckCheck, History, AlertCircle, type LucideIcon,
} from 'lucide-react';
import { getHubEmail, hasHubSession, nameFromEmail } from '../lib/hubEmailLogin';
import { ScreenHistoryTracker, useScreenBack } from '../lib/screenHistory';
import { PaymentTrackingAuthProvider, usePaymentTrackingAuth } from '../context/PaymentTrackingAuthContext';
import { MonthYearProvider, useMonthYear, MONTH_OPTIONS, YEAR_OPTIONS, fiscalYearLabel } from '../context/MonthYearContext';
import { Select, Spinner, cx } from './ui';
import { SAP_SYSTEM } from '../lib/paymentTrackingApi';

const WIDE_BREAKPOINT = 768; // matches the hub's own useIsWideScreen + every sibling embedded app
// next/link prepends next.config.js's basePath; plain <img> doesn't.
const BASE_PATH = '/apps/payment-tracking';

type NavItem = { href: string; label: string; hint: string; icon: LucideIcon };

// Three roles, three distinct tab sets — same lists, same order as the Expo version's _layout.tsx:
//   Admin   — Dashboard, Provision Details, Calendar
//   Finance — Purchase Order Creation and Details, Upcoming Provision (All Vendors),
//             Pending Approval, Submission History
//   User    — Upcoming Provision, Missed Provision, Submission History
//   Super Admin — all of the above
const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard/', label: 'Dashboard', hint: 'Provisions at a glance', icon: LayoutGrid },
  { href: '/provision-details/', label: 'Provision Details', hint: 'Every open service PO', icon: Layers },
  { href: '/calendar/', label: 'Calendar', hint: 'Deliveries by date', icon: CalendarRange },
];
const FINANCE_NAV: NavItem[] = [
  { href: '/po-creation/', label: 'Purchase Order Creation and Details', hint: 'Upload and review POs', icon: Wrench },
  { href: '/admin-upcoming/', label: 'Upcoming Provision (All Vendors)', hint: 'Confirm deliveries for vendors', icon: CalendarClock },
  { href: '/pending-approval/', label: 'Pending Approval', hint: 'Approve or send back', icon: CheckCheck },
  { href: '/history/', label: 'Submission History', hint: 'Latest status, full audit trail', icon: History },
];
const USER_NAV: NavItem[] = [
  { href: '/upcoming/', label: 'Upcoming Provision', hint: 'Confirm this month\'s deliveries', icon: CalendarClock },
  { href: '/missed-delivery/', label: 'Missed Provision', hint: 'Deliveries past their date', icon: AlertCircle },
  { href: '/history/', label: 'Submission History', hint: 'Latest status, full audit trail', icon: History },
];

// Super Admin — every tab of the three roles above (Submission History once).
const SUPER_ADMIN_NAV: NavItem[] = [
  ...ADMIN_NAV,
  ...FINANCE_NAV,
  ...USER_NAV.filter((u) => !FINANCE_NAV.some((f) => f.href === u.href)),
];

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

const norm = (p: string | null) => (p || '/').replace(/\/?$/, '/');

function NavPane({ isOpen, onClose, isWide }: { isOpen: boolean; onClose: () => void; isWide: boolean }) {
  const pathname = norm(usePathname());
  const { role, roleLoading } = usePaymentTrackingAuth();
  // While the role lookup is still resolving, show no items rather than flashing the wrong set.
  const items = roleLoading ? [] : role === 'Super Admin' ? SUPER_ADMIN_NAV : role === 'Admin' ? ADMIN_NAV : role === 'Finance' ? FINANCE_NAV : USER_NAV;

  const pane = (
    <aside className={cx(
      'flex h-full w-[17rem] shrink-0 flex-col border-r border-border bg-white',
      !isWide && 'fixed inset-y-0 left-0 z-40 max-w-[85vw] shadow-pop animate-slideIn',
    )}>
      <div className="relative border-b border-line">
        {!isWide && (
          <button type="button" onClick={onClose} aria-label="Close menu" className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-inkSoft hover:bg-appBg hover:text-ink"><X size={18} /></button>
        )}
        <div className="mx-3 mt-3 flex justify-center rounded-2xl bg-cream/60 px-6 py-4 ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={150} height={124} className="h-auto w-[150px]" />
        </div>
        <div className="px-4 pb-3 pt-3">
          <p className="text-[15px] font-extrabold text-ink">Service PO Automation</p>
          <p className="text-xs text-inkSoft">Command Center — track every open service PO</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {roleLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {!roleLoading && items.length > 0 && <p className="px-3 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-inkFaint">{role}</p>}
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} replace onClick={() => { if (!isWide) onClose(); }}
              className={cx(
                'group relative flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors',
                active ? 'bg-rust/[0.08] text-rust' : 'text-ink hover:bg-appBg',
              )}
              aria-current={active ? 'page' : undefined}>
              {active && <span className="absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b from-rust to-ledger" />}
              <span className={cx('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition',
                active ? 'bg-gradient-to-br from-rust to-ledger text-white shadow-card' : 'bg-appBg text-rust group-hover:bg-white group-hover:shadow-card')}>
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-tight">{item.label}</span>
                <span className={cx('block truncate text-[11px]', active ? 'text-rust/75' : 'text-inkSoft')}>{item.hint}</span>
              </span>
            </Link>
          );
        })}
      </nav>
      {!roleLoading && (
        <div className="mx-3 mb-3 rounded-2xl bg-appBg px-3 py-2.5">
          <p className="text-2xs font-bold uppercase tracking-[0.1em] text-inkFaint">Signed in as</p>
          <p className="text-xs font-bold text-ink">{role}</p>
        </div>
      )}
    </aside>
  );

  if (isWide) return pane;
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-30 bg-plumDeep/50 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      {pane}
    </>
  );
}

/** Persistent Period bar on every page — Year is the financial year sent to SAP as Gjahr, Month
 * narrows rows client-side by delivery date. Each screen reads both via useMonthYear(). */
function PeriodBar() {
  const { month, year, setMonth, setYear } = useMonthYear();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-white/70 px-4 py-1.5 backdrop-blur">
      <CalendarDays size={13} className="text-rust" />
      <span className="text-2xs font-bold uppercase tracking-[0.1em] text-inkSoft">Period</span>
      <Select aria-label="Month" value={month} onChange={setMonth} options={MONTH_OPTIONS} className="!h-[26px] !w-auto !py-0 text-xs font-semibold" />
      <Select aria-label="Financial Year" value={year} onChange={setYear} options={YEAR_OPTIONS} className="!h-[26px] !w-auto !py-0 text-xs font-semibold" />
      <span className="chip bg-ledgerBg text-ledger">{fiscalYearLabel(Number(year))}</span>
    </div>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const isWide = useIsWideScreen();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hubEmail, setHubEmail] = useState<string | null>(null);
  const [today] = useState(() => new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }));

  // No login screen of its own: reaching this app is only valid with a real hub session (token +
  // email). Anyone else goes back to the hub to sign in — same guard as the Expo version.
  useEffect(() => {
    setHubEmail(getHubEmail());
    if (hasHubSession()) setAuthorized(true);
    else window.location.href = '/';
  }, []);

  if (authorized !== true) {
    return <div className="flex h-screen items-center justify-center bg-appBg"><Spinner size={28} /></div>;
  }

  return (
    <div className="flex h-screen bg-plum">
      <NavPane isOpen={menuOpen} onClose={() => setMenuOpen(false)} isWide={isWide} />
      <div className="flex min-w-0 flex-1 flex-col bg-appBg">
        <Suspense fallback={null}>
          <ScreenHistoryTracker />
        </Suspense>
        {/* Back (previous in-app screen) sits before the unchanged hub link; the 1fr column keeps the
            hub link's full-width click area. */}
        <div className="grid grid-cols-[auto_1fr] bg-plum">
          <BackButton />
          <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2 text-xs font-semibold text-white hover:bg-plumDeep">
            <ArrowLeft size={13} /> Back to Emami Apps
          </a>
        </div>
        <header className="flex items-center gap-2 border-b border-border bg-white px-4 py-2">
          {!isWide && (
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="-ml-1 p-1 text-ink"><Menu size={20} /></button>
          )}
          <h1 className="truncate text-[14.5px] font-extrabold text-ink">Service PO Automation</h1>
          <span className="hidden rounded-full bg-gradient-to-r from-rust/10 to-ledger/10 px-2 py-[2px] text-2xs font-extrabold uppercase tracking-wide text-rust sm:inline-flex">Command Center</span>
          <div className="flex-1" />
          <span
            title={`SAP system ${SAP_SYSTEM || 'unknown'}: ${SAP_SYSTEM === 'NWP' ? 'production (live data)' : 'development (test data)'}`}
            className={cx('inline-flex items-center rounded-full px-2.5 py-[3px] text-2xs font-extrabold uppercase tracking-wide', SAP_SYSTEM === 'NWP' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-900 ring-1 ring-amber-300')}
          >
            {SAP_SYSTEM === 'NWP' ? 'PRD' : 'DEV'}{SAP_SYSTEM ? ` · ${SAP_SYSTEM}` : ''}
          </span>
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-appBg px-2 py-[3px] sm:flex">
            <User size={12} className="text-rust" />
            <span className="max-w-[150px] truncate text-xs font-bold text-ink">{hubEmail ? nameFromEmail(hubEmail) : 'Guest'}</span>
          </span>
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-appBg px-2 py-[3px] md:flex">
            <CalendarDays size={12} className="text-rust" />
            <span className="text-xs font-bold text-ink">{today}</span>
          </span>
        </header>
        <PeriodBar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1500px] p-3 sm:p-4">{children}</div>
        </main>
      </div>
    </div>
  );
}

function BackButton() {
  const goBack = useScreenBack();
  return (
    <button
      type="button"
      onClick={goBack}
      className="flex items-center gap-1.5 border-r border-white/20 bg-plum px-4 py-2 text-xs font-semibold text-white hover:bg-plumDeep"
    >
      <ArrowLeft size={13} /> Back
    </button>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <PaymentTrackingAuthProvider>
      <MonthYearProvider>
        <ShellInner>{children}</ShellInner>
      </MonthYearProvider>
    </PaymentTrackingAuthProvider>
  );
}
