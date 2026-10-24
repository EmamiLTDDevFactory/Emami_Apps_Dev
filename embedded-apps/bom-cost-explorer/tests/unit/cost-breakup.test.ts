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
import { activitiesPerUnit, activityElement, activityRequest, fetchActivities, fiscalPeriod, type ActivityRow } from '@/lib/costbreakup/activity';
import { rateSummary, toLocal } from '@/lib/cost/rateSummary';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_PROCORDER', 'MOCK_SAP_ACTIVITY'];
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
    for (const t of ['Raw Material', 'Perfume', 'Pack Material', 'Total Material (Raw Material + Perfume + Pack Material)', 'Labour', 'Power', 'Machine', 'Steam', 'Conversion Charge', 'Total Cost']) expect(html).toContain(t);
    expect(html).not.toContain('Process order actual / pc'); // only once SAP has the process-order data set
    expect(html).toContain('title="Click for the detail"');
  });
});

const act = (o: Partial<ActivityRow>): ActivityRow => ({ Rowid: 1, Matnr: 'FG1', Maktx: 'Oil', Werks: '1000', Stlnr: '1', Stlal: '1', Plnnr: '5', Plnal: '1', Vornr: '0020', Resrc: 'L1', ResrcTxt: 'Line 1', Actseq: 2, Poper: '007', Kokrs: '1000', Kostl: 'C1', Lstar: 'MACHRS', ActName: 'Machine Hours', ActDesc: '', ActGrp: 'OTHER', GrpSeq: '99', BomUnit: 'PC', BomQty: '64', RcpQty: '12438', ActQty: '2.47', ActUnit: 'MIN', Curr: '', ActPrice: '69.84', ActValue: '172.50', ValuePc: '0', FxInr: '0', ValuePcInr: '0', NoPrice: 'X', Gjahr: '2026', Versn: '0', ...o });

