/**
 * Pure CPE screen logic (no React, no network). Ported from CPECreate / CPEDetail / Evaluation / CPEList controllers.
 * Money rules (ranking, three-quote rule, non-L1, budget check, DOA) live in lib/rules.ts and are only called from here.
 */
import { metricsForDisplay } from '@/lib/finance';
import { currentFiscalYear, fyDigits, inLakhs, isStatus, num } from '@/lib/format';
import { compareToL1, isNonL1Selection, rankVendors, validateCpe, type CpeValidationConfig } from '@/lib/rules';
import type { CPE, Vendor } from '@/lib/entities';

// ---------------------------------------------------------------- draft shapes

/** One row of the vendor table. Numeric inputs are kept as the typed string (log #33/#46: never coerce while typing). */
export interface DraftVendor {
  /** unique for the life of the draft ("V1", "V2"...) and used as the React key (log #46) */
  id: string;
  rank: string;
  name: string;
  /** SAP vendor code, set only when picked from the VendSet suggestions; cleared as soon as the name is edited again */
  lifnr: string;
  quote: string;
  deliveryDays: string;
  quality: number;
  warrantyMonths: string;
  gstCompliant: boolean;
  selected: boolean;
}

export interface AttachSlot { id: string; label: string; title: string; note: string; fileName: string }
export interface Attachments {
  rfq: AttachSlot[];
  quotation: AttachSlot[];
  tcc: AttachSlot;
  negotiation: AttachSlot;
  justification: AttachSlot;
  general: AttachSlot[];
}

export interface CpeDraft {
  budgetId: string;
  title: string;
  plant: string;
  plantName: string;
  capexType: string;
  category: string;
  categoryCode: string;
  amount: string;
  specs: string;
  terms: string;
  deliveryWeeks: string;
  metricsEnabled: boolean;
  /** fixed company policy figure, not editable (log #45) */
  hurdleRate: number;
  cf: [string, string, string, string, string];
  vendors: DraftVendor[];
  nonL1Justification: string;
  singleCpe: boolean;
  singleVendorJustification: string;
  attachments: Attachments;
}

export const HURDLE_RATE = 8;

const slot = (id: string, label: string): AttachSlot => ({ id, label, title: '', note: '', fileName: '' });

/** RFQ / Quotation get `slots` slots each (3, or 1 for Single Vendor); TCC / Negotiation / Justification are always one; General starts empty. */
export function buildEmptyAttachments(slots = 3): Attachments {
  const rfq: AttachSlot[] = [];
  const quotation: AttachSlot[] = [];
  for (let i = 1; i <= slots; i++) {
    rfq.push(slot('RFQ' + i, 'RFQ ' + i));
    quotation.push(slot('QUOTE' + i, 'Quotation ' + i));
  }
  return {
    rfq,
    quotation,
    tcc: slot('TCC', 'Techno Commercial Comparative'),
    negotiation: slot('NEGOTIATION', 'Negotiation History'),
    justification: slot('JUSTIFICATION', 'Justification Note'),
    general: [],
  };
}

/** onSingleCpeChange: shrink to 1 slot / grow to 3, keeping slot 1 (and any extra slots that still exist). Other slots untouched. */
export function resizeAttachmentSlots(att: Attachments, single: boolean): Attachments {
  const fresh = buildEmptyAttachments(single ? 1 : 3);
  const keep = (old: AttachSlot[], neu: AttachSlot[]) => neu.map((s, i) => (old[i] ? { ...old[i] } : s));
  return { ...att, rfq: keep(att.rfq, fresh.rfq), quotation: keep(att.quotation, fresh.quotation) };
}

export function emptyDraft(budgetId = ''): CpeDraft {
  return {
    budgetId, title: '', plant: '', plantName: '', capexType: '', category: '', categoryCode: '',
    amount: '', specs: '', terms: '', deliveryWeeks: '',
    metricsEnabled: true, hurdleRate: HURDLE_RATE, cf: ['', '', '', '', ''],
    vendors: [], nonL1Justification: '', singleCpe: false, singleVendorJustification: '',
    attachments: buildEmptyAttachments(),
  };
}

