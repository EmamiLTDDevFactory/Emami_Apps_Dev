'use client';
/**
 * Who may use Budget costing. The hub's Manage Access role of this app decides ("Admin" has everything): display = Admin, "budget-init" or "budget-approve";
 * initiate = Admin or "budget-init"; approve = Admin or "budget-approve". These role names are new: create them in Manage Access (roles are plain
 * strings there). SAP (zmm_cost_aprove + authority check) is the real gate. Fails closed.
 */
import { useEffect, useState } from 'react';
import { fetchAppRole } from '../client/hubAccess';

export const BUDGET_DISPLAY_ROLES = ['Admin', 'budget-init', 'budget-approve'];
export const BUDGET_INIT_ROLES = ['Admin', 'budget-init'];
export const BUDGET_APPROVE_ROLES = ['Admin', 'budget-approve'];
export const canDisplayBudget = (role: string): boolean => BUDGET_DISPLAY_ROLES.includes(role);
export const canInitiateBudget = (role: string): boolean => BUDGET_INIT_ROLES.includes(role);
export const canApproveBudget = (role: string): boolean => BUDGET_APPROVE_ROLES.includes(role);

export function useBudgetRole(email: string): 'checking' | string {
  const [role, setRole] = useState<'checking' | string>('checking');
  useEffect(() => { if (email) void fetchAppRole(email).then(setRole); }, [email]);
  return role;
}
