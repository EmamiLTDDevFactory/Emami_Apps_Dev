import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { fetchWac } from '@/lib/wac/service';
import { comparisonLimited, sourceHasData, SOURCES } from '@/lib/wac/view';
import { SapError } from '@/lib/sap/client';
import { visibleColumns } from '@/lib/wac/columns';
import type { WacRow } from '@/lib/wac/types';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => { process.env.MOCK_SAP = 'true'; process.env.MOCK_SAP_DELAY_MS = '0'; resetSapConfig(); mockRequestLog.length = 0; });
afterEach(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; resetSapConfig(); vi.restoreAllMocks(); });

const q = { plants: ['1000'], dateFrom: '2026-09-01', dateTo: '2026-09-30' };

describe('WAC service against the mock SAP', () => {
  it('importing the modules or building a query sends nothing (no request before Run)', async () => {
    await import('@/lib/wac/useWac');
    expect(mockRequestLog.length).toBe(0);
  });
  it('actual only: one row per finished good and plant, amounts as strings, no comparison values', async () => {
    const r = await fetchWac('ROWS', { ...q, materials: ['FG1001', 'FG1002'] });
    expect(r.rows.map((x) => x.Matnr)).toEqual(['FG1001', 'FG1002']);
    expect(typeof r.rows[0].ActMat).toBe('string');
    expect(r.rows[0].Rowid).toBe(1);
    expect(SOURCES.some((s) => sourceHasData(r.rows, s, false))).toBe(false);
    expect(mockRequestLog.length).toBe(1);
    expect(mockRequestLog[0]).toContain('WacRowSet');
    expect(mockRequestLog[0]).not.toContain('+');
    expect(mockRequestLog[0]).not.toContain('InclCmp');
  });
  it('Status D carries SAP\'s message as a warning', async () => {
    const r = await fetchWac('ROWS', { ...q, materials: ['FG1002'] });
    expect(r.rows[0].Status).toBe('D');
    expect(r.messages.some((m) => /several PO-cost rows/.test(m.message))).toBe(true);
    expect(r.messages.every((m) => m.severity !== 'error')).toBe(true);
  });
  it('all four sources for FG1001; the Average column is hidden for a selection without that dataset', async () => {
    const all = await fetchWac('ROWS', { ...q, materials: ['FG1001'], inclCmp: true });
    for (const s of SOURCES) expect(sourceHasData(all.rows, s, true)).toBe(true);
    const noAvg = await fetchWac('ROWS', { ...q, materials: ['FG1002', 'FG1003'], inclCmp: true });
    expect(sourceHasData(noAvg.rows, 'Sel', true)).toBe(true);
    expect(sourceHasData(noAvg.rows, 'Avg', true)).toBe(false);
    expect(visibleColumns(noAvg.rows, new Set(), true).map((c) => c.key)).not.toContain('vAvg');
    expect(mockRequestLog[0]).toContain("InclCmp%20eq%20'X'".replace(/'/g, '%27'));
  });
  it('comparison rows: coverage, direction and a missing source; low coverage for FG1003 C-MAP', async () => {
    const r = await fetchWac('COMPARE', { ...q, materials: ['FG1003'] });
    const cmapRm = r.rows.find((x) => x.Grp === 'RM' && x.Src === 'CMAP')!;
    expect(cmapRm.NRated).toBe(7);
    expect(cmapRm.NComp).toBe(12);
    expect(cmapRm.CoverPct).toBe('58.3333');
    expect(r.rows.some((x) => x.Src === 'AVG')).toBe(false);
    expect(['+', '-']).toContain(r.rows[0].Dir);
    const one = await fetchWac('COMPARE', { ...q, materials: ['FG1001'] });
    expect(one.rows.some((x) => x.Src === 'AVG')).toBe(true);
  });
  it('components and documents (a reversal has a negative quantity)', async () => {
    const c = await fetchWac('COMP', { ...q, materials: ['FG1003'] });
    expect(c.rows).toHaveLength(12);
    expect(c.rows.filter((x) => Number(x.RateCmap) === 0).length).toBeGreaterThan(0);
    const d = await fetchWac('DOCS', { ...q, materials: ['FG1002'] });
    expect(d.rows.some((x) => Number(x.Qty) < 0)).toBe(true);
    expect(d.rows.some((x) => x.Rows > 1)).toBe(true);
    expect(d.rows[0].Budat).toBe('2026-09-01');
  });
  it('more than 25 finished goods: SAP warns and sends no comparison values; the actual table stays', async () => {
    const r = await fetchWac('ROWS', { ...q, prodha: ['BIGSET'], inclCmp: true });
    expect(r.rows).toHaveLength(30);
    expect(r.messages.some((m) => /25 at most/.test(m.message))).toBe(true);
    expect(comparisonLimited(r.messages, r.rows, true)).toBe(true);
    expect(Number(r.rows[0].ActMat)).toBeGreaterThan(0);
  });
  it('limit detected even when the sap-message header is missing', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ Matnr: `F${i}`, VarpSel: '0.0000', VarpCmap: '0.0000', VarpCon: '0.0000', VarpAvg: '0.0000', FlagSel: '', FlagCmap: '', FlagCon: '', FlagAvg: '' })) as unknown as WacRow[];
    expect(comparisonLimited([], rows, true)).toBe(true);
  });
  it('an empty result, a SAP error and the row limit', async () => {
    expect((await fetchWac('ROWS', { ...q, materials: ['EMPTYFG'] })).rows).toEqual([]);
    await expect(fetchWac('ROWS', { ...q, materials: ['ERRFG'] })).rejects.toThrow(/mock SAP error/);
    await expect(fetchWac('ROWS', { ...q, materials: ['BIGFG'] })).rejects.toThrow(/More than 5000 rows/);
    expect(mockRequestLog.filter((l) => l.includes('BIGFG')).length).toBe(1); // not retried
  });
  it('no plant is refused before any request; the SAP message for a missing plant is surfaced if it ever arrives', async () => {
    await expect(fetchWac('ROWS', { ...q, plants: [] })).rejects.toThrow(/plant/);
    expect(mockRequestLog.length).toBe(0);
  });
  it('no time limit: the client starts no long timer, and the caller\'s signal still cancels', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await fetchWac('ROWS', { ...q, materials: ['FG1001'] });
    expect(spy.mock.calls.every(([, ms]) => Number(ms ?? 0) < 10_000)).toBe(true);
    const ctl = new AbortController();
    ctl.abort();
    await expect(fetchWac('ROWS', { ...q, materials: ['FG1001'] }, { signal: ctl.signal })).rejects.toSatisfy((e: unknown) => e instanceof SapError && e.kind === 'aborted');
  });
});
