import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getHubEmail, getHubRoleForTimesheet } from '../lib/hubAccess'

const AppContext = createContext(null)

// Only the "who's logged in" session lives in localStorage now - all real
// data (users, projects, tasks, timesheets, ...) is fetched from the API,
// which is backed by Postgres (see server/).
const SESSION_KEY = 'timesheet-session-v1'
// VITE_API_BASE_URL is set at build time once this app's own backend (server/) is deployed
// somewhere of its own (see the hub's amplify.yml, which injects the same kind of build-time env
// var for every embedded app that has its own backend - rc-portal, non-ctc-expense, audit-capa).
// Falls back to the relative '/api' this app has always used for local dev (proxied to
// localhost:4000 by vite.config.js).
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // fall through to signed-out
  }
  return { currentUserId: null, isLoggedIn: false }
}

async function api(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  if (res.status === 204) return null
  return res.json()
}

async function loadAllData() {
  const [users, projects, tasks, assignments, teamSettings, leaveBalances] = await Promise.all([
    api('/users'),
    api('/projects'),
    api('/tasks'),
    api('/assignments'),
    api('/team-settings'),
    api('/leave-balances'),
  ])
  const timesheetsByUser = await Promise.all(users.map((u) => api(`/timesheets?userId=${u.id}`)))
  return { users, projects, tasks, assignments, teamSettings, leaveBalances, timesheets: timesheetsByUser.flat() }
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(loadSession)
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  // Gates first render on the hub sign-in check below, same as rc-portal's
  // useHubEmailBootstrap - true immediately for a manual/demo session, or once the hub check
  // (found or not) has resolved, so the manual Login screen never flashes in between.
  const [hubBootstrapped, setHubBootstrapped] = useState(false)

  useEffect(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }, [session])

  const refresh = useCallback(() => {
    setLoadError(null)
    return loadAllData()
      .then(setData)
      .catch((err) => setLoadError(err.message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Signs the user straight in using the email the EmamiApps hub already captured at its own
  // login (same-origin localStorage), catching whether Manage Access granted them Admin or User
  // for 'timesheet' specifically and syncing that into this app's own manager/employee role - see
  // src/lib/hubAccess.js. Only runs when there's no existing session already, so it never
  // overrides an active manual/demo login. Falls back to the ordinary "Log in as" screen,
  // unchanged, when there's no hub email (e.g. `npm run dev` standalone) or the sync fails.
  useEffect(() => {
    if (session.isLoggedIn) {
      setHubBootstrapped(true)
      return
    }
    const hubEmail = getHubEmail()
    if (!hubEmail) {
      setHubBootstrapped(true)
      return
    }

    let cancelled = false
    getHubRoleForTimesheet(hubEmail)
      .then((hubRole) => {
        if (cancelled) return
        const role = hubRole === 'Admin' ? 'manager' : 'employee'
        return api('/users/hub-sync', { method: 'POST', body: JSON.stringify({ email: hubEmail, role }) }).then(
          async (user) => {
            if (cancelled) return
            await refresh()
            login(user.id)
          },
        )
      })
      .catch((err) => {
        console.error('[hub-access] Falling back to manual login:', err.message)
      })
      .finally(() => {
        if (!cancelled) setHubBootstrapped(true)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentUser = useMemo(
    () => data?.users.find((u) => u.id === session.currentUserId) || data?.users[0] || null,
    [data, session.currentUserId],
  )

  const directReports = useMemo(
    () => data?.users.filter((u) => u.managerId === currentUser?.id) || [],
    [data, currentUser],
  )

  function setCurrentUserId(userId) {
    setSession((s) => ({ ...s, currentUserId: userId }))
  }

  function login(userId) {
    setSession({ currentUserId: userId, isLoggedIn: true })
  }

  function logout() {
    setSession((s) => ({ ...s, isLoggedIn: false }))
  }

  function getTimesheet(userId, monthStartDate) {
    return data.timesheets.find((t) => t.userId === userId && t.monthStartDate === monthStartDate) || null
  }

  function getUserById(userId) {
    return data.users.find((u) => u.id === userId) || null
  }

  function getAssignedTasks(userId) {
    const taskIds = data.assignments[userId] || []
    return data.tasks.filter((t) => taskIds.includes(t.id))
  }

  // One yearly leave pool per user (defaults to 24 until a manager adjusts it).
  function getLeaveBalance(userId) {
    return data.leaveBalances.find((b) => b.userId === userId) || { userId, allocated: 24, used: 0, balance: 24 }
  }

  // Manager action: sets a direct report's yearly allocation directly - same "edit it in
  // place" pattern as toggling an assigned task.
  async function setLeaveAllocation(userId, allocated) {
    const updated = await api(`/leave-balances/${userId}`, { method: 'PUT', body: JSON.stringify({ allocated }) })
    setData((d) => ({
      ...d,
      leaveBalances: d.leaveBalances.some((b) => b.userId === userId)
        ? d.leaveBalances.map((b) => (b.userId === userId ? updated : b))
        : [...d.leaveBalances, updated],
    }))
    return updated
  }

  function upsertTimesheet(ts) {
    setData((d) => {
      const exists = d.timesheets.some((t) => t.id === ts.id)
      return { ...d, timesheets: exists ? d.timesheets.map((t) => (t.id === ts.id ? ts : t)) : [...d.timesheets, ts] }
    })
  }

  // Re-pulls one user's leave balance from the server - `used`/`balance` are computed there
  // from actual timesheet_entries, so this is how a balance picks up a leave day the moment
  // it's saved, without trusting a locally-recomputed count to stay in sync. Scoped to a
  // single user (not the whole team) so it stays fast on every autosave.
  async function refreshLeaveBalance(userId) {
    try {
      const updated = await api(`/leave-balances/${userId}`)
      setData((d) => ({
        ...d,
        leaveBalances: d.leaveBalances.some((b) => b.userId === userId)
          ? d.leaveBalances.map((b) => (b.userId === userId ? updated : b))
          : [...d.leaveBalances, updated],
      }))
    } catch (err) {
      console.error('Failed to refresh leave balance:', err)
    }
  }

  // Persist the current in-progress entries for a user's month as a Draft.
  // Editing a Rejected timesheet intentionally keeps its status Rejected (not
  // Draft) so the rejection banner/comment stays visible - enforced server-side.
  async function saveDraftEntries(userId, monthStartDate, entries) {
    try {
      upsertTimesheet(await api('/timesheets/draft', { method: 'POST', body: JSON.stringify({ userId, monthStartDate, entries }) }))
      refreshLeaveBalance(userId)
    } catch (err) {
      console.error('Failed to save draft:', err)
    }
  }

  // Upserts entries and transitions the month to Submitted (or Resubmitted,
  // if it was previously Rejected) - handled atomically server-side.
  async function submitForApproval(userId, monthStartDate, entries) {
    try {
      upsertTimesheet(await api('/timesheets/submit', { method: 'POST', body: JSON.stringify({ userId, monthStartDate, entries }) }))
      refreshLeaveBalance(userId)
    } catch (err) {
      console.error('Failed to submit timesheet:', err)
    }
  }

  async function approveTimesheet(timesheetId, comment = '') {
    try {
      upsertTimesheet(await api(`/timesheets/${timesheetId}/approve`, { method: 'POST', body: JSON.stringify({ comment }) }))
    } catch (err) {
      console.error('Failed to approve timesheet:', err)
    }
  }

  async function rejectTimesheet(timesheetId, comment, actionLabel = 'Rejected') {
    const trimmed = comment.trim()
    if (!trimmed) throw new Error('A comment is required to reject a timesheet.')
    try {
      upsertTimesheet(
        await api(`/timesheets/${timesheetId}/reject`, { method: 'POST', body: JSON.stringify({ comment: trimmed, actionLabel }) }),
      )
    } catch (err) {
      console.error('Failed to reject timesheet:', err)
    }
  }

  async function bulkApprove(timesheetIds) {
    try {
      const updated = await api('/timesheets/bulk-approve', { method: 'POST', body: JSON.stringify({ timesheetIds }) })
      setData((d) => ({ ...d, timesheets: d.timesheets.map((t) => updated.find((u) => u.id === t.id) || t) }))
    } catch (err) {
      console.error('Failed to bulk-approve timesheets:', err)
    }
  }

  async function addProject(name) {
    try {
      const project = await api('/projects', { method: 'POST', body: JSON.stringify({ name }) })
      setData((d) => ({ ...d, projects: [...d.projects, project] }))
      return project
    } catch (err) {
      console.error('Failed to add project:', err)
    }
  }

  async function updateProject(projectId, name) {
    try {
      const project = await api(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ name }) })
      setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === projectId ? project : p)) }))
    } catch (err) {
      console.error('Failed to update project:', err)
    }
  }

  // Deleting a project cascades server-side (its tasks, and any assignments
  // referencing those tasks); mirror that removal in local state too.
  async function deleteProject(projectId) {
    try {
      await api(`/projects/${projectId}`, { method: 'DELETE' })
      setData((d) => {
        const removedTaskIds = new Set(d.tasks.filter((t) => t.projectId === projectId).map((t) => t.id))
        return {
          ...d,
          projects: d.projects.filter((p) => p.id !== projectId),
          tasks: d.tasks.filter((t) => t.projectId !== projectId),
          assignments: Object.fromEntries(
            Object.entries(d.assignments).map(([userId, taskIds]) => [userId, taskIds.filter((id) => !removedTaskIds.has(id))]),
          ),
        }
      })
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  async function addTask(projectId, name) {
    try {
      const task = await api('/tasks', { method: 'POST', body: JSON.stringify({ projectId, name }) })
      setData((d) => ({ ...d, tasks: [...d.tasks, task] }))
      return task
    } catch (err) {
      console.error('Failed to add task:', err)
    }
  }

  async function updateTask(taskId, name) {
    try {
      const task = await api(`/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify({ name }) })
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === taskId ? task : t)) }))
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }

  // Drops the task from every user's assignments server-side (cascade); mirror
  // that removal in local state too.
  async function deleteTask(taskId) {
    try {
      await api(`/tasks/${taskId}`, { method: 'DELETE' })
      setData((d) => ({
        ...d,
        tasks: d.tasks.filter((t) => t.id !== taskId),
        assignments: Object.fromEntries(
          Object.entries(d.assignments).map(([userId, taskIds]) => [userId, taskIds.filter((id) => id !== taskId)]),
        ),
      }))
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  async function setUserAssignments(userId, taskIds) {
    try {
      await api(`/assignments/${userId}`, { method: 'PUT', body: JSON.stringify({ taskIds }) })
      setData((d) => ({ ...d, assignments: { ...d.assignments, [userId]: taskIds } }))
    } catch (err) {
      console.error('Failed to update assignments:', err)
    }
  }

  async function addDirectReport(name, email) {
    const user = await api('/users', { method: 'POST', body: JSON.stringify({ name, email, managerId: currentUser.id }) })
    setData((d) => ({ ...d, users: [...d.users, user] }))
    return user
  }

  function resetDemoData() {
    refresh()
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-800">Couldn't reach the TimeSheet server</p>
          <p className="mt-1 text-sm text-red-700">{loadError}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // !hubBootstrapped covers the same window rc-portal's loading spinner does - the moment
  // between mount and the hub sign-in check (above) resolving - so the manual Login screen never
  // flashes for someone who's about to be signed straight in via the hub.
  if (!hubBootstrapped || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    )
  }

  const value = {
    ...data,
    ...session,
    currentUser,
    directReports,
    setCurrentUserId,
    login,
    logout,
    getTimesheet,
    getUserById,
    getAssignedTasks,
    getLeaveBalance,
    setLeaveAllocation,
    saveDraftEntries,
    submitForApproval,
    approveTimesheet,
    rejectTimesheet,
    bulkApprove,
    addProject,
    updateProject,
    deleteProject,
    addTask,
    updateTask,
    deleteTask,
    setUserAssignments,
    addDirectReport,
    resetDemoData,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within an AppProvider')
  return ctx
}
