import { describe, it, expect } from 'vitest';
import {
  TEMPLATE_COLUMNS, parseBudgetSheet, buildBudgetPayload, buildCashFlowPayload, validateDraft, guardCell, buildTemplateSheets,
  newDraft, effectiveAmount, draftFromParsed, resolveKey, type ParseContext,
} from '../components/budget/logic';

const ctx: ParseContext = {
  plants: [{ key: 'UN13', text: 'EMAMI LTD, Pachoria' }, { key: 'A021', text: 'Emami Limited Amazon' }],
  capexTypes: [{ key: 'MANUFACTURING', text: 'Manufacturing Units' }, { key: 'IT', text: 'IT' }],
  categories: [{ key: 'PM', text: 'Plant & Machinery' }],
  defaultPlant: 'UN13',
};
const H = [...TEMPLATE_COLUMNS] as string[];
const row = (o: Record<string, string | number>) => H.map((h) => o[h] ?? '');

describe('parseBudgetSheet', () => {
  it('groups rows by Budget Title in sheet order; budget columns from the first row, one item per filled row', () => {
    const r = parseBudgetSheet([
      H,
      row({ 'Budget Title': 'A', Plant: 'Un13', 'Capex Type': 'Manufacturing Units', Category: 'Plant & Machinery', Justification: 'j', 'Cash Flow Year 1': 100, 'Item Description': 'x', 'Item Amount': 10 }),
      row({ 'Budget Title': 'B', Plant: 'A021', 'Capex Type': 'IT', Category: 'PM', 'Enable Financial Metrics (Yes/No)': 'No', 'Item Description': 'y', 'Item Amount': 5 }),
      row({ 'Budget Title': 'A', 'Item Description': 'z', 'Item Amount': '20', 'Item Remarks': 'rem' }),
    ], ctx);
    expect(r.kind).toBe('budgets');
    if (r.kind !== 'budgets') return;
    expect(r.budgets.map((b) => b.title)).toEqual(['A', 'B']);
    const [a, b] = r.budgets;
    expect(a.plant).toBe('UN13');
    expect(a.items.map((i) => [i.title, i.amount, i.remarks])).toEqual([['x', '10', ''], ['z', '20', 'rem']]);
    expect(a.cf[0]).toBe('100');
    expect(a.metricsEnabled).toBe(true);
    expect(b.metricsEnabled).toBe(false);
    expect(b.plant).toBe('A021');
    expect(draftFromParsed(a).amount).toBe('30');
  });
  it('single title still goes the bulk way', () => {
    const r = parseBudgetSheet([H, row({ 'Budget Title': 'Only', 'Item Description': 'x', 'Item Amount': 1 })], ctx);
    expect(r.kind).toBe('budgets');
  });
  it('defaults and warns on unknown plant/type/category', () => {
    const r = parseBudgetSheet([H, row({ 'Budget Title': 'A', Plant: 'Nowhere', 'Capex Type': 'Space', Category: 'Magic' })], ctx);
    if (r.kind !== 'budgets') throw new Error('x');
    expect(r.budgets[0].plant).toBe('UN13');
    expect(r.budgets[0].capexType).toBe('MANUFACTURING');
    expect(r.budgets[0].category).toBe('PM');
    expect(r.budgets[0].warnings).toEqual(['Plant "Nowhere"', 'Capex Type "Space"', 'Category "Magic"']);
  });
  it('no Budget Title anywhere -> form fallback; bad header / empty -> errors', () => {
    expect(parseBudgetSheet([H, row({ Plant: 'UN13', 'Item Description': 'x', 'Item Amount': 3 })], ctx).kind).toBe('form');
    expect(parseBudgetSheet([['a', 'b'], ['1', '2']], ctx)).toEqual({ kind: 'error', reason: 'invalid' });
    expect(parseBudgetSheet([], ctx)).toEqual({ kind: 'error', reason: 'empty' });
    expect(parseBudgetSheet([H], ctx)).toEqual({ kind: 'error', reason: 'empty' });
  });
});

