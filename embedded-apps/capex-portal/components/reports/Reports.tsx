'use client';
import { useMemo, useState } from 'react';
import { Button, Card, Chip, DataTable, ErrorBox, PageHeader, useToast, type Column } from '@/components/ui';
import { useList } from '@/lib/useData';
import { useSession } from '@/lib/session';
import { fmtDays, fmtInr, fyDigits, fyLabel, num, slaLabel, slaState, slaTone } from '@/lib/format';
import type { ApprovalInbox, Budget, CPE, DashCategory, DashTrend } from '@/lib/entities';
import { Bar } from '@/components/dashboard/Dashboard';
import FySelect from '@/components/dashboard/FySelect';
import { useDashCategories, useDashTrend } from '@/components/dashboard/hooks';
import { buildQueue, inboxForYear, share, utilTone, type QueueRow } from '@/components/dashboard/logic';

/** Reports.controller.js catalogue, verbatim. */
const CATALOGUE = [
  { key: 'BUDGET_UTIL', title: 'Budget Utilisation', description: 'Approved, committed, spent and available by unit, category and financial year.' },
  { key: 'CYCLE_TIME', title: 'Approval Cycle Time', description: 'Average days per DOA level, SLA breaches and auto-escalations.' },
  { key: 'VENDOR', title: 'Vendor Selection Analysis', description: 'L1 vs selected vendor, negotiation savings and non-L1 justifications.' },
  { key: 'CWIP', title: 'CWIP Ageing', description: 'Open capital work in progress by age band, with capitalization risk.' },
  { key: 'SAVINGS', title: 'Negotiation Savings', description: 'Savings realised against L1 quotes, by unit and by procurement officer.' },
  { key: 'QUOTA', title: 'Unit Quota Consumption', description: 'Quota capex used and remaining against the ₹2 L annual cap per unit.' },
  { key: 'SAP_RECON', title: 'Portal vs SAP Reconciliation', description: 'Differences between portal commitments and SAP internal order balances.' },
  { key: 'AUDIT', title: 'Compliance Audit Extract', description: 'Full approval trail for a date range, formatted for statutory audit.' },
];

