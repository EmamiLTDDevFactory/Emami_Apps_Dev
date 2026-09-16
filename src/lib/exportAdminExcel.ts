// Exports the Administration tab's full dataset to one .xlsx workbook, three sheets — one per
// level the screen shows (org-wide overview, per-user roster+usage, per-app usage) — so "download
// everything" is a single action instead of three separate exports. Same SheetJS +
// expo-file-system/expo-sharing pattern as exportUsersExcel.ts (web downloads directly via
// XLSX.writeFile; native writes to the cache dir and hands off to the share sheet).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import { appById } from '../data/mockData';
import type { AdminAppStat, AdminOverview, AdminRosterEntry } from './adminApi';

function appLabel(appId: string): string {
  return appById(appId)?.name || appId;
}

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
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

export async function exportAdministrationReportToExcel(
  overview: AdminOverview,
  roster: AdminRosterEntry[],
  appStats: AdminAppStat[]
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

  const stamp = new Date();
  const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`;
  const filename = `administration-report-${ymd}.xlsx`;

  if (Platform.OS === 'web') {
    XLSX.writeFile(workbook, filename);
    return;
  }

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: filename,
    });
  }
}
