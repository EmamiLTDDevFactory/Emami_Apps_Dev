import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getHubEmail, hasHubSession, nameFromEmail } from '../lib/hubEmailLogin'
import { fetchTimesheetHubRole } from '../lib/hubAccessApi'

const AppContext = createContext(null)

// Who's logged in comes from the Emami Apps hub, not a session of this app's own - see
// src/lib/hubEmailLogin.js. All real data (users, projects, tasks, timesheets, ...) is fetched
// from the API, which is backed by Postgres (see server/).

// Embedded in the Emami Apps hub, this frontend is served from the hub's own
// origin at /apps/timesheet/, where a bare '/api' would hit the HUB's API
// rather than this app's. So the API host is injected at build time via
// VITE_TIMESHEET_API_URL (set in the Amplify console — see .env.example) and
// the calls go straight to the Timesheet backend wherever it is deployed,
// independent of where this frontend is hosted.
//
// Unset — i.e. running this app standalone with `npm run dev` — it falls back
// to the relative '/api' that vite.config.js proxies to localhost:4000, so
// local development is unchanged.
const API_BASE = `${import.meta.env.VITE_TIMESHEET_API_URL ?? ''}/api`

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
  const [users, projects, tasks, assignments, teamSettings] = await Promise.all([
    api('/users'),
    api('/projects'),
    api('/tasks'),
    api('/assignments'),
    api('/team-settings'),
  ])
  const timesheetsByUser = await Promise.all(users.map((u) => api(`/timesheets?userId=${u.id}`)))
  return { users, projects, tasks, assignments, teamSettings, timesheets: timesheetsByUser.flat() }
}

export function AppProvider({ children }) {
  // Read once at mount - the hub's own login/logout controls these, not this app.
  const [hubEmail] = useState(() => getHubEmail())
  const [loggedIntoHub] = useState(() => hasHubSession())
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const refresh = useCallback(() => {
    setLoadError(null)
    return loadAllData()
      .then(setData)
      .catch((err) => setLoadError(err.message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Role comes from the hub's own Manage Access, not a value stored only in Timesheet: "Admin"
  // for the 'timesheet' app becomes a Timesheet manager, "User" becomes an employee. The first
  // time a given email is seen it's auto-created here (POST /users/provision); every later login
  // re-syncs its role the same way, so promoting someone in Manage Access takes effect on their
  // next visit with no manual DB work. This is deliberately NOT a plain lookup against the
  // already-loaded users list (contrast the earlier email-match approach) - a brand-new hub grant
  // has no Timesheet row to find yet, and provisioning is what creates one.
  const [currentUser, setCurrentUser] = useState(null)
  const [provisionState, setProvisionState] = useState('pending') // 'pending' | 'granted' | 'denied'
  const provisionedRef = useRef(false)

  useEffect(() => {
    if (!data || provisionedRef.current) return
    provisionedRef.current = true

    if (!loggedIntoHub || !hubEmail) {
      setProvisionState('denied')
      return
    }

    let cancelled = false
    fetchTimesheetHubRole(hubEmail).then(async (hubRole) => {
      if (cancelled) return
      if (!hubRole) {
        setProvisionState('denied')
        return
      }
      try {
        const role = hubRole === 'Admin' ? 'manager' : 'employee'
        const user = await api('/users/provision', {
          method: 'POST',
          body: JSON.stringify({ name: nameFromEmail(hubEmail), email: hubEmail, role }),
        })
        if (cancelled) return
        setData((d) => ({
          ...d,
          users: d.users.some((u) => u.id === user.id) ? d.users.map((u) => (u.id === user.id ? user : u)) : [...d.users, user],
        }))
        setCurrentUser(user)
        setProvisionState('granted')
      } catch {
        if (!cancelled) setProvisionState('denied')
      }
    })
    return () => {
      cancelled = true
    }
  }, [data, hubEmail, loggedIntoHub])

  const isLoggedIn = provisionState === 'granted'
  // Distinct from "didn't come from the hub at all" only in the message Login.jsx shows -
  // covers both "no hub session" and "hub session but no Manage Access grant for timesheet".
  const accessDenied = provisionState === 'denied'

  const directReports = useMemo(
    () => data?.users.filter((u) => u.managerId === currentUser?.id) || [],
    [data, currentUser],
  )

  // Identity comes entirely from the Emami Apps hub's login - there is nothing to log in or
  // switch to inside Timesheet itself, so this just leaves the app and returns to the hub.
  function logout() {
    window.location.href = '/'
  }

  // Lets a manager onboard a direct report themselves instead of needing a DB insert - see
  // ManageTeam.jsx. Unlike the other mutations here, this intentionally does NOT swallow its
  // error: a duplicate email is a realistic, expected failure (fat-fingering an existing
  // teammate's address), and the form needs the real message to show the manager, not a
  // silently-ignored no-op.
  async function addTeamMember(name, email) {
    const user = await api('/users', { method: 'POST', body: JSON.stringify({ name, email, managerId: currentUser.id }) })
    setData((d) => ({ ...d, users: [...d.users, user] }))
    return user
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

  function upsertTimesheet(ts) {
    setData((d) => {
      const exists = d.timesheets.some((t) => t.id === ts.id)
      return { ...d, timesheets: exists ? d.timesheets.map((t) => (t.id === ts.id ? ts : t)) : [...d.timesheets, ts] }
    })
  }

  // Persist the current in-progress entries for a user's month as a Draft.
  // Editing a Rejected timesheet intentionally keeps its status Rejected (not
  // Draft) so the rejection banner/comment stays visible - enforced server-side.
  async function saveDraftEntries(userId, monthStartDate, entries) {
    try {
      upsertTimesheet(await api('/timesheets/draft', { method: 'POST', body: JSON.stringify({ userId, monthStartDate, entries }) }))
    } catch (err) {
      console.error('Failed to save draft:', err)
    }
  }

  // Upserts entries and transitions the month to Submitted (or Resubmitted,
  // if it was previously Rejected) - handled atomically server-side.
  async function submitForApproval(userId, monthStartDate, entries) {
    try {
      upsertTimesheet(await api('/timesheets/submit', { method: 'POST', body: JSON.stringify({ userId, monthStartDate, entries }) }))
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

  async function updateTeamSettings(patch) {
    try {
      const next = await api('/team-settings', { method: 'PUT', body: JSON.stringify({ ...data.teamSettings, ...patch }) })
      setData((d) => ({ ...d, teamSettings: next }))
    } catch (err) {
      console.error('Failed to update team settings:', err)
    }
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

  // Covers both "still fetching users/projects/etc." and "logged into the hub, but the Manage
  // Access role check + provisioning call haven't resolved yet" - without this, a signed-in user
  // would briefly flash Login.jsx's "open this from the hub" copy before landing on their
  // dashboard, since provisionState starts at 'pending' rather than 'granted'.
  if (!data || (loggedIntoHub && provisionState === 'pending')) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    )
  }

  const value = {
    ...data,
    currentUser,
    isLoggedIn,
    accessDenied,
    hubEmail,
    loggedIntoHub,
    directReports,
    logout,
    addTeamMember,
    getTimesheet,
    getUserById,
    getAssignedTasks,
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
    updateTeamSettings,
    resetDemoData,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within an AppProvider')
  return ctx
}
