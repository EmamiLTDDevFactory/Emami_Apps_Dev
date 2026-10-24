'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import MaterialExtraction from './tabs/MaterialExtraction';
import RateUpload from './tabs/RateUpload';
import PricingSimulation from './tabs/PricingSimulation';
import ConditionCreation from './tabs/ConditionCreation';
import ReviewApproval from './tabs/ReviewApproval';
import PricingKpis from './tabs/PricingKpis';
import StatusBar from './StatusBar';
import FailureList from './FailureList';
import { Button, TextField, dateError } from './ui';
import { MOCK_MODE, checkHealth } from '@/lib/api';
import type { FailureItem, StatusMessage, Tone } from '@/lib/types';

const TABS = [
  { id: 'material', label: 'Cascade Material Extraction', Comp: MaterialExtraction },
  { id: 'rates', label: 'Cascade Rate Upload', Comp: RateUpload },
  { id: 'sim', label: 'Pricing Simulation', Comp: PricingSimulation },
  { id: 'cond', label: 'Condition Creation', Comp: ConditionCreation },
  { id: 'review', label: 'Review / Approval', Comp: ReviewApproval },
  { id: 'kpis', label: 'Pricing KPIs', Comp: PricingKpis },
] as const;
type TabId = (typeof TABS)[number]['id'];

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
type Health = { state: 'checking' } | { state: 'ok'; count: number } | { state: 'down'; error: string };

export default function AppShell() {
  const [tab, setTab] = useState<TabId>('material');
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(() => new Set<TabId>(['material']));
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<StatusMessage[]>([]);
  const [failures, setFailures] = useState<FailureItem[]>([]);
  const [vfrom, setVfrom] = useState('');
  const [vto, setVto] = useState('');
  const [health, setHealth] = useState<Health>({ state: 'checking' });
  const seq = useRef(0);

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

  const open = (id: TabId) => {
    if (busy) return;
    setTab(id);
    setVisited((v) => new Set(v).add(id));
    setFailures([]);
  };
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    open(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F6F7] text-sap-ink">
      <div className="flex h-8 items-center gap-3 bg-plum-deep px-4 text-xs text-white">
        <a href="/" className="font-semibold hover:underline">← Back to Emami Apps</a>
      </div>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-sap-line bg-white px-4 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={44} height={36} className="h-9 w-auto" />
        <div className="mr-auto">
          <h1 className="text-base font-bold leading-tight">Cascade Pricing</h1>
          <p className="text-2xs text-sap-muted">Export price cascade from RRP to CIF · <span className="font-mono">ZMM_CASCADE_PRICING</span></p>
        </div>
        {MOCK_MODE && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-2xs font-semibold text-amber-800" title="Demo data: changes are kept only until the page is reloaded.">Mock data · SAP not connected</span>}
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-3" aria-label="Validity for approvals">
            <TextField id="vfrom" label="Valid From" value={vfrom} onChange={setVfrom} placeholder="YYYYMMDD" error={dateError(vfrom)} width="w-24" disabled={busy} />
            <TextField id="vto" label="Valid To" value={vto} onChange={setVto} placeholder="YYYYMMDD" error={dateError(vto)} width="w-24" disabled={busy} />
          </div>
          <p className="text-2xs text-sap-muted">Valid From and Valid To are required for Send for Approval. For Approve, leave blank to keep the stored dates.</p>
        </div>
      </header>

      {health.state === 'down' && (
        <div role="alert" className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
          <span className="font-semibold">SAP connection unavailable</span>
          <span className="flex-1 text-red-700">{health.error}</span>
          <Button variant="danger" onClick={() => void runHealth()}>Retry</Button>
        </div>
      )}

      <nav className="border-b border-sap-line bg-white px-2" aria-label="Cascade pricing sections">
        <div role="tablist" className="flex gap-1 overflow-x-auto">
          {TABS.map((t, i) => (
            <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} disabled={busy && tab !== t.id}
              onClick={() => open(t.id)} onKeyDown={(e) => onTabKey(e, i)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${tab === t.id ? 'border-plum text-plum' : 'border-transparent text-sap-muted hover:text-sap-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 p-3">
        <div className="mb-2">
          <StatusBar busy={busy} messages={messages} />
          <FailureList items={failures} onClose={() => setFailures([])} />
        </div>
        {TABS.map(({ id, Comp }) => (
          <section key={id} id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={tab !== id} className="rounded border border-sap-line bg-white">
            {visited.has(id) && <Comp active={tab === id} busy={busy} setBusy={setBusy} showMessage={showMessage} setFailures={setFailures} vfrom={vfrom} vto={vto} />}
          </section>
        ))}
      </main>

      <footer className="border-t border-sap-line bg-white px-4 py-1.5 text-2xs text-sap-muted">
        {MOCK_MODE ? 'Demo data (mock mode).' : health.state === 'checking' ? 'Checking the SAP connection…' : health.state === 'ok' ? `SAP connected · ${health.count.toLocaleString('en-IN')} cascade materials.` : 'SAP connection unavailable.'}
      </footer>
    </div>
  );
}