/** Next unique id for a draft list ("V3", "GEN2"): max existing number + 1, never length-based (log #46). */
export function nextId(prefix: string, items: Array<{ id: string }>): string {
  const max = items.reduce((m, it) => {
    const n = parseInt(String(it.id || '').replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return prefix + (max + 1);
}

// ---------------------------------------------------------------- vendors

export function newVendor(existing: DraftVendor[]): DraftVendor {
  return {
    id: nextId('V', existing), rank: '', name: '', lifnr: '', quote: '', deliveryDays: '',
    quality: 3, warrantyMonths: '12', gstCompliant: true, selected: false,
  };
}

/**
 * Re-rank L1..Ln by quote. Rows whose rank is unchanged keep their object identity (indexed update, log #46:
 * replacing every row would re-apply every input from state and erase in-progress typing in sibling cells).
 */
export function withRanks(vendors: DraftVendor[]): DraftVendor[] {
  const ranks = rankVendors(vendors.map((v) => ({ quote: num(v.quote) })));
  return vendors.map((v, i) => (v.rank === ranks[i] ? v : { ...v, rank: ranks[i] }));
}

/** Patch exactly one row by id (never replaces the other rows). */
export function patchVendor(vendors: DraftVendor[], id: string, patch: Partial<DraftVendor>): DraftVendor[] {
  return vendors.map((v) => (v.id === id ? { ...v, ...patch } : v));
}

/** Radio behaviour: exactly one selected row. Rows whose flag does not change keep identity. */
export function selectVendor<T extends { id: string; selected: boolean }>(vendors: T[], id: string): T[] {
  return vendors.map((v) => (v.selected === (v.id === id) ? v : { ...v, selected: v.id === id }));
}

const toQuote = (v: DraftVendor) => ({ quote: num(v.quote), totalCost: 0, deliveryDays: num(v.deliveryDays), selected: v.selected, name: v.name, id: v.id });

export function nonL1Selected(vendors: Array<{ quote: number | string; selected?: boolean }>): boolean {
  return isNonL1Selection(vendors.map((v) => ({ quote: num(v.quote), selected: v.selected })));
}

/** The one-line saving / premium narrative under the non-L1 justification box (CPECreate and Evaluation). */
export function nonL1Narrative(
  vendors: Array<{ quote: number | string; totalCost?: number | string; deliveryDays?: number | string; selected?: boolean; rank?: string }>,
  style: 'create' | 'evaluation',
): string {
  const ranks = rankVendors(vendors.map((v) => ({ quote: num(v.quote) })));
  const l1i = ranks.indexOf('L1');
  const sel = vendors.findIndex((v) => v.selected);
  if (l1i < 0 || sel < 0 || l1i === sel) return '';
  const norm = (v: (typeof vendors)[number]) => ({ quote: num(v.quote), totalCost: num(v.totalCost), deliveryDays: num(v.deliveryDays) });
  const cmp = compareToL1(norm(vendors[l1i]), norm(vendors[sel]));
  if (style === 'evaluation') {
    const parts = [cmp.saving >= 0 ? 'TCO saving vs L1: ' + inLakhs(cmp.saving) : 'TCO premium over L1: ' + inLakhs(cmp.premium)];
    if (cmp.daysFaster !== 0) parts.push(cmp.daysFaster > 0 ? cmp.daysFaster + ' days faster' : Math.abs(cmp.daysFaster) + ' days slower');
    return parts.join(' · ');
  }
  return cmp.isSaving
    ? 'Total cost of ownership is ' + inLakhs(cmp.saving) + ' lower than L1. Delivery ' + cmp.daysFaster + ' days faster.'
    : 'Selected vendor costs ' + inLakhs(cmp.premium) + ' more than L1. The justification must explain the value received for the premium.';
}

// ---------------------------------------------------------------- metrics

export interface MetricsView { irr: number | null; npv: number | null; payback: number | null }

export function draftMetrics(d: Pick<CpeDraft, 'amount' | 'cf' | 'hurdleRate' | 'metricsEnabled'>): MetricsView {
  if (!d.metricsEnabled) return { irr: null, npv: null, payback: null };
  return metricsForDisplay(num(d.amount), d.cf.map((c) => num(c)), d.hurdleRate);
}

export const fmtIrr = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(1) + '%');
export const fmtNpv = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : inLakhs(v));
export const fmtPayback = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(1) + ' yrs');

