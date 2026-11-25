const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../orderToCashCore');
const { cleanLines, cleanHeader } = require('../orderToCash');

test('dates: Indian day-first formats, ISO, month names; nonsense is blank', () => {
  assert.equal(core.toYmd('05/11/2026'), '20261105');
  assert.equal(core.toYmd('5-11-26'), '20261105');
  assert.equal(core.toYmd('2026-11-05'), '20261105');
  assert.equal(core.toYmd('05.11.2026'), '20261105');
  assert.equal(core.toYmd('5 Nov 2026'), '20261105');
  assert.equal(core.toYmd('31/02/2026'), '');
  assert.equal(core.toYmd('soon'), '');
});

test('numbers: Indian grouping, currency text; words are null', () => {
  assert.equal(core.num('1,23,456.50'), 123456.5);
  assert.equal(core.num('Rs. 99'), 99);
  assert.equal(core.num('₹ 1,000'), 1000);
  assert.equal(core.num('twelve'), null);
  assert.equal(core.num(''), null);
});

test('normalizeExtraction: lines numbered, arithmetic checked, missing PO number and total gap warned', () => {
  const r = core.normalizeExtraction({
    customer_name: ' Reliance Retail ', po_number: '', po_date: '01/11/2026', total_amount: '5000',
    lines: [
      { customer_material: 'A1', ean: '8901-248-000011', description: 'Boroplus 40ml', qty: '10', uom: 'ea', unit_price: '50', amount: '500' },
      { customer_material: 'A2', qty: '', unit_price: '20', amount: '200' },
      { customer_material: 'A3', qty: '3', unit_price: '10', amount: '100' },
    ],
  });
  assert.equal(r.header.CUSTOMER_NAME, 'Reliance Retail');
  assert.equal(r.header.PO_DATE, '20261101');
  assert.deepEqual(r.lines.map((l) => l.LINE), [10, 20, 30]);
  assert.equal(r.lines[0].EAN, '8901248000011');
  assert.equal(r.lines[0].UOM, 'EA');
  assert.deepEqual(r.lines[0].READ_FLAGS, []);
  assert.deepEqual(r.lines[1].READ_FLAGS, ['QTY_UNREAD']);
  assert.deepEqual(r.lines[2].READ_FLAGS, ['AMOUNT_CHECK']);
  assert.ok(r.warnings.some((w) => /PO number/.test(w)));
  assert.ok(r.warnings.some((w) => /add up to 800/.test(w)));
});

const po = (lines, header = {}) => ({ header: { KUNNR: '0000100001', BSTKD: 'PO1', ...header }, lines });

test('applyValidation: clean PO is ready', () => {
  const v = core.applyValidation(po([{ LINE: 10, QTY: 12, PRICE: 50 }]), { HEADER: { KUNNR_OK: 'X', NAME1: 'ABC' }, LINES: [{ LINE: 10, MATNR: '000000000040000001', SAP_PRICE: 50, ROUND_QTY: 12, ATP_QTY: 100 }] });
  assert.equal(v.status, 'ready');
  assert.equal(v.open, 0);
  assert.equal(v.header.NAME1, 'ABC');
});

test('applyValidation: unmapped material and duplicate PO block; credit block only warns', () => {
  const v = core.applyValidation(po([{ LINE: 10, QTY: 5, PRICE: 10 }]), { HEADER: { KUNNR_OK: 'X', DUPLICATE_SO: '0000012345', CREDIT_BLOCK: 'X' }, LINES: [{ LINE: 10, MAT_OK: 'N' }] });
  assert.equal(v.status, 'exceptions');
  assert.deepEqual(v.header.EXCEPTIONS.sort(), ['CREDIT_BLOCK', 'DUPLICATE_PO']);
  assert.deepEqual(v.lines[0].EXCEPTIONS, ['MATERIAL_NOT_FOUND']);
  assert.equal(v.blocking, 2);
});

