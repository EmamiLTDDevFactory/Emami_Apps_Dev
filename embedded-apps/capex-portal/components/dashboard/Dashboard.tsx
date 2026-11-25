'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, DataTable, ErrorBox, Chip, Kpi, PageHeader, Spinner, type Column } from '@/components/ui';
import { useList } from '@/lib/useData';
import { useSession } from '@/lib/session';
import { fmtDays, fmtInr, fyDigits, fyLabel, inLakhs, num } from '@/lib/format';
import type { ApprovalInbox, Budget, CPE, CwipAgeing, DashboardKpi } from '@/lib/entities';
import { useDashCategories } from './hooks';
import FySelect from './FySelect';
import { buildQueue, icStatusLabel, inboxForYear, meterSegments, queueBreakdown, riskTone, share, slaBreaches, utilTone, type QueueRow } from './logic';

const BAR: Record<string, string> = { success: 'bg-emerald-500', warning: 'bg-amber-500', error: 'bg-red-500', info: 'bg-blue-500', neutral: 'bg-[#4338CA]' };

export function Bar({ pct, tone = 'info', h = 'h-2.5' }: { pct: number; tone?: string; h?: string }) {
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className={`${h} w-full overflow-hidden rounded-full bg-[#E4E8F5]`}>
      <div className={`${h} rounded-full ${BAR[tone] ?? BAR.info}`} style={{ width: `${pct.toFixed(1)}%` }} />
    </div>
  );
}

