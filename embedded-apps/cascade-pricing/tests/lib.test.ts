import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { RATE_FILE_KEYS, SIM_FILE_KEYS, isNumericKey } from '@/lib/columns';
import { padKunnr, padMatnr, parseRateFile, parseRateMatrix, parseSimulationFile, parseSimulationMatrix, templateWorkbook, toYmd } from '@/lib/excel';
import { cellText, factorError, factorNumber, FACTOR_INPUT } from '@/lib/format';
import { computeKpis, rowMetrics } from '@/lib/kpis';
import { makeRowId, rowKey, type Row } from '@/lib/types';
import { checkHealth, getCascade, parseDataArray, runAction } from '@/lib/api';

/** One rate file row in file order (RATE_FILE_KEYS). */
const RATE_ROW: (string | number)[] = ['AE', '400003658', 'ZRRP', 12, 'ZCVT', 5, 'ZRPI', 11.43, 'ZRTL', 25, 'ZPTT', 3, 'ZDEX', 1, 'ZDML', 12, 'ZCUD', 5, 'ZCFD', 4, 'ZLCC', 0.5, 'ZDAX', 1, 'ZAP', 4, '01.11.2026', '31.03.2027', 'AED'];
const SIM_ROW = ['5100', '5101', '510012', '400003658', '', 'aed', 'usd'];

describe('excel', () => {
  it('dates: dd.mm.yyyy, YYYYMMDD, Excel serials and Date objects; "" for impossible dates', () => {
    expect(toYmd('01.04.2026')).toBe('20260401');
    expect(toYmd('1/4/2026')).toBe('20260401');
    expect(toYmd('20270331')).toBe('20270331');
    expect(toYmd(46113)).toBe('20260401');
    expect(toYmd(new Date(2026, 3, 1))).toBe('20260401');
    expect(toYmd('31.02.2026')).toBe('');
    expect(toYmd('')).toBe('');
  });

  it('padding: numeric MATNR to 18, KUNNR to 10', () => {
    expect(padMatnr('400003658')).toBe('000000000400003658');
    expect(padMatnr('ab-12')).toBe('AB-12');
    expect(padKunnr('510012')).toBe('0000510012');
  });

  it('rate rows from row 2 in file order: KBETR numbers, dates YYYYMMDD, blank rows skipped; bad date -> "" (red in the grid)', () => {
    const bad = [...RATE_ROW];
    bad[RATE_FILE_KEYS.indexOf('VFROM')] = '31.13.2026';
    const rows = parseRateMatrix([[...RATE_FILE_KEYS], RATE_ROW, [], bad]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ LLAND: 'AE', MATNR: '000000000400003658', VFROM: '20261101', VTO: '20270331', ZCVT_KBETR: 5, ZRRP_KBETR: 12, WAERK: 'AED' });
    expect(rows[1].VFROM).toBe('');
  });

  it('simulation rows: padded, ZPRICE_IN 0', () => {
    expect(parseSimulationMatrix([[...SIM_FILE_KEYS], SIM_ROW])).toEqual([{ VKORG: '5100', WERKS: '5101', KUNNR: '0000510012', MATNR: '000000000400003658', CHARG: '', L_WAERK: 'AED', B_WAERK: 'USD', ZPRICE_IN: 0 }]);
  });

  it('no data rows: an error naming it; the header-only templates parse as "no data rows"; non-xlsx refused', () => {
    expect(() => parseRateMatrix([[...RATE_FILE_KEYS]])).toThrow(/no data rows found/);
    expect(() => parseRateFile(templateWorkbook([...RATE_FILE_KEYS], []))).toThrow(/no data rows found/);
    expect(() => parseSimulationFile(templateWorkbook([...SIM_FILE_KEYS], []))).toThrow(/no data rows found/);
    expect(parseRateFile(templateWorkbook([...RATE_FILE_KEYS], [RATE_ROW]))).toHaveLength(1);
    expect(() => parseRateFile(new TextEncoder().encode('a,b').buffer as ArrayBuffer)).toThrow(/not an \.xlsx/);
  });

  it('real Excel date cells are read as dates', () => {
    const ws = XLSX.utils.aoa_to_sheet([[...RATE_FILE_KEYS], RATE_ROW]);
    ws[XLSX.utils.encode_cell({ r: 1, c: RATE_FILE_KEYS.indexOf('VFROM') })] = { t: 'n', v: 46113, z: 'dd.mm.yyyy' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    expect(parseRateFile(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)[0].VFROM).toBe('20260401');
  });
});

