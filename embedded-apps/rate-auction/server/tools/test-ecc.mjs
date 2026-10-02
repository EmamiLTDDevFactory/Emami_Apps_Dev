// Run:  node tools/test-ecc.mjs
// Tests the ECC (RFC) client and the "save everything in SAP tables" store against a fake ECC.
import assert from 'node:assert/strict';
import { FakeRfc } from '../src/sap/fake-rfc.js';
import { createEngine } from '../src/engine.js';
import { RfcSap, toTs, fromTs, classifyRfcError } from '../src/sap/rfc.js';
import { EccStore } from '../src/sap/ecc-store.js';
import { SapError } from '../src/sap/errors.js';

let n = 0; const ok = (t) => console.log('  ok', ++n, t);
const fake = new FakeRfc(); const sap = new RfcSap(fake); const store = new EccStore(fake);

// --- helpers
const t0 = Date.UTC(2026, 9, 2, 12, 34, 56, 123);
assert.equal(toTs(t0), '20261002123456.1230000'); assert.equal(fromTs('20261002123456.1230000'), t0); assert.equal(fromTs('00000000000000.0000000'), null); ok('timestamps convert to ABAP TIMESTAMPL and back');
assert.equal(classifyRfcError({ name: 'ABAPError', key: 'NOT_FOUND', message: 'Vendor not found' }, true).message, 'Vendor not found'); ok('ABAP exception becomes a readable error');
const c1 = classifyRfcError({ codeString: 'RFC_COMMUNICATION_FAILURE', message: 'x' }, false); assert.ok(c1.retryable && !c1.unknownOutcome); ok('lost connection on a read is retryable');
const c2 = classifyRfcError({ codeString: 'RFC_COMMUNICATION_FAILURE', message: 'x' }, true); assert.ok(c2.unknownOutcome && !c2.retryable); ok('lost connection on a write is "unknown outcome", not retryable');

// --- master data
assert.deepEqual(await sap.ping(), { ok: true, sysid: 'ECD', client: '100' }); ok('ping returns system id and client');
const mats = await sap.getMaterials('VERP'); assert.deepEqual(mats[0], { code: 'PM-200118', desc: 'HDPE bottle 100 ml with cap', type: 'VERP', uom: 'EA', lastRate: null }); ok('materials: code, description, SAP unit PC mapped to EA');
assert.equal((await sap.getMaterials('DIEN'))[0].uom, 'TRIP'); ok('freight unit TRIP kept');
assert.deepEqual(await sap.getLastRate('RM-100245'), { lastRate: 98 }); assert.deepEqual(await sap.getLastRate('X'), { lastRate: null }); ok('last rate found / not found');
assert.deepEqual((await sap.searchVendors('apex')).map((v) => v.code), ['100234']); ok('vendor search strips leading zeros');
assert.deepEqual(await sap.searchVendors(''), []); ok('empty search never dumps the vendor master');
assert.equal((await sap.getVendors(['100287', '100315'])).length, 2); ok('vendors by code');

// --- helper to run a full auction on an engine
const vendors = (await sap.getVendors(['100234', '100287', '100315']));
const mk = async () => {
  const e = createEngine({ empty: true });
  const material = (await sap.getMaterials('DIEN'))[0];
  assert.ok(e.control('create', { materialType: 'DIEN', materialCode: material.code, material, ceiling: 67500, decrement: 500, minutes: 5, threshold: 67500, vendors, demo: false }).ok);
  return e;
};
const e = await mk();
assert.equal(e.adminView().totalBids, 0); ok('real vendors, no demo bids, no bots');
await store.sync(e.snapshot());
assert.equal(fake.t.hdr[0].THRESHOLD, '67500'); ok('threshold is saved in the header');
assert.equal(fake.t.hdr.length, 1); assert.equal(fake.t.vend.length, 3); assert.equal(fake.t.hdr[0].MATNR, 'SV-300021'); assert.equal(fake.t.vend[0].LIFNR, '0000100234'); ok('header and vendors saved in the Z tables (vendor numbers padded like LFA1)');

e.placeBid('v1', 67000); e.placeBid('v2', 66500); e.placeBid('v3', 66000); e.placeBid('v1', 65500);
const before = fake.calls.length; await store.sync(e.snapshot());
assert.equal(fake.t.bid.length, 4); assert.deepEqual(fake.calls.slice(before), ['Z_AUC_SAVE_BIDS', 'Z_AUC_APPEND_LOG']); ok('only changes are sent: new bids and log lines, no header');
const b2 = fake.calls.length; await store.sync(e.snapshot()); assert.equal(fake.calls.length, b2); ok('nothing changed means no SAP call');

