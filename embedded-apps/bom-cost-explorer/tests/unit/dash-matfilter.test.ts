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

describe('sales: all plants', () => {
  it('blank plants send no plant filter; the PVM bridge still needs one', async () => {
    const { buildSalesFilter } = await import('@/lib/dash/service');
    const f = buildSalesFilter([], '2026-04-01', '2026-11-24', { vkorg: ['EM01'] });
    expect(f).not.toContain('Werks');
    expect(f).toContain("Vkorg eq 'EM01'");
    expect(() => buildSalesFilter([], '2026-04-01', '2026-11-24', { requirePlant: true })).toThrow();
  });
});

describe('MIS finished-good detail', () => {
  it('reads the same set with Grain eq F', async () => {
    const { DASH_MIS_FG_FIELDS } = await import('@/lib/dash/fields');
    expect(Object.keys(DASH_MIS_FG_FIELDS)).toEqual(expect.arrayContaining(['Zbrand', 'Matnr', 'BudPc', 'ActPc', 'BudSrc', 'Grain']));
  });
});

describe('sales: invoice number and invoice list', () => {
  it('adds the invoice filter and refuses an unnarrowed invoice list', async () => {
    const { buildSalesFilter, fetchSalesInvoices } = await import('@/lib/dash/service');
    expect(buildSalesFilter([], '2026-04-01', '2026-11-24', { vbeln: ['90046171'] })).toContain("Vbeln eq '90046171'");
    expect(() => buildSalesFilter([], '2026-04-01', '2026-11-24', { vbeln: ['12AB'] })).toThrow();
    expect(() => fetchSalesInvoices([], '2026-04-01', '2026-11-24', {})).toThrow();
  });
});

describe('BOM plants of the chosen materials', () => {
  it('asks SAP per material and groups the answer by plant, most materials first', async () => {
    const { bomPlantsRequest, groupBomPlants } = await import('@/lib/client/bomPlants');
    expect(bomPlantsRequest(['000400010469', 'FG2']).params.$filter).toBe("(Matnr eq '400010469' or Matnr eq 'FG2')");
    const g = groupBomPlants([
      { Matnr: '000000000400010469', Werks: 'UN13', Stlal: '1', Name1: 'Pachoria', Stlan: '1', Stlnr: '1', Stlst: '01' },
      { Matnr: '400010469', Werks: 'UN13', Stlal: '2', Name1: 'Pachoria', Stlan: '1', Stlnr: '1', Stlst: '01' },
      { Matnr: 'FG2', Werks: 'UN13', Stlal: '1', Name1: 'Pachoria', Stlan: '1', Stlnr: '2', Stlst: '01' },
      { Matnr: 'FG2', Werks: 'UN02', Stlal: '1', Name1: 'Guwahati', Stlan: '1', Stlnr: '3', Stlst: '01' },
    ]);
    expect(g.map((x) => x.werks)).toEqual(['UN13', 'UN02']);
    expect(g[0].materials).toEqual(['400010469', 'FG2']); expect(g[0].alternatives).toBe(3);
  });
});
