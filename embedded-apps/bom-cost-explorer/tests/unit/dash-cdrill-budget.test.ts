import { describe, expect, it } from 'vitest';
import { parseBudget } from '@/lib/dash/cdrill';
import type { CdrillRow } from '@/lib/dash/types';

const row = (o: Partial<CdrillRow>): CdrillRow => ({ Grain: 'T', Matnr: '1', Charg: 'UN13', Idnrk: '', Maktx: '', Mtart: '', Matkl: '', Cat: '', Meins: '', Flag: '', Msg: '', Orders: 0, SoldQty: '0', ProdQty: '0', Qty: '0', Val: '0', AvgQtyPc: '0', AvgCostPc: '0', RmPc: '0', PmPc: '0', PfPc: '0', OthPc: '0', ...o } as CdrillRow);

describe('budget items of the cost drill-down', () => {
  it('groups by valuation type and adds the cost per piece by category', () => {
    const g = parseBudget([
      row({ Idnrk: 'A', Cat: 'R', Flag: '02', AvgCostPc: '2.5' }), row({ Idnrk: 'B', Cat: 'P', Flag: '02', AvgCostPc: '1' }), row({ Idnrk: 'C', Cat: 'F', Flag: '02', AvgCostPc: '0.5' }), row({ Idnrk: 'D', Cat: '', Flag: '02', AvgCostPc: '0.25' }),
      row({ Charg: 'UN05', Flag: 'NBC', Msg: 'none' }),
    ]);
    expect(g.map((x) => x.bwtar)).toEqual(['UN05', 'UN13']);
    expect(g[0].flag).toBe('NBC');
    const u = g[1];
    expect(u.version).toBe('02');
    expect([u.rm, u.pm, u.pf, u.oth, u.total].map(String)).toEqual(['2.5', '1', '0.5', '0.25', '4.25']);
  });
  it('a blank valuation type is its own group', () => {
    expect(parseBudget([row({ Charg: '', Idnrk: 'A', Cat: 'R', Flag: '01', AvgCostPc: '1' })])[0].bwtar).toBe('');
  });
});
