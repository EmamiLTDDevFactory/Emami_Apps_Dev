import { describe, it, expect } from 'vitest';
import { mapDoaRule, filterMatrix, formatTotalSla, docTypeLabel, capexTypeOptions, searchOptions, cfgNumOrNull, plantCaps, type RawDoaRule } from '../components/admin/doaLogic';

const raw = (o: Partial<RawDoaRule> & { chain?: unknown[] }): RawDoaRule => ({
  CapextypeText: 'Moulds', Active: 'X', Doaid: '1', Capextype: 'MOULDS', AmountTo: '0.000', AmountFrom: '100', Waers: 'INR', RangeText: '', ValidFrom: '', ValidTo: '',
  DoaRuleToChain: { results: o.chain ?? [] }, ...o,
} as RawDoaRule);
const step = (n: number, role: string, sla = 1) => ({ Doaid: '1', Seqnr: String(n), Role: role, Approver: 'a', ApproverName: 'A', Mandatory: 'X', SlaDays: sla });

describe('admin DOA logic', () => {
  it('maps and sorts an 8-step chain numerically, AmountTo 0 = open ended', () => {
    const r = mapDoaRule(raw({ chain: [step(10, 'L10'), step(2, 'L2'), step(1, 'L1')] }));
    expect(r.chain.map((c) => c.role)).toEqual(['L1', 'L2', 'L10']);
    expect(r.amountTo).toBeNull();
    expect(r.active).toBe(true);
  });
  it('Active only on X', () => expect(mapDoaRule(raw({ Active: '' })).active).toBe(false));
  it('total SLA', () => { expect(formatTotalSla([])).toBe('-'); expect(formatTotalSla([{ slaDays: 2 }, { slaDays: 3 }])).toBe('5 days'); });
  it('doc type labels', () => { expect(docTypeLabel('BUD')).toBe('Budget (CJN)'); expect(docTypeLabel('')).toBe('Any'); });
  it('matrix filter keeps Any rules and filters by capex code', () => {
    const a = mapDoaRule(raw({ Doaid: 'a', Doctype: 'CPE' })), b = mapDoaRule(raw({ Doaid: 'b', Doctype: 'BUD' })), c = mapDoaRule(raw({ Doaid: 'c', Capextype: 'IT' }));
    expect(filterMatrix([a, b, c], 'CPE', '').map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterMatrix([a, b, c], '', 'IT').map((r) => r.id)).toEqual(['c']);
  });
  it('capex options fall back to rules; search by code or text', () => {
    const rules = [mapDoaRule(raw({})), mapDoaRule(raw({ Capextype: 'IT', CapextypeText: 'Information Tech' }))];
    const o = capexTypeOptions([], rules);
    expect(o).toHaveLength(2);
    expect(searchOptions(o, 'it').map((x) => x.key)).toEqual(['IT']);
    expect(searchOptions(o, 'mould')).toHaveLength(1);
    expect(capexTypeOptions([{ Domain: 'CAPEXTYPE', Keyval: 'X', Textval: 'Ex' }], rules)).toEqual([{ key: 'X', text: 'Ex' }]);
  });
  it('config helpers', () => {
    expect(cfgNumOrNull({}, 'SLA_WARN_DAYS')).toBeNull();
    expect(cfgNumOrNull({ SLA_WARN_DAYS: '3' }, 'SLA_WARN_DAYS')).toBe(3);
    expect(plantCaps({ QUOTA_YEAR_CAP: '1', QUOTA_YEAR_CAP_1100: '500000' })).toEqual([{ werks: '1100', cap: 500000 }]);
  });
});
