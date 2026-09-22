'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import StatusBadge from '../../components/StatusBadge';
import BackButton from '../../components/BackButton';
import MonthSelector from '../../components/MonthSelector';
import { currentMonthStartIso, formatMonthLabel } from '../../utils/date';
import { isOverdue } from '../../utils/timesheet';

// Hand-rolled div-width-percentage bars, no charting library - matches the original app's own
// approach exactly, just restyled onto the hub palette.
function BarList({ items, colorClass }: { items: { label: string; value: number }[]; colorClass: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-ink">{item.label}</span>
            <span className="font-medium text-inkSoft">{item.value.toFixed(2).replace(/\.00$/, '')}h</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-border">
            <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
      {items.length === 0 && <p className="text-sm text-inkSoft">No data for this month.</p>}
    </ul>
  );
}

export default function TeamReportsPage() {
  const { currentUser, directReports, projects, getTimesheet, teamSettings } = useApp();
  const router = useRouter();
  const thisMonth = currentMonthStartIso();
  const [month, setMonth] = useState(thisMonth);

  // Defense in depth - the sidepane already hides this link from a non-manager, but the route is
  // still reachable by a typed URL.
  useEffect(() => {
    if (currentUser?.role !== 'manager') router.push('/');
  }, [currentUser?.role, router]);

  const monthTimesheets = directReports.map((user: any) => ({ user, timesheet: getTimesheet(user.id, month) })).filter((r: any) => r.timesheet);

  const hoursByProject = useMemo(() => {
    const totals: Record<string, number> = {};
    monthTimesheets.forEach(({ timesheet }: any) => {
      timesheet.entries.forEach((e: any) => {
        totals[e.projectId] = (totals[e.projectId] || 0) + Number(e.hours);
      });
    });
    return projects
      .map((p: any) => ({ label: p.name, value: totals[p.id] || 0 }))
      .filter((p: any) => p.value > 0)
      .sort((a: any, b: any) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTimesheets, projects]);

  const hoursByMember = useMemo(() => {
    return directReports
      .map((user: any) => {
        const ts = getTimesheet(user.id, month);
        const total = ts ? ts.entries.reduce((sum: number, e: any) => sum + Number(e.hours), 0) : 0;
        return { label: user.name, value: total };
      })
      .sort((a: any, b: any) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directReports, month]);

  const overdue = directReports
    .map((user: any) => {
      const ts = getTimesheet(user.id, thisMonth);
      return { user, ts, overdue: isOverdue(ts || { status: 'Draft', monthStartDate: thisMonth }, teamSettings) };
    })
    .filter((r: any) => r.overdue);

  if (currentUser?.role !== 'manager') return null;

  return (
    <div className="space-y-6">
      <BackButton onClick={() => router.push('/')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Team Reports</h1>
          <p className="mt-1 text-sm text-inkSoft">Aggregated hours for your direct reports.</p>
        </div>
        <MonthSelector monthStartDate={month} onChange={setMonth} maxMonthStartDate={thisMonth} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="glass-card p-6">
          <h2 className="mb-4 font-semibold text-ink">Hours by project - {formatMonthLabel(month)}</h2>
          <BarList items={hoursByProject} colorClass="bg-rust" />
        </section>
        <section className="glass-card p-6">
          <h2 className="mb-4 font-semibold text-ink">Hours by team member - {formatMonthLabel(month)}</h2>
          <BarList items={hoursByMember} colorClass="bg-teal" />
        </section>
      </div>

      <section className="glass-card overflow-hidden">
        <div className="border-b border-glassBorder px-6 py-4">
          <h2 className="font-semibold text-ink">Overdue this month</h2>
          <p className="mt-0.5 text-xs text-inkSoft">{formatMonthLabel(thisMonth)}</p>
        </div>
        <ul className="divide-y divide-border">
          {overdue.map(({ user }: any) => (
            <li key={user.id} className="flex items-center justify-between px-6 py-3.5">
              <div>
                <p className="text-sm font-medium text-ink">{user.name}</p>
                <p className="text-xs text-inkSoft">{user.email}</p>
              </div>
              <StatusBadge status="Overdue" />
            </li>
          ))}
          {overdue.length === 0 && <li className="px-6 py-6 text-center text-sm text-inkSoft">Everyone is on track. 🎉</li>}
        </ul>
      </section>
    </div>
  );
}
