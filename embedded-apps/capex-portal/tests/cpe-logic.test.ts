import { describe, expect, it } from 'vitest';
import {
  buildCpePayload, buildEmptyAttachments, canEvaluate, draftMetrics, emptyDraft, inFiscalYear, matchesStatus, mapVendor, missingDocuments,
  newVendor, nextId, nonL1Narrative, nonL1Selected, patchVendor, resizeAttachmentSlots, savingVsL1, selectVendor, statusCounts,
  submitCpeParams, validateDraft, validateEvaluation, withRanks, type CpeDraft, type DraftVendor,
} from '@/components/cpe/logic';

const v = (id: string, quote: string, extra: Partial<DraftVendor> = {}): DraftVendor => ({ ...newVendor([]), id, name: 'Vendor ' + id, quote, ...extra });

describe('vendor table (indexed updates, log #46)', () => {
  it('ids stay unique after a removal in the middle', () => {
    const rows = [{ id: 'V1' }, { id: 'V3' }];
    expect(nextId('V', rows)).toBe('V4');
  });
  it('ranks by quote and keeps untouched rows by identity', () => {
    const a = v('V1', '300'); const b = v('V2', '100'); const c = v('V3', '');
    const out = withRanks([a, b, c]);
    expect(out.map((x) => x.rank)).toEqual(['L2', 'L1', '']);
    expect(out[2]).toBe(c);
    expect(withRanks(out)[0]).toBe(out[0]);
  });
  it('patchVendor changes only the addressed row', () => {
    const rows = [v('V1', '1'), v('V2', '2')];
    const out = patchVendor(rows, 'V2', { name: 'X' });
    expect(out[0]).toBe(rows[0]);
    expect(out[1].name).toBe('X');
  });
  it('selectVendor leaves exactly one selected', () => {
    const rows = selectVendor([v('V1', '1', { selected: true }), v('V2', '2')], 'V2');
    expect(rows.map((x) => x.selected)).toEqual([false, true]);
  });
  it('detects a non-L1 pick and writes the narrative', () => {
    const rows = withRanks([v('V1', '100000', { deliveryDays: '30' }), v('V2', '150000', { deliveryDays: '20', selected: true })]);
    expect(nonL1Selected(rows)).toBe(true);
    expect(nonL1Narrative(rows, 'create')).toContain('more than L1');
    expect(nonL1Narrative(rows, 'evaluation')).toContain('TCO premium over L1');
    expect(nonL1Narrative(rows, 'evaluation')).toContain('10 days faster');
  });
  it('selecting L1 is not a non-L1 pick', () => {
    expect(nonL1Selected(withRanks([v('V1', '100', { selected: true }), v('V2', '200')]))).toBe(false);
  });
});

describe('attachment matrix', () => {
  it('three slots by default, one for Single Vendor, slot 1 survives the resize', () => {
    const att = buildEmptyAttachments();
    expect(att.rfq).toHaveLength(3);
    att.rfq[0].title = 'kept';
    const single = resizeAttachmentSlots(att, true);
    expect(single.rfq).toHaveLength(1);
    expect(single.quotation).toHaveLength(1);
    expect(single.rfq[0].title).toBe('kept');
    expect(resizeAttachmentSlots(single, false).rfq).toHaveLength(3);
  });
  it('lists every empty mandatory slot', () => {
    expect(missingDocuments(buildEmptyAttachments(1))[0]).toBe('Required documents are missing: RFQ 1, Quotation 1, Techno Commercial Comparative, Negotiation History, Justification Note');
  });
});

describe('validateDraft', () => {
  const base = (): CpeDraft => ({
    ...emptyDraft('B1'), title: 'Press', amount: '500000', specs: 'a long enough specification',
    vendors: withRanks([v('V1', '400000', { selected: true })]),
  });
  const rules = { budgetSufficient: true, documentsEnabled: false };
  it('passes a complete draft and skips documents while disabled', () => {
    expect(validateDraft(base(), rules)).toEqual([]);
  });
  it('enforces documents only when enabled', () => {
    expect(validateDraft(base(), { ...rules, documentsEnabled: true })).toHaveLength(1);
  });
  it('needs three quotes above the limit and a Single Vendor justification', () => {
    const d = { ...base(), amount: '2000000', singleCpe: true };
    const errs = validateDraft(d, rules);
    expect(errs).toContain('Capex above ₹10 L requires three quotes (L1, L2 and L3).');
    expect(errs).toContain('A justification is required when Single Vendor is checked.');
  });
  it('blocks an insufficient budget', () => {
    expect(validateDraft(base(), { ...rules, budgetSufficient: false })[0]).toMatch(/Budget is insufficient/);
  });
});

