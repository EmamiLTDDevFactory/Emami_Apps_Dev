'use client';
/**
 * Who may use Budget costing. The hub's Manage Access role of this app decides ("Admin" has everything): display = Admin, "budget-init" or "budget-approve";
 * initiate = Admin or "budget-init"; approve = Admin or "budget-approve". These role names are new: create them in Manage Access (roles are plain
 * strings there). SAP (zmm_cost_aprove + authority check) is the real gate. Fails closed.
 */
import { useEffect, useState } from 'react';
import { fetchAppRole } from '../client/hubAccess';
import type { BudgetTab } from './tabs';

export const BUDGET_DISPLAY_ROLES = ['Admin', 'budget-init', 'budget-approve'];
export const BUDGET_INIT_ROLES = ['Admin', 'budget-init'];
export const BUDGET_APPROVE_ROLES = ['Admin', 'budget-approve'];
export const canDisplayBudget = (role: string): boolean => BUDGET_DISPLAY_ROLES.includes(role);
export const canInitiateBudget = (role: string): boolean => BUDGET_INIT_ROLES.includes(role);
export const canApproveBudget = (role: string): boolean => BUDGET_APPROVE_ROLES.includes(role);

/** The tabs of the Budget page for a role: Admin all three, budget-init the first two, budget-approve Approvals only, anyone else none (fails closed). */
export function budgetTabsFor(role: string): BudgetTab[] {
  if (role === 'Admin') return ['run', 'checklist', 'approvals'];
  if (role === 'budget-init') return ['run', 'checklist'];
  if (role === 'budget-approve') return ['approvals'];
  return [];
}
/** Approver-only people land on Approvals; everyone else on "Run and summary". */
export const defaultBudgetTab = (role: string): BudgetTab | null => { const t = budgetTabsFor(role); return t.includes('run') ? 'run' : t[0] ?? null; };
/** The side-pane entries: ONE "Budget" item for the whole module, when the flag is on and the role may see any tab. */
export function budgetNavItems(enabled: boolean, role: string): { label: string; path: string }[] {
  return enabled && canDisplayBudget(role) ? [{ label: 'Budget', path: '/budget-cost/' }] : [];
}

export function useBudgetRole(email: string): 'checking' | string {
  const [role, setRole] = useState<'checking' | string>('checking');
  useEffect(() => { if (email) void fetchAppRole(email).then(setRole); }, [email]);
  return role;
}
