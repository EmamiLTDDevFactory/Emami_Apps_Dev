// Run:  node tools/test-sap.mjs
// Tests the real OData client against the fake SAP server above.
import assert from 'node:assert/strict';
import { startFakeSap } from './fake-sap.mjs';
import { ODataSap } from '../src/sap/odata.js';
import { SapError } from '../src/sap/errors.js';
import { toInfoRecordBody, toContractBody, sapDate } from '../src/sap/mappings.js';

const { server, state, url } = await startFakeSap();
const mk = (o = {}) => new ODataSap({ baseUrl: url, sapClient: '100', auth: 'basic', user: 'sapuser', password: 'secret', timeoutMs: 800, lang: 'EN', ...o });
const sap = mk();
let n = 0; const ok = (name) => console.log('  ok', ++n, name);

const payloadIR = { kind: 'inforecord', auctionRef: 'AUC-TEST', form: { vendorCode: '100234', material: 'RM-100245', infoCategory: 'Standard', purchOrg: 'P100', purchGroup: 'G10', plant: 'K100', netPrice: '98.5', currency: 'INR', priceUnit: '1', uom: 'KG', plannedDelivDays: '3', taxCode: 'V0', incoterms: 'DAP', paymentTerms: 'Z030', validFrom: '2026-10-02', validTo: '2027-10-01' } };
const payloadC = { kind: 'contract', auctionRef: 'AUC-TEST', form: { ...payloadIR.form, contractType: 'WK – Quantity contract', shortText: 'Liquid paraffin, light', targetQty: '5000' } };

await sap.ping(); ok('ping works with basic auth');
await assert.rejects(mk({ password: 'wrong' }).ping(), (e) => e instanceof SapError && /Logon failed/.test(e.message)); ok('wrong password gives a readable SAP error');

const mats = await sap.getMaterials('ROH');
assert.equal(mats.length, 3); ok('follows server paging (__next): 3 materials over 2 pages');
assert.equal(mats[0].desc, 'Liquid paraffin, light'); ok('picks the English description, not the first one (DE)');
assert.equal(mats[0].code, 'RM-100245'); assert.equal(mats[0].uom, 'KG'); ok('maps code and unit');
assert.deepEqual(await sap.getMaterials('VERP'), []); ok('empty type returns an empty list');

assert.deepEqual(await sap.getLastRate('RM-100245'), { lastRate: 98 }); ok('last rate = lowest positive net price (ignores 0.00)');
assert.deepEqual(await sap.getLastRate('NOPE'), { lastRate: null }); ok('no info record gives null, not an error');

const ir = await sap.createInfoRecord(payloadIR); assert.match(ir.docNo, /^5300009/); ok('info record created with CSRF token and cookie: ' + ir.docNo);
const b = state.infoRecords[0].body;
assert.equal(b.Supplier, '0000100234'); assert.equal(b.to_PurgInfoRecdOrgPlantData.results[0].NetPriceAmount, '98.50'); assert.equal(b.PurchasingInfoRecordCategory, '0'); ok('payload mapping: vendor padded to 10 digits, decimals as strings, category code');
const c = await sap.createContract(payloadC); assert.match(c.docNo, /^4600009/); ok('contract created: ' + c.docNo);
const cb = state.contracts[0].body;
assert.equal(cb.PurchaseContractType, 'WK'); assert.equal(cb.to_PurchaseContractItem.results[0].TargetQuantity, '5000.000'); assert.match(cb.to_PurchaseContractItem.results[0].PurchaseContractItemText, /AUC-TEST$/); ok('contract mapping: type WK, quantity, auction ref in item text');
assert.equal(sapDate('2026-10-02'), '/Date(' + Date.UTC(2026, 9, 2) + ')/'); ok('date literal format');

await assert.rejects(sap.createInfoRecord({ ...payloadIR, form: { ...payloadIR.form, material: 'REJECT' } }), (e) => e instanceof SapError && /blocked for procurement/.test(e.message) && /flagged for deletion/.test(e.message) && !e.unknownOutcome); ok('business error from SAP is surfaced with detail lines');
const before = state.calls.filter((x) => x.startsWith('POST')).length;
await assert.rejects(mk({ timeoutMs: 400 }).createInfoRecord({ ...payloadIR, form: { ...payloadIR.form, material: 'SLOW' } }), (e) => e instanceof SapError && e.unknownOutcome === true); ok('timeout after sending is flagged unknownOutcome');
assert.equal(state.calls.filter((x) => x.startsWith('POST')).length - before, 1); ok('writes are never retried automatically (exactly 1 POST)');

const dead = new ODataSap({ baseUrl: 'http://127.0.0.1:1', auth: 'basic', user: 'a', password: 'b', timeoutMs: 300 });
await assert.rejects(dead.getMaterials('ROH'), (e) => e instanceof SapError && e.retryable); ok('unreachable SAP: read retried 3 times then a clear error');
await assert.rejects(dead.createContract(payloadC), (e) => e instanceof SapError && e.retryable && !e.unknownOutcome); ok('unreachable SAP on write: safe to retry (nothing was sent)');

server.close(); console.log('\nAll ' + n + ' checks passed');
process.exit(0);
