import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildCascade } from '@/lib/cascade';
import { RATE_FILE_KEYS, SIM_FILE_KEYS, isNumericKey } from '@/lib/columns';
import { padKunnr, padMatnr, parseRateFile, parseRateMatrix, parseSimulationFile, parseSimulationMatrix, templateWorkbook, toYmd } from '@/lib/excel';
import { cellText, factorError, factorNumber, FACTOR_INPUT } from '@/lib/format';
import { computeKpis, rowMetrics } from '@/lib/kpis';
import { mockAction, mockGetSet, resetMock, sampleRateRows, sampleSimRows } from '@/lib/mock';
import { makeRowId, rowKey, type FailureItem, type Row } from '@/lib/types';
import { parseDataArray, runAction } from '@/lib/api';

const data = (r: { data: string }) => (r.data ? JSON.parse(r.data) : []);

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
    expect(padMatnr('400012001')).toBe('000000000400012001');
    expect(padMatnr('ab-12')).toBe('AB-12');
    expect(padKunnr('510012')).toBe('0000510012');
  });

  it('rate rows from row 2 in file order: KBETR numbers, dates YYYYMMDD, blank rows skipped; bad date -> "" (red in the grid)', () => {
    const good = sampleRateRows()[0];
    const bad = [...good];
    bad[RATE_FILE_KEYS.indexOf('VFROM')] = '31.13.2026';
    const rows = parseRateMatrix([[...RATE_FILE_KEYS], good, [], bad]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ LLAND: 'AE', MATNR: '000000000400012001', VFROM: '20260401', VTO: '20270331', ZCVT_KBETR: 5, WAERK: 'AED' });
    expect(typeof rows[0].ZRRP_KBETR).toBe('number');
    expect(rows[1].VFROM).toBe('');
  });

  it('simulation rows: padded, ZPRICE_IN 0', () => {
    const rows = parseSimulationMatrix([[...SIM_FILE_KEYS], ['5100', '5101', '510012', '400012001', '', 'aed', 'usd']]);
    expect(rows).toEqual([{ VKORG: '5100', WERKS: '5101', KUNNR: '0000510012', MATNR: '000000000400012001', CHARG: '', L_WAERK: 'AED', B_WAERK: 'USD', ZPRICE_IN: 0 }]);
  });

  it('no data rows: an error naming it; templates round-trip; non-xlsx refused', () => {
    expect(() => parseRateMatrix([[...RATE_FILE_KEYS]])).toThrow(/no data rows found/);
    expect(() => parseSimulationMatrix([[...SIM_FILE_KEYS], ['', '']])).toThrow(/no data rows found/);
    expect(parseRateFile(templateWorkbook([...RATE_FILE_KEYS], sampleRateRows()))).toHaveLength(2);
    expect(parseSimulationFile(templateWorkbook([...SIM_FILE_KEYS], sampleSimRows()))).toHaveLength(4);
    expect(() => parseRateFile(new TextEncoder().encode('a,b').buffer as ArrayBuffer)).toThrow(/not an \.xlsx/);
  });

  it('real Excel date cells are read as dates', () => {
    const ws = XLSX.utils.aoa_to_sheet([[...RATE_FILE_KEYS], sampleRateRows()[0]]);
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
    expect(cellText('VALIDFROM', '2026').text).toBe('2026');
    expect(cellText('ZVERSION', '').text).toBe('01');
    expect(cellText('ZVERSION', '3').text).toBe('3');
    expect(cellText('MATNR', '000000000400012001').text).toBe('000000000400012001');
  });

  it('Pricing Factor %: -?ddd.dd while typing; -100 or lower rejected; blank = 0', () => {
    for (const v of ['', '-', '5', '-12.5', '100', '999.99']) expect(FACTOR_INPUT.test(v)).toBe(true);
    for (const v of ['1000', '1.234', 'x']) expect(FACTOR_INPUT.test(v)).toBe(false);
    expect(factorError('-100')).toMatch(/above -100/);
    expect(factorError('-99.99')).toBe('');
    expect(factorNumber('')).toBe(0);
    expect(factorNumber('5.5')).toBe(5.5);
  });

  it('row identity: __id first, MATNR for materials, the cascade key otherwise', () => {
    const id = makeRowId();
    expect(rowKey({ __id: id, MATNR: '1' })).toBe(id);
    expect(makeRowId()).not.toBe(id);
    expect(rowKey({ MATNR: 'M' }, 'material')).toBe('M');
    expect(rowKey({ S_LAND1: 'AE', D_LAND1: 'AE', VKORG: '5100', KUNNR: 'K', MATNR: 'M', VALIDFROM: '1', VALIDTO: '2', ZVERSION: '3' })).toBe('AE|AE|5100|K|M|1|2|3');
  });
});

