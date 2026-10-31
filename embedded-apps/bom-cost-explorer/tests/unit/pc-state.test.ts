import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PC, decodePc, encodePc, pcBatchKey, pcCtx, pcQuery, pcReady, planPriceBatches, type PriceContextState } from '@/lib/price-context/state';
import { CK_ENABLED } from '@/lib/ck/flag';
import { COGM_SO_ENABLED, SO_STALE_DAYS } from '@/lib/so/flag';
import { PRICE_CONTEXT_ENABLED, adminOnlyNav } from '@/lib/price-context/flag';
import { fetchSoMerged, isUsable } from '@/lib/so/service';
import { fetchCk } from '@/lib/ck/service';
import { fetchCogm } from '@/lib/so/service';
import { FilterError } from '@/lib/sap/filter';

const on: PriceContextState = { ...DEFAULT_PC, on: true, vkorg: ['1000'] };

describe('price context state', () => {
  it('encodes only what differs from the default, round-trips and survives junk', () => {
    expect(encodePc(DEFAULT_PC)).toBe('');
    const s: PriceContextState = { on: true, vkorg: ['1000', '2000'], vtweg: ['10'], segment: ['DOM'], days: 60, auart: { in: ['ZOD1'], ex: [] }, pstyv: { in: [], ex: ['TAN'] }, kdgrp: { in: [], ex: [] }, kunnr: { in: [], ex: ['C1'] } };
    expect(decodePc(encodePc(s))).toEqual(s);
    expect(decodePc('not json')).toEqual(DEFAULT_PC);
    expect(decodePc(null)).toEqual(DEFAULT_PC);
    expect(decodePc('{"d":-5}').days).toBe(90);
  });
  it('is ready only with the switch on AND a sales organisation', () => {
    expect(pcReady(DEFAULT_PC)).toBe(false);
    expect(pcReady({ ...DEFAULT_PC, on: true })).toBe(false);
    expect(pcReady({ ...DEFAULT_PC, vkorg: ['1000'] })).toBe(false);
    expect(pcReady(on)).toBe(true);
  });
  it('no request while off, none without a sales organisation, none without finished goods', () => {
    expect(planPriceBatches(DEFAULT_PC, ['A'])).toEqual([]);
    expect(planPriceBatches({ ...DEFAULT_PC, on: true }, ['A'])).toEqual([]);
    expect(planPriceBatches(on, [])).toEqual([]);
    expect(planPriceBatches(on, ['', ' '])).toEqual([]);
  });
  it('one call per material set: duplicates dropped, order independent, batches of 50', () => {
    expect(planPriceBatches(on, ['B', 'A', 'B'])).toEqual([['A', 'B']]);
    expect(pcBatchKey(on, ['A', 'B'])).toBe(pcBatchKey(on, planPriceBatches(on, ['B', 'A'])[0]));
    const many = Array.from({ length: 101 }, (_, i) => `M${String(i).padStart(3, '0')}`);
    expect(planPriceBatches(on, many).map((b) => b.length)).toEqual([50, 50, 1]);
    expect(planPriceBatches(on, many).flat().sort()).toEqual(many);
  });
  it('the cache key depends on the context; the run key does not depend on the materials', () => {
    expect(pcBatchKey(on, ['A'])).not.toBe(pcBatchKey({ ...on, days: 30 }, ['A']));
    expect(pcBatchKey(on, ['A'])).not.toBe(pcBatchKey({ ...on, auart: { in: [], ex: ['ZONL'] } }, ['A']));
    expect(pcCtx(on)).toBe(pcCtx(on));
    expect(pcQuery(on, ['A']).materials).toEqual(['A']);
    expect(pcBatchKey(on, ['A'])).toContain("MatnrIn eq 'A'");
  });
});

describe('flags and admin-only', () => {
  it('everything is off by default', () => {
    expect(CK_ENABLED).toBe(false);
    expect(COGM_SO_ENABLED).toBe(false);
    expect(PRICE_CONTEXT_ENABLED).toBe(false);
    expect(SO_STALE_DAYS).toBe(60);
    expect(adminOnlyNav(false, true)).toBe(false);
    expect(adminOnlyNav(true, false)).toBe(false);
    expect(adminOnlyNav(true, true)).toBe(true);
  });
});