function csv(name: string, head: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob([[head, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Reports() {
  const s = useSession();
  const toast = useToast();
  const cats = useDashCategories();
  const trend = useDashTrend();
  const inbox = useList<ApprovalInbox>('ApprovalInboxSet');
  const budgets = useList<Budget>('BudgetSet', { $select: 'Budgetid,Fiscalyear' });
  const cpes = useList<CPE>('CPESet', { $select: 'Cpeid,Fiscalyear' });
  const [fyPick, setFyPick] = useState('');

  const years = useMemo(() => {
    const set = new Set<string>();
    [...cats.rows.map((r) => r.Fiscalyear), ...trend.rows.map((r) => r.Fiscalyear), ...budgets.rows.map((r) => r.Fiscalyear)].forEach((y) => { const d = fyDigits(y); if (d) set.add(d); });
    return Array.from(set).sort().reverse();
  }, [cats.rows, trend.rows, budgets.rows]);
  const fy = fyPick && years.includes(fyPick) ? fyPick : years.includes(fyDigits(s.fiscalYear)) ? fyDigits(s.fiscalYear) : years[0] ?? fyDigits(s.fiscalYear);

  const warn = s.cfgNum('SLA_WARN_DAYS', 3), breach = s.cfgNum('SLA_BREACH_DAYS', 5);
  const catRows = useMemo(() => cats.rows.filter((c) => fyDigits(c.Fiscalyear) === fy).sort((a, b) => num(b.Approved) - num(a.Approved)), [cats.rows, fy]);
  const trendRows = useMemo(() => trend.rows.filter((t) => fyDigits(t.Fiscalyear) === fy), [trend.rows, fy]);
  const queue = useMemo(() => {
    const bm = new Map(budgets.rows.map((b) => [b.Budgetid, fyDigits(b.Fiscalyear)] as const));
    const cm = new Map(cpes.rows.map((c) => [c.Cpeid, fyDigits(c.Fiscalyear)] as const));
    return buildQueue(inboxForYear(inbox.rows, bm, cm, fy), warn, breach);
  }, [inbox.rows, budgets.rows, cpes.rows, fy, warn, breach]);

  const exportCategories = () => csv(`budget-by-category-${fy}.csv`, ['Category', 'Approved', 'Committed', 'Spent', 'Balance'], catRows.map((c) => [c.CategoryText || c.Category, num(c.Approved), num(c.Committed), num(c.Spent), num(c.Approved) - num(c.Spent)]));
  const notLive = (title: string) => toast(`${title} runs against the Gateway analytics service once the backend is live.`, 'info');
  const exportNotLive = () => toast('Export to Excel is served by the Gateway export service once the backend is live.', 'info');

  const catCols: Column<DashCategory>[] = [
    { key: 'Category', header: 'Category', render: (r) => r.CategoryText || r.Category },
    { key: 'Approved', header: 'Approved', align: 'right', render: (r) => <span className="tabular-nums">{fmtInr(r.Approved)}</span> },
    { key: 'Spent', header: 'Spent', align: 'right', hideBelow: 'sm', render: (r) => <span className="tabular-nums">{fmtInr(r.Spent)}</span> },
    { key: 'Balance', header: 'Balance', align: 'right', hideBelow: 'sm', render: (r) => <span className="font-bold tabular-nums text-emerald-700">{fmtInr(num(r.Approved) - num(r.Spent))}</span> },
    { key: 'Util', header: 'Utilisation', width: '9rem', hideBelow: 'sm', render: (r) => (<div className="flex items-center gap-2"><div className="flex-1"><Bar pct={share(r.Spent, r.Approved)} tone={utilTone(r.Spent, r.Approved)} /></div><span className="w-9 text-right text-[11px] tabular-nums">{Math.round(share(r.Spent, r.Approved))}%</span></div>) },
  ];
  const cycleCols: Column<QueueRow>[] = [
    { key: 'level', header: 'Level' },
    { key: 'count', header: 'Pending', align: 'right', render: (r) => <span className="tabular-nums">{r.count}</span> },
    { key: 'value', header: 'Value', align: 'right', hideBelow: 'sm', render: (r) => <span className="tabular-nums">{fmtInr(r.value)}</span> },
    { key: 'days', header: 'Avg days', align: 'right', render: (r) => <span className="tabular-nums">{r.days}</span> },
    { key: 'sla', header: 'SLA', align: 'right', width: '9rem', render: (r) => <Chip tone={slaTone(slaState(r.days, warn, breach))}>{slaLabel(r.days, warn, breach)}</Chip> },
  ];
  const err = cats.error || trend.error || inbox.error;

  return (
    <div>
      <PageHeader title="Reports" subtitle={`${fyLabel(fy)} · all units`} actions={<FySelect years={years} value={fy} onChange={setFyPick} />} />
      {err && <div className="mb-3"><ErrorBox message={err} onRetry={() => { cats.reload(); trend.reload(); inbox.reload(); }} /></div>}

      <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-sap-muted">Standard reports</div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CATALOGUE.map((r) => (
          <Card key={r.key} title={r.title}>
            <p className="min-h-[3.2rem] text-[11.5px] text-sap-muted">{r.description}</p>
            <div className="mt-3 flex gap-2"><Button variant="primary" onClick={() => notLive(r.title)}>Run</Button><Button aria-label="Export to Excel" onClick={exportNotLive}>Export</Button></div>
          </Card>
        ))}
      </div>

      <Card title="Budget vs committed vs spent, by category" className="mb-4" actions={<Button onClick={exportCategories} disabled={!catRows.length}>Export CSV</Button>}>
        <DataTable columns={catCols} rows={catRows} rowKey={(r) => r.Category} loading={cats.loading && !cats.rows.length} empty="No budgets for this fiscal year." />
      </Card>

      <Card title="Approval cycle time by level" className="mb-4">
        <DataTable columns={cycleCols} rows={queue} rowKey={(r) => r.level} loading={inbox.loading && !inbox.rows.length} empty="No pending approvals." />
        <p className="mt-2 text-[11px] text-sap-muted">Pending items grouped by DOA level; days are the average age of items waiting at that level ({fmtDays(warn)} warn / {fmtDays(breach)} breach).</p>
      </Card>

      <Card title="Monthly trend">
        {trend.loading && !trend.rows.length ? null : trendRows.length === 0 ? <div className="py-6 text-center text-[12px] text-sap-muted">No monthly figures for this fiscal year.</div> : (
          <ul className="space-y-3">
            {trendRows.map((t: DashTrend) => (
              <li key={t.Period}>
                <div className="flex items-baseline justify-between gap-2 text-[12px]"><span className="font-bold">{t.MonthText || t.Period}</span><span className="tabular-nums">{fmtInr(t.Spent)} spent of {fmtInr(t.Committed)} committed</span></div>
                <div className="mt-1"><Bar pct={share(t.Spent, t.Committed)} tone="info" h="h-2" /></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
