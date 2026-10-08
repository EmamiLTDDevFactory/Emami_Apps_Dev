import { appName } from './apps';
import type { AccessChange, AccessLevel } from './api';

const DAY = 86_400_000;

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
export const fmtNum = (n: number) => n.toLocaleString('en-IN');

/** "3h ago", "yesterday", "12 days ago" - for last-login columns. */
export function relative(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)}h ago`;
  const d = Math.floor(ms / DAY);
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}

export type Recency = 'today' | 'week' | 'month' | 'stale' | 'never';
export const RECENCY: { id: Recency; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
  { id: 'stale', label: 'Over 30 days' },
  { id: 'never', label: 'Never signed in' },
];
export function recencyOf(iso: string | null): Recency {
  if (!iso) return 'never';
  const ms = Date.now() - Date.parse(iso);
  if (ms < DAY) return 'today';
  if (ms < 7 * DAY) return 'week';
  if (ms < 30 * DAY) return 'month';
  return 'stale';
}

export const LEVELS: AccessLevel[] = ['Super Admin', 'Admin', 'Viewer'];
export const levelColor = (l: AccessLevel) => (l === 'Super Admin' ? 'var(--lvl-super)' : l === 'Admin' ? 'var(--lvl-admin)' : 'var(--lvl-viewer)');

export const CHANGE_LABEL: Record<AccessChange['changeType'], string> = {
  USER_ADDED: 'User added',
  USER_REMOVED: 'User removed',
  ACTIVE_STATUS: 'Status',
  ACCESS_LEVEL: 'Access level',
  APP_ROLE: 'App access',
  MOBILE_SET: 'Mobile',
};

/** One change-history row as a readable sentence (same wording as the hub's Administration feed). */
export function describeChange(c: AccessChange): string {
  switch (c.changeType) {
    case 'USER_ADDED':
      return 'Added to Emami Apps';
    case 'USER_REMOVED':
      return 'Removed from Emami Apps';
    case 'ACTIVE_STATUS':
      return c.newValue === 'true' ? 'Activated' : 'Deactivated';
    case 'ACCESS_LEVEL':
      return `Access level ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`;
    case 'APP_ROLE': {
      const app = appName(c.appId);
      if (!c.oldValue) return `Granted ${app} as ${c.newValue}`;
      if (!c.newValue) return `Revoked ${app} (was ${c.oldValue})`;
      return `${app} role ${c.oldValue} → ${c.newValue}`;
    }
    case 'MOBILE_SET':
      return c.newValue ? `Mobile set to ${c.newValue}` : 'Mobile cleared';
  }
}

/** Grant / revoke / neutral - picks the feed icon's tone. */
export function changeTone(c: AccessChange): 'good' | 'bad' | 'accent' {
  if (c.changeType === 'USER_ADDED') return 'good';
  if (c.changeType === 'USER_REMOVED') return 'bad';
  if (c.changeType === 'ACTIVE_STATUS') return c.newValue === 'true' ? 'good' : 'bad';
  if (c.changeType === 'APP_ROLE') return !c.oldValue ? 'good' : !c.newValue ? 'bad' : 'accent';
  return 'accent';
}

/** Rows -> CSV download (UTF-8 BOM so Excel opens it with the right encoding). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v);
    // Neutralise spreadsheet formulas (same VAPT rule as Salescode's export).
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const stamp = () => new Date().toISOString().slice(0, 10);

/** 75 -> "1m 15s", 3900 -> "1h 5m" - session lengths are often under a minute. */
export function fmtDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
export const fmtWeekday = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short' });

/** The roster's timeSpent string, or a dash when the backend sent a negative interval
 * (a mispaired SESSION_END; the backend now blanks these itself once deployed). */
export const timeSpentLabel = (s: string | null | undefined) => (!s || s.includes('-') ? '—' : s);