describe('format, columns and ids', () => {
  it('numbers right-aligned with 2 decimals; codes, versions and dates never; dates YYYY-MM-DD; blank version 01', () => {
    for (const k of ['ZCIF_AFTER_AP', 'ZRRP_KBETR', 'ZPRICE_IN', 'ZLC_CHARGE', 'ZI_RRP_PER_PC']) expect(isNumericKey(k)).toBe(true);
    for (const k of ['MATNR', 'KUNNR', 'VKORG', 'ZVERSION', 'VALIDFROM', 'VTO', 'ZAP_KSCHL', 'CHARG', 'CASCADE_DESC']) expect(isNumericKey(k)).toBe(false);
    expect(cellText('ZCIF', 1234.5)).toEqual({ text: '1,234.50', numeric: true });
    expect(cellText('VALIDFROM', '20260401').text).toBe('2026-04-01');
    expect(cellText('ZVERSION', '').text).toBe('01');
    expect(cellText('MATNR', '000000000400003658').text).toBe('000000000400003658');
  });

  it('Pricing Factor %: -?ddd.dd while typing; -100 or lower rejected; blank = 0', () => {
    for (const v of ['', '-', '5', '-12.5', '100', '999.99']) expect(FACTOR_INPUT.test(v)).toBe(true);
    for (const v of ['1000', '1.234', 'x']) expect(FACTOR_INPUT.test(v)).toBe(false);
    expect(factorError('-100')).toMatch(/above -100/);
    expect(factorError('-99.99')).toBe('');
    expect(factorNumber('')).toBe(0);
  });

  it('row identity: __id first, MATNR for materials, the cascade key otherwise', () => {
    const id = makeRowId();
    expect(rowKey({ __id: id, MATNR: '1' })).toBe(id);
    expect(makeRowId()).not.toBe(id);
    expect(rowKey({ MATNR: 'M' }, 'material')).toBe('M');
    expect(rowKey({ S_LAND1: 'AE', D_LAND1: 'AE', VKORG: '5100', KUNNR: 'K', MATNR: 'M', VALIDFROM: '1', VALIDTO: '2', ZVERSION: '3' })).toBe('AE|AE|5100|K|M|1|2|3');
  });
});

describe('API client (stubbed backend)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('reads a set from <api>/me/cascade-pricing/cascade/<set>; the backend error message comes through', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(url); return url.endsWith('/ConditionPendingSet') ? reply(502, { error: 'In the context of Data Services an unknown internal server error occurred' }) : reply(200, [{ MATNR: '000000000400003658' }]); }));
    expect(await getCascade('CascadeMapSet')).toEqual([{ MATNR: '000000000400003658' }]);
    expect(calls[0]).toBe('https://audit-capa-api.emamiapps.in/api/me/cascade-pricing/cascade/CascadeMapSet');
    await expect(getCascade('ConditionPendingSet')).rejects.toThrow(/unknown internal server error/);
  });

  it('runAction strips __id, sends dates only when filled, maps the result', async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return reply(200, { processed: 1, failed: 0, message: 'ok', data: '[{"MATNR":"1"}]' }); }));
    const r = await runAction('APPROVE', { ROWS: [{ __id: 'x1', MATNR: '1' }] }, '', '20270331');
    expect(sent).toEqual({ action: 'APPROVE', payload: { ROWS: [{ MATNR: '1' }] }, vto: '20270331' });
    expect(r).toEqual({ processed: 1, failed: 0, message: 'ok', data: '[{"MATNR":"1"}]' });
    expect(parseDataArray(r)).toEqual([{ MATNR: '1' }]);
    await runAction('SAVE_RATES', { RATE_ROWS: [{ __id: 'r1', LLAND: 'AE' }] });
    expect(sent).toEqual({ action: 'SAVE_RATES', payload: { RATE_ROWS: [{ LLAND: 'AE' }] } });
  });

  it('health: ok with the count, or the error (banner) - never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { ok: true, count: 2097 })));
    expect(await checkHealth()).toEqual({ ok: true, count: 2097 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    expect(await checkHealth()).toMatchObject({ ok: false, error: expect.stringMatching(/Could not reach/) });
  });

  it('parseDataArray: [] for empty or non-array data', () => {
    expect(parseDataArray({ processed: 0, failed: 0, message: '', data: '' })).toEqual([]);
    expect(parseDataArray({ processed: 0, failed: 0, message: '', data: '{"x":1}' })).toEqual([]);
  });
});

describe('kpis', () => {
  // A cascade row as SAP returns it: RRP 10.50 incl 5 % VAT, CIF side in USD at 3.6725 AED per USD.
  const cascade = (o: Row): Row => ({
    S_LAND1: 'AE', D_LAND1: 'AE', VKORG: '5100', KUNNR: '0000510012', MATNR: '000000000400003658', B_WAERK: 'USD', L_WAERK: 'AED', ZVERSION: '2', LIGHT: '1',
    ZI_RRP_PER_PC: 10.5, ZVAT: 0.5, ZE_RRP_PER_PC: 10, ZRETAIL: 2.5, ZPTT: 7.5, ZAP_ON_PTT: 0.23, ZDAMGE: 0.08, ZPTT_E_AP: 7.2, ZDMARGIN: 0.86, ZDLC: 6.34,
    ZCUS_DUTY: 0.29, ZCF: 0.23, ZLC_CHARGE: 0.03, ZCIF: 1.58, ZDAM_ZDAX: 0.02, ZCIF_F: 1.56, ZAP: 0.06, ZCIF_AFTER_AP: 1.5, ...o,
  });

  it('the waterfall adds up to 100% of RRP excl VAT', () => {
    const m = rowMetrics(cascade({}))!;
    const total = m.retailPct + m.distPct + m.apPct + m.damagePct + m.landingPct + m.realisationPct;
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });

  it('counts, changes vs the previous version, corridor across markets', () => {
    const review = [cascade({}), cascade({ S_LAND1: 'SA', D_LAND1: 'SA', KUNNR: '0000510045', ZCIF_AFTER_AP: 1.8, LIGHT: '3' })];
    const history = [cascade({ ZVERSION: '1', ZCIF_AFTER_AP: 1.4, ZI_RRP_PER_PC: 10 })];
    const k = computeKpis(review, [], history, [{ MATNR: '000000000400003658', CASCADE_DESC: '' }], '20261024');
    expect([k.points, k.red, k.green, k.markets]).toEqual([2, 1, 1, 2]);
    expect(k.changes[0].billingPct).toBeCloseTo(7.14, 1);
    expect(k.corridor[0].spreadPct).toBeCloseTo(20, 0);
    expect(k.coveragePct).toBe(0);
  });
});
