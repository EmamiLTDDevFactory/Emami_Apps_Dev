import { describe, expect, it } from 'vitest';
import { effectiveRole } from '@/lib/client/hubAccess';
import { PLANNER_ROLES } from '@/lib/plan/workspace';

describe('Admin has all access', () => {
  const bom = (role: string) => ({ appId: 'bom-cost-explorer', role });
  it('this app\'s Admin role and Emami Apps Super Admin / Admin are Admin here; others keep their role', () => {
    expect(effectiveRole({ accessLevel: 'User', apps: [bom('Admin')] })).toBe('Admin');
    expect(effectiveRole({ accessLevel: 'Super Admin', apps: [bom('Planner')] })).toBe('Admin');
    expect(effectiveRole({ accessLevel: 'Admin', apps: [bom('User')] })).toBe('Admin');
    expect(effectiveRole({ accessLevel: 'User', apps: [bom('Planner')] })).toBe('Planner');
    expect(effectiveRole({ accessLevel: 'User', apps: [bom('User')] })).toBe('User');
    expect(effectiveRole({ accessLevel: 'User', apps: [{ appId: 'mediclaim', role: 'Admin' }] })).toBe(''); // Admin of another app only
  });
  it('Admin can do everything a Planner can (plan upload, edit, WIP)', () => {
    expect(PLANNER_ROLES).toContain('Admin');
  });
});
