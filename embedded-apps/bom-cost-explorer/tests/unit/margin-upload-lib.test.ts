import { describe, expect, it } from 'vitest';
import { KIND_COLUMNS, UPLOAD_KINDS, templateExample, templateHeaders } from '@/lib/margin/uploadKinds';
import { canSave, fingerprint, isClean, nothingSaved, normDay, orderRowResults, parseCsv, parseUploadAnswer, rowPayload, rowsFromGrid, uploadBody, validateRows, type CheckState, type UploadResult } from '@/lib/margin/upload';

const priceGrid = (extra: string[] = []) => [templateHeaders('PRICE'), ['400009226', 'UB01', 'EM01', '10', '2026-11-01', '2026-12-31', 'INR', 'PC', '1', '99', '75', '18', '', ...extra]];

describe('templates', () => {
  it('every kind has headers and one example row of the same length; required columns come first-class', () => {
    for (const k of UPLOAD_KINDS) { expect(templateHeaders(k).length).toBe(templateExample(k).length); expect(templateHeaders(k).length).toBeGreaterThan(3); }
    expect(templateHeaders('PRICE')).toContain('Selling price');
    expect(KIND_COLUMNS.PRICE.find((c) => c.key === 'Mrp')?.type).toBe('decimal');
  });
  it('the example row of every template passes the format check', () => {
    for (const k of UPLOAD_KINDS) {
      const { rows } = rowsFromGrid(k, [templateHeaders(k), templateExample(k)]);
      expect(validateRows(k, rows), k).toEqual([]);
    }
  });
});

describe('reading', () => {
  it('matches columns by header in any order and by property name', () => {
    const { rows, headerFound } = rowsFromGrid('PRICE', [['SellPrice', 'material', 'Valid from', 'Currency', 'Unit'], ['75', '400009226', '2026-11-01', 'INR', 'PC']]);
    expect(headerFound).toBe(true);
    expect(rows[0].cells).toMatchObject({ SellPrice: '75', Matnr: '400009226', ValidFrom: '2026-11-01', Curr: 'INR', Uom: 'PC', Mrp: '' });
    expect(rows[0].rowNo).toBe(2);
  });
  it('without a header the template order is assumed; empty rows are skipped', () => {
    const { rows, headerFound } = rowsFromGrid('VOLUME', [['400009226', 'UB01', '', '', '2026', '11', '1000'], [], ['', '', '']]);
    expect(headerFound).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.Volume).toBe('1000');
  });
  it('csv: delimiter guess, quotes and CRLF', () => {
    expect(parseCsv('Material;Plant\r\n"A;B";UB01\r\n')).toEqual([['Material', 'Plant'], ['A;B', 'UB01']]);
    expect(parseCsv('a,b\n"x ""y""",2')).toEqual([['a', 'b'], ['x "y"', '2']]);
  });
  it('dates: ISO and dd.mm.yyyy, real days only', () => {
    expect(normDay('2026-11-01')).toBe('2026-11-01'); expect(normDay('1.11.2026')).toBe('2026-11-01'); expect(normDay('2026-02-30')).toBeNull(); expect(normDay('x')).toBeNull();
  });
});

describe('format checks (SAP validates the content)', () => {
  it('required columns, numbers, dates, flags, period', () => {
    const g = priceGrid(); g[1][0] = ''; g[1][4] = '31/13/2026'; g[1][10] = 'abc'; g[1][12] = 'Y';
    const issues = validateRows('PRICE', rowsFromGrid('PRICE', g).rows);
    const msgs = issues.map((i) => i.message).join(' | ');
    expect(msgs).toMatch(/Material is required/); expect(msgs).toMatch(/Valid from is not a valid date/); expect(msgs).toMatch(/Selling price is not a number/); expect(msgs).toMatch(/Delete \(X\) must be X/);
    expect(issues.every((i) => i.rowNo === 2)).toBe(true);
    const v = rowsFromGrid('VOLUME', [templateHeaders('VOLUME'), ['M', 'UB01', '', '', '2026', '13', '5', 'PC', '']]).rows;
    expect(validateRows('VOLUME', v).some((i) => /Period must be 1 to 12/.test(i.message))).toBe(true);
  });
  it('an empty file is a problem', () => expect(validateRows('PRICE', [])[0].message).toMatch(/no data rows/));
  it('decimals with thousands separators and trailing minus are numbers', () => {
    const g = priceGrid(); g[1][10] = '1,234.50'; g[1][9] = '12.5-';
    expect(validateRows('PRICE', rowsFromGrid('PRICE', g).rows)).toEqual([]);
  });
});

