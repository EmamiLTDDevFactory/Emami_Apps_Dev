import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WacRow } from '@/lib/wac/types';
import type { SoPriceRow } from '@/lib/so/types';

const so = vi.hoisted(() => ({ fetchSo: vi.fn() }));
const wac = vi.hoisted(() => ({ fetchWac: vi.fn() }));
vi.mock('@/lib/so/service', () => ({ fetchSo: so.fetchSo, fetchSoMerged: vi.fn() }));
vi.mock('@/lib/wac/service', async (orig) => ({ ...(await orig<typeof import('@/lib/wac/service')>()), fetchWac: wac.fetchWac }));

import { buildReport, cogmOf, cogmPending, COGM_PENDING_NOTE, ratioWhy, withoutPrice } from '@/lib/psum/report';
import { PRICE_PARALLEL, fetchReportPrices, priceBatches, priceQuery, REPORT_PRICE_SELECT, type PriceFilters } from '@/lib/psum/reportPrices';
import { fetchRows, reportSelect, type ReportQuery } from '@/lib/psum/useReport';
import { buildSoFilter } from '@/lib/so/filter';
import { EMPTY_LIST } from '@/lib/so/types';

const fg = (p: Partial<WacRow> = {}): WacRow => ({ Rowid: 1, Matnr: 'A', Maktx: '', Werks: 'UB01', Mtart: 'FERT', Zbrand: '', Prodha: '', Zskugrcodecrs: '', Zskugroupcrs: '', Uom: 'PC', Docs: 1, Batches: 1, DupDocs: 0, Qty: '10', ActRm: '1', ActPm: '1', ActPerf: '1', ActMat: '3', ActConv: '2', ActLanded: '99', ActRecon: '94', ActCogm: '5', VarpSel: '', VarpCmap: '', VarpCon: '', VarpAvg: '', FlagSel: '', FlagCmap: '', FlagCon: '', FlagAvg: '', Status: '', Msg: '', ...p });
const pr = (p: Partial<SoPriceRow> = {}): SoPriceRow => ({ Matnr: 'A', Maktx: '', Vkorg: 'EM01', Vtweg: '10', Auart: 'ZOD1', AuartTxt: '', Segment: 'DOM', SegTxt: '', Kalsm: '', KalsmTxt: '', Curr: 'INR', Uom: 'PC', Werks: '', Mrp: '10', Sp: '8', NetPrice: '', SpCond: '', Vbeln: '1', Posnr: '10', Kunnr: '', Audat: '2026-10-01', DaysOld: 3, NOrders: 1, NSkip: 0, Src: '', Msg: '', ...p } as SoPriceRow);
const F: PriceFilters = { vkorg: ['EM01', 'EM02'], vtweg: ['10'], segment: ['DOM'], auart: { in: ['ZOD1'], ex: [] }, pstyv: EMPTY_LIST, kdgrp: EMPTY_LIST, kunnr: EMPTY_LIST, days: 90 };

describe('COGM is ActCogm and never ActLanded', () => {
  it('the COGM of a row is ActCogm; the ratios use it', () => {
    const r = buildReport([fg()], [pr()], { pct: '', abs: '' })[0];
    expect(r.cogm).toBe('5'); expect(r.rSp!.toFixed()).toBe('1.6'); expect(r.rMrp!.toFixed()).toBe('2');
  });
  it('without ActCogm (SAP not updated) COGM is n/a, ratios are n/a, ActLanded is NOT used', () => {
    const row = fg({ ActCogm: undefined });
    expect(cogmOf(row)).toBe('');
    const r = buildReport([row], [pr()], { pct: '10', abs: '' })[0];
    expect(r.cogm).toBe(''); expect(r.cogmPending).toBe(true); expect(r.rSp).toBeNull(); expect(r.rMrp).toBeNull(); expect(r.sim).toBeNull();
    expect(ratioWhy(r)).toBe(COGM_PENDING_NOTE);
    expect(cogmPending([row])).toBe(true); expect(cogmPending([fg()])).toBe(false); expect(cogmPending([])).toBe(false);
  });
  it('an empty ActCogm string is also pending (never 0)', () => expect(cogmOf(fg({ ActCogm: '' }))).toBe(''));
  it('the simulation is applied to ActCogm', () => {
    const r = buildReport([fg()], [pr()], { pct: '10', abs: '' })[0];
    expect(r.sim!.toFixed()).toBe('5.5'); expect(r.variance!.toFixed()).toBe('0.5');
  });
  it('ratios only with the same currency, the reason as tooltip text', () => {
    const r = buildReport([fg()], [pr({ Curr: 'BDT' })], { pct: '', abs: '' })[0];
    expect(r.rSp).toBeNull(); expect(ratioWhy(r)).toMatch(/BDT.*never converted/);
    expect(ratioWhy(buildReport([fg()], [], { pct: '', abs: '' })[0])).toMatch(/No sales order/);
  });
  it('"Without a price" counts SKUs with no priced row', () => {
    const t = buildReport([fg({ Matnr: 'A' }), fg({ Matnr: 'B' })], [pr({ Matnr: 'A' })], { pct: '', abs: '' });
    expect(withoutPrice(t)).toBe(1);
  });
});

