'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import StatusBadge from '../../components/StatusBadge';
import TimesheetGrid from '../../components/TimesheetGrid';
import ApprovalQueueTable from '../../components/ApprovalQueueTable';
import BackButton from '../../components/BackButton';
import MonthSelector from '../../components/MonthSelector';
import { currentMonthStartIso, formatDayNum, formatMonthLabel, hoursBetween, parseISODate } from '../../utils/date';
import { computeTotals, expectedMonthlyHours, getDisplayStatus, isOverdue, MAX_HOURS_PER_DAY } from '../../utils/timesheet';
import { exportTimesheetToExcel } from '../../utils/exportTimesheet';

export default function TeamApprovalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reviewUserId = searchParams.get('reviewUserId');
  const reviewMonth = searchParams.get('reviewMonth');
  const { currentUser } = useApp();

  // Defense in depth - the sidepane already hides this link from non-manager roles, but the
  // route is still reachable by a typed URL.
  useEffect(() => {
    if (currentUser.role !== 'manager') router.push('/');
  }, [currentUser.role, router]);
  if (currentUser.role !== 'manager') return null;

  if (reviewUserId && reviewMonth) {
    return <ApprovalDetail userId={reviewUserId} month={reviewMonth} />;
  }
  return <ApprovalList />;
}

