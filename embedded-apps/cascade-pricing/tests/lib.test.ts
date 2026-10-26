import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { RATE_FILE_KEYS, SIM_FILE_KEYS, isNumericKey } from '@/lib/columns';
import { padKunnr, padMatnr, parseRateFile, parseRateMatrix, parseSimulationFile, parseSimulationMatrix, templateWorkbook, toYmd } from '@/lib/excel';
import { cellText, factorError, factorNumber, FACTOR_INPUT } from '@/lib/format';
import { computeKpis, rowMetrics } from '@/lib/kpis';
import { formatDate, formatTime, lightOf, makeRowId, rowKey, statusLight, trimLeadingZeros, type Row } from '@/lib/types';
import { CASCADE_COLS } from '@/lib/columns';
import { checkHealth, friendlyError, getCascade, parseDataArray, runAction } from '@/lib/api';

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
    const err = await getCascade('ConditionPendingSet').catch((e) => e);
    expect(err.message).toBe("SAP could not load the approved cascades waiting for condition creation. The error is inside SAP's own service, not in this app; the SAP team has been informed. Try again later.");
    expect(err.sapSide).toBe(true);
    expect(err.status).toBe(502);
    expect(err.detail).toMatch(/unknown internal server error/); // SAP's own text kept for the SAP team
  });

  it('runAction strips __id, sends dates only when filled, maps the result', async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return reply(200, { processed: 1, failed: 0, message: 'ok', data: '[{"MATNR":"1"}]' }); }));
    const r = await runAction('APPROVE', { ROWS: [{ __id: 'x1', __light: '1', MATNR: '1', LIGHT: '' }] }, '', '20270331');
    expect(sent).toEqual({ action: 'APPROVE', payload: { ROWS: [{ MATNR: '1', LIGHT: '' }] }, vto: '20270331' }); // __light never goes to SAP
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

