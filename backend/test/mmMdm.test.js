const test = require('node:test');
const assert = require('node:assert/strict');

// requireUser needs a database pool and a JWT secret only when a request arrives; the pure mapping helpers load without them.
process.env.HUB_AUTH_JWT_SECRET ||= 'test-secret';
const router = require('../mmMdm');
const sap = require('../mmMdmSap');
const { toProp, toName, fromOData, toOData, key, writeOps, header, toMessages } = router._test;

test('ABAP names <-> OData property names', () => {
    assert.equal(toProp('MTART'), 'Mtart');
    assert.equal(toProp('SERIAL_NO'), 'SerialNo');
    assert.equal(toName('SerialNo'), 'SERIAL_NO');
    assert.equal(toName('Mtart'), 'MTART');
});

test('a TransId is never sent and never read back as a field', () => {
    assert.deepEqual(toOData('Material', { TRANSID: '1', MTART: 'FERT' }), { Mtart: 'FERT' });
    assert.deepEqual(fromOData('Material', { __metadata: {}, TransId: '1', Mtart: 'FERT', Nav: { __deferred: {} } }), { MTART: 'FERT' });
});

test('keys of single and multi row entities', () => {
    assert.equal(key('Material', '0000000001'), "MaterialSet(TransId='0000000001')");
    assert.equal(key('UnitOfMeasure', '0000000001', { MEINH: 'KG' }), "UnitOfMeasureSet(TransId='0000000001',Meinh='KG')");
    assert.equal(key('LongText', "00'1", { MATNR: 'M', FID: 'F' }), "LongTextSet(TransId='00''1',Matnr='M',Fid='F')");
});

test('multi row writes: update the kept row, create the new one, delete the removed one', () => {
    const existing = { single: {}, multi: { UnitOfMeasure: [{ MEINH: 'KG' }, { MEINH: 'PC' }] }, views: [] };
    const data = { single: {}, multi: { UnitOfMeasure: [{ MEINH: 'KG', UMREZ: 2 }, { MEINH: 'BOX', UMREZ: 10 }] }, views: ['MARA_BASIC1'] };
    const ops = writeOps('0000000001', data, existing);
    assert.deepEqual(ops.map((o) => o.method), ['MERGE', 'POST', 'DELETE', 'MERGE']);
    assert.equal(ops[0].path, "UnitOfMeasureSet(TransId='0000000001',Meinh='KG')");
    assert.equal(ops[1].body.TransId, '0000000001');
    assert.equal(ops[2].path, "UnitOfMeasureSet(TransId='0000000001',Meinh='PC')");
    const last = ops[3];
    assert.equal(last.path, "ViewSelectionSet(TransId='0000000001')");
    assert.equal(last.body.MaraBasic1, true);
    assert.equal(last.body.MaraBasic2, false);
});

test('the client never decides status, routing keys, initiator or work item: the header only reads them', () => {
    const h = header({ TransId: '1', AppId: 'MC', Status: '02', Initiator: 'X', WorkItemId: '9', GenType: 'FERT' });
    assert.equal(h.statusText, 'In progress');
    assert.equal(h.initiator, 'X');
    assert.equal(h.genType, 'FERT');
});

test('all messages of a failed action come back together, with their targets', () => {
    const body = { error: { code: 'X', message: { value: 'Validation failed' }, innererror: { errordetails: [
        { code: 'E027', message: 'Net weight above gross weight', severity: 'error', target: 'Material/NTGEW' },
        { code: 'W001', message: 'Check the HSN', severity: 'warning', target: 'Material/STEUC' },
        { code: 'E010', message: 'Row 2: unit missing', severity: 'error', target: 'UnitOfMeasure[2]/MEINH' },
    ] } } };
    const m = sap.mapError(body, 400);
    assert.equal(m.text, 'Validation failed');
    assert.deepEqual(m.messages.map((x) => [x.code, x.severity, x.target]), [['E027', 'E', 'Material/NTGEW'], ['W001', 'W', 'Material/STEUC'], ['E010', 'E', 'UnitOfMeasure[2]/MEINH']]);
    assert.deepEqual(toMessages([{ Code: 'E1', Message: 'm', Severity: 'e', Target: 'Plant/DISMM' }]), [{ code: 'E1', message: 'm', severity: 'E', target: 'Plant/DISMM' }]);
});

test('a batch answer with a failed part raises the SAP error with all its messages', () => {
    const text = [
        '--b', 'Content-Type: application/http', '', 'HTTP/1.1 200 OK', 'Content-Type: application/json', '', '{"d":{}}',
        '--b', 'Content-Type: application/http', '', 'HTTP/1.1 400 Bad Request', 'Content-Type: application/json', '',
        '{"error":{"message":{"value":"Rejected"},"innererror":{"errordetails":[{"code":"E1","message":"One","severity":"error","target":"Plant/WERKS"}]}}}', '--b--', ''
    ].join('\r\n');
    assert.throws(() => sap.parseBatch(text), (e) => e.status === 400 && e.messages.length === 1 && e.messages[0].target === 'Plant/WERKS');
});

test('authentication towards SAP lives in one function', async () => {
    delete process.env.MM_SAP_AUTH;
    assert.deepEqual(await sap.sapAuth({ user: 'a@b.c' }), { 'X-Emami-User': 'a@b.c' });
    process.env.MM_SAP_AUTH = 'basic'; process.env.MM_SAP_USER = 'u'; process.env.MM_SAP_PASSWORD = 'p';
    assert.equal((await sap.sapAuth({ user: 'a@b.c' })).Authorization, `Basic ${Buffer.from('u:p').toString('base64')}`);
    delete process.env.MM_SAP_USER; delete process.env.MM_SAP_PASSWORD;
    process.env.MM_SAP_AUTH = 'bearer';
    await assert.rejects(sap.sapAuth({ user: 'a@b.c' }), (e) => e.status === 503 && /not configured/.test(e.message)); // no provider named yet
    sap.setTokenProvider(async (c) => `tok-for-${c.user}`);
    assert.deepEqual(await sap.sapAuth({ user: 'a@b.c' }), { Authorization: 'Bearer tok-for-a@b.c' }); // server side only
    sap.setTokenProvider(async () => '');
    await assert.rejects(sap.sapAuth({ user: 'a@b.c' }), (e) => e.status === 401);
    sap.setTokenProvider(null);
    delete process.env.MM_SAP_AUTH;
});