vi.mock('@/lib/sap/client', async (orig) => ({ ...(await orig<typeof import('@/lib/sap/client')>()), sapGetCollection: vi.fn() }));
import { sapGetCollection } from '@/lib/sap/client';
const get = vi.mocked(sapGetCollection);
afterEach(() => get.mockReset());
const reply = (rows: Record<string, unknown>[]) => ({ rows, count: null, messages: [], ms: 7, sapMessageHeader: false, status: 200 });

describe('services (inline fixtures, no SAP)', () => {
  it('SoPriceSet for 120 materials: three calls of 50 / 50 / 20, one after the other, merged', async () => {
    get.mockImplementation(async (_set, params) => {
      const ms = Array.from(String(params.$filter).matchAll(/MatnrIn eq '(\w+)'/g), (m) => m[1]);
      return reply(ms.map((m) => ({ Matnr: m, Vkorg: '1000', Sp: '10.5', Mrp: '12', Msg: '' })));
    });
    const many = Array.from({ length: 120 }, (_, i) => `M${i}`);
    const r = await fetchSoMerged('PRICE', { materials: many, vkorg: ['1000'] });
    expect(get).toHaveBeenCalledTimes(3);
    expect(r.rows).toHaveLength(120);
    expect(r.rows.map((x) => x.Matnr)).toEqual(many);
    expect(get.mock.calls.map((c) => String(c[1].$filter).match(/MatnrIn eq/g)?.length ?? 0).join()).toBe('50,50,20');
  });
  it('every request is made without a time limit (noTimeout) and carries the caller\'s abort signal', async () => {
    get.mockResolvedValue(reply([]));
    const ctl = new AbortController();
    await fetchCk('LIST', { matnr: 'M', werks: 'UN13' }, { signal: ctl.signal });
    await fetchSoMerged('PRICE', { materials: ['M'], vkorg: ['1000'] }, { signal: ctl.signal });
    await fetchCogm({ materials: ['M'], vkorg: ['1000'] }, { signal: ctl.signal });
    expect(get).toHaveBeenCalledTimes(3);
    for (const c of get.mock.calls) {
      expect(c[2]).toMatchObject({ noTimeout: true, signal: ctl.signal });
      expect(c[2]).not.toHaveProperty('timeoutMs');
    }
  });
  it('an invalid selection is refused before any request', async () => {
    await expect(fetchCk('HEADER', { matnr: 'M' })).rejects.toThrow(FilterError);
    await expect(fetchSoMerged('PRICE', { materials: [], vkorg: ['1000'] })).resolves.toMatchObject({ rows: [] });
    expect(get).not.toHaveBeenCalled();
  });
  it('a stopped batch run stops before the next batch', async () => {
    const ctl = new AbortController();
    get.mockImplementation(async () => { ctl.abort(); return reply([{ Matnr: 'M0' }]); });
    const r = await fetchSoMerged('PRICE', { materials: Array.from({ length: 120 }, (_, i) => `M${i}`), vkorg: ['1000'] }, { signal: ctl.signal });
    expect(get).toHaveBeenCalledTimes(1);
    expect(r.rows).toHaveLength(1);
  });
  it('a CK header message and a price row without a usable order become warnings (never failures); Sp = 0 with a message is "no usable order"', async () => {
    get.mockResolvedValueOnce(reply([{ Matnr: 'M', Msg: 'Standard price differs from the estimate' }]));
    expect((await fetchCk('HEADER', { matnr: 'M', werks: 'UN13' })).messages).toEqual([{ code: '', message: 'Standard price differs from the estimate', severity: 'warning' }]);
    get.mockResolvedValueOnce(reply([{ Matnr: 'M', Sp: '0.0', Mrp: '0', Msg: 'No order in the last 90 days' }, { Matnr: 'N', Sp: '9', Mrp: '10', Msg: 'ok info' }]));
    const r = await fetchSoMerged('PRICE', { materials: ['M', 'N'], vkorg: ['1000'] });
    expect(r.messages.map((m) => m.message)).toEqual(['No order in the last 90 days']);
    expect(isUsable(r.rows[0])).toBe(false);
    expect(isUsable(r.rows[1])).toBe(true);
    expect(isUsable({ Sp: '0', Msg: '' })).toBe(true);
  });
});
