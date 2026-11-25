'use client';

// QA-only aid: toggles the independent Manager/Finance/Admin capability flags directly (bypassing
// SAP's LoginSet resolution), so every combination (manager+finance, finance+admin, all three,
// etc.) can be tested without a real SAP-provisioned test account for each one. Never a real auth
// path. Always runs as the base 'employee' profile - the flags are what actually gate tabs/
// actions now, not which PROFILES bucket is active (see AuthContext.tsx).
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { cx } from './ui';

const TOGGLES: { key: 'isManager' | 'isFinance' | 'isAdmin'; label: string }[] = [
  { key: 'isManager', label: 'Manager' },
  { key: 'isFinance', label: 'Finance' },
  { key: 'isAdmin', label: 'Admin' },
];

export function RoleSwitcher() {
  const { activeRole, currentUser, setActiveRole, setCapabilityFlags } = useAuth();

  // Ensures there's always a base profile active so the flags below have somewhere to attach -
  // without this, toggling a capability while logged out would do nothing visible.
  useEffect(() => {
    if (!activeRole) setActiveRole('employee');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole]);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-amber/40 bg-amberBg px-2 py-1">
      <span className="text-2xs font-bold uppercase tracking-wide text-amber">QA Role</span>
      {TOGGLES.map((t) => {
        const on = !!currentUser?.[t.key];
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setCapabilityFlags({ [t.key]: !on })}
            className={cx(
              'rounded-md px-2 py-0.5 text-xs font-semibold transition-colors',
              on ? 'bg-amber text-white' : 'text-amber hover:bg-amber/10'
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