// ---------------------------------------------------------------- attachments

/** Slots that must be filled on Submit (RFQ + Quotation per slot, TCC, Negotiation, Justification). Save Draft never checks. */
export function missingDocuments(att: Attachments): string[] {
  const out: string[] = [];
  [...att.rfq, ...att.quotation].forEach((s) => { if (!s.fileName) out.push(s.label); });
  ([att.tcc, att.negotiation, att.justification]).forEach((s) => { if (!s.fileName) out.push(s.label); });
  return out.length ? ['Required documents are missing: ' + out.join(', ')] : [];
}

// ---------------------------------------------------------------- validation

export interface DraftRules extends CpeValidationConfig { budgetSufficient: boolean; documentsEnabled: boolean }

/** CPECreate._validate: shared rules + the attachment check (skipped while document upload is disabled). */
export function validateDraft(d: CpeDraft, r: DraftRules): string[] {
  const errs = validateCpe({
    budgetId: d.budgetId, title: d.title, amount: num(d.amount), specs: d.specs, budgetSufficient: r.budgetSufficient,
    vendors: d.vendors.map(toQuote), nonL1Justification: d.nonL1Justification, singleCpe: d.singleCpe,
    singleVendorJustification: d.singleVendorJustification,
  }, r);
  return r.documentsEnabled ? errs.concat(missingDocuments(d.attachments)) : errs;
}

/** Field-level error flags (the Fiori valueState) so the screen can outline what is wrong after a failed Submit. */
export function fieldErrors(d: CpeDraft, cfg: CpeValidationConfig): Record<string, boolean> {
  const specsMin = cfg.specsMinChars || 15;
  const nonL1Min = cfg.nonL1MinChars || 25;
  return {
    title: !d.title.trim(),
    amount: !(num(d.amount) > 0),
    specs: d.specs.trim().length < specsMin,
    nonL1: nonL1Selected(d.vendors) && d.nonL1Justification.trim().length < nonL1Min,
    single: d.singleCpe && !d.singleVendorJustification.trim(),
  };
}

// ---------------------------------------------------------------- payload

const fixed = (v: number | null | undefined, n: number) => (v === null || v === undefined || Number.isNaN(v) ? Number(0).toFixed(n) : Number(v).toFixed(n));

/**
 * CPESet deep-insert body (log #10c / #16 / #34): Vendor and CpeCashFlow are creatable only nested.
 * Category is the CODE, Quality a raw JSON number (SAP throws CX_SXML_PARSE_ERROR if quoted), flags "X"/"".
 */
