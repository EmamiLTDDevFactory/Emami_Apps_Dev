'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getHubEmail, loginWithHubEmail } from '../lib/hubEmailLogin';
import { resolveIsAdmin } from '../lib/adminAccess';
import { EmployeeProfile, UserRole } from '../types';

interface AuthContextType {
  activeRole: UserRole | null;
  currentUser: EmployeeProfile | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (employeeId: string, role: UserRole, name?: string, info?: any) => boolean;
  logout: () => void;
  setActiveRole: (role: UserRole | null) => void;
  // QA-only: lets RoleSwitcher toggle these independently of a real SAP login, since they're now
  // real state (not mutated on the PROFILES object) so toggling one actually re-renders.
  setCapabilityFlags: (flags: { isManager?: boolean; isFinance?: boolean; isAdmin?: boolean }) => void;
  validEmployeeIds: string[];
}

const PROFILES: Record<UserRole, EmployeeProfile> = {
  employee: {
    employeeId: 'EMP-9021',
    employeeName: 'John Doe',
    department: 'Sales & Marketing',
    designation: 'Senior Sales Representative',
    role: 'employee',
  },
  manager: {
    employeeId: 'MGR-4052',
    employeeName: 'Sarah Connor',
    department: 'Sales & Marketing',
    designation: 'Regional Sales Manager',
    role: 'manager',
  },
  finance: {
    employeeId: 'FIN-1092',
    employeeName: 'Robert Miller',
    department: 'Finance & Accounts',
    designation: 'Financial Claims Analyst',
    role: 'finance',
  },
  B: {
    employeeId: 'TOP-0001',
    employeeName: 'Priya Sharma',
    department: 'Finance & Accounts',
    designation: 'Top Level Approver',
    role: 'B',
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// SAP's LoginSet returns IsManager/IsFinance as either a real boolean or the legacy XFELD string
// 'X' - same ambiguity ExptypeSet.IsMobile already needed this exact check for.
const asFlag = (value: unknown): boolean => value === true || value === 'X';

const normalizeRole = (role: unknown): UserRole | null => {
  if (typeof role !== 'string') return null;
  const trimmed = role.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'employee' || lower === 'manager' || lower === 'finance') {
    return lower as UserRole;
  }
  if (trimmed.toUpperCase() === 'B') {
    return 'B';
  }
  return null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  // Independent capability flags from SAP's LoginSet (live 2026-11-25) - real state (not mutated
  // on the PROFILES object) so one person can hold any combination, and toggling one via
  // setCapabilityFlags (RoleSwitcher's QA aid) actually triggers a re-render.
  const [isManager, setIsManager] = useState(false);
  const [isFinance, setIsFinance] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const currentUser = activeRole ? { ...PROFILES[activeRole], isManager, isFinance, isAdmin } : null;
  const isAuthenticated = !!activeRole;

  const setCapabilityFlags = (flags: { isManager?: boolean; isFinance?: boolean; isAdmin?: boolean }) => {
    if (flags.isManager !== undefined) setIsManager(flags.isManager);
    if (flags.isFinance !== undefined) setIsFinance(flags.isFinance);
    if (flags.isAdmin !== undefined) setIsAdmin(flags.isAdmin);
  };

  const validEmployeeIds = Object.values(PROFILES).map((p) => p.employeeId);

  useEffect(() => {
    // Tries logging in via the email the EmamiApps hub already captured (same-origin
    // localStorage), calling SAP's LoginSet with only that email — skips the Employee ID + OTP
    // screen entirely when it succeeds. Only reached when there's no existing non-ctc-expense
    // session to restore, so it never overrides an already-active session in this tab. See
    // src/lib/hubEmailLogin.ts for what happens if there's no hub email or the SAP call fails.
    const tryHubEmailLogin = async (): Promise<boolean> => {
      const hubEmail = getHubEmail();
      if (!hubEmail) {
        // No hub session at all — most likely a direct/shared link opened by someone who never
        // signed into the hub. The Employee ID + OTP screen is legacy from before the hub/SSO
        // integration and shouldn't be reachable anymore; bounce to the hub instead.
        if (typeof window !== 'undefined') {
          window.location.href = '/';
          return true;
        }
        return false;
      }
      const result = await loginWithHubEmail(hubEmail);
      if (!result.ok || !result.employeeId || !result.role) {
        console.warn('[hub-email-login] Hub email did not resolve in SAP:', result.error);
        // The visitor came in from the hub, so they ARE signed in — SAP simply has no expense
        // record for their email. Showing this app's Employee ID + OTP screen would be wrong:
        // there is nothing useful for them to type and it reads as a second, broken login. Send
        // them back to the Emami Apps dashboard instead.
        if (typeof window !== 'undefined') {
          window.location.href = '/';
          return true;
        }
        return false;
      }
      login(result.employeeId, result.role, result.name, result.info);
      return true;
    };

    const restoreSession = async () => {
      try {
        const savedSession = typeof window !== 'undefined' && window.sessionStorage
          ? window.sessionStorage.getItem('user_session')
          : null;

        if (!savedSession) {
          await tryHubEmailLogin();
          return;
        }

        const parsedSession = JSON.parse(savedSession);
        const role = normalizeRole(parsedSession?.role);
        const employeeId = parsedSession?.employeeId;
        const name = parsedSession?.name;

        if (!role || !employeeId || !PROFILES[role]) {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.removeItem('user_session');
          }
          await tryHubEmailLogin();
          return;
        }

        PROFILES[role].employeeId = employeeId;
        if (name) {
          PROFILES[role].name = name;
          PROFILES[role].employeeName = name;
        }
        // restore any extra info saved during login
        const info = parsedSession?.info;
        if (info) {
          if (info.Department) PROFILES[role].department = info.Department;
          if (info.Designation) PROFILES[role].designation = info.Designation;
          const rawCc = info.CostCenter || info.costCenter || info.Costcenter || (PROFILES[role] as any).costCenter || '';
          const ltext = info.Ltext || info.ltext || info.LTEXT || info.LText || '';
          const formattedCc = (rawCc && ltext && !String(rawCc).includes('(')) ? `${rawCc} (${ltext})` : rawCc;
          (PROFILES[role] as any).costCenter = formattedCc;
          (PROFILES[role] as any).CostCenter = formattedCc;
          (PROFILES[role] as any).gst = info.GstSet || info.Gst || info.gst || (PROFILES[role] as any).gst;
        }
        // Re-resolved on every restore rather than trusted from the persisted session - the
        // backend flag or the local test allowlist can change between sessions.
        setIsAdmin(resolveIsAdmin(info, employeeId));
        setIsManager(asFlag(info?.IsManager));
        setIsFinance(asFlag(info?.IsFinance));
        setActiveRole(role);
      } catch (error) {
        console.error('Failed to restore user session:', error);
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem('user_session');
        }
      } finally {
        setIsInitializing(false);
      }
    };

    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (employeeId: string, role: UserRole, name?: string, info?: any): boolean => {
    setActiveRole(role);
    if (PROFILES[role]) {
      PROFILES[role].employeeId = employeeId;
      if (name) {
        PROFILES[role].name = name;
        PROFILES[role].employeeName = name;
      }

      try {
        if (info) {
          if (info.Department) PROFILES[role].department = info.Department;
          if (info.designation) PROFILES[role].designation = info.designation;
          if (info.Designation) PROFILES[role].designation = info.Designation;
          if (info.employeeName) PROFILES[role].employeeName = info.employeeName;
          if (info.Name) PROFILES[role].employeeName = info.Name;
          const rawCc = info.CostCenter || info.costCenter || info.Costcenter || (PROFILES[role] as any).costCenter || '';
          const ltext = info.Ltext || info.ltext || info.LTEXT || info.LText || '';
          const formattedCc = (rawCc && ltext && !String(rawCc).includes('(')) ? `${rawCc} (${ltext})` : rawCc;
          (PROFILES[role] as any).costCenter = formattedCc;
          (PROFILES[role] as any).CostCenter = formattedCc;
          (PROFILES[role] as any).gst = info.GstSet || info.Gst || info.gst || (PROFILES[role] as any).gst;
        }
      } catch (e) {
        console.warn('Failed to map extra profile fields', e);
      }

      setIsAdmin(resolveIsAdmin(info, employeeId));
      setIsManager(asFlag(info?.IsManager));
      setIsFinance(asFlag(info?.IsFinance));

      const sessionData = JSON.stringify({ role, employeeId, name, info });
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem('user_session', sessionData);
      }
    }
    return true;
  };

  const logout = () => {
    setActiveRole(null);
    setIsManager(false);
    setIsFinance(false);
    setIsAdmin(false);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem('user_session');
    }
  };

  return (
    <AuthContext.Provider value={{ activeRole, currentUser, isAuthenticated, isInitializing, login, logout, setActiveRole, setCapabilityFlags, validEmployeeIds }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
