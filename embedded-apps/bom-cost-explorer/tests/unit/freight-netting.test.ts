import { describe, expect, it } from 'vitest';
import { ALL_DATES, DEFAULT_RULE, analyseFreight, breaches, breachesLine, hasPostings, filterPurchOrgs, groupPoLines, materialWeighted, materialWeightedSheet, poLines, poLinesSheet, signedAmount, sortMaterials, type Component } from '@/lib/freight/analysis';
import { analysisFilter, parsePurchOrgs, selectionProblem } from '@/lib/freight/analysisFetch';
import { poLineBreakup } from '@/lib/freight/poBreakup';
import { D } from '@/lib/cost/decimal';
import type { FreightRow } from '@/lib/sap/fields';

const comps: Component[] = [
  { key: '1000|RM1', material: 'RM1', text: 'RM1 text', plant: '1000', mtart: 'ROH' },
  { key: '1100|RM1', material: 'RM1', text: 'RM1 text', plant: '1100', mtart: 'ROH' },
  { key: '1000|RM2', material: 'RM2', text: 'RM2 text', plant: '1000', mtart: 'ROH' },
];
let seq = 0;
const row = (p: Partial<FreightRow>): FreightRow => ({
  RowId: ++seq, Bukrs: '1000', FgMatnr: '', Lifnr: '', Name1: '', Belnr: `D${seq}`, Xblnr: '', Ztmode: '', GstPart: '', PlcSup: '', Material: 'RM1', Matdesc: '', Plant: '1000', Conditiontype: 'ZFR1', Purchasedocument: '4500000001', Purchaseline: '00010', Podate: '2026-09-10',
  Baseunit: 'KG', Matuom: 'KG', Currency: 'INR', Localcurrency: 'INR', Actualdelvquantity: '0', Actualdelvcostamount: '0', ActRate: '0', Stddelvquantity: '0', Stddelvcostamount: '0', StdRate: '0', UsedSrc: 'ACTUAL', UsedRate: '0', UsedRatePc: '0', FxFactor: '1', UsedPcLoc: '0', FxInr: '1', UsedPcInr: '0',
  Cpudt: '2026-09-12', Vgabe: '2', Buzei: '001', Gjahr: '2026', Shkzg: 'S', IsMaxDate: false, IsLatestPo: false, ...p,
});
const act = (qty: string, amt: string, p: Partial<FreightRow> = {}) => row({ Vgabe: '2', Actualdelvquantity: qty, Actualdelvcostamount: amt, ...p });
const std = (qty: string, amt: string, p: Partial<FreightRow> = {}) => row({ Vgabe: '1', Shkzg: 'H', Stddelvquantity: qty, Stddelvcostamount: amt, ...p }); // goods receipt = H (as SAP)
const range = { from: '2026-08-01', to: '2026-10-31' };

