'use client';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import MaterialExtraction from './tabs/MaterialExtraction';
import RateUpload from './tabs/RateUpload';
import PricingSimulation from './tabs/PricingSimulation';
import PendingCorrection from './tabs/PendingCorrection';
import NotificationBell from './NotificationBell';
import ConditionCreation from './tabs/ConditionCreation';
import ReviewApproval from './tabs/ReviewApproval';
import PricingKpis from './tabs/PricingKpis';
import CascadeDetails from './tabs/CascadeDetails';
import StatusBar from './StatusBar';
import FailureList from './FailureList';
import { Button, TextField, dateError, type TabProps } from './ui';
import { IconArrowLeft, IconCalculator, IconCalendar, IconChart, IconCheckCircle, IconChevronRight, IconFileCheck, IconLayers, IconMenu, IconTable, IconUndo, IconUpload, IconUser, IconX } from './icons';
import { checkHealth, getMe } from '@/lib/api';
import type { FailureItem, StatusMessage, Tone } from '@/lib/types';

type Icon = ComponentType<{ size?: number }>;
const TABS: { id: string; label: string; hint: string; group: string; icon: Icon; Comp: ComponentType<TabProps>; adminOnly?: boolean }[] = [
  { id: 'material', label: 'Cascade Material Extraction', hint: 'Materials mapped for cascade', group: 'Masters', icon: IconLayers, Comp: MaterialExtraction },
  { id: 'rates', label: 'Cascade Rate Upload', hint: 'Condition rates from Excel', group: 'Masters', icon: IconUpload, Comp: RateUpload },
  { id: 'sim', label: 'Pricing Simulation', hint: 'Price, factor, send for approval', group: 'Pricing', icon: IconCalculator, Comp: PricingSimulation },
  { id: 'pending', label: 'Pending Correction', hint: 'Rejected, correct and resubmit', group: 'Pricing', icon: IconUndo, Comp: PendingCorrection },
  { id: 'cond', label: 'Condition Creation', hint: 'Approved, create in SAP', group: 'Pricing', icon: IconFileCheck, Comp: ConditionCreation },
  { id: 'review', label: 'Review / Approval', hint: 'Approve, reject, delete', group: 'Approval', icon: IconCheckCircle, Comp: ReviewApproval },
  { id: 'kpis', label: 'Pricing KPIs', hint: 'Waterfall, margins, corridor', group: 'Insights', icon: IconChart, Comp: PricingKpis },
  { id: 'details', label: 'Cascade Details', hint: 'All versions from ZMM_CASCADE', group: 'Admin', icon: IconTable, Comp: CascadeDetails, adminOnly: true },
];

const PANE_KEY = 'cascade-pricing:menu-collapsed';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
/** SAP system shown until the backend says which one it is connected to (its /health answer). */
const DEFAULT_SAP_SYSTEM = process.env.NEXT_PUBLIC_CASCADE_SAP_SYSTEM || 'NGQ';
type Health = { state: 'checking' } | { state: 'ok'; count: number } | { state: 'down'; error: string };

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  return local.split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') || email;
}

function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return wide;
}

