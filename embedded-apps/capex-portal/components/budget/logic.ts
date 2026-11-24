/**
 * Pure Budget Create logic (no React, no network): draft shape, validation, BudgetSet deep-insert payload, Excel template
 * rows and Excel row grouping. Ported from BudgetCreate.controller.js (_validate, _buildBudgetPayload, _buildCashFlowPayload,
 * _buildItemsPayload, _applyUploadedWorkbook, _bulkImportBudgets, _saveBudgetFromRows). Unit-tested in tests/budget-logic.test.ts.
 */

/** Discount / hurdle rate is a fixed company figure (log #45), not the ConfigSet DEFAULT_HURDLE_RATE row. */
export const HURDLE_RATE = 8;
export const DEFAULT_JUSTIF_MIN_CHARS = 20;
export const CASHFLOW_YEARS = 10;

export const TEMPLATE_COLUMNS = [
  'Budget Title', 'Plant', 'Capex Type', 'Category',
  'Justification', 'Expected Benefit',
  'Enable Financial Metrics (Yes/No)',
  'Cash Flow Year 1', 'Cash Flow Year 2', 'Cash Flow Year 3', 'Cash Flow Year 4', 'Cash Flow Year 5',
  'Cash Flow Year 6', 'Cash Flow Year 7', 'Cash Flow Year 8', 'Cash Flow Year 9', 'Cash Flow Year 10',
  'Item Description', 'Item Amount', 'Item Remarks',
] as const;

export interface Option { key: string; text: string }

export interface DraftItem { id: string; title: string; amount: string; remarks: string }

export interface BudgetDraft {
  budgetId?: string;
  fiscalYear?: string;
  title: string;
  plant: string;
  capexType: string;
  category: string;
  /** typed amount (string so the input can be edited freely); derived from the items when there are any */
  amount: string;
  justification: string;
  expectedBenefit: string;
  metricsEnabled: boolean;
  /** cash flow years 1..10 as typed */
  cf: string[];
  items: DraftItem[];
}

export const emptyCashFlows = (): string[] => Array.from({ length: CASHFLOW_YEARS }, () => '');

export function newDraft(defaultPlant: string, defaults: { capexType?: string; category?: string } = {}): BudgetDraft {
  return {
    title: '', plant: defaultPlant, capexType: defaults.capexType ?? 'MANUFACTURING', category: defaults.category ?? 'PM',
    amount: '', justification: '', expectedBenefit: '', metricsEnabled: true, cf: emptyCashFlows(), items: [],
  };
}

const n0 = (v: unknown) => Number(v) || 0;

export const itemsTotal = (items: Array<{ amount: string | number | null }>): number => items.reduce((n, o) => n + n0(o.amount), 0);

/** Header Amount: sum of the items once there is at least one (user-typed otherwise) - _recalcItemsTotal. */
export function effectiveAmount(d: Pick<BudgetDraft, 'amount' | 'items'>): number {
  return d.items.length ? itemsTotal(d.items) : n0(d.amount);
}

/** BudgetCreate._validate messages (Submit only; Save Draft just needs a title). */
export function validateDraft(d: BudgetDraft, justifMinChars = DEFAULT_JUSTIF_MIN_CHARS): string[] {
  const errors: string[] = [];
  if (!d.title.trim()) errors.push('Budget title is required.');
  if (!d.plant) errors.push('Plant / unit is required.');
  if (!d.capexType) errors.push('Capex type is required.');
  if (!d.category) errors.push('Category is required.');
  if (!(effectiveAmount(d) > 0)) errors.push('Budget amount must be greater than zero.');
  if (d.justification.trim().length < justifMinChars) errors.push(`Business justification must be at least ${justifMinChars} characters.`);
  d.items.forEach((it, i) => {
    const label = `Item ${i + 1}${it.title ? ` (${it.title})` : ''}`;
    if (!it.title.trim()) errors.push(`Item ${i + 1}: title is required.`);
    if (!(n0(it.amount) > 0)) errors.push(`${label}: amount must be greater than zero.`);
  });
  return errors;
}

export interface CashFlowRow { Yearnr: string; Amount: string; Waers: string }
export interface ItemRow { Itemno: string; ItemTitle: string; Amount: string; Waers: string; Remarks: string }
export interface BudgetPayload {
  Budgetid?: string;
  Fiscalyear: string; Title: string; Capextype: string; Category: string; Werks: string; Waers: string;
  Justification: string; ExpectedBenefit: string; AmtApproved: string; Investment: string; HurdleRate: string;
  Irr: string; Npv: string; Payback: string; MetricsOn: string; IsCommonpool: string; FundingSrc: string; SrcAufnr: string;
  BudgetToCashFlows: CashFlowRow[];
  BudgetToItems?: ItemRow[];
}

