import { describe, expect, it } from 'vitest';
import { compareSheet, componentsSheet, estimatesSheet, headerSheet, itemsSheet } from '@/lib/ck/export';
import { compareEstimates } from '@/lib/ck/view';
import type { CkCompRow, CkHeaderRow, CkItemRow, CkListRow } from '@/lib/ck/types';

const get = (s: { cols: { header: string; get: (i: number) => string | number | null }[] }, h: string, i: number) => s.cols.find((c) => c.header === h || c.header.startsWith(h))!.get(i);
const comp = (p: Partial<CkCompRow> = {}): CkCompRow => ({ CompNo: '100', CompTxt: 'Raw material', Grp: 'RM', Seq: 1, Total: '10.5', SharePct: '50', Curr: 'INR', IsSum: false, ...p });

describe('Excel sheets of the Standard cost page', () => {
  it('Header: SAP labels, amounts as numbers with the currency in the label, empty values as empty', () => {
    const h = { Matnr: 'M', Maktx: 'Oil', Werks: 'UN13', WerksTxt: 'Plant', Mtart: 'FERT', Klvar: 'PPC1', Tvers: '01', Bwvar: 'ZUV', Kkzma: '', Kalnr: '1', Kadky: '2026-10-01', Kadat: '2026-10-01', Bidat: null, Aldat: null, Bwdat: null, Losgr: '1000', Meeht: 'PC', Peinh: '1', StatusTxt: 'Released', Status: 'FR', CurStd: true, TotalLot: '1000', TotalUnit: '10.5', StdPrice: '', PriceCtrl: 'S', StdDiff: '', StdDiffPct: '', Curr: 'INR', NComp: 5, NItem: 9, Ernam: 'U', Erdat: null, Msg: 'note', ValueBasis: 'basis' } as CkHeaderRow;
    const s = headerSheet(h);
    expect(s.name).toBe('Header');
    const val = (label: string) => { const i = Array.from({ length: s.count }, (_, k) => k).find((k) => String(s.cols[0].get(k)).startsWith(label))!; return s.cols[1].get(i); };
    expect(val('Material')).toBe('M Oil');
    expect(val('Total per unit (INR)')).toBe(10.5);
    expect(val('Standard price in material master (INR)')).toBeNull();
    expect(val('Current standard')).toBe('yes');
    expect(val('Costing date to')).toBe('');
  });
  it('Components in SAP order with group names, share and the total row marked', () => {
    const s = componentsSheet([comp(), comp({ CompNo: 'S', Grp: 'SUM', IsSum: true, Total: '21' })]);
    expect(s.name).toBe('Components');
    expect(s.count).toBe(2);
    expect(get(s, 'Total per unit', 0)).toBe(10.5);
    expect(get(s, 'Group', 0)).toBe('Raw material');
    expect(get(s, 'Total row', 1)).toBe('yes');
    expect(get(s, 'Currency', 0)).toBe('INR');
  });
  it('Items: material or activity, per-lot and per-unit values, own-estimate flag', () => {
    const it = { Posnr: '1', Typps: 'M', TyppsTxt: 'Material', Kstar: '4', KstarTxt: 'RM', Idnrk: '1001', ItemTxt: 'Oil', Mtart: 'ROH', ItemWerks: 'UN13', Kostl: '', Lstar: '', Qty: '2', Uom: 'KG', QtyUnit: '', Price: '5', PriceUnit: '1', ValueLot: '10', ValueUnit: '1', Curr: 'INR', HasEst: true } as CkItemRow;
    const s = itemsSheet([it]);
    expect(s.name).toBe('Items');
    expect(get(s, 'Material / activity', 0)).toBe('1001');
    expect(get(s, 'Unit', 0)).toBe('KG');
    expect(get(s, 'Value per lot', 0)).toBe(10);
    expect(get(s, 'Has own estimate', 0)).toBe('yes');
  });
  it('Estimates: one row per estimate', () => {
    const e = { Klvar: 'PPC1', Tvers: '01', Bwvar: 'ZUV', Kadky: '2026-10-01', Kadat: null, Bidat: null, Losgr: '1000', Meeht: 'PC', Total: '12', StdPrice: '', Curr: 'INR', CurStd: true, Kalnr: '1', Ernam: 'U', Erdat: null, StatusTxt: 'Released', Status: 'FR' } as CkListRow;
    const s = estimatesSheet([e, { ...e, CurStd: false }]);
    expect(s.count).toBe(2);
    expect(get(s, 'Status', 0)).toBe('Released');
    expect(get(s, 'Current standard', 0)).toBe('yes');
    expect(get(s, 'Current standard', 1)).toBe('');
    expect(get(s, 'Standard price', 0)).toBeNull();
  });
  it('Compare: both sides and the difference labelled as computed here, missing sides empty', () => {
    const rows = compareEstimates([comp({ Total: '10' })], [comp({ Total: '12.5' }), comp({ CompNo: '2', Seq: 2, Total: '1' })]);
    const s = compareSheet(rows, 'v1', 'v2');
    expect(s.name).toBe('Compare');
    expect(s.cols.map((c) => c.header)).toContain('Difference B - A (computed here)');
    expect(get(s, 'A:', 0)).toBe(10);
    expect(get(s, 'B:', 0)).toBe(12.5);
    expect(get(s, 'Difference', 0)).toBe(2.5);
    expect(get(s, 'A:', 1)).toBeNull();
    expect(get(s, 'Difference', 1)).toBeNull();
  });
});
