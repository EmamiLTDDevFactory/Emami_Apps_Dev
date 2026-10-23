'use client';
import { useCallback, useMemo, useState } from 'react';
import MaterialExtraction from './tabs/MaterialExtraction';
import RateUpload from './tabs/RateUpload';
import PricingSimulation from './tabs/PricingSimulation';
import ConditionCreation from './tabs/ConditionCreation';
import ReviewApproval from './tabs/ReviewApproval';
import PricingKpis from './tabs/PricingKpis';
import StatusBar from './StatusBar';
import { TextField, type TabProps } from './ui';
import { MOCK_MODE } from '@/lib/api';
import { isYmd } from '@/lib/format';
import type { Status } from '@/lib/types';

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
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** Default validity: from the first of next month to the end of the financial year (31 March). */
function defaultDates() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const fyEnd = new Date(from.getMonth() >= 3 ? from.getFullYear() + 1 : from.getFullYear(), 2, 31);
  return { vfrom: ymd(from), vto: ymd(fyEnd) };
}

export default function AppShell() {
  const [tab, setTab] = useState<TabId>('material');
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(() => new Set<TabId>(['material']));
  const [status, setStatusState] = useState<Status>({ busy: false, message: '', tone: 'info' });
  const [{ vfrom, vto }, setDates] = useState(defaultDates);
  const setStatus = useCallback((s: Status) => setStatusState(s), []);

  const fromErr = isYmd(vfrom) ? '' : 'YYYYMMDD';
  const toErr = isYmd(vto) ? '' : 'YYYYMMDD';
  const rangeErr = !fromErr && !toErr && vfrom > vto ? 'Valid From is after Valid To' : '';
  const dates = useMemo<TabProps['dates']>(() => ({ vfrom, vto, error: fromErr || toErr ? 'Valid From and Valid To must be dates in YYYYMMDD format.' : rangeErr }), [vfrom, vto, fromErr, toErr, rangeErr]);

  const open = (id: TabId) => {
    if (status.busy) return;
    setTab(id);
    setVisited((v) => new Set(v).add(id));
    setStatusState({ busy: false, message: '', tone: 'info' });
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
        {MOCK_MODE && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-2xs font-semibold text-amber-800" title="The SAP service is not available yet; changes are kept only until the page is reloaded.">Mock data · SAP service not connected</span>}
        <div className="flex flex-wrap items-center gap-3" aria-label="Validity for approvals">
          <TextField id="vfrom" label="Valid From" value={vfrom} onChange={(v) => setDates((d) => ({ ...d, vfrom: v }))} placeholder="YYYYMMDD" error={fromErr} width="w-24" disabled={status.busy} />
          <TextField id="vto" label="Valid To" value={vto} onChange={(v) => setDates((d) => ({ ...d, vto: v }))} placeholder="YYYYMMDD" error={toErr || rangeErr} width="w-24" disabled={status.busy} />
        </div>
      </header>

      <nav className="border-b border-sap-line bg-white px-2" aria-label="Cascade pricing sections">
        <div role="tablist" className="flex gap-1 overflow-x-auto">
          {TABS.map((t, i) => (
            <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} disabled={status.busy && tab !== t.id}
              onClick={() => open(t.id)} onKeyDown={(e) => onTabKey(e, i)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${tab === t.id ? 'border-plum text-plum' : 'border-transparent text-sap-muted hover:text-sap-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 p-3">
        <div className="mb-2"><StatusBar status={status} /></div>
        {TABS.map(({ id, Comp }) => (
          <section key={id} id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={tab !== id} className="rounded border border-sap-line bg-white">
            {visited.has(id) && <Comp active={tab === id} busy={status.busy} setStatus={setStatus} dates={dates} />}
          </section>
        ))}
      </main>
    </div>
  );
}
