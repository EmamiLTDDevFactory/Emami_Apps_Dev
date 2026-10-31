import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { monthSlices, psumRange } from '@/lib/psum/dates';
import { aggregateComponents, chunk, costMix, fgValues, groupTotals, monthPoint, pickForComponents, plantTotals, sharePct } from '@/lib/psum/view';
import { planBatches } from '@/lib/psum/useSummary';
import type { WacCompRow, WacRow } from '@/lib/wac/types';

const row = (p: Partial<WacRow> = {}): WacRow => ({
  Rowid: 1, Matnr: '400000001', Maktx: 'FG ONE', Werks: 'UB01', Mtart: 'FERT', Zbrand: 'B', Prodha: 'P', Zskugrcodecrs: '', Zskugroupcrs: '', Uom: 'PC', Docs: 2, Batches: 1, DupDocs: 0, Qty: '100',
  ActRm: '10', ActPm: '5', ActPerf: '1', ActMat: '16', ActConv: '4', ActLanded: '20', ActRecon: '0', VarpSel: '', VarpCmap: '', VarpCon: '', VarpAvg: '', FlagSel: '', FlagCmap: '', FlagCon: '', FlagAvg: '', Status: '', Msg: '', ...p,
});
const comp = (p: Partial<WacCompRow> = {}): WacCompRow => ({
  Rowid: 1, Matnr: '400000001', Werks: 'UB01', Idnrk: 'R1', CompTxt: 'Oil', Mtart: 'ROH', Grp: 'RM', SrcSel: 'CONTRACT', Uom: 'KG', QtyPu: '0.5', RateSel: '20', RateCmap: '', RateCon: '', RateAvg: '', CostSel: '10', CostCmap: '', CostCon: '', CostAvg: '', VarpCmap: '', VarpCon: '', VarpAvg: '', Flag: '', ...p,
});

describe('period presets and months', () => {
  const now = new Date(2026, 10, 15); // 15 Nov 2026
  it('last 6 full months ends on the last day of the previous month', () => {
    expect(psumRange('full6', now)).toEqual({ from: '2026-05-01', to: '2026-10-31' });
    expect(psumRange('full3', now)).toEqual({ from: '2026-08-01', to: '2026-10-31' });
    expect(psumRange('full12', now)).toEqual({ from: '2025-11-01', to: '2026-10-31' });
  });
  it('6 months to date is six calendar months, the last one partial', () => {
    const r = psumRange('td6', now)!;
    expect(r).toEqual({ from: '2026-06-01', to: '2026-11-15' });
    expect(monthSlices(r.from, r.to)).toHaveLength(6);
  });
  it('custom has no preset range', () => expect(psumRange('custom', now)).toBeNull());
  it('month slices are clipped to the range and cross the year', () => {
    const m = monthSlices('2026-11-20', '2027-01-10');
    expect(m.map((x) => [x.key, x.from, x.to])).toEqual([['2026-11', '2026-11-20', '2026-11-30'], ['2026-12', '2026-12-01', '2026-12-31'], ['2027-01', '2027-01-01', '2027-01-10']]);
    expect(monthSlices('2026-02-01', '2026-02-28')[0].to).toBe('2026-02-28');
  });
  it('bad or reversed dates give no months', () => { expect(monthSlices('x', '2026-01-01')).toEqual([]); expect(monthSlices('2026-02-01', '2026-01-01')).toEqual([]); });
});

describe('plant totals', () => {
  it('value = per-unit x quantity, added up; zero-quantity rows are left out; ranked by value', () => {
    const vals = fgValues([row({ Matnr: 'A', Qty: '100' }), row({ Matnr: 'B', Qty: '0' }), row({ Matnr: 'C', Qty: '300', ActLanded: '30', ActRm: '20', ActPm: '5', ActPerf: '1', ActConv: '4' })]);
    expect(vals.map((v) => v.row.Matnr)).toEqual(['C', 'A']);
    const t = plantTotals(vals);
    expect(t.landed.toFixed()).toBe('11000'); // 300x30 + 100x20
    expect(t.rm.toFixed()).toBe('7000'); // 300x20 + 100x10
    expect(t.fgs).toBe(2);
    expect(t.docs).toBe(4);
    expect(t.qtyByUom).toEqual([{ uom: 'PC', qty: new Decimal(400) }]);
  });
  it('quantities of different units are never added together', () => {
    const t = plantTotals(fgValues([row({ Matnr: 'A', Uom: 'PC', Qty: '10' }), row({ Matnr: 'B', Uom: 'KG', Qty: '5' })]));
    expect(t.qtyByUom.map((u) => u.uom).sort()).toEqual(['KG', 'PC']);
  });
  it('cost mix shares add to the total; "other" appears only above 0.5 %', () => {
    const t = plantTotals(fgValues([row()])); // 10+5+1+4 = 20 = landed: no gap
    const m = costMix(t);
    expect(m.map((x) => x.key)).toEqual(['rm', 'pm', 'perf', 'conv']);
    expect(m[0].pct!.toFixed(1)).toBe('50.0');
    const gap = costMix(plantTotals(fgValues([row({ ActLanded: '25' })])));
    expect(gap.map((x) => x.key)).toContain('other');
  });
  it('share is null for a zero total', () => expect(sharePct(new Decimal(1), new Decimal(0))).toBeNull());
  it('a month point counts only produced rows', () => expect(monthPoint('2026-05', 'May 2026', [row(), row({ Matnr: 'Z', Qty: '0' })]).fgs).toBe(1));
});