export function buildCpePayload(d: CpeDraft, fiscalYear: string, m: MetricsView): Record<string, unknown> {
  const vendorRows = d.vendors.map((v, i) => ({
    Vendorseq: String(i + 1).padStart(4, '0'),
    Vendorname: v.name || '',
    Lifnr: v.lifnr || '',
    QuoteAmt: num(v.quote).toFixed(3),
    Totalcost: Number(0).toFixed(3),
    Waers: 'INR',
    DeliveryDays: Math.trunc(num(v.deliveryDays)),
    Quality: Number(v.quality) || 0,
    WarrantyMon: String(Math.trunc(num(v.warrantyMonths))),
    GstCompliant: v.gstCompliant ? 'X' : '',
    Selected: v.selected ? 'X' : '',
    Ranking: (v.rank || '').replace(/^L/, ''),
  }));
  const selIdx = d.vendors.findIndex((v) => v.selected);
  const cashFlows = d.cf.map((v, i) => ({ Yearnr: String(i + 1).padStart(2, '0'), Amount: num(v).toFixed(3), Waers: 'INR' }));
  return {
    Budgetid: d.budgetId,
    Fiscalyear: fyDigits(fiscalYear) || currentFiscalYear(),
    Title: d.title,
    Werks: d.plant,
    Capextype: d.capexType,
    Category: d.categoryCode,
    Waers: 'INR',
    Amount: num(d.amount).toFixed(3),
    Investment: num(d.amount).toFixed(3),
    HurdleRate: Number(d.hurdleRate || 0).toFixed(2),
    Irr: fixed(m.irr, 2),
    Npv: fixed(m.npv, 3),
    Payback: fixed(m.payback, 2),
    MetricsOn: d.metricsEnabled ? 'X' : '',
    Specs: d.specs || '',
    Terms: d.terms || '',
    DeliveryWeeks: Math.trunc(num(d.deliveryWeeks)),
    SelVendor: selIdx > -1 ? vendorRows[selIdx].Vendorseq : '',
    Nonl1Justif: d.nonL1Justification || '',
    SingleVendJust: d.singleCpe ? d.singleVendorJustification || '' : '',
    IsQuota: '',
    PoolBudgetid: '',
    PoolAmount: Number(0).toFixed(3),
    CPEToVendors: { results: vendorRows },
    CPEToCashFlows: { results: cashFlows },
  };
}

/** Parameters of SubmitCPE (names/types per docs/metadata.live.xml). Pool fields are always blank: the common pool was removed (log #44). */
export function submitCpeParams(cpeId: string, budgetId: string, amount: number | string, poolBudgetId = '', poolAmount: number | string = 0) {
  return { CpeId: cpeId, BudgetId: budgetId, Amount: num(amount), PoolBudgetId: poolBudgetId, PoolAmount: num(poolAmount) };
}

// ---------------------------------------------------------------- SAP rows -> view

export interface VendorView {
  /** SAP Vendorseq (what SaveEvaluation / SubmitEvaluation take as VendorSeq) */
  id: string;
  rank: string;
  name: string;
  lifnr: string;
  quote: number;
  totalCost: number;
  deliveryDays: number;
  quality: number;
  warrantyMonths: number;
  gstCompliant: boolean;
  selected: boolean;
}

/** Component.mapVendorEntity: Ranking may arrive "1" or "L1". */
export function mapVendor(v: Vendor): VendorView {
  const r = String(v.Ranking || '');
  return {
    id: v.Vendorseq,
    rank: r ? (r.charAt(0) === 'L' ? r : 'L' + r) : '',
    name: v.Vendorname,
    lifnr: v.Lifnr || '',
    quote: num(v.QuoteAmt),
    totalCost: num(v.Totalcost),
    deliveryDays: Number(v.DeliveryDays) || 0,
    quality: Number(v.Quality) || 0,
    warrantyMonths: num(v.WarrantyMon),
    gstCompliant: v.GstCompliant === 'X',
    selected: v.Selected === 'X',
  };
}

/** The expanded CPEToVendors may be an array or {results: []}. */
export function expandedRows<T>(x: unknown): T[] {
  if (Array.isArray(x)) return x as T[];
  const r = (x as { results?: T[] } | undefined)?.results;
  return Array.isArray(r) ? r : [];
}

/** Rows ordered by their SAP sequence so the table is stable. */
export function sortedVendors(cpe: CPE): VendorView[] {
  return expandedRows<Vendor>(cpe.CPEToVendors).map(mapVendor).sort((a, b) => a.id.localeCompare(b.id));
}