describe('error messages', () => {
  it('access and input errors stay as the backend wrote them; timeouts and other SAP errors say so', () => {
    expect(friendlyError(403, 'You do not have access to Cascade Pricing.', 'x').message).toBe('You do not have access to Cascade Pricing.');
    expect(friendlyError(403, 'x', 'x').sapSide).toBe(false);
    expect(friendlyError(502, 'timeout of 60000ms exceeded', 'the cascade material list').message).toBe('SAP did not answer in time while loading the cascade material list. Try again in a minute.');
    const e = friendlyError(502, 'Material 4711 is locked by user X', 'the cascades waiting for review');
    expect(e.message).toBe('SAP returned an error while loading the cascades waiting for review.');
    expect(e.detail).toBe('Material 4711 is locked by user X');
    expect(friendlyError(502, "Property 'Action' at offset '68' has invalid value 'GET_PENDING_CORRECTION'", 'the result of GET_PENDING_CORRECTION').message).toBe('SAP cannot take the action GET_PENDING_CORRECTION yet: its Action field holds at most 20 characters and this name has 22. The SAP team needs to lengthen the Action property of ActionRequest.');
    expect(friendlyError(502, 'In the context of Data Services an unknown internal server error occurred', 'the result of CREATE_COND').message).toMatch(/^SAP could not return the result of CREATE_COND\. The error is inside SAP's own service/);
  });
});

describe('KPI report (screen + Excel from one definition)', async () => {
  const { kpiItems, kpiReportSheets, waterfallSentence, waterfallWithRest } = await import('@/lib/kpiReport');
  // The NGQ ApprovalSet row of 25.10.2026 (AE, 400009275, ZANDU BALM 25ML), in the app's ABAP names.
  const ngq: Row = { S_LAND1: 'AE', D_LAND1: 'AE', VKORG: 'EDCC', KUNNR: '0000028440', MATNR: '000000000400009275', MAKTX: 'FGE-ZANDU BALM25ML(EA-UAE)SO(2+1FREE)144', ZVERSION: '01', L_WAERK: 'AED', B_WAERK: 'AED',
    ZI_RRP_PER_PC: '11.000', ZVAT: '0.520', ZE_RRP_PER_PC: '10.480', ZRETAIL: '1.370', ZPTT: '9.110', ZAP_ON_PTT: '0.000', ZDAMGE: '0.000', ZPTT_E_AP: '9.110', ZDMARGIN: '0.770', ZDLC: '8.340',
    ZCUS_DUTY: '0.000', ZCF: '0.000', ZLC_CHARGE: '0.000', ZCIF: '8.340', ZDAM_ZDAX: '0.000', ZCIF_F: '8.340', ZAP: '2.090', ZCIF_AFTER_AP: '6.250', VALIDFROM: '20261023', VALIDTO: '20261023', LIGHT: '' };
  const k = computeKpis([ngq], [], [], [{ MATNR: '1', CASCADE_DESC: 'x' }, { MATNR: '2', CASCADE_DESC: '' }], '20261025');

  it('every KPI has a value, meaning, formula and a status against its target', () => {
    const items = kpiItems(k);
    const by = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(by.realisation.value).toBe('59.6%'); // 6.25 / 10.48
    expect(by.realisation.status).toBe('ok');
    expect(by.ap.value).toBe('19.9%'); // 2.09 / 10.48
    expect(by.ap.status).toBe('bad');
    expect(by.ap.statusText).toBe('Above 10%');
    expect(by.channel.status).toBe('watch'); // retailer 13.1% < 15%
    expect(by.coverage.statusText).toBe('1 without a description');
    expect(by.awaiting.statusText).toBe('1 without a status'); // NGQ sends Light blank
    expect(by.awaiting.sub).toBe('0 already approved · 1 with no status from SAP');
    for (const i of items) { expect(i.meaning.length).toBeGreaterThan(10); expect(i.formula.length).toBeGreaterThan(3); }
  });

  it('waterfall: an "Other / not explained" step when the steps do not add up to 100%, and a plain sentence', () => {
    const steps = waterfallWithRest(k.waterfall);
    expect(steps.map((s) => s.label)).not.toContain('Other / not explained'); // the NGQ row adds up to 100%
    expect(steps.reduce((a, s) => a + s.pct, 0)).toBeCloseTo(100, 1);
    const gap = waterfallWithRest([{ label: 'Retailer margin', pct: 20, kind: 'trade' }, { label: 'Net realisation', pct: 70, kind: 'net' }]);
    expect(gap.map((s) => [s.label, Math.round(s.pct)])).toEqual([['Retailer margin', 20], ['Other / not explained', 10], ['Net realisation', 70]]);
    expect(waterfallSentence(steps, ['AED'])).toMatch(/^Of every 100 AED the consumer pays \(excl\. VAT\), the trade keeps about 20\.42 AED, A&P and damage take 19\.94 AED, and the company realises 59\.64 AED\.$/);
  });

  it('Excel report: summary with status / target / meaning / formula, the waterfall, lists and notes', () => {
    const sheets = kpiReportSheets(k, { system: 'NGQ', market: '', loadedAt: '25 Oct 2026, 13:00', points: 1 }, ['AED']);
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'Price waterfall', 'By selling country', 'Price corridor', 'Guardrail exceptions', 'Changes vs previous', 'Notes']);
    expect(sheets[0].rows[1][0]).toMatch(/^SAP NGQ · All markets · 1 price point/);
    expect(sheets[0].rows[3]).toEqual(['Section', 'KPI', 'Value', 'Unit', 'Status', 'Target', 'What it means', 'How it is calculated']);
    const real = sheets[0].rows.find((r) => r[1] === 'Net realisation')!;
    expect(real.slice(2, 6)).toEqual([59.64, '% of RRP excl. VAT', 'At or above 35%', '≥ 35%']);
    expect(sheets[4].rows[1][4]).toMatch(/A&P 19\.9% \(max 10%\)/);
  });
});

