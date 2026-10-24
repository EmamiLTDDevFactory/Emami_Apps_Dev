'use client';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import MaterialExtraction from './tabs/MaterialExtraction';
import RateUpload from './tabs/RateUpload';
import PricingSimulation from './tabs/PricingSimulation';
import ConditionCreation from './tabs/ConditionCreation';
import ReviewApproval from './tabs/ReviewApproval';
import PricingKpis from './tabs/PricingKpis';
import StatusBar from './StatusBar';
import FailureList from './FailureList';
import { Button, TextField, dateError, type TabProps } from './ui';
import { IconArrowLeft, IconCalculator, IconCalendar, IconChart, IconCheckCircle, IconFileCheck, IconLayers, IconMenu, IconUpload, IconUser, IconX } from './icons';
import { MOCK_MODE, checkHealth } from '@/lib/api';
import type { FailureItem, StatusMessage, Tone } from '@/lib/types';

type Icon = ComponentType<{ size?: number }>;
const TABS: { id: string; label: string; hint: string; group: string; icon: Icon; Comp: ComponentType<TabProps> }[] = [
  { id: 'material', label: 'Cascade Material Extraction', hint: 'Materials mapped for cascade', group: 'Masters', icon: IconLayers, Comp: MaterialExtraction },
  { id: 'rates', label: 'Cascade Rate Upload', hint: 'Condition rates from Excel', group: 'Masters', icon: IconUpload, Comp: RateUpload },
  { id: 'sim', label: 'Pricing Simulation', hint: 'Price, factor, send for approval', group: 'Pricing', icon: IconCalculator, Comp: PricingSimulation },
  { id: 'cond', label: 'Condition Creation', hint: 'Approved, create in SAP', group: 'Pricing', icon: IconFileCheck, Comp: ConditionCreation },
  { id: 'review', label: 'Review / Approval', hint: 'Approve, reject, delete', group: 'Approval', icon: IconCheckCircle, Comp: ReviewApproval },
  { id: 'kpis', label: 'Pricing KPIs', hint: 'Waterfall, margins, corridor', group: 'Insights', icon: IconChart, Comp: PricingKpis },
];
const GROUPS = [...new Set(TABS.map((t) => t.group))];

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
/** SAP system the live service runs on (ZMM_CASCADE_SRV_SRV is on NGD). */
const SAP_SYSTEM = process.env.NEXT_PUBLIC_CASCADE_SAP_SYSTEM || 'NGD';
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
    ? 'relative w-64 shrink-0 border-r border-sap-line bg-white'
    : `fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-white shadow-pop transition-transform duration-200 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`;

  return (
    <div className="flex h-screen overflow-hidden bg-brand">
      {!wide && menuOpen && <div className="fixed inset-0 z-30 bg-brand-deep/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />}
      <aside className={`${pane} flex flex-col`} aria-label="Cascade pricing sections">
        <div className="border-b border-sap-line">
          {!wide && (
            <div className="flex justify-end px-3 pt-3">
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="p-1 text-sap-muted hover:text-sap-ink"><IconX size={20} /></button>
            </div>
          )}
          <div className="flex justify-center px-6 py-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {GROUPS.map((g, gi) => (
            <div key={g} className="flex flex-col gap-1">
              <p className={`px-3 pb-1 ${gi ? 'pt-4' : 'pt-2'} text-[10px] font-extrabold uppercase tracking-[0.12em] text-sap-muted`}>{g}</p>
              {TABS.filter((t) => t.group === g).map((t) => {
                const active = t.id === tab;
                const I = t.icon;
                return (
                  <button key={t.id} type="button" onClick={() => open(t.id)} disabled={busy && !active} aria-current={active ? 'page' : undefined}
                    className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:opacity-50 ${active ? 'bg-plum/10 text-plum' : 'text-sap-ink hover:bg-sap-head'}`}>
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${active ? 'bg-gradient-to-br from-plum to-plum-deep text-white shadow-sm' : 'bg-sap-head text-plum group-hover:bg-white'}`}><I size={16} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-tight">{t.label}</span>
                      <span className={`block truncate text-[11px] ${active ? 'text-plum/80' : 'text-sap-muted'}`}>{t.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-sap-line px-4 py-3 text-[11px] leading-snug text-sap-muted">
          Prices come from SAP <span className="font-mono">ZMM_CASCADE_SRV</span>. {MOCK_MODE ? 'Demo data in this build.' : health.state === 'ok' ? `Connected · ${health.count.toLocaleString('en-IN')} cascade materials.` : health.state === 'down' ? 'SAP connection unavailable.' : 'Checking the SAP connection…'}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-sap-bg">
        <div className="flex bg-brand">
          <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign('/'))} className="flex items-center gap-1.5 border-r border-white/20 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-deep">
            <IconArrowLeft size={14} /> Back
          </button>
          <a href="/" className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-deep"><IconArrowLeft size={14} /> Back to Emami Apps</a>
        </div>
        <header className="flex flex-wrap items-center gap-2.5 border-b border-sap-line bg-white px-4 py-2.5">
          {!wide && <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="p-1 text-sap-ink"><IconMenu size={22} /></button>}
          <h1 className="truncate text-[15px] font-extrabold text-sap-ink">Cascade Pricing</h1>
          <span className="hidden items-center gap-1 rounded-full bg-plum/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-plum sm:inline-flex"><CurrentIcon size={11} /> {current.label}</span>
          {MOCK_MODE
            ? <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-800 ring-1 ring-amber-300" title="Demo data: changes are kept only until the page is reloaded.">Mock data</span>
            : <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200" title={`SAP system ${SAP_SYSTEM}`}>SAP {SAP_SYSTEM}</span>}
          <div className="flex-1" />
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex flex-wrap items-center gap-3" aria-label="Validity for approvals" title="Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.">
              <span className="sr-only 2xl:hidden">Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.</span>
              <TextField id="vfrom" label="Valid From" value={vfrom} onChange={setVfrom} placeholder="YYYYMMDD" error={dateError(vfrom)} width="w-24" disabled={busy} />
              <TextField id="vto" label="Valid To" value={vto} onChange={setVto} placeholder="YYYYMMDD" error={dateError(vto)} width="w-24" disabled={busy} />
            </div>
            <p className="hidden text-2xs text-sap-muted 2xl:block">Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.</p>
          </div>
          {email && (
            <div className="hidden items-center gap-1.5 rounded-full border border-sap-line bg-sap-bg px-2.5 py-1 sm:flex" title={email}>
              <span className="text-plum"><IconUser size={13} /></span><span className="max-w-[160px] truncate text-[11.5px] font-bold text-sap-ink">{nameFromEmail(email)}</span>
            </div>
          )}
          <div className="hidden items-center gap-1.5 rounded-full border border-sap-line bg-sap-bg px-2.5 py-1 md:flex">
            <span className="text-plum"><IconCalendar size={13} /></span><span className="text-[11.5px] font-bold text-sap-ink">{today}</span>
          </div>
        </header>

        {health.state === 'down' && (
          <div role="alert" className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
            <span className="font-semibold">SAP connection unavailable</span>
            <span className="flex-1 text-red-700">{health.error}</span>
            <Button variant="danger" onClick={() => void runHealth()}>Retry</Button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto p-3 lg:p-4">
          <div className="mb-2">
            <StatusBar busy={busy} messages={messages} />
            <FailureList items={failures} onClose={() => setFailures([])} />
          </div>
          {TABS.map(({ id, Comp }) => (
            <section key={id} id={`panel-${id}`} aria-label={TABS.find((t) => t.id === id)?.label} hidden={tab !== id} className="rounded-2xl border border-sap-line bg-white shadow-card">
              {visited.has(id) && <Comp active={tab === id} busy={busy} setBusy={setBusy} showMessage={showMessage} setFailures={setFailures} vfrom={vfrom} vto={vto} />}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