/** _buildCashFlowPayload: trailing unentered years trimmed; none when metrics are off. Yearnr is "01".."10". */
export function buildCashFlowPayload(d: Pick<BudgetDraft, 'metricsEnabled' | 'cf'>): CashFlowRow[] {
  if (!d.metricsEnabled) return [];
  let last = -1;
  d.cf.forEach((v, i) => { if (n0(v)) last = i; });
  return d.cf.slice(0, last + 1).map((v, i) => ({ Yearnr: (i + 1 < 10 ? '0' : '') + (i + 1), Amount: n0(v).toFixed(3), Waers: 'INR' }));
}

/** _buildItemsPayload: Itemno blank (backend-assigned 0001...). */
export function buildItemsPayload(items: DraftItem[]): ItemRow[] {
  return items.map((it) => ({ Itemno: '', ItemTitle: it.title, Amount: n0(it.amount).toFixed(2), Waers: 'INR', Remarks: it.remarks || '' }));
}

export interface MetricValues { irr: number | null; npv: number | null; payback: number | null }

/**
 * _buildBudgetPayload. Irr/Npv/Payback are Nullable=false in SAP, so a metric never calculated goes over as 0.
 * MetricsOn/IsCommonpool are 'X'/'' strings (a JS boolean is rejected before CREATE_ENTITY). Funding is always NEW (log #44/#131).
 * Editing a draft keeps its own fiscal year; a new budget takes the current one.
 */
export function buildBudgetPayload(d: BudgetDraft, m: MetricValues, fiscalYearDigits: string): BudgetPayload {
  const metric = (v: number | null, dec: number) => (v === null || v === undefined || isNaN(v) ? 0 : v).toFixed(dec);
  const amount = effectiveAmount(d);
  const payload: BudgetPayload = {
    Fiscalyear: d.fiscalYear || fiscalYearDigits,
    Title: d.title, Capextype: d.capexType, Category: d.category, Werks: d.plant, Waers: 'INR',
    Justification: d.justification, ExpectedBenefit: d.expectedBenefit || '',
    AmtApproved: amount.toFixed(3), Investment: amount.toFixed(3), HurdleRate: HURDLE_RATE.toFixed(2),
    Irr: metric(m.irr, 2), Npv: metric(m.npv, 3), Payback: metric(m.payback, 2),
    MetricsOn: d.metricsEnabled ? 'X' : '', IsCommonpool: '', FundingSrc: 'NEW', SrcAufnr: '',
    BudgetToCashFlows: buildCashFlowPayload(d),
  };
  if (d.budgetId) payload.Budgetid = d.budgetId;
  if (d.items.length) payload.BudgetToItems = buildItemsPayload(d.items);
  return payload;
}

// ------------------------------------------------------------------ Excel

