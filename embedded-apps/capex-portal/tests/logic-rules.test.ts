import { describe, it, expect } from 'vitest';
import * as R from '@/lib/rules';

const ch = (role: string, seq: string, sla = 2): R.DoaChainLike => ({ Seqnr: seq, Role: role, Approver: role.toLowerCase(), SlaDays: sla });
const rule = (id: string, type: string, from: number | string, to: number | string, active: string, chain: R.DoaChainLike[], doc = ''): R.DoaRuleLike => ({
  Doaid: id, Capextype: type, AmountFrom: from, AmountTo: to, Active: active, Doctype: doc, DoaRuleToChain: { results: chain },
});
const L10 = 1000000;

const rules = [
  rule('D1', 'MANUFACTURING', '0.00', '1000000.00', '', [ch('Old', '1')]), // inactive legacy (#94)
  rule('D7', '*', 0, L10, 'X', [ch('B', '2'), ch('A', '1'), ch('C', '3')]),
  rule('D8', '*', L10, 0, 'X', [ch('X1', '1'), ch('Unit Technical Head', '2'), ch('X3', '3')]),
];

describe('resolveDOA', () => {
  it('ignores Active="" rules (log #94) and uses "*"', () => {
    const r = R.resolveDOA(rules, 'MANUFACTURING', 500000, 'CPE');
    expect(r.rule?.Doaid).toBe('D7');
  });
  it('sorts chain by Seqnr, levels 1..n, first PENDING', () => {
    const r = R.resolveDOA(rules, 'IT', 500000, 'CPE');
    expect(r.chain.map((s) => [s.level, s.role, s.status])).toEqual([[1, 'A', 'PENDING'], [2, 'B', 'WAITING'], [3, 'C', 'WAITING']]);
    expect(r.chain[0].slaDays).toBe(2);
  });
  it('numeric-aware Seqnr ("10" after "2")', () => {
    const rs = [rule('Z', '*', 0, 0, 'X', [ch('ten', '10'), ch('two', '2')])];
    expect(R.resolveDOA(rs, 'IT', 1).chain.map((s) => s.role)).toEqual(['two', 'ten']);
  });
  it('boundary: exactly 10 lakh matches both inclusive ranges, first in list wins', () => {
    expect(R.resolveDOA(rules, 'IT', L10).rule?.Doaid).toBe('D7');
    expect(R.resolveDOA(rules, 'IT', L10 + 0.01).rule?.Doaid).toBe('D8');
    expect(R.resolveDOA([rules[2], rules[1]], 'IT', L10).rule?.Doaid).toBe('D8');
  });
  it('AmountTo=0 is open-ended', () => {
    expect(R.resolveDOA(rules, 'IT', 99999999999).rule?.Doaid).toBe('D8');
  });
  it('below AmountFrom -> no match, empty chain', () => {
    const rs = [rule('S', '*', 100, 200, 'X', [ch('A', '1')])];
    expect(R.resolveDOA(rs, 'IT', 99.99)).toEqual({ rule: null, chain: [] });
    expect(R.resolveDOA(rs, 'IT', 100).rule?.Doaid).toBe('S');
    expect(R.resolveDOA(rs, 'IT', 200).rule?.Doaid).toBe('S');
    expect(R.resolveDOA(rs, 'IT', 200.01).rule).toBeNull();
  });
  it('capex type must match or be "*"', () => {
    const rs = [rule('M', 'MOULDS', 0, 0, 'X', [ch('A', '1')])];
    expect(R.resolveDOA(rs, 'IT', 5).rule).toBeNull();
    expect(R.resolveDOA(rs, 'MOULDS', 5).rule?.Doaid).toBe('M');
  });
  it('Rev3 T9: exact docType preferred over generic; other docType excluded', () => {
    const rs = [
      rule('G', '*', 0, 0, 'X', [ch('Gen', '1')], ''),
      rule('B', '*', 0, 0, 'X', [ch('Bud', '1')], 'BUD'),
      rule('C', '*', 0, 0, 'X', [ch('Cpe', '1')], 'CPE'),
    ];
    expect(R.resolveDOA(rs, 'IT', 5, 'BUD').rule?.Doaid).toBe('B');
    expect(R.resolveDOA(rs, 'IT', 5, 'CPE').rule?.Doaid).toBe('C');
    expect(R.resolveDOA(rs, 'IT', 5, '').rule?.Doaid).toBe('G'); // omitted docType: only generic rules (Fiori code behaviour)
    expect(R.resolveDOA([rs[1]], 'IT', 5, 'CPE').rule).toBeNull();
  });
  it('empty / missing chain and empty rule list', () => {
    expect(R.resolveDOA([], 'IT', 5)).toEqual({ rule: null, chain: [] });
    const rs = [{ Doaid: 'E', Capextype: '*', AmountFrom: 0, AmountTo: 0, Active: 'X' } as R.DoaRuleLike];
    const r = R.resolveDOA(rs, 'IT', 5);
    expect(r.rule?.Doaid).toBe('E');
    expect(r.chain).toEqual([]);
  });
  it('accepts a plain array or .chain', () => {
    const rs: R.DoaRuleLike[] = [{ Doaid: 'P', Capextype: '*', AmountFrom: 0, AmountTo: 0, Active: 'X', DoaRuleToChain: [ch('A', '1')] }];
    expect(R.resolveDOA(rs, 'IT', 5).chain).toHaveLength(1);
    rs[0] = { ...rs[0], DoaRuleToChain: undefined, chain: [ch('Q', '1')] };
    expect(R.resolveDOA(rs, 'IT', 5).chain[0].role).toBe('Q');
  });
  it('Active only "X"', () => {
    expect(R.isRuleActive({ Active: 'X' })).toBe(true);
    expect(R.isRuleActive({ Active: '' })).toBe(false);
    expect(R.isRuleActive({ Active: 'x' })).toBe(false);
  });
});

