import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sap/client', async (orig) => ({ ...(await orig<typeof import('@/lib/sap/client')>()), sapGetCollection: vi.fn() }));
import { sapGetCollection } from '@/lib/sap/client';
import { fetchCogm, fetchSo, fetchSoMerged, isUsable } from '@/lib/so/service';

const mocked = vi.mocked(sapGetCollection);
const resp = (rows: Record<string, unknown>[], messages: { code: string; message: string; severity: 'warning' }[] = []) => ({ rows, count: null, messages, ms: 7, sapMessageHeader: messages.length > 0, status: 200 });
beforeEach(() => { mocked.mockReset(); }); // braces: a returned function would be run by vitest as a cleanup hook

describe('fetchSoMerged', () => {
  it('splits 120 materials into calls of 50, one after the other, and merges rows and messages', async () => {
    const mats = Array.from({ length: 120 }, (_, i) => `M${String(i).padStart(3, '0')}`);
    mocked.mockImplementation(async (_set, params) => {
      const f = String(params.$filter);
      const n = (f.match(/MatnrIn eq/g) ?? []).length;
      return resp(Array.from({ length: n }, (_, i) => ({ Matnr: `R${n}-${i}`, Sp: '10.5', Mrp: '12', Curr: 'INR', Uom: 'PC', Msg: '' })), [{ code: '', message: 'Orders were skipped', severity: 'warning' }]);
    });
    const r = await fetchSoMerged('PRICE', { materials: mats, vkorg: ['1000'], daysBack: 90 });
    expect(mocked).toHaveBeenCalledTimes(3);
    const sizes = mocked.mock.calls.map(([, p]) => (String(p.$filter).match(/MatnrIn eq/g) ?? []).length);
    expect(sizes).toEqual([50, 50, 20]);
    expect(r.rows).toHaveLength(120);
    expect(r.ms).toBe(21);
    expect(r.messages.filter((m) => m.message === 'Orders were skipped')).toHaveLength(1); // the same message once
    expect(r.rows[0].Sp).toBe('10.5');
  });
  it('duplicates in the material list are sent once; an empty list makes no call', async () => {
    mocked.mockResolvedValue(resp([]));
    await fetchSoMerged('PRICE', { materials: ['A', 'A', ' A '], vkorg: ['1000'] });
    expect(String(mocked.mock.calls[0][1].$filter).match(/MatnrIn eq/g)).toHaveLength(1);
    mocked.mockClear();
    const r = await fetchSoMerged('PRICE', { materials: [], vkorg: ['1000'] });
    expect(mocked).not.toHaveBeenCalled();
    expect(r.rows).toEqual([]);
  });
  it('stops between batches when the caller aborts', async () => {
    const ctl = new AbortController();
    mocked.mockImplementation(async () => { ctl.abort(); return resp([{ Matnr: 'X' }]); });
    const r = await fetchSoMerged('PRICE', { materials: Array.from({ length: 120 }, (_, i) => `M${i}`) }, { signal: ctl.signal });
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(r.rows).toHaveLength(1);
  });
});

