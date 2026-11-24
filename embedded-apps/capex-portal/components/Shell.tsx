'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from '@/lib/nav';
import { SessionProvider, useSession } from '@/lib/session';
import { ToastProvider, ErrorBox, Spinner, Chip } from './ui';
import NotificationBell from './dashboard/NotificationBell';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function Frame({ children }: { children: ReactNode }) {
  const s = useSession();
  const path = (usePathname() || '/').replace(BASE, '') || '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const groups = Array.from(new Set(NAV.filter((n) => !n.hidden && (!n.adminOnly || s.isAdmin)).map((n) => n.group)));
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <div className="aurora min-h-screen">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sap-line bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Menu" className="btn btn-secondary lg:hidden" onClick={() => setOpen((o) => !o)}>{'☰'}</button>
          <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" className="h-7" />
          <div className="leading-tight"><div className="font-display text-[14px] font-extrabold text-sap-ink">CAPEX Portal</div><div className="text-[10.5px] text-sap-muted">Budget {'→'} CPE {'→'} Approval {'→'} CWIP {'→'} Capitalization</div></div>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          {s.fiscalYear && <Chip tone="info">FY {s.fiscalYear}</Chip>}
          {s.role && <Chip>{s.role}</Chip>}
          {s.isAdmin && <Chip tone="warning">Admin</Chip>}
          {s.active && !s.loading && !s.error && <NotificationBell />}
          <span className="hidden font-bold sm:inline">{s.fullName || s.userId}</span>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1500px] gap-4 px-3 py-4">
        <nav aria-label="CAPEX navigation" className={`${open ? 'block' : 'hidden'} glass fixed inset-x-3 top-16 z-20 max-h-[75vh] overflow-y-auto rounded-xl p-3 lg:static lg:block lg:max-h-none lg:w-60 lg:shrink-0 lg:self-start`}>
          {groups.map((g) => (
            <div key={g} className="mb-3">
              <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-sap-muted">{g}</div>
              {NAV.filter((n) => n.group === g && !n.hidden && (!n.adminOnly || s.isAdmin)).map((n) => (
                <Link key={n.href} href={n.href} className={`block rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold ${active(n.href) ? 'nav-glow bg-plum text-white' : 'text-sap-ink hover:bg-[#EEF0FB]'}`}>{n.label}</Link>
              ))}
            </div>
          ))}
        </nav>
        <main className="min-w-0 flex-1">
          {s.loading ? <Spinner label="Loading your CAPEX profile" />
            : s.error ? <ErrorBox message={s.error} onRetry={s.reload} />
            : !s.active ? <ErrorBox message="Your Emami Apps e-mail is not set up as a CAPEX user in SAP yet (no active ZCAPEX_USER record). Ask the CAPEX administrator to add you, then reload." />
            : children}
        </main>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return <ToastProvider><SessionProvider><Frame>{children}</Frame></SessionProvider></ToastProvider>;
}
