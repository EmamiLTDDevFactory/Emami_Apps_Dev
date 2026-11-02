import { describe, expect, it } from 'vitest';
import { effectiveRole } from '@/lib/client/hubAccess';
import { PLANNER_ROLES } from '@/lib/plan/workspace';

describe('Costing Cockpit Admin has all access', () => {
  const bom = (role: string) => ({ appId: 'bom-cost-explorer', role });
  it('only this app\'s role counts; the Emami Apps access level does not', () => {
    expect(effectiveRole({ apps: [bom('Admin')] })).toBe('Admin');
    expect(effectiveRole({ accessLevel: 'Super Admin', apps: [bom('Planner')] } as never)).toBe('Planner');
    expect(effectiveRole({ accessLevel: 'Super Admin', apps: [bom('User')] } as never)).toBe('User');
    expect(effectiveRole({ apps: [{ appId: 'mediclaim', role: 'Admin' }] })).toBe(''); // Admin of another app only
  });
  it('Admin can do everything a Planner can (plan upload, edit, WIP)', () => {
    expect(PLANNER_ROLES).toContain('Admin');
  });
});