describe('WacRowSet request', () => {
  const q: ReportQuery = { plants: ['UB01'], days: 30, kind: 'fg', price: null };
  beforeEach(() => wac.fetchWac.mockReset());
  it('sends only the shown fields, ActCogm included', () => {
    const s = reportSelect(true).split(',');
    expect(s).toEqual(expect.arrayContaining(['Matnr', 'ActCogm', 'ActLanded', 'ActRecon', 'Status', 'Msg', 'Zbrand', 'DupDocs']));
    expect(s).not.toContain('VarpSel'); expect(reportSelect(false).split(',')).not.toContain('ActCogm');
  });
  it('a SAP that does not know ActCogm yet: the call is repeated once without it', async () => {
    wac.fetchWac.mockRejectedValueOnce(new Error('Property ActCogm not found in type WacRow')).mockResolvedValueOnce({ rows: [], messages: [], ms: 1, sapMessageHeader: true });
    await fetchRows(q, new AbortController().signal);
    expect(wac.fetchWac).toHaveBeenCalledTimes(2);
    expect(wac.fetchWac.mock.calls[0][2].select).toContain('ActCogm'); expect(wac.fetchWac.mock.calls[1][2].select).not.toContain('ActCogm');
  });
  it('any other error is not retried; no timeout option is passed', async () => {
    wac.fetchWac.mockRejectedValueOnce(new Error('boom'));
    await expect(fetchRows(q, new AbortController().signal)).rejects.toThrow('boom');
    expect(wac.fetchWac).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(Object.keys(wac.fetchWac.mock.calls[0][2]))).not.toMatch(/timeout/i);
  });
});

describe('price lookup', () => {
  beforeEach(() => so.fetchSo.mockReset());
  it('the URL filter has VkorgIn (brackets with or), VtwegIn, SegmentIn, AuartIn and DaysBack, and no WerksIn', () => {
    const f = buildSoFilter(priceQuery(['A', 'B'], F), 'PRICE');
    expect(f).toContain("(VkorgIn eq 'EM01' or VkorgIn eq 'EM02')"); expect(f).toContain("VtwegIn eq '10'"); expect(f).toContain("SegmentIn eq 'DOM'"); expect(f).toContain("AuartIn eq 'ZOD1'"); expect(f).toContain('DaysBack eq 90');
    expect(f).not.toContain('WerksIn'); expect(f).not.toContain('+');
  });
  it('batches of 50, 3 in parallel, the narrow $select, no timeout option', async () => {
    const mats = Array.from({ length: 230 }, (_, i) => `M${i}`);
    expect(priceBatches(mats).map((b) => b.length)).toEqual([50, 50, 50, 50, 30]);
    let live = 0, peak = 0;
    so.fetchSo.mockImplementation(async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return { rows: [pr()], messages: [], ms: 1 }; });
    const r = await fetchReportPrices(mats, F);
    expect(so.fetchSo).toHaveBeenCalledTimes(5); expect(peak).toBe(PRICE_PARALLEL); expect(r.rows).toHaveLength(5);
    expect(so.fetchSo.mock.calls[0][2].select).toBe(REPORT_PRICE_SELECT);
    expect(JSON.stringify(Object.keys(so.fetchSo.mock.calls[0][2]))).not.toMatch(/timeout/i);
  });
  it('a SAP error text becomes an error message; the other batches still return their rows', async () => {
    so.fetchSo.mockRejectedValueOnce(new Error('Select a sales organisation (filter VkorgIn)')).mockResolvedValue({ rows: [pr()], messages: [], ms: 1 });
    const r = await fetchReportPrices(Array.from({ length: 120 }, (_, i) => `M${i}`), F);
    expect(r.messages).toEqual([{ code: '', message: 'Select a sales organisation (filter VkorgIn)', severity: 'error' }]);
    expect(r.rows).toHaveLength(2);
  });
  it('Stop aborts all batches', async () => {
    const ctl = new AbortController();
    so.fetchSo.mockImplementation(async () => { ctl.abort(); return { rows: [], messages: [], ms: 1 }; });
    await expect(fetchReportPrices(Array.from({ length: 300 }, (_, i) => `M${i}`), F, ctl.signal)).rejects.toThrow();
    expect(so.fetchSo.mock.calls.length).toBeLessThanOrEqual(PRICE_PARALLEL);
  });
});
