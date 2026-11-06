import { describe, expect, it } from 'vitest';
import { rateBasisOf, rateBasisQuery, RATE_BASIS_QTY } from '@/lib/budget/rateBasis';
import type { CostLine } from '@/lib/sap/fields';
import type { RateOptionRow } from '@/lib/rates/fields';

// shapes taken from a live NWP run (HAR 2026-11-06): FG 400009228 / UB01, CONSUMP selected, MBEW option beside INFOREC
const line = (o: Partial<CostLine>) => ({ Seqnr: 1, Hwerks: 'UB01', Headmat: 'F1', Werks: 'UB01', Idnrk: 'C1', HasChild: '', ProdQty: '101.000', SelSource: 'CONSUMP', SelRatePcInr: '0.640', ...o }) as unknown as CostLine;
const opt = (o: Partial<RateOptionRow>) => ({ Seqnr: 1, Hwerks: 'UB01', Headmat: 'F1', Plant: 'UB01', Source: 'MBEW', RatePcInr: '0.640', ...o }) as unknown as RateOptionRow;

describe('rate basis per FG piece', () => {
  it('the query is a Mode B costing of one FG and plant', () => {
    const q = rateBasisQuery('F1', 'UB01');
    expect(q).toMatchObject({ mode: 'B', materials: ['F1'], plants: ['UB01'], explQty: String(RATE_BASIS_QTY) });
  });
  it('selected and C-Map cost per piece = rate x qty incl. scrap / explosion qty, per component and in total', () => {
    const lines = [line({}), line({ Seqnr: 2, Idnrk: 'C2', ProdQty: '500.000', SelRatePcInr: '28.810' })];
    const opts = [opt({}), opt({ Seqnr: 2, RatePcInr: '30.000' }), opt({ Seqnr: 2, Source: 'INFOREC', RatePcInr: '25.030' })];
    const b = rateBasisOf(lines, opts);
    expect(b.comps.get('C1')!.selectedPc!.toFixed(4)).toBe('0.0646');
    expect(b.comps.get('C2')!.selectedPc!.toFixed(4)).toBe('14.4050');
    expect(b.comps.get('C2')!.cmapPc!.toFixed(4)).toBe('15.0000');
    expect(b.selected.toFixed(4)).toBe('14.4696');
    expect(b.cmap.toFixed(4)).toBe('15.0646');
    expect(b).toMatchObject({ leaves: 2, selectedPriced: 2, cmapPriced: 2 });
  });
  it('a component without an MBEW option or a selected rate is left out of that total, never counted as 0 cost', () => {
    const b = rateBasisOf([line({}), line({ Seqnr: 2, Idnrk: 'C2', SelSource: '', SelRatePcInr: '0' })], [opt({})]);
    expect(b.comps.get('C2')).toMatchObject({ selectedPc: null, cmapPc: null });
    expect(b).toMatchObject({ leaves: 2, selectedPriced: 1, cmapPriced: 1 });
  });
  it('parents are skipped and the same component on two lines adds up', () => {
    const b = rateBasisOf([line({ Seqnr: 1, HasChild: 'X' }), line({ Seqnr: 2 }), line({ Seqnr: 3 })], [opt({ Seqnr: 2 }), opt({ Seqnr: 3 })]);
    expect(b.leaves).toBe(2);
    expect(b.comps.get('C1')!.qtyPerPc.toFixed(3)).toBe('0.202');
  });
  it('the own plant option wins over another plant', () => {
    const b = rateBasisOf([line({ ProdQty: '1000' })], [opt({ Plant: 'UB02', RatePcInr: '9' }), opt({ Plant: 'UB01', RatePcInr: '2' })]);
    expect(b.cmap.toFixed(2)).toBe('2.00');
  });
});
