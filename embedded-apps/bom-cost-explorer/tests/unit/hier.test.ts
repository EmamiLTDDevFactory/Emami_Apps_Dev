import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { cascadeFields, HIER_MATERIALS_MAX, hasMaterialCriteria, hierMaterialsRequest, hierRequest, keepValid, loadBrands, loadHierMaterials, loadLevel, optionLabel, pickLevel, problemText, resetCascadeFields, resetHierCapability } from '@/lib/client/hier';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_HIER', 'MOCK_SAP_CASCADE', 'CASCADE_FIELDS', 'NEXT_PUBLIC_CASCADE_FIELDS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  resetHierCapability();
  resetCascadeFields();
  mockRequestLog.length = 0;
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

const path = (u: string) => u.split('?')[0];
const calls = (set: string) => mockRequestLog.filter((u) => path(u).endsWith(`/${set}`));

describe('request builders ("routes")', () => {
  it('levels: brand list, products by brand(s), SKU by brand + product; skipped levels leave no filter; werks optional', () => {
    expect(hierRequest('B').params.$filter).toBe("Level eq 'B'");
    expect(hierRequest('P', { brand: ['NAV', 'BOR'] }).params.$filter).toBe("Level eq 'P' and (Brand eq 'NAV' or Brand eq 'BOR')");
    expect(hierRequest('C', { brand: ['NAV'], product: ['001001001000000000'] }).params.$filter).toBe("Level eq 'C' and Brand eq 'NAV' and Product eq '001001001000000000'");
    expect(hierRequest('C', { product: ['P1'] }).params.$filter).toBe("Level eq 'C' and Product eq 'P1'"); // brand skipped
    expect(hierRequest('C').params.$filter).toBe("Level eq 'C'"); // SKU without brand
    expect(hierRequest('P').params.$filter).toBe("Level eq 'P'"); // all products when no brand is chosen
    expect(hierRequest('B', { werks: ['ub01', '1000'] }).params.$filter).toBe("Level eq 'B' and (Werks eq 'UB01' or Werks eq '1000')");
    expect(hierRequest('P', { brand: ["O'NEIL"] }).params.$filter).toContain("Brand eq 'O''NEIL'"); // quotes escaped
  });
  it('materials: filter by any chosen level (+ type, search); nothing to call without criteria', () => {
    expect(hierMaterialsRequest({})).toBeNull();
    expect(hierMaterialsRequest({ q: 'a' })).toBeNull(); // 1 character
    expect(hierMaterialsRequest({ mtart: 'FERT' })).toBeNull(); // type alone is no criterion
    expect(hasMaterialCriteria({ sku: ['C101'] })).toBe(true);
    const r = hierMaterialsRequest({ brand: ['NAV'], product: ['001001001000000000'], sku: ['C101'], mtart: 'FERT', q: 'oil' })!;
    expect(r.entitySet).toBe('MaterialVHSet');
    expect(r.params.$filter).toBe("Zbrand eq 'NAV' and Prodha eq '001001001000000000' and Zsku eq 'C101' and Mtart eq 'FERT'"); // new names (default)
    expect(r.params.search).toBe('oil');
    expect(hierMaterialsRequest({ q: 'navratna' })!.params).toEqual({ search: 'navratna' });
  });
  it('legacy mode (CASCADE_FIELDS=legacy) sends exactly the old names', () => {
    process.env.CASCADE_FIELDS = 'legacy';
    expect(cascadeFields()).toBe('legacy');
    expect(hierMaterialsRequest({ brand: ['NAV'], product: ['001001001000000000'], sku: ['C101'], mtart: 'FERT' })!.params.$filter)
      .toBe("Zbrandcode eq 'NAV' and Prodha eq '001001001000000000' and Zskugrcodecrs eq 'C101' and Mtart eq 'FERT'");
    process.env.CASCADE_FIELDS = 'new';
    expect(cascadeFields()).toBe('new');
  });
  it('option text "<Descr> (<Code>) - <Cnt>", the code alone without a description', () => {
    expect(optionLabel({ level: 'B', code: 'NAV', descr: 'Navratna', cnt: 12 })).toBe('Navratna (NAV) - 12');
    expect(optionLabel({ level: 'C', code: '0100040394030105', descr: '', cnt: 1 })).toBe('0100040394030105 - 1');
  });
  it('choosing a level keeps lower choices; they are cleared only when the reloaded list no longer has them', () => {
    const o = (code: string) => ({ level: 'P' as const, code, descr: '', cnt: 1 });
    expect(pickLevel({ brand: 'NAV', product: 'P1', sku: 'C1' }, 'brand', 'BOR')).toEqual({ brand: 'BOR', product: 'P1', sku: 'C1' });
    expect(pickLevel({ brand: '', product: '', sku: '' }, 'sku', 'C1')).toEqual({ brand: '', product: '', sku: 'C1' }); // skipping levels
    const pick = { brand: 'BOR', product: 'P1', sku: 'C1' };
    expect(keepValid(pick, null, null)).toBe(pick); // lists still loading: keep
    expect(keepValid(pick, [o('P1'), o('P2')], [o('C1')])).toBe(pick); // still valid: unchanged
    expect(keepValid(pick, [o('P2')], [o('C1')])).toEqual({ brand: 'BOR', product: '', sku: 'C1' });
    expect(keepValid(pick, [o('P1')], [o('C9')])).toEqual({ brand: 'BOR', product: 'P1', sku: '' });
  });
});