describe('buildCpePayload', () => {
  const d: CpeDraft = {
    ...emptyDraft('B1'), plant: 'UN13', capexType: 'MANUFACTURING', categoryCode: 'PM', category: 'Plant & Machinery', title: 'T',
    amount: '1500000', specs: 's', deliveryWeeks: '12', cf: ['400000', '500000', '', '', ''],
    vendors: withRanks([v('V1', '1500000', { lifnr: '0000004258', deliveryDays: '30', selected: true }), v('V2', '1400000')]),
  };
  const p = buildCpePayload(d, 'FY2026', draftMetrics(d)) as Record<string, any>;
  it('sends the category code, 3-decimal money and X flags', () => {
    expect(p.Category).toBe('PM');
    expect(p.Fiscalyear).toBe('2026');
    expect(p.Amount).toBe('1500000.000');
    expect(p.MetricsOn).toBe('X');
    expect(p.HurdleRate).toBe('8.00');
    expect(p.PoolBudgetid).toBe('');
  });
  it('deep-inserts vendors with a raw numeric Quality and the selected sequence', () => {
    const rows = p.CPEToVendors.results;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Vendorseq: '0001', Lifnr: '0000004258', QuoteAmt: '1500000.000', Quality: 3, Selected: 'X', Ranking: '2', WarrantyMon: '12', GstCompliant: 'X' });
    expect(typeof rows[0].Quality).toBe('number');
    expect(rows[1].Ranking).toBe('1');
    expect(p.SelVendor).toBe('0001');
  });
  it('always sends 5 cash-flow years', () => {
    expect(p.CPEToCashFlows.results.map((c: any) => c.Yearnr)).toEqual(['01', '02', '03', '04', '05']);
    expect(p.CPEToCashFlows.results[1].Amount).toBe('500000.000');
  });
  it('Single Vendor justification only when ticked', () => {
    expect(p.SingleVendJust).toBe('');
    expect((buildCpePayload({ ...d, singleCpe: true, singleVendorJustification: 'sole source' }, '2026', draftMetrics(d)) as any).SingleVendJust).toBe('sole source');
  });
  it('SubmitCPE params follow the metadata names', () => {
    expect(submitCpeParams('CPE-1', 'B1', '1500000.000')).toEqual({ CpeId: 'CPE-1', BudgetId: 'B1', Amount: 1500000, PoolBudgetId: '', PoolAmount: 0 });
  });
});

describe('metrics', () => {
  it('blank when switched off or no flows', () => {
    const d = { ...emptyDraft(), amount: '1000' };
    expect(draftMetrics(d).irr).toBeNull();
    expect(draftMetrics({ ...d, metricsEnabled: false, cf: ['500', '', '', '', ''] }).npv).toBeNull();
  });
  it('computes for real flows', () => {
    const m = draftMetrics({ ...emptyDraft(), amount: '1000', cf: ['600', '600', '', '', ''] });
    expect(m.irr).toBeGreaterThan(0);
    expect(m.payback).toBeGreaterThan(1);
  });
});

describe('SAP rows', () => {
  const sap = { Cpeid: 'C', Vendorseq: '0002', Ranking: '2', Vendorname: 'N', QuoteAmt: '250.000', Totalcost: '0.000', DeliveryDays: 5, Quality: 3, WarrantyMon: '12', GstCompliant: 'X', Selected: '', Lifnr: '', Waers: 'INR' };
  it('maps ranking with or without the L prefix and decimals', () => {
    expect(mapVendor(sap).rank).toBe('L2');
    expect(mapVendor({ ...sap, Ranking: 'L1' }).rank).toBe('L1');
    expect(mapVendor(sap).quote).toBe(250);
  });
  it('saving vs L1 falls back to quote when TCO is zero', () => {
    const l1 = mapVendor({ ...sap, Vendorseq: '1', Ranking: '1', QuoteAmt: '100' });
    const sel = mapVendor({ ...sap, Vendorseq: '2', Selected: 'X', QuoteAmt: '130' });
    expect(savingVsL1([l1, sel])).toBe(-30);
  });
});

describe('list + status rules', () => {
  it('matches a truncated 12-char Under Evaluation status (log #17)', () => {
    expect(matchesStatus('UNDER_EVALUA', 'UNDER_EVALUATION')).toBe(true);
    expect(matchesStatus('DRAFT', 'UNDER_EVALUATION')).toBe(false);
    expect(matchesStatus('anything', 'ALL')).toBe(true);
  });
  it('counts every tab (log #116)', () => {
    const c = statusCounts([{ Status: 'DRAFT' }, { Status: 'UNDER_EVALUA' }, { Status: 'APPROVED' }, { Status: 'APPROVED' }]);
    expect(c).toMatchObject({ ALL: 4, DRAFT: 1, UNDER_EVALUATION: 1, APPROVED: 2, IN_APPROVAL: 0, BLOCKED: 0 });
  });
  it('fiscal year compares digits only', () => {
    expect(inFiscalYear('2026', 'FY 2026-27')).toBe(true);
    expect(inFiscalYear('2025', 'FY2026')).toBe(false);
    expect(inFiscalYear('2025', '')).toBe(true);
  });
  it('Evaluate is for Unit Technical or admin on an under-evaluation CPE (log #135)', () => {
    expect(canEvaluate('UNDER_EVALUA', true, false)).toBe(true);
    expect(canEvaluate('UNDER_EVALUA', false, true)).toBe(true);
    expect(canEvaluate('UNDER_EVALUA', false, false)).toBe(false);
    expect(canEvaluate('DRAFT', true, true)).toBe(false);
  });
});

describe('validateEvaluation', () => {
  const ok = { technicalRemark: 'verified every spec point', amount: 500000, nonL1Justification: '', vendors: [{ quote: 100, selected: true, rank: 'L1' }] };
  it('accepts a complete evaluation', () => expect(validateEvaluation(ok, {})).toEqual([]));
  it('requires remarks, a selection, three quotes and a non-L1 reason', () => {
    const errs = validateEvaluation({ ...ok, technicalRemark: 'x', amount: 2000000, vendors: [{ quote: 100, selected: false, rank: 'L1' }, { quote: 200, selected: false, rank: 'L2' }] }, {});
    expect(errs).toHaveLength(3);
    const nonL1 = validateEvaluation({ ...ok, vendors: [{ quote: 100, selected: false, rank: 'L1' }, { quote: 200, selected: true, rank: 'L2' }] }, {});
    expect(nonL1[0]).toMatch(/non-L1/);
  });
});
