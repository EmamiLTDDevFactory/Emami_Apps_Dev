import { describe, expect, it } from 'vitest';
import { SapError } from '@/lib/sap/client';
import { mergeCdrill, readGradually, splitWindow, windows } from '@/lib/dash/cdrillProgressive';
import { parseCdrill } from '@/lib/dash/cdrill';
import type { CdrillRow } from '@/lib/dash/types';

const row = (o: Partial<CdrillRow>): CdrillRow => ({ Grain: 'C', Matnr: 'FG', Charg: '', Idnrk: '', Maktx: '', Mtart: 'ROH', Matkl: '', Cat: 'R', Meins: 'KG', Flag: '', Msg: '', Orders: 0, SoldQty: '0', ProdQty: '0', Qty: '0', Val: '0', AvgQtyPc: '0', AvgCostPc: '0', RmPc: '0', PmPc: '0', PfPc: '0', OthPc: '0', ...o });
// window A: sold 100 pcs, component X 10 kg for 500; window B: sold 300 pcs, X 45 kg for 1800, Y 3 kg for 90
const A = [row({ Grain: 'S', SoldQty: '100', Flag: 'OK', Orders: 2 }), row({ Grain: 'B', Charg: 'B1', Flag: 'OK', SoldQty: '100', ProdQty: '1000', Orders: 2 }), row({ Idnrk: 'X', Qty: '10', Val: '500', SoldQty: '100' }), row({ Grain: 'T', Charg: 'UN13', Flag: '02', Idnrk: 'X', AvgCostPc: '4.5', AvgQtyPc: '0.1' })];
const B = [row({ Grain: 'S', SoldQty: '300', Flag: 'OK', Orders: 1 }), row({ Grain: 'B', Charg: 'B2', Flag: 'OK', SoldQty: '300', ProdQty: '900', Orders: 1 }), row({ Grain: 'B', Charg: 'B3', Flag: 'NBC', SoldQty: '50' }), row({ Idnrk: 'X', Qty: '45', Val: '1800', SoldQty: '300' }), row({ Idnrk: 'Y', Qty: '3', Val: '90', SoldQty: '300', Cat: 'P' }), row({ Grain: 'T', Charg: 'UN13', Flag: '02', Idnrk: 'X', AvgCostPc: '4.5', AvgQtyPc: '0.1' })];

describe('windows', () => {
  it('covers the period newest first in 31 day pieces', () => {
    const w = windows('2026-04-01', '2026-11-24', 31);
    expect(w[0].to).toBe('2026-11-24'); expect(w[w.length - 1].from).toBe('2026-04-01');
    for (let i = 1; i < w.length; i++) expect(new Date(w[i - 1].from).getTime() - new Date(w[i].to).getTime()).toBe(86400000);
  });
  it('splits in halves down to one day', () => {
    expect(splitWindow({ from: '2026-11-01', to: '2026-11-04' })).toEqual([{ from: '2026-11-03', to: '2026-11-04' }, { from: '2026-11-01', to: '2026-11-02' }]);
    expect(splitWindow({ from: '2026-11-01', to: '2026-11-01' })).toBeNull();
  });
});

describe('merge', () => {
  it('equals one read of the whole period: per piece = total / total weight; batches join; budget once', () => {
    const rows = mergeCdrill([A, B]);
    const x = rows.find((r) => r.Grain === 'C' && r.Idnrk === 'X')!;
    expect(x.Qty).toBe('55'); expect(x.Val).toBe('2300'); expect(Number(x.AvgCostPc)).toBeCloseTo(2300 / 400, 9); expect(Number(x.AvgQtyPc)).toBeCloseTo(55 / 400, 9);
    const p = parseCdrill(rows);
    expect(p.summary!.soldQty.toNumber()).toBe(400);
    expect(p.summary!.rm.toNumber()).toBeCloseTo(5.75, 9); expect(p.summary!.pm.toNumber()).toBeCloseTo(0.225, 9);
    expect(p.batches.map((b) => b.charg).sort()).toEqual(['B1', 'B2', 'B3']);
    expect(p.costed).toBe(2); expect(p.notCosted).toBe(1);
    expect(p.summary!.msg).toBe('2 of 3 sold batches costed from 3 process orders');
    expect(p.budget).toHaveLength(1);
  });
  it('one window merges to itself', () => {
    const p = parseCdrill(mergeCdrill([A]));
    expect(p.summary!.rm.toNumber()).toBeCloseTo(5, 9);
  });
});

describe('reading gradually', () => {
  it('reports progress after every window and merges as it goes', async () => {
    const seen: number[] = [];
    const r = await readGradually('2026-10-01', '2026-11-30', async (w) => (w.to > '2026-11-01' ? B : A), (p) => seen.push(p.coveredDays), { days: 31 });
    expect(r.coveredDays).toBe(61); expect(r.error).toBe('');
    expect(seen[seen.length - 1]).toBe(61); expect(seen.some((n) => n > 0 && n < 61)).toBe(true);
    expect(parseCdrill(r.rows).summary!.soldQty.toNumber()).toBe(400);
  });
  it('a timeout splits the window and retries; it still covers the whole period', async () => {
    let calls = 0;
    const r = await readGradually('2026-11-01', '2026-11-08', async (w) => { calls++; if (w.from === '2026-11-01' && w.to === '2026-11-08') throw new SapError('slow', 'timeout', 504); return A; }, () => undefined, { days: 31 });
    expect(r.splits).toBe(1); expect(calls).toBe(3); expect(r.coveredDays).toBe(8); expect(r.error).toBe('');
  });
  it('a single day that still times out stops with the rest of the data and a message', async () => {
    const r = await readGradually('2026-11-01', '2026-11-02', async (w) => { if (w.from === '2026-11-01') throw new SapError('slow', 'timeout', 504); return A; }, () => undefined);
    expect(r.error).toContain('2026-11-01'); expect(r.coveredDays).toBe(1);
    expect(parseCdrill(r.rows).summary!.soldQty.toNumber()).toBe(100);
  });
  it('another SAP error ends the read at once, with what is there', async () => {
    const r = await readGradually('2026-10-01', '2026-11-30', async (w) => { if (w.to <= '2026-10-31') throw new SapError('SAP says no', 'http', 500); return A; }, () => undefined);
    expect(r.error).toBe('SAP says no'); expect(r.coveredDays).toBe(31);
  });
});
