import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { buildReport, direction, marginPct, marginText, filterReportRows, latestPerArea, lookbackRange, optionsOf, ratio, ratioText, simulatedCogm, simulationOn } from '@/lib/psum/report';
import type { WacCompRow, WacRow } from '@/lib/wac/types';
import type { SoPriceRow } from '@/lib/so/types';

const row = (p: Partial<WacRow> = {}): WacRow => ({
  Rowid: 1, Matnr: '400000001', Maktx: 'FG ONE', Werks: 'UB01', Mtart: 'FERT', Zbrand: 'NAVRATNA', Prodha: 'P1', Zskugrcodecrs: '', Zskugroupcrs: '', Uom: 'PC', Docs: 2, Batches: 1, DupDocs: 0, Qty: '100',
  ActRm: '10', ActPm: '5', ActPerf: '1', ActMat: '16', ActConv: '4', ActLanded: '99', ActRecon: '79', ActCogm: '20', VarpSel: '', VarpCmap: '', VarpCon: '', VarpAvg: '', FlagSel: '', FlagCmap: '', FlagCon: '', FlagAvg: '', Status: '', Msg: '', ...p,
});
const price = (p: Partial<SoPriceRow> = {}): SoPriceRow => ({ Matnr: '400000001', Maktx: '', Vkorg: 'EM01', Vtweg: '10', Auart: 'ZOD1', AuartTxt: '', Segment: 'DOM', SegTxt: '', Kalsm: '', KalsmTxt: '', Curr: 'INR', Uom: 'PC', Werks: '', Mrp: '60', Sp: '40', NetPrice: '', SpCond: '', Vbeln: '1', Posnr: '10', Kunnr: '', Audat: '2026-10-01', DaysOld: 5, NOrders: 1, NSkip: 0, Src: '', Msg: '', RmCost: '', PmCost: '', PerfCost: '', ConsRm: '', ConsPm: '', ConsPerf: '', PcTotal: '', PcRatio: '', PcDate: null, PcAufnr: '', PcWerks: '', PcCharg: '', PcMsg: '', ...p } as SoPriceRow);
const comp = (p: Partial<WacCompRow> = {}): WacCompRow => ({ Rowid: 1, Matnr: 'A', Werks: 'UB01', Idnrk: 'R1', CompTxt: '', Mtart: 'ROH', Grp: 'RM', SrcSel: '', Uom: 'KG', QtyPu: '1', RateSel: '', RateCmap: '', RateCon: '', RateAvg: '', CostSel: '', CostCmap: '', CostCon: '', CostAvg: '', VarpCmap: '', VarpCon: '', VarpAvg: '', Flag: '', ...p });

describe('look-back window', () => {
  it('ends today and covers N days', () => expect(lookbackRange(180, new Date(2026, 10, 1))).toEqual({ from: '2026-05-06', to: '2026-11-01' }));
  it('at least one day', () => expect(lookbackRange(0, new Date(2026, 10, 1))).toEqual({ from: '2026-11-01', to: '2026-11-01' }));
});

describe('Brand / Product / SKU and WIP filters', () => {
  const rows = [row(), row({ Matnr: 'B', Zbrand: 'BOROPLUS', Prodha: 'P2' }), row({ Matnr: 'W1', Mtart: 'HALB', Zbrand: 'NAVRATNA', Prodha: 'P1' }), row({ Matnr: 'Z', Qty: '0' })];
  it('finished goods exclude WIP and zero-quantity rows; WIP shows only HALB', () => {
    expect(filterReportRows(rows, { kind: 'fg', brand: '', prodha: '', matnr: '', search: '' }).map((r) => r.Matnr)).toEqual(['400000001', 'B']);
    expect(filterReportRows(rows, { kind: 'wip', brand: '', prodha: '', matnr: '', search: '' }).map((r) => r.Matnr)).toEqual(['W1']);
  });
  it('brand narrows product and SKU options', () => {
    const o = optionsOf(rows, 'fg', { brand: 'BOROPLUS', prodha: '' });
    expect(o.brands.map((x) => x.value)).toEqual(['BOROPLUS', 'NAVRATNA']);
    expect(o.products.map((x) => x.value)).toEqual(['P2']);
    expect(o.skus.map((x) => x.value)).toEqual(['B']);
  });
  it('search matches code, description, brand and product', () => {
    expect(filterReportRows(rows, { kind: 'fg', brand: '', prodha: '', matnr: '', search: 'boro' }).map((r) => r.Matnr)).toEqual(['B']);
  });
});