describe('debit / credit netting', () => {
  it('a credit takes its amount off, whether SAP sends it positive or negative; a debit adds', () => {
    expect(signedAmount(D('100'), 'S').toFixed(2)).toBe('100.00');
    expect(signedAmount(D('100'), 'H').toFixed(2)).toBe('-100.00');
    expect(signedAmount(D('-100'), 'H').toFixed(2)).toBe('-100.00');
    expect(signedAmount(D('100'), '').toFixed(2)).toBe('100.00');
    expect(signedAmount(D('100'), undefined).toFixed(2)).toBe('100.00');
  });
  it('a PO line nets the actual side (Cr minus) AND the standard side (Dr minus)', () => {
    const lines = groupPoLines([act('100', '130', { Shkzg: 'S' }), act('0', '20', { Shkzg: 'H', Vgabe: '3' }), std('100', '90', { Shkzg: 'H' }), std('10', '5', { Shkzg: 'S' })]);
    expect(lines).toHaveLength(1);
    expect(lines[0].Actualdelvcostamount).toBe('110');
    expect(lines[0].Stddelvcostamount).toBe('85');
    expect(lines[0].Stddelvquantity).toBe('90'); // 100 - 10: the standard Dr takes its quantity off too
    const [l] = poLines(comps, lines, range);
    expect(l.actualAmount.toFixed(2)).toBe('110.00');
    expect(l.standardAmount.toFixed(2)).toBe('85.00');
    expect(l.actual!.toFixed(4)).toBe('1.1000'); // 110 / 100 delivered
    expect(l.standard!.toFixed(4)).toBe('0.9444'); // 85 / 90
  });
  it('a subsequent credit (Vgabe 3) with no quantity of its own still counts', () => {
    const lines = groupPoLines([act('50', '100'), act('0', '30', { Shkzg: 'H', Vgabe: '3' })]);
    expect(lines[0].Actualdelvcostamount).toBe('70');
    expect(lines[0].Actualdelvquantity).toBe('50');
  });
  it('rows without Shkzg (an older SAP) are read as they are; an unsummed row is an absolute value, a credit nets only after the postings are summed', () => {
    expect(analyseFreight([comps[0]], [act('100', '110', { Shkzg: '' })], range)[0].actual!.toFixed(4)).toBe('1.1000');
    const rows = [act('100', '110'), act('20', '22', { Shkzg: 'H' })];
    expect(analyseFreight([comps[0]], rows, range)[0].actual!.toFixed(4)).toBe('1.1000'); // unsummed: 132 / 120 (each row absolute)
    const g = groupPoLines(rows);
    expect(analyseFreight([comps[0]], g, range)[0].actual!.toFixed(4)).toBe('1.1000'); // summed: (110 - 22) / (100 - 20), the Cr takes quantity and value off
  });
  it('the PO-line breakup subtotals are net too', () => {
    const b = poLineBreakup([act('100', '130'), act('0', '20', { Shkzg: 'H', Vgabe: '3' })], { plant: '1000', material: 'RM1', po: '4500000001', line: '00010' });
    expect(b.actual.amount.toFixed(2)).toBe('110.00');
    expect(b.actual.rate!.toFixed(4)).toBe('1.1000');
  });
  it('the PO line exports carry the net standard side and the purchase org', () => {
    const lines = poLines(comps, [act('10', '12', { Ekorg: '1000' }), std('10', '9', { Ekorg: '1000' })], range);
    const h = poLinesSheet(lines, DEFAULT_RULE).cols.map((c) => c.header);
    for (const need of ['Net actual condition value (INR)', 'Std Freight', 'Variance amount (Actual - Standard, INR)', 'Purchase org']) expect(h).toContain(need);
    expect(lines[0].purchOrg).toBe('1000');
  });
});

describe('material wise weighted average', () => {
  const rows = [
    act('100', '130', { Material: 'RM1', Plant: '1000', Purchasedocument: '4500000001' }),
    act('300', '300', { Material: 'RM1', Plant: '1100', Purchasedocument: '4500000002' }),
    act('0', '40', { Material: 'RM1', Plant: '1100', Purchasedocument: '4500000002', Shkzg: 'H', Vgabe: '3' }),
    std('100', '100', { Material: 'RM1', Plant: '1000', Purchasedocument: '4500000001' }),
    std('300', '240', { Material: 'RM1', Plant: '1100', Purchasedocument: '4500000002' }),
    act('10', '50', { Material: 'RM2', Plant: '1000', Purchasedocument: '4500000003' }),
  ];
  const grouped = groupPoLines(rows);
  const m = materialWeighted(comps, grouped, range);
  const rm1 = m.find((r) => r.material === 'RM1')!;
  it('one row per material over every plant: sum of net INR amounts / sum of delivered quantities (not an average of the line rates)', () => {
    expect(m.map((r) => r.material)).toEqual(['RM1', 'RM2']);
    expect(rm1.plants).toEqual(['1000', '1100']);
    expect(rm1.poLines).toBe(2);
    expect(rm1.actualQty.toFixed(3)).toBe('400.000');
    expect(rm1.actualAmount.toFixed(2)).toBe('390.00'); // 130 + 300 - 40
    expect(rm1.actual!.toFixed(4)).toBe('0.9750');
    expect(rm1.standardQty.toFixed(3)).toBe('400.000');
    expect(rm1.standard!.toFixed(4)).toBe('0.8500'); // 340 / 400
    expect(rm1.variance!.toFixed(4)).toBe('0.1250');
    expect(rm1.variancePct!.toFixed(4)).toBe('14.7059');
  });
  it('the variance is highlighted by the same rule as everywhere else', () => {
    expect(breaches(rm1, { kind: 'pct_above', threshold: '10' })).toBe(true);
    expect(breaches(rm1, { kind: 'pct_above', threshold: '20' })).toBe(false);
    const rm2 = m.find((r) => r.material === 'RM2')!;
    expect(rm2.standard).toBeNull(); // no standard delivery: nothing to compare, never flagged
    expect(breaches(rm2, DEFAULT_RULE)).toBe(false);
    expect(sortMaterials(m, { kind: 'pct_above', threshold: '10' })[0].material).toBe('RM1');
  });
  it('a plant filter on the components limits the average to that plant', () => {
    const p = materialWeighted(comps.filter((c) => c.plant === '1000'), grouped, range).find((r) => r.material === 'RM1')!;
    expect(p.actual!.toFixed(4)).toBe('1.3000');
    expect(p.plants).toEqual(['1000']);
  });
  it('a material with no PO line is listed without figures; the export has the weighted columns', () => {
    const none = materialWeighted(comps, [], range);
    expect(none.every((r) => r.actual === null && r.poLines === 0)).toBe(true);
    const h = materialWeightedSheet(m, DEFAULT_RULE).cols.map((c) => c.header);
    expect(h).toContain('Weighted avg actual freight / unit (INR)');
    expect(h).toContain('Weighted avg standard freight / unit (INR)');
  });
  it('ALL_DATES keeps every line', () => { expect(materialWeighted(comps, grouped, ALL_DATES).find((r) => r.material === 'RM1')!.poLines).toBe(2); });
});

