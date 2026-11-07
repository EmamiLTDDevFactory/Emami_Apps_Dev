'use client';
import { useEffect, useState } from 'react';
import { Tabs } from '../ui';
import PlanFrame from '../plan/PlanFrame';
import HistoryTab from './HistoryTab';
import RatesTab from './RatesTab';
import ReviewTab from './ReviewTab';
import { useHubSession } from '@/lib/client/session';
import { fiscalYear } from '@/lib/budgetMgmt/rules';

type Tab = 'history' | 'rates' | 'review';
const TABS: { id: Tab; label: string }[] = [{ id: 'history', label: 'History & Classify' }, { id: 'rates', label: 'Rates & Edit' }, { id: 'review', label: 'Review & Approve' }];
const readTab = (): Tab => { const t = new URLSearchParams(window.location.search).get('tab'); return TABS.some((x) => x.id === t) ? (t as Tab) : 'history'; };

export default function MgmtScreen() {
  const hub = useHubSession();
  const [tab, setTabState] = useState<Tab>('history');
  const [fy, setFy] = useState(fiscalYear());
  // Tab in the URL (?tab=): the browser Back button moves between the tabs.
  useEffect(() => {
    setTabState(readTab());
    const on = () => setTabState(readTab());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const setTab = (t: Tab) => { history.pushState(null, '', `?tab=${t}`); setTabState(t); };
  const years = Array.from({ length: 6 }, (_, i) => String(Number(fiscalYear()) + 1 - i));
  const email = hub && hub !== 'checking' ? hub.email : '';

  return (
    <PlanFrame active="budget-rate-mgmt">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">Budget Rate Management</h2>
        <label className="flex items-center gap-2 text-sm font-semibold">FY
          <select className="h-9 rounded-xl border border-line bg-panel px-3 text-sm" value={fy} onChange={(e) => setFy(e.target.value)}>{(years.includes(fy) ? years : [fy, ...years]).map((y) => <option key={y}>{y}</option>)}</select>
        </label>
      </div>
      <Tabs label="Budget rate management" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'history' && <HistoryTab gjahr={fy} />}
      {tab === 'rates' && <RatesTab gjahr={fy} />}
      {tab === 'review' && <ReviewTab gjahr={fy} email={email} />}
    </PlanFrame>
  );
}
