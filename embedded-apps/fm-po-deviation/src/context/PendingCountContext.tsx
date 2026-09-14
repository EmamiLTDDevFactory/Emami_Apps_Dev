'use client';

import { createContext, useContext, useState } from 'react';

interface PendingCountValue {
  count: number;
  setCount: (n: number) => void;
}

// Lets the Home page (which owns the actual pending-approvals fetch) tell the sidebar how many
// items need action, without the sidebar needing its own separate SAP/mock call — one fetch, one
// source of truth, just shared up to Shell.tsx's nav badge via context instead of prop-drilling
// through the App Router's layout boundary.
const PendingCountContext = createContext<PendingCountValue>({ count: 0, setCount: () => {} });

export function PendingCountProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  return <PendingCountContext.Provider value={{ count, setCount }}>{children}</PendingCountContext.Provider>;
}

export function usePendingCount(): PendingCountValue {
  return useContext(PendingCountContext);
}
