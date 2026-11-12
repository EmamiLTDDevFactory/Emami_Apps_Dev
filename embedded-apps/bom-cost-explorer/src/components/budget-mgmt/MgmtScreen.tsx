'use client';
import { useEffect, useState } from 'react';
import { BadgeCheck, History, PencilRuler } from 'lucide-react';
import { cx } from '../ui';
import PlanFrame from '../plan/PlanFrame';
import HistoryTab from './HistoryTab';
import RatesTab from './RatesTab';
import ReviewTab from './ReviewTab';
import { useHubSession } from '@/lib/client/session';
import { fiscalYear } from '@/lib/budgetMgmt/rules';
import type { SegmentFilter } from './shared';

type Tab = 'history' | 'rates' | 'review';
const TABS: { id: Tab; label: string; hint: string; icon: typeof History; tone: string }[] = [
  { id: 'history', label: 'History & Classify', hint: 'Load purchases, classify A / B / C', icon: History, tone: 'from-accent to-accent-deep' },
  { id: 'rates', label: 'Rates & Edit', hint: 'Derived rates, freight, simulate, adjust', icon: PencilRuler, tone: 'from-sim to-[#8E1250]' },
  { id: 'review', label: 'Review & Approve', hint: 'Submit, approve, reject, revise', icon: BadgeCheck, tone: 'from-good to-[#14633C]' },
];
const readTab = (): Tab => { const t = new URLSearchParams(window.location.search).get('tab'); return TABS.some((x) => x.id === t) ? (t as Tab) : 'history'; };

export default function MgmtScreen() {
  const hub = useHubSession();
  const [tab, setTabState] = useState<Tab>('history');
  const [fy, setFy] = useState(fiscalYear());
  // Raw Material / Perfume (ROH + material group 106): one choice for all three tabs.
  const [segment, setSegment] = useState<SegmentFilter>('ALL');
  // Draft rates just generated on History: Rates & Edit opens on them and loads the drafts.
  const [gen, setGen] = useState<{ land1: string; gjahr: string; message: string } | null>(null);
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
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-plum-deep via-plum to-accent-deep p-4 text-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-widest text-white/70">Budget</p>
            <h2 className="text-xl font-extrabold tracking-tight">Raw Material <span className="font-semibold text-white/80">(Budget Rate Preparation)</span></h2>
            <p className="mt-0.5 text-xs text-white/70">Classify purchases, derive Avg base and Last purchase rates with freight, simulate, edit and approve — Raw Material and Perfume.</p>
          </div>
          <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold ring-1 ring-white/25">Financial year
            <select className="h-8 rounded-lg border-0 bg-white px-2 text-sm font-bold text-ink" value={fy} onChange={(e) => setFy(e.target.value)}>{(years.includes(fy) ? years : [fy, ...years]).map((y) => <option key={y}>{y}</option>)}</select>
          </label>
        </div>
      </div>
      <div role="tablist" aria-label="Raw Material (Budget Rate Preparation)" className="grid gap-2 sm:grid-cols-3">
        {TABS.map((t, i) => {
          const on = tab === t.id; const Icon = t.icon;
          return (
            <button key={t.id} role="tab" type="button" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => setTab(t.id)}
              onKeyDown={(e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) setTab(TABS[(i + d + TABS.length) % TABS.length].id); }}
              className={cx('flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition', on ? `border-transparent bg-gradient-to-br ${t.tone} text-white shadow-pop` : 'border-line bg-panel text-ink shadow-card hover:bg-sunken')}>
              <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', on ? 'bg-white/20' : 'bg-accent/10 text-accent')}><Icon size={18} /></span>
              <span><span className="block text-sm font-extrabold">{i + 1}. {t.label}</span><span className={cx('block text-2xs', on ? 'text-white/80' : 'text-muted')}>{t.hint}</span></span>
            </button>
          );
        })}
      </div>
      {tab === 'history' && <HistoryTab segment={segment} setSegment={setSegment} gjahr={fy} email={email} onGenerated={(g) => { setGen(g); setTab('rates'); }} />}
      {tab === 'rates' && <RatesTab segment={segment} setSegment={setSegment} gjahr={fy} generated={gen} />}
      {tab === 'review' && <ReviewTab segment={segment} setSegment={setSegment} gjahr={fy} email={email} />}
    </PlanFrame>
  );
}
