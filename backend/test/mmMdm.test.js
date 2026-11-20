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

test('attachments: transport guards (name, empty, size, type) answer before SAP is called', () => {
    const { checkUpload, MAX_UPLOAD_BYTES } = router._test;
    assert.equal(checkUpload('spec.pdf', 100), null);
    assert.equal(checkUpload('', 100).status, 400);
    assert.equal(checkUpload('a/b.pdf', 100).status, 400);
    assert.equal(checkUpload('spec.pdf', 0).status, 400);
    assert.equal(checkUpload('spec.pdf', MAX_UPLOAD_BYTES + 1).status, 413);
    assert.equal(checkUpload('run.exe', 100).status, 415);
    assert.equal(checkUpload('UPPER.PDF', 100), null);
});

test('attachments and comments: OData rows become screen items, dates as ISO', () => {
    const { toAttachment, toComment } = router._test;
    assert.deepEqual(toAttachment({ AttachId: 'A1', FileName: 'x.pdf', MimeType: 'application/pdf', Size: 12, UploadedBy: 'U', UploadedAt: '/Date(1793232000000)/', Lvl: 'L1' }),
        { attachId: 'A1', fileName: 'x.pdf', mimeType: 'application/pdf', size: 12, uploadedBy: 'U', uploadedAt: '2026-10-29T00:00:00.000Z', level: 'L1' });
    assert.deepEqual(toComment({ CommentId: 'C1', Text: 't', UserId: 'U', CreatedAt: '/Date(1793232000000)/', Lvl: 'L2' }),
        { commentId: 'C1', text: 't', user: 'U', createdAt: '2026-10-29T00:00:00.000Z', level: 'L2' });
});

test('upload: the file goes as base64 text of AttachmentFileSet (the proxy drops raw bodies); the client never supplies uploader, time or level', async () => {
    process.env.MM_SAP_ODATA_BASE = 'https://gw.example/api/NGQ/ZMM_MDM_SRV';
    const calls = [];
    const realFetch = global.fetch;
    global.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
        if (String(url).includes('RequestSet?')) return new Response(JSON.stringify({ d: { results: [{ TransId: '0000000001', AppId: 'MC' }] } }), { status: 200 });
        if (String(url).endsWith('/AttachmentFileSet') && init.method === 'POST') return new Response(JSON.stringify({ d: { TransId: '0000000001', AttachId: 'A1', FileName: 'My file.pdf' } }), { status: 201 });
        if (String(url).includes('AttachmentSet?')) return new Response(JSON.stringify({ d: { results: [{ TransId: '0000000001', AttachId: 'A1', FileName: 'My file.pdf', MimeType: 'application/pdf', Size: '3' }] } }), { status: 200 });
        if (String(url).includes('AttachmentFileSet?')) return new Response(JSON.stringify({ d: { results: [{ AttachId: 'A1', Content: Buffer.from('abc').toString('base64'), MimeType: 'application/pdf' }] } }), { status: 200 });
        return new Response('{}', { status: 200, headers: { 'x-csrf-token': 't' } });
    };
    try {
        const out = await router._test.service.addAttachment({ user: 'a@b.c' }, '0000000001', Buffer.from('abc'), 'My file.pdf', 'application/pdf');
        assert.equal(out.attachId, 'A1');
        assert.equal(out.fileName, 'My file.pdf');
        const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/AttachmentFileSet'));
        assert.ok(post, 'the file is posted to AttachmentFileSet');
        assert.deepEqual(JSON.parse(post.body), { TransId: '0000000001', FileName: 'My file.pdf', MimeType: 'application/pdf', Content: Buffer.from('abc').toString('base64') });
        assert.equal(JSON.stringify(post.headers).includes('UploadedBy'), false);
        const back = await router._test.service.readAttachment({ user: 'a@b.c' }, '0000000001', 'A1');
        assert.equal(Buffer.from(back.bytes).toString(), 'abc');
        assert.equal(back.mimeType, 'application/pdf');
        await assert.rejects(router._test.service.addAttachment({ user: 'a@b.c' }, '0000000001', Buffer.from('abc'), 'run.exe', 'x'), (e) => e.status === 415);
    } finally { global.fetch = realFetch; delete process.env.MM_SAP_ODATA_BASE; }
});

test('comment: only the text is sent', async () => {
    process.env.MM_SAP_ODATA_BASE = 'https://gw.example/api/NGQ/ZMM_MDM_SRV';
    let posted;
    const realFetch = global.fetch;
    global.fetch = async (url, init = {}) => {
        if (String(url).endsWith('/CommentSet') && init.method === 'POST') { posted = JSON.parse(init.body); return new Response(JSON.stringify({ d: { CommentId: 'C1', Text: 'hi', UserId: 'U' } }), { status: 201 }); }
        return new Response('{}', { status: 200, headers: { 'x-csrf-token': 't' } });
    };
    try {
        const c = await router._test.service.addComment({ user: 'a@b.c' }, '0000000001', '  hi  ');
        assert.deepEqual(posted, { TransId: '0000000001', Text: 'hi' });
        assert.equal(c.user, 'U');
        await assert.rejects(router._test.service.addComment({ user: 'a@b.c' }, '0000000001', '   '), (e) => e.status === 400);
    } finally { global.fetch = realFetch; delete process.env.MM_SAP_ODATA_BASE; }
});

