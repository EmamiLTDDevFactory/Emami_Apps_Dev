'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Radar, PackagePlus, ClipboardList, Truck, Gavel, Receipt, Users, Building2, Settings, FileBarChart, Bell, Menu, X, ArrowLeft, RotateCcw, ShieldCheck, FileInput, Handshake, Boxes, Network, MapPin } from 'lucide-react';
import { TmsProvider, useTms } from '../lib/store';
import { goBack } from '../lib/goBack';
import { hasHubSession } from '../lib/hubEmailLogin';
import { fmtDT } from './ui';

const BASE = '/apps/smartruck-tms';
const NAV: { href: string; label: string; icon: LucideIcon; perm?: string }[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/control-tower/', label: 'Control Tower', icon: Radar },
  { href: '/post-order/', label: 'Post Order', icon: PackagePlus },
  { href: '/indents/', label: 'Indents', icon: FileInput },
  { href: '/vehicle-invoices/', label: 'Vehicle Invoices', icon: Receipt },
  { href: '/loading-optimizer/', label: 'Loading Optimizer', icon: Boxes },
  { href: '/distribution-planning/', label: 'Distribution Planning', icon: Network, perm: 'plan.view' },
  { href: '/locations-map/', label: 'Plant Map', icon: MapPin },
  { href: '/vendor/', label: 'Vendor Portal', icon: Handshake },
  { href: '/orders/', label: 'Orders', icon: ClipboardList },
  { href: '/shipments/', label: 'Shipments', icon: Truck },
  { href: '/bidding/', label: 'Bidding Room', icon: Gavel },
  { href: '/accounting/', label: 'Accounting', icon: Receipt },
  { href: '/carriers/', label: 'Carriers', icon: Users },
  { href: '/customers/', label: 'Customers', icon: Building2 },
  { href: '/reports/', label: 'Reports', icon: FileBarChart },
  { href: '/settings/', label: 'Settings', icon: Settings },
];

