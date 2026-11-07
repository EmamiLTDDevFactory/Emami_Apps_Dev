'use client';
import { createContext, useContext } from 'react';
import type { TicketQuery } from './api';
import type { Scope } from './permissions';
import type { AgentPrefs, AttachmentsInfo, Me, Meta } from './types';

export type Screen = 'dashboard' | 'tickets' | 'board' | 'new' | 'reports' | 'admin' | 'ticket' | 'helpdesk' | 'analytics' | 'contacts' | 'solutions' | 'approvals' | 'calendar' | 'registers' | 'programme';

export interface Samadhan {
  me: Me;
  meta: Meta;
  mailEnabled: boolean;
  whatsappEnabled: boolean;
  /** Re-read reference data (after an Admin change to groups, fields, canned responses ...). */
  reloadMeta: () => Promise<void>;
  openTicket: (id: number) => void;
  /** Go to the ticket list with preset filters (dashboard drill-downs). */
  openList: (preset?: TicketQuery) => void;
  go: (s: Screen) => void;
  /** New ticket screen with values filled in (a child ticket copies its parent's requester and distributor). */
  newTicket: (preset?: NewTicketPreset) => void;
  /** Ticket ids of the list the agent last opened a ticket from (Previous / Next on the ticket screen). */
  listIds: number[];
  setListIds: (ids: number[]) => void;
  /** Base role from Manage Access (kept for display; use can() for what a person may do). */
  isSupervisor: boolean;
  isAdmin: boolean;
  /** v7: true when the person holds this permission key (Authorization cockpit; falls back to the role rules on an older backend). */
  can: (key: string) => boolean;
  /** v7 data scope: which tickets the person sees (all / groups / own). */
  scope: Scope;
  /** v7 attachments: on / off on this server and the limits (null on an older backend = off). */
  attachments: AttachmentsInfo | null;
  /** The agent's own settings (My preferences). */
  prefs: AgentPrefs;
  /** v7 Phase 3: the workspace switcher - '' = All. Always '' while the multi-desk mode is off. */
  workspace: string;
  setWorkspace: (key: string) => void;
  /** Remember an application as recently used (New ticket shows recent ones first). */
  rememberApp: (applicationId: number) => void;
}

export type NewTicketPreset = { parentId?: number; [key: string]: string | number | undefined };

export const SamadhanContext = createContext<Samadhan | null>(null);

export function useSamadhan(): Samadhan {
  const ctx = useContext(SamadhanContext);
  if (!ctx) throw new Error('useSamadhan outside SamadhanContext');
  return ctx;
}