describe('status lights', () => {
  it("SAP's LIGHT when sent, else from the approval flags (NGQ sends LIGHT blank)", () => {
    expect(lightOf({ LIGHT: '3', ZINITIATOR: 'X' })).toBe('3');
    expect(lightOf({ LIGHT: '', ZINITIATOR: 'X', ZAPPROVE: '' })).toBe('1'); // the 3 NGQ rows of 25.10.2026: sent, not approved
    expect(lightOf({ LIGHT: '', ZINITIATOR: 'X', ZAPPROVE: 'X' })).toBe('3');
    expect(lightOf({ LIGHT: '', ZAPPROVE: 'R' })).toBe('1');
    expect(lightOf({ LIGHT: '', ZCOND_STAT: 'C' })).toBe('3');
    expect(lightOf({ LIGHT: '' })).toBe('');
  });

  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  afterEach(() => vi.unstubAllGlobals());
  it('getCascade adds __light; rows waiting for condition creation are green when SAP gives nothing; KPIs count them', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => reply(200, url.endsWith('/ConditionPendingSet') ? [{ MATNR: '1', LIGHT: '' }] : [{ MATNR: '2', LIGHT: '', ZINITIATOR: 'X', ZAPPROVE: '' }])));
    const pend = await getCascade('ConditionPendingSet');
    const rev = await getCascade('ApprovalSet');
    expect(statusLight(pend[0])).toBe('3');
    expect(statusLight(rev[0])).toBe('1');
    expect(rev[0].LIGHT).toBe(''); // SAP's own field untouched
    const k = computeKpis(rev, pend, [], [], '20261025');
    expect([k.red, k.green]).toEqual([1, 0]);
  });
});

describe('rejection with reason, pending correction, notifications', () => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  afterEach(() => vi.unstubAllGlobals());

  it('display helpers: ALPHA OUT, YYYY-MM-DD, HH:MM', () => {
    expect(trimLeadingZeros('000000000400009275')).toBe('400009275');
    expect(trimLeadingZeros('0000')).toBe('0');
    expect(trimLeadingZeros('')).toBe('');
    expect(formatDate('20261025')).toBe('2026-10-25');
    expect(formatDate('2026-10-25')).toBe('2026-10-25');
    expect(formatTime('134502')).toBe('13:45');
    expect(formatTime('1345')).toBe('1345');
  });

  it('the rejection columns come first in every cascade grid', () => {
    expect(CASCADE_COLS.slice(0, 3).map((c) => [c.key, c.label])).toEqual([['REJECT_REASON', 'Rejection Reason'], ['REJECTED_BY', 'Rejected By'], ['S_LAND1', 'Selling Country']]);
  });

  it('REJECT_WITH_REASON sends ROWS + REASON (no dates); MARK_NOTIF_READ sends NOTIF_IDS; RESUBMIT sends the dates', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return reply(200, { processed: 1, failed: 0, message: '', data: '' }); }));
    await runAction('REJECT_WITH_REASON', { ROWS: [{ MATNR: '1', __light: '1' }], REASON: 'Retailer margin too low' });
    await runAction('MARK_NOTIF_READ', { NOTIF_IDS: ['N1', 'N2'] });
    await runAction('RESUBMIT', { ROWS: [{ MATNR: '1' }] }, '20261101', '20270331');
    expect(sent).toEqual([
      { action: 'REJECT_WITH_REASON', payload: { ROWS: [{ MATNR: '1' }], REASON: 'Retailer margin too low' } },
      { action: 'MARK_NOTIF_READ', payload: { NOTIF_IDS: ['N1', 'N2'] } },
      { action: 'RESUBMIT', payload: { ROWS: [{ MATNR: '1' }] }, vfrom: '20261101', vto: '20270331' },
    ]);
  });
});

describe('SAP background timeout', () => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  afterEach(() => vi.unstubAllGlobals());
  it('read actions: try again later; write actions: may still be processed, refresh first (no double send)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { processed: 0, failed: 1, message: 'Timeout waiting for background result', data: '' })));
    const read = await runAction('ENRICH_RATES', { RATE_ROWS: [] });
    expect(read.failed).toBe(1);
    expect(read.message).toBe('SAP did not return the result of ENRICH_RATES in time: its background job did not report back (an issue on the SAP side). Try again in a few minutes.');
    const write = await runAction('SEND_APPROVAL', { ROWS: [] }, '20261101', '20270331');
    expect(write.message).toMatch(/It may still be processed - refresh the list before trying again, so nothing is sent twice\.$/);
  });
});
