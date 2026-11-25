'use client';
/** Admin settings: exclusion rules, budget upload (OB / RB versions), mapping overrides, audit log. */
import { useState } from 'react';
import { FileClock, FilterX, Network, Upload } from 'lucide-react';
import { useApp } from '@/lib/context';
import { defaultPeriod, fyLabel } from '@/lib/format';
import PeriodPicker from '../PeriodPicker';
import { Select, Tabs } from '../ui';
import Exclusions from './Exclusions';
import BudgetAdmin from './BudgetAdmin';
import Mappings from './Mappings';
import AuditLog from './AuditLog';

type Tab = 'exclusions' | 'budget' | 'mappings' | 'audit';

export default function Settings() {
  const { filters, setFilters, sel } = useApp();
  const [tab, setTab] = useState<Tab>(() => {
    try { return (sessionStorage.getItem('pubexp.settingsTab') as Tab) || 'exclusions'; } catch { return 'exclusions'; }
  });
  const pick = (t: Tab) => { setTab(t); try { sessionStorage.setItem('pubexp.settingsTab', t); } catch { /* private mode */ } };
  const cur = Number(defaultPeriod().fy);
  const years = [cur + 1, cur, cur - 1, cur - 2].map(String);
  if (!years.includes(filters.fy)) years.push(filters.fy);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel p-3 shadow-card">
        <Tabs<Tab> label="Settings" value={tab} onChange={pick} tabs={[
          { id: 'exclusions', label: <span className="inline-flex items-center gap-1.5"><FilterX size={13} /> Exclusions</span> },
          { id: 'budget', label: <span className="inline-flex items-center gap-1.5"><Upload size={13} /> Budget upload</span> },
          { id: 'mappings', label: <span className="inline-flex items-center gap-1.5"><Network size={13} /> Mappings</span> },
          { id: 'audit', label: <span className="inline-flex items-center gap-1.5"><FileClock size={13} /> Audit log</span> },
        ]} />
        <div className="flex-1" />
        <span className="text-2xs text-muted">Figures for</span>
        <Select label="Fiscal year" value={filters.fy} onChange={(v) => setFilters({ fy: v })} options={years.map((y) => ({ value: y, label: fyLabel(y) }))} className="w-[6.5rem]" />
        <PeriodPicker fy={filters.fy} value={filters.periods} onChange={(v) => setFilters({ periods: v })} className="w-[12.5rem]" align="right" />
      </div>
      <p className="px-1 text-2xs text-muted">Every change applies to every user at once and is written to the audit log. Amounts shown are for {sel.cy}{filters.companies.length ? `, company ${filters.companies.join(', ')}` : ', all companies'}; rules take effect by the latest selected period ({`P${String(sel.latest).padStart(2, '0')}`}).</p>
      {tab === 'exclusions' && <Exclusions />}
      {tab === 'budget' && <BudgetAdmin />}
      {tab === 'mappings' && <Mappings />}
      {tab === 'audit' && <AuditLog />}
    </div>
  );
}
