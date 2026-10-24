import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { createElement } from 'react';
(globalThis as unknown as { React: typeof React }).React = React;
import { renderToStaticMarkup } from 'react-dom/server';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { D } from '@/lib/cost/decimal';
import { actualsPerPiece, elementOf, fetchProcOrders, procOrderRequest, type ProcOrderRow } from '@/lib/costbreakup/procOrder';
import { buildBreakup, qtyText, sumBreakups, type BreakupLine } from '@/lib/costbreakup/breakup';
import CostBreakup from '@/components/costbreakup/CostBreakup';
import { line } from './helpers';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_PROCORDER'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => { process.env.MOCK_SAP = 'true'; process.env.MOCK_SAP_DELAY_MS = '0'; delete process.env.MOCK_SAP_PROCORDER; resetSapConfig(); mockRequestLog.length = 0; });
afterEach(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; resetSapConfig(); });

const po = (o: Partial<ProcOrderRow>): ProcOrderRow => ({ Werks: '1000', Matnr: 'FG1', Aufnr: 'A1', Budat: '20260905', Yield: '1000', YieldUom: 'PC', Element: 'LABOUR', Lstar: 'LAB001', Kostl: 'C1', Kstar: '', Idnrk: '', Maktx: '', Menge: '2', Meins: 'HR', Cost: '400', Waers: 'INR', CostInr: '400', ...o });
const leafOf = (Idnrk: string, Mtart: string, Matkl: string, qty: string, cost: string): BreakupLine => line({ HasChild: '', Land1: 'IN', Hwerks: '1000', Headmat: 'FG1', Headtxt: 'Oil', LocCurr: 'INR', Idnrk, Maktx: Idnrk, Mtart, Matkl, Meins: 'KG', ProdQty: qty, TotCostLoc: cost, TotCostInr: cost, SelRatePcInr: '1', SelSource: 'MBEW' }) as unknown as BreakupLine;

describe('process-order data set (new cost type)', () => {
  it('element names map to the cost elements; unknown ones are ignored', () => {
    expect(['RM', 'Raw Material', 'perfume', 'PACKING', 'labor', 'Power', 'MACH', 'steam', 'Conversion Charge'].map(elementOf)).toEqual(['RM', 'RM', 'PERFUME', 'PM', 'LABOUR', 'POWER', 'MACHINE', 'STEAM', 'CONV']);
    expect(elementOf('FREIGHT')).toBeNull();
  });

  it('request: plants, FGs and the posting date; quotes escaped', () => {
    expect(procOrderRequest(['1000', '1100'], ['FG1'], '20251024').params.$filter).toBe("(Werks eq '1000' or Werks eq '1100') and Matnr eq 'FG1' and Budat ge '20251024'");
  });

  it('actual per FG piece = sum of cost / sum of order yields (each order counted once)', () => {
    const a = actualsPerPiece([
      po({ Aufnr: 'A1', Yield: '1000', Element: 'LABOUR', Menge: '2', Cost: '400', CostInr: '400' }),
      po({ Aufnr: 'A1', Yield: '1000', Element: 'POWER', Menge: '30', Meins: 'KWH', Cost: '150', CostInr: '150' }),
      po({ Aufnr: 'A2', Yield: '3000', Element: 'LABOUR', Menge: '5', Cost: '1200', CostInr: '1200' }),
    ]).get('1000|FG1')!;
    expect(a.orders).toBe(2);
    expect(a.yield.toFixed(0)).toBe('4000');
    expect(a.byElement.LABOUR!.costPcInr.toFixed(4)).toBe('0.4000'); // 1600 / 4000
    expect(a.byElement.LABOUR!.qtyPc.HR.toFixed(5)).toBe('0.00175'); // 7 HR / 4000
    expect(a.byElement.POWER!.costPcInr.toFixed(4)).toBe('0.0375');
  });

  it('against the mock SAP: rows for the FGs; a system without the set says so (no error)', async () => {
    const f = await fetchProcOrders(['1000'], ['FG1001'], '20251001');
    expect(f.status).toBe('ready');
    expect(new Set(f.rows.map((r) => r.Element))).toEqual(new Set(['RM', 'PERFUME', 'PM', 'LABOUR', 'POWER', 'MACHINE', 'STEAM', 'CONV']));
    for (const u of mockRequestLog) expect(u).not.toContain('+');
    process.env.MOCK_SAP_PROCORDER = 'missing';
    const m = await fetchProcOrders(['1000'], ['FG1001'], '20251001');
    expect(m.status).toBe('missing');
    expect(m.note).toMatch(/does not have ProcOrderCostSet/);
  });
});