describe('cascade maths', () => {
  it('the waterfall adds up to 100% of RRP excl VAT', () => {
    const c = buildCascade({ rrpInclVat: 10.5, vatPct: 5, retailPct: 25, apOnPttPct: 3, damagePct: 1, distMarginPct: 12, dutyPct: 5, cfPct: 4, lcPct: 0.5, daxPct: 1, apPct: 4, fx: 3.6725 });
    expect([c.ZE_RRP_PER_PC, c.ZVAT, c.ZRETAIL, c.ZPTT, c.ZRRP_PER_DZ]).toEqual([10, 0.5, 2.5, 7.5, 126]);
    const m = rowMetrics(c)!;
    const total = m.retailPct + m.distPct + m.apPct + m.damagePct + m.landingPct + m.realisationPct;
    expect(total).toBeGreaterThan(99.5);
    expect(total).toBeLessThan(100.5);
  });
});

describe('actions (mock service, same contract as SAP)', () => {
  beforeEach(() => resetMock());

  it('runAction strips __id before anything is sent', async () => {
    const r = await runAction('ENRICH_RATES', { RATE_ROWS: [{ __id: 'x1', LLAND: 'AE', MATNR: '000000000400012002' }] });
    const out = parseDataArray(r);
    expect(out[0].__id).toBeUndefined();
    expect(out[0].MAKTX).toBe('NAVRATNA AYURVEDIC OIL 200ML');
  });

  it('ENRICH_RATES adds descriptions; SAVE_RATES returns failure items for bad rows', async () => {
    const rows = parseRateFile(templateWorkbook([...RATE_FILE_KEYS], sampleRateRows()));
    const enriched = data(await mockAction({ action: 'ENRICH_RATES', payload: { RATE_ROWS: rows } }));
    expect(enriched[0]).toMatchObject({ MAKTX: 'NAVRATNA AYURVEDIC OIL 100ML' });
    const r = await mockAction({ action: 'SAVE_RATES', payload: { RATE_ROWS: [enriched[0], { ...enriched[1], VFROM: '' }, { ...enriched[0], MATNR: '000000000499999999' }] } });
    expect([r.processed, r.failed]).toEqual([1, 2]);
    const f: FailureItem[] = data(r);
    expect(f.map((x) => x.MESSAGE)).toEqual(['Valid From / Valid To missing or invalid', 'Material is not maintained for cascade pricing']);
  });

  it('RUN_SIM applies the Pricing Factor % to RRP from the base price (never compounding) and keeps ZPRICE_IN', async () => {
    const row = { VKORG: '5100', WERKS: '5101', KUNNR: '0000510012', MATNR: '000000000400012002', CHARG: '', L_WAERK: 'AED', B_WAERK: 'USD' };
    const params = { BUKRS: '1100', KALSM: 'ZEXPRC', PDATE: '20261024' };
    const base = data(await mockAction({ action: 'RUN_SIM', payload: { ROWS: [{ ...row, ZPRICE_IN: 0 }], PARAMS: params } }))[0];
    const plus5 = data(await mockAction({ action: 'RUN_SIM', payload: { ROWS: [{ ...row, ZPRICE_IN: 5 }], PARAMS: params } }))[0];
    const again = data(await mockAction({ action: 'RUN_SIM', payload: { ROWS: [{ ...plus5, ZPRICE_IN: 5 }], PARAMS: params } }))[0];
    expect(plus5.ZI_RRP_PER_PC).toBeCloseTo(base.ZI_RRP_PER_PC * 1.05, 1);
    expect(again.ZI_RRP_PER_PC).toBe(plus5.ZI_RRP_PER_PC);
    expect(plus5.ZPRICE_IN).toBe(5);
    expect(plus5.WERKS).toBe('5101');
  });

  it('SEND_APPROVAL needs both dates; APPROVE with blank dates keeps the stored ones; REJECT and DELETE', async () => {
    const sim = data(await mockAction({ action: 'RUN_SIM', payload: { ROWS: [{ VKORG: '5100', KUNNR: '0000510012', MATNR: '000000000400012002', ZPRICE_IN: 0 }], PARAMS: { BUKRS: '1100', KALSM: 'Z', PDATE: '20261024' } } }));
    await expect(mockAction({ action: 'SEND_APPROVAL', vfrom: '20261201', payload: { ROWS: sim } })).rejects.toThrow(/required for Send for Approval/);
    await mockAction({ action: 'SEND_APPROVAL', vfrom: '20261201', vto: '20270331', payload: { ROWS: sim } });
    const mine = (await mockGetSet('ApprovalSet')).find((r) => r.MATNR === '000000000400012002' && r.KUNNR === '0000510012' && r.VALIDFROM === '20261201')!;
    expect(mine.LIGHT).toBe('1');
    await mockAction({ action: 'APPROVE', payload: { ROWS: [mine] } });
    const approved = (await mockGetSet('ConditionPendingSet')).find((r) => rowKey(r) === rowKey(mine))!;
    expect([approved.LIGHT, approved.VALIDFROM, approved.VALIDTO]).toEqual(['3', '20261201', '20270331']);
    const rej = await mockAction({ action: 'REJECT', payload: { ROWS: [approved] } });
    expect(rej.processed).toBe(1);
    const del = await mockAction({ action: 'DELETE', payload: { ROWS: [approved] } });
    expect(del.message).toMatch(/ZMM_CASCADE/);
    await expect(mockAction({ action: 'APPROVE', payload: { ROWS: [] } })).rejects.toThrow('Select at least one row');
  });

  it('CREATE_COND lists failed items; COMPARE returns every version latest first', async () => {
    const pending = await mockGetSet('ConditionPendingSet');
    const ng = pending.find((r) => r.S_LAND1 === 'NG');
    const other = pending.find((r) => r.S_LAND1 !== 'NG')!;
    const r = await mockAction({ action: 'CREATE_COND', payload: { ROWS: [other, ...(ng ? [ng] : [])] } });
    expect(r.processed).toBe(1);
    if (ng) expect(data(r)[0]).toMatchObject({ KSCHL: 'ZCIF', KUNNR: ng.KUNNR });
    const hist: Row[] = data(await mockAction({ action: 'COMPARE', payload: { ROWS: [other] } }));
    expect(hist.length).toBeGreaterThanOrEqual(2);
    expect(Number(hist[0].ZVERSION)).toBeGreaterThan(Number(hist[hist.length - 1].ZVERSION));
  });
});

describe('kpis', () => {
  beforeEach(() => resetMock());
  it('computes the cascade KPIs on the seeded data', async () => {
    const [review, pending, materials] = await Promise.all([mockGetSet('ApprovalSet'), mockGetSet('ConditionPendingSet'), mockGetSet('CascadeMapSet')]);
    const history = data(await mockAction({ action: 'COMPARE', payload: { ROWS: review } }));
    const k = computeKpis(review, pending, history, materials, '20261023');
    expect(k.points).toBe(review.length);
    expect(k.waterfall.reduce((a, s) => a + s.pct, 0)).toBeGreaterThan(99);
    expect(k.byMarket.length).toBe(8);
    expect(k.changes.length).toBeGreaterThan(0);
  });
});