describe('skipUnitTechnical / chainProgress', () => {
  it('drops Unit Technical (case-insensitive) and renumbers', () => {
    const r = R.resolveDOA(rules, 'IT', 2 * L10);
    const out = R.skipUnitTechnical(r.chain);
    expect(out.map((s) => [s.level, s.role])).toEqual([[1, 'X1'], [2, 'X3']]);
    expect(R.skipUnitTechnical([{ role: 'unit technical head' }])).toEqual([]);
    expect(R.skipUnitTechnical(null)).toEqual([]);
    expect(R.isUnitTechnicalRole('Head Unit Technical')).toBe(false);
  });
  it('chainProgress', () => {
    const c = [{ role: 'A' }, { role: 'B' }, { role: 'C' }];
    expect(R.chainProgress(c, 'B', false).map((s) => s.status)).toEqual(['APPROVED', 'PENDING', 'WAITING']);
    expect(R.chainProgress(c, 'zzz', false).map((s) => s.status)).toEqual(['WAITING', 'WAITING', 'WAITING']);
    expect(R.chainProgress(c, 'B', true).map((s) => s.status)).toEqual(['APPROVED', 'APPROVED', 'APPROVED']);
  });
});

describe('budget', () => {
  it('available = approved - committed - spent', () => {
    expect(R.budgetAvailable({ approved: '1000', committed: '200', spent: 300 })).toBe(500);
    expect(R.budgetAvailable(null)).toBe(0);
  });
  it('exactly equal is sufficient; one paisa over blocks', () => {
    expect(R.checkBudget(500, 500)).toEqual({ available: 500, sufficient: true, blocked: false, shortfall: 0 });
    const c = R.checkBudget(500, 500.01);
    expect(c.blocked).toBe(true);
    expect(c.shortfall).toBeCloseTo(0.01, 9);
  });
  it('negative / zero available', () => {
    expect(R.checkBudget(-100, 50)).toMatchObject({ blocked: true, shortfall: 150 });
    expect(R.checkBudget(0, 0).blocked).toBe(false);
    expect(R.checkBudget(NaN, 10)).toMatchObject({ available: 0, blocked: true, shortfall: 10 });
  });
});

describe('quota', () => {
  const caps = { yearCap: 200000, singleCap: 50000, plantCaps: { P500: 500000 } };
  it('within limits', () => expect(R.checkQuota(100000, 50000, caps)).toEqual({ ok: true, reason: 'Within unit quota limits.' }));
  it('single cap boundary is inclusive', () => {
    expect(R.checkQuota(0, 50000, caps).ok).toBe(true);
    const r = R.checkQuota(0, 50001, caps);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Single capex under unit quota cannot exceed ₹ 50,000. Requested ₹ 50,001.');
  });
  it('year cap boundary', () => {
    expect(R.checkQuota(150000, 50000, caps).ok).toBe(true);
    const r = R.checkQuota(150001, 50000, caps);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Annual unit quota of ₹ 2,00,000 would be exceeded. Used ₹ 1,50,001, remaining ₹ 49,999.');
  });
  it('Rev3 T10 per-plant caps; single cap stays global', () => {
    expect(R.checkQuota(300000, 50000, caps, 'P500').ok).toBe(true);
    expect(R.checkQuota(300000, 50000, caps, 'P100').ok).toBe(false);
    expect(R.checkQuota(0, 60000, caps, 'P500').ok).toBe(false);
    expect(R.checkQuota(0, 1, { plantCaps: { P0: 0 } }, 'P0').ok).toBe(false); // plant cap 0 is defined -> used
  });
  it('defaults when caps unset', () => {
    expect(R.yearCapFor({})).toBe(200000);
    expect(R.checkQuota(0, 50001, {}).ok).toBe(false);
    expect(R.checkQuota(199999, 1, {}).ok).toBe(true);
  });
});

