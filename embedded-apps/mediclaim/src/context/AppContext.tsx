'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getHubEmail } from '../lib/hubEmailLogin';
import { fetchMediclaimRole, type MediclaimRole } from '../lib/hubAccessApi';
import { fetchEmployeeOrgDetails } from '../lib/orgService';
import { getMyMediclaimSubmission, submitMediclaimPolicy } from '../lib/policyService';
import type { EmployeeOrgDetails, MediclaimDraft, MediclaimSubmission } from '../types/policy';

interface AppContextValue {
  email: string | null;
  employee: EmployeeOrgDetails | null;
  role: MediclaimRole;
  isAdmin: boolean;
  myMediclaim: MediclaimSubmission | null;
  loading: boolean;
  error: string | null;
  submitMediclaim: (data: MediclaimDraft) => Promise<MediclaimSubmission>;
  refresh: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [employee, setEmployee] = useState<EmployeeOrgDetails | null>(null);
  const [role, setRole] = useState<MediclaimRole>('User');
  const [myMediclaim, setMyMediclaim] = useState<MediclaimSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    const hubEmail = getHubEmail();
    setEmail(hubEmail);
    if (!hubEmail) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchEmployeeOrgDetails(hubEmail),
      fetchMediclaimRole(hubEmail),
      getMyMediclaimSubmission(hubEmail),
    ])
      .then(([org, resolvedRole, mediclaim]) => {
        if (cancelled) return;
        setEmployee(org);
        setRole(resolvedRole);
        setMyMediclaim(mediclaim);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load your details.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const submitMediclaim = useCallback(
    async (data: MediclaimDraft) => {
      if (!employee) throw new Error('Employee details are not loaded yet.');
      const saved = await submitMediclaimPolicy(employee, data);
      setMyMediclaim(saved);
      return saved;
    },
    [employee]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      email,
      employee,
      role,
      isAdmin: role === 'Admin',
      myMediclaim,
      loading,
      error,
      submitMediclaim,
      refresh,
    }),
    [email, employee, role, myMediclaim, loading, error, submitMediclaim, refresh]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
}
