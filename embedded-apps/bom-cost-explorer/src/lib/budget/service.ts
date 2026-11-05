import { readSet, type Read } from '../price-context/odata';
import { BUDGET_FIELDS, BUDGET_SET, type BudgetReadKey } from './fields';
import { buildBudgetFilter, buildPendingFilter, type BudgetQuery } from './filter';
import type { BudgetRowsBySet, BudgetSummaryRow } from './types';

const NONE: ReadonlySet<string> = new Set();

export interface BudgetReadOpts { signal?: AbortSignal; appUser?: string }

/**
 * Budget run: ONE request per plant (a plant is the unit that fits the gateway's 230 s limit), one after the other, no client time limit
 * (the request ends when SAP answers, on Stop, or when the page is left). Rows of every plant are joined; each row keeps its plant's RunId,
 * which is what "Initiate" later sends back so SAP saves exactly what was shown, without the browser ever sending a cost.
 */
export async function fetchBudgetSummary(q: BudgetQuery, opts: BudgetReadOpts & { onPlant?: (werks: string, i: number, n: number) => void } = {}): Promise<Read<BudgetSummaryRow>> {
  const plants = Array.from(new Set(q.plants.map((p) => p.trim().toUpperCase()).filter(Boolean)));
  const out: Read<BudgetSummaryRow> = { rows: [], messages: [], ms: 0 };
  for (let i = 0; i < plants.length; i++) {
    if (opts.signal?.aborted) break;
    opts.onPlant?.(plants[i], i, plants.length);
    const $filter = buildBudgetFilter(q, { werks: plants[i], appUser: opts.appUser }); // throws FilterError before any request
    const r = await readSet<BudgetSummaryRow>(BUDGET_SET.SUMMARY, BUDGET_FIELDS.SUMMARY, NONE, $filter, opts.signal);
    out.rows.push(...r.rows);
    for (const m of r.messages) if (!out.messages.some((x) => x.message === m.message)) out.messages.push(m);
    out.ms += r.ms;
  }
  return out;
}

/** Split (BOM components) of ONE finished good in ONE plant, with the same selection as the run. */
export const fetchBudgetSplit = (q: BudgetQuery, matnr: string, werks: string, opts: BudgetReadOpts = {}) =>
  readSet<BudgetRowsBySet['SPLIT']>(BUDGET_SET.SPLIT, BUDGET_FIELDS.SPLIT, NONE, buildBudgetFilter(q, { werks, matnr, appUser: opts.appUser }), opts.signal);

/** FG level BOM / production version checklist (the report's "FG summary level checklist" run). */
export const fetchBudgetCheck = (q: BudgetQuery, opts: BudgetReadOpts = {}) => fetchBudgetChecks({ ...q, checklist: true }, opts);
async function fetchBudgetChecks(q: BudgetQuery, opts: BudgetReadOpts): Promise<Read<BudgetRowsBySet['CHECK']>> {
  const out: Read<BudgetRowsBySet['CHECK']> = { rows: [], messages: [], ms: 0 };
  for (const w of Array.from(new Set(q.plants.map((p) => p.trim().toUpperCase())))) {
    if (opts.signal?.aborted) break;
    const r = await readSet<BudgetRowsBySet['CHECK']>(BUDGET_SET.CHECK, BUDGET_FIELDS.CHECK, NONE, buildBudgetFilter(q, { werks: w, appUser: opts.appUser }), opts.signal);
    out.rows.push(...r.rows); out.messages.push(...r.messages); out.ms += r.ms;
  }
  return out;
}

/** Saved lines waiting for the signed-in approver (SAP maps AppUser to the approver). */
export const fetchPending = (appUser: string, opts: { signal?: AbortSignal; gjahr?: string; version?: string } = {}) =>
  readSet<BudgetRowsBySet['PENDING']>(BUDGET_SET.PENDING, BUDGET_FIELDS.PENDING, NONE, buildPendingFilter(appUser, { gjahr: opts.gjahr, version: opts.version }), opts.signal);

export const fetchPendingDet = (appUser: string, gjahr: string, version: string, opts: { signal?: AbortSignal } = {}) =>
  readSet<BudgetRowsBySet['PENDING_DET']>(BUDGET_SET.PENDING_DET, BUDGET_FIELDS.PENDING_DET, NONE, buildPendingFilter(appUser, { gjahr, version }), opts.signal);

export type { BudgetReadKey };