describe('payload', () => {
  const d = { ...newDraft('UN13'), title: 'T', justification: 'x'.repeat(25), amount: '1000', cf: ['100', '', '200', '', '', '', '', '', '', ''] };
  it('cash flows trim trailing years, Yearnr zero padded; off when metrics off', () => {
    expect(buildCashFlowPayload(d)).toEqual([{ Yearnr: '01', Amount: '100.000', Waers: 'INR' }, { Yearnr: '02', Amount: '0.000', Waers: 'INR' }, { Yearnr: '03', Amount: '200.000', Waers: 'INR' }]);
    expect(buildCashFlowPayload({ ...d, metricsEnabled: false })).toEqual([]);
  });
  it('flags are X/"" strings, metrics null -> 0, items sum into amount, id kept when editing', () => {
    const p = buildBudgetPayload({ ...d, budgetId: 'B-1', fiscalYear: '2025', items: [{ id: '1', title: 'i', amount: '300', remarks: '' }, { id: '2', title: 'j', amount: '200', remarks: 'r' }] }, { irr: null, npv: null, payback: NaN }, '2026');
    expect(p.MetricsOn).toBe('X');
    expect(p.IsCommonpool).toBe('');
    expect(p.FundingSrc).toBe('NEW');
    expect(p.Fiscalyear).toBe('2025');
    expect(p.Budgetid).toBe('B-1');
    expect(p.AmtApproved).toBe('500.000');
    expect(p.HurdleRate).toBe('8.00');
    expect([p.Irr, p.Npv, p.Payback]).toEqual(['0.00', '0.000', '0.00']);
    expect(p.BudgetToItems).toEqual([{ Itemno: '', ItemTitle: 'i', Amount: '300.00', Waers: 'INR', Remarks: '' }, { Itemno: '', ItemTitle: 'j', Amount: '200.00', Waers: 'INR', Remarks: 'r' }]);
    expect(buildBudgetPayload({ ...d, metricsEnabled: false }, { irr: 1, npv: 2, payback: 3 }, '2026').MetricsOn).toBe('');
    expect('Budgetid' in buildBudgetPayload(d, { irr: 1, npv: 2, payback: 3 }, '2026')).toBe(false);
    expect(buildBudgetPayload(d, { irr: 1, npv: 2, payback: 3 }, '2026').Fiscalyear).toBe('2026');
  });
});

describe('validateDraft', () => {
  it('lists every problem', () => {
    const e = validateDraft(newDraft(''), 20);
    expect(e).toEqual(['Budget title is required.', 'Plant / unit is required.', 'Budget amount must be greater than zero.', 'Business justification must be at least 20 characters.']);
  });
  it('item rules, no per-line cap', () => {
    const d = { ...newDraft('UN13'), title: 'T', justification: 'y'.repeat(30), items: [{ id: '1', title: '', amount: '', remarks: '' }, { id: '2', title: 'big', amount: '99999999', remarks: '' }] };
    expect(validateDraft(d)).toEqual(['Item 1: title is required.', 'Item 1: amount must be greater than zero.']);
    expect(effectiveAmount(d)).toBe(99999999);
  });
});

describe('excel guards', () => {
  it('prefixes formula starters with a quote', () => {
    expect(guardCell('=1+1')).toBe("'=1+1");
    expect(guardCell('+x')).toBe("'+x");
    expect(guardCell('-x')).toBe("'-x");
    expect(guardCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(guardCell('plain')).toBe('plain');
    expect(guardCell(-5)).toBe(-5);
  });
  it('template sheets: header only on the data sheet, guarded instruction cells', () => {
    const s = buildTemplateSheets({ plants: [{ key: 'X', text: '=evil()' }], capexTypes: [], categories: [] });
    expect(s.template).toEqual([[...TEMPLATE_COLUMNS]]);
    expect(JSON.stringify(s.instructions)).toContain("'=evil()");
  });
  it('resolveKey matches key or text', () => {
    expect(resolveKey(ctx.plants, 'a021')).toBe('A021');
    expect(resolveKey(ctx.plants, 'emami limited amazon')).toBe('A021');
    expect(resolveKey(ctx.plants, 'nope')).toBe('');
  });
});
