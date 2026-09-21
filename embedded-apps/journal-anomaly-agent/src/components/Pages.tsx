'use client';

import type { Summary } from '../types';
import { Bars, Head, Kpi, Kpis, TableCard, Tabs, fmt, type PageState } from './Shared';

export function ExecPage({ state, summary }: { state: PageState; summary?: Summary }) {
  const drill = () => {
    const first = state.items[0];
    if (first) state.open(first);
    else state.toast('No entries in the current scope');
  };
  return (
    <>
      <Head title="Executive Financial Control Position" sub="Full-population journal monitoring across GL, subledgers, controlling and integrated source processes">
        <span className="fresh">Last scored: {summary?.journals.lastScoredAt ? new Date(summary.journals.lastScoredAt).toLocaleString() : '07-Sep-2026 02:41 PM'}</span>
      </Head>
      <Kpis>
        <Kpi label="Entries Scored" value={summary ? fmt(summary.journals.entriesScored) : '18,426'} sub="100% population coverage" tone="cyan" onClick={drill} />
        <Kpi label="Auto-cleared" value={summary ? `${((summary.journals.low / Math.max(1, summary.journals.entriesScored)) * 100).toFixed(1)}%` : '97.3%'} sub={summary ? `${fmt(summary.journals.low)} low-risk entries` : '17,931 low-risk entries'} tone="green" onClick={drill} />
        <Kpi label="Flagged for Review" value={summary ? fmt(summary.journals.flagged) : '495'} sub={summary ? `${summary.journals.critical} critical / ${summary.journals.high} high` : '47 high / critical'} tone="amber" onClick={drill} />
        <Kpi label="Financial Exposure" value="₹19.42 Cr" sub="High and critical population" tone="red" onClick={drill} />
        <Kpi label="Manual JEs" value="1,284" sub="7.0% of population" tone="violet" onClick={drill} />
        <Kpi label="Top-side Adjustments" value="76" sub="₹8.6 Cr gross value" tone="red" onClick={drill} />
        <Kpi label="Open Audit Cases" value={summary ? fmt(summary.cases.openCases) : '12'} sub={summary ? `${summary.cases.overdueCases} beyond SLA` : '2 beyond SLA'} tone="amber" onClick={drill} />
        <Kpi label="Close Cycle Forecast" value="3.8 days" sub="0.6 day improvement" tone="green" onClick={drill} />
      </Kpis>
      <div className="grid2" style={{ marginTop: 13 }}>
        <div className="card">
          <h3>Risk Trend and Period-Close Spike</h3>
          <Bars items={[['Week 1 flagged rate', 31, '#059669'], ['Week 2 flagged rate', 38, '#0891b2'], ['Week 3 flagged rate', 44, '#d97706'], ['Period-end flagged rate', 76, '#dc2626']]} />
        </div>
        <TableCard title="Priority Review Queue" items={state.items.slice(0, 3)} open={state.open} loading={state.loading} />
      </div>
      <div className="card" style={{ marginTop: 13 }}>
        <h3>Company Code × Risk Heatmap</h3>
        <div className="heat">
          {(
            [['1000 India 2.7%', '#7c3aed'], ['1010 Dubai 1.8%', '#059669'], ['1020 Bangladesh 2.2%', '#059669'], ['1030 Sri Lanka 1.4%', '#059669'], ['Manual 6.2%', '#d97706'], ['Top-side 11.8%', '#dc2626']] as [string, string][]
          ).map(([t, c]) => (
            <div key={t} style={{ background: c }} onClick={drill}>{t}</div>
          ))}
        </div>
      </div>
    </>
  );
}

export function WorkbenchPage({ state, summary }: { state: PageState; summary?: Summary }) {
  return (
    <>
      <Head title="AI Anomaly Workbench" sub="Hybrid score combining rules, peer behavior, sequence patterns, value exposure and historical findings">
        <Tabs labels={['All', 'Unassigned', 'My Cases', 'Overdue']} />
      </Head>
      <Kpis>
        <Kpi label="Critical Entries" value={summary ? String(summary.journals.critical) : '9'} sub="₹6.82 Cr exposure" tone="red" onClick={() => state.items[0] && state.open(state.items[0])} />
        <Kpi label="High Risk" value={summary ? String(summary.journals.high) : '38'} sub="₹12.6 Cr exposure" tone="amber" />
        <Kpi label="Low AI Confidence" value="7" sub="Mandatory manual review" tone="violet" />
        <Kpi label="Review Capacity Fit" value="86%" sub="Within close-window SLA" tone="green" />
      </Kpis>
      <TableCard title="Risk-Ranked Journal Population" items={state.items} open={state.open} loading={state.loading} />
    </>
  );
}
