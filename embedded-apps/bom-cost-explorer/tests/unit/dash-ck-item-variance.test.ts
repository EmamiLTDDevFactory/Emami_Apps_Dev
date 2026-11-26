import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { ckItemVariance, type StdExplosion } from '@/lib/dash/ckItemVariance';
import type { Cat, CdrillComp } from '@/lib/dash/cdrill';

// The CK13N side as explosionFromStructure gives it (the structure itself is tested on live data in ck-structure.test.ts)
const D = (v: string) => new Decimal(v);
const std: StdExplosion = {
  lines: [
    { matnr: '151025162', text: 'PM', mtart: 'PKGN', uom: 'PC', qtyPc: D('1.004'), valPc: D('6.48584'), via: '' },
    { matnr: '100000078', text: 'RM', mtart: 'ROH', uom: 'KG', qtyPc: D('0.1485'), valPc: D('7.85268'), via: '250003153' },
    { matnr: '100001813', text: 'RM2', mtart: 'ROH', uom: 'KG', qtyPc: D('0.00036'), valPc: D('0.016373'), via: '250003153' },
    { matnr: '100001813', text: 'RM2', mtart: 'ROH', uom: 'KG', qtyPc: D('0.00036'), valPc: D('0.016373'), via: '250003153' }, // listed twice by SAP
  ],
  convPc: D('2.955901'), otherPc: D('0'), unexploded: [], bulkDiff: D('0'), bulks: [],
};
const comp = (matnr: string, cat: Cat, qtyPc: string, costPc: string, meins = 'KG', qty = '0', val = '0'): CdrillComp => ({ matnr, maktx: '', mtart: '', matkl: '', cat, meins, qty: D(qty), val: D(val), qtyPc: D(qtyPc), costPc: D(costPc), share: null });

describe('actual vs CK13N per item', () => {
  it('matches by material, sums duplicates, gives value and quantity variance %', () => {
    const v = ckItemVariance(std, { R: [comp('100000078', 'R', '0.16335', '8.637948', 'KG', '163.35', '8637.95'), comp('100009999', 'R', '0.001', '0.5')], P: [comp('151025162', 'P', '1.004', '6.48584', 'PC')], F: [], O: [] }, D('3'));
    const r = Object.fromEntries(v.rows.map((x) => [x.matnr, x]));
    expect(r['100000078'].pct!.toFixed(1)).toBe('10.0');
    expect(r['100000078'].qtyPct!.toFixed(1)).toBe('10.0');
    expect(r['100000078'].actTotVal!.toFixed(2)).toBe('8637.95');
    expect(r['151025162'].variance!.isZero()).toBe(true);
    expect(r['100001813'].stdVal!.toFixed(6)).toBe('0.032746');
    expect(r['100001813'].status).toBe('ck-only');
    expect(r['100001813'].actTotQty).toBeNull();
    expect(r['100001813'].via).toBe('250003153');
    expect(r['100009999'].status).toBe('actual-only');
    expect(v.rows[0].matnr).toBe('100000078'); // biggest absolute variance first
    expect(v.conv.actVal!.toString()).toBe('3');
    expect(v.total.stdVal!.toFixed(6)).toBe(D('6.48584').plus('7.85268').plus('0.032746').plus('2.955901').toFixed(6));
  });
  it('no quantity % across different units; no actual conversion without production', () => {
    const v = ckItemVariance(std, { R: [], P: [comp('151025162', 'P', '1.004', '6.5', 'KG')], F: [], O: [] }, null);
    expect(v.rows.find((x) => x.matnr === '151025162')!.qtyPct).toBeNull();
    expect(v.conv.actVal).toBeNull();
  });
});
