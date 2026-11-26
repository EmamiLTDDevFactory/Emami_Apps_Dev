'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft, Banknote, ClipboardCheck, ClipboardList, FileBarChart, FilePlus2, FileText, History, Landmark, LayoutDashboard, Menu, PackageCheck,
  ReceiptText, Settings2, ShieldCheck, ShoppingCart, User, CalendarDays, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { NAV } from '@/lib/nav';
import { SessionProvider, useSession } from '@/lib/session';
import { ToastProvider, ErrorBox, Spinner } from './ui';
import NotificationBell from './dashboard/NotificationBell';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const WIDE = 1024;

const ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard, '/approvals/': ClipboardCheck, '/budget/': Landmark, '/budget/create/': FilePlus2, '/cpe/': ClipboardList, '/cpe/create/': FilePlus2,
  '/po/': ShoppingCart, '/grn/': PackageCheck, '/ic/': ReceiptText, '/capitalization/': Banknote, '/quota/': Wallet, '/reports/': FileBarChart, '/audit/': History, '/admin/doa/': Settings2,
};
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= WIDE);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return wide;
}

/** White side pane: logo card, app title, grouped screens with an icon tile and a hint, "signed in as" box (same pattern as Service PO Automation). */
function NavPane({ open, onClose, wide, path }: { open: boolean; onClose: () => void; wide: boolean; path: string }) {
  const s = useSession();
  const items = NAV.filter((n) => !n.hidden && (!n.adminOnly || s.hubAdmin));
  const groups = Array.from(new Set(items.map((n) => n.group)));
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const pane = (
    <aside className={cx('no-print flex h-full w-[17rem] shrink-0 flex-col border-r border-sap-line bg-white', !wide && 'fixed inset-y-0 left-0 z-40 max-w-[85vw] shadow-pop')} aria-label="CAPEX navigation">
      <div className="relative border-b border-sap-line">
        {!wide && <button type="button" onClick={onClose} aria-label="Close menu" className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-sap-muted hover:bg-sap-bg hover:text-sap-ink"><X size={18} /></button>}
        <div className="mx-3 mt-3 flex justify-center rounded-2xl bg-plum-soft/70 px-6 py-3 ring-1 ring-sap-line">
          <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={120} height={99} className="h-auto w-[120px]" />
          </a>
        </div>
        <div className="px-4 pb-3 pt-3">
          <p className="text-[15px] font-extrabold text-sap-ink">CAPEX Portal</p>
          <p className="text-[11.5px] text-sap-muted">Budget {'→'} CPE {'→'} Approval {'→'} CWIP {'→'} Capitalization</p>
        </div>
      </div>
      <nav className="scroll-thin flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {groups.map((g) => (
          <div key={g} className="mb-1.5">
            <p className="px-3 pb-1 pt-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-sap-muted/80">{g}</p>
            {items.filter((n) => n.group === g).map((n) => {
              const on = isActive(n.href);
              const Icon = ICONS[n.href] ?? FileText;
              return (
                <Link key={n.href} href={n.href} onClick={() => { if (!wide) onClose(); }} aria-current={on ? 'page' : undefined}
                  className={cx('group relative flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors', on ? 'bg-plum/[0.08] text-plum' : 'text-sap-ink hover:bg-sap-bg')}>
                  {on && <span className="absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b from-plum to-orange" />}
                  <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl transition', on ? 'bg-gradient-to-br from-[#3B4FD8] to-plum text-white shadow-glow' : 'bg-sap-bg text-plum group-hover:bg-white group-hover:shadow-card')}><Icon size={16} /></span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold leading-tight">{n.label}</span>
                    {n.hint && <span className={cx('block truncate text-[11px]', on ? 'text-plum/75' : 'text-sap-muted')}>{n.hint}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {!s.loading && (
        <div className="mx-3 mb-3 rounded-2xl bg-sap-bg px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-sap-muted">Signed in as</p>
          <p className="truncate text-xs font-bold text-sap-ink">{s.fullName || s.userId || 'CAPEX Portal user'}</p>
          <p className="truncate text-[11px] text-sap-muted">{[s.role, s.hubAdmin ? 'Admin' : ''].filter(Boolean).join(' · ') || 'No CAPEX role yet'}</p>
        </div>
      )}
    </aside>
  );
  if (wide) return pane;
  if (!open) return null;
  return (<><div className="fixed inset-0 z-30 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />{pane}</>);
}

function Frame({ children }: { children: ReactNode }) {
  const s = useSession();
  const path = (usePathname() || '/').replace(BASE, '') || '/';
  const wide = useIsWide();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState('');
  useEffect(() => setOpen(false), [path]);
  useEffect(() => setToday(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })), []);
  const here = NAV.filter((n) => path === n.href || (n.href !== '/' && path.startsWith(n.href))).sort((a, b) => b.href.length - a.href.length)[0];
  const back = () => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; };

  return (
    <div className="flex h-screen overflow-clip bg-brand">
      <NavPane open={open} onClose={() => setOpen(false)} wide={wide} path={path} />
      <div className="app-canvas flex min-w-0 flex-1 flex-col overflow-clip bg-sap-bg">
        <header className="no-print">
          <div aria-hidden className="banner-line h-1" />
          <div className="page-banner flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-white sm:px-5">
            {!wide && <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-white hover:bg-white/10"><Menu size={22} /></button>}
            <button type="button" onClick={back} aria-label="Back" title="Back" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/30 bg-white/10 text-white transition hover:bg-white/20"><ArrowLeft size={17} /></button>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate font-display text-[16px] font-extrabold">{here?.label ?? 'CAPEX Portal'}</h1>
              <p className="truncate text-[11px] text-white/70">CAPEX Portal{here?.hint ? ` · ${here.hint}` : ''}</p>
            </div>
            <div className="flex-1" />
            {s.fiscalYear && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ring-1 ring-white/30">FY {s.fiscalYear}</span>}
            {(s.isAdmin || s.hubAdmin) && <span className="inline-flex items-center gap-1 rounded-full bg-orange px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"><ShieldCheck size={11} />Admin</span>}
            {s.active && !s.loading && !s.error && <span className="rounded-full bg-white/10 ring-1 ring-white/25"><NotificationBell /></span>}
            <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/25 sm:flex"><User size={12} /><span className="max-w-[160px] truncate text-xs font-bold">{s.fullName || s.userId || 'Guest'}</span></span>
            <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/25 md:flex"><CalendarDays size={12} /><span className="text-xs font-bold">{today}</span></span>
          </div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1500px] p-3 sm:p-4">
            {s.loading ? <Spinner label="Loading your CAPEX profile" />
              : s.error ? <ErrorBox message={s.error} onRetry={s.reload} />
              : !s.active && !(s.hubAdmin && path.startsWith('/admin')) ? (
                <>
                  <ErrorBox message="Your Emami Apps e-mail is not set up as a CAPEX user yet (no active CAPEX user with this e-mail). Ask a CAPEX Portal administrator to add you in Maintenance, then reload." />
                  {s.hubAdmin && <p className="mt-3 text-[12px]">You are an administrator: <Link href="/admin/doa/" className="font-bold text-plum underline">open Maintenance</Link> to add yourself as a CAPEX user.</p>}
                </>
              ) : children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return <ToastProvider><SessionProvider><Frame>{children}</Frame></SessionProvider></ToastProvider>;
}
