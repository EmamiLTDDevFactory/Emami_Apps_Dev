'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Building2, Calendar, Gauge, LayoutDashboard, Megaphone, Menu, PieChart, Table2, Tags, X, type LucideIcon } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { BASE_PATH } from '@/lib/config';
import { AppContext, type Ctx, type View } from '@/lib/context';
import { amt, defaultPeriod, fmtDateTime, type Unit } from '@/lib/format';
import { getHubEmail, hasHubSession, nameFromEmail } from '@/lib/hub';
import { applyFilters } from '@/lib/model';
import type { AppConfig, Filters, Meta, SummaryRow } from '@/lib/types';
import FilterBar from './FilterBar';
import Overview from './dash/Overview';
import Report from './Report';
import Brands from './dash/Brands';
import MediaMix from './dash/MediaMix';
import Budget from './dash/Budget';
import CostCentres from './dash/CostCentres';
import { Avatar, Button, Empty, Notice, Skeleton, cx } from './ui';

const NAV: { id: View; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', hint: 'A&P spend at a glance', icon: LayoutDashboard },
  { id: 'report', label: 'MIS report', hint: 'Summary + G/L drill-down', icon: Table2 },
  { id: 'brands', label: 'Brands', hint: 'Portfolio, growth, Pareto', icon: Tags },
  { id: 'media', label: 'Media mix', hint: 'ATL / BTL, media, G/L', icon: PieChart },
  { id: 'budget', label: 'Budget vs actual', hint: 'OB / RB utilisation', icon: Gauge },
  { id: 'costcentres', label: 'Cost centres', hint: 'Sites, mapping, reconciliation', icon: Building2 },
];
const VIEWS = new Set<View>(NAV.map((n) => n.id));

// ---------------------------------------------------------------- URL state (?v=report&fy=2026&p=7&site=HO,UN ...)