test('applyValidation: auto amendment rounds to case lot (down, never zero) and takes the SAP price; listed for the customer', () => {
  const sapAns = { HEADER: { KUNNR_OK: 'X' }, LINES: [{ LINE: 10, MATNR: 'M1', SAP_PRICE: 100, ROUND_QTY: 24 }, { LINE: 20, MATNR: 'M2', SAP_PRICE: 10, ROUND_QTY: 24 }] };
  const v = core.applyValidation(po([{ LINE: 10, QTY: 50, PRICE: 98 }, { LINE: 20, QTY: 6, PRICE: 10 }]), sapAns);
  assert.equal(v.lines[0].QTY, 48);
  assert.equal(v.lines[0].PRICE, 100);
  assert.equal(v.lines[1].QTY, 24);
  assert.equal(v.amendments.length, 1);
  assert.equal(v.amendments[0].PO_PRICE, 98);
  assert.equal(v.status, 'ready');
  // re-validation keeps the customer amendment list although the price now matches
  const again = core.applyValidation({ header: v.header, lines: v.lines }, sapAns);
  assert.equal(again.amendments.length, 1);
  assert.equal(again.amendments[0].PO_PRICE, 98);
});

test('applyValidation: without auto amendment the mismatches stay as warnings; overrides clear warnings only', () => {
  const sapAns = { HEADER: { KUNNR_OK: 'X' }, LINES: [{ LINE: 10, MATNR: 'M1', SAP_PRICE: 100, ROUND_QTY: 24, ATP_QTY: 10 }] };
  const v = core.applyValidation(po([{ LINE: 10, QTY: 50, PRICE: 90 }]), sapAns, { autoAmend: false });
  assert.deepEqual(v.lines[0].EXCEPTIONS.sort(), ['CASE_LOT', 'PRICE_MISMATCH', 'STOCK_SHORT']);
  assert.equal(v.status, 'ready');
  const o = core.applyValidation(po([{ LINE: 10, QTY: 50, PRICE: 90, OVERRIDE: ['PRICE_MISMATCH', 'MATERIAL_NOT_FOUND'] }]), sapAns, { autoAmend: false });
  assert.deepEqual(o.lines[0].EXCEPTIONS.sort(), ['CASE_LOT', 'STOCK_SHORT']);
});

test('applyValidation: dropped lines carry nothing; a PO with every line dropped is not ready', () => {
  const v = core.applyValidation(po([{ LINE: 10, QTY: 5, DROPPED: true }]), { HEADER: { KUNNR_OK: 'X' }, LINES: [] });
  assert.equal(v.lines[0].EXCEPTIONS.length, 0);
  assert.equal(v.status, 'exceptions');
});

test('applyValidation: expired PO date warns', () => {
  const v = core.applyValidation(po([{ LINE: 10, QTY: 1, PRICE: 1 }], { DELIVERY_DATE: '20261101' }), { HEADER: { KUNNR_OK: 'X' }, LINES: [{ LINE: 10, MATNR: 'M' }] }, { today: '20261125' });
  assert.deepEqual(v.header.EXCEPTIONS, ['PO_EXPIRED']);
  assert.equal(v.status, 'ready');
});

test('createSoPayload: only ready POs, only kept lines, sold-to as ship-to by default', () => {
  assert.throws(() => core.createSoPayload({ status: 'exceptions', header: {}, lines: [] }, 'r'), /Ready/);
  const p = core.createSoPayload({ status: 'ready', header: { KUNNR: '1', BSTKD: 'PO9', VKORG: '1000' }, lines: [{ LINE: 10, MATNR: 'M', QTY: 2, PRICE: 5 }, { LINE: 20, MATNR: 'X', QTY: 1, DROPPED: true }] }, 'req-1');
  assert.equal(p.REQUEST_ID, 'req-1');
  assert.equal(p.HEADER.KUNWE, '1');
  assert.deepEqual(p.ITEMS.map((i) => i.POSNR), ['000010']);
  assert.throws(() => core.createSoPayload({ status: 'ready', header: {}, lines: [{ LINE: 10, MATNR: '', QTY: 1 }] }, 'r'), /no material/);
});

test('matchCash: reference match exact / short / over, amount-only match, unmatched; open item used once', () => {
  const open = [
    { BELNR: 'A', KUNNR: '0000000001', XBLNR: 'INV-100', VBELN: '0090000100', DMBTR: 1000 },
    { BELNR: 'B', KUNNR: '0000000001', XBLNR: 'INV-101', VBELN: '0090000101', DMBTR: 500 },
    { BELNR: 'C', KUNNR: '0000000002', XBLNR: 'INV-102', VBELN: '0090000102', DMBTR: 777 },
  ];
  const r = core.matchCash(open, [
    { REF: 'inv100', AMOUNT: 1000 },
    { REF: '90000101', AMOUNT: '450' },
    { REF: 'INV-100', AMOUNT: 1000 },
    { REF: 'nothing', AMOUNT: 777 },
    { REF: 'nothing', AMOUNT: 5 },
  ]);
  assert.deepEqual(r.map((x) => x.STATUS), ['MATCHED', 'SHORT_PAID', 'UNMATCHED', 'AMOUNT_MATCH', 'UNMATCHED']);
  assert.equal(r[1].DIFFERENCE, -50);
  assert.equal(r[3].BELNR, 'C');
});