describe('component breakup', () => {
  const qty = new Map([['UB01|400000001', new Decimal(100)], ['UB01|400000002', new Decimal(50)]]);
  it('quantity and cost are SAP per-unit x produced quantity, summed over finished goods', () => {
    const a = aggregateComponents([comp(), comp({ Matnr: '400000002', QtyPu: '1', CostSel: '4' })], qty);
    expect(a).toHaveLength(1);
    expect(a[0].qty.toFixed()).toBe('100'); // 0.5x100 + 1x50
    expect(a[0].cost.toFixed()).toBe('1200'); // 10x100 + 4x50
    expect(a[0].fgs).toBe(2);
    expect(a[0].avgRate!.toFixed()).toBe('12');
  });
  it('the same component in different units stays separate', () => {
    expect(aggregateComponents([comp(), comp({ Uom: 'G' })], qty)).toHaveLength(2);
  });
  it('a row with no cost from SAP adds quantity but no cost and is counted', () => {
    const a = aggregateComponents([comp({ CostSel: '' })], qty)[0];
    expect(a.cost.isZero()).toBe(true);
    expect(a.noCostFgs).toBe(1);
    expect(a.avgRate).toBeNull();
  });
  it('rows of finished goods with no produced quantity are ignored', () => {
    expect(aggregateComponents([comp({ Matnr: '999' })], qty)).toEqual([]);
  });
  it('ranked by cost, with group totals and shares', () => {
    const a = aggregateComponents([comp({ Idnrk: 'R1', CostSel: '10' }), comp({ Idnrk: 'P1', Grp: 'PM', CostSel: '30' })], qty);
    expect(a.map((x) => x.idnrk)).toEqual(['P1', 'R1']);
    const g = groupTotals(a);
    expect(g[0].grp).toBe('PM');
    expect(g[0].pct!.toFixed(0)).toBe('75');
  });
});

describe('component batches', () => {
  it('top N by value, in groups of 25', () => {
    const rows = Array.from({ length: 60 }, (_, i) => row({ Matnr: `M${String(i).padStart(3, '0')}`, Qty: String(100 + i) }));
    expect(planBatches(rows, 50).map((b) => b.length)).toEqual([25, 25]);
    expect(planBatches(rows, 0).map((b) => b.length)).toEqual([25, 25, 10]);
    expect(planBatches(rows, 25)[0][0]).toBe('M059'); // largest value first
    expect(pickForComponents(fgValues(rows), 10)).toHaveLength(10);
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});

import { fgComponentTotals, fgComponents, groupSummary } from '@/lib/psum/view';

describe('RM / PM / Perfume summary', () => {
  const vals = fgValues([row({ Matnr: 'A', Qty: '100', ActRm: '10', ActPm: '2' }), row({ Matnr: 'B', Qty: '50', ActRm: '40', ActPm: '0', ActPerf: '3' }), row({ Matnr: 'C', Qty: '10', ActRm: '0', ActPm: '0', ActPerf: '0', ActConv: '1', ActLanded: '1' })]);
  const t = plantTotals(vals);
  it('group value is the plant sum of per-unit x quantity; share is of the plant total', () => {
    const rm = groupSummary(vals, 'rm', t);
    expect(rm.value.toFixed()).toBe('3000'); // 100x10 + 50x40
    expect(rm.fgs).toBe(2); // C has no RM
    expect(rm.top.map((x) => x.v.row.Matnr)).toEqual(['B', 'A']); // 2000 then 1000
    expect(rm.top[0].pctOfGroup!.toFixed(1)).toBe('66.7');
    expect(rm.pctOfTotal!.gt(0)).toBe(true);
  });
  it('a group nobody has is empty', () => expect(groupSummary(vals, 'pm', t).top.map((x) => x.v.row.Matnr)).toEqual(['A']));
  it('top N is respected', () => expect(groupSummary(vals, 'rm', t, 1).top).toHaveLength(1));
});

describe('component-wise cost of one finished good', () => {
  const comps = [comp({ Idnrk: 'P1', Grp: 'PM', CostSel: '3' }), comp({ Idnrk: 'R2', Grp: 'RM', CostSel: '4' }), comp({ Idnrk: 'R1', Grp: 'RM', CostSel: '10' }), comp({ Idnrk: 'X', Grp: 'PERF', CostSel: '' })];
  it('RM, PM, Perfume in order; largest cost first inside a group', () => {
    expect(fgComponents(comps).map((c) => c.Idnrk)).toEqual(['R1', 'R2', 'P1', 'X']);
  });
  it('group totals per unit and for the quantity; a row with no cost adds nothing', () => {
    const g = fgComponentTotals(comps, new Decimal(100));
    expect(g.map((x) => x.grp)).toEqual(['RM', 'PM', 'PERF']);
    expect(g[0].perUnit.toFixed()).toBe('14');
    expect(g[0].atQty.toFixed()).toBe('1400');
    expect(g[2].perUnit.toFixed()).toBe('0');
    expect(g[2].items).toBe(1);
  });
});
