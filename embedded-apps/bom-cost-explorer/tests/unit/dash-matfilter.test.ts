import { describe, expect, it } from 'vitest';
import { buildMarginFilter, buildSalesFilter } from '@/lib/dash/service';

const sel = { plants: [], vkorg: [], vtweg: [], crssku: [], vbeln: [] };
describe('material filters of the dashboard', () => {
  it('margin: materials alone are enough; leading zeros go, several are or-ed', () => {
    const f = buildMarginFilter({ ...sel, matnr: ['000400021009', '400021010'] }, '2026-04-01', '2026-11-23');
    expect(f).toContain("(Matnr eq '400021009' or Matnr eq '400021010')");
    expect(() => buildMarginFilter({ ...sel, matnr: [] }, '2026-04-01', '2026-11-23')).toThrow();
  });
  it('sales: plants plus materials, sales org and channel', () => {
    const f = buildSalesFilter(['UN13'], '2026-04-01', '2026-11-23', { matnr: ['400021009'], vkorg: ['em01'], vtweg: ['10', '20'] });
    expect(f).toContain("Matnr eq '400021009'"); expect(f).toContain("Vkorg eq 'EM01'"); expect(f).toContain("(Vtweg eq '10' or Vtweg eq '20')"); expect(f).toContain("Werks eq 'UN13'");
    expect(buildSalesFilter(['UN13'], '2026-04-01', '2026-11-23')).not.toContain('Matnr');
  });
});
