/**
 * Pure business rules. Ported from BaseController (resolveDOA, checkBudget, checkQuota, skipUnitTechnical),
 * CPECreate (_rankVendors, _evaluateVendorRule, _validate) and BudgetCreate (_validate).
 * Thresholds/caps are always parameters (they come from ConfigSet), never hard-coded approvers.
 */
import { num } from './format';

/** Mirrors lib/entities.ts DoaChain. */
export interface DoaChainLike {
  Doaid?: string;
  Seqnr: string;
  Role: string;
  Approver: string;
  ApproverName?: string;
  Mandatory?: string;
  SlaDays: number | string;
}

/** Mirrors lib/entities.ts DoaRule (+ Doctype, which the live entity does not carry yet - Rev3 T9, log #79). */
export interface DoaRuleLike {
  Doaid: string;
  Capextype: string;
  AmountFrom: string | number;
  AmountTo: string | number;
  Active: string;
  Doctype?: string;
  RangeText?: string;
  /** Expanded chain: plain array or OData {results: []}. */
  DoaRuleToChain?: DoaChainLike[] | { results: DoaChainLike[] } | unknown;
  /** Alternative to DoaRuleToChain when the caller already holds the chain. */
  chain?: DoaChainLike[];
}

export type DocType = 'CPE' | 'BUD' | '';

export interface DoaStep {
  level: number;
  role: string;
  approver: string;
  approverName: string;
  slaDays: number;
  status: 'PENDING' | 'WAITING';
}

export interface DoaResolution {
  rule: DoaRuleLike | null;
  chain: DoaStep[];
}

function chainOf(rule: DoaRuleLike): DoaChainLike[] {
  if (Array.isArray(rule.chain)) return rule.chain;
  const c = rule.DoaRuleToChain as DoaChainLike[] | { results?: DoaChainLike[] } | undefined;
  if (Array.isArray(c)) return c;
  return (c && Array.isArray(c.results) && c.results) || [];
}

/**
 * Active flag, log #94: Edm.String(1) - only "X" is active. "" (and anything else) is inactive,
 * NOT "default true" (that bug silently excluded D1-D6; backend confirmed D1-D6 inactive is intended).
 */
export function isRuleActive(rule: Pick<DoaRuleLike, 'Active'>): boolean {
  return rule.Active === 'X';
}

/**
 * BaseController.resolveDOA + Component.mapDoaRuleEntity.
 *  - Active === 'X' only (#94).
 *  - Capextype equal to the requested one or '*'. (Fiori does NOT prefer exact over '*'; list order decides.)
 *  - amount >= AmountFrom and (AmountTo is 0/blank = open-ended, mapDoaRuleEntity `Number(AmountTo) || null` OR amount <= AmountTo); both bounds inclusive.
 *  - Rev3 T9: rule Doctype '' matches any document type, else must equal docType. Like the Fiori code, an omitted
 *    docType therefore only matches generic rules (the JSDoc "omitted matches any" is not what the code does).
 *  - A rule with an exact docType sorts before a generic one (stable sort, so original order breaks other ties).
 * Chain steps are sorted by Seqnr (Fiori: string localeCompare; here numeric-aware so "10" > "2"), level = 1..n,
 * first step PENDING, rest WAITING. No match -> {rule: null, chain: []}.
 */
export function resolveDOA(rules: DoaRuleLike[], capexType: string, amount: number, docType: DocType = ''): DoaResolution {
  const amt = Number(amount) || 0;
  const candidates = (rules || []).filter((r) => {
    const to = num(r.AmountTo) || null;
    const rDoc = r.Doctype || '';
    return (
      isRuleActive(r) &&
      (r.Capextype === capexType || r.Capextype === '*') &&
      amt >= num(r.AmountFrom) &&
      (to === null || amt <= to) &&
      (!rDoc || rDoc === docType)
    );
  });
  candidates.sort((a, b) => (b.Doctype ? 1 : 0) - (a.Doctype ? 1 : 0));
  const rule = candidates[0];
  if (!rule) return { rule: null, chain: [] };
  const chain = chainOf(rule)
    .slice()
    .sort((a, b) => String(a.Seqnr).localeCompare(String(b.Seqnr), undefined, { numeric: true }))
    .map((s, idx): DoaStep => ({
      level: idx + 1,
      role: s.Role,
      approver: s.Approver,
      approverName: s.ApproverName || '',
      slaDays: Number(s.SlaDays) || 0,
      status: idx === 0 ? 'PENDING' : 'WAITING',
    }));
  return { rule, chain };
}

