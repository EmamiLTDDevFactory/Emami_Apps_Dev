import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { ckVariance } from '@/lib/dash/ckVariance';
import type { CkCompRow } from '@/lib/ck/types';

const c = (Grp: string, Total: string, extra: Partial<CkCompRow> = {}): CkCompRow => ({ CompNo: '', CompTxt: '', Grp, Seq: 0, Total, SharePct: '', Curr: 'INR', IsSum: false, IsMemo: false, ...extra });
describe('ckVariance', () => {
  it('compares per piece actual with the CK13N groups', () => {
    const a = { qty: new Decimal(100), rm: new Decimal(1000), pm: new Decimal(500), perf: new Decimal(200), conv: new Decimal(300), landed: new Decimal(2000) };
    const r = ckVariance(a, [c('RM', '10'), c('PM', '4'), c('CONV', '2'), c('OVH', '1'), c('SUM', '17', { IsSum: true }), c('RM', '99', { IsMemo: true })]);
    const by = Object.fromEntries(r.map((x) => [x.key, x]));
    expect(by.RM.actual?.toString()).toBe('12');
    expect(by.RM.variance?.toString()).toBe('2');
    expect(by.PM.variance?.toString()).toBe('1');
    expect(by.CONV.standard.toString()).toBe('3');
    expect(by.TOTAL.actual?.toString()).toBe('20');
    expect(by.TOTAL.variance?.toString()).toBe('3');
  });
  it('has no actual when nothing was produced', () => {
    const r = ckVariance({ qty: new Decimal(0), rm: new Decimal(0), pm: new Decimal(0), perf: new Decimal(0), conv: new Decimal(0), landed: new Decimal(0) }, [c('RM', '5')]);
    expect(r.find((x) => x.key === 'TOTAL')?.actual).toBeNull();
  });
});

import { parseOrderItems } from '@/lib/dash/cdrill';
import { mergeCdrill } from '@/lib/dash/cdrillProgressive';
import type { CdrillRow } from '@/lib/dash/types';
const o = (msg: string, idnrk: string, cost: string): CdrillRow => ({ Grain: 'O', Matnr: '1', Charg: 'B1', Idnrk: idnrk, Maktx: 'x', Mtart: 'ROH', Matkl: '', Cat: 'R', Meins: 'KG', Flag: '', Msg: msg, Orders: 0, SoldQty: '0', ProdQty: '100', Qty: '10', Val: '100', AvgQtyPc: '0.1', AvgCostPc: cost, RmPc: '0', PmPc: '0', PfPc: '0', OthPc: '0' });
describe('production mode order items', () => {
  it('groups per order and survives the window merge', () => {
    const rows = mergeCdrill([[o('000200088101', 'A', '5')], [o('000200088101', 'B', '9'), o('000200088101', 'A', '5')]]);
    const m = parseOrderItems(rows);
    expect(m.get('200088101')?.map((i) => i.matnr)).toEqual(['B', 'A']);
  });
});
