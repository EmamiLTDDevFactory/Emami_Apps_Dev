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

// A small ticking "kiosk clock" + today's punch status, purely presentational - the actual
// Clock In/Out buttons live in TimesheetGrid's today row, which is what actually writes this
// data. Reads straight off liveEntries so it never drifts from what's about to be saved.
function TodayStatusCard({ entry }: { entry: any }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeLabel = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  let statusText = 'Not clocked in yet';
  let statusDot = 'bg-inkSoft';
  if (entry?.inTime && !entry.outTime) {
    const [h, m] = entry.inTime.split(':').map(Number);
    const clockedInAt = new Date(now);
    clockedInAt.setHours(h, m, 0, 0);
    const elapsedMin = Math.max(0, Math.round((now.getTime() - clockedInAt.getTime()) / 60000));
    const eh = Math.floor(elapsedMin / 60);
    const em = elapsedMin % 60;
    statusText = `Clocked in at ${entry.inTime}${entry.inLocation ? ` · ${entry.inLocation}` : ''} — ${eh}h ${em}m so far`;
    statusDot = 'bg-green';
  } else if (entry?.inTime && entry.outTime) {
    statusText = `Completed ${entry.inTime}–${entry.outTime}${entry.outLocation ? ` · ${entry.outLocation}` : ''}`;
    statusDot = 'bg-rust';
  }

  return (
    <div className="glass-card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-inkSoft">{dateLabel}</p>
        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-ink">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
          {statusText}
        </p>
      </div>
      <div className="font-mono text-2xl font-semibold tabular-nums text-ink">{timeLabel}</div>
    </div>
  );
}

export default function MyTimesheetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const monthParam = searchParams.get('month');
  const { currentUser, getTimesheet, getAssignedTasks, projects, saveDraftEntries, submitForApproval } = useApp();
  const { showToast } = useToast();
  const thisMonth = currentMonthStartIso();
  const todayIso = toISODate(new Date());
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
      .filter((e: any) => !isOffDay(e.shiftedDate))
      .map(({ shiftedDate, ...e }: any) => e);
    if (shifted.length === 0) {
      showToast('Last month’s entries all fall on non-working days this month.', 'info');
      return;
    }
    gridRef.current?.loadEntries(shifted);
    showToast('Copied last month’s entries into this month.', 'info');
  }

  function handleSubmit() {
    submitForApproval(currentUser.id, viewedMonth, liveEntries);
    showToast('Timesheet submitted for approval.', 'success');
  }

  async function handleDownloadExcel() {
    const entries = readOnly ? timesheet?.entries || [] : liveEntries;
    try {
      await exportTimesheetToExcel({ entries, tasks, monthStartDate: viewedMonth, userName: currentUser.name });
      showToast('Timesheet downloaded.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to download timesheet.', 'error');
    }
  }

  const leaveDaysToDate = liveEntries.filter((e) => e.leaveType && parseISODate(e.date) <= new Date()).length;
  const expected = expectedHoursToDate(viewedMonth, new Date(), leaveDaysToDate);
  const incomplete = liveTotal < expected;
  const showSubmit = !readOnly;
  const rejected = timesheet?.status === 'Rejected';
  const todayEntry = liveEntries.find((e) => e.date === todayIso && !e.leaveType);
  const showTodayCard = !readOnly && viewedMonth === thisMonth;

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
        <MonthSelector monthStartDate={viewedMonth} onChange={changeMonth} maxMonthStartDate={thisMonth} />
      </div>

      {showTodayCard && <TodayStatusCard entry={todayEntry} />}

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

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <button type="button" onClick={handleCopyLastMonth} className="btn-ghost">
            <Copy size={16} />
            Copy from last month
          </button>
        )}
        <button type="button" onClick={handleDownloadExcel} className="btn-primary ml-auto">
          <ArrowDown size={16} />
          Download Excel
        </button>
      </div>

      <TimesheetGrid
        ref={gridRef}
        userId={currentUser.id}
        tasks={tasks}
        monthStartDate={viewedMonth}
        initialEntries={timesheet?.entries || []}
        readOnly={readOnly}
        onEntriesChange={(entries, totals) => {
          setLiveEntries(entries);
          setLiveTotal(totals.month);
        }}
        onAutosave={handleAutosave}
      />

      {showSubmit && (
        <div className="flex flex-col items-start gap-2">
          <button type="button" onClick={handleSubmit} disabled={incomplete} className="btn-primary">
            {rejected ? 'Resubmit for Approval' : 'Submit for Approval'}
          </button>
          {incomplete && (
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
