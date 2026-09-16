import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getHubSessionToken } from '../lib/hubAccess'

const AppContext = createContext(null)

// Only the "who's logged in" session lives in localStorage now - all real
// data (users, projects, tasks, timesheets, ...) is fetched from the API,
// which is backed by Postgres (see server/).
const SESSION_KEY = 'timesheet-session-v1'
// This app's own session token (see server/src/middleware/auth.js) - issued after either a
// verified hub sign-in or a demo login (see bootstrapFromHub/demoLogin below), and required by
// every API route except POST /auth/hub-login and /auth/demo-*.
const TOKEN_KEY = 'timesheet-api-token'
// Hardcoded (not a custom-named env var) on purpose: VITE_API_BASE_URL collides with RC Portal's
// own env var of the same name, which is set at the Amplify-console level (global to the whole
// build, not scoped per embedded app) - Vite prioritizes that real environment variable over
// whatever this app's own amplify.yml line writes into its local .env file, so the build was
// silently picking up RC Portal's backend URL instead of this app's. Same reasoning as
// src/lib/hubAccess.js's hardcoded HUB_ACCESS_API_BASE. This app's own backend (server/) is
// deployed on 172.17.2.21, reachable via the existing nginx /dev-api/timesheet/ route - update
// this if that backend is ever redeployed elsewhere.
// import.meta.env.DEV is Vite's own built-in flag (not a custom name, can't collide with
// anything) - keeps the relative '/api' this app has always used for local dev, proxied to
// localhost:4000 by vite.config.js.
const API_BASE = import.meta.env.DEV ? '/api' : 'https://audit-capa-api.emamiapps.in/dev-api/timesheet/api'

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // fall through to signed-out
  }
  return { currentUserId: null, isLoggedIn: false }
}

function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore - worst case the token just isn't persisted across reloads
  }
}