function Chrome({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/';
  const t = useTms();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const [wide, setWide] = useState(true);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 1024); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const norm = (p: string) => (p.replace(/\/$/, '') || '/');
  const active = (h: string) => (h === '/' ? norm(path) === '/' : norm(path).startsWith(norm(h)));
  const unread = t.db.notifications.filter((n) => !n.read).length;
  const live = t.mode === 'live';
  const vendor = live && t.me.roles.includes('Carrier Vendor');
  useEffect(() => { if (vendor && (path === '/' || path === '')) router.replace('/vendor/'); }, [vendor, path, router]);
  const nav = vendor ? NAV.filter((n) => n.href === '/bidding/' || n.href === '/vendor/') : NAV.filter((n) => !n.perm || t.can(n.perm));
  const pane = wide ? 'relative w-60 shrink-0 border-r border-border bg-white' : `fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-pop transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}`;

  return (
    <div className="flex min-h-screen bg-appBg text-ink">
      {!wide && open && <div className="fixed inset-0 z-30 bg-plumDeep/50" onClick={() => setOpen(false)} />}
      <aside className={pane}>
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={120} height={99} /></a>
          {!wide && <button onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>}
        </div>
        <div className="px-4 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-wider text-inkSoft">Trip Trail</div>
        <nav className="flex flex-col gap-0.5 p-3 pt-1">
          {nav.map((n) => { const I = n.icon; const a = active(n.href); return (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-bold ${a ? 'bg-rust/10 text-rust' : 'text-inkSoft hover:bg-appBg hover:text-ink'}`}><I size={17} />{n.label}</Link>
          ); })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {live ? (() => { const i = t.liveState.integrations; const sim = i ? Object.entries(i).filter(([, v]) => v === 'simulated' || v === 'disabled').map(([k]) => k) : []; return (
          <div className={`px-4 py-1.5 text-center text-[11px] font-bold ${sim.length ? 'bg-amberBg text-amber' : 'bg-greenBg text-green'}`}>LIVE — data is stored on the Emami Apps server{sim.length ? `. Not connected yet: ${sim.join(', ')} (simulated).` : '. All integrations connected.'}</div>); })()
          : <div className="bg-amberBg px-4 py-1.5 text-center text-[11px] font-bold text-amber">DEMO — seeded sample data, saved only in this browser. No SAP, JDE, GPS or telecom integration is connected.</div>}
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-white px-4 py-2.5">
          {!wide && <button onClick={() => setOpen(true)} aria-label="Menu" className="rounded-lg border border-border p-1.5"><Menu size={18} /></button>}
          <button onClick={goBack} className="hidden items-center gap-1 text-xs font-bold text-inkSoft hover:text-ink sm:flex"><ArrowLeft size={14} />Back</button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select className="input !w-auto !py-1.5 text-xs font-bold" value={t.unitId} onChange={(e) => t.setUnitId(e.target.value)} aria-label="Unit">
              {t.db.units.filter((u) => t.me.units.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
            </select>
            <div className="flex overflow-hidden rounded-xl border border-border text-xs font-bold">
              <button onClick={() => t.setAllUnits(false)} className={`px-3 py-1.5 ${!t.allUnits ? 'bg-rust text-white' : 'text-inkSoft'}`}>My Unit</button>
              <button onClick={() => t.setAllUnits(true)} className={`px-3 py-1.5 ${t.allUnits ? 'bg-rust text-white' : 'text-inkSoft'}`}>All Units</button>
            </div>
            <div className="relative">
              <button onClick={() => { setBell((b) => !b); if (!bell) t.markRead(); }} className="relative rounded-xl border border-border p-2" aria-label="Notifications"><Bell size={16} />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red px-1.5 text-[10px] font-bold text-white">{unread}</span>}</button>
              {bell && (<><div className="fixed inset-0 z-30" onClick={() => setBell(false)} />
                <div className="absolute right-0 z-40 mt-2 max-h-96 w-80 overflow-y-auto rounded-2xl border border-border bg-white shadow-pop">
                  <div className="border-b border-border px-4 py-2.5 text-sm font-extrabold">Notifications</div>
                  {t.db.notifications.map((n) => (<div key={n.id} className="border-b border-border/60 px-4 py-2.5 text-[13px]"><div className={`font-semibold ${n.level === 'crit' ? 'text-red' : n.level === 'warn' ? 'text-amber' : 'text-ink'}`}>{n.text}</div><div className="hint">{fmtDT(n.at)}</div></div>))}
                </div></>)}
            </div>
            {live ? <div className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-inkSoft"><ShieldCheck size={14} className="text-rust" />{t.me.name} · {t.me.roles.join(', ')}</div> : <label className="flex items-center gap-1.5 rounded-xl border border-border px-2 py-1 text-xs font-bold text-inkSoft" title="Switch user to see role-based permissions in action">
              <ShieldCheck size={14} className="text-rust" />Act as
              <select className="bg-transparent text-xs font-bold text-ink outline-none" value={t.me.id} onChange={(e) => t.setMe(e.target.value)}>
                {t.db.users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.roles[0]}</option>)}
              </select>
            </label>}
            {!live && <button onClick={() => { if (confirm('Reset all demo data to the original seed?')) { t.resetDemo(); t.toast('Demo data reset'); } }} className="rounded-xl border border-border p-2 text-inkSoft hover:text-ink" title="Reset demo data"><RotateCcw size={15} /></button>}
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>

      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {t.toasts.map((x) => <div key={x.id} className={`animate-slideUp rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-pop ${x.kind === 'ok' ? 'bg-green' : 'bg-red'}`}>{x.msg}</div>)}
      </div>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const t = useTms();
  const [session, setSession] = useState<boolean | null>(null);
  useEffect(() => { setSession(hasHubSession()); }, []);
  const msg = (m: string, sub?: string) => <div className="flex min-h-screen items-center justify-center bg-appBg p-6"><div className="card max-w-md p-6 text-center"><div className="text-base font-extrabold text-ink">{m}</div>{sub && <p className="hint mt-2">{sub}</p>}</div></div>;
  if (!t.modeKnown) return msg('Loading Trip Trail…');
  if (t.mode !== 'live') return <Chrome>{children}</Chrome>;
  if (session === false) return msg('Please open Trip Trail from Emami Apps', 'Your Emami Apps session was not found. Sign in to the hub and open the tile again.');
  if (!t.liveState.ready) return msg('Loading Trip Trail…');
  if (t.liveState.error) return msg('Trip Trail is not available', t.liveState.error);
  return <Chrome>{children}</Chrome>;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/';
  if (path.startsWith('/track')) return <>{children}</>; // public recipient page: no hub session, no app chrome
  return <TmsProvider><Gate>{children}</Gate></TmsProvider>;
}