describe('against the mock', () => {
  it('brands come from HierVHSet (never MaterialVHSet); cached per system; Re-test forces a new call', async () => {
    const r = await loadBrands();
    expect(r.problem).toBeNull();
    expect(r.system).toBe('NGD');
    expect(r.brands.map((b) => b.code)).toEqual(expect.arrayContaining(['NAV', 'BOR', 'ZAN']));
    expect(r.brands.every((b) => b.cnt > 0 && b.descr)).toBe(true);
    expect(calls('HierVHSet')).toHaveLength(1);
    expect(calls('MaterialVHSet')).toHaveLength(0);
    await loadBrands();
    expect(calls('HierVHSet')).toHaveLength(1); // cached (10 minutes)
    await loadBrands({}, { force: true });
    expect(calls('HierVHSet')).toHaveLength(2);
  });
  it('products follow the brand, SKU follows brand + product; both load with nothing chosen above', async () => {
    const products = await loadLevel('P', { brand: ['NAV'] });
    expect(products.map((p) => p.code).sort()).toEqual(['001001001000000000', '001001002000000000']);
    expect((await loadLevel('C', { brand: ['NAV'], product: ['001001002000000000'] })).map((c) => c.code)).toEqual(['C102']);
    expect((await loadLevel('C', {})).length).toBeGreaterThan(2);
    expect((await loadLevel('P', {})).length).toBeGreaterThan(2); // all products without a brand
  });
  it('no MaterialVHSet call without criteria; materials load for a chosen level', async () => {
    expect(await loadHierMaterials({ mtart: 'FERT' })).toBeNull();
    expect(calls('MaterialVHSet')).toHaveLength(0);
    const r = (await loadHierMaterials({ sku: ['C301'], mtart: 'FERT' }))!;
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((m) => m.Mtart === 'FERT')).toBe(true);
    expect(r.capped).toBe(false);
  });
  it('500 rows -> capped (the picker shows "500 shown - narrow the selection")', async () => {
    process.env.MOCK_SAP_HIER = 'big';
    const r = (await loadHierMaterials({ brand: ['BIG'] }))!;
    expect(r.rows).toHaveLength(HIER_MATERIALS_MAX);
    expect(r.capped).toBe(true);
  });
  it('HierVHSet 404 -> "does not have the cascade service yet" notice with the system name', async () => {
    process.env.MOCK_SAP_HIER = 'missing';
    const r = await loadBrands();
    expect(r.problem?.kind).toBe('missing');
    expect(problemText(r.problem!)).toBe('This SAP system (NGD) does not have the cascade service yet (HierVHSet). Use the search box.');
  });
  it('property error -> the property name and the entity for the SAP team', async () => {
    process.env.MOCK_SAP_HIER = 'property';
    const r = await loadBrands({ werks: ['1000'] });
    expect(r.problem).toMatchObject({ kind: 'property', property: 'Werks', entity: 'ZMM_BOM_COST_SRV.HierVH' });
    expect(problemText(r.problem!)).toMatch(/"Werks".*"ZMM_BOM_COST_SRV\.HierVH".*SEGW/);
  });
  it('no brands -> the "SAP returned no brands" message with the system', async () => {
    process.env.MOCK_SAP_HIER = 'empty';
    const r = await loadBrands();
    expect(r.problem?.kind).toBe('empty');
    expect(problemText(r.problem!)).toBe('SAP returned no brands. Check that the brand field is maintained for the selected material types. (SAP system NGD)');
  });
  it('new names in every material URL', async () => {
    await loadHierMaterials({ brand: ['NAV'], product: ['001001001000000000'], sku: ['C101'], mtart: 'FERT' });
    const u = decodeURIComponent(calls('MaterialVHSet')[0]);
    expect(u).toContain("Zbrand eq 'NAV'");
    expect(u).toContain("Zsku eq 'C101'");
    expect(u).not.toMatch(/Zbrandcode|Zskugrcodecrs/);
  });
  it('a system without the new names (live today): one retry with the legacy names, then legacy for that system', async () => {
    process.env.MOCK_SAP_CASCADE = 'legacy';
    const r = (await loadHierMaterials({ brand: ['NAV'], mtart: 'FERT' }))!;
    expect(r.rows.length).toBeGreaterThan(0);
    const urls = calls('MaterialVHSet').map(decodeURIComponent);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("Zbrand eq 'NAV'");
    expect(urls[1]).toContain("Zbrandcode eq 'NAV'");
    expect(cascadeFields()).toBe('legacy');
    await loadHierMaterials({ sku: ['C301'] });
    expect(decodeURIComponent(calls('MaterialVHSet')[2])).toContain("Zskugrcodecrs eq 'C301'"); // no second failed call
  });
  it('no "+" in any URL (spaces %20, quotes encoded)', async () => {
    await loadBrands({ werks: ['1000', '1100'] });
    await loadLevel('C', { brand: ['NAV'], product: ['001001001000000000'] });
    await loadHierMaterials({ brand: ['NAV'], q: 'hair oil' });
    expect(mockRequestLog.length).toBeGreaterThanOrEqual(3);
    for (const u of mockRequestLog) expect(u).not.toContain('+');
    expect(mockRequestLog.some((u) => u.includes('hair%20oil'))).toBe(true);
  });
});