describe('simulation and ratios (computed here)', () => {
  it('simulated COGM = COGM x (1 + %) + amount', () => {
    expect(simulatedCogm('20', { pct: '10', abs: '' })!.toFixed()).toBe('22');
    expect(simulatedCogm('20', { pct: '10', abs: '-0.5' })!.toFixed()).toBe('21.5');
    expect(simulatedCogm('20', { pct: '', abs: '' })).toBeNull();
    expect(simulatedCogm('', { pct: '10', abs: '' })).toBeNull();
    expect(simulationOn({ pct: '0', abs: '' })).toBe(false);
  });
  it('ratio is a / b; missing, zero or non-positive input is n/a, never 0', () => {
    expect(ratioText(ratio('60', '20'))).toBe('3.00 : 1');
    expect(ratio('60', '0')).toBeNull(); expect(ratio('', '20')).toBeNull(); expect(ratio('0', '20')).toBeNull(); expect(ratioText(null)).toBe('n/a');
  });
});

describe('report rows', () => {
  it('one row per sales area, the latest usable order wins, ratios from the price over COGM', () => {
    const prices = [price({ Audat: '2026-09-01', Sp: '30' }), price({ Audat: '2026-10-01', Sp: '40' }), price({ Vtweg: '30', Sp: '50' }), price({ Vtweg: '35', Sp: '0', Msg: 'no order' })];
    const t = buildReport([row()], prices, { pct: '', abs: '' });
    expect(t.map((r) => `${r.price?.Vkorg}/${r.price?.Vtweg}`)).toEqual(['EM01/10', 'EM01/30']);
    expect(t[0].price!.Sp).toBe('40');
    expect(t[0].rSp!.toFixed()).toBe('50'); // (40 - 20) / 40
    expect(t[0].rMrp!.toFixed(1)).toBe('66.7'); // (60 - 20) / 60
    expect(t[0].sim).toBeNull(); expect(t[0].variance).toBeNull();
  });
  it('no price keeps one row with n/a ratios; a price not in INR gets no ratio', () => {
    const none = buildReport([row()], [], { pct: '', abs: '' });
    expect(none).toHaveLength(1); expect(none[0].price).toBeNull(); expect(none[0].rSp).toBeNull();
    const bdt = buildReport([row()], [price({ Curr: 'BDT' })], { pct: '', abs: '' });
    expect(bdt[0].sameCurrency).toBe(false); expect(bdt[0].rSp).toBeNull(); expect(bdt[0].rMrp).toBeNull();
  });
  it('simulation gives the simulated COGM, the variance and its ratio', () => {
    const t = buildReport([row()], [price()], { pct: '10', abs: '' })[0];
    expect(t.sim!.toFixed()).toBe('22'); expect(t.variance!.toFixed()).toBe('2'); expect(t.rSim!.toFixed(1)).toBe('45.0'); // (40 - 22) / 40
  });
  it('latest per area drops rows without a selling price', () => expect(latestPerArea([price({ Sp: '0' })])).toEqual([]));
  it('largest quantity first', () => {
    const t = buildReport([row({ Matnr: 'S', Qty: '5' }), row({ Matnr: 'L', Qty: '500' })], [], { pct: '', abs: '' });
    expect(t.map((r) => r.fg.Matnr)).toEqual(['L', 'S']);
  });
  it('Decimal quantities are unchanged strings', () => expect(new Decimal(buildReport([row()], [], { pct: '', abs: '' })[0].fg.Qty).toFixed()).toBe('100'));
});

describe('reasons: increase / decrease of a component', () => {
  it('the variance of largest size decides the direction; none stays none', () => {
    expect(direction(comp({ VarpCmap: '2', VarpAvg: '-8' }))).toBe('down');
    expect(direction(comp({ VarpCon: '5', VarpAvg: '-1' }))).toBe('up');
    expect(direction(comp({}))).toBe('none');
    expect(direction(comp({ VarpCmap: '0' }))).toBe('none');
  });
});

describe('margin in percent', () => {
  it('(price - COGM) / price x 100; negative when the cost is above the price', () => {
    expect(marginPct('40', '20')!.toFixed()).toBe('50');
    expect(marginPct('10', '15')!.toFixed()).toBe('-50');
    expect(marginText(marginPct('40', '20'))).toBe('50.0 %');
    expect(marginText(marginPct('10', '15'))).toBe('▼ −50.0 %');
  });
  it('n/a without a price or a cost, never 0', () => {
    expect(marginPct('', '20')).toBeNull(); expect(marginPct('40', '')).toBeNull(); expect(marginPct('0', '20')).toBeNull(); expect(marginPct('40', '0')).toBeNull(); expect(marginText(null)).toBe('n/a');
  });
});
