// Exports the Manage Access roster to an .xlsx workbook — one row per user, one column per app
// (role or blank). Web-only build, so this is just XLSX.writeFile — no native
// expo-file-system/expo-sharing fallback needed (see the pre-conversion RN version for that path).
import * as XLSX from 'xlsx';
import type { AppItem, UserAccessEntry } from '../types';

export async function exportUsersToExcel(users: UserAccessEntry[], apps: AppItem[]): Promise<void> {
  const rows = users.map((user) => {
    const row: Record<string, string> = {
      Email: user.email,
      Mobile: user.mobile || '',
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
  worksheet['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, ...apps.map(() => ({ wch: 12 }))];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Manage Access');

  const stamp = new Date();
  const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(workbook, `manage-access-${ymd}.xlsx`);
}
