'use client';
/**
 * Who may use the Margin module. The hub's Manage Access role of this app decides ("Admin" has everything): display needs Admin, "cogm" or "cogm-maint";
 * upload needs Admin or "cogm-maint". SAP's own authority check is the real gate. The role is fetched once per session. Fails closed.
 */
import { useEffect, useState } from 'react';
import { fetchAppRole } from '../client/hubAccess';

export const DISPLAY_ROLES = ['Admin', 'cogm', 'cogm-maint'];
export const MAINT_ROLES = ['Admin', 'cogm-maint'];
export const canDisplay = (role: string): boolean => DISPLAY_ROLES.includes(role);
export const canMaintain = (role: string): boolean => MAINT_ROLES.includes(role);

export function useMarginRole(email: string): 'checking' | string {
  const [role, setRole] = useState<'checking' | string>('checking');
  useEffect(() => { if (email) void fetchAppRole(email).then(setRole); }, [email]);
  return role;
}