describe('no time limit, nothing recomputed', () => {
  it('every request is made with noTimeout and no timeoutMs, and passes only the caller\'s signal', async () => {
    mocked.mockResolvedValue(resp([]));
    const ctl = new AbortController();
    await fetchSo('PRICE', { materials: ['A'] }, { signal: ctl.signal });
    await fetchSo('AREA', { materials: ['A'] }, { signal: ctl.signal });
    await fetchSo('COND', {}, { signal: ctl.signal });
    await fetchCogm({ materials: ['A'], vkorg: ['1000'] }, { signal: ctl.signal });
    expect(mocked).toHaveBeenCalledTimes(4);
    for (const [, , opts] of mocked.mock.calls) {
      expect(opts?.noTimeout).toBe(true);
      expect(opts && 'timeoutMs' in opts).toBe(false);
      expect(opts?.signal).toBe(ctl.signal);
    }
  });
  it('no "+" in any filter sent to SAP', async () => {
    mocked.mockResolvedValue(resp([]));
    await fetchSo('PRICE', { materials: ['A B'], vkorg: ['1000'], auart: { in: ['X Y'], ex: [] }, daysBack: 90 });
    expect(String(mocked.mock.calls[0][1].$filter)).not.toContain('+');
  });
  it('the COND set sends no $filter at all', async () => {
    mocked.mockResolvedValue(resp([]));
    await fetchSo('COND', {});
    expect(mocked.mock.calls[0][1]).not.toHaveProperty('$filter');
    expect(typeof (mocked.mock.calls[0][1] as Record<string, string>).$select).toBe('string'); // $select on every set read
  });
  it('a row-level Msg of an unusable price row becomes a warning; SAP values are passed through untouched', async () => {
    mocked.mockResolvedValue(resp([{ Matnr: 'A', Sp: '0.0000', Mrp: '0', Msg: 'No sales order with a selling price condition' }, { Matnr: 'B', Sp: '149.0000', Mrp: '175.0000', Msg: '' }]));
    const r = await fetchSo('PRICE', { materials: ['A', 'B'] });
    expect(r.messages.some((m) => /No sales order/.test(m.message) && m.severity === 'warning')).toBe(true);
    expect(r.rows[1].Sp).toBe('149');
    expect(r.rows[1].Mrp).toBe('175');
    expect(isUsable(r.rows[0])).toBe(false);
    expect(isUsable(r.rows[1])).toBe(true);
  });
  it('a failed call rejects with SAP\'s message and is not retried here', async () => {
    mocked.mockRejectedValue(new Error('Select at most 50 materials'));
    await expect(fetchSo('PRICE', { materials: ['A'] })).rejects.toThrow(/at most 50/);
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});

describe('fetchCogm', () => {
  it('runs 25 finished goods per call, one after the other, and reports each batch', async () => {
    mocked.mockImplementation(async (_s, params) => resp(Array.from({ length: (String(params.$filter).match(/Matnr eq/g) ?? []).length }, (_, i) => ({ Matnr: `M${i}`, Curr: 'INR', CogmStd: '10', RatioStd: '0.4', Msg: '' }))));
    const seen: number[] = [];
    const r = await fetchCogm({ materials: Array.from({ length: 60 }, (_, i) => `M${i}`), vkorg: ['1000'] }, { onBatch: (rows) => seen.push(rows.length) });
    expect(mocked).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([25, 50, 60]);
    expect(r.rows).toHaveLength(60);
    expect(r.rows[0].RatioStd).toBe('0.4'); // SAP's ratio, untouched
    expect(String(mocked.mock.calls[0][1].$filter)).toContain("PriceSrcIn eq 'O'");
  });
});

describe('sales areas on a SAP that does not know OnlyOrd yet', () => {
  it('the list is read again without OnlyOrd (once); any other error is not retried', async () => {
    const { SapError } = await import('@/lib/sap/client');
    mocked.mockRejectedValueOnce(new SapError('Property OnlyOrd not found in type SoAreaVH', 'http', 400, [], 400)).mockResolvedValueOnce(resp([{ Vkorg: 'EM01', Vtweg: '10' }]));
    const r = await fetchSo('AREA', { daysBack: 90, onlyOrd: true });
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(String(mocked.mock.calls[0][1].$filter)).toContain("OnlyOrd eq 'X'");
    expect(String(mocked.mock.calls[1][1].$filter)).not.toContain('OnlyOrd');
    expect(r.rows).toHaveLength(1);
    mocked.mockReset();
    mocked.mockRejectedValueOnce(new SapError('boom', 'http', 500, [], 500));
    await expect(fetchSo('AREA', { daysBack: 90, onlyOrd: true })).rejects.toThrow('boom');
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});

describe('sales areas with OnlyOrd but no order (or no material)', () => {
  it('an empty answer is read again without OnlyOrd, with or without materials, so a sales organisation can always be picked', async () => {
    mocked.mockReset();
    mocked.mockResolvedValueOnce(resp([])).mockResolvedValueOnce(resp([{ Vkorg: 'EM01', Vtweg: '10' }]));
    const r = await fetchSo('AREA', { daysBack: 90, onlyOrd: true });
    expect(mocked).toHaveBeenCalledTimes(2); expect(String(mocked.mock.calls[1][1].$filter)).not.toContain('OnlyOrd'); expect(r.rows).toHaveLength(1);
    mocked.mockReset();
    mocked.mockResolvedValueOnce(resp([])).mockResolvedValueOnce(resp([{ Vkorg: 'EM03', Vtweg: '50' }]));
    const m = await fetchSo('AREA', { materials: ['400020106'], daysBack: 90, onlyOrd: true });
    expect(mocked).toHaveBeenCalledTimes(2); expect(m.rows).toHaveLength(1);
    expect(m.messages.some((x) => /No sales orders for these materials/.test(x.message))).toBe(true);
  });
  it('a non-empty answer is used as it is (one call)', async () => {
    mocked.mockReset();
    mocked.mockResolvedValueOnce(resp([{ Vkorg: 'EM03', Vtweg: '50' }]));
    await fetchSo('AREA', { materials: ['A'], daysBack: 90, onlyOrd: true });
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});
