'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getHubSessionToken } from '../lib/hubAccess';

// Loosely typed on purpose — this context is a faithful behavioral port of the original Vite
// app's AppContext.jsx (same API shape, same server contract), not a type-safety rewrite. The
// server/ backend (untouched by this migration) is the actual source of truth for these shapes.
type AnyRecord = Record<string, any>;

interface AppData {
  users: AnyRecord[];
  projects: AnyRecord[];
  tasks: AnyRecord[];
  assignments: Record<string, string[]>;
  teamSettings: AnyRecord;
  leaveBalances: AnyRecord[];
  unassignedEmployees: AnyRecord[];
  timesheets: AnyRecord[];
  workingDayOverrides: string[];
}

interface Session {
  currentUserId: string | null;
  isLoggedIn: boolean;
}

const AppContext = createContext<AnyRecord | null>(null);

// Only the "who's logged in" session lives in localStorage now - all real data (users, projects,
// tasks, timesheets, ...) is fetched from the API, which is backed by Postgres (see server/).
const SESSION_KEY = 'timesheet-session-v1';
// This app's own session token (see server/src/middleware/auth.js) - issued after either a
// verified hub sign-in or a demo login (see bootstrapFromHub/demoLogin below), and required by
// every API route except POST /auth/hub-login and /auth/demo-*.
const TOKEN_KEY = 'timesheet-api-token';
// Hardcoded (not a NEXT_PUBLIC_* env var) on purpose, same reasoning as the original Vite app's
// own comment here: an env var of this shape can collide with another embedded app's own
// Amplify-console-level global var of the same name. This app's own backend (server/) is deployed
// on 172.17.2.21 as two separate PM2 processes: timesheet-api (prod, port 4101, Prdhubfactory's
// "timesheet" schema) and timesheet-api-dev (dev, port 4100, Devhubfactory's "timesheet" schema),
// reachable via the nginx /api/timesheet/ and /dev-api/timesheet/ routes respectively.
//
// This MUST split on hostname, the same way every other embedded app with both a dev and a prod
// deployment does (see e.g. payment-tracking's hubAccessApi.ts, audit-capa's emamiAppsUrl.js). A
// 2026-09-16 migration briefly hardcoded this to the prod route unconditionally, which broke
// Timesheet on dev.emamiapps.in in two ways: (1) prod's backend never allowed dev's origin in its
// CORS config, and, less obviously but more seriously, (2) prod's backend verifies hub session
// tokens against a DIFFERENT signing secret than the one dev's actual login (the
// emami-apps-hub-auth-dev Lambda) issues them with — timesheet-api-dev's secret was already
// correctly set to match that Lambda, so a real dev login token can only ever verify successfully
// against timesheet-api-dev, never timesheet-api. No amount of re-logging-in fixes that; only
// calling the right backend does. In local dev it's reached directly (no Vite-proxy equivalent
// under `next dev`).
const TIMESHEET_HOSTNAME_IS_DEV = typeof window !== 'undefined' && window.location.hostname.includes('dev');
const API_BASE = process.env.NODE_ENV !== 'production'
  ? 'http://localhost:4000/api'
  : `https://audit-capa-api.emamiapps.in${TIMESHEET_HOSTNAME_IS_DEV ? '/dev-api/timesheet' : '/api/timesheet'}/api`;

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to signed-out
  }
  return { currentUserId: null, isLoggedIn: false };
}

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore - worst case the token just isn't persisted across reloads
  }
}