describe('purchase organisation selection', () => {
  const base = { mode: 'F' as const, materials: [] as string[], plant: '1000', range, inclFrt: true, freightDays: 92 };
  it('parses codes: upper case, de-duplicated, comma / space / semicolon', () => {
    expect(parsePurchOrgs('1000, 2000; 1000  ab12')).toEqual(['1000', '2000', 'AB12']);
    expect(parsePurchOrgs('')).toEqual([]);
  });
  it('is sent as Ekorg on the freight request only, one clause per org; nothing when empty', () => {
    expect(analysisFilter({ ...base, purchOrgs: ['1000'] })).toContain("Ekorg eq '1000'");
    expect(analysisFilter({ ...base, purchOrgs: ['1000', '2000'] })).toContain("(Ekorg eq '1000' or Ekorg eq '2000')");
    expect(analysisFilter({ ...base, purchOrgs: [] })).not.toContain('Ekorg');
    expect(analysisFilter(base)).not.toContain('Ekorg');
    expect(analysisFilter({ ...base, mode: 'M', purchOrgs: ['1000'] })).not.toContain('Ekorg');
  });
  it('an invalid code is refused', () => {
    expect(selectionProblem({ materials: [], plants: ['1000'], types: ['ROH'], range, purchOrgs: ['TOOLONG'] })).toMatch(/purchase organisation/);
    expect(selectionProblem({ materials: [], plants: ['1000'], types: ['ROH'], range, purchOrgs: ['1000'] })).toBe('');
  });
  it('the browser applies the same choice when the rows carry Ekorg, and leaves rows alone when SAP sends none', () => {
    const rs = [act('1', '1', { Ekorg: '1000' }), act('1', '1', { Ekorg: '2000' })];
    expect(filterPurchOrgs(rs, ['1000'])).toHaveLength(1);
    expect(filterPurchOrgs(rs, [])).toHaveLength(2);
    const bare = [act('1', '1'), act('1', '1')];
    expect(filterPurchOrgs(bare, ['1000'])).toHaveLength(2);
  });
});

