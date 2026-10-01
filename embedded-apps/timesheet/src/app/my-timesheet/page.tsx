'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import TimesheetGrid from '../../components/TimesheetGrid';
import StatusBadge from '../../components/StatusBadge';
import MonthSelector from '../../components/MonthSelector';
import { addMonths, currentMonthStartIso, formatDayOrdinal, parseISODate, toISODate } from '../../utils/date';
import { expectedHoursToDate, getDisplayStatus, getSubmitWindow, isReadOnly, wasEverRejected } from '../../utils/timesheet';
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
  const statusReadOnly = timesheet ? isReadOnly(timesheet) : false;
  const rejected = timesheet?.status === 'Rejected';
  // A month can be edited and submitted during the month itself and until the 5th of the month
  // after (e.g. September's timesheet until 5 October); after that it's read-only. A Rejected
  // timesheet stays editable and can always be resubmitted, since the manager may send it back
  // after the window has closed.
  const submitWindow = getSubmitWindow(viewedMonth);
  const windowClosed = !rejected && submitWindow.closed;
  const readOnly = statusReadOnly || windowClosed;

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

  const noTasks = tasks.length === 0;
  // Last month keeps showing a (disabled) button once its window closes, so it's clear why it
  // can't be submitted; older months don't show it at all.
  const lastMonth = toISODate(addMonths(parseISODate(thisMonth), -1));
  // The current month can always be submitted; an earlier month still needs assigned tasks and
  // an open submission window.
  const isCurrentMonth = viewedMonth === thisMonth;
  const submitDisabled = !isCurrentMonth && (noTasks || windowClosed);
  const showSubmit = !statusReadOnly && (rejected || viewedMonth === thisMonth || viewedMonth === lastMonth);

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
          <button type="button" onClick={handleSubmit} disabled={submitDisabled} className="btn-primary">
            {rejected ? 'Resubmit for Approval' : 'Submit for Approval'}
          </button>
          {!windowClosed && !rejected && (
            <p className="text-xs text-inkSoft">You can submit this timesheet until {formatDayOrdinal(submitWindow.closesOn)}.</p>
          )}
        </div>
      )}

      {statusReadOnly && <p className="text-xs text-inkSoft">This timesheet is {displayStatus.toLowerCase()} and can no longer be edited.</p>}
      {!statusReadOnly && windowClosed && (
        <p className="text-xs text-amber">
          This timesheet&apos;s submission window closed on {formatDayOrdinal(submitWindow.closesOn)} and it can no longer be edited.
        </p>
      )}
    </div>
  );
}
