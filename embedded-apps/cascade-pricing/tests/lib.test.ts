import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildCascade } from '@/lib/cascade';
import { RATE_COLUMNS, SIM_INPUT_COLUMNS, isNumericKey } from '@/lib/columns';
import { ExcelParseError, padKunnr, padMatnr, parseRateFile, parseRateMatrix, parseSimulationFile, parseSimulationMatrix, templateWorkbook, toYmd } from '@/lib/excel';
import { cellText, isYmd } from '@/lib/format';
import { computeKpis, rowMetrics } from '@/lib/kpis';
import { mockAction, mockGetSet, resetMock, sampleRateRows, sampleSimRows } from '@/lib/mock';
import { rowKey } from '@/lib/types';

describe('excel', () => {
  it('converts dd.mm.yyyy, YYYYMMDD and Excel serials; rejects impossible dates', () => {
    expect(toYmd('01.04.2026')).toBe('20260401');
    expect(toYmd('1/4/2026')).toBe('20260401');
    expect(toYmd('20270331')).toBe('20270331');
    expect(toYmd(46113)).toBe('20260401'); // Excel serial for 1 Apr 2026
    expect(toYmd('31.02.2026')).toBeNull();
    expect(toYmd('2026-04-01')).toBeNull();
    expect(toYmd('')).toBeNull();
  });

  it('pads numeric material (18) and customer (10) numbers only', () => {
    expect(padMatnr('400012001')).toBe('000000000400012001');
    expect(padMatnr(400012001)).toBe('000000000400012001');
    expect(padMatnr('ab-12')).toBe('AB-12');
    expect(padKunnr('510012')).toBe('0000510012');
  });

  it('parses rate rows from row 2, converting dates and numbers, reporting bad rows', () => {
    const header = RATE_COLUMNS.map((c) => c.label);
    const good = sampleRateRows()[0];
    const bad = [...good];
    bad[RATE_COLUMNS.findIndex((c) => c.key === 'VFROM')] = '31.13.2026';
    bad[RATE_COLUMNS.findIndex((c) => c.key === 'ZCVT_KBETR')] = 'five';
    const { rows, errors } = parseRateMatrix([header, good, [], bad]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ LLAND: 'AE', MATNR: '000000000400012001', VFROM: '20260401', VTO: '20270331', ZCVT_KBETR: 5, WAERK: 'AED' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Row 4: .*VAT Rate.*Valid From/);
  });

  it('parses simulation rows with padding and required fields', () => {
    const { rows, errors } = parseSimulationMatrix([SIM_INPUT_COLUMNS.map((c) => c.key), ['5100', '5101', '510012', '400012001', '', 'aed', 'usd'], ['5100', '', '', '400012001', '', '', '']]);
    expect(rows).toEqual([{ VKORG: '5100', WERKS: '5101', KUNNR: '0000510012', MATNR: '000000000400012001', CHARG: '', L_WAERK: 'AED', B_WAERK: 'USD' }]);
    expect(errors).toEqual(['Row 3: Customer empty']);
  });

  it('round-trips the generated templates through the .xlsx parser and refuses non-xlsx data', () => {
    const rates = parseRateFile(templateWorkbook(RATE_COLUMNS, sampleRateRows()));
    expect(rates.errors).toEqual([]);
    expect(rates.rows).toHaveLength(2);
    const sim = parseSimulationFile(templateWorkbook(SIM_INPUT_COLUMNS, sampleSimRows()));
    expect(sim.rows).toHaveLength(4);
    expect(() => parseRateFile(new TextEncoder().encode('a,b,c\n1,2,3').buffer as ArrayBuffer)).toThrow(ExcelParseError);
  });

  it('reads real Excel date cells (serials) as dates', () => {
    const header = RATE_COLUMNS.map((c) => c.label);
    const row = sampleRateRows()[0];
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const vf = XLSX.utils.encode_cell({ r: 1, c: RATE_COLUMNS.findIndex((c) => c.key === 'VFROM') });
    ws[vf] = { t: 'n', v: 46113, z: 'dd.mm.yyyy' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const { rows } = parseRateFile(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    expect(rows[0].VFROM).toBe('20260401');
  });
});

describe('format and columns', () => {
  it('formats numeric keys with 2 decimals, leaves condition types and codes as text', () => {
    expect(isNumericKey('ZCIF_AFTER_AP')).toBe(true);
    expect(isNumericKey('ZRRP_KBETR')).toBe(true);
    expect(isNumericKey('ZAP_KSCHL')).toBe(false);
    expect(isNumericKey('MATNR')).toBe(false);
    expect(cellText('ZCIF', 1234.5)).toEqual({ text: '1,234.50', numeric: true });
    expect(cellText('ZAP_KSCHL', 'ZAP')).toEqual({ text: 'ZAP', numeric: false });
    expect(cellText('VALIDFROM', '20260401').text).toBe('01.04.2026');
    expect(cellText('MATNR', '000000000400012001').text).toBe('400012001');
    expect(isYmd('20260229')).toBe(false);
    expect(isYmd('20280229')).toBe(true);
  });
});

describe('cascade', () => {
  it('builds the cascade and the waterfall adds up to 100% of RRP excl VAT', () => {
    const c = buildCascade({ rrpInclVat: 10.5, vatPct: 5, retailPct: 25, apOnPttPct: 3, damagePct: 1, distMarginPct: 12, dutyPct: 5, cfPct: 4, lcPct: 0.5, daxPct: 1, apPct: 4, fx: 3.6725 });
    expect(c.ZE_RRP_PER_PC).toBe(10);
    expect(c.ZVAT).toBe(0.5);
    expect(c.ZRETAIL).toBe(2.5);
    expect(c.ZPTT).toBe(7.5);
    expect(c.ZRRP_PER_DZ).toBe(126);
    const m = rowMetrics(c)!;
    const total = m.retailPct + m.distPct + m.apPct + m.damagePct + m.landingPct + m.realisationPct;
    expect(total).toBeGreaterThan(99.5);
    expect(total).toBeLessThan(100.5);
    expect(m.fx).toBeCloseTo(3.6725, 1);
  });
});

describe('mock service workflow', () => {
  beforeEach(() => resetMock());

  it('simulates, sends for approval, approves, creates conditions, and keeps version history', async () => {
    const sim = await mockAction({ action: 'RUN_SIM', payload: { ROWS: [{ VKORG: '5100', WERKS: '5101', KUNNR: '0000510012', MATNR: '000000000400012002', CHARG: '', L_WAERK: 'AED', B_WAERK: 'USD' }, { VKORG: '5100', KUNNR: '0000999999', MATNR: '000000000400012001' }, { VKORG: '1100', KUNNR: '0000510012', MATNR: '000000000400012001' }], PARAMS: { BUKRS: '1100', KALSM: 'ZEXPRC', PDATE: '20260601' } } });
    expect(sim.processed).toBe(1);
    expect(sim.failed).toBe(2); // unknown customer; known customer under the wrong sales org
    const priced = JSON.parse(sim.data);
    expect(priced[0]).toMatchObject({ S_LAND1: 'AE', KUNNR: '0000510012', B_WAERK: 'USD' });
    expect(priced[0].ZCIF_AFTER_AP).toBeGreaterThan(0);

    await expect(mockAction({ action: 'SEND_APPROVAL', payload: { ROWS: priced } })).rejects.toThrow(/Valid From/);
    await mockAction({ action: 'SEND_APPROVAL', vfrom: '20261201', vto: '20270331', payload: { ROWS: priced } });
    const review = await mockGetSet('ApprovalSet');
    const mine = review.find((r) => r.KUNNR === '0000510012' && r.MATNR === '000000000400012002' && r.VALIDFROM === '20261201')!;
    expect(mine.LIGHT).toBe('1');

    const approved = await mockAction({ action: 'APPROVE', vfrom: '20261201', vto: '20270331', payload: { ROWS: [mine] } });
    expect(approved.processed).toBe(1);
    const pending = await mockGetSet('ConditionPendingSet');
    const p = pending.find((r) => rowKey(r) === rowKey({ ...mine, VALIDFROM: '20261201', VALIDTO: '20270331' }))!;
    expect(p.LIGHT).toBe('3');

    const created = await mockAction({ action: 'CREATE_COND', payload: { ROWS: [p] } });
    expect(created.processed).toBe(1);
    expect((await mockGetSet('ConditionPendingSet')).some((r) => rowKey(r) === rowKey(p))).toBe(false);

    const hist = JSON.parse((await mockAction({ action: 'COMPARE', payload: { ROWS: [p] } })).data);
    expect(hist.length).toBeGreaterThanOrEqual(3); // seeded v1 and v2, plus the one just created
    expect(Number(hist[0].ZVERSION)).toBeGreaterThan(Number(hist[hist.length - 1].ZVERSION));
  });

  it('rejects, deletes, saves rates and requires a selection', async () => {
    const review = await mockGetSet('ApprovalSet');
    const pick = review.filter((r) => r.LIGHT === '3').slice(0, 2);
    const rej = await mockAction({ action: 'REJECT', payload: { ROWS: pick } });
    expect(rej.processed).toBe(2);
    expect((await mockGetSet('ApprovalSet')).filter((r) => pick.some((p) => rowKey(p) === rowKey(r))).every((r) => r.LIGHT === '1')).toBe(true);
    const del = await mockAction({ action: 'DELETE', payload: { ROWS: pick } });
    expect(del.processed).toBe(2);
    expect((await mockGetSet('ApprovalSet')).length).toBe(review.length - 2);
    const saved = await mockAction({ action: 'SAVE_RATES', payload: { ROWS: parseRateFile(templateWorkbook(RATE_COLUMNS, sampleRateRows())).rows } });
    expect(saved.processed).toBe(2);
    await expect(mockAction({ action: 'APPROVE', vfrom: '20260101', vto: '20261231', payload: { ROWS: [] } })).rejects.toThrow('Select at least one row');
  });
});

describe('kpis', () => {
  beforeEach(() => resetMock());

  it('computes the cascade KPIs on the seeded data', async () => {
    const [review, pending, materials] = await Promise.all([mockGetSet('ApprovalSet'), mockGetSet('ConditionPendingSet'), mockGetSet('CascadeMapSet')]);
    const history = JSON.parse((await mockAction({ action: 'COMPARE', payload: { ROWS: review } })).data);
    const k = computeKpis(review, pending, history, materials, '20261023');
    expect(k.points).toBe(review.length);
    expect(k.red + k.green).toBe(review.length);
    expect(k.conditionPending).toBe(pending.length);
    expect(k.waterfall.reduce((a, s) => a + s.pct, 0)).toBeGreaterThan(99);
    expect(k.waterfall.reduce((a, s) => a + s.pct, 0)).toBeLessThan(101);
    expect(k.byMarket.length).toBe(8);
    expect(k.coveragePct).toBeLessThan(100); // one material has no cascade description
    expect(k.changes.length).toBeGreaterThan(0);
    expect(k.corridor.length).toBeGreaterThan(0);
    expect(k.netPerDz[0].currency).toBe('USD');
  });
});
