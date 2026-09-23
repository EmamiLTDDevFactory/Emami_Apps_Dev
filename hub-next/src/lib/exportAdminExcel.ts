// Exports the Administration tab's data to .xlsx workbooks. Web-only build, so this is just
// XLSX.writeFile — no native expo-file-system/expo-sharing fallback needed (see the
// pre-conversion RN version for that path).
import * as XLSX from 'xlsx';
import { appById } from '../data/mockData';
import type { UserProfile } from './authApi';
import type { AdminAppStat, AdminAppUserStat, AdminOverview, AdminRosterEntry, AdminUserAppStat } from './adminApi';
import type { AccessChangeEntry } from '../types';

function appLabel(appId: string): string {
  return appById(appId)?.name || appId;
}

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function dateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function overviewRows(overview: AdminOverview): Record<string, string | number>[] {
  return [
    { Metric: 'Total Authorized Users', Value: overview.totalAuthorizedUsers },
    { Metric: 'Active Authorized Users', Value: overview.activeAuthorizedUsers },
    { Metric: 'Active in Last 7 Days', Value: overview.activeLast7Days },
    { Metric: 'Active in Last 30 Days', Value: overview.activeLast30Days },
    { Metric: 'Never Logged In', Value: overview.neverLoggedIn },
    { Metric: 'Total Logins (all-time)', Value: overview.totalLogins },
    { Metric: 'Total App Opens (all-time)', Value: overview.totalAppOpens },
    { Metric: 'Most Used App', Value: overview.mostUsedApp ? appLabel(overview.mostUsedApp.appId) : '—' },
    { Metric: 'Most Used App — Opens', Value: overview.mostUsedApp?.opens ?? 0 },
  ];
}

function rosterRows(roster: AdminRosterEntry[]): Record<string, string | number>[] {
  return roster.map((user) => ({
    Email: user.email,
    Status: user.isActive ? 'Active' : 'Inactive',
    'Access Level': user.accessLevel,
    'Granted Apps': user.apps.map((a) => `${appLabel(a.appId)} (${a.role})`).join('; ') || '—',
    'Has Logged In': user.usage.hasLoggedIn ? 'Yes' : 'No',
    'Last Login': formatDateTime(user.usage.lastLogin),
    Logins: user.usage.logins,
    Sessions: user.usage.sessionsTotal,
    'Time Spent': user.usage.timeSpent,
    'Apps Opened': user.usage.appsOpened,
    'Most Used App': user.usage.mostUsedApp ? appLabel(user.usage.mostUsedApp) : '—',
  }));
}

function appStatRows(appStats: AdminAppStat[]): Record<string, string | number>[] {
  return appStats.map((stat) => ({
    App: appLabel(stat.appId),
    'Total Opens': stat.opens,
    'Unique Users': stat.uniqueUsers,
    'First Opened': formatDateTime(stat.firstOpened),
    'Last Opened': formatDateTime(stat.lastOpened),
  }));
}

function changeHistoryRows(changes: AccessChangeEntry[]): Record<string, string | number>[] {
  return changes.map((c) => ({
    'When': formatDateTime(c.occurredAt),
    'User': c.targetEmail,
    'Changed By': c.changedBy || '—',
    'Change': c.changeType,
    App: c.appId ? appLabel(c.appId) : '',
    From: c.oldValue || '',
    To: c.newValue || '',
  }));
}

/** Just the App-wise Usage sheet, standalone — for the dedicated download button on that section
 * of the Administration screen, separate from the combined report below. */
