import { describe, expect, it } from 'vitest';
import type { PurchaseOrder } from '@/lib/entities';
import { buildCreateCwipParams, filterAssetClasses, filterPOs, icEligiblePOs, isPoPending, plantOptions, suggestAssetClass, validateCwip, type CwipDraft } from '@/components/procure/procureLogic';

const draft: CwipDraft = { assetClass: '3000', assetDesc: 'x', costCenter: '1100-PROD', profitCenter: 'PC-1100', executionProcess: 'TURNKEY', timeframeWeeks: '12', paymentTerms: 'thirty percent advance, rest on delivery', remarks: '' };
const po = (o: Partial<PurchaseOrder>) => ({ Ebeln: '45', Cpeid: 'CPE-1', Title: 'Press', Vendorname: 'Acme', Werks: 'UN13', GrnPosted: '', Status: 'PENDING', ...o }) as PurchaseOrder;

describe('CWIP create', () => {
  it('validates with the Fiori messages', () => {
    expect(validateCwip(draft).errors).toEqual([]);
    const e = validateCwip({ ...draft, assetClass: '', costCenter: ' ', timeframeWeeks: '0', paymentTerms: 'short' }).errors;
    expect(e).toEqual(['Asset class is required.', 'Cost center is required.', 'Execution timeframe is required.', 'Payment terms are required (at least 15 characters).']);
  });
  it('builds the CreateCWIP params, AssetDesc now sent (the SAP service supports it)', () => {
    const p = buildCreateCwipParams('CPE-1', { ...draft, assetClass: ' ABCDEFGHIJ ' });
    expect(p).toMatchObject({ CpeId: 'CPE-1', AssetClass: 'ABCDEFGH', CostCenter: '1100-PROD', WbsElement: '', TimeframeWeeks: 12, ExecProcess: 'TURNKEY', ProfitCenter: 'PC-1100' });
    expect(p.AssetDesc).toBe('x');
    expect('AssetDesc' in buildCreateCwipParams('CPE-1', draft, false)).toBe(false);
  });
  it('suggests an asset class from the capex type', () => {
    expect(suggestAssetClass('MOULDS')).toBe('3100');
    expect(suggestAssetClass('IT')).toBe('4000');
    expect(suggestAssetClass('other')).toBe('3000');
  });
  it('searches asset classes by code or text', () => {
    const o = [{ key: '3000', text: '3000 - Plant & Machinery' }, { key: '4000', text: '4000 - IT' }];
    expect(filterAssetClasses(o, '4000').map((x) => x.key)).toEqual(['4000']);
    expect(filterAssetClasses(o, 'machin').map((x) => x.key)).toEqual(['3000']);
  });
});

describe('PO list', () => {
  const rows = [po({ Ebeln: '1', GrnPosted: 'X' }), po({ Ebeln: '2', Vendorname: 'Zed', Werks: 'UN14' })];
  it('filters by text, plant and GRN', () => {
    expect(filterPOs(rows, { q: 'zed', plant: '', grn: '' }).map((r) => r.Ebeln)).toEqual(['2']);
    expect(filterPOs(rows, { q: '', plant: 'UN13', grn: '' }).map((r) => r.Ebeln)).toEqual(['1']);
    expect(filterPOs(rows, { q: '', plant: '', grn: 'YES' }).map((r) => r.Ebeln)).toEqual(['1']);
    expect(filterPOs(rows, { q: '', plant: '', grn: 'NO' }).map((r) => r.Ebeln)).toEqual(['2']);
  });
  it('knows PENDING and IC eligibility', () => {
    expect(isPoPending('PENDING')).toBe(true);
    expect(isPoPending('APPROVED')).toBe(false);
    expect(icEligiblePOs(rows, []).map((r) => r.Ebeln)).toEqual(['1']);
    expect(icEligiblePOs(rows, [{ Cpeid: 'CPE-1' }])).toEqual([]);
  });
  it('derives plant options for global users', () => {
    expect(plantOptions([], [{ Werks: 'B', PlantName: 'Bee' }, { Werks: 'A', PlantName: 'Ay' }, { Werks: 'A' }])).toEqual([{ code: 'A', name: 'Ay' }, { code: 'B', name: 'Bee' }]);
    expect(plantOptions([{ code: 'X', name: 'x' }], [])).toEqual([{ code: 'X', name: 'x' }]);
  });
});