async function api(path: string, options?: RequestInit): Promise<any> {
  const token = loadToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadAllData(): Promise<AppData> {
  const [users, projects, tasks, assignments, teamSettings, leaveBalances, unassignedEmployees, workingDayOverrides] = await Promise.all([
    api('/users'),
    api('/projects'),
    api('/tasks'),
    api('/assignments'),
    api('/team-settings'),
    api('/leave-balances'),
    api('/users/unassigned'),
    api('/working-day-overrides'),
  ]);
  const timesheetsByUser = await Promise.all(users.map((u: AnyRecord) => api(`/timesheets?userId=${u.id}`)));
  return { users, projects, tasks, assignments, teamSettings, leaveBalances, unassignedEmployees, timesheets: timesheetsByUser.flat(), workingDayOverrides };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(loadSession);
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Set only when loadError came from a 401 (bad/expired session token) rather than a transient
  // network/server issue - distinguishes "retry the same request" from "the stored token itself
  // is the problem", which a plain refresh() can never fix since it resends that same token.
  const [loadErrorIsAuth, setLoadErrorIsAuth] = useState(false);
  // Gates first render on the hub sign-in check below - true immediately for a manual/demo
  // session, or once the hub check (found or not) has resolved, so the manual Login screen never
  // flashes in between.
  const [hubBootstrapped, setHubBootstrapped] = useState(false);
  // Whether a hub token was found at all - distinguishes "really standalone" (no hub token, the
  // manual/demo Login screen is the right fallback) from "inside the hub but the access check
  // failed" (a real person who must NOT be handed the demo picker's free "log in as anyone"
  // dropdown just because a network call hiccuped).
  const [hubEmailDetected, setHubEmailDetected] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  // Populated only when there's no hub token at all (genuinely standalone) - lets Login's "log in
  // as" picker list someone before any session token exists, via the unauthenticated
  // GET /auth/demo-users (see bootstrapFromHub below and server/src/routes/auth.js).
  const [demoUsers, setDemoUsers] = useState<AnyRecord[]>([]);

  useEffect(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, [session]);

  // Every other API route requires a session token (see server/src/middleware/auth.js), so this
  // can't run until one exists - callers below only ever invoke it after a hub or demo login has
  // stored one, or (for a returning session) right away, trusting the token persisted from last
  // time until the server itself says otherwise via a 401.
  const refresh = useCallback(() => {
    setLoadError(null);
    setLoadErrorIsAuth(false);
    return loadAllData()
      .then(setData)
      .catch((err: Error & { status?: number }) => {
        setLoadError(err.message);
        setLoadErrorIsAuth(err.status === 401);
      });
  }, []);

  function login(userId: string) {
    setSession({ currentUserId: userId, isLoggedIn: true });
  }

  // Establishes this tab's session token before anything else can load. Three cases, checked in
  // this order so Timesheet's OWN session (up to SESSION_EXPIRES_IN, 30d by default) is what
  // keeps it usable, not the hub's separate, shorter-lived session:
  //  1. We already have a working session/token from earlier (hub or demo login) - trust it and
  //     go straight to refresh(), without re-depending on the hub session still being alive too.
  //     A dead hub session no longer takes Timesheet down with it; only this app's own token
  //     dying does (surfaced as the ordinary loadError 401 -> retryHubBootstrap recovery below).
  //     Trade-off: a Manage Access role change now takes effect the next time a fresh token is
  //     actually needed (this one expiring, or a real sign-out/sign-in), not on every open.
  //  2. No working session yet, but a hub session token is present (see src/lib/hubAccess.ts) -
  //     verify it against this app's own backend (POST /auth/hub-login) to get one.
  //  3. No hub token and no session at all - genuinely standalone (e.g. `npm run dev`). Fetch the
  //     demo user list (unauthenticated) so Login has someone to pick from; demoLogin (below) is
  //     what actually gets a token once someone's picked.
  const bootstrapFromHub = useCallback(() => {
    const hubToken = getHubSessionToken();
    let cancelled = false;

    if (session.isLoggedIn && loadToken()) {
      setHubEmailDetected(!!hubToken);
      setHubBootstrapped(true);
      refresh();
      return () => {
        cancelled = true;
      };
    }

    if (hubToken) {
      setHubEmailDetected(true);
      setHubError(null);

      api('/auth/hub-login', { method: 'POST', body: JSON.stringify({ hubToken }) })
        .then(async ({ user, token }: AnyRecord) => {
          if (cancelled) return;
          saveToken(token);
          await refresh();
          login(user.id);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          console.error('[auth] Could not verify hub access:', err.message);
          setHubError(err.message || 'Could not verify your access.');
        })
        .finally(() => {
          if (!cancelled) setHubBootstrapped(true);
        });

      return () => {
        cancelled = true;
      };
    }

    if (session.isLoggedIn) {
      setHubBootstrapped(true);
      refresh();
      return () => {};
    }

    setHubEmailDetected(false);
    setHubBootstrapped(true);
    // The demo "log in as" picker only makes sense for a genuinely standalone dev run
    // (`npm run dev`, no hub around it at all) - on the real deployed site, someone with no hub
    // token just opened this URL directly instead of through the hub, and should see the "sign in
    // through the hub" screen below instead (see the render guard further down). Skipping this
    // call there too, since /auth/demo-users 404s outright once deployed anyway.
    if (process.env.NODE_ENV !== 'production') {
      api('/auth/demo-users')
        .then(setDemoUsers)
        .catch((err: Error) => console.error('[auth] Could not load demo users:', err.message));
    }
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => bootstrapFromHub(), [bootstrapFromHub]);

  // Clears only this app's OWN two local keys (never the hub's shared session token - clearing
  // that here would sign someone out of every embedded app, not just this one) and does a real
  // full page reload rather than an in-place retry. A plain in-place retry re-runs the same code
  // in the same already-running tab, which can't shake loose anything genuinely stuck; a full
  // reload guarantees a completely fresh read of whatever the hub currently has stored, the same
  // effect a manual "clear site data + reload" had, minus ever touching the hub's own session.
  function retryHubBootstrap() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore - worst case the reload below still helps on its own
    }
    window.location.reload();
  }

  // What Login's picker actually calls - no real verification (this only ever runs when there's
  // no hub token at all, i.e. standalone dev - see /auth/demo-login's own ALLOW_DEMO_LOGIN gate
  // server-side, which 404s it outright once deployed for real hub users).
  async function demoLogin(userId: string) {
    const { user, token } = await api('/auth/demo-login', { method: 'POST', body: JSON.stringify({ userId }) });
    saveToken(token);
    await refresh();
    login(user.id);
  }

  const currentUser = useMemo(
    () => data?.users.find((u) => u.id === session.currentUserId) || data?.users[0] || null,
    [data, session.currentUserId]
  );

  const directReports = useMemo(() => data?.users.filter((u) => u.managerId === currentUser?.id) || [], [data, currentUser]);

  // Set form of workingDayOverrides for date.js's isOffDay/isWorkingDay/etc, which check
  // membership by ISO date string - a Set beats re-scanning the array on every day cell render.
  const workingDayOverridesSet = useMemo(() => new Set(data?.workingDayOverrides || []), [data?.workingDayOverrides]);

  function setCurrentUserId(userId: string) {
    setSession((s) => ({ ...s, currentUserId: userId }));
  }

  function getTimesheet(userId: string, monthStartDate: string) {
    return data!.timesheets.find((t) => t.userId === userId && t.monthStartDate === monthStartDate) || null;
  }

  function getUserById(userId: string | null | undefined) {
    return data!.users.find((u) => u.id === userId) || null;
  }

  function getAssignedTasks(userId: string) {
    const taskIds = data!.assignments[userId] || [];
    return data!.tasks.filter((t) => taskIds.includes(t.id));
  }

  // One yearly leave pool per user (defaults to 24 until a manager adjusts it).
  function getLeaveBalance(userId: string) {
    return data!.leaveBalances.find((b) => b.userId === userId) || { userId, allocated: 24, used: 0, balance: 24 };
  }

  // Manager action: sets a direct report's yearly allocation directly - same "edit it in place"
  // pattern as toggling an assigned task.
  async function setLeaveAllocation(userId: string, allocated: number) {
    const updated = await api(`/leave-balances/${userId}`, { method: 'PUT', body: JSON.stringify({ allocated }) });
    setData((d) => ({
      ...d!,
      leaveBalances: d!.leaveBalances.some((b) => b.userId === userId)
        ? d!.leaveBalances.map((b) => (b.userId === userId ? updated : b))
        : [...d!.leaveBalances, updated],
    }));
    return updated;
  }

  function upsertTimesheet(ts: AnyRecord) {
    setData((d) => {
      const exists = d!.timesheets.some((t) => t.id === ts.id);
      return { ...d!, timesheets: exists ? d!.timesheets.map((t) => (t.id === ts.id ? ts : t)) : [...d!.timesheets, ts] };
    });
  }

  // Re-pulls one user's leave balance from the server - `used`/`balance` are computed there from
  // actual timesheet_entries, so this is how a balance picks up a leave day the moment it's
  // saved, without trusting a locally-recomputed count to stay in sync. Scoped to a single user
  // (not the whole team) so it stays fast on every autosave.
  async function refreshLeaveBalance(userId: string) {
    try {
      const updated = await api(`/leave-balances/${userId}`);
      setData((d) => ({
        ...d!,
        leaveBalances: d!.leaveBalances.some((b) => b.userId === userId)
          ? d!.leaveBalances.map((b) => (b.userId === userId ? updated : b))
          : [...d!.leaveBalances, updated],
      }));
    } catch (err) {
      console.error('Failed to refresh leave balance:', err);
    }
  }

  // Persist the current in-progress entries for a user's month as a Draft. Editing a Rejected
  // timesheet intentionally keeps its status Rejected (not Draft) so the rejection banner/comment
  // stays visible - enforced server-side.
  async function saveDraftEntries(userId: string, monthStartDate: string, entries: AnyRecord[]) {
    try {
      upsertTimesheet(await api('/timesheets/draft', { method: 'POST', body: JSON.stringify({ userId, monthStartDate, entries }) }));
      refreshLeaveBalance(userId);
    } catch (err) {
      console.error('Failed to save draft:', err);
    }
  }

  // Upserts entries and transitions the month to Submitted (or Resubmitted, if it was previously
  // Rejected) - handled atomically server-side.
  async function submitForApproval(userId: string, monthStartDate: string, entries: AnyRecord[]) {
    try {
      upsertTimesheet(await api('/timesheets/submit', { method: 'POST', body: JSON.stringify({ userId, monthStartDate, entries }) }));
      refreshLeaveBalance(userId);
    } catch (err) {
      console.error('Failed to submit timesheet:', err);
    }
  }

  async function approveTimesheet(timesheetId: string, comment = '') {
    try {
      upsertTimesheet(await api(`/timesheets/${timesheetId}/approve`, { method: 'POST', body: JSON.stringify({ comment }) }));
    } catch (err) {
      console.error('Failed to approve timesheet:', err);
    }
  }

  async function rejectTimesheet(timesheetId: string, comment: string, actionLabel = 'Rejected') {
    const trimmed = comment.trim();
    if (!trimmed) throw new Error('A comment is required to reject a timesheet.');
    try {
      upsertTimesheet(
        await api(`/timesheets/${timesheetId}/reject`, { method: 'POST', body: JSON.stringify({ comment: trimmed, actionLabel }) })
      );
    } catch (err) {
      console.error('Failed to reject timesheet:', err);
    }
  }

  async function bulkApprove(timesheetIds: string[]) {
    try {
      const updated = await api('/timesheets/bulk-approve', { method: 'POST', body: JSON.stringify({ timesheetIds }) });
      setData((d) => ({ ...d!, timesheets: d!.timesheets.map((t) => updated.find((u: AnyRecord) => u.id === t.id) || t) }));
    } catch (err) {
      console.error('Failed to bulk-approve timesheets:', err);
    }
  }

  async function addProject(name: string) {
    try {
      const project = await api('/projects', { method: 'POST', body: JSON.stringify({ name }) });
      setData((d) => ({ ...d!, projects: [...d!.projects, project] }));
      return project;
    } catch (err) {
      console.error('Failed to add project:', err);
    }
  }

  async function updateProject(projectId: string, name: string) {
    try {
      const project = await api(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ name }) });
      setData((d) => ({ ...d!, projects: d!.projects.map((p) => (p.id === projectId ? project : p)) }));
    } catch (err) {
      console.error('Failed to update project:', err);
    }
  }

  // Deleting a project cascades server-side (its tasks, and any assignments referencing those
  // tasks); mirror that removal in local state too.
  async function deleteProject(projectId: string) {
    try {
      await api(`/projects/${projectId}`, { method: 'DELETE' });
      setData((d) => {
        const removedTaskIds = new Set(d!.tasks.filter((t) => t.projectId === projectId).map((t) => t.id));
        return {
          ...d!,
          projects: d!.projects.filter((p) => p.id !== projectId),
          tasks: d!.tasks.filter((t) => t.projectId !== projectId),
          assignments: Object.fromEntries(
            Object.entries(d!.assignments).map(([userId, taskIds]) => [userId, (taskIds as string[]).filter((id) => !removedTaskIds.has(id))])
          ),
        };
      });
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  }

  async function addTask(projectId: string, name: string) {
    try {
      const task = await api('/tasks', { method: 'POST', body: JSON.stringify({ projectId, name }) });
      setData((d) => ({ ...d!, tasks: [...d!.tasks, task] }));
      return task;
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  }

  async function updateTask(taskId: string, name: string) {
    try {
      const task = await api(`/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify({ name }) });
      setData((d) => ({ ...d!, tasks: d!.tasks.map((t) => (t.id === taskId ? task : t)) }));
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  }

  // Drops the task from every user's assignments server-side (cascade); mirror that removal in
  // local state too.
  async function deleteTask(taskId: string) {
    try {
      await api(`/tasks/${taskId}`, { method: 'DELETE' });
      setData((d) => ({
        ...d!,
        tasks: d!.tasks.filter((t) => t.id !== taskId),
        assignments: Object.fromEntries(
          Object.entries(d!.assignments).map(([userId, taskIds]) => [userId, (taskIds as string[]).filter((id) => id !== taskId)])
        ),
      }));
    } catch (err) {
      console.error('Failed to update assignments:', err);
    }
  }

  async function setUserAssignments(userId: string, taskIds: string[]) {
    try {
      await api(`/assignments/${userId}`, { method: 'PUT', body: JSON.stringify({ taskIds }) });
      setData((d) => ({ ...d!, assignments: { ...d!.assignments, [userId]: taskIds } }));
    } catch (err) {
      console.error('Failed to update assignments:', err);
    }
  }

  async function addDirectReport(name: string, email: string) {
    // No managerId in the body - the server derives it from this session's own verified token.
    const user = await api('/users', { method: 'POST', body: JSON.stringify({ name, email }) });
    setData((d) => ({ ...d!, users: [...d!.users, user] }));
    return user;
  }

  // The live-search pool for Manage Team's "Add employee" box - see server/src/routes/users.js's
  // GET /users/candidates. Fetched on demand by that screen (not part of loadAllData, since
  // nothing else needs it) and filtered client-side as the manager types, for an instant
  // type-ahead feel instead of a network round-trip per keystroke.
  async function fetchAddEmployeeCandidates() {
    return api('/users/candidates');
  }

  // Claims an employee who already exists (synced from a hub sign-in with no manager yet) onto
  // the current manager's team, instead of the "Add employee" form above which only ever creates
  // brand-new people. Self-service - the server 409s if someone else claimed them first.
  async function claimEmployee(userId: string) {
    const updated = await api(`/users/${userId}/claim`, { method: 'PUT' });
    setData((d) => ({
      ...d!,
      users: d!.users.map((u) => (u.id === updated.id ? updated : u)),
      unassignedEmployees: d!.unassignedEmployees.filter((u) => u.id !== userId),
    }));
    return updated;
  }

  // Everyone who could be picked as "my reporting manager" - see PickManager, the screen a
  // brand-new employee sees before anything else. Fetched on demand rather than in loadAllData
  // since it's only ever needed by that one screen.
  async function fetchManagers() {
    return api('/users/managers');
  }

  // A pending employee's own pick of who they report to (or a change of mind while still pending
  // - see AwaitingApproval). Updates the in-memory user record so the app can move straight from
  // "pick a manager" to "waiting for approval" without a full refetch.
  async function requestManager(managerId: string) {
    const updated = await api('/users/me/manager', { method: 'PUT', body: JSON.stringify({ managerId }) });
    setData((d) => ({ ...d!, users: d!.users.map((u) => (u.id === updated.id ? updated : u)) }));
    return updated;
  }

  // Re-reads one user's current record - used by AwaitingApproval to notice, without a full page
  // reload, the moment a manager approves them (status flips 'pending' -> 'active').
  async function refreshUser(userId: string) {
    const updated = await api(`/users/${userId}`);
    setData((d) => ({ ...d!, users: d!.users.map((u) => (u.id === updated.id ? updated : u)) }));
    return updated;
  }

  // Manage Team's "Requests waiting for your approval" section - people who've named the current
  // manager as theirs but aren't approved yet. Fetched on demand like fetchAddEmployeeCandidates.
  async function fetchPendingRequests() {
    return api('/users/pending-requests');
  }

  async function approveEmployee(userId: string) {
    const updated = await api(`/users/${userId}/approve`, { method: 'PUT' });
    setData((d) => ({ ...d!, users: d!.users.map((u) => (u.id === updated.id ? updated : u)) }));
    return updated;
  }

  async function rejectEmployee(userId: string) {
    const updated = await api(`/users/${userId}/reject`, { method: 'PUT' });
    setData((d) => ({ ...d!, users: d!.users.map((u) => (u.id === updated.id ? updated : u)) }));
    return updated;
  }

  // Removes an employee from the current manager's team - the inverse of claimEmployee above.
  // Server-side this also sends them back to 'pending' (see requestManager above) - they'll see
  // the pick-a-manager screen again the next time they open Timesheet, same as a brand-new
  // employee, rather than landing in unassignedEmployees with full access still intact. Their
  // timesheets, leave history, and task assignments all stay untouched.
  async function removeDirectReport(userId: string) {
    const updated = await api(`/users/${userId}/team`, { method: 'DELETE' });
    setData((d) => ({ ...d!, users: d!.users.map((u) => (u.id === updated.id ? updated : u)) }));
    return updated;
  }

  // Permanently deletes an employee - unlike removeDirectReport above (which just unassigns
  // them), this erases their account and everything tied to it. The server cascades the DB
  // delete to their assignments/timesheets/leave balance; here we mirror that by dropping them
  // from every piece of local state that's keyed by userId, so they vanish everywhere at once
  // instead of lingering in stale lists until the next refresh.
  async function deleteEmployee(userId: string) {
    await api(`/users/${userId}`, { method: 'DELETE' });
    setData((d) => {
      const { [userId]: _removedAssignments, ...assignments } = d!.assignments;
      return {
        ...d!,
        users: d!.users.filter((u) => u.id !== userId),
        assignments,
        timesheets: d!.timesheets.filter((t) => t.userId !== userId),
        leaveBalances: d!.leaveBalances.filter((b) => b.userId !== userId),
      };
    });
  }

  // Flips a specific Saturday (identified by its "YYYY-MM-DD" date) to a working day for the
  // current manager's own team - see server/src/routes/workingDayOverrides.js. Manager-only
  // server-side; scoped to the manager's own team automatically via their session, not a
  // client-supplied manager id.
  async function addWorkingDayOverride(date: string) {
    await api('/working-day-overrides', { method: 'POST', body: JSON.stringify({ date }) });
    setData((d) => (d!.workingDayOverrides.includes(date) ? d! : { ...d!, workingDayOverrides: [...d!.workingDayOverrides, date].sort() }));
  }

  // Reverts a Saturday back to the default 2nd/4th-off rule.
  async function removeWorkingDayOverride(date: string) {
    await api(`/working-day-overrides/${date}`, { method: 'DELETE' });
    setData((d) => ({ ...d!, workingDayOverrides: d!.workingDayOverrides.filter((x) => x !== date) }));
  }

  function resetDemoData() {
    refresh();
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel max-w-sm p-6 text-center">
          <p className="text-sm font-semibold text-red">Couldn&apos;t reach the TimeSheet server</p>
          <p className="mt-1 text-sm text-ink">{loadError}</p>
          <button type="button" onClick={loadErrorIsAuth ? retryHubBootstrap : refresh} className="btn-danger mt-4 w-full">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // !hubBootstrapped covers the moment between mount and the hub sign-in check (above) resolving
  // - so the manual Login screen never flashes for someone who's about to be signed straight in
  // via the hub. Once bootstrapped, `data` is only required for an already-logged-in session (hub
  // or demo) - Login itself renders fine with data still null, using demoUsers instead (no
  // session token exists yet to load real data with).
  if (!hubBootstrapped || (session.isLoggedIn && !data)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }

  // A hub token WAS found (this is a real person inside the EmamiApps hub, not standalone dev)
  // but the Manage Access role lookup failed - never fall through to the manual "Log in as"
  // screen here, since its free-pick dropdown would let them sign in as anyone, including a
  // manager. Show a retryable error instead; the demo picker below is only reachable when
  // hubEmailDetected is false (i.e. no hub token at all).
  if (hubEmailDetected && hubError && !session.isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel max-w-sm p-6 text-center">
          <p className="text-sm font-semibold text-red">Couldn&apos;t verify your access</p>
          <p className="mt-1 text-sm text-ink">{hubError}</p>
          <button type="button" onClick={retryHubBootstrap} className="btn-danger mt-4 w-full">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Real deployment, but this browser never went through the hub at all (no session token
  // found) - most likely someone opened this URL directly instead of clicking the Timesheet tile
  // in the hub. Login's demo picker only exists for genuinely standalone local dev (see the DEV
  // check above) - showing it here would offer a working "log in as anyone" form on the real site
  // to a visitor who simply took the wrong path in.
  if (process.env.NODE_ENV === 'production' && !hubEmailDetected && !session.isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel max-w-sm p-6 text-center">
          <p className="text-sm font-semibold text-ink">Sign in through Emami Apps</p>
          <p className="mt-1 text-sm text-inkSoft">This page isn&apos;t reachable directly - open Timesheet from the Emami Apps hub instead.</p>
          <a href="/" className="btn-primary mt-4 w-full">
            Back to Emami Apps
          </a>
        </div>
      </div>
    );
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
    workingDayOverridesSet,
    addWorkingDayOverride,
    removeWorkingDayOverride,
    resetDemoData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
}
