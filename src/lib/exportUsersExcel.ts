// Exports the Manage Access roster to an .xlsx workbook — one row per user, one column per app
// (role or blank). Same SheetJS + expo-file-system/expo-sharing pattern already used by
// embedded-apps/dispatch-tracker's lib/export.ts and embedded-apps/timesheet's exportTimesheet.js:
// web downloads directly via XLSX.writeFile, native writes to the cache dir and hands off to the
// share sheet (there's no direct "save to disk" on iOS/Android without it).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import type { AppItem, UserAccessEntry } from '../types';

export async function exportUsersToExcel(users: UserAccessEntry[], apps: AppItem[]): Promise<void> {
  const rows = users.map((user) => {
    const row: Record<string, string> = {
      Email: user.email,
      Status: user.isActive ? 'Active' : 'Inactive',
      'Access Level': user.accessLevel,
    };
    for (const app of apps) {
      row[app.name] = user.apps.find((a) => a.appId === app.id)?.role ?? '';
    }
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  // Roughly-sized columns so the export is readable without a manual resize — email/app names are
  // the widest content, status/access level are short fixed vocab.
  worksheet['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 14 }, ...apps.map(() => ({ wch: 12 }))];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Manage Access');

  const stamp = new Date();
  const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`;
  const filename = `manage-access-${ymd}.xlsx`;

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