test('the allowed actions include attach and comment, read from SAP flags', () => {
    const h = router._test.asAllowed({ CanAttach: true, CanComment: false });
    assert.equal(h.attach, true);
    assert.equal(h.comment, false);
    assert.equal(h.approve, false);
});

test('sequential writes (gateway without $batch): MERGE goes as PUT, a row removal is refused before anything is written', async () => {
    process.env.MM_SAP_ODATA_BASE = 'https://gw.example/api/NGD/ZMM_MDM_SRV_SRV';
    process.env.MM_SAP_WRITE = 'sequential';
    const calls = [];
    const realFetch = global.fetch;
    global.fetch = async (url, init = {}) => { calls.push(`${init.method || 'GET'} ${String(url).replace('https://gw.example/api/NGD/ZMM_MDM_SRV_SRV/', '')}`); return new Response('{"d":{"results":[]}}', { status: 200, headers: { 'content-type': 'application/json' } }); };
    try {
        await sap.runWrites({ user: 'a@b.c' }, [{ method: 'MERGE', path: "MaterialSet(TransId='1')", body: { Mtart: 'FERT' } }, { method: 'POST', path: 'UnitOfMeasureSet', body: {} }, { method: 'POST', path: "Submit?TransId='1'" }]);
        assert.deepEqual(calls.filter((c) => !c.endsWith('/')), ["PUT MaterialSet(TransId='1')", 'POST UnitOfMeasureSet', "POST Submit%3FTransId%3D'1'"]);
        calls.length = 0;
        await assert.rejects(sap.runWrites({ user: 'a@b.c' }, [{ method: 'MERGE', path: 'X', body: {} }, { method: 'DELETE', path: "UnitOfMeasureSet(TransId='1',Meinh='PC')" }]), (e) => e.status === 501 && e.messages.length === 1);
        assert.equal(calls.filter((c) => c.startsWith('PUT')).length, 0); // nothing was written
    } finally { global.fetch = realFetch; delete process.env.MM_SAP_ODATA_BASE; delete process.env.MM_SAP_WRITE; }
});

test('an SAP error without a text still carries the transaction id for the SAP team', () => {
    const m = sap.mapError({ error: { code: 'X', message: { value: '' }, innererror: { transactionid: 'ABC123', timestamp: '20261103120015.9' } } }, 404);
    assert.match(m.text, /HTTP 404 without a message \(SAP transaction ABC123, 20261103120015\.9\)/);
    assert.equal(m.messages.length, 1);
    assert.equal(m.messages[0].severity, 'E');
});


test('change and extension start: parameters go to the SAP function imports, posted materials are mapped', async () => {
    const { service } = router._test;
    const calls = [];
    const real = { fn: sap.odata.fn, get: sap.odata.get };
    sap.odata.get = async (c, url) => {
        calls.push(['get', url]);
        if (url.startsWith('PostedMaterialSet')) return { d: { results: [{ Matnr: '000000000100003660', Maktx: 'ZZ CLONE', Mtart: 'ROH', Matkl: '214', Meins: 'PC', Busy: 'X' }] } };
        if (url.startsWith('ChangeScopeSet')) return { d: { results: [{ Kind: 'P', Werks: 'UN13', Lgort: 'CG13', WerksTxt: 'Plant' }, { Kind: 'S', Vkorg: '0000', Vtweg: '00' }] } };
        return { d: { results: [{ TransId: '0000026700', AppId: 'MX', Status: '00' }] } };
    };
    sap.odata.fn = async (c, name, params) => { calls.push(['fn', name, params]); return { d: { [name]: { TransId: '0000026700', AppId: 'MX' } } }; };
    try {
        const found = await service.searchPosted({}, { text: "O'NEIL", materialType: 'ROH', top: '500' });
        assert.equal(found[0].matnr, '100003660');
        assert.equal(found[0].busy, true);
        assert.match(calls[0][1], /PostedMaterialSet\?\$top=100&\$filter=Maktx%20eq%20'O''NEIL'%20and%20Mtart%20eq%20'ROH'/);
        const sc = await service.scope({}, '100003660');
        assert.deepEqual(sc.map((x) => x.kind), ['P', 'S']);
        await service.startChange({}, { matnr: '100003660', plant: 'UN13', storageLocation: 'CG13', salesOrg: '0000', distributionChannel: '00' });
        const fnCall = calls.find((x) => x[0] === 'fn' && x[1] === 'StartChange');
        assert.deepEqual(fnCall[2], { Matnr: '100003660', Plant: 'UN13', StorageLocation: 'CG13', SalesOrg: '0000', DistributionChannel: '00' });
        await service.startExtension({}, { matnr: '100003660', type: 'P', plant: 'UN13', storageLocation: 'ASH1' });
        const ex = calls.find((x) => x[0] === 'fn' && x[1] === 'StartExtension');
        assert.equal(ex[2].ExtType, 'P');
        assert.equal(ex[2].StorageLocation, 'ASH1');
    } finally { sap.odata.fn = real.fn; sap.odata.get = real.get; }
});

test('a single-row entity is written as the current SAP row with the changed fields on top (key data is never blanked)', () => {
    const existing = { single: { Material: { MTART: 'FERT', MBRSH: '1', MATKL: '202' } }, multi: {}, views: [] };
    const ops = writeOps('0000000001', { single: { Material: { MATKL: '404' } }, multi: {}, views: [] }, existing);
    assert.equal(ops[0].body.Mtart, 'FERT');
    assert.equal(ops[0].body.Mbrsh, '1');
    assert.equal(ops[0].body.Matkl, '404');
});
