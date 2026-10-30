'use client';
import { createContext, useContext } from 'react';
import type { TicketQuery } from './api';
import type { Me, Meta } from './types';

export type Screen = 'dashboard' | 'tickets' | 'board' | 'new' | 'reports' | 'admin' | 'ticket' | 'helpdesk' | 'analytics' | 'contacts' | 'solutions';

export interface Setu {
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
  isSupervisor: boolean;
  isAdmin: boolean;
}

export type NewTicketPreset = { parentId?: number; [key: string]: string | number | undefined };

export const SetuContext = createContext<Setu | null>(null);

export function useSetu(): Setu {
  const ctx = useContext(SetuContext);
  if (!ctx) throw new Error('useSetu outside SetuContext');
  return ctx;
}
