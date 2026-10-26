import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement } from 'react';
import { buildSelectionFilter } from '@/lib/sap/filter';
// The test transform compiles JSX classically (React.createElement): provide React like the app's runtime does.
(globalThis as unknown as { React: typeof React }).React = React;
import { renderToStaticMarkup } from 'react-dom/server';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { fetchCostLines } from '@/lib/sap/service';
import { defaultQuery } from '@/lib/query/schema';
import { isLeafRow } from '@/lib/cost/tree';
import { BVAT_NOTE, freightBreakupRequest, freightKeyOf, isExcluded, reconcile, breakupLines, selectedRows } from '@/lib/freight/breakup';
import { clearFreightBreakupCache, loadFreightBreakup } from '@/lib/freight/useFreightBreakup';
import type { CostLine, FreightRow } from '@/lib/sap/fields';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'NEXT_PUBLIC_FREIGHT_BREAKUP_ENABLED'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  clearFreightBreakupCache();
  mockRequestLog.length = 0;
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

const set = (u: string) => u.split('?')[0].split('/').pop();
const run = { freightDays: 240, stdFrt: true };
const costQuery = () => ({ ...defaultQuery('B'), materials: ['FG1001'], plants: ['1000'], freightDays: 240, stdFrt: true });

async function costLines() {
  const r = await fetchCostLines(costQuery());
  return r.rows.filter((l) => isLeafRow(l) && l.FrtSrc) as CostLine[];
}

