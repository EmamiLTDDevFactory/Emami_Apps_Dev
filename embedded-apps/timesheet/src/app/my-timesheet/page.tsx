'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, ArrowDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import TimesheetGrid from '../../components/TimesheetGrid';
import StatusBadge from '../../components/StatusBadge';
import MonthSelector from '../../components/MonthSelector';
import { addMonths, currentMonthStartIso, isOffDay, parseISODate, toISODate } from '../../utils/date';
import { expectedHoursToDate, getDisplayStatus, isReadOnly, wasEverRejected } from '../../utils/timesheet';
import { exportTimesheetToExcel } from '../../utils/exportTimesheet';

export default function MyTimesheetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const monthParam = searchParams.get('month');
  const { currentUser, getTimesheet, getAssignedTasks, projects, saveDraftEntries, submitForApproval, workingDayOverridesSet } = useApp();
  const { showToast } = useToast();
  const thisMonth = currentMonthStartIso();
  const [viewedMonth, setViewedMonth] = useState(monthParam || thisMonth);
  const [liveEntries, setLiveEntries] = useState<any[]>([]);
  const [liveTotal, setLiveTotal] = useState(0);
  const gridRef = useRef<{ loadEntries: (entries: any[]) => void }>(null);

  useEffect(() => {
    setViewedMonth(monthParam || thisMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthParam]);

  // Keeps the URL's own ?month= in sync with whatever's being viewed, so a refresh/bookmark/
  // shared link lands back on the same month instead of always resetting to the current one.
  function changeMonth(next: string) {
    setViewedMonth(next);
    router.replace(next === thisMonth ? '/my-timesheet/' : `/my-timesheet/?month=${next}`);
  }

  const timesheet = getTimesheet(currentUser.id, viewedMonth);
  const displayStatus = getDisplayStatus(timesheet || { status: 'Draft' });
  const readOnly = timesheet ? isReadOnly(timesheet) : false;

  const tasks = useMemo(() => {
    return getAssignedTasks(currentUser.id).map((t: any) => ({
      ...t,
      projectName: projects.find((p: any) => p.id === t.projectId)?.name || 'Unknown project',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, projects]);

  function handleAutosave(entries: any[]) {
    saveDraftEntries(currentUser.id, viewedMonth, entries);
  }

  function handleCopyLastMonth() {
    const prevMonth = toISODate(addMonths(parseISODate(viewedMonth), -1));
    const prevTimesheet = getTimesheet(currentUser.id, prevMonth);
    if (!prevTimesheet || prevTimesheet.entries.length === 0) {
      showToast('No entries found on last month to copy.', 'info');
      return;
    }
    // Shifting by day-of-month number (not weekday) means a working day last month can land on
    // a Saturday/Sunday this month. Off-day rows in TimesheetGrid always show "-" and ignore
    // whatever's in dayMap for that date, but the hours total has no such check - so an entry
    // silently landing on an off day would still count towards the total while being invisible
    // anywhere in the grid. Drop those instead of carrying them over.
    const shifted = prevTimesheet.entries
      .map((e: any) => {
        const day = parseISODate(e.date).getDate();
        const shiftedDate = parseISODate(viewedMonth);
        shiftedDate.setDate(Math.min(day, new Date(shiftedDate.getFullYear(), shiftedDate.getMonth() + 1, 0).getDate()));
        return { ...e, date: toISODate(shiftedDate), shiftedDate };
      })
      .filter((e: any) => !isOffDay(e.shiftedDate, workingDayOverridesSet))
      .map(({ shiftedDate, ...e }: any) => e);
    if (shifted.length === 0) {
      showToast('Last month’s entries all fall on non-working days this month.', 'info');
      return;
    }
    gridRef.current?.loadEntries(shifted);
    showToast('Copied last month’s entries into this month.', 'info');
  }

  function handleSubmit() {
    if (tasks.length === 0) {
      showToast('You have no tasks assigned. Ask your manager to assign tasks before submitting.', 'error');
      return;
    }
    submitForApproval(currentUser.id, viewedMonth, liveEntries);
    showToast('Timesheet submitted for approval.', 'success');
  }

  async function handleDownloadExcel() {
    const entries = readOnly ? timesheet?.entries || [] : liveEntries;
    try {
      await exportTimesheetToExcel({ entries, tasks, monthStartDate: viewedMonth, userName: currentUser.name, workingDayOverrides: workingDayOverridesSet });
      showToast('Timesheet downloaded.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to download timesheet.', 'error');
    }
  }

  const leaveDaysToDate = liveEntries.filter((e) => e.leaveType && parseISODate(e.date) <= new Date()).length;
  const expected = expectedHoursToDate(viewedMonth, new Date(), leaveDaysToDate, workingDayOverridesSet);
  const incomplete = liveTotal < expected;
  const noTasks = tasks.length === 0;
  const showSubmit = !readOnly;
  const rejected = timesheet?.status === 'Rejected';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My Timesheet</h1>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={displayStatus} />
            {timesheet && wasEverRejected(timesheet) && timesheet.status !== 'Rejected' && (
              <span className="text-xs text-inkSoft">previously revised after feedback</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!readOnly && (
            <button type="button" onClick={handleCopyLastMonth} className="btn-ghost">
              <Copy size={16} />
              Copy from last month
            </button>
          )}
          <button type="button" onClick={handleDownloadExcel} className="btn-primary">
            <ArrowDown size={16} />
            Download Excel
          </button>
          <MonthSelector monthStartDate={viewedMonth} onChange={changeMonth} maxMonthStartDate={thisMonth} />
        </div>
      </div>

      {rejected && timesheet?.managerComment && (
        <div className="rounded-xl border border-redBg bg-redBg p-4">
          <p className="text-sm font-semibold text-red">Changes requested by your manager</p>
          <p className="mt-1 text-sm text-red">{timesheet.managerComment}</p>
        </div>
      )}

      {!rejected && timesheet?.managerComment && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-ink">Manager comment</p>
          <p className="mt-1 text-sm text-inkSoft">{timesheet.managerComment}</p>
        </div>
      )}

      <TimesheetGrid
        ref={gridRef}
        userId={currentUser.id}
        tasks={tasks}
        monthStartDate={viewedMonth}
        initialEntries={timesheet?.entries || []}
        readOnly={readOnly}
        workingDayOverrides={workingDayOverridesSet}
        onEntriesChange={(entries, totals) => {
          setLiveEntries(entries);
          setLiveTotal(totals.month);
        }}
        onAutosave={handleAutosave}
      />

      {showSubmit && (
        <div className="flex flex-col items-start gap-2">
          <button type="button" onClick={handleSubmit} disabled={incomplete || noTasks} className="btn-primary">
            {rejected ? 'Resubmit for Approval' : 'Submit for Approval'}
          </button>
          {!noTasks && incomplete && (
            <p className="text-xs text-amber">
              You&apos;ve logged {liveTotal.toFixed(2).replace(/\.00$/, '')}h of {expected}h expected so far this month. Log the rest before
              submitting.
            </p>
          )}
        </div>
      )}

      {readOnly && <p className="text-xs text-inkSoft">This timesheet is {displayStatus.toLowerCase()} and can no longer be edited.</p>}
    </div>
  );
}
