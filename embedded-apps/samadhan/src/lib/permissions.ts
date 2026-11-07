import type { Role } from './types';

/*
   v7 permissions on the client. The server decides (backend/samadhan/middleware/permission.js); /me sends the
   person's effective keys and the frontend only hides what they cannot use. If the backend is older than v7 Phase 2
   (the frontend is published by Amplify before the backend is deployed by hand), /me has no keys: then the pre-v7
   role rules below apply, which match the seeded system profiles exactly.
*/

export type Visibility = 'all' | 'groups' | 'own';
/** v7 Phase 3: workspaces (keys) / applications (codes) may narrow the scope too; 'all' = no limit. */
export interface Scope { visibility: Visibility; workspaces?: 'all' | string[]; applications?: 'all' | string[] }

// Keys a pre-v7 Agent did not have (Supervisor and Admin did), and keys only an Admin had.
const SUPERVISOR_UP = new Set([
  'screen.analytics', 'screen.reports', 'ticket.export', 'ticket.moveWorkspace', 'ticket.overridePriority', 'ticket.declareMajor',
  'ticket.viewConfidential', 'ticket.setConfidential', 'ticket.pir.edit', 'attachment.delete', 'article.edit', 'article.publish',
  'views.share', 'report.variants.share', 'insights.refresh', 'company.create',
]);
const ADMIN_ONLY = new Set(['ticket.purge', 'canned.shared.manage', 'contact.anonymize', 'approval.decide', 'approval.override', 'change.freezeOverride']);

export function legacyCan(role: Role, key: string): boolean {
  if (role === 'Admin') return true;
  if (key.startsWith('admin.') || ADMIN_ONLY.has(key)) return false;
  if (SUPERVISOR_UP.has(key)) return role === 'Supervisor';
  return true;
}

export function makeCan(role: Role, permissions?: string[] | null): (key: string) => boolean {
  if (!Array.isArray(permissions)) return (key) => legacyCan(role, key);
  const set = new Set(permissions);
  return (key) => set.has(key);
}

/** The permission each screen needs (the screen guard and the menu use it). */
export const SCREEN_KEY = {
  dashboard: 'screen.dashboard', helpdesk: 'screen.helpdesk', tickets: 'screen.tickets', ticket: 'ticket.view', board: 'screen.board',
  new: 'screen.newTicket', contacts: 'screen.contacts', solutions: 'screen.solutions', analytics: 'screen.analytics',
  reports: 'screen.reports', admin: 'admin.general',
} as const;