describe('cost breakup', () => {
  const lines = [
    leafOf('RM0001', 'ROH', '101', '60', '600'),
    leafOf('RM0005', 'ROH', '0106', '1', '300'), // group 106 (leading zero) = Perfume
    leafOf('PM0001', 'VERP', 'PM-BOTTLE', '1000', '500'),
    leafOf('PM0009', 'PKGN', 'PM-LABEL', '1000', '100'),
    leafOf('SV0001', 'DIEN', 'SERV', '1', '50'),
    { ...leafOf('SF0001', 'HALB', 'SF', '10', '0'), HasChild: 'X' }, // parent: skipped
  ];
  const qtyOf = (l: BreakupLine) => D((l as unknown as { ProdQty: string }).ProdQty);

  it('component level: ROH = Raw Material, ROH + group 106 = Perfume, PKGN / VERP = Pack Material; Total Material; parents skipped', () => {
    const [f] = buildBreakup(lines, qtyOf, () => D(1000), new Map());
    expect(f.elements.RM.inr.toFixed(0)).toBe('600');
    expect(f.elements.PERFUME.inr.toFixed(0)).toBe('300');
    expect(f.elements.PM.inr.toFixed(0)).toBe('600');
    expect(f.elements.OTHER.inr.toFixed(0)).toBe('50');
    expect(f.material.inr.toFixed(0)).toBe('1550');
    expect(qtyText(f.elements.PM.qty, (d) => d.toFixed(0))).toBe('2000 KG');
    expect(f.lines.PM).toEqual([2, 3]);
    expect(f.elements.LABOUR.source).toBe('none');
    expect(f.total.inr.toFixed(0)).toBe('1550');
  });

  it('conversion elements = process-order actual per piece x the FG quantity; Total Cost = material + conversion', () => {
    const actuals = actualsPerPiece([po({ Element: 'LABOUR', Cost: '400', CostInr: '400' }), po({ Element: 'STEAM', Menge: '12', Meins: 'KG', Cost: '70', CostInr: '70' }), po({ Element: 'RM', Cost: '700', CostInr: '700', Meins: 'KG', Menge: '60' })]);
    const [f] = buildBreakup(lines, qtyOf, () => D(2000), actuals);
    expect(f.elements.LABOUR.inr.toFixed(2)).toBe('800.00'); // 0.40 / pc x 2000
    expect(f.elements.LABOUR.qty.HR.toFixed(0)).toBe('4');
    expect(f.elements.STEAM.inr.toFixed(2)).toBe('140.00');
    expect(f.elements.LABOUR.source).toBe('process orders');
    expect(f.elements.RM.actualPcInr!.toFixed(2)).toBe('0.70'); // actual shown next to the simulated material
    expect(f.conversion.inr.toFixed(0)).toBe('940');
    expect(f.total.inr.toFixed(0)).toBe('2490');
    const all = sumBreakups([f, { ...f, key: 'x' }]);
    expect(all.total.inr.toFixed(0)).toBe('4980');
  });

  it('the screen: every element row, Total Material, Total Cost; clickable elements', () => {
    const html = renderToStaticMarkup(createElement(CostBreakup<BreakupLine>, { lines, qtyOf, fgQtyOf: () => D(1000), qtyLabel: 'the explosion quantity (1000)', exportName: 'Cost breakup', active: false }));
    for (const t of ['Raw Material', 'Perfume', 'Pack Material', 'Total Material (Raw Material + Perfume + Pack Material)', 'Labour', 'Power', 'Machine', 'Steam', 'Conversion Charge', 'Total Cost', 'Process order actual / pc']) expect(html).toContain(t);
    expect(html).toContain('title="Click for the detail"');
  });
});
