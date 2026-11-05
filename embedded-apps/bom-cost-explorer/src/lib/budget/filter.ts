/**
 * $filter of the budget sets, with the same required-field rules as the SAP selection screen (AT SELECTION-SCREEN):
 * material type, posting date from, budget year and rate year are mandatory. One plant per request (a plant run is the unit that
 * fits the Azure gateway's 230 s limit). Flags are 'X' for on and left out for off. Literals reuse lib/sap/filter.ts: no "+" in URLs.
 */
import { FilterError, odataDate, odataString } from '../sap/filter';
import { BUDGET_FILTER as F } from './fields';

export type FgSource = 'P' | 'G' | 'N';
export type BusinessLine = '' | '01' | '02' | '03' | '04';
export type CountryCode = 'IN' | 'LK' | 'AE' | 'BD';

/** A "provide material cost" row (check2 popup of the report): a fixed value, or a percentage on the component's net landed cost. */
export interface CostOverride { matnr: string; value: string; pct: string }

export interface BudgetQuery {
  budatFrom: string; budatTo: string;
  materials: string[]; plants: string[]; mtart: string[]; plans: string[]; schemes: string[];
  budgetYr: string; rateYr: string; uom: string;
  source: FgSource; business: BusinessLine; exclDiv: boolean; country: CountryCode;
  exclManuf: boolean; onlyOverrides: boolean; oneSkuPerCrs: boolean; inclDirect: boolean; bomQtyX10: boolean; checklist: boolean;
  overrides: CostOverride[];
}

export const BUSINESS_LABEL: Record<Exclude<BusinessLine, ''>, string> = { '01': 'CCD', '02': 'HCD', '03': 'IMD', '04': 'CSD' };
/** Which CPD rate table prices the components: India = zcomponent, the others = zcomponent_n (by country). */
export const COUNTRY_LABEL: Record<CountryCode, string> = { IN: 'India', LK: 'Sri Lanka', AE: 'Dubai', BD: 'Bangladesh' };
export const COUNTRY_TABLE: Record<CountryCode, string> = { IN: 'zcomponent', LK: 'zcomponent_n', AE: 'zcomponent_n', BD: 'zcomponent_n' };
/** The report's three FG sources. P / G are the options "As per latest process order" and "As per latest FG"; N (NPD) is the report's third option for goods without production history. */
export const SOURCE_LABEL: Record<FgSource, string> = { P: 'As per latest process order', G: 'As per latest FG', N: 'NPD (no production history)' };
export const SOURCE_HINT: Record<FgSource, string> = {
  P: 'Takes the last process order created in the date range, per plant + CRS SKU + business line + scheme indicator + material type.',
  G: 'Takes the latest finished good code created in the date range, at FG code level.',
  N: 'Takes the finished goods from the material master for the plant; no production history needed.',
};
export const MAX_OVERRIDES = 20; // the report's popup has 20 lines

export function defaultBudgetQuery(now = new Date()): BudgetQuery {
  const y = now.getFullYear();
  return {
    budatFrom: '', budatTo: '', materials: [], plants: [], mtart: ['FERT'], plans: [], schemes: [],
    budgetYr: String(y), rateYr: String(y), uom: '',
    source: 'P', business: '01', exclDiv: false, country: 'IN',
    exclManuf: true, onlyOverrides: false, oneSkuPerCrs: true, inclDirect: false, bomQtyX10: false, checklist: false,
    overrides: [],
  };
}