export async function exportAppStatsToExcel(appStats: AdminAppStat[]): Promise<void> {
  const worksheet = XLSX.utils.json_to_sheet(appStatRows(appStats));
  worksheet['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'App-wise Usage');
  XLSX.writeFile(workbook, `app-wise-usage-${dateStamp()}.xlsx`);
}

export async function exportAdministrationReportToExcel(
  overview: AdminOverview,
  roster: AdminRosterEntry[],
  appStats: AdminAppStat[],
  changeHistory?: AccessChangeEntry[]
): Promise<void> {
  const workbook = XLSX.utils.book_new();

  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows(overview));
  overviewSheet['!cols'] = [{ wch: 28 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

  const rosterSheet = XLSX.utils.json_to_sheet(rosterRows(roster));
  rosterSheet['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 20 }, { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, rosterSheet, 'User Roster & Usage');

  const appSheet = XLSX.utils.json_to_sheet(appStatRows(appStats));
  appSheet['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, appSheet, 'App-wise Usage');

  if (changeHistory && changeHistory.length > 0) {
    const historySheet = XLSX.utils.json_to_sheet(changeHistoryRows(changeHistory));
    historySheet['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, historySheet, 'Change History');
  }

  XLSX.writeFile(workbook, `administration-report-${dateStamp()}.xlsx`);
}

/** Every user's usage of ONE specific app — the App-wise Usage section's per-app drill-down
 * export (its own row's "Download" button, not the section-wide one above). */
export async function exportAppUserStatsToExcel(appId: string, users: AdminAppUserStat[]): Promise<void> {
  const rows = users.map((u) => ({
    Email: u.email,
    'Total Opens': u.opens,
    'First Opened': formatDateTime(u.firstOpened),
    'Last Opened': formatDateTime(u.lastOpened),
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
  const workbook = XLSX.utils.book_new();
  // Sheet names are capped at 31 chars by the xlsx format itself.
  XLSX.utils.book_append_sheet(workbook, worksheet, appLabel(appId).slice(0, 31));
  XLSX.writeFile(workbook, `app-usage-${appId}-${dateStamp()}.xlsx`);
}

/** One specific user's full report — summary stats plus their per-app breakdown — for the
 * "Download" button in the roster's user-detail dialog. `profile` and `appStats` may still be
 * loading/empty (e.g. a user who's never logged in); the sheets just read "—"/0 in that case
 * rather than the button being blocked on them. */
export async function exportUserReportToExcel(
  user: AdminRosterEntry,
  profile: UserProfile | null,
  appStats: AdminUserAppStat[],
  history?: AccessChangeEntry[]
): Promise<void> {
  const workbook = XLSX.utils.book_new();

  const summaryRows: Record<string, string | number>[] = [
    { Field: 'Email', Value: user.email },
    { Field: 'Status', Value: user.isActive ? 'Active' : 'Inactive' },
    { Field: 'Access Level', Value: user.accessLevel },
    { Field: 'Last Login', Value: formatDateTime(user.usage.lastLogin) },
    { Field: 'Total Logins', Value: user.usage.logins },
    { Field: 'Sessions', Value: user.usage.sessionsTotal },
    { Field: 'Time Spent', Value: user.usage.timeSpent },
    { Field: 'Apps Opened', Value: user.usage.appsOpened },
    { Field: 'Most Used App', Value: user.usage.mostUsedApp ? appLabel(user.usage.mostUsedApp) : '—' },
    { Field: 'Downloads', Value: profile?.downloads ?? '—' },
    { Field: 'Favorites Added', Value: profile?.favoritesAdded ?? '—' },
    { Field: 'Notifications Read', Value: profile?.notificationsRead ?? '—' },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 22 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const appRows = user.apps.map((grant) => {
    const stat = appStats.find((s) => s.appId === grant.appId);
    return {
      App: appLabel(grant.appId),
      Role: grant.role,
      Opens: stat?.opens ?? 0,
      'First Opened': formatDateTime(stat?.firstOpened ?? null),
      'Last Opened': formatDateTime(stat?.lastOpened ?? null),
    };
  });
  const appSheet = XLSX.utils.json_to_sheet(
    appRows.length > 0 ? appRows : [{ App: 'No app grants', Role: '', Opens: '', 'First Opened': '', 'Last Opened': '' }]
  );
  appSheet['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, appSheet, 'App Usage');

  if (history && history.length > 0) {
    const historySheet = XLSX.utils.json_to_sheet(changeHistoryRows(history));
    historySheet['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, historySheet, 'Change History');
  }

  const safeEmail = user.email.replace(/[^a-z0-9]+/gi, '-');
  XLSX.writeFile(workbook, `user-report-${safeEmail}-${dateStamp()}.xlsx`);
}
