/**
 * Budget writes, browser -> SAP gateway (static export: the gateway does the CSRF handshake, as for the plan uploads). Nothing but identifiers
 * is sent: Initiate sends the RunIds of the runs on screen and SAP saves the figures it computed then (it never trusts a browser amount);
 * Approve sends the version. The initiator / approver comes from SAP's own table (zmm_cost_aprove) through AppUser; SAP's authority check is the real gate.
 * Every write is also logged in this browser ("budget:audit").
 */
import { SAP_MAX_TIMEOUT_MS, sapWrite, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import { BUDGET_APPROVE_RESULT, BUDGET_INIT_RESULT, BUDGET_SET } from './fields';
import type { BudgetApproveResult, BudgetInitResult } from './types';

const unwrap = (body: unknown): Record<string, unknown> => ((body as { d?: Record<string, unknown> } | null)?.d ?? (body as Record<string, unknown>) ?? {});

export function initiateBody(runIds: string[], remarks: string, appUser: string) {
  return { AppUser: appUser.trim().toLowerCase(), RunIds: Array.from(new Set(runIds.filter(Boolean))).join(','), Remarks: remarks.trim().slice(0, 100), ExclDiv: 'X' };
}
export function approveBody(gjahr: string, version: string, remarks: string, appUser: string) {
  return { AppUser: appUser.trim().toLowerCase(), Gjahr: gjahr, Version: version, Remarks1: remarks.trim().slice(0, 100) };
}

export async function initiateBudget(runIds: string[], remarks: string, appUser: string, opts: SapGetOptions = {}): Promise<BudgetInitResult> {
  if (!runIds.filter(Boolean).length) throw new Error('Nothing to initiate: run the budget first.');
  const r = await sapWrite('POST', BUDGET_SET.INIT, initiateBody(runIds, remarks, appUser), { timeoutMs: SAP_MAX_TIMEOUT_MS, ...opts });
  const res = normalizeEntity<BudgetInitResult>(unwrap(r.body), BUDGET_INIT_RESULT);
  audit({ user: appUser, action: 'initiate', gjahr: res.Gjahr, version: res.Version, count: res.SavedSum, status: res.Status });
  return res;
}

export async function approveBudget(gjahr: string, version: string, remarks: string, appUser: string, opts: SapGetOptions = {}): Promise<BudgetApproveResult> {
  if (!gjahr || !version) throw new Error('Pick a version to approve.');
  const r = await sapWrite('POST', BUDGET_SET.APPROVE, approveBody(gjahr, version, remarks, appUser), { timeoutMs: SAP_MAX_TIMEOUT_MS, ...opts });
  const res = normalizeEntity<BudgetApproveResult>(unwrap(r.body), BUDGET_APPROVE_RESULT);
  audit({ user: appUser, action: 'approve', gjahr, version, count: res.Approved, status: res.Status });
  return res;
}

export interface BudgetAuditRow { at: string; user: string; action: 'initiate' | 'approve'; gjahr: string; version: string; count: number; status: string }
const AUDIT_KEY = 'budget:audit';
function audit(r: Omit<BudgetAuditRow, 'at'>) {
  try {
    if (typeof localStorage === 'undefined') return;
    const list = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]') as BudgetAuditRow[];
    list.unshift({ at: new Date().toISOString(), ...r });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 200)));
  } catch { /* storage blocked */ }
}
export function readBudgetAudit(): BudgetAuditRow[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]') as BudgetAuditRow[]; } catch { return []; }
}
