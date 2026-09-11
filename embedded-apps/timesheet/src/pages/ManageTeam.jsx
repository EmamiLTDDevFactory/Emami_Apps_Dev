import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import BackButton from '../components/BackButton'
import LeaveDetailsModal from '../components/LeaveDetailsModal'
import { currentMonthStartIso } from '../utils/date'
import { exportTimesheetToExcel } from '../utils/exportTimesheet'

export default function ManageTeam({ navigate }) {
  const {
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
    removeDirectReport,
    getLeaveBalance,
    setLeaveAllocation,
    getTimesheet,
    getAssignedTasks,
    timesheets,
  } = useApp()
  const { isMinimal } = useTheme()
  const { showToast } = useToast()

  const inputFocus = isMinimal
    ? 'focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
    : 'focus:ring-2 focus:ring-orange-500 focus:border-orange-500'
  const ringOnly = isMinimal ? 'focus:ring-2 focus:ring-indigo-500' : 'focus:ring-2 focus:ring-orange-500'
  const solidBtn = isMinimal ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-orange-600 hover:bg-orange-500'
  const gradientBtn = isMinimal
    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 focus-visible:ring-indigo-500'
    : 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 focus-visible:ring-orange-500'
  const linkColor = isMinimal
    ? 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300'
    : 'text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300'
  const chipActive = isMinimal
    ? 'border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
    : 'border-orange-300 dark:border-orange-500/40 bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300'
  const checkboxColor = isMinimal ? 'text-indigo-600 focus:ring-indigo-500' : 'text-orange-600 focus:ring-orange-500'

  const [newProjectName, setNewProjectName] = useState('')
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskProject, setNewTaskProject] = useState(projects[0]?.id || '')
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [draftName, setDraftName] = useState('')
  // Everyone the hub already grants Timesheet access to, who isn't a Timesheet user yet - the
  // pool "Add employee"'s live search filters client-side as the manager types. Fetched once on
  // mount rather than per-keystroke, since this list only changes when someone's Manage Access
  // grant changes or someone gets added - not something that needs re-checking on every letter.
  const [candidates, setCandidates] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [addingReport, setAddingReport] = useState(false)
  const [claimingUserId, setClaimingUserId] = useState(null)
  // People who've specifically named this manager as theirs and are waiting on a yes/no -
  // distinct from unassignedEmployees below (nobody's picked those people at all yet).
  const [pendingRequests, setPendingRequests] = useState([])
  const [decidingUserId, setDecidingUserId] = useState(null)
  const [removingUserId, setRemovingUserId] = useState(null)
  const [downloadingUserId, setDownloadingUserId] = useState(null)
  const thisMonth = currentMonthStartIso()
  const [leaveDrafts, setLeaveDrafts] = useState({}) // userId -> in-progress "allocated" input value
  const [savingLeaveUserId, setSavingLeaveUserId] = useState(null)
  const [viewingLeaveUserId, setViewingLeaveUserId] = useState(null)

  // Every leave-tagged entry per direct report, newest first - mirrors Dashboard's
  // myLeaveEntries but keyed by userId since a manager can open this for any of their reports.
  const leaveEntriesByUser = useMemo(() => {
    const map = {}
    for (const t of timesheets) {
      if (!directReports.some((u) => u.id === t.userId)) continue
      const leaves = t.entries.filter((e) => e.leaveType && e.leaveType !== 'Public Holiday')
      if (leaves.length === 0) continue
      map[t.userId] = [...(map[t.userId] || []), ...leaves.map((e) => ({ ...e, monthStartDate: t.monthStartDate }))]
    }
    Object.values(map).forEach((entries) => entries.sort((a, b) => (a.date < b.date ? 1 : -1)))
    return map
  }, [timesheets, directReports])

  const viewingLeaveUser = directReports.find((u) => u.id === viewingLeaveUserId) || null

  useEffect(() => {
    if (!projects.some((p) => p.id === newTaskProject)) {
      setNewTaskProject(projects[0]?.id || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  useEffect(() => {
    fetchAddEmployeeCandidates()
      .then(setCandidates)
      .catch((err) => console.error('Failed to load employee search candidates:', err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchPendingRequests()
      .then(setPendingRequests)
      .catch((err) => console.error('Failed to load pending requests:', err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Matches on name OR email, case-insensitive - live-filtered client-side on every keystroke for
  // an instant type-ahead feel. Nothing shown at all until at least 2 characters are typed, so the
  // whole candidate list doesn't dump onto the screen the moment the box is focused.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (q.length < 2) return []
    return candidates.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)).slice(0, 8)
  }, [searchQuery, candidates])

  function selectCandidate(candidate) {
    setSelectedCandidate(candidate)
    setSearchQuery(`${candidate.name} (${candidate.email})`)
  }

  function handleSearchChange(value) {
    setSearchQuery(value)
    // Editing the text after picking someone un-confirms that pick, rather than silently
    // submitting whoever was selected before against now-different-looking text.
    if (selectedCandidate) setSelectedCandidate(null)
  }

  function handleAddProject(e) {
    e.preventDefault()
    if (!newProjectName.trim()) return
    addProject(newProjectName.trim())
    setNewProjectName('')
    showToast('Project added.', 'success')
  }

  function handleAddTask(e) {
    e.preventDefault()
    if (!newTaskName.trim() || !newTaskProject) return
    addTask(newTaskProject, newTaskName.trim())
    setNewTaskName('')
    showToast('Task added.', 'success')
  }

  function startEditProject(project) {
    setEditingProjectId(project.id)
    setDraftName(project.name)
  }

  function saveEditProject(id) {
    if (draftName.trim()) updateProject(id, draftName.trim())
    setEditingProjectId(null)
  }

  function handleDeleteProject(project) {
    if (!window.confirm(`Delete "${project.name}"? Its tasks will be removed and unassigned from your team.`)) return
    deleteProject(project.id)
    if (editingProjectId === project.id) setEditingProjectId(null)
    showToast('Project deleted.', 'success')
  }

  function startEditTask(task) {
    setEditingTaskId(task.id)
    setDraftName(task.name)
  }

  function saveEditTask(id) {
    if (draftName.trim()) updateTask(id, draftName.trim())
    setEditingTaskId(null)
  }

  function handleDeleteTask(task) {
    if (!window.confirm(`Delete "${task.name}"?`)) return
    deleteTask(task.id)
    if (editingTaskId === task.id) setEditingTaskId(null)
    showToast('Task deleted.', 'success')
  }

  function toggleAssignment(userId, taskId) {
    const current = assignments[userId] || []
    const next = current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    setUserAssignments(userId, next)
  }

  async function handleSaveLeaveAllocation(userId, currentAllocated) {
    const draft = leaveDrafts[userId]
    if (draft === undefined) return
    const allocated = Number(draft)
    setLeaveDrafts((prev) => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
    if (!Number.isFinite(allocated) || allocated < 0 || allocated === currentAllocated) return
    setSavingLeaveUserId(userId)
    try {
      await setLeaveAllocation(userId, allocated)
      showToast('Leave balance updated.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to update leave balance.', 'error')
    } finally {
      setSavingLeaveUserId(null)
    }
  }

  async function handleAddReport(e) {
    e.preventDefault()
    if (!selectedCandidate) return
    setAddingReport(true)
    try {
      await addDirectReport(selectedCandidate.name, selectedCandidate.email)
      setCandidates((c) => c.filter((cand) => cand.email !== selectedCandidate.email))
      setSearchQuery('')
      setSelectedCandidate(null)
      showToast('Employee added.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to add employee.', 'error')
    } finally {
      setAddingReport(false)
    }
  }

  // Claims someone who already exists (synced from a hub sign-in with no manager yet) onto this
  // manager's team - self-service, first click wins. A 409 means another manager just claimed
  // them first; refetch-on-refresh isn't needed since the list is already scoped to whoever's
  // still unassigned as of the last load.
  async function handleClaim(userId) {
    setClaimingUserId(userId)
    try {
      await claimEmployee(userId)
      showToast('Employee added to your team.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to add employee - someone else may have already claimed them.', 'error')
    } finally {
      setClaimingUserId(null)
    }
  }

  async function handleApprove(userId) {
    setDecidingUserId(userId)
    try {
      await approveEmployee(userId)
      setPendingRequests((list) => list.filter((u) => u.id !== userId))
      showToast('Employee approved.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to approve employee.', 'error')
    } finally {
      setDecidingUserId(null)
    }
  }

  async function handleReject(userId) {
    setDecidingUserId(userId)
    try {
      await rejectEmployee(userId)
      setPendingRequests((list) => list.filter((u) => u.id !== userId))
      showToast('Request declined.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to decline request.', 'error')
    } finally {
      setDecidingUserId(null)
    }
  }

  async function handleDownloadExcel(user) {
    setDownloadingUserId(user.id)
    try {
      const timesheet = getTimesheet(user.id, thisMonth)
      const userTasks = getAssignedTasks(user.id).map((t) => ({
        ...t,
        projectName: projects.find((p) => p.id === t.projectId)?.name || 'Unknown project',
      }))
      await exportTimesheetToExcel({ entries: timesheet?.entries || [], tasks: userTasks, monthStartDate: thisMonth, userName: user.name })
      showToast('Timesheet downloaded.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to download timesheet.', 'error')
    } finally {
      setDownloadingUserId(null)
    }
  }

  async function handleRemove(user) {
    if (!window.confirm(`Remove ${user.name} from your team? Their timesheets and leave history will be kept.`)) return
    setRemovingUserId(user.id)
    try {
      await removeDirectReport(user.id)
      showToast('Employee removed from your team.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to remove employee.', 'error')
    } finally {
      setRemovingUserId(null)
    }
  }

  return (
    <div className="space-y-6">
      <BackButton onClick={() => navigate('dashboard')} />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Manage Team</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Direct reports and project/task setup.</p>
      </div>

      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Direct reports & task assignments</h2>

        <form onSubmit={handleAddReport} className="flex flex-wrap items-start gap-2 mb-5 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-[260px] relative">
            <label htmlFor="employee-search" className="block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
              Search by name or email
            </label>
            <input
              id="employee-search"
              type="text"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Start typing a name or email…"
              className={`w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none ${inputFocus}`}
            />
            {!selectedCandidate && searchQuery.trim().length >= 2 && (
              <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
                {searchResults.length > 0 ? (
                  searchResults.map((candidate) => (
                    <li key={candidate.email}>
                      <button
                        type="button"
                        onClick={() => selectCandidate(candidate)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-700"
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-100">{candidate.name}</span>
                        <span className="block text-xs text-slate-400 dark:text-slate-500">{candidate.email}</span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                    No matching people found. They need Timesheet access granted in Manage Access first.
                  </li>
                )}
              </ul>
            )}
          </div>
          <button
            type="submit"
            disabled={addingReport || !selectedCandidate}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed ${solidBtn}`}
          >
            {addingReport ? 'Adding…' : 'Add employee'}
          </button>
        </form>

        {pendingRequests.length > 0 && (
          <div className="mb-5 pb-5 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Requests waiting for your approval
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              These people named you as their reporting manager and can't log any hours until you approve them.
            </p>
            <ul className="space-y-2">
              {pendingRequests.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{user.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                  </div>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleReject(user.id)}
                      disabled={decidingUserId === user.id}
                      className="rounded-lg border border-red-200 dark:border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(user.id)}
                      disabled={decidingUserId === user.id}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed ${solidBtn}`}
                    >
                      {decidingUserId === user.id ? 'Working…' : 'Approve'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {unassignedEmployees.length > 0 && (
          <div className="mb-5 pb-5 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Waiting to be added to a team
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              These people already have Timesheet access but aren't on any manager's team yet.
            </p>
            <ul className="space-y-2">
              {unassignedEmployees.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{user.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClaim(user.id)}
                    disabled={claimingUserId === user.id}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed ${solidBtn}`}
                  >
                    {claimingUserId === user.id ? 'Adding…' : 'Add to my team'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-5">
          {directReports.map((user) => (
            <div key={user.id} className="border border-slate-100 dark:border-slate-800 rounded-lg p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{user.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                </div>
                <span className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleDownloadExcel(user)}
                    disabled={downloadingUserId === user.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingUserId === user.id ? 'Preparing…' : '⬇ Download Excel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(user)}
                    disabled={removingUserId === user.id}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-xs font-medium focus:outline-none focus-visible:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {removingUserId === user.id ? 'Removing…' : 'Remove'}
                  </button>
                </span>
              </div>
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Assigned tasks</legend>
                <div className="flex flex-wrap gap-2">
                  {tasks.map((task) => {
                    const project = projects.find((p) => p.id === task.projectId)
                    const checked = (assignments[user.id] || []).includes(task.id)
                    return (
                      <label
                        key={task.id}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs cursor-pointer ${
                          checked ? chipActive : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignment(user.id, task.id)}
                          className={`h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 ${checkboxColor}`}
                        />
                        {project?.name} · {task.name}
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
                  Leave balance <span className="font-normal normal-case text-slate-400 dark:text-slate-500">({new Date().getFullYear()})</span>
                </legend>
                {(() => {
                  const { balance, allocated, used } = getLeaveBalance(user.id)
                  const saving = savingLeaveUserId === user.id
                  const draftValue = leaveDrafts[user.id] ?? String(allocated)
                  return (
                    <div className="flex items-center gap-2 text-sm">
                      <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        Yearly quota
                        <input
                          type="number"
                          min="0"
                          value={draftValue}
                          disabled={saving}
                          onChange={(e) => setLeaveDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                          onBlur={() => handleSaveLeaveAllocation(user.id, allocated)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          aria-label={`Yearly leave days allocated to ${user.name}`}
                          className={`w-16 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1 text-xs text-center focus:outline-none disabled:opacity-50 ${ringOnly}`}
                        />
                        days
                      </label>
                      <span className="text-slate-400 dark:text-slate-500">·</span>
                      <span className="text-slate-600 dark:text-slate-300">{used} taken</span>
                      <span className="text-slate-400 dark:text-slate-500">·</span>
                      <span className={`font-semibold ${balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
                        {balance} {Math.abs(balance) === 1 ? 'day' : 'days'} remaining
                      </span>
                      <span className="text-slate-400 dark:text-slate-500">·</span>
                      <button
                        type="button"
                        onClick={() => setViewingLeaveUserId(user.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                      >
                        Leave details
                      </button>
                    </div>
                  )
                })()}
              </fieldset>
            </div>
          ))}
          {directReports.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No direct reports.</p>}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Projects</h2>
          <ul className="space-y-2 mb-4">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                {editingProjectId === project.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEditProject(project.id)}
                    onBlur={() => saveEditProject(project.id)}
                    className={`flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1 text-sm focus:outline-none ${ringOnly}`}
                  />
                ) : (
                  <span className="text-slate-700 dark:text-slate-200">{project.name}</span>
                )}
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => (editingProjectId === project.id ? saveEditProject(project.id) : startEditProject(project))}
                    className={`text-xs font-medium focus:outline-none focus-visible:underline ${linkColor}`}
                  >
                    {editingProjectId === project.id ? 'Save' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(project)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-xs font-medium focus:outline-none focus-visible:underline"
                  >
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
              className={`flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none ${inputFocus}`}
            />
            <button
              type="submit"
              className={`rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 ${gradientBtn}`}
            >
              Add
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Tasks</h2>
          <ul className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {tasks.map((task) => {
              const project = projects.find((p) => p.id === task.projectId)
              return (
                <li key={task.id} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                  {editingTaskId === task.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEditTask(task.id)}
                      onBlur={() => saveEditTask(task.id)}
                      className={`flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1 text-sm focus:outline-none ${ringOnly}`}
                    />
                  ) : (
                    <span className="text-slate-700 dark:text-slate-200">
                      <span className="text-slate-400 dark:text-slate-500">{project?.name}</span> · {task.name}
                    </span>
                  )}
                  <span className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => (editingTaskId === task.id ? saveEditTask(task.id) : startEditTask(task))}
                      className={`text-xs font-medium focus:outline-none focus-visible:underline ${linkColor}`}
                    >
                      {editingTaskId === task.id ? 'Save' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(task)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-xs font-medium focus:outline-none focus-visible:underline"
                    >
                      Delete
                    </button>
                  </span>
                </li>
              )
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
              className={`rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-2 text-sm focus:outline-none ${ringOnly}`}
            >
              {projects.map((p) => (
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
              className={`flex-1 min-w-[8rem] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none ${inputFocus}`}
            />
            <button
              type="submit"
              className={`rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 ${gradientBtn}`}
            >
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
    </div>
  )
}
