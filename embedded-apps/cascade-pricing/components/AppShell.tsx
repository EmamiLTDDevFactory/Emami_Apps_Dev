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
import StatusBar from './StatusBar';
import FailureList from './FailureList';
import { Button, TextField, dateError, type TabProps } from './ui';
import { IconArrowLeft, IconCalculator, IconCalendar, IconChart, IconCheckCircle, IconFileCheck, IconLayers, IconMenu, IconUndo, IconUpload, IconUser, IconX } from './icons';
import { checkHealth } from '@/lib/api';
import type { FailureItem, StatusMessage, Tone } from '@/lib/types';

type Icon = ComponentType<{ size?: number }>;
const TABS: { id: string; label: string; hint: string; group: string; icon: Icon; Comp: ComponentType<TabProps> }[] = [
  { id: 'material', label: 'Cascade Material Extraction', hint: 'Materials mapped for cascade', group: 'Masters', icon: IconLayers, Comp: MaterialExtraction },
  { id: 'rates', label: 'Cascade Rate Upload', hint: 'Condition rates from Excel', group: 'Masters', icon: IconUpload, Comp: RateUpload },
  { id: 'sim', label: 'Pricing Simulation', hint: 'Price, factor, send for approval', group: 'Pricing', icon: IconCalculator, Comp: PricingSimulation },
  { id: 'pending', label: 'Pending Correction', hint: 'Rejected, correct and resubmit', group: 'Pricing', icon: IconUndo, Comp: PendingCorrection },
  { id: 'cond', label: 'Condition Creation', hint: 'Approved, create in SAP', group: 'Pricing', icon: IconFileCheck, Comp: ConditionCreation },
  { id: 'review', label: 'Review / Approval', hint: 'Approve, reject, delete', group: 'Approval', icon: IconCheckCircle, Comp: ReviewApproval },
  { id: 'kpis', label: 'Pricing KPIs', hint: 'Waterfall, margins, corridor', group: 'Insights', icon: IconChart, Comp: PricingKpis },
];
const GROUPS = [...new Set(TABS.map((t) => t.group))];

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
  const seq = useRef(0);

  useEffect(() => {
    // The hub's own sign-in (read only): the name in the header, like every sibling app.
    try { setEmail(window.localStorage.getItem('emami_apps_user_email') || ''); } catch { /* storage blocked */ }
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

  const open = (id: string) => {
    if (busy) return;
    setTab(id);
    setVisited((v) => new Set(v).add(id));
    setFailures([]);
    setMenuOpen(false);
  };
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const CurrentIcon = current.icon;

  const pane = wide
    ? 'relative m-3 mr-0 w-[17rem] shrink-0 rounded-3xl glass'
    : `fixed inset-y-2 left-2 z-40 w-72 max-w-[85vw] rounded-3xl glass-strong shadow-pop transition-transform duration-300 ${menuOpen ? 'translate-x-0' : '-translate-x-[110%]'}`;
  const healthDot = health.state === 'ok' ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.25)]' : health.state === 'down' ? 'bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.2)]' : 'animate-pulse bg-amber-400';

  return (
    <div className="aurora flex h-screen overflow-hidden">
      <div className="grain" aria-hidden="true" />
      {!wide && menuOpen && <div className="fixed inset-0 z-30 bg-brand-deep/30 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />}
      <aside className={`${pane} flex flex-col overflow-hidden`} aria-label="Cascade pricing sections">
        <div className="relative">
          {!wide && (
            <div className="absolute right-2 top-2 z-10">
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded-full p-1.5 text-sap-muted hover:bg-white/70 hover:text-sap-ink"><IconX size={18} /></button>
            </div>
          )}
          <div className="mx-3 mt-3 flex justify-center rounded-2xl bg-white/70 px-6 py-4 shadow-[inset_0_1px_0_#fff] ring-1 ring-white/80">
            <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={150} height={124} />
            </a>
          </div>
        </div>
        <nav className="scroll-glass flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 pt-2">
          {GROUPS.map((g, gi) => (
            <div key={g} className="flex flex-col gap-1">
              <p className={`px-3 pb-1 ${gi ? 'pt-4' : 'pt-2'} text-[10px] font-extrabold uppercase tracking-[0.18em] text-plum/60`}>{g}</p>
              {TABS.filter((t) => t.group === g).map((t) => {
                const active = t.id === tab;
                const I = t.icon;
                return (
                  <button key={t.id} type="button" onClick={() => open(t.id)} disabled={busy && !active} aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition duration-200 disabled:opacity-50 ${active ? 'bg-white/85 text-plum shadow-[0_6px_20px_-10px_rgba(79,63,214,0.55)] ring-1 ring-white' : 'text-sap-ink hover:bg-white/55'}`}>
                    {active && <span className="absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b from-plum via-violet-500 to-teal-400" aria-hidden="true" />}
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition duration-200 ${active ? 'nav-glow bg-gradient-to-br from-plum via-violet-500 to-fuchsia-500 text-white' : 'bg-white/70 text-plum ring-1 ring-white group-hover:scale-105'}`}><I size={16} /></span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold leading-tight">{t.label}</span>
                      <span className={`block truncate text-[11px] ${active ? 'text-plum/75' : 'text-sap-muted'}`}>{t.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mx-3 mb-3 flex items-start gap-2 rounded-2xl bg-white/55 px-3 py-2.5 text-[11px] leading-snug text-sap-muted ring-1 ring-white/80">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${healthDot}`} aria-hidden="true" />
          <span>Prices come from SAP <span className="font-mono text-sap-ink">ZMM_CASCADE_SRV</span>. {health.state === 'ok' ? `Connected · ${health.count.toLocaleString('en-IN')} cascade materials.` : health.state === 'down' ? 'SAP connection unavailable.' : 'Checking the SAP connection…'}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-3 lg:pl-3">
        <div className="glass-dark flex items-center overflow-hidden rounded-2xl">
          <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign('/'))} className="flex items-center gap-1.5 border-r border-white/15 px-4 py-2 text-[13px] font-semibold text-white/90 transition hover:bg-white/10 hover:text-white">
            <IconArrowLeft size={14} /> Back
          </button>
          <div className="flex-1" />
          <span className="mr-4 hidden items-center gap-2 text-[11px] font-semibold text-white/70 md:flex"><span className={`h-1.5 w-1.5 rounded-full ${healthDot}`} aria-hidden="true" /> SAP {system}</span>
        </div>
        <header className="glass mt-3 flex flex-wrap items-center gap-2.5 rounded-2xl px-4 py-3">
          {!wide && <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="rounded-full p-1.5 text-sap-ink hover:bg-white/70"><IconMenu size={22} /></button>}
          <h1 className="truncate font-display text-[19px] font-extrabold tracking-tight"><span className="text-gradient">Cascade</span> <span className="text-sap-ink">Pricing</span></h1>
          <span className="chip hidden text-plum sm:inline-flex"><CurrentIcon size={11} /> {current.label}</span>
          <span className="chip text-emerald-700" title={`SAP system ${system}`}><span className={`h-1.5 w-1.5 rounded-full ${healthDot}`} aria-hidden="true" />SAP {system}</span>
          <div className="flex-1" />
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/50 px-3 py-1 ring-1 ring-white/80" aria-label="Validity for approvals" title="Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.">
              <span className="sr-only 2xl:hidden">Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.</span>
              <TextField id="vfrom" label="Valid From" value={vfrom} onChange={setVfrom} placeholder="YYYYMMDD" error={dateError(vfrom)} width="w-24" disabled={busy} />
              <TextField id="vto" label="Valid To" value={vto} onChange={setVto} placeholder="YYYYMMDD" error={dateError(vto)} width="w-24" disabled={busy} />
            </div>
            <p className="hidden text-2xs text-sap-muted 2xl:block">Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.</p>
          </div>
          <NotificationBell onNavigateToPendingCorrection={() => open('pending')} />
          {email && (
            <div className="chip hidden normal-case tracking-normal sm:flex" title={email}>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-plum to-teal-500 text-white"><IconUser size={11} /></span><span className="max-w-[160px] truncate text-[11.5px] font-bold text-sap-ink">{nameFromEmail(email)}</span>
            </div>
          )}
          <div className="chip hidden normal-case tracking-normal md:flex">
            <span className="text-plum"><IconCalendar size={13} /></span><span className="text-[11.5px] font-bold text-sap-ink">{today}</span>
          </div>
        </header>

        {health.state === 'down' && (
          <div role="alert" className="glass mt-3 flex items-center gap-3 rounded-2xl border-red-200 px-4 py-2 text-xs text-red-800">
            <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
            <span className="font-semibold">SAP connection unavailable</span>
            <span className="flex-1 text-red-700">{health.error}</span>
            <Button variant="danger" onClick={() => void runHealth()}>Retry</Button>
          </div>
        )}

        <main className="scroll-glass mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3">
            <StatusBar busy={busy} messages={messages} />
            <FailureList items={failures} onClose={() => setFailures([])} />
          </div>
          {TABS.map(({ id, Comp }) => (
            <section key={id} id={`panel-${id}`} aria-label={TABS.find((t) => t.id === id)?.label} hidden={tab !== id} className="glass glass-rim fade-up mb-3 rounded-3xl">
              {visited.has(id) && <Comp active={tab === id} busy={busy} setBusy={setBusy} showMessage={showMessage} setFailures={setFailures} vfrom={vfrom} vto={vto} system={system} />}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
