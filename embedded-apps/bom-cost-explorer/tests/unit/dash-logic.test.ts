import { describe, expect, it } from 'vitest';
import { bandOf, brandViews, insights, totals } from '@/lib/dash/logic';
import { buildMisFilter } from '@/lib/dash/service';
import Decimal from 'decimal.js';
import type { MisRow } from '@/lib/dash/types';

const row = (o: Partial<MisRow> = {}): MisRow => ({ Zbrand: '0011', Gjahr: '2026', Version: '03', FgCnt: 2, FgNobud: 0, FtmQty: '10', FtmBudget: '100', FtmActual: '104', FtmActualCmp: '104', YtmQty: '100', YtmBudget: '1000', YtmActual: '1040', YtmActualCmp: '1040', Msg: '', ...o });

describe('MIS logic', () => {
  it('variance is actual minus budget over the finished goods that have a budget; % of budget', () => {
    const [b] = brandViews([row({ YtmActual: '1500', YtmActualCmp: '1040' })]);
    expect(b.ytm.variance.toString()).toBe('40');
    expect(b.ytm.variancePct?.toFixed(2)).toBe('4.00');
    expect(b.ytm.actual.toString()).toBe('1500');       // the full actual stays visible
    expect(b.band).toBe('red');
  });
  it('bands: above 3 red, above 2 amber, else good; none without a budget', () => {
    expect([new Decimal(3.1), new Decimal(2.5), new Decimal(2), null].map((v) => bandOf(v))).toEqual(['red', 'amber', 'good', 'none']);
    expect(brandViews([row({ YtmBudget: '0', YtmActualCmp: '0' })])[0].band).toBe('none');
  });
  it('totals add the brands; % from the summed budget', () => {
    const t = totals(brandViews([row(), row({ Zbrand: '0001', YtmBudget: '500', YtmActualCmp: '490' })]));
    expect(t.ytm.budget.toString()).toBe('1500');
    expect(t.ytm.variance.toString()).toBe('30');
    expect(t.ytm.variancePct?.toFixed(1)).toBe('2.0');
  });
  it('rule-based notes: summary, red/amber brands, brands with finished goods that have no budget', () => {
    const n = insights(brandViews([row({ YtmActualCmp: '1100', FgNobud: 1 })]));
    expect(n.map((x) => x.type)).toEqual(['Summary', 'Variance', 'Coverage']);
    expect(n[1].text).toContain('10.0 %');
    expect(n[2].text).toContain('1 of 2');
  });
});

describe('MIS filter', () => {
  it('plants are or-ed, the date is a datetime literal', () => {
    expect(buildMisFilter(['un13', 'un08'], '2026-11-18')).toBe("(Werks eq 'UN13' or Werks eq 'UN08') and DateTo eq datetime'2026-11-18T00:00:00'");
  });
  it('refuses no plant, a bad plant and a bad date', () => {
    expect(() => buildMisFilter([], '2026-11-18')).toThrow();
    expect(() => buildMisFilter(['UN1'], '2026-11-18')).toThrow();
    expect(() => buildMisFilter(['UN13'], '18/11/2026')).toThrow();
  });
});
