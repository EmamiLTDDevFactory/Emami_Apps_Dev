import { describe, expect, it } from 'vitest';
import { compareFreight, compareTotals } from '@/lib/freight/compare';
import { leaf, parent } from './helpers';

// FG1 in plant 1000: RM1 (ROH) and PM1 (PKGN); explosion quantity 2 pieces
const lines = (frtRm: string, frtPm: string) => [
  parent(1, 0, 'FG1', '0'),
  leaf(2, 1, 'RM1', '100', frtRm, '2', { Mtart: 'ROH', Matkl: '101' }),
  leaf(3, 1, 'PM1', '20', frtPm, '4', { Mtart: 'PKGN', Matkl: '202' }),
];

describe('compareFreight', () => {
  it('freight per FG piece, actual vs standard, with category and component break-up', () => {
    const [r] = compareFreight(lines('12', '3'), lines('10', '3'), '2');
    // RM1: 2 x 12 / 2 = 12 actual, 10 standard; PM1: 4 x 3 / 2 = 6 both
    expect(r.actual.toFixed(2)).toBe('18.00');
    expect(r.standard.toFixed(2)).toBe('16.00');
    expect(r.delta.toFixed(2)).toBe('2.00');
    expect(r.deltaPct?.toFixed(1)).toBe('12.5');
    expect(r.byCategory.RM.actual.toFixed(2)).toBe('12.00');
    expect(r.byCategory.PM.standard.toFixed(2)).toBe('6.00');
    expect(r.components.map((c) => c.idnrk)).toEqual(['RM1', 'PM1']); // biggest gap first
  });

  it('lines without freight are left out of the component list; totals count above / below', () => {
    const a = compareFreight(lines('0', '3'), lines('0', '5'), '2');
    expect(a[0].components.map((c) => c.idnrk)).toEqual(['PM1']);
    const t = compareTotals([...a, ...compareFreight(lines('12', '3'), lines('10', '3'), '2')]);
    expect(t.rows).toBe(2);
    expect(t.under).toBe(1);
    expect(t.over).toBe(1);
  });

  it('standard 0 gives no percentage; a line missing from the standard run counts as 0 there', () => {
    const [r] = compareFreight(lines('12', '3'), [parent(1, 0, 'FG1', '0')], '2');
    expect(r.standard.isZero()).toBe(true);
    expect(r.deltaPct).toBeNull();
  });
});
