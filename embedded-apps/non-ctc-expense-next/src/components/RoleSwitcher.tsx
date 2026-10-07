'use client';

// QA-only aid: switches the active role directly (bypassing SAP role resolution) so every slice's
// cross-role testing (manager permissions, role-B bulk release, finance tax-modal skip) doesn't
// depend on having real SAP-provisioned test accounts for every role. Never a real auth path.
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { cx } from './ui';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'finance', label: 'Finance' },
  { value: 'B', label: 'Boss (B)' },
];

export function RoleSwitcher() {
  const { activeRole, setActiveRole } = useAuth();
  return (
    <div className="flex items-center gap-1 rounded-lg border border-amber/40 bg-amberBg px-2 py-1">
      <span className="text-2xs font-bold uppercase tracking-wide text-amber">QA Role</span>
      {ROLES.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => setActiveRole(r.value)}
          className={cx(
            'rounded-md px-2 py-0.5 text-xs font-semibold transition-colors',
            activeRole === r.value ? 'bg-amber text-white' : 'text-amber hover:bg-amber/10'
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