describe('request body', () => {
  const rows = rowsFromGrid('PRICE', priceGrid()).rows;
  it('Dryrun X = check, empty = save; head and nav property', () => {
    const c = uploadBody('PRICE', rows, true, 'ID1');
    expect(c).toMatchObject({ UploadId: 'ID1', Kind: 'PRICE', UpdMode: 'M', Dryrun: 'X' });
    expect(uploadBody('PRICE', rows, false, 'ID1').Dryrun).toBe('');
    expect(c.UploadRows).toHaveLength(1);
  });
  it('decimals are strings, dates /Date(ms)/, flags X (never booleans), empty cells left out, Rowno = sheet row', () => {
    const g = priceGrid(); g[1][12] = 'x'; g[1][5] = '';
    const p = rowPayload('PRICE', rowsFromGrid('PRICE', g).rows[0]);
    expect(p).toMatchObject({ Rowno: 2, Matnr: '400009226', Mrp: '99', SellPrice: '75', GstPct: '18', DelFlag: 'X', ValidFrom: `/Date(${Date.UTC(2026, 10, 1)})/` });
    expect(typeof p.Mrp).toBe('string'); expect(p).not.toHaveProperty('ValidTo');
    expect(JSON.stringify(p)).not.toMatch(/true|false/);
  });
  it('year and period keep their digits', () => {
    const p = rowPayload('VOLUME', rowsFromGrid('VOLUME', [templateHeaders('VOLUME'), ['m', 'ub01', '', '', '2026', '09', '10']]).rows[0]);
    expect(p).toMatchObject({ Matnr: 'M', Werks: 'UB01', Gjahr: '2026', Poper: '9', Volume: '10' });
  });
});

describe('answer and gating', () => {
  const answer = (status: string, errors: number, rows: { Rowno: number; Status: string; Msg: string }[], saved = 0) => ({ d: { Status: status, Saved: saved, Errors: errors, MsgTxt: 'text', UploadRows: { results: rows } } });
  it('parses Status, Saved, Errors, MsgTxt and a status per row', () => {
    const r = parseUploadAnswer(answer('V', 0, [{ Rowno: 2, Status: 'V', Msg: '' }]), true, 'ID');
    expect(r).toMatchObject({ status: 'V', saved: 0, errors: 0, msgTxt: 'text', dryrun: true });
    expect(r.rows).toEqual([{ rowno: 2, status: 'V', msg: '' }]);
    expect(parseUploadAnswer({ d: {} }, false, 'ID').status).toBe('');
  });
  it('error rows first, then by row number; any error means nothing saved', () => {
    const o = orderRowResults([{ rowno: 2, status: 'V', msg: '' }, { rowno: 5, status: 'E', msg: 'bad' }, { rowno: 3, status: 'E', msg: 'bad' }, { rowno: 1, status: 'V', msg: '' }]);
    expect(o.map((x) => x.rowno)).toEqual([3, 5, 1, 2]);
    const e = parseUploadAnswer(answer('E', 2, []), false, 'ID');
    expect(nothingSaved(e)).toBe(true); expect(isClean(e)).toBe(false);
    expect(nothingSaved(parseUploadAnswer(answer('S', 0, [{ Rowno: 2, Status: 'E', Msg: 'x' }], 0), false, 'ID'))).toBe(true);
  });
  it('Save only after a clean check (Dryrun X) of exactly the same rows', () => {
    const rows = rowsFromGrid('PRICE', priceGrid()).rows;
    const clean: UploadResult = { status: 'V', saved: 0, errors: 0, msgTxt: '', rows: [], uploadId: 'a', dryrun: true };
    const chk: CheckState = { fingerprint: fingerprint('PRICE', rows), result: clean };
    expect(canSave('PRICE', rows, null, [])).toBe(false);
    expect(canSave('PRICE', rows, chk, [])).toBe(true);
    const changed = rowsFromGrid('PRICE', (() => { const g = priceGrid(); g[1][10] = '76'; return g; })()).rows;
    expect(canSave('PRICE', changed, chk, [])).toBe(false); // rows changed after the check
    expect(canSave('PRICE', rows, { ...chk, result: { ...clean, errors: 1, status: 'E' } }, [])).toBe(false);
    expect(canSave('PRICE', rows, { ...chk, result: { ...clean, dryrun: false } }, [])).toBe(false); // a save result is not a check
    expect(canSave('PRICE', rows, chk, [{ rowNo: 2, field: 'x', message: 'y' }])).toBe(false);
  });
});