export default function AppShell() {
  const wide = useIsWide();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState('material');
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set(['material']));
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<StatusMessage[]>([]);
  const [failures, setFailures] = useState<FailureItem[]>([]);
  const [vfrom, setVfrom] = useState('');
  const [vto, setVto] = useState('');
  const [health, setHealth] = useState<Health>({ state: 'checking' });
  const [system, setSystem] = useState(DEFAULT_SAP_SYSTEM);
  const [email, setEmail] = useState('');
  const [today, setToday] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    // The hub's own sign-in (read only): the name in the header, like every sibling app.
    try { setEmail(window.localStorage.getItem('emami_apps_user_email') || ''); } catch { /* storage blocked */ }
    try { setCollapsed(window.localStorage.getItem(PANE_KEY) === '1'); } catch { /* storage blocked */ }
    setToday(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
  }, []);

  const showMessage = useCallback((text: string, tone: Tone) => {
    seq.current += 1;
    const at = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setMessages((m) => [{ id: seq.current, at, text, tone }, ...m].slice(0, 20));
  }, []);

  const runHealth = useCallback(async () => {
    setHealth({ state: 'checking' });
    const h = await checkHealth();
    if (h.system) setSystem(h.system);
    setHealth(h.ok ? { state: 'ok', count: h.count ?? 0 } : { state: 'down', error: h.error ?? 'SAP connection unavailable' });
  }, []);
  useEffect(() => { void runHealth(); }, [runHealth]);
  // The person's Cascade Pricing role decides whether the admin screens show (the server checks it again on every call).
  useEffect(() => { void getMe().then((m) => setIsAdmin(m.isAdmin)); }, []);
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const groups = [...new Set(tabs.map((t) => t.group))];

  const open = (id: string) => {
    if (busy) return;
    setTab(id);
    setVisited((v) => new Set(v).add(id));
    setFailures([]);
    setMenuOpen(false);
  };
  const setPane = (c: boolean) => {
    setCollapsed(c);
    try { window.localStorage.setItem(PANE_KEY, c ? '1' : '0'); } catch { /* storage blocked */ }
  };
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const CurrentIcon = current.icon;

  const pane = wide
    ? `${collapsed ? 'hidden ' : ''}relative w-64 shrink-0 border-r border-sap-line bg-white shadow-card`
    : `fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r border-sap-line bg-white shadow-pop transition-transform duration-200 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`;
  const healthDot = health.state === 'ok' ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]' : health.state === 'down' ? 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]' : 'animate-pulse bg-amber-400';

  return (
    <div className="aurora fixed inset-0 flex overflow-hidden">
      {!wide && menuOpen && <div className="fixed inset-0 z-30 bg-brand-deep/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />}
      <aside className={`${pane} flex flex-col overflow-hidden`} aria-label="Cascade pricing sections">
        <div className="relative border-b border-sap-line">
          {wide && (
            <div className="absolute right-2 top-2 z-10">
              <button type="button" onClick={() => setPane(true)} aria-label="Collapse menu" title="Collapse menu" className="rounded-full p-1.5 text-sap-muted hover:bg-sap-head hover:text-sap-ink"><IconArrowLeft size={18} /></button>
            </div>
          )}
          {!wide && (
            <div className="absolute right-2 top-2 z-10">
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded-full p-1.5 text-sap-muted hover:bg-sap-head hover:text-sap-ink"><IconX size={18} /></button>
            </div>
          )}
          <div className="flex items-center justify-center px-4 pb-5 pt-5">
            <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps" className="block rounded-2xl bg-white p-2.5 shadow-card ring-1 ring-sap-line transition-transform duration-300 hover:scale-[1.03]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={150} height={124} />
            </a>
          </div>
        </div>
        <nav className="scroll-glass flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {groups.map((g, gi) => (
            <div key={g} className="flex flex-col gap-1">
              <p className={`px-3 pb-1 ${gi ? 'pt-4' : 'pt-1'} text-[10px] font-extrabold uppercase tracking-[0.18em] text-plum/60`}>{g}</p>
              {tabs.filter((t) => t.group === g).map((t) => {
                const active = t.id === current.id;
                const I = t.icon;
                return (
                  <button key={t.id} type="button" onClick={() => open(t.id)} disabled={busy && !active} aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:translate-x-0.5 disabled:opacity-50 ${active ? 'bg-gradient-to-r from-[#3B4FD8] to-plum text-white shadow-glow ring-1 ring-plum/20' : 'text-sap-ink hover:bg-sap-head'}`}>
                    {active && <span className="absolute inset-y-2 -left-3 w-1 rounded-full bg-orange" aria-hidden="true" />}
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${active ? 'bg-white/20 text-white shadow-sm' : 'bg-plum-soft text-plum group-hover:bg-[#E2E6F8]'}`}><I size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold leading-tight">{t.label}</span>
                      <span className={`block truncate text-[11px] ${active ? 'text-white/75' : 'text-sap-muted'}`}>{t.hint}</span>
                    </span>
                    <IconChevronRight size={15} className={`shrink-0 transition ${active ? 'text-white' : 'text-sap-muted/60 group-hover:translate-x-0.5'}`} />
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="flex items-start gap-2 border-t border-sap-line px-4 py-3 text-[11px] leading-snug text-sap-muted">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${healthDot}`} aria-hidden="true" />
          <span>Prices come from SAP <span className="font-mono text-sap-ink">ZMM_CASCADE_SRV</span>. {health.state === 'ok' ? `Connected · ${health.count.toLocaleString('en-IN')} cascade materials.` : health.state === 'down' ? 'SAP connection unavailable.' : 'Checking the SAP connection…'}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header>
          <div aria-hidden="true" className="banner-line h-1" />
          <div className="page-banner flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5">
            {wide && collapsed && <button type="button" onClick={() => setPane(false)} aria-label="Expand menu" title="Expand menu" className="rounded-lg p-1.5 text-white hover:bg-white/10"><IconMenu size={22} /></button>}
            {!wide && <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-white hover:bg-white/10"><IconMenu size={22} /></button>}
            <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign('/'))} aria-label="Back" title="Back"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/30 bg-white/10 text-white transition hover:bg-white/20"><IconArrowLeft size={18} /></button>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">Cascade Pricing</h1>
              <p className="flex items-center gap-1 truncate text-[11.5px] font-bold uppercase tracking-[0.08em] text-white/80"><CurrentIcon size={12} /> {current.group} <IconChevronRight size={11} /> {current.label}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ring-1 ring-white/30" title={`SAP system ${system}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${healthDot}`} aria-hidden="true" />SAP {system}
            </span>
            <div className="flex-1" />
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 px-3 py-1 text-ink shadow-card" aria-label="Validity for approvals" title="Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.">
                <span className="sr-only 2xl:hidden">Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.</span>
                <TextField id="vfrom" label="Valid From" value={vfrom} onChange={setVfrom} placeholder="YYYYMMDD" error={dateError(vfrom)} width="w-24" disabled={busy} />
                <TextField id="vto" label="Valid To" value={vto} onChange={setVto} placeholder="YYYYMMDD" error={dateError(vto)} width="w-24" disabled={busy} />
              </div>
              <p className="hidden text-2xs text-white/75 2xl:block">Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.</p>
            </div>
            <NotificationBell onNavigateToPendingCorrection={() => open('pending')} />
            {email && (
              <div className="hidden items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 sm:flex" title={email}>
                <span className="text-orange"><IconUser size={14} /></span><span className="max-w-[160px] truncate text-[12px] font-bold">{nameFromEmail(email)}</span>
              </div>
            )}
            <div className="hidden items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 md:flex">
              <span className="text-orange"><IconCalendar size={14} /></span><span className="whitespace-nowrap text-[12px] font-bold">{today}</span>
            </div>
          </div>
        </header>

        {health.state === 'down' && (
          <div role="alert" className="mx-3 mt-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
            <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
            <span className="font-semibold">SAP connection unavailable</span>
            <span className="flex-1 text-red-700">{health.error}</span>
            <Button variant="danger" onClick={() => void runHealth()}>Retry</Button>
          </div>
        )}

        <main className="scroll-glass min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3">
            <StatusBar busy={busy} messages={messages} />
            <FailureList items={failures} onClose={() => setFailures([])} />
          </div>
          {tabs.map(({ id, label, Comp }) => (
            <section key={id} id={`panel-${id}`} aria-label={label} hidden={current.id !== id} className="glass fade-up mb-3 rounded-2xl">
              {visited.has(id) && <Comp active={current.id === id} busy={busy} setBusy={setBusy} showMessage={showMessage} setFailures={setFailures} vfrom={vfrom} vto={vto} system={system} />}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