describe('standard and actual on ONE line per PO, item and condition; condition value absolute', () => {
  // SAP posting rows WITHOUT IsMaxDate (the backend returns Vgabe and Shkzg first): standard = Vgabe 1, actual = Vgabe 2 and 3
  const rows = [
    std('100', '1000', { Shkzg: 'H' }), // standard condition value at PO creation
    act('100', '800', { Shkzg: 'S' }),  // invoice
    act('0', '-50', { Shkzg: 'S', Vgabe: '3' }), // subsequent debit sent with a negative sign: the value is absolute, S adds
    act('0', '-100', { Shkzg: 'H', Vgabe: '3' }), // credit: takes off, whatever sign SAP puts on it
    act('100', '700', { Shkzg: 'S', Purchaseline: '00020' }), // another PO line, actual only
  ];
  it('rows with Vgabe are postings; plain per-line rows are not', () => {
    expect(hasPostings(rows)).toBe(true);
    expect(hasPostings([row({ Vgabe: '', Shkzg: '' })])).toBe(false);
    expect(hasPostings([row({ Vgabe: '', Shkzg: 'H' })])).toBe(true); // NWP: Vgabe empty, Shkzg given
  });
  it('one row per PO + line + condition holding both sides, no IsMaxDate needed', () => {
    const g = groupPoLines(rows);
    expect(g).toHaveLength(2);
    const l = poLines(comps, g, range).find((x) => x.line === '00010')!;
    expect(l.standardAmount.toFixed(2)).toBe('1000.00');
    expect(l.actualAmount.toFixed(2)).toBe('750.00'); // 800 + |-50| - |-100|
    expect(l.standardQty.toFixed(3)).toBe('100.000');
    expect(l.actualQty.toFixed(3)).toBe('100.000');
  });
  it('the variance is Actual - Standard on the line amount, and the rule is tested on it', () => {
    const l = poLines(comps, groupPoLines(rows), range).find((x) => x.line === '00010')!;
    expect(l.amountVariance!.toFixed(2)).toBe('-250.00');
    expect(l.amountVariancePct!.toFixed(2)).toBe('-25.00');
    expect(breachesLine(l, { kind: 'pct_both', threshold: '20' })).toBe(true);
    expect(breachesLine(l, { kind: 'pct_above', threshold: '5' })).toBe(false); // below standard is not "above"
    expect(breachesLine(l, DEFAULT_RULE)).toBe(false);
  });
  it('a line with a standard but no actual yet is shown and never flagged', () => {
    const [l] = poLines(comps, groupPoLines([std('10', '99', { Purchaseline: '00030' })]), range);
    expect(l.standardAmount.toFixed(2)).toBe('99.00');
    expect(l.actual).toBeNull();
    expect(l.amountVariance).toBeNull();
    expect(breachesLine(l, { kind: 'any_above', threshold: '' })).toBe(false);
  });
  it('a value that lands on the other side\'s field (backend quirk) is still read for its Vgabe', () => {
    const [l] = poLines(comps, groupPoLines([row({ Vgabe: '1', Shkzg: 'H', Actualdelvquantity: '10', Actualdelvcostamount: '55', Stddelvquantity: '0', Stddelvcostamount: '0' })]), range);
    expect(l.standardAmount.toFixed(2)).toBe('55.00');
  });
  it('signedAmount: absolute value, H negative', () => {
    expect(signedAmount(D('-100'), 'S').toFixed(2)).toBe('100.00');
    expect(signedAmount(D('-100'), '').toFixed(2)).toBe('100.00');
  });
});

describe('sign rule: Standard Dr (S) minus, Actual Cr (H) minus, quantity and value', () => {
  it('signedAmount by side', () => {
    expect(signedAmount(D('100'), 'S', 'standard').toFixed(2)).toBe('-100.00');
    expect(signedAmount(D('-100'), 'H', 'standard').toFixed(2)).toBe('100.00');
    expect(signedAmount(D('100'), 'H', 'actual').toFixed(2)).toBe('-100.00');
    expect(signedAmount(D('-100'), 'S', 'actual').toFixed(2)).toBe('100.00');
    expect(signedAmount(D('100'), '', 'standard').toFixed(2)).toBe('100.00');
  });
  it('a standard reversal (Dr) and an actual credit note (Cr) take quantity and value off the line', () => {
    const rows = [std('100', '1000'), std('20', '200', { Shkzg: 'S' }), act('100', '900'), act('10', '90', { Shkzg: 'H' })];
    const [l] = poLines(comps, groupPoLines(rows), range);
    expect(l.standardQty.toFixed(3)).toBe('80.000');
    expect(l.standardAmount.toFixed(2)).toBe('800.00');
    expect(l.actualQty.toFixed(3)).toBe('90.000');
    expect(l.actualAmount.toFixed(2)).toBe('810.00');
    expect(l.standard!.toFixed(4)).toBe('10.0000');
    expect(l.actual!.toFixed(4)).toBe('9.0000');
  });
  it('the posting rows and the PO-line breakup show the minus on quantity and value', () => {
    const b = poLineBreakup([std('100', '1000'), std('20', '200', { Shkzg: 'S' }), act('10', '90', { Shkzg: 'H' })], { plant: '1000', material: 'RM1', po: '4500000001', line: '00010' });
    const dr = b.items.find((i) => i.side === 'standard' && i.drCr === 'Dr')!;
    expect(dr.qty.toFixed(3)).toBe('-20.000');
    expect(dr.amount.toFixed(2)).toBe('-200.00');
    const cr = b.items.find((i) => i.side === 'actual')!;
    expect(cr.qty.toFixed(3)).toBe('-10.000');
    expect(cr.amount.toFixed(2)).toBe('-90.00');
    expect(b.standard.amount.toFixed(2)).toBe('800.00');
    expect(b.standard.qty.toFixed(3)).toBe('80.000');
  });
  it('a side whose reversals outweigh it reads negative (no longer forced positive)', () => {
    const [l] = poLines(comps, groupPoLines([std('10', '100', { Shkzg: 'S' })]), range);
    expect(l.standardAmount.toFixed(2)).toBe('-100.00');
    expect(l.standardQty.toFixed(3)).toBe('-10.000');
    expect(l.standard).toBeNull();
  });
});

