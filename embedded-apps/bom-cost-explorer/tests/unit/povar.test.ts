import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { buildBreakupFilter, buildOrdersFilter } from '@/lib/povar/service';
import { breakupOf, causes, ckCompare, crosses, diffOf, orderStats, shareOf, sortReceipts, yesterday } from '@/lib/povar/view';
import { navSections } from '@/lib/nav/sections';
import type { PoVarRow } from '@/lib/povar/fields';

const row = (o: Partial<PoVarRow> = {}): PoVarRow => ({
  Rowid: 1, Grain: 'O', Aufnr: '000200088101', Matnr: '400010165', Maktx: 'FG', Mtart: 'FERT', Matkl: '', Cat: 'O', Werks: 'UN13', Charg: 'B1', PostType: '01', Mblnr: '', Mjahr: '',
  Budat: null, Erdat: '2026-11-26', Zbusiness: '', Crssku: '', Level: 0, Parent: '', IsWip: '', Menge: '100', Meins: 'PC', BaseUom: 'PC', FgQty: '100',
  Rm: '0', Pm: '0', Perf: '0', Oth: '0', Conv: '0', Cons: '0', Trd: '0', Total: '1040', ActPc: '10.4', Bwtar: '', Vprsv: 'S', Peinh: '1', Stprs: '10', Verpr: '0',
  StdPc: '10', StdVal: '1000', VarVal: '40', VarFgPc: '0', DiffPct: '-4', Flag: '', Msg: '',
  CkPc: '', CkKadky: null, CkStatus: '', CkKlvar: '', CkDiffPct: '', CkVarVal: '', ...o,
});

describe('variance check filters', () => {
  it('builds the ZMM_PCOST selection', () => {
    expect(buildOrdersFilter({ plants: ['un13', 'UB01'], dateFrom: '2026-11-26', dateTo: '2026-11-26', dateType: 'C' }))
      .toBe("(Werks eq 'UN13' or Werks eq 'UB01') and DateFrom eq datetime'2026-11-26T00:00:00' and DateTo eq datetime'2026-11-26T00:00:00' and DateType eq 'C'");
    expect(buildOrdersFilter({ plants: [], orders: ['000200088101'], dateFrom: '2026-11-01', dateTo: '2026-11-26', dateType: 'P' })).toContain("Aufnr eq '200088101'");
  });
  it('rejects an empty or wrong selection', () => {
    expect(() => buildOrdersFilter({ plants: [], dateFrom: '2026-11-26', dateTo: '2026-11-26', dateType: 'C' })).toThrow(/plant/);
    expect(() => buildOrdersFilter({ plants: ['UN13'], dateFrom: '2026-11-27', dateTo: '2026-11-26', dateType: 'C' })).toThrow(/after/);
    expect(() => buildBreakupFilter("1' or 1 eq 1")).toThrow();
  });
  it('asks for one order with Grain C for the breakup', () => {
    expect(buildBreakupFilter('000200088101')).toBe("Aufnr eq '200088101' and Grain eq 'C'");
  });
});

describe('variance check maths', () => {
  it('flags by the absolute Diff % and the direction (ZMM_PCOST sign: negative = costlier)', () => {
    expect(crosses(row({ DiffPct: '-4' }), 4, 'both')).toBe(true);
    expect(crosses(row({ DiffPct: '-3.99' }), 4, 'both')).toBe(false);
    expect(crosses(row({ DiffPct: '5' }), 4, 'costlier')).toBe(false);
    expect(crosses(row({ DiffPct: '5' }), 4, 'cheaper')).toBe(true);
    expect(crosses(row({ StdPc: '0', DiffPct: '0' }), 0, 'both')).toBe(false);
  });
  it('counts receipts, flagged, costlier and rows without a standard', () => {
    const s = orderStats([row(), row({ Rowid: 2, DiffPct: '10', VarVal: '-100' }), row({ Rowid: 3, DiffPct: '1', VarVal: '5' }), row({ Rowid: 4, StdPc: '0', Flag: 'NOSTD' })], 4, 'both');
    expect([s.receipts, s.flagged, s.costlier, s.cheaper, s.noStd]).toEqual([4, 2, 1, 1, 1]);
    expect(s.varFlagged.toString()).toBe('-60');
  });
  it('sorts by the absolute Diff %, rows without a standard last', () => {
    const out = sortReceipts([row({ Rowid: 1, DiffPct: '2' }), row({ Rowid: 2, StdPc: '' }), row({ Rowid: 3, DiffPct: '-9' })]);
    expect(out.map((r) => r.Rowid)).toEqual([3, 1, 2]);
  });
  it('orders an order breakup by variance and adds up the causes across orders', () => {
    const comps = [
      row({ Rowid: 1, Grain: 'H' }),
      row({ Rowid: 2, Grain: 'C', Matnr: '100001', Cat: 'R', Menge: '10', Total: '120', ActPc: '12', StdPc: '10', StdVal: '100', VarVal: '20', DiffPct: '-20' }),
      row({ Rowid: 3, Grain: 'C', Matnr: '100002', Cat: 'P', Menge: '100', Total: '95', ActPc: '0.95', StdPc: '1', StdVal: '100', VarVal: '-5', DiffPct: '5' }),
      row({ Rowid: 4, Grain: 'W', Matnr: '300001', Mtart: 'WIP' }),
    ];
    const b = breakupOf(comps);
    expect(b.comps.map((r) => r.Matnr)).toEqual(['100001', '100002']);
    expect(b.compVar.toString()).toBe('15');
    expect(b.wip).toHaveLength(1);
    expect(shareOf(b.comps[0], b.compVar)!.toFixed(2)).toBe('133.33');
    const c = causes(new Map([['A1', comps], ['A2', comps.slice(0, 2)]]));
    expect(c[0].matnr).toBe('100001');
    expect(c[0].orders).toEqual(['A1', 'A2']);
    expect(c[0].varVal.toString()).toBe('40');
    expect(c[0].diffPct!.toString()).toBe(new Decimal(-20).toString());
  });
  it('defaults to yesterday', () => {
    expect(yesterday(new Date(2026, 0, 1))).toBe('2025-12-31');
  });
});