describe('conversion from SAP routing activities (ActivityCostSet)', () => {
  it('fiscal period from April; request by materials, plants, year and period', () => {
    expect(fiscalPeriod(new Date(2026, 9, 24))).toEqual({ gjahr: '2026', poper: '007' });
    expect(fiscalPeriod(new Date(2027, 0, 5))).toEqual({ gjahr: '2026', poper: '010' });
    expect(fiscalPeriod(new Date(2026, 3, 1))).toEqual({ gjahr: '2026', poper: '001' });
    expect(activityRequest(['UN13'], ['400008523', 'SF1'], { gjahr: '2026', poper: '007' }).params.$filter).toBe("(Matnr eq '400008523' or Matnr eq 'SF1') and Werks eq 'UN13' and Gjahr eq '2026' and Poper eq '007'");
  });

  it('element from the activity type (SAP sends ActGrp OTHER); unknown types = Conversion Charge', () => {
    expect(['MACHRS', 'LABHRS', 'POWER', 'STEAM', 'ZPRINT'].map((Lstar) => activityElement({ ActGrp: 'OTHER', Lstar, ActName: '' }))).toEqual(['MACHINE', 'LABOUR', 'POWER', 'STEAM', 'CONV']);
    expect(activityElement({ ActGrp: 'LABOUR', Lstar: 'X1', ActName: '' })).toBe('LABOUR');
  });

  it('per BOM unit: duplicates dropped, one BOM alternative, priced period over 000 (the live NWP rows of 400008523 @ UN13)', () => {
    const live = ['1', '2'].flatMap((Stlal) => [
      act({ Stlal, Lstar: 'MACHRS', ActQty: '2.470', ActPrice: '69.84', ActValue: '172.50' }), act({ Stlal, Lstar: 'MACHRS', ActQty: '2.470', ActPrice: '69.84', ActValue: '172.50', Rowid: 2 }),
      act({ Stlal, Lstar: 'LABHRS', ActName: 'Labour Hours', ActQty: '65.451', ActPrice: '2.18', ActValue: '142.68' }),
      act({ Stlal, Lstar: 'POWER', ActName: 'Power', ActUnit: 'KWH', ActQty: '1.400', ActPrice: '5.82', ActValue: '8.14' }),
      act({ Stlal, Lstar: 'MACHRS', Poper: '000', ActPrice: '0', ActValue: '0' }),
    ]);
    const m = activitiesPerUnit(live, '007').get('1000|FG1')!;
    expect(m.stlal).toBe('1');
    expect(m.lines).toHaveLength(3);
    expect(m.byElement.MACHINE!.loc.toFixed(4)).toBe('2.6953'); // 172.50 / 64
    expect(m.byElement.LABOUR!.loc.toFixed(4)).toBe('2.2294');
    expect(m.byElement.POWER!.loc.toFixed(4)).toBe('0.1272');
    expect(m.byElement.MACHINE!.qty.MIN.toFixed(5)).toBe('0.03859');
    expect(m.byElement.MACHINE!.inr).toBeNull(); // SAP gives no INR yet
    // SAP's own per-unit figures win once filled
    const s = activitiesPerUnit([act({ ValuePc: '3.0', ValuePcInr: '3.0' })]).get('1000|FG1')!;
    expect(s.byElement.MACHINE!.loc.toFixed(2)).toBe('3.00');
  });

  const fg = [
    leafOf('RM0001', 'ROH', '101', '60', '600'),
    leafOf('PM0001', 'VERP', 'PM-BOTTLE', '1000', '500'),
    { ...leafOf('SF0001', 'HALB', 'SF', '92', '0'), HasChild: 'X', Meins: 'KG' },
    { ...leafOf('SF0002', 'HALB', 'SF', '5', '0'), HasChild: 'X', Meins: 'L' },
  ];
  const q = (l: BreakupLine) => D((l as unknown as { ProdQty: string }).ProdQty);
  const acts = activitiesPerUnit([
    act({ Matnr: 'FG1', BomQty: '1000', Lstar: 'MACHRS', ActValue: '200' }), act({ Matnr: 'FG1', BomQty: '1000', Lstar: 'LABHRS', ActName: 'Labour', ActValue: '170' }),
    act({ Matnr: 'SF0001', BomQty: '100', BomUnit: 'KG', Lstar: 'STEAM', ActName: 'Steam', ActUnit: 'KG', ActQty: '40', ActValue: '116.40' }),
    act({ Matnr: 'SF0001', BomQty: '100', BomUnit: 'KG', Lstar: 'POWER', ActName: 'Power', ActUnit: 'KWH', ActQty: '95', ActValue: '552.90' }),
    act({ Matnr: 'SF0002', BomQty: '100', BomUnit: 'KG', Lstar: 'STEAM', ActName: 'Steam', ActValue: '1000' }), // unit L vs KG: not added
  ], '007');

  it('FG routing x FG qty + semi-finished routings x their BOM qty; other unit = not added; Total Cost', () => {
    const [f] = buildBreakup(fg, q, () => D(1000), new Map(), acts);
    expect(f.elements.MACHINE.inr.toFixed(2)).toBe('200.00'); // 200 per 1000 PC x 1000
    expect(f.elements.LABOUR.inr.toFixed(2)).toBe('170.00');
    expect(f.elements.STEAM.inr.toFixed(2)).toBe('107.09'); // 116.40 / 100 KG x 92 KG
    expect(f.elements.POWER.inr.toFixed(2)).toBe('508.67');
    expect(f.elements.STEAM.qty.KG.toFixed(1)).toBe('36.8');
    expect(f.elements.STEAM.source).toBe('activity cost');
    expect(f.activity.find((u) => u.matnr === 'SF0002')!.unitOk).toBe(false);
    expect(f.conversion.inr.toFixed(2)).toBe('985.76');
    expect(f.total.inr.toFixed(2)).toBe('2085.76');
  });

  it('a BDT plant: activity value in BDT, INR at the FG costing rate', () => {
    const bd = fg.map((l) => ({ ...l, Hwerks: 'BD10', Werks: 'BD10', LocCurr: 'BDT', TotCostLoc: String(Number(l.TotCostInr) * 1.4) }));
    const a = activitiesPerUnit([act({ Werks: 'BD10', Matnr: 'FG1', BomQty: '1000', ActValue: '280' })]);
    const [f] = buildBreakup(bd, q, () => D(1000), new Map(), a);
    expect(f.elements.MACHINE.loc.toFixed(2)).toBe('280.00');
    expect(f.elements.MACHINE.inr.toFixed(2)).toBe('200.00');
    const html = renderToStaticMarkup(createElement(CostBreakup<BreakupLine>, { lines: bd, qtyOf: q, fgQtyOf: () => D(1000), qtyLabel: 'x', exportName: 'x', active: false }));
    expect(html).toContain('Per piece BDT');
  });

  it('against the mock SAP: FG + semi-finished rows like the live ones; missing set = note, no error', async () => {
    const f = await fetchActivities(['1000'], ['FG1001', 'SF1001'], { gjahr: '2026', poper: '007' });
    expect(f.status).toBe('ready');
    const m = activitiesPerUnit(f.rows, '007');
    expect(Object.keys(m.get('1000|SF1001')!.byElement).sort()).toEqual(['LABOUR', 'MACHINE', 'POWER', 'STEAM']);
    expect(Object.keys(m.get('1000|FG1001')!.byElement).sort()).toEqual(['LABOUR', 'MACHINE', 'POWER']);
    process.env.MOCK_SAP_ACTIVITY = 'missing';
    const x = await fetchActivities(['1000'], ['FG1001'], { gjahr: '2026', poper: '007' });
    expect(x.status).toBe('missing');
  });
});

describe('rate summary in local currency for non-INR plants', () => {
  it('FG and component figures get a local value at the lines\' own rate; INR plants none', () => {
    const l = (o: Record<string, string>) => line({ HasChild: '', Land1: 'BD', Hwerks: 'BD10', Werks: 'BD10', Headmat: 'FG1', Headtxt: 'Oil', LocCurr: 'BDT', Idnrk: 'RM1', Maktx: 'RM', Mtart: 'ROH', Matkl: '101', Meins: 'KG', ProdQty: '10', SelSource: 'MBEW', SelRatePcInr: '5', TotCostInr: '50', TotCostLoc: '70', ...o });
    const s = rateSummary([l({}), l({ Idnrk: 'PM1', Mtart: 'VERP', SelRatePcInr: '1', ProdQty: '1000', TotCostInr: '1000', TotCostLoc: '1400' })], 1000);
    const f = s.fgs[0];
    expect(f.curr).toBe('BDT');
    expect(f.locPerInr!.toFixed(2)).toBe('1.40');
    expect(toLocal(f.perPc.SELECTED.value, f.locPerInr)!.toFixed(4)).toBe('1.4700'); // 1.05 INR / pc
    expect(toLocal(s.rm[0].rates.SELECTED, s.rm[0].locPerInr)!.toFixed(2)).toBe('7.00');
    const inr = rateSummary([line({ HasChild: '', Land1: 'IN', Hwerks: '1000', Headmat: 'FG1', LocCurr: 'INR', Idnrk: 'RM1', Mtart: 'ROH', ProdQty: '1', SelSource: 'MBEW', SelRatePcInr: '5', TotCostInr: '5', TotCostLoc: '5' })], 1);
    expect(inr.fgs[0].locPerInr).toBeNull();
  });
});
