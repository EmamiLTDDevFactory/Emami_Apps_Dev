'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, FolderKanban, ListTodo, Download, Trash2, Pencil, Check, X, Eye, Plus, CalendarCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast } from '../../context/ToastContext';
import BackButton from '../../components/BackButton';
import ConfirmDialog from '../../components/ConfirmDialog';
import LeaveDetailsModal from '../../components/LeaveDetailsModal';
import MonthSelector from '../../components/MonthSelector';
import { currentMonthStartIso, formatDayOrdinal, monthDays, nthWeekdayOfMonth, toISODate } from '../../utils/date';
import { exportTimesheetToExcel } from '../../utils/exportTimesheet';

const SATURDAY_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

export default function ManageTeamPage() {
  const {
    currentUser,
    directReports,
    projects,
    tasks,
    assignments,
    addProject,
    addTask,
    updateProject,
    deleteProject,
    updateTask,
    deleteTask,
    setUserAssignments,
    addDirectReport,
    fetchAddEmployeeCandidates,
    unassignedEmployees,
    claimEmployee,
    fetchPendingRequests,
    approveEmployee,
    rejectEmployee,
    deleteEmployee,
    getLeaveBalance,
    setLeaveAllocation,
    getTimesheet,
    getAssignedTasks,
    timesheets,
    workingDayOverrides,
    workingDayOverridesSet,
    addWorkingDayOverride,
    removeWorkingDayOverride,
  } = useApp();
  const { showToast } = useToast();
  const router = useRouter();

  // Defense in depth - the nav already hides this route from a non-manager, but the URL is
  // still reachable directly.
  useEffect(() => {
    if (currentUser.role !== 'manager') router.push('/');
  }, [currentUser.role, router]);

  const [newProjectName, setNewProjectName] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskProject, setNewTaskProject] = useState(projects[0]?.id || '');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  // Everyone the hub already grants Timesheet access to, who isn't a Timesheet user yet - the
  // pool "Add employee"'s live search filters client-side as the manager types. Fetched once on
  // mount rather than per-keystroke, since this list only changes when someone's Manage Access
  // grant changes or someone gets added - not something that needs re-checking on every letter.
  const [candidates, setCandidates] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [addingReport, setAddingReport] = useState(false);
  const [claimingUserId, setClaimingUserId] = useState<string | null>(null);
  // People who've specifically named this manager as theirs and are waiting on a yes/no -
  // distinct from unassignedEmployees below (nobody's picked those people at all yet).
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [decidingUserId, setDecidingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  // The direct report queued up for the permanent-delete confirm popup - null when it's closed.
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<any>(null);
  const [downloadingUserId, setDownloadingUserId] = useState<string | null>(null);
  const thisMonth = currentMonthStartIso();
  const [leaveDrafts, setLeaveDrafts] = useState<Record<string, string>>({}); // userId -> in-progress "allocated" input value
  const [savingLeaveUserId, setSavingLeaveUserId] = useState<string | null>(null);
  const [viewingLeaveUserId, setViewingLeaveUserId] = useState<string | null>(null);
  const [satMonth, setSatMonth] = useState(thisMonth);
  const [togglingDate, setTogglingDate] = useState<string | null>(null);

  // Every leave-tagged entry per direct report, newest first - mirrors Dashboard's
  // myLeaveEntries but keyed by userId since a manager can open this for any of their reports.
  const leaveEntriesByUser = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const t of timesheets) {
      if (!directReports.some((u: any) => u.id === t.userId)) continue;
      const leaves = t.entries.filter((e: any) => e.leaveType && e.leaveType !== 'Public Holiday');
      if (leaves.length === 0) continue;
      map[t.userId] = [...(map[t.userId] || []), ...leaves.map((e: any) => ({ ...e, monthStartDate: t.monthStartDate }))];
    }
    Object.values(map).forEach((entries) => entries.sort((a, b) => (a.date < b.date ? 1 : -1)));
    return map;
  }, [timesheets, directReports]);

  const viewingLeaveUser = directReports.find((u: any) => u.id === viewingLeaveUserId) || null;

  // Every Saturday in the browsed month, classified against the default 2nd/4th-off rule plus
  // whatever this manager has already flipped via workingDayOverrides.
  const satMonthSaturdays = useMemo(() => {
    return monthDays(satMonth)
      .filter((d: Date) => d.getDay() === 6)
      .map((d: Date) => {
        const iso = toISODate(d);
        const nth = nthWeekdayOfMonth(d);
        const defaultWorking = [1, 3, 5].includes(nth);
        const overridden = workingDayOverrides.includes(iso);
        return { iso, date: d, nth, defaultWorking, overridden, working: defaultWorking || overridden };
      });
  }, [satMonth, workingDayOverrides]);

  useEffect(() => {
    if (!projects.some((p: any) => p.id === newTaskProject)) {
      setNewTaskProject(projects[0]?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  useEffect(() => {
    fetchAddEmployeeCandidates()
      .then(setCandidates)
      .catch((err: Error) => console.error('Failed to load employee search candidates:', err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchPendingRequests()
      .then(setPendingRequests)
      .catch((err: Error) => console.error('Failed to load pending requests:', err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Matches on name OR email, case-insensitive - live-filtered client-side on every keystroke for
  // an instant type-ahead feel. Nothing shown at all until at least 2 characters are typed, so the
  // whole candidate list doesn't dump onto the screen the moment the box is focused.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return candidates.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)).slice(0, 8);
  }, [searchQuery, candidates]);

  function selectCandidate(candidate: any) {
    setSelectedCandidate(candidate);
    setSearchQuery(`${candidate.name} (${candidate.email})`);
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    // Editing the text after picking someone un-confirms that pick, rather than silently
    // submitting whoever was selected before against now-different-looking text.
    if (selectedCandidate) setSelectedCandidate(null);
  }

  function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    addProject(newProjectName.trim());
    setNewProjectName('');
    showToast('Project added.', 'success');
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskName.trim() || !newTaskProject) return;
    addTask(newTaskProject, newTaskName.trim());
    setNewTaskName('');
    showToast('Task added.', 'success');
  }

  function startEditProject(project: any) {
    setEditingProjectId(project.id);
    setDraftName(project.name);
  }

  function saveEditProject(id: string) {
    if (draftName.trim()) updateProject(id, draftName.trim());
    setEditingProjectId(null);
  }

  function handleDeleteProject(project: any) {
    if (!window.confirm(`Delete "${project.name}"? Its tasks will be removed and unassigned from your team.`)) return;
    deleteProject(project.id);
    if (editingProjectId === project.id) setEditingProjectId(null);
    showToast('Project deleted.', 'success');
  }

  function startEditTask(task: any) {
    setEditingTaskId(task.id);
    setDraftName(task.name);
  }

  function saveEditTask(id: string) {
    if (draftName.trim()) updateTask(id, draftName.trim());
    setEditingTaskId(null);
  }

  function handleDeleteTask(task: any) {
    if (!window.confirm(`Delete "${task.name}"?`)) return;
    deleteTask(task.id);
    if (editingTaskId === task.id) setEditingTaskId(null);
    showToast('Task deleted.', 'success');
  }

  function toggleAssignment(userId: string, taskId: string) {
    const current = assignments[userId] || [];
    const next = current.includes(taskId) ? current.filter((id: string) => id !== taskId) : [...current, taskId];
    setUserAssignments(userId, next);
  }

  async function handleSaveLeaveAllocation(userId: string, currentAllocated: number) {
    const draft = leaveDrafts[userId];
    if (draft === undefined) return;
    const allocated = Number(draft);
    setLeaveDrafts((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    if (!Number.isFinite(allocated) || allocated < 0 || allocated === currentAllocated) return;
    setSavingLeaveUserId(userId);
    try {
      await setLeaveAllocation(userId, allocated);
      showToast('Leave balance updated.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update leave balance.', 'error');
    } finally {
      setSavingLeaveUserId(null);
    }
  }

  // A search result with an `id` is an existing Timesheet user with no manager yet (claim them,
  // don't create a duplicate) - one without an `id` has never opened Timesheet before (create
  // them fresh). See server/src/routes/users.js's GET /candidates for where that distinction
  // comes from.
  async function handleAddReport(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCandidate) return;
    setAddingReport(true);
    try {
      if (selectedCandidate.id) {
        await claimEmployee(selectedCandidate.id);
      } else {
        await addDirectReport(selectedCandidate.name, selectedCandidate.email);
      }
      setCandidates((c) => c.filter((cand) => cand.email !== selectedCandidate.email));
      setSearchQuery('');
      setSelectedCandidate(null);
      showToast('Employee added.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to add employee.', 'error');
    } finally {
      setAddingReport(false);
    }
  }

  // Claims someone who already exists (synced from a hub sign-in with no manager yet) onto this
  // manager's team - self-service, first click wins. A 409 means another manager just claimed
  // them first; refetch-on-refresh isn't needed since the list is already scoped to whoever's
  // still unassigned as of the last load.
  async function handleClaim(userId: string) {
    setClaimingUserId(userId);
    try {
      await claimEmployee(userId);
      showToast('Employee added to your team.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to add employee - someone else may have already claimed them.', 'error');
    } finally {
      setClaimingUserId(null);
    }
  }

  async function handleApprove(userId: string) {
    setDecidingUserId(userId);
    try {
      await approveEmployee(userId);
      setPendingRequests((list) => list.filter((u) => u.id !== userId));
      showToast('Employee approved.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to approve employee.', 'error');
    } finally {
      setDecidingUserId(null);
    }
  }

  async function handleReject(userId: string) {
    setDecidingUserId(userId);
    try {
      await rejectEmployee(userId);
      setPendingRequests((list) => list.filter((u) => u.id !== userId));
      showToast('Request declined.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to decline request.', 'error');
    } finally {
      setDecidingUserId(null);
    }
  }

  async function handleDownloadExcel(user: any) {
    setDownloadingUserId(user.id);
    try {
      const timesheet = getTimesheet(user.id, thisMonth);
      const userTasks = getAssignedTasks(user.id).map((t: any) => ({
        ...t,
        projectName: projects.find((p: any) => p.id === t.projectId)?.name || 'Unknown project',
      }));
      await exportTimesheetToExcel({ entries: timesheet?.entries || [], tasks: userTasks, monthStartDate: thisMonth, userName: user.name, workingDayOverrides: workingDayOverridesSet });
      showToast('Timesheet downloaded.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to download timesheet.', 'error');
    } finally {
      setDownloadingUserId(null);
    }
  }

  async function handleToggleSaturday(iso: string, makeWorking: boolean) {
    setTogglingDate(iso);
    try {
      if (makeWorking) {
        await addWorkingDayOverride(iso);
        showToast('Marked as a working day for your team.', 'success');
      } else {
        await removeWorkingDayOverride(iso);
        showToast('Reverted to a non-working day.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update that Saturday.', 'error');
    } finally {
      setTogglingDate(null);
    }
  }

  async function handleConfirmDeleteEmployee() {
    const user = confirmDeleteUser;
    if (!user) return;
    setDeletingUserId(user.id);
    try {
      await deleteEmployee(user.id);
      showToast('Employee deleted.', 'success');
      setConfirmDeleteUser(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete employee.', 'error');
    } finally {
      setDeletingUserId(null);
    }
  }

  if (currentUser.role !== 'manager') return null;

  return (
    <div className="space-y-6">
      <BackButton onClick={() => router.push('/')} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Manage Team</h1>
        <p className="mt-1 text-sm text-inkSoft">Direct reports and project/task setup.</p>
      </div>

      {/* 1. Direct reports & task assignments (also folds in: 2. add employee, 3. pending
          requests, 4. unassigned/claim, 5. per-employee task assignment, 6. leave-quota editing,
          7. Excel download, 8. employee deletion) */}
      <section className="glass-card p-6">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
          <Users size={18} className="text-rust" />
          Direct reports &amp; task assignments
        </h2>

        <form onSubmit={handleAddReport} className="mb-5 flex flex-wrap items-start gap-2 border-b border-glassBorder pb-5">
          <div className="relative min-w-[260px] flex-1">
            <label htmlFor="employee-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-inkSoft">
              Search by name or email
            </label>
            <input
              id="employee-search"
              type="text"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Start typing a name or email…"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust"
            />
            {!selectedCandidate && searchQuery.trim().length >= 2 && (
              <ul className="glass-panel absolute z-10 mt-1 max-h-56 w-full overflow-y-auto">
                {searchResults.length > 0 ? (
                  searchResults.map((candidate) => (
                    <li key={candidate.email}>
                      <button
                        type="button"
                        onClick={() => selectCandidate(candidate)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-white/60 focus:outline-none focus-visible:bg-white/60"
                      >
                        <span className="font-medium text-ink">{candidate.name}</span>
                        <span className="block text-xs text-inkSoft">{candidate.email}</span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-xs text-inkSoft">No matching people found. They need Timesheet access granted in Manage Access first.</li>
                )}
              </ul>
            )}
          </div>
          <button type="submit" disabled={addingReport || !selectedCandidate} className="btn-primary self-end">
            {addingReport ? 'Adding…' : 'Add employee'}
          </button>
        </form>

        {pendingRequests.length > 0 && (
          <div className="mb-5 border-b border-glassBorder pb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkSoft">Requests waiting for your approval</h3>
            <p className="mb-3 text-xs text-inkSoft">These people named you as their reporting manager and can&apos;t log any hours until you approve them.</p>
            <ul className="space-y-2">
              {pendingRequests.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{user.name}</p>
                    <p className="text-xs text-inkSoft">{user.email}</p>
                  </div>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleReject(user.id)}
                      disabled={decidingUserId === user.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-red/30 bg-redBg px-3 py-1.5 text-xs font-semibold text-red hover:bg-red/10 disabled:opacity-50"
                    >
                      <X size={13} />
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(user.id)}
                      disabled={decidingUserId === user.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-green/90 disabled:opacity-50"
                    >
                      <Check size={13} />
                      {decidingUserId === user.id ? 'Working…' : 'Approve'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {unassignedEmployees.length > 0 && (
          <div className="mb-5 border-b border-glassBorder pb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkSoft">Waiting to be added to a team</h3>
            <p className="mb-3 text-xs text-inkSoft">These people already have Timesheet access but aren&apos;t on any manager&apos;s team yet.</p>
            <ul className="space-y-2">
              {unassignedEmployees.map((user: any) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{user.name}</p>
                    <p className="text-xs text-inkSoft">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaim(user.id)}
                    disabled={claimingUserId === user.id}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    {claimingUserId === user.id ? 'Adding…' : 'Add to my team'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-5">
          {directReports.map((user: any) => (
            <div key={user.id} className="card p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{user.name}</p>
                  <p className="text-xs text-inkSoft">{user.email}</p>
                </div>
                <span className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleDownloadExcel(user)}
                    disabled={downloadingUserId === user.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-teal/30 bg-tealBg px-3 py-1.5 text-xs font-medium text-teal hover:bg-teal/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50"
                  >
                    <Download size={13} />
                    {downloadingUserId === user.id ? 'Preparing…' : 'Download Excel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteUser(user)}
                    disabled={deletingUserId === user.id}
                    className="btn-danger px-3 py-1.5 text-xs"
                  >
                    <Trash2 size={13} />
                    {deletingUserId === user.id ? 'Deleting…' : 'Delete employee'}
                  </button>
                </span>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-inkSoft">Assigned tasks</legend>
                <div className="flex flex-wrap gap-2">
                  {tasks.map((task: any) => {
                    const project = projects.find((p: any) => p.id === task.projectId);
                    const checked = (assignments[user.id] || []).includes(task.id);
                    return (
                      <label
                        key={task.id}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                          checked ? 'border-rust/40 bg-glassRust text-rust' : 'border-border text-inkSoft hover:bg-appBg'
                        }`}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleAssignment(user.id, task.id)} className="h-3.5 w-3.5 rounded border-border text-rust focus:ring-rust" />
                        {project?.name} · {task.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="mt-4 border-t border-border pt-4">
                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-inkSoft">
                  Leave balance <span className="font-normal normal-case text-inkSoft">({new Date().getFullYear()})</span>
                </legend>
                {(() => {
                  const { balance, allocated, used } = getLeaveBalance(user.id);
                  const saving = savingLeaveUserId === user.id;
                  const draftValue = leaveDrafts[user.id] ?? String(allocated);
                  return (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex items-center gap-1.5 text-inkSoft">
                        Yearly quota
                        <input
                          type="number"
                          min="0"
                          value={draftValue}
                          disabled={saving}
                          onChange={(e) => setLeaveDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                          onBlur={() => handleSaveLeaveAllocation(user.id, allocated)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                          aria-label={`Yearly leave days allocated to ${user.name}`}
                          className="w-16 rounded-md border border-border bg-white px-2 py-1 text-center text-xs text-ink focus:outline-none focus:ring-2 focus:ring-rust disabled:opacity-50"
                        />
                        days
                      </label>
                      <span className="text-inkSoft">·</span>
                      <span className="text-inkSoft">{used} taken</span>
                      <span className="text-inkSoft">·</span>
                      <span className={`font-semibold ${balance < 0 ? 'text-red' : 'text-ink'}`}>
                        {balance} {Math.abs(balance) === 1 ? 'day' : 'days'} remaining
                      </span>
                      <span className="text-inkSoft">·</span>
                      <button
                        type="button"
                        onClick={() => setViewingLeaveUserId(user.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-blue/30 bg-blueBg px-2.5 py-1 text-xs font-medium text-blue hover:bg-blue/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                      >
                        <Eye size={12} />
                        Leave details
                      </button>
                    </div>
                  );
                })()}
              </fieldset>
            </div>
          ))}
          {directReports.length === 0 && <p className="text-sm text-inkSoft">No direct reports.</p>}
        </div>
      </section>

      {/* 11. Working Saturdays - override the default 2nd/4th-off rule for this manager's team */}
      <section className="glass-card p-6">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink">
          <CalendarCheck size={18} className="text-rust" />
          Working Saturdays
        </h2>
        <p className="mb-4 text-xs text-inkSoft">
          By default the 2nd and 4th Saturday of each month are non-working days. Flip a specific Saturday to working here when your team
          needs it - employees will see it as a normal working day, and it applies to you and every direct report.
        </p>
        <div className="mb-3">
          <MonthSelector monthStartDate={satMonth} onChange={setSatMonth} />
        </div>
        <ul className="space-y-2">
          {satMonthSaturdays.map(({ iso, date, nth, defaultWorking, overridden, working }: any) => (
            <li key={iso} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <p className="text-sm font-medium text-ink">
                {formatDayOrdinal(date)} <span className="font-normal text-inkSoft">({SATURDAY_ORDINALS[nth - 1]} Saturday)</span>
              </p>
              <span className="flex items-center gap-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${working ? 'bg-blueBg text-blue' : 'bg-border text-inkSoft'}`}>
                  {working ? (overridden ? 'Working (override)' : 'Working') : 'Off'}
                </span>
                {!defaultWorking && (
                  <button
                    type="button"
                    onClick={() => handleToggleSaturday(iso, !overridden)}
                    disabled={togglingDate === iso}
                    className={`px-3 py-1.5 text-xs ${overridden ? 'btn-ghost' : 'btn-primary'}`}
                  >
                    {togglingDate === iso ? 'Saving…' : overridden ? 'Revert to Off' : 'Make working day'}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 9. Projects CRUD, 10. Tasks CRUD (team-wide, not per-manager) */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="glass-card p-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
            <FolderKanban size={18} className="text-rust" />
            Projects
          </h2>
          <ul className="mb-4 space-y-2">
            {projects.map((project: any) => (
              <li key={project.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0">
                {editingProjectId === project.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEditProject(project.id)}
                    onBlur={() => saveEditProject(project.id)}
                    className="flex-1 rounded-md border border-border bg-white px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust"
                  />
                ) : (
                  <span className="text-ink">{project.name}</span>
                )}
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (editingProjectId === project.id ? saveEditProject(project.id) : startEditProject(project))}
                    className="inline-flex items-center gap-1 rounded-full border border-blue/30 bg-blueBg px-2.5 py-1 text-xs font-medium text-blue hover:bg-blue/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                  >
                    <Pencil size={11} />
                    {editingProjectId === project.id ? 'Save' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(project)}
                    className="inline-flex items-center gap-1 rounded-full border border-red/30 bg-redBg px-2.5 py-1 text-xs font-medium text-red hover:bg-red/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddProject} className="flex gap-2">
            <label htmlFor="new-project" className="sr-only">
              New project name
            </label>
            <input
              id="new-project"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="New project name"
              className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust"
            />
            <button type="submit" className="btn-primary">
              <Plus size={14} />
              Add
            </button>
          </form>
        </section>

        <section className="glass-card p-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
            <ListTodo size={18} className="text-rust" />
            Tasks
          </h2>
          <ul className="mb-4 max-h-64 space-y-2 overflow-y-auto">
            {tasks.map((task: any) => {
              const project = projects.find((p: any) => p.id === task.projectId);
              return (
                <li key={task.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0">
                  {editingTaskId === task.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEditTask(task.id)}
                      onBlur={() => saveEditTask(task.id)}
                      className="flex-1 rounded-md border border-border bg-white px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust"
                    />
                  ) : (
                    <span className="text-ink">
                      <span className="text-inkSoft">{project?.name}</span> · {task.name}
                    </span>
                  )}
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => (editingTaskId === task.id ? saveEditTask(task.id) : startEditTask(task))}
                      className="inline-flex items-center gap-1 rounded-full border border-blue/30 bg-blueBg px-2.5 py-1 text-xs font-medium text-blue hover:bg-blue/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                    >
                      <Pencil size={11} />
                      {editingTaskId === task.id ? 'Save' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(task)}
                      className="inline-flex items-center gap-1 rounded-full border border-red/30 bg-redBg px-2.5 py-1 text-xs font-medium text-red hover:bg-red/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red"
                    >
                      <Trash2 size={11} />
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <form onSubmit={handleAddTask} className="flex flex-wrap gap-2">
            <label htmlFor="new-task-project" className="sr-only">
              Project
            </label>
            <select
              id="new-task-project"
              value={newTaskProject}
              onChange={(e) => setNewTaskProject(e.target.value)}
              className="rounded-lg border border-border bg-white px-2 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust"
            >
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label htmlFor="new-task-name" className="sr-only">
              New task name
            </label>
            <input
              id="new-task-name"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              placeholder="New task name"
              className="min-w-[8rem] flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rust"
            />
            <button type="submit" className="btn-primary">
              <Plus size={14} />
              Add
            </button>
          </form>
        </section>
      </div>

      {viewingLeaveUser && (
        <LeaveDetailsModal
          title={`Leave balance - ${viewingLeaveUser.name}`}
          subtitle={`${new Date().getFullYear()} - every leave day logged`}
          balance={getLeaveBalance(viewingLeaveUser.id)}
          entries={leaveEntriesByUser[viewingLeaveUser.id] || []}
          onClose={() => setViewingLeaveUserId(null)}
        />
      )}

      {confirmDeleteUser && (
        <ConfirmDialog
          title="Permanently delete employee?"
          message={`This erases ${confirmDeleteUser.name}'s account and ALL of their data - timesheets, leave history, and task assignments. This cannot be undone.`}
          confirmLabel="Delete employee"
          danger
          busy={deletingUserId === confirmDeleteUser.id}
          onConfirm={handleConfirmDeleteEmployee}
          onCancel={() => setConfirmDeleteUser(null)}
        />
      )}
    </div>
  );
}
