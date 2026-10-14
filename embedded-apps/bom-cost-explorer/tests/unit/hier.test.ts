import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { HIER_MATERIALS_MAX, hasMaterialCriteria, hierMaterialsRequest, hierRequest, loadBrands, loadHierMaterials, loadLevel, optionLabel, pickLevel, problemText, resetHierCapability } from '@/lib/client/hier';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_HIER'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  resetHierCapability();
  mockRequestLog.length = 0;
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

const path = (u: string) => u.split('?')[0];
const calls = (set: string) => mockRequestLog.filter((u) => path(u).endsWith(`/${set}`));

describe('request builders ("routes")', () => {
  it('levels: brand list, products by brand(s), CRS by brand + product; skipped levels leave no filter; werks optional', () => {
    expect(hierRequest('B').params.$filter).toBe("Level eq 'B'");
    expect(hierRequest('P', { brand: ['NAV', 'BOR'] }).params.$filter).toBe("Level eq 'P' and (Brand eq 'NAV' or Brand eq 'BOR')");
    expect(hierRequest('C', { brand: ['NAV'], product: ['001001001000000000'] }).params.$filter).toBe("Level eq 'C' and Brand eq 'NAV' and Product eq '001001001000000000'");
    expect(hierRequest('C', { product: ['P1'] }).params.$filter).toBe("Level eq 'C' and Product eq 'P1'"); // brand skipped
    expect(hierRequest('C').params.$filter).toBe("Level eq 'C'"); // CRS without brand
    expect(hierRequest('B', { werks: ['ub01', '1000'] }).params.$filter).toBe("Level eq 'B' and (Werks eq 'UB01' or Werks eq '1000')");
    expect(hierRequest('P', { brand: ["O'NEIL"] }).params.$filter).toContain("Brand eq 'O''NEIL'"); // quotes escaped
  });
  it('materials: filter by any chosen level (+ type, search); nothing to call without criteria', () => {
    expect(hierMaterialsRequest({})).toBeNull();
    expect(hierMaterialsRequest({ q: 'a' })).toBeNull(); // 1 character
    expect(hierMaterialsRequest({ mtart: 'FERT' })).toBeNull(); // type alone is no criterion
    expect(hasMaterialCriteria({ crs: ['C101'] })).toBe(true);
    const r = hierMaterialsRequest({ brand: ['NAV'], product: ['001001001000000000'], crs: ['C101'], mtart: 'FERT', q: 'oil' })!;
    expect(r.entitySet).toBe('MaterialVHSet');
    expect(r.params.$filter).toBe("Zbrandcode eq 'NAV' and Prodha eq '001001001000000000' and Zskugrcodecrs eq 'C101' and Mtart eq 'FERT'");
    expect(r.params.search).toBe('oil');
    expect(hierMaterialsRequest({ q: 'navratna' })!.params).toEqual({ search: 'navratna' });
  });
  it('option text "Code - Descr (Cnt)"; picking a level clears the lower ones', () => {
    expect(optionLabel({ level: 'B', code: 'NAV', descr: 'Navratna', cnt: 12 })).toBe('NAV - Navratna (12)');
    expect(pickLevel({ brand: 'NAV', product: 'P1', crs: 'C1' }, 'brand', 'BOR')).toEqual({ brand: 'BOR', product: '', crs: '' });
    expect(pickLevel({ brand: 'NAV', product: 'P1', crs: 'C1' }, 'product', 'P2')).toEqual({ brand: 'NAV', product: 'P2', crs: '' });
    expect(pickLevel({ brand: '', product: '', crs: '' }, 'crs', 'C1')).toEqual({ brand: '', product: '', crs: 'C1' }); // skipping levels
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
  it('products follow the brand, CRS follows brand + product, CRS also without a brand', async () => {
    const products = await loadLevel('P', { brand: ['NAV'] });
    expect(products.map((p) => p.code).sort()).toEqual(['001001001000000000', '001001002000000000']);
    expect((await loadLevel('C', { brand: ['NAV'], product: ['001001002000000000'] })).map((c) => c.code)).toEqual(['C102']);
    expect((await loadLevel('C', {})).length).toBeGreaterThan(2);
  });
  it('no MaterialVHSet call without criteria; materials load for a chosen level', async () => {
    expect(await loadHierMaterials({ mtart: 'FERT' })).toBeNull();
    expect(calls('MaterialVHSet')).toHaveLength(0);
    const r = (await loadHierMaterials({ crs: ['C301'], mtart: 'FERT' }))!;
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
  it('no "+" in any URL (spaces %20, quotes encoded)', async () => {
    await loadBrands({ werks: ['1000', '1100'] });
    await loadLevel('C', { brand: ['NAV'], product: ['001001001000000000'] });
    await loadHierMaterials({ brand: ['NAV'], q: 'hair oil' });
    expect(mockRequestLog.length).toBeGreaterThanOrEqual(3);
    for (const u of mockRequestLog) expect(u).not.toContain('+');
    expect(mockRequestLog.some((u) => u.includes('hair%20oil'))).toBe(true);
  });
});
