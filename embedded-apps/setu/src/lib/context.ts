'use client';
import { createContext, useContext } from 'react';
import type { TicketQuery } from './api';
import type { Me, Meta } from './types';

export type Screen = 'dashboard' | 'tickets' | 'board' | 'new' | 'reports' | 'admin' | 'ticket';

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
  isSupervisor: boolean;
  isAdmin: boolean;
}

export const SetuContext = createContext<Setu | null>(null);

export function useSetu(): Setu {
  const ctx = useContext(SetuContext);
  if (!ctx) throw new Error('useSetu outside SetuContext');
  return ctx;
}