/** BaseController.isUnitTechnicalRole: case-insensitive prefix "unit technical". */
export function isUnitTechnicalRole(role: string | null | undefined): boolean {
  return /^unit technical/i.test(role || '');
}

/** BaseController.skipUnitTechnical: drop Unit Technical steps and renumber level from 1 (EDSK9B0EA7). */
export function skipUnitTechnical<T extends { role: string; level?: number }>(chain: T[] | null | undefined): Array<T & { level: number }> {
  return (chain || []).filter((s) => !isUnitTechnicalRole(s.role)).map((s, i) => ({ ...s, level: i + 1 }));
}

/**
 * BaseController.buildLiveApprovalChain on a resolved chain: steps before the current role are APPROVED, the current
 * role PENDING, the rest WAITING; `final` marks everything APPROVED. Unknown currentLevel -> all WAITING (unless final).
 */
export function chainProgress(
  chain: Array<{ role: string }>,
  currentLevel: string,
  final: boolean,
): Array<{ role: string; status: 'APPROVED' | 'PENDING' | 'WAITING' }> {
  let cur = -1;
  chain.forEach((s, i) => {
    if (s.role === currentLevel) cur = i;
  });
  return chain.map((s, i) => ({
    role: s.role,
    status: final || (cur > -1 && i < cur) ? 'APPROVED' : i === cur ? 'PENDING' : 'WAITING',
  }));
}

// ---------------------------------------------------------------- budget

/** Budget availability: Approved - Committed - Spent (checkBudget's `available`). */
export function budgetAvailable(b: { approved?: number | string; committed?: number | string; spent?: number | string } | null | undefined): number {
  if (!b) return 0;
  return num(b.approved) - num(b.committed) - num(b.spent);
}

export interface BudgetCheck {
  available: number;
  sufficient: boolean;
  /** CPECreate._validate blocks Submit when !sufficient. */
  blocked: boolean;
  shortfall: number;
}

/** BaseController.checkBudget(available, request). Equal amount is sufficient (req <= available). No budget => pass available 0. */
export function checkBudget(available: number, amount: number): BudgetCheck {
  const avail = Number(available) || 0;
  const req = Number(amount) || 0;
  const sufficient = req <= avail;
  return { available: avail, sufficient, blocked: !sufficient, shortfall: Math.max(0, req - avail) };
}

// ---------------------------------------------------------------- quota

export interface QuotaCaps {
  yearCap?: number;
  singleCap?: number;
  /** QUOTA_YEAR_CAP_<WERKS> (Rev3 T10, log #80). */
  plantCaps?: Record<string, number>;
}
export const DEFAULT_QUOTA_YEAR_CAP = 200000;
export const DEFAULT_QUOTA_SINGLE_CAP = 50000;

const inr = (n: number) => n.toLocaleString('en-IN');

/** Yearly cap for a plant: plantCaps[plant] when defined, else yearCap, else 2,00,000 (checkQuota/rollupQuotaByUnit). */
export function yearCapFor(caps: QuotaCaps, plant?: string): number {
  const pc = caps.plantCaps || {};
  return plant && pc[plant] !== undefined ? pc[plant] : caps.yearCap || DEFAULT_QUOTA_YEAR_CAP;
}