describe('the live NWP answer (HAR 5 Nov 2026): Vgabe empty, Standard row = Shkzg H, Actual row = Shkzg S, two rows per PO line', () => {
  // PO 6500660302 line 00020, ZFR4, as SAP returned it
  const nwp = [
    row({ Vgabe: '', Cpudt: null, Shkzg: 'S', Material: 'RM1', Purchasedocument: '6500660302', Purchaseline: '00020', Conditiontype: 'ZFR4', Podate: '2026-08-20', Belnr: '5106055743', Actualdelvquantity: '50.000', Actualdelvcostamount: '3266.670', Stddelvquantity: '0.000', Stddelvcostamount: '0.000', Ekorg: 'CPD', IsMaxDate: true }),
    row({ Vgabe: '', Cpudt: null, Shkzg: 'H', Material: 'RM1', Purchasedocument: '6500660302', Purchaseline: '00020', Conditiontype: 'ZFR4', Podate: '2026-08-20', Belnr: '5005918553', Actualdelvquantity: '0.000', Actualdelvcostamount: '0.000', Stddelvquantity: '50.000', Stddelvcostamount: '1250.000', Ekorg: 'CPD', IsMaxDate: true }),
  ];
  it('is recognised as postings and summed into ONE line with a POSITIVE standard', () => {
    expect(hasPostings(nwp)).toBe(true);
    const g = groupPoLines(nwp);
    expect(g).toHaveLength(1);
    const [l] = poLines(comps, g, range);
    expect(l.standardAmount.toFixed(2)).toBe('1250.00');
    expect(l.actualAmount.toFixed(2)).toBe('3266.67');
    expect(l.standardQty.toFixed(3)).toBe('50.000');
    expect(l.actualQty.toFixed(3)).toBe('50.000');
    expect(l.standard!.toFixed(4)).toBe('25.0000');
    expect(l.amountVariance!.toFixed(2)).toBe('2016.67'); // Actual - Standard
    expect(l.amountVariancePct!.toFixed(2)).toBe('161.33');
    expect(breachesLine(l, DEFAULT_RULE)).toBe(true);
  });
  it('the component and material figures are positive too', () => {
    const g = groupPoLines(nwp);
    expect(analyseFreight([comps[0]], g, range)[0].standard!.toFixed(4)).toBe('25.0000');
    expect(materialWeighted(comps, g, range).find((m) => m.material === 'RM1')!.standard!.toFixed(4)).toBe('25.0000');
  });
  it('NWP spells the flags Ismaxdate / Islatestpo: they are read', async () => {
    const { normalizeEntity } = await import('@/lib/sap/normalize');
    const { FREIGHT_ROW } = await import('@/lib/sap/fields');
    const r = normalizeEntity<FreightRow>({ Ismaxdate: 'X', Islatestpo: '', Shkzg: 'H' }, FREIGHT_ROW as never);
    expect(r.IsMaxDate).toBe(true);
    expect(r.IsLatestPo).toBe(false);
  });
});

describe('cost-line freight breakup (BOM drawer): same sign rule', () => {
  it('Standard view: a Dr row is minus; Actual view: a Cr row is minus; rows of the other side untouched', async () => {
    const { breakupLines } = await import('@/lib/freight/breakup');
    const rows = [std('100', '1000'), std('20', '200', { Shkzg: 'S' }), act('50', '600'), act('5', '60', { Shkzg: 'H' })];
    const s = breakupLines(rows, 'STANDARD');
    expect(s.lines.map((l) => l.amount.toFixed(0))).toEqual(['1000', '-200', '0', '0']);
    expect(s.totals.qty.toFixed(0)).toBe('80');
    const a = breakupLines(rows, 'ACTUAL');
    expect(a.lines.map((l) => l.qty.toFixed(0))).toEqual(['0', '0', '50', '-5']);
    expect(a.totals.amount.toFixed(0)).toBe('540');
  });
});
