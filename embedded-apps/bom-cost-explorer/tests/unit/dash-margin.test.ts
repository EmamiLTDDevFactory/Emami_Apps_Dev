import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { NO_DRIVERS, cogmDrivers, evalLine, parseCurrentCogm, parseMargin, promoBreakeven, totalOf } from '@/lib/dash/margin';
import type { MarginRow } from '@/lib/dash/types';

const row = (o: Partial<MarginRow> = {}): MarginRow => ({
  Grain: 'S', Zbrand: 'B1', Matnr: '000000000000000123', Kunag: '', Maktx: 'Cream', Matkl: 'G1', KunagTxt: '', Zscheme: '0', Crssku: 'C1', Zbusiness: '01', BudVer: '02', BudFlag: 'OK', Msg: '',
  Qty: '100', Mrp: '12000', Sp: '7000', ChRet: '-2000', ChDis: '-500', ChSs: '-500', Gst: '500', Rm: '2000', Pm: '1500', Pf: '500', Oh: '1000',
  CRm: '0', CPm: '0', CPf: '0', COh: '0', TRm: '100', TPm: '0', TPf: '0', TOh: '0', BudRm: '18', BudPm: '14', BudPf: '5', BudOh: '10', ...o,
});

describe('margin analysis', () => {
  const sku = parseMargin([row(), row({ Grain: 'C', Kunag: '77', KunagTxt: 'Shop' })]);
  it('splits SKU and customer lines', () => { expect(sku.sku).toHaveLength(1); expect(sku.customers[0].label).toBe('Shop'); });
  it('gross margin = revenue - COGS (gross sales basis)', () => {
    const r = evalLine(sku.sku[0], NO_DRIVERS, 'gross');
    expect(r.gross.toNumber()).toBe(7500);
    expect(r.cogs.toNumber()).toBe(5100);          // 2000 + 1500 + 500 + 1000 + scheme 100
    expect(r.gm.toNumber()).toBe(2400);
    expect(r.gmPct!.toFixed(2)).toBe('32.00');
  });
  it('selling price basis leaves GST out', () => { expect(evalLine(sku.sku[0], NO_DRIVERS, 'sp').gm.toNumber()).toBe(1900); });
  it('drivers: RM +10 % lowers the margin by 10 % of RM', () => {
    expect(evalLine(sku.sku[0], { ...NO_DRIVERS, rm: 10 }, 'gross').gm.toNumber()).toBe(2200);
  });
  it('volume scales everything, price scales revenue only', () => {
    expect(evalLine(sku.sku[0], { ...NO_DRIVERS, volume: 10 }, 'gross').gm.toFixed(2)).toBe('2640.00');
    expect(evalLine(sku.sku[0], { ...NO_DRIVERS, price: 10 }, 'gross').gm.toFixed(2)).toBe('3150.00');
  });
  it('flags NBC and counts the budget cost only for budgeted SKUs', () => {
    const n = parseMargin([row({ BudFlag: 'NBC' })]).sku[0];
    expect(n.bud).toBeNull();
    const t = totalOf([sku.sku[0], n], NO_DRIVERS, 'gross');
    expect(t.budQty.toNumber()).toBe(100); expect(t.nbcQty.toNumber()).toBe(100);
    expect(t.budCogs.toNumber()).toBe(4700);       // (18+14+5+10) x 100
  });
  it('promo break-even volume', () => {
    const b = promoBreakeven(sku.sku, 10, 'gross')!;
    expect(b.toFixed(1)).toBe('45.5');             // gm 2400 -> 1650 after a 10 % price cut: 2400/1650 - 1
    expect(promoBreakeven(sku.sku, 40, 'gross')).toBeNull();
  });
  it('current COGM data set replaces the base components', () => {
    const p = parseCurrentCogm('Matnr;Cogm\n123;60');
    expect(p.rows).toBe(1);
    const cur = { map: p.map, total: p.total, on: true };
    const r = evalLine(sku.sku[0], NO_DRIVERS, 'gross', cur);
    expect(r.rm.plus(r.pm).plus(r.pf).plus(r.oh).toNumber()).toBe(6000);
    const dv = cogmDrivers(sku.sku, cur);
    expect(dv.reduce((a, x) => a.plus(x.delta), new Decimal(0)).toNumber()).toBe(1000);
    expect(parseCurrentCogm('a,b\n1,2').error).toBeTruthy();
  });
});