/** BaseController.checkQuota. Single-item cap is global (never per plant); messages are the Fiori texts. */
export function checkQuota(usedThisFY: number, request: number, caps: QuotaCaps, plant?: string): { ok: boolean; reason: string } {
  const yearCap = yearCapFor(caps, plant);
  const singleCap = caps.singleCap || DEFAULT_QUOTA_SINGLE_CAP;
  const used = Number(usedThisFY) || 0;
  const req = Number(request) || 0;
  if (req > singleCap) {
    return { ok: false, reason: 'Single capex under unit quota cannot exceed ₹ ' + inr(singleCap) + '. Requested ₹ ' + inr(req) + '.' };
  }
  if (used + req > yearCap) {
    return {
      ok: false,
      reason: 'Annual unit quota of ₹ ' + inr(yearCap) + ' would be exceeded. Used ₹ ' + inr(used) + ', remaining ₹ ' + inr(yearCap - used) + '.',
    };
  }
  return { ok: true, reason: 'Within unit quota limits.' };
}

// ---------------------------------------------------------------- vendors (CPECreate)

export interface VendorQuoteLike {
  quote: number | string;
  totalCost?: number | string;
  deliveryDays?: number | string;
  rank?: string;
  selected?: boolean;
  name?: string;
  id?: string;
}

/**
 * CPECreate._rankVendors: only quote > 0 are ranked, ascending by quote -> "L1".."Ln"; others get "". Returns the ranks
 * aligned to the input order (does not mutate). Ties keep input order (stable sort).
 */
export function rankVendors(quotes: Array<Pick<VendorQuoteLike, 'quote'>>): string[] {
  const ranks = quotes.map(() => '');
  quotes
    .map((v, i) => ({ q: Number(v.quote), i }))
    .filter((o) => o.q > 0)
    .sort((a, b) => a.q - b.q)
    .forEach((o, idx) => {
      ranks[o.i] = 'L' + (idx + 1);
    });
  return ranks;
}

export const DEFAULT_THREE_QUOTE_LIMIT = 1000000;
export const DEFAULT_NONL1_MIN_CHARS = 25;
export const DEFAULT_SPECS_MIN_CHARS = 15;
export const DEFAULT_JUSTIF_MIN_CHARS = 20;

/** CPECreate._validate: capex ABOVE the limit (strictly >; exactly 10 lakh does not) needs three quotes. Limit falls back to 10,00,000. */
export function requiresThreeQuotes(amount: number, limit?: number): boolean {
  return (Number(amount) || 0) > (limit || DEFAULT_THREE_QUOTE_LIMIT);
}

/** CPECreate._evaluateVendorRule: showNonL1 = a selected vendor exists, an L1 exists, and they differ. */
export function isNonL1Selection(vendors: VendorQuoteLike[]): boolean {
  const ranks = rankVendors(vendors);
  const l1 = vendors.findIndex((_, i) => ranks[i] === 'L1');
  const sel = vendors.findIndex((v) => v.selected);
  return sel > -1 && l1 > -1 && sel !== l1;
}

/** CPECreate._validate: trimmed justification length >= min (config NONL1_MIN_CHARS, default 25). */
export function nonL1JustificationOk(text: string | null | undefined, minChars?: number): boolean {
  return (text || '').trim().length >= (minChars || DEFAULT_NONL1_MIN_CHARS);
}

export interface VendorComparison {
  /** L1 TCO - selected TCO. > 0 = saving, <= 0 = premium (|value|). TCO = totalCost || quote. */
  saving: number;
  isSaving: boolean;
  premium: number;
  /** L1 delivery days - selected delivery days (positive = selected is faster). */
  daysFaster: number;
}

/** CPECreate._evaluateVendorRule saving/premium vs L1 (text formatting left to the caller via inLakhs). */
export function compareToL1(l1: VendorQuoteLike, selected: VendorQuoteLike): VendorComparison {
  const tco = (v: VendorQuoteLike) => Number(v.totalCost) || Number(v.quote) || 0;
  const saving = tco(l1) - tco(selected);
  return {
    saving,
    isSaving: saving > 0,
    premium: saving > 0 ? 0 : Math.abs(saving),
    daysFaster: Number(l1.deliveryDays) - Number(selected.deliveryDays),
  };
}