const s = (v: string | undefined) => (v ?? '').trim();
const eq = (n: string, v: string) => `${n} eq ${odataString(v)}`;
const anyOf = (n: string, vals: string[]): string | null => {
  const u = Array.from(new Set(vals.map(s).filter(Boolean)));
  if (!u.length) return null;
  const parts = u.map((v) => eq(n, v));
  return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`;
};
const yearOk = (v: string) => /^\d{4}$/.test(s(v));

/** The report's screen rules. Returns the messages (empty = valid). Keys are form fields. */
export function validateBudget(q: BudgetQuery): Record<string, string> {
  const e: Record<string, string> = {};
  if (!q.mtart.map(s).filter(Boolean).length) e.mtart = 'Material type is required.';
  if (!s(q.budatFrom)) e.budatFrom = 'Posting date (from) is required.';
  if (s(q.budatFrom) && s(q.budatTo) && s(q.budatTo) < s(q.budatFrom)) e.budatTo = 'The end date is before the start date.';
  if (!yearOk(q.budgetYr)) e.budgetYr = 'Budgeted year is required (4 digits).';
  if (!yearOk(q.rateYr)) e.rateYr = 'Activity rate year is required (4 digits).';
  if (!q.plants.length) e.plants = 'Pick at least one plant.';
  // a number, or empty (sent as 0): not a lone '-' or '.'
  const num = (v: string) => s(v) === '' || /^-?(\d+\.?\d*|\.\d+)$/.test(s(v));
  const bad = q.overrides.find((o) => s(o.matnr) && !(num(o.value) && num(o.pct)));
  if (bad) e.overrides = `Cost override for ${bad.matnr}: value and % must be numbers.`;
  if (q.overrides.filter((o) => s(o.matnr)).length > MAX_OVERRIDES) e.overrides = `At most ${MAX_OVERRIDES} cost overrides.`;
  return e;
}

/** 'MATNR|VALUE|PCT;...' with empty value / pct as 0. */
export function overridesParam(list: CostOverride[]): string {
  return list.filter((o) => s(o.matnr)).map((o) => [s(o.matnr).toUpperCase(), s(o.value) || '0', s(o.pct) || '0'].join('|')).join(';');
}

export interface BudgetFilterOpts { werks?: string; matnr?: string; appUser?: string }

/** Selection filter for BudgetSumSet, BudgetSplitSet and BudgetChkSet. `werks` = the one plant of this request. */
export function buildBudgetFilter(q: BudgetQuery, opts: BudgetFilterOpts = {}): string {
  const errs = validateBudget(q);
  const first = Object.values(errs)[0];
  if (first) throw new FilterError(first);
  const werks = s(opts.werks).toUpperCase() || (q.plants.length === 1 ? q.plants[0].toUpperCase() : '');
  if (!werks) throw new FilterError('A budget run takes one plant per request.');
  const c: (string | null)[] = [eq(F.Werks, werks)];
  const mats = opts.matnr ? [opts.matnr] : q.materials;
  c.push(anyOf(F.Matnr, mats), anyOf(F.Mtart, q.mtart.map((x) => x.toUpperCase())), `${F.BudatFrom} eq ${odataDate(s(q.budatFrom))}`);
  if (s(q.budatTo)) c.push(`${F.BudatTo} eq ${odataDate(s(q.budatTo))}`);
  c.push(anyOf(F.Plan1, q.plans), anyOf(F.Scheme, q.schemes));
  c.push(eq(F.BudgetYr, s(q.budgetYr)), eq(F.RateYr, s(q.rateYr)));
  if (s(q.uom)) c.push(eq(F.Uom, s(q.uom)));
  c.push(eq(F.FgSource, q.source), eq(F.Country, q.country));
  if (q.exclDiv) c.push(`${F.ExclDiv} eq 'X'`);
  else if (q.business) c.push(eq(F.Business, q.business));
  if (q.exclManuf) c.push(`${F.ExclManuf} eq 'X'`);
  if (q.onlyOverrides) c.push(`${F.OnlyOverrides} eq 'X'`);
  if (q.oneSkuPerCrs) c.push(`${F.OneSkuPerCrs} eq 'X'`);
  if (q.inclDirect && q.source === 'G') c.push(`${F.InclDirect} eq 'X'`);
  if (q.bomQtyX10) c.push(`${F.BomQtyX10} eq 'X'`);
  if (q.checklist) c.push(`${F.Checklist} eq 'X'`);
  const ov = overridesParam(q.overrides);
  if (ov) c.push(eq(F.Overrides, ov));
  if (s(opts.appUser)) c.push(eq(F.AppUser, s(opts.appUser).toLowerCase()));
  return c.filter(Boolean).join(' and ');
}

/** Filter of the approver sets: only the person (SAP maps AppUser to the approver); Gjahr / Version narrow it. */
export function buildPendingFilter(appUser: string, key?: { gjahr?: string; version?: string; status?: string }): string {
  if (!s(appUser)) throw new FilterError('Not signed in.');
  const c = [eq(F.AppUser, s(appUser).toLowerCase())];
  if (s(key?.gjahr)) c.push(eq(F.Gjahr, s(key?.gjahr)));
  if (s(key?.version)) c.push(eq(F.Version, s(key?.version)));
  return c.join(' and ');
}

/** Initiate is only allowed for the report's "exclude division" run (all business lines), exactly like the SAP message. */
export const INITIATE_BLOCKED = 'Initiate without exclude division is not possible. Tick "All business lines" and run again.';

/** Number of options switched on in a selection: the yes / no options of the form plus each cost override row. */
export function optionCount(q: BudgetQuery): number {
  return [q.exclDiv, q.exclManuf, q.onlyOverrides, q.oneSkuPerCrs, q.inclDirect && q.source === 'G', q.bomQtyX10, q.checklist].filter(Boolean).length + q.overrides.filter((o) => s(o.matnr)).length;
}

/** One line for the collapsed selection bar after a run: period, plants, FG source, business line, number of options. */
export function selectionSummary(q: BudgetQuery): { period: string; plants: string; source: string; business: string; options: number } {
  const business = q.exclDiv || !q.business ? 'All business lines' : `${BUSINESS_LABEL[q.business]} (${q.business})`;
  return {
    period: `${s(q.budatFrom) || '?'} to ${s(q.budatTo) || 'today'}`,
    plants: q.plants.map((p) => p.trim().toUpperCase()).filter(Boolean).join(', ') || 'no plant',
    source: SOURCE_LABEL[q.source], business, options: optionCount(q),
  };
}