function ApprovalList() {
  const router = useRouter();
  const { directReports, getTimesheet, teamSettings, bulkApprove, workingDayOverridesSet } = useApp();
  const thisMonth = currentMonthStartIso();
  const [month, setMonth] = useState(thisMonth);
  const { showToast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);

  const expected = expectedMonthlyHours(month, workingDayOverridesSet);

  const rows = directReports.map((user: any) => {
    const timesheet = getTimesheet(user.id, month);
    const overdue = isOverdue(timesheet || { status: 'Draft', monthStartDate: month }, teamSettings);
    const displayStatus = overdue ? 'Overdue' : getDisplayStatus(timesheet || { status: 'Draft' });
    const { monthTotal, perDay } = computeTotals(timesheet?.entries || [], month);
    const actionable = timesheet && (timesheet.status === 'Submitted' || timesheet.status === 'Resubmitted');
    const straightforward = actionable && monthTotal >= expected && Object.values(perDay).every((h: any) => h <= MAX_HOURS_PER_DAY);
    const submitEvent = timesheet ? [...timesheet.history].reverse().find((h: any) => h.status === 'Submitted' || h.status === 'Resubmitted') : null;
    return {
      key: user.id,
      user,
      timesheet,
      displayStatus,
      submittedDate: submitEvent?.date || null,
      monthTotal,
      canBulkApprove: !!straightforward,
    };
  });

  function toggleSelect(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function toggleSelectAll(keys: string[]) {
    setSelected((prev) => (keys.every((k) => prev.includes(k)) ? prev.filter((k) => !keys.includes(k)) : Array.from(new Set([...prev, ...keys]))));
  }

  function handleBulkApprove() {
    const ids = rows.filter((r: any) => selected.includes(r.key) && r.timesheet).map((r: any) => r.timesheet.id);
    bulkApprove(ids);
    showToast(`Approved ${ids.length} timesheet${ids.length === 1 ? '' : 's'}.`, 'success');
    setSelected([]);
  }

  return (
    <div className="space-y-5">
      <BackButton onClick={() => router.push('/')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Team Approvals</h1>
          <p className="mt-1 text-sm text-inkSoft">{formatMonthLabel(month)} - direct report submissions</p>
        </div>
        <MonthSelector monthStartDate={month} onChange={setMonth} maxMonthStartDate={thisMonth} />
      </div>
      <ApprovalQueueTable
        rows={rows}
        selectedIds={selected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onOpenRow={(row: any) => router.push(`/team-approvals/?reviewUserId=${row.user.id}&reviewMonth=${month}`)}
        onBulkApprove={handleBulkApprove}
      />
    </div>
  );
}

function ApprovalDetail({ userId, month }: { userId: string; month: string }) {
  const router = useRouter();
  const { getUserById, getTimesheet, getAssignedTasks, projects, approveTimesheet, rejectTimesheet, saveManagerTimes, saveManagerTasks, workingDayOverridesSet } = useApp();
  const { showToast } = useToast();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const user = getUserById(userId);
  const timesheet = getTimesheet(userId, month);
  const displayStatus = getDisplayStatus(timesheet || { status: 'Draft' });
  const actionable = timesheet && (timesheet.status === 'Submitted' || timesheet.status === 'Resubmitted');

  const tasks = useMemo(
    () =>
      getAssignedTasks(userId).map((t: any) => ({
        ...t,
        projectName: projects.find((p: any) => p.id === t.projectId)?.name || 'Unknown project',
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, projects]
  );

  // The manager can correct Clock In / Clock Out (nothing else) while the timesheet waits for
  // approval. `gridEntries` is the grid's live state; diffing it against what was submitted gives
  // the days whose times changed.
  const [gridEntries, setGridEntries] = useState<any[] | null>(null);
  const [savingTimes, setSavingTimes] = useState(false);

  const changedTimes = useMemo(() => {
    if (!timesheet || !gridEntries) return {};
    const timesByDate = (entries: any[]) => {
      const map: Record<string, { inTime: string; outTime: string }> = {};
      entries.forEach((e) => {
        if (!e.leaveType && !map[e.date]) map[e.date] = { inTime: e.inTime || '', outTime: e.outTime || '' };
      });
      return map;
    };
    const before = timesByDate(timesheet.entries);
    const after = timesByDate(gridEntries);
    const changed: Record<string, { inTime: string; outTime: string }> = {};
    new Set([...Object.keys(before), ...Object.keys(after)]).forEach((date) => {
      const b = before[date] || { inTime: '', outTime: '' };
      const a = after[date] || { inTime: '', outTime: '' };
      if (a.inTime !== b.inTime || a.outTime !== b.outTime) changed[date] = a;
    });
    return changed;
  }, [timesheet, gridEntries]);
  const timeChangedCount = Object.keys(changedTimes).length;

  // Task / Task Description edits on the employee's existing lines, keyed by entry id. A line the
  // grid no longer emits (manager emptied both fields) counts as cleared.
  const changedTasks = useMemo(() => {
    if (!timesheet || !gridEntries) return {};
    const after = new Map(gridEntries.filter((e) => !e.leaveType).map((e) => [e.id, e]));
    const changed: Record<string, { taskId: string; note: string }> = {};
    timesheet.entries.forEach((b: any) => {
      if (b.leaveType) return;
      const a = after.get(b.id);
      const next = { taskId: a?.taskId || '', note: (a?.note || '').trim() };
      if (next.taskId !== (b.taskId || '') || next.note !== (b.note || '')) changed[b.id] = next;
    });
    return changed;
  }, [timesheet, gridEntries]);
  const taskChangedCount = Object.keys(changedTasks).length;
  const changedCount = timeChangedCount + taskChangedCount;

  // Saves pending time / task edits; returns false (with the reason shown) if they couldn't be saved.
  async function saveTimes() {
    if (changedCount === 0) return true;
    const invalid = Object.entries(changedTimes).find(([, t]) => t.inTime && t.outTime && hoursBetween(t.inTime, t.outTime) === 0);
    if (invalid) {
      showToast(`Out time must be after In time on ${formatDayNum(parseISODate(invalid[0]))}.`, 'error');
      return false;
    }
    setSavingTimes(true);
    try {
      if (timeChangedCount > 0) await saveManagerTimes(timesheet.id, changedTimes);
      if (taskChangedCount > 0) await saveManagerTasks(timesheet.id, changedTasks);
      showToast(`Saved your changes (${changedCount}).`, 'success');
      return true;
    } catch (err: any) {
      showToast(err.message || 'Failed to save time changes.', 'error');
      return false;
    } finally {
      setSavingTimes(false);
    }
  }

  async function handleApprove() {
    if (!(await saveTimes())) return;
    approveTimesheet(timesheet.id, comment);
    showToast(`Approved ${user.name}'s timesheet.`, 'success');
    router.push('/team-approvals/');
  }

  async function handleReject() {
    if (!comment.trim()) {
      setError('A comment is required to reject a timesheet.');
      return;
    }
    if (!(await saveTimes())) return;
    rejectTimesheet(timesheet.id, comment);
    showToast(`Rejected ${user.name}'s timesheet.`, 'success');
    router.push('/team-approvals/');
  }

  async function handleDownloadExcel() {
    try {
      await exportTimesheetToExcel({ entries: timesheet.entries, tasks, monthStartDate: month, userName: user.name, workingDayOverrides: workingDayOverridesSet });
      showToast('Timesheet downloaded.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to download timesheet.', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push('/team-approvals/')}
        className="inline-flex items-center gap-1 text-sm font-medium text-teal hover:text-teal/80 focus:outline-none focus-visible:underline"
      >
        <ArrowLeft size={14} />
        Back to Team Approvals
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{user.name}&apos;s Timesheet</h1>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={displayStatus} />
            <span className="text-sm text-inkSoft">{formatMonthLabel(month)}</span>
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
          {actionable && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber/40 bg-amberBg px-4 py-3">
              <p className="text-sm text-ink">
                You can correct <span className="font-semibold">Clock In</span>, <span className="font-semibold">Clock Out</span>, <span className="font-semibold">Task</span> and{' '}
                <span className="font-semibold">Task Description</span> before approving. Hours update automatically.
                {changedCount > 0 && (
                  <span className="ml-1 font-semibold text-amber">
                    {changedCount} change{changedCount === 1 ? '' : 's'} - not saved yet.
                  </span>
                )}
              </p>
              <button type="button" onClick={saveTimes} disabled={changedCount === 0 || savingTimes} className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50">
                {savingTimes ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}

          <TimesheetGrid
            userId={userId}
            tasks={tasks}
            monthStartDate={month}
            initialEntries={timesheet.entries}
            readOnly
            timesEditable={!!actionable}
            tasksEditable={!!actionable}
            onEntriesChange={(entries) => setGridEntries(entries)}
            workingDayOverrides={workingDayOverridesSet}
          />

          {actionable && (
            <div className="glass-card space-y-3 p-5">
              <label htmlFor="manager-comment" className="block text-sm font-semibold text-ink">
                Comment <span className="font-normal text-inkSoft">(required to reject)</span>
              </label>
              <textarea
                id="manager-comment"
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  if (error) setError('');
                }}
                rows={3}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust"
                placeholder="Add a note for this review…"
              />
              {error && <p className="text-sm text-red">{error}</p>}
              <div className="flex flex-wrap gap-3 pt-1">
                <button type="button" onClick={handleApprove} disabled={savingTimes} className="btn-success disabled:opacity-50">
                  Approve
                </button>
                <button type="button" onClick={handleReject} className="btn-danger">
                  Reject
                </button>
              </div>
            </div>
          )}

          {!actionable && timesheet.managerComment && (
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