// ---------------------------------------------------------------- draft validators

export interface CpeValidationInput {
  budgetId: string;
  title: string;
  amount: number | string;
  specs: string;
  budgetSufficient: boolean;
  vendors: VendorQuoteLike[];
  nonL1Justification?: string;
  singleCpe?: boolean;
  singleVendorJustification?: string;
}
export interface CpeValidationConfig {
  threeQuoteLimit?: number;
  specsMinChars?: number;
  nonL1MinChars?: number;
}

/** CPECreate._validate: same messages, same order. Empty array = valid. (Document/attachment checks are screen-level, see lib/documents.ts.) */
export function validateCpe(d: CpeValidationInput, cfg: CpeValidationConfig = {}): string[] {
  const specsMin = cfg.specsMinChars || DEFAULT_SPECS_MIN_CHARS;
  const nonL1Min = cfg.nonL1MinChars || DEFAULT_NONL1_MIN_CHARS;
  const errs: string[] = [];
  if (!d.budgetId) errs.push('Select an approved budget.');
  if (!d.title || !d.title.trim()) errs.push('CPE title is required.');
  if (!d.amount || Number(d.amount) <= 0) errs.push('CPE amount must be greater than zero.');
  if (!d.specs || d.specs.trim().length < specsMin) errs.push('Technical specifications are required (at least ' + specsMin + ' characters).');
  if (!d.budgetSufficient) errs.push('Budget is insufficient. Draw from the common pool or route for a budget increase.');
  const valid = (d.vendors || []).filter((v) => v.name && Number(v.quote) > 0);
  if (!valid.length) errs.push('At least one vendor quote is required.');
  if (requiresThreeQuotes(Number(d.amount), cfg.threeQuoteLimit) && valid.length < 3) {
    errs.push('Capex above ₹10 L requires three quotes (L1, L2 and L3).');
  }
  if (!valid.some((v) => v.selected)) errs.push('Select the recommended vendor.');
  // Fiori reads showNonL1 from the draft; it is derived from the ranked vendor list.
  if (isNonL1Selection(d.vendors || []) && !nonL1JustificationOk(d.nonL1Justification, nonL1Min)) {
    errs.push('A non-L1 selection requires a written justification of at least ' + nonL1Min + ' characters.');
  }
  if (d.singleCpe && (!d.singleVendorJustification || !d.singleVendorJustification.trim())) {
    errs.push('A justification is required when Single Vendor is checked.');
  }
  return errs;
}

export interface BudgetValidationInput {
  title: string;
  plant: string;
  capexType: string;
  category: string;
  amount: number | string;
  justification: string;
  items?: Array<{ title?: string; amount?: number | string }>;
}

/** BudgetCreate._validate: same messages/order. justifMinChars from config JUSTIF_MIN_CHARS (default 20). */
export function validateBudget(d: BudgetValidationInput, justifMinChars?: number): string[] {
  const min = justifMinChars || DEFAULT_JUSTIF_MIN_CHARS;
  const errs: string[] = [];
  if (!d.title || !d.title.trim()) errs.push('Budget title is required.');
  if (!d.plant) errs.push('Plant / unit is required.');
  if (!d.capexType) errs.push('Capex type is required.');
  if (!d.category) errs.push('Category is required.');
  if (!d.amount || Number(d.amount) <= 0) errs.push('Budget amount must be greater than zero.');
  if (!d.justification || d.justification.trim().length < min) errs.push('Business justification must be at least ' + min + ' characters.');
  (d.items || []).forEach((it, i) => {
    const label = 'Item ' + (i + 1) + (it.title ? ' (' + it.title + ')' : '');
    if (!it.title || !it.title.trim()) errs.push('Item ' + (i + 1) + ': title is required.');
    if (!it.amount || Number(it.amount) <= 0) errs.push(label + ': amount must be greater than zero.');
  });
  return errs;
}
