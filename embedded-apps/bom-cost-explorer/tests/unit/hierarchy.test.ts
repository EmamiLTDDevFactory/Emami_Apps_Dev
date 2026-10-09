import { describe, expect, it } from 'vitest';
import { cascade, NO_VALUE, pickLevel } from '@/lib/client/hierarchy';
import { materialHierarchyRequest } from '@/lib/sap/requests';
import type { MaterialHierarchyRow } from '@/lib/sap/fields';

const m = (Matnr: string, brand: string, product: string, crs: string): MaterialHierarchyRow => ({
  Matnr, Maktx: `Mat ${Matnr}`, Mtart: 'FERT', Meins: 'EA',
  Zbrandcode: brand, Zsalesbrand: brand ? `${brand} brand` : '', Zskugrcode: product, Zskugroup: product ? `${product} group` : '',
  Zskugrcodecrs: crs, Zskugroupcrs: crs ? `${crs} crs` : '', Zzmatcat: '', Zzschemep: '0',
});

const rows = [m('1', 'NAV', 'OIL', 'C1'), m('2', 'NAV', 'OIL', 'C2'), m('3', 'NAV', 'TALC', 'C3'), m('4', 'BORO', 'CREAM', 'C4'), m('5', '', '', '')];

describe('Brand -> Product -> CRS -> Material', () => {
  it('lists every brand with counts, (none) last', () => {
    const c = cascade(rows, { brand: '', product: '', crs: '' });
    expect(c.brands.map((b) => [b.code, b.count])).toEqual([['BORO', 1], ['NAV', 3], [NO_VALUE, 1]]);
    expect(c.materials).toHaveLength(5);
  });

  it('narrows products, CRS and materials to the picks above', () => {
    const c = cascade(rows, { brand: 'NAV', product: 'OIL', crs: '' });
    expect(c.products.map((p) => p.code)).toEqual(['OIL', 'TALC']);
    expect(c.crs.map((x) => [x.code, x.text])).toEqual([['C1', 'C1 crs'], ['C2', 'C2 crs']]);
    expect(c.materials.map((x) => x.Matnr)).toEqual(['1', '2']);
    expect(cascade(rows, { brand: 'NAV', product: 'OIL', crs: 'C2' }).materials.map((x) => x.Matnr)).toEqual(['2']);
  });

  it('can pick the (none) bucket', () => {
    expect(cascade(rows, { brand: NO_VALUE, product: '', crs: '' }).materials.map((x) => x.Matnr)).toEqual(['5']);
  });

  it('changing a level clears the levels below', () => {
    expect(pickLevel({ brand: 'NAV', product: 'OIL', crs: 'C1' }, 'brand', 'BORO')).toEqual({ brand: 'BORO', product: '', crs: '' });
    expect(pickLevel({ brand: 'NAV', product: 'OIL', crs: 'C1' }, 'product', 'TALC')).toEqual({ brand: 'NAV', product: 'TALC', crs: '' });
  });

  it('asks SAP for finished goods with the hierarchy fields', () => {
    const r = materialHierarchyRequest();
    expect(r.entitySet).toBe('MaterialVHSet');
    expect(r.params.$filter).toBe("Mtart eq 'FERT'");
    expect(r.params.$select?.split(',')).toEqual(expect.arrayContaining(['Matnr', 'Zbrandcode', 'Zsalesbrand', 'Zskugrcode', 'Zskugroup', 'Zskugrcodecrs', 'Zskugroupcrs']));
  });
});

describe('export formula guard (VAPT round 2)', () => {
  it('neutralises formula-looking text but keeps numbers', async () => {
    const { sanitizeCell } = await import('@/lib/client/spreadsheetSafe');
    expect(sanitizeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(sanitizeCell('-12.5')).toBe('-12.5');
    expect(sanitizeCell(42)).toBe(42);
  });
});
