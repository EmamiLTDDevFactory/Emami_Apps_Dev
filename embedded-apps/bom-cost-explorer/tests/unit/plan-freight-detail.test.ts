import { describe, expect, it } from 'vitest';
import { analyseComp, planFreightCalc, rangeOf } from '@/lib/plan/freightDetail';
import type { FreightRow } from '@/lib/sap/fields';
import type { PlanCostLine } from '@/lib/plan/fields';

const po = (o: Partial<FreightRow>): FreightRow => ({
  RowId: 0, Bukrs: '', FgMatnr: '', Lifnr: 'V1', Name1: 'Carrier', Belnr: '', Xblnr: '', Ztmode: 'ROAD', GstPart: '', PlcSup: 'KOLKATA', Material: '000000000100001', Matdesc: '', Plant: 'UN13', Conditiontype: 'ZFR1', Purchasedocument: '4500000001', Purchaseline: '00010', Podate: '2026-09-10',
  Baseunit: 'KG', Matuom: 'KG', Currency: 'INR', Localcurrency: 'INR', Actualdelvquantity: '100', Actualdelvcostamount: '110', ActRate: '1.1',
  Stddelvquantity: '100', Stddelvcostamount: '100', StdRate: '1', UsedSrc: 'ACTUAL', UsedRate: '1.1', UsedRatePc: '1.1', FxFactor: '1', UsedPcLoc: '1.1', FxInr: '1', UsedPcInr: '1.1', ...o,
} as FreightRow);
const range = { from: '2026-09-01', to: '2026-09-30' };

describe('plan component freight (Freight analysis for one component)', () => {
  it('matches the material however SAP spells it and weights actual vs standard per unit', () => {
    const r = analyseComp({ material: '100001', plant: 'UN13', text: 'RM', mtart: 'ROH' }, [
      po({}),
      po({ Purchaseline: '00020', Podate: '2026-09-20', Actualdelvquantity: '300', Actualdelvcostamount: '300', Stddelvquantity: '300', Stddelvcostamount: '300' }),
      po({ Purchaseline: '00030', Podate: '2026-08-01' }), // outside the range
    ], range);
    expect(r.lines.map((l) => l.line)).toEqual(['00020', '00010']);
    expect(r.lines[1].variancePct!.toFixed(1)).toBe('10.0');
    expect(r.lines[1].vendorName).toBe('Carrier');
    expect(r.summary!.actual!.toFixed(4)).toBe('1.0250');
    expect(r.summary!.standard!.toFixed(4)).toBe('1.0000');
  });
  it('carries the freight per unit to the FG piece and the plan value', () => {
    const c = planFreightCalc({ FrtPcInr: '2', Meins: 'KG', QtyTot: '50', PlanQty: '1000' } as unknown as PlanCostLine);
    expect([c.perUnit.toString(), c.qtyPerFg!.toString(), c.perFg!.toString(), c.planValue.toString()]).toEqual(['2', '0.05', '0.1', '100']);
    expect(planFreightCalc({ FrtPcInr: '2', Meins: 'KG', QtyTot: '50', PlanQty: '0' } as unknown as PlanCostLine).perFg).toBeNull();
  });
  it('builds the PO-date range from today', () => {
    expect(rangeOf(12, new Date(2026, 10, 27))).toEqual({ from: '2025-11-27', to: '2026-11-27' });
  });
});
