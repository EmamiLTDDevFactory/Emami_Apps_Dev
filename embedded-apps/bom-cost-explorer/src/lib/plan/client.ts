/**
 * Production Plan reads, browser -> SAP gateway (same path as every costing read; the app is a static
 * export). Writes (upload, entry PUT / DELETE) arrive in phase 3 through the same gateway, which does the
 * CSRF handshake, like Gate Entry's saves.
 */
import { sapGetCollection, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import { OPTIONAL_PROPS } from '../sap/fields';
import type { SapMessage } from '../sap/messages';
import { PLAN_CHECK, PLAN_COST_LINE, PLAN_ENTRY, PLAN_HEAD, PLAN_SUMMARY, PLAN_WIP, type PlanCheck, type PlanCostLine, type PlanEntry, type PlanHead, type PlanSummary, type PlanWip } from './fields';
import { planChecksRequest, planCostRequest, planEntriesRequest, planHeadsRequest, planSummaryRequest, planWipRequest, type PlanCostQuery, type PlanFilters } from './requests';
import { excludeIncludedFreight } from '../cost/freightIncluded';

export interface PlanResult<T> {
  rows: T[];
  messages: SapMessage[];
  ms: number;
}

type FieldMap = Parameters<typeof normalizeEntity>[1];
async function read<T>(req: { entitySet: string; params: Record<string, string | undefined> }, map: FieldMap, opts: SapGetOptions): Promise<PlanResult<T>> {
  const r = await sapGetCollection(req.entitySet, req.params, opts);
  return { rows: r.rows.map((raw) => normalizeEntity<T>(raw, map)), messages: r.messages, ms: r.ms };
}

export const fetchPlanHeads = (f: { plans?: string[]; plants?: string[] } = {}, opts: SapGetOptions = {}) => read<PlanHead>(planHeadsRequest(f), PLAN_HEAD, opts);
export const fetchPlanEntries = (plan: string, f: Partial<PlanFilters> = {}, opts: SapGetOptions = {}) => read<PlanEntry>(planEntriesRequest(plan, f), PLAN_ENTRY, opts);
export const fetchPlanChecks = (plan: string, itemCheck: boolean, plants: string[] = [], opts: SapGetOptions = {}) => read<PlanCheck>(planChecksRequest(plan, itemCheck, plants), PLAN_CHECK, opts);
export const fetchPlanSummary = (q: PlanCostQuery, opts: SapGetOptions = {}) => read<PlanSummary>(planSummaryRequest(q), PLAN_SUMMARY, opts);
export const fetchPlanWip = (plan: string, plants: string[] = [], opts: SapGetOptions = {}) => read<PlanWip>(planWipRequest(plan, plants), PLAN_WIP, opts);

/** CostLineSet Mode P: one SAP run, rows in Seqnr order (SAP's depth-first order made explicit). */
export async function fetchPlanCostLines(q: PlanCostQuery, opts: SapGetOptions = {}): Promise<PlanResult<PlanCostLine>> {
  const r = await read<PlanCostLine>(planCostRequest(q, OPTIONAL_PROPS), PLAN_COST_LINE, { ...opts, costing: true });
  r.rows.sort((a, b) => a.Seqnr - b.Seqnr);
  // Consumption / MBEW rates include freight (lib/cost/freightIncluded).
  r.rows = r.rows.map(excludeIncludedFreight);
  return { ...r, messages: r.messages.filter((m) => !/RATEOPTIONSET/i.test(m.message)) };
}