// --- save fails, then recovers
e.placeBid('v2', 65000);
fake.failSaves = 1; await assert.rejects(store.sync(e.snapshot()), SapError);
assert.equal(fake.t.bid.length, 4); ok('SAP down: save fails and nothing is marked as saved');
await store.sync(e.snapshot()); assert.equal(fake.t.bid.length, 5); assert.equal(fake.t.log.length, e.snapshot().log.length); ok('SAP back: the same change is sent again, no duplicates');

// --- restart in the middle of the auction
const mid = createEngine({ empty: true }); const store2 = new EccStore(fake);
mid.restore(await store2.load());
assert.deepEqual(mid.adminView(1).ladder.map((l) => [l.name, l.amount]), e.adminView(1).ladder.map((l) => [l.name, l.amount])); ok('after a restart the ladder is rebuilt from SAP tables');
assert.equal(mid.adminView().threshold, 67500); assert.equal(mid.vendorView('v1').threshold, 67500); ok('threshold restored after a restart and shown to vendors');
assert.equal(mid.vendorView('v1').myRank, e.vendorView('v1').myRank); assert.equal(mid.vendorView('v1').alias, e.vendorView('v1').alias); ok('vendor view and aliases are the same after restart');
const r = mid.placeBid('v3', 64500); assert.ok(r.ok && r.bidId === 6); ok('bid numbers continue after restart');
await store2.sync(mid.snapshot()); assert.equal(fake.sent.Z_AUC_SAVE_BIDS.IT_BIDS.length, 1); assert.equal(fake.t.bid.length, 6); ok('after a restart only the new bid is sent, old bids and log lines are not re-sent');

// --- award a vendor who is not the lowest, create docs, mails
mid.control('close');
assert.equal(mid.control('award', { vid: 'v1' }).ok, false);
assert.ok(mid.control('award', { vid: 'v1', reason: 'Better transit time and safety record' }).ok);
const defaults = mid.adminView().sapDefaults.inforecord;
const form = { ...defaults, purchOrg: 'P100', purchGroup: 'G10', plant: 'K100', plannedDelivDays: '3', taxCode: 'V0', incoterms: 'DAP', paymentTerms: 'Z030' };
const prep = mid.prepareSap('inforecord', form); assert.ok(prep.ok);
const doc = await sap.createInfoRecord(prep.payload); mid.recordSap('inforecord', doc.docNo);
const sent = fake.created[0].d;
assert.equal(sent.LIFNR, '0000100234'); assert.equal(sent.MATNR, 'SV-300021'); assert.equal(sent.NETPR, '65500.00'); assert.equal(sent.BPRME, 'TRIP'); assert.equal(sent.VALID_FROM.length, 8); assert.match(sent.AUC_REF, /^AUC-/); ok('info record sent to ECC: vendor, material, awarded rate (not the lowest), dates as yyyymmdd, auction ref');
await assert.rejects(sap.createInfoRecord({ ...prep.payload, form: { ...prep.payload.form, material: 'BLOCKED' } }), /blocked for procurement/); ok('SAP error message from BAPIRET2 is shown');
mid.control('sendMail', { ids: ['winner', 'result-v2', 'internal'] });
await store2.sync(mid.snapshot());
assert.equal(fake.t.doc.find((d) => d.KIND === 'inforecord').DOCNO, doc.docNo); assert.equal(fake.t.mail.length, 3); assert.equal(fake.t.hdr[0].WINNER, '0000100234'); assert.equal(fake.t.hdr[0].AWARD_REASON, 'Better transit time and safety record'); ok('award, reason, SAP document and mails are all saved in SAP tables');

// --- unknown outcome (SAP did not answer a create)
fake.timeoutOn = 'Z_AUC_CREATE_CONTRACT';
const cform = { ...mid.adminView().sapDefaults.contract, purchOrg: 'P100', purchGroup: 'G10', plant: 'K100', incoterms: 'DAP', paymentTerms: 'Z030', targetQty: '100' };
const p2 = mid.prepareSap('contract', cform); assert.ok(p2.ok);
await assert.rejects(sap.createContract(p2.payload), (x) => x.unknownOutcome === true);
mid.markSapUnknown('contract', 'SAP did not answer');
assert.equal(mid.prepareSap('contract', cform).ok, false); ok('unanswered create blocks a second try until an admin checks');
await store2.sync(mid.snapshot()); assert.equal(fake.t.doc.find((d) => d.KIND === 'contract').STATUS, 'U');
const after = createEngine({ empty: true }); after.restore(await new EccStore(fake).load());
assert.equal(after.adminView().sapUnknown.length, 1); assert.equal(after.prepareSap('contract', cform).ok, false); ok('the "check SAP first" warning survives a restart');
assert.equal(after.control('resolveSap', { kind: 'contract', docNo: 'abc' }).ok, false);
assert.ok(after.control('resolveSap', { kind: 'contract', docNo: '4600009777' }).ok); assert.equal(after.adminView().sap.find((d) => d.kind === 'contract').docNo, '4600009777'); ok('admin records the document number found in SAP');
fake.timeoutOn = null;