/** Guard against spreadsheet formula injection: a cell starting with = + - @ (or tab/CR) gets a leading quote. */
export function guardCell<T>(v: T): T | string {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
export const guardRow = (row: unknown[]): unknown[] => row.map(guardCell);

export interface TemplateOptions { plants: Option[]; capexTypes: Option[]; categories: Option[] }

/** The two sheets of Budget_Upload_Template.xlsx as arrays of rows (onDownloadTemplate). All text cells are formula-guarded. */
export function buildTemplateSheets(o: TemplateOptions): { template: unknown[][]; instructions: unknown[][] } {
  const plant = o.plants[0]?.text || 'Pacharia Plant';
  const capexType = o.capexTypes[0]?.text || 'Manufacturing Units';
  const category = o.categories[0]?.text || 'Plant & Machinery';
  const cols = [...TEMPLATE_COLUMNS];
  const instructions: unknown[][] = [
    ['How to fill in the Budget Template sheet'],
    ['One row per budget line item.'],
    ['Repeat the budget-level columns (Budget Title through Cash Flow Year 10) identically on every row for the same budget - only Item Description / Item Amount / Item Remarks should differ row to row.'],
    ['For a single line item, fill in just one data row.'],
    [],
    ['Allowed Plant values'], ...o.plants.map((p) => [p.text]),
    [], ['Allowed Capex Type values'], ...o.capexTypes.map((p) => [p.text]),
    [], ['Allowed Category values'], ...o.categories.map((p) => [p.text]),
    [],
    ['Enable Financial Metrics (Yes/No) - enter Yes or No'],
    [],
    ['EXAMPLE - one budget with 2 line items (as two rows repeating the same budget details):'],
    cols,
    ['Expansion of Line 3', plant, capexType, category, 'Capacity constraint on Line 3 during peak season.', '15% throughput increase.', 'Yes', 250000, 300000, 300000, 300000, 300000, '', '', '', '', '', 'New extrusion machine', 1800000, 'Primary equipment'],
    ['Expansion of Line 3', plant, capexType, category, 'Capacity constraint on Line 3 during peak season.', '15% throughput increase.', 'Yes', 250000, 300000, 300000, 300000, 300000, '', '', '', '', '', 'Installation and commissioning', 200000, 'Civil + electrical works'],
    [],
    ['EXAMPLE - a second, different budget with a single line item (just one row, a different Budget Title from the one above - each distinct Budget Title found in the file becomes its own budget):'],
    cols,
    ['Replacement AHU Unit 2', plant, capexType, category, 'Existing AHU unit has exceeded its useful life.', 'Reduced maintenance cost.', 'No', '', '', '', '', '', '', '', '', '', '', 'Replacement AHU unit', 450000, ''],
  ];
  return { template: [cols], instructions: instructions.map(guardRow) };
}

/** Resolves a typed Plant / Capex Type / Category (key or text, case-insensitive) to its key; '' when unrecognised. */
export function resolveKey(list: Option[], value: string): string {
  const needle = value.trim().toLowerCase();
  if (!needle) return '';
  return list.find((o) => o.key.toLowerCase() === needle || o.text.toLowerCase() === needle)?.key ?? '';
}

export interface ParsedBudget {
  title: string; plant: string; capexType: string; category: string;
  justification: string; expectedBenefit: string; metricsEnabled: boolean;
  cf: string[]; items: DraftItem[];
  /** Plant / Capex Type / Category values the sheet had but SAP's lists did not recognise (the default was used) */
  warnings: string[];
}

export type SheetParse =
  | { kind: 'error'; reason: 'invalid' | 'empty' }
  | { kind: 'budgets'; budgets: ParsedBudget[] }
  /** No Budget Title anywhere: nothing to group by, fill the on-screen form from the first row (the one remaining Fiori fallback) */
  | { kind: 'form'; budget: ParsedBudget };

export interface ParseContext { plants: Option[]; capexTypes: Option[]; categories: Option[]; defaultPlant: string; defaultCapexType?: string; defaultCategory?: string }

const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const numOrBlank = (s: string) => { const f = parseFloat(s); return f ? String(f) : ''; };

/**
 * _applyUploadedWorkbook: array-of-arrays (header row first) -> budgets grouped by Budget Title (sheet order).
 * Budget-level columns come from the FIRST row of each group; every row with an Item Description or Item Amount is one line item.
 * The header must contain the first four template columns. Rows with no non-blank cell are ignored.
 */
export function parseBudgetSheet(aoa: unknown[][], ctx: ParseContext): SheetParse {
  const rows = aoa.map((r) => (r || []).map(cellText)).filter((r) => r.some((s) => s !== ''));
  if (!rows.length) return { kind: 'error', reason: 'empty' };
  const header = rows[0].map((s) => s.toLowerCase());
  if (!TEMPLATE_COLUMNS.slice(0, 4).every((c) => header.includes(c.toLowerCase()))) return { kind: 'error', reason: 'invalid' };
  const data = rows.slice(1);
  if (!data.length) return { kind: 'error', reason: 'empty' };

  const col = (row: string[], name: string) => { const i = header.indexOf(name.toLowerCase()); return i > -1 ? (row[i] || '').trim() : ''; };
  const build = (group: string[][]): ParsedBudget => {
    const first = group[0];
    const warnings: string[] = [];
    const pick = (label: string, list: Option[], fallback: string, name: string) => {
      const raw = col(first, name);
      const key = resolveKey(list, raw);
      if (raw && !key) warnings.push(`${label} "${raw}"`);
      return key || fallback;
    };
    const metricsRaw = col(first, 'Enable Financial Metrics (Yes/No)').toLowerCase();
    const items: DraftItem[] = [];
    group.forEach((r, i) => {
      const title = col(r, 'Item Description');
      const amt = col(r, 'Item Amount');
      if (!title && !amt) return;
      items.push({ id: `x-${i}`, title, amount: numOrBlank(amt), remarks: col(r, 'Item Remarks') });
    });
    return {
      title: col(first, 'Budget Title'),
      plant: pick('Plant', ctx.plants, ctx.defaultPlant, 'Plant'),
      capexType: pick('Capex Type', ctx.capexTypes, ctx.defaultCapexType ?? 'MANUFACTURING', 'Capex Type'),
      category: pick('Category', ctx.categories, ctx.defaultCategory ?? 'PM', 'Category'),
      justification: col(first, 'Justification'),
      expectedBenefit: col(first, 'Expected Benefit'),
      metricsEnabled: metricsRaw ? /^y/.test(metricsRaw) : true,
      cf: Array.from({ length: CASHFLOW_YEARS }, (_, i) => numOrBlank(col(first, `Cash Flow Year ${i + 1}`))),
      items, warnings,
    };
  };

  const titles = data.map((r) => col(r, 'Budget Title'));
  const unique = titles.filter((t, i) => t && titles.indexOf(t) === i);
  if (!unique.length) return { kind: 'form', budget: build(data) };
  return { kind: 'budgets', budgets: unique.map((t) => build(data.filter((r) => col(r, 'Budget Title') === t))) };
}

/** A parsed budget as a draft (for the bulk path: amount = sum of items, like _saveBudgetFromRows). */
export function draftFromParsed(p: ParsedBudget): BudgetDraft {
  return {
    title: p.title, plant: p.plant, capexType: p.capexType, category: p.category,
    amount: p.items.length ? String(itemsTotal(p.items)) : '', justification: p.justification, expectedBenefit: p.expectedBenefit,
    metricsEnabled: p.metricsEnabled, cf: p.cf, items: p.items,
  };
}