describe('variance check against CK13N', () => {
  it('flags on MBEW, CK13N or either', () => {
    const r = row({ DiffPct: '-1', CkPc: '9', CkDiffPct: '-15.56', CkVarVal: '140' });
    expect(crosses(r, 4, 'both', 'mbew')).toBe(false);
    expect(crosses(r, 4, 'both', 'ck')).toBe(true);
    expect(crosses(r, 4, 'both', 'either')).toBe(true);
    expect(diffOf(r, 'either')!.toString()).toBe('-15.56');
    expect(orderStats([r], 4, 'both', 'either').varFlagged.toString()).toBe('140');
    expect(crosses(row({ CkPc: '' }), 0, 'both', 'ck')).toBe(false);
  });
  it('splits each component into rate and quantity variance against the CK13N structure x pieces produced', () => {
    const comps = [
      row({ Rowid: 2, Grain: 'C', Matnr: '100001', Cat: 'R', Menge: '110', Meins: 'KG', Total: '1320' }), // 1.1 kg/pc x 100 at 12
      row({ Rowid: 3, Grain: 'C', Matnr: '100003', Cat: 'P', Menge: '5', Meins: 'PC', Total: '50' }),
    ];
    const exp = { lines: [
      { matnr: '100001', text: 'RM', mtart: 'ROH', uom: 'KG', qtyPc: new Decimal(1), valPc: new Decimal(10), via: '' },
      { matnr: '100002', text: 'Cap', mtart: 'VERP', uom: 'PC', qtyPc: new Decimal(1), valPc: new Decimal(2), via: '' },
    ], convPc: new Decimal(3), otherPc: new Decimal(0), unexploded: [], bulkDiff: new Decimal(0), bulks: [] };
    const c = ckCompare(comps, exp, new Decimal(100));
    const rm = c.lines.find((l) => l.matnr === '100001')!;
    expect([rm.rateVar!.toString(), rm.qtyVar!.toString(), rm.totVar.toString(), rm.diffPct!.toFixed(2), rm.qtyPct!.toFixed(1)]).toEqual(['220', '100', '320', '-20.00', '10.0']);
    const cap = c.lines.find((l) => l.matnr === '100002')!;
    expect([cap.status, cap.qtyVar!.toString(), cap.totVar.toString()]).toEqual(['ck-only', '-200', '-200']);
    expect(c.lines.find((l) => l.matnr === '100003')!.status).toBe('actual-only');
    expect(c.totVar.toString()).toBe('170');
    expect(c.rateVar.plus(c.qtyVar).plus(50).toString()).toBe(c.totVar.toString());
    expect(c.convCk.toString()).toBe('300');
    const k = causes(new Map([['A1', comps]]), new Map([['A1', c]]));
    expect(k[0].matnr).toBe('100001');
    expect(k[0].ckTotVar.toString()).toBe('320');
  });
});

describe('variance check navigation', () => {
  const base = { wac: false, ck: false, so: false, psum: false, marginRole: '', budgetRole: '' };
  it('is its own side-pane section, only when allowed', () => {
    expect(navSections(base).some((s) => s.id === 'variance')).toBe(false);
    const v = navSections({ ...base, povar: true }).find((s) => s.id === 'variance');
    expect(v?.items.map((i) => i.path)).toEqual(['/variance-check/']);
    expect(navSections({ ...base, povar: true, tiles: ['wac'] }).some((s) => s.id === 'variance')).toBe(false);
  });
});