describe('vendors', () => {
  it('rankVendors: L1..Ln by quote, zero quotes unranked, input order kept', () => {
    expect(R.rankVendors([{ quote: 300 }, { quote: 0 }, { quote: '100' }, { quote: 200 }])).toEqual(['L3', '', 'L1', 'L2']);
    expect(R.rankVendors([])).toEqual([]);
    expect(R.rankVendors([{ quote: 5 }, { quote: 5 }])).toEqual(['L1', 'L2']);
  });
  it('requiresThreeQuotes: strictly above the limit', () => {
    expect(R.requiresThreeQuotes(1000000)).toBe(false);
    expect(R.requiresThreeQuotes(1000001)).toBe(true);
    expect(R.requiresThreeQuotes(500, 100)).toBe(true);
    expect(R.requiresThreeQuotes(0)).toBe(false);
  });
  it('non-L1 detection + justification length (trimmed)', () => {
    const v = [{ quote: 100 }, { quote: 200, selected: true }];
    expect(R.isNonL1Selection(v)).toBe(true);
    expect(R.isNonL1Selection([{ quote: 100, selected: true }, { quote: 200 }])).toBe(false);
    expect(R.isNonL1Selection([{ quote: 100 }])).toBe(false);
    expect(R.nonL1JustificationOk('x'.repeat(25))).toBe(true);
    expect(R.nonL1JustificationOk('x'.repeat(24))).toBe(false);
    expect(R.nonL1JustificationOk('  ' + 'x'.repeat(24) + '  ')).toBe(false);
    expect(R.nonL1JustificationOk('abc', 3)).toBe(true);
    expect(R.nonL1JustificationOk(null)).toBe(false);
  });
  it('compareToL1 saving / premium, TCO preferred over quote', () => {
    const l1 = { quote: 100, deliveryDays: 20 };
    expect(R.compareToL1(l1, { quote: 120, totalCost: 80, deliveryDays: 15 })).toEqual({ saving: 20, isSaving: true, premium: 0, daysFaster: 5 });
    expect(R.compareToL1(l1, { quote: 130, deliveryDays: 25 })).toEqual({ saving: -30, isSaving: false, premium: 30, daysFaster: -5 });
  });
});

describe('validators', () => {
  const good: R.CpeValidationInput = {
    budgetId: 'B1', title: 'T', amount: 500000, specs: 'x'.repeat(15), budgetSufficient: true,
    vendors: [{ name: 'A', quote: 100, selected: true }],
  };
  it('valid CPE', () => expect(R.validateCpe(good)).toEqual([]));
  it('three quotes needed strictly above 10 lakh', () => {
    expect(R.validateCpe({ ...good, amount: 1000000 })).toEqual([]);
    expect(R.validateCpe({ ...good, amount: 1000001 })).toEqual(['Capex above ₹10 L requires three quotes (L1, L2 and L3).']);
  });
  it('collects messages in Fiori order', () => {
    const e = R.validateCpe({ budgetId: '', title: ' ', amount: 0, specs: '', budgetSufficient: false, vendors: [] });
    expect(e).toEqual([
      'Select an approved budget.', 'CPE title is required.', 'CPE amount must be greater than zero.',
      'Technical specifications are required (at least 15 characters).',
      'Budget is insufficient. Draw from the common pool or route for a budget increase.',
      'At least one vendor quote is required.', 'Select the recommended vendor.',
    ]);
  });
  it('non-L1 and single vendor justification', () => {
    const v = [{ name: 'A', quote: 100 }, { name: 'B', quote: 200, selected: true }];
    expect(R.validateCpe({ ...good, vendors: v })[0]).toMatch(/non-L1/);
    expect(R.validateCpe({ ...good, vendors: v, nonL1Justification: 'y'.repeat(25) })).toEqual([]);
    expect(R.validateCpe({ ...good, singleCpe: true, singleVendorJustification: ' ' })).toEqual(['A justification is required when Single Vendor is checked.']);
  });
  it('validateBudget', () => {
    const b: R.BudgetValidationInput = { title: 'T', plant: 'P', capexType: 'IT', category: 'PM', amount: 10, justification: 'j'.repeat(20) };
    expect(R.validateBudget(b)).toEqual([]);
    expect(R.validateBudget({ ...b, justification: 'j'.repeat(19) })).toEqual(['Business justification must be at least 20 characters.']);
    expect(R.validateBudget({ ...b, items: [{ title: '', amount: 0 }, { title: 'Pump', amount: 5 }] })).toEqual([
      'Item 1: title is required.', 'Item 1: amount must be greater than zero.',
    ]);
    expect(R.validateBudget({ title: '', plant: '', capexType: '', category: '', amount: '', justification: '' })).toHaveLength(6);
  });
});