// --- view after full restart keeps everything
const final = createEngine({ empty: true }); const st3 = new EccStore(fake);
await new EccStore(fake).sync(after.snapshot());
final.restore(await st3.load());
const av = final.adminView(); assert.equal(av.status, 'awarded'); assert.equal(av.winner.name, 'Apex Logistics'); assert.equal(av.winner.lowest, false); assert.equal(av.sap.length, 2); assert.equal(av.mails.filter((m) => m.sent).length, 3); ok('awarded auction with documents and sent mails restored completely');
const vleak = JSON.stringify(final.vendorView('v2')); assert.deepEqual(['Apex', 'BlueLine', 'Coastal', '100234', '0000100'].filter((s) => vleak.includes(s) && !vleak.includes('Dear BlueLine')), []); ok('vendor view of the restored auction leaks no other vendor');

// --- threshold is the highest bid a vendor may place
const t = createEngine({ empty: true });
t.control('create', { materialType: 'DIEN', materialCode: 'SV-300021', material: (await sap.getMaterials('DIEN'))[0], ceiling: 67500, decrement: 500, minutes: 5, threshold: 65000, vendors, demo: false });
const hi = t.placeBid('v1', 65500); assert.equal(hi.ok, false); assert.match(hi.error, /maximum allowed/); assert.equal(t.adminView().totalBids, 0); ok('a bid above the threshold is refused and nothing is recorded');
assert.equal(t.placeBid('v1', 65000).ok, true); ok('a bid exactly at the threshold is accepted');
assert.equal(t.vendorView('v2').nextMax, 65000); assert.equal(t.vendorView('v1').nextMax, 64500); assert.equal(t.vendorView('v2').ceiling, undefined); ok('vendor is told the highest bid allowed, and never sees the ceiling');
assert.equal(t.placeBid('v2', 66000).ok, false); assert.equal(t.placeBid('v2', 64900).ok, true); ok('later bids are also capped');
const saved = new EccStore(fake); await saved.sync(t.snapshot()); assert.equal(fake.t.hdr.find((h) => h.THRESHOLD === '65000').AUCID, t.snapshot().id); ok('refused bids never reach the SAP tables');
assert.equal(createEngine({ empty: true }).control('create', { materialType: 'DIEN', materialCode: 'SV-300021', material: (await sap.getMaterials('DIEN'))[0], ceiling: 67500, decrement: 500, minutes: 5, threshold: 68000, vendors, demo: false }).ok, false); ok('threshold cannot be above the ceiling');
const d = createEngine(); assert.ok(d.adminView().ladder.every((l) => l.amount <= d.adminView().threshold)); ok('demo bidders also respect the threshold');

// --- SAP-side guard (mirrors the ABAP): a bid above the threshold is saved but flagged, never silently dropped
const g = createEngine({ empty: true });
g.control('create', { materialType: 'DIEN', materialCode: 'SV-300021', material: (await sap.getMaterials('DIEN'))[0], ceiling: 67500, decrement: 500, minutes: 5, threshold: 65000, vendors, demo: false });
g.placeBid('v1', 64500);
const snap = g.snapshot(); snap.bids.push({ id: 99, vid: 'v2', amount: 70000, at: Date.now(), void: false }); // a bug or tampering
const gs = new EccStore(fake); await gs.sync(snap);
const rows = fake.t.bid.filter((b) => b.AUCID === snap.id);
assert.equal(rows.find((b) => b.BIDNO === 1).OVER_CAP, ''); assert.equal(rows.find((b) => b.BIDNO === 99).OVER_CAP, 'X'); ok('SAP flags a bid above the threshold (OVER_CAP) instead of dropping it');
const bad = JSON.parse(JSON.stringify(snap)); bad.id = 'AUC-BAD'; bad.threshold = 99999;
await assert.rejects(new EccStore(fake).sync(bad), /INVALID_INPUT/); ok('SAP refuses a header whose threshold is above the ceiling');

console.log('\nAll ' + n + ' checks passed'); process.exit(0);