test('reconcileGrn: short, rejected, excess, no GRN and not invoiced, keyed by EAN or material', () => {
  const inv = [
    { VBELN: '90000001', MATNR: 'M1', EAN11: '111', FKIMG: 10, NETPR: 5 },
    { VBELN: '90000001', MATNR: 'M2', EAN11: '222', FKIMG: 10, NETPR: 2 },
    { VBELN: '90000001', MATNR: 'M3', FKIMG: 4, NETPR: 1 },
    { VBELN: '90000001', MATNR: 'M4', FKIMG: 1, NETPR: 1 },
  ];
  const r = core.reconcileGrn(inv, [
    { INVOICE: '0090000001', EAN: '111', RECEIVED: 8 },
    { INVOICE: '90000001', MATNR: 'M2', RECEIVED: 8, REJECTED: 2 },
    { INVOICE: '90000001', MATNR: 'M3', RECEIVED: 5 },
    { INVOICE: '90000001', MATNR: 'ZZ', RECEIVED: 1 },
  ]);
  const by = Object.fromEntries(r.map((x) => [x.MATNR, x]));
  assert.equal(by.M1.STATUS, 'SHORT');
  assert.equal(by.M1.VALUE_AT_RISK, 10);
  assert.equal(by.M2.STATUS, 'REJECTED');
  assert.equal(by.M2.VALUE_AT_RISK, 4);
  assert.equal(by.M3.STATUS, 'EXCESS');
  assert.equal(by.M4.STATUS, 'NO_GRN');
  assert.equal(by.ZZ.STATUS, 'NOT_INVOICED');
});

test('cleanHeader / cleanLines: pads SAP numbers, rejects bad dates and duplicate lines, keeps only warning overrides', () => {
  const h = cleanHeader({ KUNNR: '100001', PO_DATE: '20261101', OVERRIDE: ['CREDIT_BLOCK', 'DUPLICATE_PO'] });
  assert.equal(h.KUNNR, '0000100001');
  assert.deepEqual(h.OVERRIDE, ['CREDIT_BLOCK']);
  assert.throws(() => cleanHeader({ PO_DATE: '1/11/2026' }), /YYYYMMDD/);
  const l = cleanLines([{ LINE: 10, MATNR: '40000001', QTY: '5' }]);
  assert.equal(l[0].MATNR, '000000000040000001');
  assert.equal(l[0].QTY, 5);
  assert.throws(() => cleanLines([{ LINE: 10 }, { LINE: 10 }]), /twice/);
});

const sapc = require('../orderToCashSap');
test('SOAP-RFC: envelope escapes the JSON; EV_RESULT parsed; ABAP ERROR and SOAP faults become errors', () => {
  const env = sapc.buildEnvelope('Z_SD_O2C_ACTION', 'PING', '{"A":"<x>&"}', 'r1');
  assert.match(env, /<IV_PAYLOAD>\{&quot;A&quot;:&quot;&lt;x&gt;&amp;&quot;\}<\/IV_PAYLOAD>/);
  assert.match(env, /<urn:Z_SD_O2C_ACTION>/);
  assert.deepEqual(sapc.parseEnvelope(200, '<x><EV_RESULT>{&quot;SYSTEM&quot;:&quot;EDS&quot;,&quot;T&quot;:&quot;a&amp;b&quot;}</EV_RESULT></x>'), { SYSTEM: 'EDS', T: 'a&b' });
  assert.throws(() => sapc.parseEnvelope(200, '<EV_RESULT>{"ERROR":"Unknown action X"}</EV_RESULT>'), /Unknown action X/);
  assert.throws(() => sapc.parseEnvelope(500, '<soap:Fault><faultstring>Function module not found</faultstring></soap:Fault>'), /not found/);
  assert.throws(() => sapc.parseEnvelope(401, ''), /401/);
});
