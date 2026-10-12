/**
 * Production Plan requests (reads). Same rules as the costing: one call per action, never $expand,
 * literals from lib/sap/filter.ts (spaces %20 via encodeURIComponent in the client, ExplQty-style
 * decimals with the m suffix, booleans true/false).
 */
import { literal } from '../sap/filter';
import { PLAN_COST_LINE, PLAN_COST_MODE, PLAN_SELECTION, PLAN_SET } from './fields';

export interface PlanFilters {
  plants: string[];
  materials: string[];
}

/** Mode P breakup + cost options (fallback on by default, all material types). */
export interface PlanCostQuery extends PlanFilters {
  plan: string;
  mtartFilter: 'A' | 'P' | 'R';
  allBoms: boolean;
  basePlant: string;
  scrap: boolean;
  fallback: boolean;
  inclFrt: boolean;
  stdFrt: boolean;
  inclBudget: boolean;
  budgetYr: string;
  inclCover: boolean;
  prio: string;
  donorPlant: string;
  lookback: number;
  freightDays: number;
  budatFrom: string;
  budatTo: string;
}

export const defaultPlanCostQuery = (plan: string): PlanCostQuery => ({
  plan, plants: [], materials: [], mtartFilter: 'A', allBoms: false, basePlant: '', scrap: false, fallback: true,
  inclFrt: true, stdFrt: false, inclBudget: false, budgetYr: '', inclCover: false, prio: '', donorPlant: '',
  lookback: 365, freightDays: 0, budatFrom: '', budatTo: '',
});

type SelKey = keyof typeof PLAN_SELECTION;
function eq(key: SelKey, values: unknown | unknown[]): string | null {
  const [name, kind] = PLAN_SELECTION[key];
  const list = (Array.isArray(values) ? values : [values]).filter((v) => v !== undefined && v !== null && v !== '');
  const lits = Array.from(new Set(list.map((v) => literal(kind, v))));
  if (!lits.length) return null;
  return lits.length === 1 ? `${name} eq ${lits[0]}` : `(${lits.map((l) => `${name} eq ${l}`).join(' or ')})`;
}
const and = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(' and ');
const upper = (v: string[]) => v.map((x) => x.trim().toUpperCase()).filter(Boolean);

export class PlanQueryError extends Error {}
function needPlan(plan: string) {
  if (!plan.trim()) throw new PlanQueryError('Choose a plan first.');
}

export const planHeadsRequest = () => ({ entitySet: PLAN_SET.HEADS, params: {} as Record<string, string | undefined> });

export function planEntriesRequest(plan: string, f: Partial<PlanFilters> = {}) {
  needPlan(plan);
  return { entitySet: PLAN_SET.ENTRIES, params: { $filter: and(eq('Plan1', plan.trim()), eq('Matnr', upper(f.materials ?? [])), eq('Werks', upper(f.plants ?? []))) } as Record<string, string | undefined> };
}

export function planChecksRequest(plan: string, itemCheck: boolean) {
  needPlan(plan);
  return { entitySet: PLAN_SET.CHECKS, params: { $filter: and(eq('Plan1', plan.trim()), eq('ItemCheck', itemCheck)) } as Record<string, string | undefined> };
}

export function planSummaryRequest(q: PlanCostQuery) {
  needPlan(q.plan);
  return { entitySet: PLAN_SET.SUMMARY, params: { $filter: costFilter(q, false) } as Record<string, string | undefined> };
}

export function planWipRequest(plan: string) {
  needPlan(plan);
  return { entitySet: PLAN_SET.WIP, params: { $filter: eq('Plan1', plan.trim())! } as Record<string, string | undefined> };
}

/** CostLineSet Mode P filter. `withMode` false = the same filters for PlanSummarySet. */
export function costFilter(q: PlanCostQuery, withMode = true): string {
  needPlan(q.plan);
  return and(
    withMode && eq('Mode', PLAN_COST_MODE),
    eq('Plan1', q.plan.trim()),
    eq('Werks', upper(q.plants)),
    eq('Matnr', upper(q.materials)),
    eq('MtartFilter', q.mtartFilter),
    eq('AllBoms', q.allBoms),
    q.basePlant.trim() ? eq('BasePlant', q.basePlant.trim().toUpperCase()) : null,
    eq('Scrap', q.scrap),
    eq('Fallback', q.fallback),
    withMode && eq('InclFrt', q.inclFrt),
    withMode && eq('StdFrt', q.stdFrt),
    withMode && eq('InclBudget', q.inclBudget),
    withMode && q.inclBudget && q.budgetYr ? eq('BudgetYr', q.budgetYr) : null,
    withMode && eq('InclCover', q.inclCover),
    withMode && q.prio ? eq('Prio', q.prio) : null,
    withMode && q.donorPlant ? eq('DonorPlant', q.donorPlant.toUpperCase()) : null,
    withMode && eq('Lookback', q.lookback),
    withMode && q.freightDays ? eq('FreightDays', q.freightDays) : null,
    withMode && q.budatFrom ? eq('BudatFrom', q.budatFrom) : null,
    withMode && q.budatTo ? eq('BudatTo', q.budatTo) : null,
  );
}

/** $select for Mode P: every cost-line field the UI reads plus the plan fields; never $expand. */
export const planCostSelect = (optional: ReadonlySet<string>) => Object.values(PLAN_COST_LINE).map(([n]) => n).filter((n) => !optional.has(n)).join(',');

export function planCostRequest(q: PlanCostQuery, optional: ReadonlySet<string>) {
  return { entitySet: PLAN_SET.COST_LINES, params: { $filter: costFilter(q), $select: planCostSelect(optional) } as Record<string, string | undefined> };
}
