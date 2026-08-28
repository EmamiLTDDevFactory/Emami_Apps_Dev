import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import * as api from '@/lib/api';
import { getHubEmail, hasHubSession, hubLogoutUrl } from '@/lib/hubEmailLogin';
import { Invoice, Role, SapKpi } from '@/types/models';

export interface Session {
  email: string;
  role: Role;
  name: string;
  depots: string[];
  depot_number: string;
  depot_name: string;
  sap_kpi: SapKpi;
}

interface AuthState {
  session: Session | null;
  /** One-shot invoice list handed off by LoginSet, consumed once by the Dashboard cache — mirrors st.session_state._sap_inv_rows. */
  initialInvoices: Invoice[] | null;
  bootstrapping: boolean;
  readOnly: boolean;
  signOut: () => Promise<void>;
  consumeInitialInvoices: () => Invoice[] | null;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * No login screen anymore — identity comes entirely from the hub's own already-authenticated
 * session (see lib/hubEmailLogin.ts). SAP's LoginSet is deliberately never called here: it bundles
 * real OTP verification into the same call that returns role/depot/KPI data, and a blank Otp value
 * doesn't fail gracefully — it throws a backend short dump (verified live) — so it can't be reused
 * as an email-only role lookup the way MoldHealthCheck's ZmoldRoleSet entity can. There's no
 * separate role/depot lookup entity for this SAP service, so every hub-authenticated user gets the
 * same full ("depot") access instead of the old hq/depot split; the read-only HQ multi-depot view
 * this used to unlock is unreachable now (every `readOnly` check in the tab screens simply stays
 * false).
 */
const EMPTY_KPI: SapKpi = { pend_no: null, disp_no: null, comp_no: null, canc_no: null, ret_no: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialInvoices, setInitialInvoices] = useState<Invoice[] | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    (async () => {
      const email = getHubEmail();
      if (hasHubSession() && email) {
        await api.setToken(email);
        setSession({
          email,
          role: 'depot',
          name: email,
          depots: [],
          depot_number: '',
          depot_name: '',
          sap_kpi: EMPTY_KPI,
        });
      } else {
        await api.setToken(null);
      }
      setBootstrapping(false);
    })();
  }, []);

  async function signOut() {
    await api.setToken(null);
    setSession(null);
    setInitialInvoices(null);
    if (typeof window !== 'undefined') window.location.href = hubLogoutUrl();
  }

  function consumeInitialInvoices() {
    const rows = initialInvoices;
    setInitialInvoices(null);
    return rows;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        initialInvoices,
        bootstrapping,
        readOnly: session?.role === 'hq',
        signOut,
        consumeInitialInvoices,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