async function api(path, options) {
  const token = loadToken()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
  const [users, projects, tasks, assignments, teamSettings, leaveBalances, unassignedEmployees] = await Promise.all([
    api('/users'),
    api('/projects'),
    api('/tasks'),
    api('/assignments'),
    api('/team-settings'),
    api('/leave-balances'),
    api('/users/unassigned'),
  ])
  const timesheetsByUser = await Promise.all(users.map((u) => api(`/timesheets?userId=${u.id}`)))
  return { users, projects, tasks, assignments, teamSettings, leaveBalances, unassignedEmployees, timesheets: timesheetsByUser.flat() }
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(loadSession)
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  // Gates first render on the hub sign-in check below, same as rc-portal's
  // useHubEmailBootstrap - true immediately for a manual/demo session, or once the hub check
  // (found or not) has resolved, so the manual Login screen never flashes in between.
  const [hubBootstrapped, setHubBootstrapped] = useState(false)
  // Whether a hub email was found at all - distinguishes "really standalone" (no hub email,
  // the manual/demo Login screen is the right fallback) from "inside the hub but the access
  // check failed" (a real person who must NOT be handed the demo picker's free "log in as
  // anyone" dropdown just because a network call hiccuped).
  const [hubEmailDetected, setHubEmailDetected] = useState(false)
  const [hubError, setHubError] = useState(null)
  // Populated only when there's no hub token at all (genuinely standalone) - lets Login.jsx's
  // "log in as" picker list someone before any session token exists, via the unauthenticated
  // GET /auth/demo-users (see bootstrapFromHub below and server/src/routes/auth.js).
  const [demoUsers, setDemoUsers] = useState([])

  useEffect(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }, [session])

  // Every other API route requires a session token (see server/src/middleware/auth.js), so this
  // can't run until one exists - callers below only ever invoke it after a hub or demo login has
  // stored one, or (for a returning session) right away, trusting the token persisted from last
  // time until the server itself says otherwise via a 401.
  const refresh = useCallback(() => {
    setLoadError(null)
    return loadAllData()
      .then(setData)
      .catch((err) => setLoadError(err.message))
  }, [])

  // Establishes this tab's session token before anything else can load. Three cases:
  //  1. A hub session token is present (see src/lib/hubAccess.js) - ALWAYS re-verify it against
  //     this app's own backend (POST /auth/hub-login), even if we already have a working session
  //     from earlier. That re-check is what re-reads the current Manage Access role every time,
  //     so promoting/demoting someone there takes effect the next time they open Timesheet,
  //     instead of being stuck behind whatever role got baked into a session token that can
  //     otherwise live for 30 days. If this re-check fails for a transient reason (network
  //     hiccup) but we already had a working session, fall back to that rather than hard-failing
  //     someone who was already in.
  //  2. No hub token, but a session persists from last time (demo login, standalone dev) - reuse
  //     it; an expired/invalid token surfaces as the ordinary load-error retry.
  //  3. No hub token and no session at all - genuinely standalone (e.g. `npm run dev`). Fetch
  //     the demo user list (unauthenticated) so Login.jsx has someone to pick from; demoLogin
  //     (below) is what actually gets a token once someone's picked.
  const bootstrapFromHub = useCallback(() => {
    const hubToken = getHubSessionToken()

    if (hubToken) {
      setHubEmailDetected(true)
      setHubError(null)

      let cancelled = false
      api('/auth/hub-login', { method: 'POST', body: JSON.stringify({ hubToken }) })
        .then(async ({ user, token }) => {
          if (cancelled) return
          saveToken(token)
          await refresh()
          login(user.id)
        })
        .catch((err) => {
          if (cancelled) return
          if (session.isLoggedIn) {
            // Already had a working session before this re-check - don't block on a transient
            // failure, just keep using what we have.
            refresh()
            return
          }
          console.error('[auth] Could not verify hub access:', err.message)
          setHubError(err.message || 'Could not verify your access.')
        })
        .finally(() => {
          if (!cancelled) setHubBootstrapped(true)
        })

      return () => {
        cancelled = true
      }
    }

    if (session.isLoggedIn) {
      setHubBootstrapped(true)
      refresh()
      return () => {}
    }

    setHubEmailDetected(false)
    setHubBootstrapped(true)
    // The demo "log in as" picker only makes sense for a genuinely standalone dev run
    // (`npm run dev`, no hub around it at all) - on the real deployed site, someone with no
    // hub token just opened this URL directly instead of through the hub, and should see the
    // "sign in through the hub" screen below instead (see the render guard further down).
    // Skipping this call there too, since /auth/demo-users 404s outright once deployed anyway.
    if (import.meta.env.DEV) {
      api('/auth/demo-users')
        .then(setDemoUsers)
        .catch((err) => console.error('[auth] Could not load demo users:', err.message))
    }
    return () => {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => bootstrapFromHub(), [bootstrapFromHub])

  // Clears only this app's OWN two local keys (never the hub's shared session token - clearing
  // that here would sign someone out of every embedded app, not just this one) and does a real
  // full page reload rather than an in-place retry. A plain in-place retry re-runs the same code
  // in the same already-running tab, which can't shake loose anything genuinely stuck; a full
  // reload guarantees a completely fresh read of whatever the hub currently has stored, the same
  // effect a manual "clear site data + reload" had, minus ever touching the hub's own session.
  function retryHubBootstrap() {
    try {
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // ignore - worst case the reload below still helps on its own
    }
    window.location.reload()
  }

  // What Login.jsx's picker actually calls - no real verification (this only ever runs when
  // there's no hub token at all, i.e. standalone dev - see /auth/demo-login's own
  // ALLOW_DEMO_LOGIN gate server-side, which 404s it outright once deployed for real hub users).
  async function demoLogin(userId) {
    const { user, token } = await api('/auth/demo-login', { method: 'POST', body: JSON.stringify({ userId }) })
    saveToken(token)
    await refresh()
    login(user.id)
  }

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
    // No managerId in the body - the server derives it from this session's own verified token.
    const user = await api('/users', { method: 'POST', body: JSON.stringify({ name, email }) })
    setData((d) => ({ ...d, users: [...d.users, user] }))
    return user
  }

  // The live-search pool for Manage Team's "Add employee" box - see server/src/routes/users.js's
  // GET /users/candidates. Fetched on demand by that screen (not part of loadAllData, since
  // nothing else needs it) and filtered client-side as the manager types, for an instant
  // type-ahead feel instead of a network round-trip per keystroke.
  async function fetchAddEmployeeCandidates() {
    return api('/users/candidates')
  }

  // Claims an employee who already exists (synced from a hub sign-in with no manager yet) onto
  // the current manager's team, instead of the "Add employee" form above which only ever creates
  // brand-new people. Self-service - the server 409s if someone else claimed them first.
  async function claimEmployee(userId) {
    const updated = await api(`/users/${userId}/claim`, { method: 'PUT' })
    setData((d) => ({
      ...d,
      users: d.users.map((u) => (u.id === updated.id ? updated : u)),
      unassignedEmployees: d.unassignedEmployees.filter((u) => u.id !== userId),
    }))
    return updated
  }

  // Everyone who could be picked as "my reporting manager" - see PickManager.jsx, the screen a
  // brand-new employee sees before anything else. Fetched on demand rather than in loadAllData
  // since it's only ever needed by that one screen.
  async function fetchManagers() {
    return api('/users/managers')
  }

  // A pending employee's own pick of who they report to (or a change of mind while still
  // pending - see AwaitingApproval.jsx). Updates the in-memory user record so the app can move
  // straight from "pick a manager" to "waiting for approval" without a full refetch.
  async function requestManager(managerId) {
    const updated = await api('/users/me/manager', { method: 'PUT', body: JSON.stringify({ managerId }) })
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === updated.id ? updated : u)) }))
    return updated
  }

  // Re-reads one user's current record - used by AwaitingApproval.jsx to notice, without a full
  // page reload, the moment a manager approves them (status flips 'pending' -> 'active').
  async function refreshUser(userId) {
    const updated = await api(`/users/${userId}`)
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === updated.id ? updated : u)) }))
    return updated
  }

  // Manage Team's "Requests waiting for your approval" section - people who've named the current
  // manager as theirs but aren't approved yet. Fetched on demand like fetchAddEmployeeCandidates.
  async function fetchPendingRequests() {
    return api('/users/pending-requests')
  }

  async function approveEmployee(userId) {
    const updated = await api(`/users/${userId}/approve`, { method: 'PUT' })
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === updated.id ? updated : u)) }))
    return updated
  }

  async function rejectEmployee(userId) {
    const updated = await api(`/users/${userId}/reject`, { method: 'PUT' })
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === updated.id ? updated : u)) }))
    return updated
  }

  // Removes an employee from the current manager's team - the inverse of claimEmployee above.
  // Server-side this also sends them back to 'pending' (see requestManager above) - they'll see
  // the pick-a-manager screen again the next time they open Timesheet, same as a brand-new
  // employee, rather than landing in unassignedEmployees with full access still intact. Their
  // timesheets, leave history, and task assignments all stay untouched.
  async function removeDirectReport(userId) {
    const updated = await api(`/users/${userId}/team`, { method: 'DELETE' })
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === updated.id ? updated : u)) }))
    return updated
  }

  // Permanently deletes an employee - unlike removeDirectReport above (which just unassigns
  // them), this erases their account and everything tied to it. The server cascades the DB
  // delete to their assignments/timesheets/leave balance; here we mirror that by dropping them
  // from every piece of local state that's keyed by userId, so they vanish everywhere at once
  // instead of lingering in stale lists until the next refresh.
  async function deleteEmployee(userId) {
    await api(`/users/${userId}`, { method: 'DELETE' })
    setData((d) => {
      const { [userId]: _removedAssignments, ...assignments } = d.assignments
      return {
        ...d,
        users: d.users.filter((u) => u.id !== userId),
        assignments,
        timesheets: d.timesheets.filter((t) => t.userId !== userId),
        leaveBalances: d.leaveBalances.filter((b) => b.userId !== userId),
      }
    })
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
  // flashes for someone who's about to be signed straight in via the hub. Once bootstrapped,
  // `data` is only required for an already-logged-in session (hub or demo) - Login.jsx itself
  // renders fine with data still null, using demoUsers instead (no session token exists yet to
  // load real data with).
  if (!hubBootstrapped || (session.isLoggedIn && !data)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    )
  }

  // A hub email WAS found (this is a real person inside the EmamiApps hub, not standalone dev)
  // but the Manage Access role lookup failed - never fall through to the manual "Log in as"
  // screen here, since its free-pick dropdown would let them sign in as anyone, including a
  // manager. Show a retryable error instead; the demo picker below is only reachable when
  // hubEmailDetected is false (i.e. no hub email at all).
  if (hubEmailDetected && hubError && !session.isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-800">Couldn't verify your access</p>
          <p className="mt-1 text-sm text-red-700">{hubError}</p>
          <button
            type="button"
            onClick={retryHubBootstrap}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Real deployment, but this browser never went through the hub at all (no session token
  // found) - most likely someone opened this URL directly instead of clicking the Timesheet
  // tile in the hub. Login.jsx's demo picker only exists for genuinely standalone local dev
  // (see the DEV check above) - showing it here would offer a working "log in as anyone" form
  // on the real site to a visitor who simply took the wrong path in.
  if (!import.meta.env.DEV && !hubEmailDetected && !session.isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Sign in through Emami Apps</p>
          <p className="mt-1 text-sm text-slate-500">
            This page isn't reachable directly - open Timesheet from the Emami Apps hub instead.
          </p>
          <a
            href="/"
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Back to Emami Apps
          </a>
        </div>
      </div>
    )
  }

  const value = {
    ...data,
    ...session,
    currentUser,
    directReports,
    demoUsers,
    demoLogin,
    setCurrentUserId,
    login,
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
    fetchAddEmployeeCandidates,
    claimEmployee,
    fetchManagers,
    requestManager,
    refreshUser,
    fetchPendingRequests,
    approveEmployee,
    rejectEmployee,
    removeDirectReport,
    deleteEmployee,
    resetDemoData,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within an AppProvider')
  return ctx
}