const shareText = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}% of total budget` : '');

export default function Dashboard() {
  const s = useSession();
  const router = useRouter();
  const kpis = useList<DashboardKpi>('DashboardKpiSet');
  const inbox = useList<ApprovalInbox>('ApprovalInboxSet');
  const cwip = useList<CwipAgeing>('CwipAgeingSet');
  const budgets = useList<Budget>('BudgetSet', { $select: 'Budgetid,Fiscalyear' });
  const cpes = useList<CPE>('CPESet', { $select: 'Cpeid,Fiscalyear' });
  const cats = useDashCategories();
  const [fy, setFy] = useState('');
  const [cwipAll, setCwipAll] = useState(false);

  const years = useMemo(() => {
    const set = new Set<string>();
    [...kpis.rows.map((r) => r.Fiscalyear), ...budgets.rows.map((r) => r.Fiscalyear), ...cpes.rows.map((r) => r.Fiscalyear)].forEach((y) => { const d = fyDigits(y); if (d) set.add(d); });
    return Array.from(set).sort().reverse();
  }, [kpis.rows, budgets.rows, cpes.rows]);

  // default to the session's year when it exists in the data, else the newest real year
  useEffect(() => {
    if (fy && years.includes(fy)) return;
    const mine = fyDigits(s.fiscalYear);
    setFy(years.includes(mine) ? mine : years[0] ?? mine);
  }, [years, s.fiscalYear, fy]);

  const warn = s.cfgNum('SLA_WARN_DAYS', 3), breach = s.cfgNum('SLA_BREACH_DAYS', 5);
  const k = kpis.rows.find((r) => fyDigits(r.Fiscalyear) === fy);
  const budgetFy = useMemo(() => new Map(budgets.rows.map((b) => [b.Budgetid, fyDigits(b.Fiscalyear)] as const)), [budgets.rows]);
  const cpeFy = useMemo(() => new Map(cpes.rows.map((c) => [c.Cpeid, fyDigits(c.Fiscalyear)] as const)), [cpes.rows]);
  const fyInbox = useMemo(() => inboxForYear(inbox.rows, budgetFy, cpeFy, fy), [inbox.rows, budgetFy, cpeFy, fy]);
  const queue = useMemo(() => buildQueue(fyInbox, warn, breach), [fyInbox, warn, breach]);
  const pendingValue = fyInbox.reduce((t, r) => t + num(r.Amount), 0);
  const breached = slaBreaches(fyInbox, breach);
  const catRows = useMemo(() => cats.rows.filter((c) => fyDigits(c.Fiscalyear) === fy).sort((a, b) => num(b.Approved) - num(a.Approved)), [cats.rows, fy]);
  const cwipRows = useMemo(() => [...cwip.rows].sort((a, b) => num(b.AgeDays) - num(a.AgeDays)), [cwip.rows]);
  const cwipPending = num(k?.CwipPending) || cwip.rows.reduce((t, c) => t + num(c.Amount), 0);

  const total = num(k?.TotalBudget), committed = num(k?.Committed), spent = num(k?.Spent);
  const seg = meterSegments(spent, committed, k?.ApprovedCpe, total);
  const loading = kpis.loading && !kpis.rows.length;
  const error = kpis.error || inbox.error || cwip.error;
  const go = (href: string) => router.push(href);

  const queueCols: Column<QueueRow>[] = [
    { key: 'level', header: 'Level' },
    { key: 'count', header: 'Items', align: 'center', width: '9rem', render: (r) => (<div><div className="font-bold tabular-nums">{r.count}</div>{queueBreakdown(r.byType) && <div className="text-[11px] text-sap-muted">{queueBreakdown(r.byType)}</div>}</div>) },
    { key: 'value', header: 'Value', align: 'right', hideBelow: 'sm', render: (r) => <span className="tabular-nums">{fmtInr(r.value)}</span> },
    { key: 'days', header: 'Ageing', align: 'right', width: '7rem', render: (r) => <Chip tone={r.tone}>{r.tone === 'error' ? '! ' : ''}{fmtDays(r.days)}</Chip> },
  ];
  const cwipCols: Column<CwipAgeing>[] = [
    { key: 'Cwipid', header: 'CWIP', render: (r) => <span className="font-bold">{r.Cwipid}</span> },
    { key: 'Title', header: 'Description', hideBelow: 'sm' },
    { key: 'Amount', header: 'Value', align: 'right', render: (r) => <span className="tabular-nums">{inLakhs(r.Amount)}</span> },
    { key: 'AgeDays', header: 'Age (days)', align: 'right', hideBelow: 'sm', render: (r) => <Chip tone={riskTone(r.Risk)}>{r.AgeDays ?? '-'}</Chip> },
    { key: 'IcStatus', header: 'IC Status', align: 'right', render: (r) => <Chip tone={r.IcStatus === 'CAPITALIZED' ? 'success' : r.IcStatus === 'PENDING' ? 'warning' : 'neutral'}>{icStatusLabel(r.IcStatus)}</Chip> },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Budget position, approvals and CWIP at a glance"
        actions={<FySelect years={years} value={fy} onChange={setFy} />}
      />
      {error && <div className="mb-3"><ErrorBox message={error} onRetry={() => { kpis.reload(); inbox.reload(); cwip.reload(); }} /></div>}
      {loading ? <Spinner /> : (
        <>
          {/* Hero: utilisation meter */}
          <Card className="mb-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><div className="text-[11px] font-bold uppercase text-sap-muted">Budget utilisation</div><div className="text-[12px] text-sap-muted">{fyLabel(fy)}</div></div>
              <div className="text-right"><div className="text-[11px] text-sap-muted">Total approved budget</div><div className="font-display text-2xl font-extrabold">{fmtInr(total)}</div></div>
            </div>
            <div role="img" aria-label="Budget utilisation" className="mt-3 flex h-3.5 w-full overflow-hidden rounded-full bg-[#E4E8F5]">
              <div className="bg-[#0040B0]" style={{ width: `${seg.spent}%` }} />
              <div className="bg-[#0064D9]" style={{ width: `${seg.committed}%` }} />
              <div className="bg-[#B8C7D6]" style={{ width: `${seg.reserved}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#0040B0]" />Spent {fmtInr(spent)}</span>
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#0064D9]" />Committed {fmtInr(committed)}</span>
              <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#B8C7D6]" />Available {fmtInr(k?.Available)}</span>
            </div>
          </Card>

          {/* KPI tiles (clickable: each opens the screen that explains the number, log #42/#70) */}
          <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-sap-muted">Overview</div>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <Kpi label="Approved CPEs" tone="info" value={fmtInr(k?.ApprovedCpe)} foot={shareText(num(k?.ApprovedCpe), total)} onClick={() => go('/cpe/?status=APPROVED')} />
            <Kpi label="Committed (POs)" tone="info" value={fmtInr(committed)} foot={shareText(committed, total)} onClick={() => go('/po/')} />
            <Kpi label="Spent (GRNs)" tone="neutral" value={fmtInr(spent)} foot={shareText(spent, total)} onClick={() => go('/grn/')} />
            <Kpi label="Capitalized" tone="success" value={fmtInr(k?.Capitalized)} foot={shareText(num(k?.Capitalized), total)} onClick={() => go('/ic/')} />
            <Kpi label="Available" tone="success" value={fmtInr(k?.Available)} foot={shareText(num(k?.Available), total)} onClick={() => go('/budget/')} />
            <Kpi label="CWIP pending capitalization" tone="warning" value={fmtInr(cwipPending)} foot={`${cwip.rows.length || num(k?.CwipAssets)} assets, avg ${cwip.rows.length ? Math.round(cwip.rows.reduce((t, c) => t + num(c.AgeDays), 0) / cwip.rows.length) : num(k?.CwipAvgAge)} days old`} onClick={() => go('/capitalization/')} />
            <Kpi label="Pending approvals" tone="warning" value={<>{fyInbox.length} <span className="text-[12px] font-semibold text-sap-muted">items</span></>} foot={fmtInr(pendingValue)} onClick={() => go('/approvals/')} />
            <Kpi label="SLA breaches" tone="error" value={<>{breached} <span className="text-[12px] font-semibold text-sap-muted">items</span></>} foot={`Pending over ${breach} days`} onClick={() => go('/approvals/?sla=BREACH')} />
            <Kpi label="Avg approval cycle" tone="neutral" value={<>{num(k?.CycleTimeDays)} <span className="text-[12px] font-semibold text-sap-muted">days</span></>} foot={`down from ${num(k?.CycleTimeBefore)} days`} />
            <Kpi label="Negotiation savings YTD" tone="success" value={fmtInr(k?.SavingsYtd)} foot="Negotiation vs L1" />
          </div>

          {breached > 0 && (
            <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-800">
              <span>{breached} {breached === 1 ? 'approval has' : 'approvals have'} been pending more than {breach} days and breached SLA. Auto-escalation has been triggered.</span>
              <button type="button" className="font-bold underline" onClick={() => go('/approvals/')}>View all</button>
            </div>
          )}

          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Card title="Approval queue by level" actions={<Button variant="secondary" onClick={() => go('/approvals/')}>View all</Button>}>
              <DataTable columns={queueCols} rows={queue} rowKey={(r) => r.level} onRowClick={() => go('/approvals/')} loading={inbox.loading && !inbox.rows.length} empty="No pending approvals." />
            </Card>
            <Card title="Budget by category">
              {cats.loading && !cats.rows.length ? <Spinner /> : catRows.length === 0 ? <div className="py-6 text-center text-[12px] text-sap-muted">No budgets for this fiscal year.</div> : (
                <ul className="space-y-3">
                  {catRows.map((c) => (
                    <li key={c.Category}>
                      <div className="flex items-baseline justify-between gap-2 text-[12px]"><span>{c.CategoryText || c.Category}</span><span className="tabular-nums">{fmtInr(c.Spent)} of {fmtInr(c.Approved)}</span></div>
                      <div className="mt-1"><Bar pct={share(c.Spent, c.Approved)} tone={utilTone(c.Spent, c.Approved)} h="h-2.5" /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="CWIP ageing" className="mb-4" actions={<Button variant="secondary" onClick={() => go('/capitalization/')}>View all</Button>}>
            <DataTable columns={cwipCols} rows={cwipAll ? cwipRows : cwipRows.slice(0, 5)} rowKey={(r) => r.Cwipid} onRowClick={() => go('/capitalization/')} loading={cwip.loading && !cwip.rows.length} empty="No CWIP awaiting capitalization."
              footer={cwipRows.length > 5 ? <div className="p-2 text-center"><button type="button" className="text-[12px] font-bold text-plum" onClick={() => setCwipAll((v) => !v)}>{cwipAll ? 'Show less' : `Show all (${cwipRows.length})`}</button></div> : undefined} />
            <p className="mt-2 text-[11px] text-sap-muted">CWIP and Capitalized are not split by fiscal year (SAP carries no year on them).</p>
          </Card>

          <div className="text-[11px] font-extrabold uppercase tracking-wider text-sap-muted">Quick actions</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => go('/budget/create/')}>New Budget</Button>
            <Button onClick={() => go('/cpe/create/')}>New CPE</Button>
            <Button onClick={() => go('/approvals/')}>My Approvals</Button>
            <Button onClick={() => go('/ic/')}>Upload IC</Button>
          </div>
        </>
      )}
    </div>
  );
}
