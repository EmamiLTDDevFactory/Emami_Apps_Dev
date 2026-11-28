// Transporter e-mail from the SAP vendor master (VendorSet Email/Mobile) -> carrier.email on the master sync. SAP wins; manual is the fallback; never blank.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.HUB_AUTH_JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';
delete process.env.TMS_SAP_ODATA_BASE;
const engine = require('../tmsEngine');
const sap = require('../tmsSap');

const NOW = Date.parse('2026-11-28T10:00:00Z');
function world() {
    const db = engine.emptyDb();
    db.units = [{ id: 'UN13', code: 'UN13', name: 'Guwahati', division: 'East', city: 'Guwahati' }];
    const car = (id, code, name, extra = {}) => ({ id, name, code, type: 'Asset', shortName: name.split(' ')[0].toUpperCase(), paymentTerms: 'Net 30', weightage: 0, blocked: false, rating: 4, fleet: 1, lanes: [], rejectionPct: 0, fulfilledPct: 90, ...extra });
    db.carriers = [car('C001', '100200', 'Elite Roadways', { email: 'manual@elite.in', emailSource: 'manual' }), car('C002', '100207', 'Gati Freight', { email: 'old-sap@gati.in', emailSource: 'sap' }),
        car('C003', '100214', 'Shree Maruti'), car('C004', '100300', 'Typed Only', { email: 'typed@only.in' })];
    db.users = [{ id: 'U1', name: 'Admin', email: 'admin@emamigroup.com', designation: '', roles: ['Admin'], units: ['UN13'], lastSignin: '' }, { id: 'U2', name: 'Alloc', email: 'alloc@emamigroup.com', designation: '', roles: ['Allocation Executive'], units: ['UN13'], lastSignin: '' }];
    return db;
}
const sync = (db, vendors, user = db.users[0]) => engine.apply(db, { type: 'syncMasters' }, user, { sap: { vendors: async () => vendors, customers: async () => [] } }, NOW);
const v = (code, name, email, extra = {}) => ({ code, name, paymentTerms: '', blocked: false, email, mobile: '', ...extra });

test('SAP vendor e-mail overwrites a manual one, lower-cased, and is marked as SAP', async () => {
    const db = world();
    const { result } = await sync(db, [v('100200', 'Elite Roadways', 'Dispatch@Elite-Roadways.IN')]);
    const c = db.carriers.find((x) => x.code === '100200');
    assert.equal(c.email, 'dispatch@elite-roadways.in');
    assert.equal(c.emailSource, 'sap');
    assert.equal(result.emailsFromSap, 1);
});

test('manual e-mail is kept as the fallback when SAP has none, and is never blanked', async () => {
    const db = world();
    const { result } = await sync(db, [v('100200', 'Elite Roadways', ''), v('100300', 'Typed Only', '')]);
    const a = db.carriers.find((x) => x.code === '100200'), b = db.carriers.find((x) => x.code === '100300');
    assert.equal(a.email, 'manual@elite.in'); assert.equal(a.emailSource, 'manual');
    assert.equal(b.email, 'typed@only.in'); assert.equal(b.emailSource, 'manual'); // entered before the source marker existed
    assert.equal(result.emailsKeptManual, 2);
});

test('an e-mail that came from SAP earlier is also kept when SAP later returns none', async () => {
    const db = world();
    await sync(db, [v('100207', 'Gati Freight', '')]);
    const c = db.carriers.find((x) => x.code === '100207');
    assert.equal(c.email, 'old-sap@gati.in');
});

test('an invalid SAP e-mail is ignored (validator of the carrier form) and the existing one stays', async () => {
    const db = world();
    await sync(db, [v('100200', 'Elite Roadways', 'not-an-email'), v('100214', 'Shree Maruti', 'a b@c.in')]);
    assert.equal(db.carriers.find((x) => x.code === '100200').email, 'manual@elite.in');
    assert.equal(db.carriers.find((x) => x.code === '100214').email, undefined);
});

test('a new vendor carrier is created with the SAP e-mail; carriers without any e-mail are counted', async () => {
    const db = world();
    const { result } = await sync(db, [v('900001', 'Brand New Carrier', 'ops@brandnew.in'), v('900002', 'No Mail Carrier', ''), v('100214', 'Shree Maruti', '')]);
    const n = db.carriers.find((x) => x.code === '900001');
    assert.equal(n.email, 'ops@brandnew.in'); assert.equal(n.emailSource, 'sap');
    assert.equal(db.carriers.find((x) => x.code === '900002').email, undefined);
    assert.equal(result.withoutEmail, 2); // 900002 and 100214
    assert.equal(result.carriers, 3);
});

test('only an admin may run the sync', async () => {
    const db = world();
    await assert.rejects(sync(db, [], db.users[1]), (e) => e.status === 403);
});

test('manual carrier edits set the source to manual; clearing removes it', async () => {
    const db = world();
    await sync(db, [v('100207', 'Gati Freight', 'sap@gati.in')]);
    assert.equal(db.carriers.find((x) => x.code === '100207').emailSource, 'sap');
    await engine.apply(db, { type: 'patchCarrier', id: 'C002', patch: { email: 'Typed@Gati.in' } }, db.users[0], {}, NOW);
    const c = db.carriers.find((x) => x.id === 'C002');
    assert.equal(c.email, 'typed@gati.in'); assert.equal(c.emailSource, 'manual');
    await engine.apply(db, { type: 'patchCarrier', id: 'C002', patch: { email: '' } }, db.users[0], {}, NOW);
    assert.equal(c.email, ''); assert.equal(c.emailSource, undefined);
});

test('SAP client: map.vendor carries email (lower-cased) and mobile; simulated vendors include some', async () => {
    assert.deepEqual(sap.map.vendor({ Lifnr: '7', Name1: 'N', Zterm: '', Email: ' Ops@X.IN ', Mobile: '+919830011001' }), { code: '7', name: 'N', paymentTerms: '', blocked: false, email: 'ops@x.in', mobile: '+919830011001' });
    assert.equal(sap.map.vendor({ Lifnr: '8', Name1: 'N' }).email, '');
    const list = await sap.vendors();
    assert.ok(list.some((x) => x.email) && list.some((x) => !x.email));
});
