'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowDown, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import StatusBadge from '../../components/StatusBadge';
import TimesheetGrid from '../../components/TimesheetGrid';
import BackButton from '../../components/BackButton';
import MonthSelector from '../../components/MonthSelector';
import { currentMonthStartIso, formatDateTime, formatMonthLabel } from '../../utils/date';
import { computeTotals, getDisplayStatus, isOverdue } from '../../utils/timesheet';
import { exportTimesheetToExcel } from '../../utils/exportTimesheet';

// Super Admin only (the hub's own 'Super Admin' access level, see server users.is_super_admin):
// a read-only view of every employee's timesheet, whoever they report to. Approving/rejecting
// stays with each employee's own manager on Team Approvals.
export default function AllEmployeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewUserId = searchParams.get('userId');
  const viewMonth = searchParams.get('month');
  const { currentUser } = useApp();

  // Defense in depth - the sidepane already hides this link from everyone else, but the route is
  // still reachable by a typed URL.
  useEffect(() => {
    if (!currentUser?.isSuperAdmin) router.push('/');
  }, [currentUser?.isSuperAdmin, router]);
  if (!currentUser?.isSuperAdmin) return null;

  if (viewUserId && viewMonth) return <EmployeeTimesheet userId={viewUserId} month={viewMonth} />;
  return <EmployeeList />;
}

function EmployeeList() {
  const router = useRouter();
  const { users, getTimesheet, getUserById, teamSettings } = useApp();
  const thisMonth = currentMonthStartIso();
  const [month, setMonth] = useState(thisMonth);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u: any) => u.role === 'employee')
      .map((user: any) => {
        const timesheet = getTimesheet(user.id, month);
        const overdue = isOverdue(timesheet || { status: 'Draft', monthStartDate: month }, teamSettings);
        const submitEvent = timesheet ? [...timesheet.history].reverse().find((h: any) => h.status === 'Submitted' || h.status === 'Resubmitted') : null;
        return {
          user,
          manager: user.managerId ? getUserById(user.managerId) : null,
          timesheet,
          displayStatus: overdue ? 'Overdue' : getDisplayStatus(timesheet || { status: 'Draft' }),
          submittedDate: (submitEvent as any)?.date || null,
          total: computeTotals(timesheet?.entries || [], month).monthTotal,
        };
      })
      .filter(
        (r: any) =>
          !q ||
          r.user.name.toLowerCase().includes(q) ||
          r.user.email.toLowerCase().includes(q) ||
          (r.manager?.name || '').toLowerCase().includes(q)
      )
      .sort((a: any, b: any) => a.user.name.localeCompare(b.user.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, month, query, teamSettings]);

  return (
    <div className="space-y-5">
      <BackButton onClick={() => router.push('/')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">All Employees</h1>
          <p className="mt-1 text-sm text-inkSoft">{formatMonthLabel(month)} - every employee, whoever they report to</p>
        </div>
        <MonthSelector monthStartDate={month} onChange={setMonth} maxMonthStartDate={thisMonth} />
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkSoft" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employee or manager…"
          className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust"
        />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-glassBorder bg-glassRust text-left text-ink">
                <th scope="col" className="px-4 py-3 font-semibold">Employee</th>
                <th scope="col" className="px-4 py-3 font-semibold">Reports to</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Hours</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ user, manager, timesheet, displayStatus, submittedDate, total }: any) => (
                <tr key={user.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-white/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{user.name}</div>
                    <div className="text-xs text-inkSoft">{user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-ink">{manager?.name || <span className="text-inkSoft">Unassigned</span>}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={displayStatus} />
                  </td>
                  <td className="px-4 py-3 text-inkSoft">{submittedDate ? formatDateTime(submittedDate) : '-'}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{total.toFixed(2).replace(/\.00$/, '')}h</td>
                  <td className="px-4 py-3 text-right">
                    {timesheet && (
                      <button
                        type="button"
                        onClick={() => router.push(`/all-employees/?userId=${user.id}&month=${month}`)}
                        className="font-medium text-rust hover:text-rustDeep focus:outline-none focus-visible:underline"
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-inkSoft">
                    No employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EmployeeTimesheet({ userId, month }: { userId: string; month: string }) {
  const router = useRouter();
  const { getUserById, getTimesheet, getAssignedTasks, projects, workingDayOverridesSet } = useApp();
  const { showToast } = useToast();

  const user = getUserById(userId);
  const manager = user?.managerId ? getUserById(user.managerId) : null;
  const timesheet = getTimesheet(userId, month);

  const tasks = useMemo(
    () =>
      getAssignedTasks(userId).map((t: any) => ({
        ...t,
        projectName: projects.find((p: any) => p.id === t.projectId)?.name || 'Unknown project',
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, projects]
  );

  async function handleDownloadExcel() {
    try {
      await exportTimesheetToExcel({ entries: timesheet.entries, tasks, monthStartDate: month, userName: user.name, workingDayOverrides: workingDayOverridesSet });
      showToast('Timesheet downloaded.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to download timesheet.', 'error');
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push('/all-employees/')}
        className="inline-flex items-center gap-1 text-sm font-medium text-teal hover:text-teal/80 focus:outline-none focus-visible:underline"
      >
        <ArrowLeft size={14} />
        Back to All Employees
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{user.name}&apos;s Timesheet</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={getDisplayStatus(timesheet || { status: 'Draft' })} />
            <span className="text-sm text-inkSoft">
              {formatMonthLabel(month)} · Reports to {manager?.name || 'no one yet'}
            </span>
          </div>
        </div>
        {timesheet && (
          <button type="button" onClick={handleDownloadExcel} className="btn-ghost">
            <ArrowDown size={16} />
            Download Excel
          </button>
        )}
      </div>

      {!timesheet && (
        <div className="glass-card border-dashed p-8 text-center text-sm text-inkSoft">{user.name} hasn&apos;t started this month&apos;s timesheet yet.</div>
      )}

      {timesheet && (
        <>
          <TimesheetGrid
            userId={userId}
            tasks={tasks}
            monthStartDate={month}
            initialEntries={timesheet.entries}
            readOnly
            workingDayOverrides={workingDayOverridesSet}
          />
          {timesheet.managerComment && (
            <div className="card p-4">
              <p className="text-sm font-semibold text-ink">Manager comment</p>
              <p className="mt-1 text-sm text-inkSoft">{timesheet.managerComment}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
