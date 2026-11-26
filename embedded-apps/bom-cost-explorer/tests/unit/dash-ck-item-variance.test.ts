import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { ckItemVariance, explodeCk } from '@/lib/dash/ckItemVariance';
import type { CkItemRow } from '@/lib/ck/types';
import type { Cat, CdrillComp } from '@/lib/dash/cdrill';

const it_ = (p: Partial<CkItemRow>): CkItemRow => ({ Posnr: '1', Typps: 'M', TyppsTxt: '', Kstar: '', KstarTxt: '', Idnrk: '', ItemTxt: '', Mtart: 'ROH', ItemWerks: 'UN13', Kostl: '', Lstar: '', Qty: '', Uom: 'KG', QtyUnit: '', Price: '', PriceUnit: '', ValueLot: '', ValueUnit: '', Curr: 'INR', HasEst: true, ...p });
// shape of live NWP CkItemSet, 400008523 @ UN13 (26.11.2026): QtyUnit / ValueUnit are per piece
const fg = [
  it_({ Typps: 'E', Lstar: 'MACHRS', Uom: 'MIN', QtyUnit: '0.037879', ValueUnit: '2.425967' }),
  it_({ Idnrk: '151025162', Mtart: 'PKGN', Uom: 'PC', QtyUnit: '1.004', ValueUnit: '6.48584' }),
  it_({ Idnrk: '250003153', Mtart: 'WIP', Uom: 'KG', QtyUnit: '0.225', ValueUnit: '22.429832' }),
];
const bulk = [
  it_({ Typps: 'E', Lstar: 'STEAM', QtyUnit: '0.809524', ValueUnit: '2.355261' }),
  it_({ Idnrk: '100000078', QtyUnit: '0.66', ValueUnit: '34.9008' }),
  it_({ Idnrk: '100001813', QtyUnit: '0.0016', ValueUnit: '0.072768' }),
  it_({ Idnrk: '100001813', QtyUnit: '0.0016', ValueUnit: '0.072768' }), // SAP lists it twice
];
const fetch = async (m: string) => (m === '250003153' ? bulk : []);
const comp = (matnr: string, cat: Cat, qtyPc: string, costPc: string, meins = 'KG'): CdrillComp => ({ matnr, maktx: '', mtart: '', matkl: '', cat, meins, qty: new Decimal(0), val: new Decimal(0), qtyPc: new Decimal(qtyPc), costPc: new Decimal(costPc), share: null });

describe('CK13N item explosion', () => {
  it('explodes the bulk through its own estimate, scaled by the bulk quantity per piece', async () => {
    const e = await explodeCk(fg, 'UN13', fetch);
    const sodium = e.lines.find((l) => l.matnr === '100000078')!;
    expect(sodium.qtyPc.toFixed(4)).toBe('0.1485'); // 0.66 kg / kg bulk x 0.225 kg / pc
    expect(sodium.valPc.toFixed(4)).toBe('7.8527');
    expect(sodium.via).toBe('250003153');
    expect(e.lines.some((l) => l.matnr === '250003153')).toBe(false);
    expect(e.convPc.toFixed(6)).toBe(new Decimal('2.425967').plus(new Decimal('2.355261').times('0.225')).toFixed(6));
    expect(e.bulks[0].ownPc.toFixed(4)).toBe('22.4298');
  });
  it('keeps a bulk without its own estimate as one line', async () => {
    const e = await explodeCk(fg, 'UN13', async () => []);
    expect(e.unexploded).toEqual(['250003153']);
    expect(e.lines.find((l) => l.matnr === '250003153')!.valPc.toFixed(4)).toBe('22.4298');
  });
});

describe('actual vs CK13N per item', () => {
  it('matches by material, sums duplicates, gives value and quantity variance %', async () => {
    const e = await explodeCk(fg, 'UN13', fetch);
    const v = ckItemVariance(e, { R: [comp('100000078', 'R', '0.16335', '8.6380'), comp('100009999', 'R', '0.001', '0.5')], P: [comp('151025162', 'P', '1.004', '6.48584', 'PC')], F: [], O: [] }, new Decimal('3'));
    const r = Object.fromEntries(v.rows.map((x) => [x.matnr, x]));
    expect(r['100000078'].pct!.toFixed(1)).toBe('10.0');
    expect(r['100000078'].qtyPct!.toFixed(1)).toBe('10.0');
    expect(r['151025162'].variance!.isZero()).toBe(true);
    expect(r['100001813'].stdVal!.toFixed(6)).toBe('0.032746'); // 2 x 0.072768 x 0.225
    expect(r['100001813'].status).toBe('ck-only');
    expect(r['100009999'].status).toBe('actual-only');
    expect(v.rows[0].matnr).toBe('100000078'); // biggest absolute variance first
    expect(v.conv.actVal!.toString()).toBe('3');
    expect(v.total.stdVal!.toFixed(4)).toBe(e.lines.reduce((t, l) => t.plus(l.valPc), new Decimal(0)).plus(e.convPc).toFixed(4));
  });
  it('no quantity % across different units', async () => {
    const e = await explodeCk(fg, 'UN13', fetch);
    const v = ckItemVariance(e, { R: [], P: [comp('151025162', 'P', '1.004', '6.5', 'KG')], F: [], O: [] }, null);
    expect(v.rows.find((x) => x.matnr === '151025162')!.qtyPct).toBeNull();
    expect(v.conv.actVal).toBeNull();
  });
});