describe('freight break-up: requests', () => {
  it('a BOM costing run makes exactly the same calls as before (no FreightRowSet until a click)', async () => {
    await costLines();
    expect(mockRequestLog.map(set)).toEqual(['CostLineSet']);
  });

  it('a click sends ONE FreightRowSet call: component plant, no look-back limit, StdFrt of the run, LatestOnly true, no "+"', async () => {
    const line = (await costLines())[0];
    mockRequestLog.length = 0;
    const rows = await loadFreightBreakup(freightKeyOf(line, run));
    expect(mockRequestLog).toHaveLength(1);
    const url = decodeURIComponent(mockRequestLog[0]);
    expect(set(mockRequestLog[0])).toBe('FreightRowSet');
    expect(url).toContain("Mode eq 'F'");
    expect(url).toContain(`Matnr eq '${line.Idnrk}'`);
    expect(url).toContain(`Werks eq '${line.Werks}'`);
    expect(url).toContain('FreightDays eq 3650'); // no 180-day restriction, whatever the run held
    expect(url).not.toContain('FreightDays eq 240');
    // StdFrt / LatestOnly are CHAR1 on FreightRowSet: the shared filter function sends 'X' / '' exactly as the Freight screen does
    expect(url).toContain("StdFrt eq 'X'");
    expect(url).toContain("LatestOnly eq 'X'");
    const freightScreen = buildSelectionFilter({ ...defaultQuery('F'), materials: [line.Idnrk], plants: [line.Werks], freightDays: 3650, stdFrt: true, latestOnly: true });
    // the Freight screen's filter plus the finished good of the clicked line
    expect(new URL(`http://x${mockRequestLog[0]}`).searchParams.get('$filter')).toBe(`${freightScreen} and FgMatnr eq '${line.Headmat}'`);
    expect(mockRequestLog[0]).not.toContain('+');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('uses the component plant (Werks), not the costed plant (Hwerks)', () => {
    const req = freightBreakupRequest(freightKeyOf({ Idnrk: 'RM1', Werks: '1100', Hwerks: '1000' } as CostLine, run));
    expect(req.entitySet).toBe('FreightRowSet');
    expect(req.params.$filter).toContain("Werks eq '1100'");
    expect(req.params.$filter).not.toContain("'1000'");
  });

  it('a second click on the same component uses the cache', async () => {
    const line = (await costLines())[0];
    mockRequestLog.length = 0;
    await loadFreightBreakup(freightKeyOf(line, run));
    await loadFreightBreakup(freightKeyOf(line, run));
    expect(mockRequestLog).toHaveLength(1);
    await loadFreightBreakup(freightKeyOf(line, { ...run, freightDays: 90 })); // the run's window no longer matters: same key
    expect(mockRequestLog).toHaveLength(1);
    await loadFreightBreakup(freightKeyOf(line, { ...run, stdFrt: false })); // other freight basis = another key
    expect(mockRequestLog).toHaveLength(2);
  });
});

describe('freight break-up: reconciliation and columns', () => {
  const row = (o: Partial<FreightRow>) => ({ Conditiontype: 'ZFR1', Baseunit: 'KG', Localcurrency: 'INR', Currency: 'INR', Actualdelvquantity: '10', Actualdelvcostamount: '50', ActRate: '5', Stddelvquantity: '10', Stddelvcostamount: '40', StdRate: '4', UsedPcLoc: '0', UsedPcInr: '0', ...o }) as FreightRow;
  const line = (frt: string) => ({ FrtPcLoc: frt, Meins: 'KG', LocCurr: 'INR' }) as CostLine;

  it('matches the cost line exactly', () => {
    const r = reconcile([row({ UsedPcLoc: '1.2000' }), row({ Conditiontype: 'ZFR2', UsedPcLoc: '0.3000' })], line('1.5000'));
    expect(r.matches).toBe(true);
  });
  it('a rounding difference within max(0.01, 0.05 %) still matches', () => {
    expect(reconcile([row({ UsedPcLoc: '1.5049' })], line('1.5000')).matches).toBe(true);
    expect(reconcile([row({ UsedPcLoc: '1000.40' })], line('1000.00')).matches).toBe(true); // 0.05 % of 1000 = 0.5
  });
  it('unit / currency mismatch: no match, the note shows the rows\' unit and currency', () => {
    const r = reconcile([row({ UsedPcLoc: '15.00', Baseunit: 'G', Localcurrency: 'BDT' })], { FrtPcLoc: '1.50', Meins: 'KG', LocCurr: 'INR' } as CostLine);
    expect(r.matches).toBe(false);
    expect(r.rowUnit).toBe('G');
    expect(r.rowCurr).toBe('BDT');
  });
  it('only the freight the costing used is listed (non-zero per piece); none used -> every row', () => {
    const used = row({ Conditiontype: 'ZFR1', UsedPcLoc: '1.2' });
    const unused = row({ Conditiontype: 'ZFR2', UsedPcLoc: '0', UsedPcInr: '0' });
    expect(selectedRows([used, unused])).toEqual([used]);
    expect(selectedRows([unused])).toEqual([unused]);
  });
  it('the Actual / Standard toggle only changes the displayed columns', () => {
    const rows = [row({ UsedPcLoc: '1' })];
    const a = breakupLines(rows, 'ACTUAL');
    const s = breakupLines(rows, 'STANDARD');
    expect(a.lines[0].amount.toNumber()).toBe(50);
    expect(s.lines[0].amount.toNumber()).toBe(40);
    expect(a.totals.pcLoc.eq(s.totals.pcLoc)).toBe(true); // per-piece values are what the costing used either way
  });
});

describe('freight break-up: freight cells', () => {
  const sample = { Idnrk: 'RM1', Werks: '1000', Hwerks: '1000', FrtSrc: 'ACTUAL', FrtPcLoc: '1.2345', FrtPcInr: '1.2345', LocCurr: 'INR' } as CostLine;
  const sim = { changed: false, frtPcInr: { eq: () => true } };

  async function cell(id: string, frun: unknown) {
    const { TREE_COLUMNS } = await import('@/components/BomTree');
    const col = TREE_COLUMNS.find((c) => c.id === id)!;
    return renderToStaticMarkup(createElement('div', null, col.line({ r: sample, s: sim as never, leaf: true, simOn: false, frun: frun as never })));
  }
  const unwrap = (html: string) => html.replace(/<button[^>]*>/, '').replace('</button>', '');

  it('renders the same text as before; the only difference is the button wrapper', async () => {
    for (const id of ['frtPc', 'frtPcInr']) {
      const before = await cell(id, null); // no run = exactly today's markup
      const after = await cell(id, run);
      expect(after).toContain('aria-label="Show freight break-up"');
      expect(unwrap(after)).toBe(before);
    }
  });

  it('no button on a zero freight value', async () => {
    const { TREE_COLUMNS } = await import('@/components/BomTree');
    const col = TREE_COLUMNS.find((c) => c.id === 'frtPc')!;
    const html = renderToStaticMarkup(createElement('div', null, col.line({ r: { ...sample, FrtPcLoc: '0', FrtPcInr: '0' }, s: sim as never, leaf: true, simOn: false, frun: run as never })));
    expect(html).not.toContain('<button');
  });

  it('flag off: no button, no request', async () => {
    process.env.NEXT_PUBLIC_FREIGHT_BREAKUP_ENABLED = 'false';
    vi.resetModules();
    const html = await cell('frtPc', run);
    expect(html).not.toContain('<button');
    expect(mockRequestLog).toHaveLength(0);
  });
});

describe('freight break-up: finished good and BVAT', () => {
  const row = (o: Partial<FreightRow>) => ({ Conditiontype: 'ZFR1', Baseunit: 'KG', Localcurrency: 'INR', Currency: 'INR', Actualdelvquantity: '10', Actualdelvcostamount: '50', ActRate: '5', Stddelvquantity: '10', Stddelvcostamount: '40', StdRate: '4', UsedPcLoc: '0', UsedPcInr: '0', UsedSrc: 'ACTUAL', ...o }) as FreightRow;

  it("FgMatnr eq '<line.Headmat>' on the request; none without a finished good (and a separate cache key)", () => {
    const withFg = freightBreakupRequest(freightKeyOf({ Idnrk: 'RM1', Werks: '1000', Hwerks: '1000', Headmat: 'FG1001' } as CostLine, run));
    expect(withFg.params.$filter).toMatch(/ and FgMatnr eq 'FG1001'$/);
    const without = freightBreakupRequest(freightKeyOf({ Idnrk: 'RM1', Werks: '1000', Hwerks: '1000' } as CostLine, run));
    expect(without.params.$filter).not.toContain('FgMatnr');
  });

  it("rows with UsedSrc 'EXCLUDED' are not summed: totals, reconciliation and the used rows leave them out", () => {
    const rows = [row({ Conditiontype: 'ZFR1', UsedPcLoc: '2', UsedPcInr: '2' }), row({ Conditiontype: 'BVAT', UsedSrc: 'EXCLUDED', Actualdelvcostamount: '30', UsedPcLoc: '1.5', UsedPcInr: '1.5' })];
    expect(isExcluded(rows[1])).toBe(true);
    const { lines, totals } = breakupLines(rows, 'ACTUAL');
    expect(lines[1].excluded).toBe(true);
    expect(totals.pcLoc.toFixed(2)).toBe('2.00');
    expect(totals.amount.toFixed(0)).toBe('50');
    expect(reconcile(rows, { FrtPcLoc: '2', Meins: 'KG', LocCurr: 'INR' } as CostLine).matches).toBe(true);
    expect(selectedRows(rows).map((r) => r.Conditiontype)).toEqual(['ZFR1']);
    expect(BVAT_NOTE).toBe('BVAT counts only when the finished good is in material group 404');
  });
});