/** CPEDetail._calcSavingVsL1 (TCO falls back to quote). */
export function savingVsL1(vendors: VendorView[]): number {
  const sel = vendors.find((v) => v.selected);
  const l1 = vendors.find((v) => v.rank === 'L1');
  if (!sel || !l1 || sel.id === l1.id) return 0;
  return (l1.totalCost || l1.quote || 0) - (sel.totalCost || sel.quote || 0);
}

export function savingText(n: number): string {
  if (!n) return '';
  return n > 0 ? 'Net saving against L1: ' + inLakhs(n) : 'Premium over L1: ' + inLakhs(Math.abs(n));
}

export function slaBanner(days: number, level: string, formatDays: (n: number) => string): string {
  return days > 5
    ? 'SLA breached — pending ' + formatDays(days) + ' with ' + level + '. Auto-escalation has been triggered.'
    : 'Pending ' + formatDays(days) + ' with ' + level + '. SLA is 2-3 days per level.';
}

// ---------------------------------------------------------------- list helpers

export const STATUS_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'UNDER_EVALUATION', label: 'Under Evaluation' },
  { id: 'IN_APPROVAL', label: 'In Approval' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'BLOCKED', label: 'Blocked' },
] as const;

/** Prefix-aware status match (SAP truncates Status to 12 chars, log #17). 'ALL' matches everything. */
export function matchesStatus(status: string, tab: string): boolean {
  return tab === 'ALL' || isStatus(status, tab);
}

export function statusCounts(rows: Array<{ Status: string }>): Record<string, number> {
  const out: Record<string, number> = {};
  STATUS_TABS.forEach((t) => { out[t.id] = rows.filter((r) => matchesStatus(r.Status, t.id)).length; });
  return out;
}

/** Fiscal year of a row vs the selected one, both reduced to digits (log #43). A blank selection keeps every row. */
export function inFiscalYear(rowFy: string, selectedFy: string): boolean {
  const s = fyDigits(selectedFy);
  return !s || fyDigits(rowFy) === s;
}

export const isUnderEvaluation = (status: string) => isStatus(status, 'UNDER_EVALUATION');

/** The Evaluate button: only the Unit Technical approver(s) or an admin (EDSK9B0EA7, UX only - SAP enforces it too). */
export function canEvaluate(status: string, isUnitTechnical: boolean, isAdmin: boolean): boolean {
  return isUnderEvaluation(status) && (isAdmin || isUnitTechnical);
}

/** DRAFT, BLOCKED or under evaluation can still take documents. */
export function canUploadDocs(status: string): boolean {
  return status === 'DRAFT' || status === 'BLOCKED' || isUnderEvaluation(status);
}

/** Evaluation._validate. */
export function validateEvaluation(
  e: { technicalRemark: string; vendors: Array<{ quote: number; selected: boolean; rank: string; totalCost?: number; deliveryDays?: number }>; amount: number; nonL1Justification: string },
  cfg: CpeValidationConfig & { threeQuoteLimit?: number },
): string[] {
  const specsMin = cfg.specsMinChars || 15;
  const nonL1Min = cfg.nonL1MinChars || 25;
  const limit = cfg.threeQuoteLimit || 1000000;
  const errs: string[] = [];
  if (e.technicalRemark.trim().length < specsMin) errs.push('Technical remarks are required (at least ' + specsMin + ' characters).');
  if (!e.vendors.some((v) => v.selected)) errs.push('Select the recommended vendor.');
  if (e.amount > limit && e.vendors.length < 3) errs.push('Capex above ₹10 L requires three quotes (L1, L2 and L3).');
  if (nonL1Selected(e.vendors) && e.nonL1Justification.trim().length < nonL1Min) {
    errs.push('A non-L1 selection requires a written justification of at least ' + nonL1Min + ' characters.');
  }
  return errs;
}