const LIST_KEYS = ['site', 'groups', 'categories', 'brands'] as const;
function readUrl(): { view: View; filters: Filters; unit: Unit } {
  const d = defaultPeriod();
  const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const view = (q.get('v') as View) || 'overview';
  const period = Number(q.get('p'));
  const unit = q.get('u') as Unit;
  const list = (k: string) => (q.get(k) || '').split('|').filter(Boolean);
  return {
    view: VIEWS.has(view) ? view : 'overview',
    unit: unit === 'crore' || unit === 'inr' ? unit : 'lakh',
    filters: {
      fy: /^20\d\d$/.test(q.get('fy') || '') ? (q.get('fy') as string) : d.fy,
      period: Number.isInteger(period) && period >= 1 && period <= 12 ? period : d.period,
      company: (q.get('cc') || '').toUpperCase(),
      site: list('site'), groups: list('groups'), categories: list('categories'), brands: list('brands'),
    },
  };
}
function writeUrl(view: View, f: Filters, unit: Unit) {
  const q = new URLSearchParams();
  q.set('v', view); q.set('fy', f.fy); q.set('p', String(f.period));
  if (f.company) q.set('cc', f.company);
  if (unit !== 'lakh') q.set('u', unit);
  for (const k of LIST_KEYS) if (f[k].length) q.set(k, f[k].join('|'));
  try { window.history.replaceState(null, '', `${window.location.pathname}?${q}`); } catch { /* sandboxed */ }
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string; status: number } | { kind: 'ready'; rows: SummaryRow[]; meta: Meta };

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);
  const [view, setView] = useState<View>('overview');
  const [filters, setFiltersState] = useState<Filters | null>(null);
  const [unit, setUnit] = useState<Unit>('lakh');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [menu, setMenu] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setSession(hasHubSession());
    const u = readUrl();
    setView(u.view); setFiltersState(u.filters); setUnit(u.unit);
  }, []);

  useEffect(() => { if (filters) writeUrl(view, filters, unit); }, [view, filters, unit]);

  const fy = filters?.fy; const period = filters?.period;
  useEffect(() => {
    if (!session || !fy || !period) return;
    let live = true;
    setLoad({ kind: 'loading' });
    Promise.all([config ? Promise.resolve(config) : api.config(), api.summary({ fy, period, refresh: nonce > 0 })])
      .then(([c, s]) => { if (!live) return; setConfig(c); setLoad({ kind: 'ready', rows: s.rows, meta: s.meta }); })
      .catch((e: ApiError) => live && setLoad({ kind: 'error', message: e.message, status: e.status }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is loaded once; nonce = manual refresh
  }, [session, fy, period, nonce]);

  const setFilters = useCallback((f: Partial<Filters>) => setFiltersState((old) => (old ? { ...old, ...f } : old)), []);
  const go = useCallback((v: View, f?: Partial<Filters>) => { setView(v); if (f) setFilters(f); setMenu(false); }, [setFilters]);

  const ctx: Ctx | null = useMemo(() => {
    if (!filters || !config || load.kind !== 'ready') return null;
    const all = filters.company ? load.rows.filter((r) => r.CompanyCode === filters.company) : load.rows;
    return {
      config, meta: load.meta, all, companies: [...new Set(load.rows.map((r) => r.CompanyCode))].sort(), rows: applyFilters(all, filters), filters, setFilters, unit, setUnit,
      fmt: (v: number) => amt(v, unit), go, reload: () => setNonce((n) => n + 1),
    };
  }, [filters, config, load, unit, setFilters, go]);

  if (session === null || !filters) return <div className="p-6"><Skeleton rows={6} /></div>;
  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="max-w-md rounded-2xl border border-line bg-panel p-8 text-center shadow-card">
          <Megaphone className="mx-auto mb-3 text-accent" size={30} />
          <h1 className="text-lg font-extrabold">Publicity Expenses</h1>
          <p className="mt-2 text-sm text-muted">Please sign in to Emami Apps first, then open Publicity Expenses from the hub.</p>
          <a href="/" className="mt-5 inline-flex h-9 items-center rounded-xl bg-gradient-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-white">Go to Emami Apps</a>
        </div>
      </div>
    );
  }

  const email = getHubEmail();
  const active = NAV.find((n) => n.id === view) ?? NAV[0];
  return (
    <div className="flex h-screen overflow-clip bg-plum">
      {menu && <div className="fixed inset-0 z-30 bg-plum-deep/50 backdrop-blur-sm lg:hidden" onClick={() => setMenu(false)} />}
      <aside className={cx('z-40 flex w-64 shrink-0 flex-col border-r border-line bg-panel transition-transform', 'fixed inset-y-0 left-0 lg:static', menu ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        <div className="relative flex items-center justify-center border-b border-line px-4 pb-5 pt-5">
          <button type="button" className="absolute right-3 top-3 p-1 text-muted lg:hidden" onClick={() => setMenu(false)} aria-label="Close menu"><X size={18} /></button>
          <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
          </a>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Sections">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={view === n.id ? 'page' : undefined}
              onClick={() => go(n.id)}
              className={cx('flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition', view === n.id ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken')}
            >
              <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', view === n.id ? 'bg-gradient-to-br from-accent to-accent-deep text-white' : 'bg-sunken text-accent')}><n.icon size={16} /></span>
              <span><span className="block text-sm font-bold">{n.label}</span><span className="block text-[11px] text-muted">{n.hint}</span></span>
            </button>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 px-1">
            <Avatar email={email} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{nameFromEmail(email)}</div>
              <div className="truncate text-2xs text-muted">{email}</div>
            </div>
          </div>
          {load.kind === 'ready' && (
            <p className="mt-2 px-1 text-[11px] leading-snug text-faint">
              Source: {load.meta.source === 'sap' ? `SAP ${load.meta.system}` : 'mock data'} · read {fmtDateTime(load.meta.fetchedAt)}
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-clip bg-bg">
        <div className="flex bg-plum">
          <a href="/" className="flex items-center gap-1.5 border-r border-white/20 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back</a>
        </div>
        <header className="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-2.5">
          <button type="button" className="p-1 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
          <Megaphone size={18} className="text-accent" />
          <h1 className="text-[15px] font-extrabold">Publicity Expenses</h1>
          <span className="hidden text-2xs text-muted sm:inline">ATL / BTL advertisement expenses · {active.label}</span>
          <div className="flex-1" />
          {load.kind === 'ready' && load.meta.source === 'mock' && (
            <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11px] font-bold text-warn" title="The server has no SAP connection set (PUBEXP_SAP_ODATA_ROOT): every figure is generated demo data.">Mock data</span>
          )}
          {load.kind === 'ready' && load.meta.budget === 'mock' && (
            <span className="hidden rounded-full border border-line bg-sunken px-2.5 py-1 text-[11px] font-bold text-muted sm:inline" title="OB / RB come from a mock until the budget table is joined in SAP (phase 2).">Budget: mock</span>
          )}
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 md:flex"><Calendar size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 lg:p-5">
          <div className={cx('mx-auto', view === 'report' ? 'max-w-none' : 'max-w-7xl')}>
            {load.kind === 'loading' && (
              <div className="space-y-3">
                <div className="h-14 rounded-2xl border border-line bg-panel" />
                <div className="rounded-2xl border border-line bg-panel p-5"><Skeleton rows={10} /></div>
              </div>
            )}
            {load.kind === 'error' && (
              <div className="rounded-2xl border border-line bg-panel">
                <Empty icon={BarChart3} title={load.status === 403 ? 'No access yet' : load.status === 401 ? 'Session expired' : 'Could not load the expenses'}>
                  <Notice tone={load.status === 403 ? 'warn' : 'bad'}>{load.message}</Notice>
                  {load.status === 401 ? (
                    <a href="/" className="mt-3 inline-flex text-sm font-bold text-accent">Sign in again</a>
                  ) : load.status !== 403 && (
                    <Button className="mt-3" onClick={() => setNonce((n) => n + 1)}>Try again</Button>
                  )}
                </Empty>
              </div>
            )}
            {ctx && (
              <AppContext.Provider value={ctx}>
                <FilterBar />
                <div className="mt-3">
                  {view === 'overview' && <Overview />}
                  {view === 'report' && <Report />}
                  {view === 'brands' && <Brands />}
                  {view === 'media' && <MediaMix />}
                  {view === 'budget' && <Budget />}
                  {view === 'costcentres' && <CostCentres />}
                </div>
              </AppContext.Provider>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
