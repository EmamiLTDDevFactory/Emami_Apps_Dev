const test = require('node:test');
const assert = require('node:assert/strict');

process.env.HUB_AUTH_JWT_SECRET ||= 'test-secret';
process.env.AUD_SAP_ODATA_BASE = 'https://gw.example/api/EDS/ZIT_MSD_TOOL_INTERNAL_AUDIT_SRV';
process.env.AUD_SAP_CLIENT = '900';
const router = require('../auditeeResponse');
const sap = require('../auditeeResponseSap');
const { parseTrack, parseFy, parseGuid, parseResponses, parseFileName, checkUpload, service, HttpError, resetDirectory } = router._test;
const { map } = sap;

const ME = 'ravi.kumar@emamigroup.com';
const USERS = [{ Uname: 'RKUMAR', Email: 'Ravi.Kumar@emamigroup.com', Fname: 'Ravi', Lname: 'Kumar' }, { Uname: 'AMEHTA', Email: 'anil.mehta@emamigroup.com', Fname: 'Anil', Lname: 'Mehta' }, { Uname: 'PERF1', Fname: 'Asha', Lname: 'Sen' }];
const ctx = { email: ME, me: 'RKUMAR', names: map.toDirectory(USERS).byUname, drafts: 'browser' };

/** As built: every assignee row of my observations; other people's comments come back empty. */
function rawWorkpaper(status = 'Send to Auditee', mine = ['', ''], mailText) {
    return {
        __metadata: { uri: 'x' },
        ControlNumber: '42', Gjahr: '2025', LglEnt: 'Emami Ltd', SubLglEntL1: 'Kolkata HO', SubLglEntL2: 'Kolkata', BpGud: 'BP1', Process: 'Procure to Pay', SubProcess: 'Vendor master',
        Scheduling: 'Q1', Period: 'Apr-Jun', Status: status, PerformerU: 'PERF1', ReviewerU: 'REV1', UserType: 'A', RiskDesc: 'not sent back', ...(mailText !== undefined ? { MailText: mailText } : {}),
        OBSERVATION: { results: [
            { ObsrvnGuid: 'G-1', Lineitem: '0002', FinancialYear: '2025', ObservationTitle: 'Duplicate vendors', Observation: 'Two vendor codes for one PAN', RootCause: 'No check', BusinessImplication: 'Double payment', Recommendation: 'Add a PAN check', GrossRisk: 'High', ResidualRisk: 'Medium', Timeline: '/Date(1767225600000)/', OsrvtnCatProc: 'X', OsrvtnScatP2: 'X',
              EmailTable: { results: [
                  { __metadata: {}, Lineitem: '', OwLineitem: '1', PersonResponsible: 'Ravi Kumar', PersonResUname: 'RKUMAR', OwnerName: 'Boss', OwnerUname: 'BOSS', PersonResComment: mine[0], OwnerComment: '' },
                  { Lineitem: '0002', OwLineitem: '2', PersonResponsible: '', PersonResUname: 'AMEHTA', OwnerName: '', OwnerUname: '', PersonResComment: '', OwnerComment: '' },
              ] } },
            { ObsrvnGuid: 'G-1', Lineitem: '0001', ObservationTitle: 'Late GRN', Observation: 'GRN after invoice', GrossRisk: 'Low', ResidualRisk: 'Low', Timeline: '20260331', OsrvtnCatRegu: 'X',
              EmailTable: { results: [{ Lineitem: '0001', OwLineitem: '1', PersonResUname: 'XYZ', PersonResponsible: 'X Person', OwnerUname: 'rkumar', OwnerComment: mine[1], PersonResComment: '' }] } },
        ] },
    };
}

test('input validation', () => {
    assert.equal(parseTrack(undefined), 'audit');
    assert.equal(parseTrack('MIS'), 'mis');
    assert.throws(() => parseTrack('x'), HttpError);
    assert.equal(parseFy('2025'), '2025');
    assert.throws(() => parseFy('25'), HttpError);
    assert.throws(() => parseGuid("x' or 1"), HttpError);
    assert.equal(parseResponses({ responses: [{ lineItem: '0002', ownerLineItem: 1, text: '  We will fix it.\r\n' }] }).get('2|1'), 'We will fix it.');
    assert.throws(() => parseResponses({}), HttpError);
    assert.throws(() => parseResponses({ responses: [{ lineItem: 'a', ownerLineItem: '1', text: '' }] }), HttpError);
    assert.throws(() => parseResponses({ responses: [{ lineItem: '1', ownerLineItem: '1', text: 'x'.repeat(5000) }] }), HttpError);
    assert.throws(() => parseFileName('../etc/passwd'), HttpError);
    assert.throws(() => checkUpload('a.exe', 10), (e) => e.status === 415);
    assert.throws(() => checkUpload('a.pdf', 11 * 1024 * 1024), (e) => e.status === 413);
});

test('list paths per track (as built: A = audit, B = MIS)', () => {
    assert.equal(decodeURIComponent(map.listPath('audit', '2025')), "ZSTR_MSD_PROCESS_AUDITSet?$filter=Action eq 'A' and Gjahr eq '2025'&$expand=OBSERVATION/EmailTable");
    assert.match(decodeURIComponent(map.listPath('mis', '')), /Action eq 'B'&/);
    assert.equal(map.WRITE_ACTION.mis, 'M');
});

test('workpaper JSON: only my rows, my role by SAP user, names, dates, categories', () => {
    const wp = map.toWorkpaper(rawWorkpaper('Send to Auditee', ['Agreed', '']), 'audit', ctx);
    assert.equal(wp.guid, 'G-1');
    assert.equal(wp.track, 'audit');
    assert.equal(wp.performer, 'Asha Sen');
    assert.deepEqual(wp.observations.map((o) => [o.lineItem, o.ownerLineItem, o.myRole]), [['1', '1', 'OWNER'], ['2', '1', 'PERSON_RESPONSIBLE']]);
    assert.equal(wp.observations[1].myResponse, 'Agreed');
    assert.equal(wp.observations[1].timeline, '2026-01-01');
    assert.deepEqual(wp.observations[1].categories, ['Process', 'P2']);
    assert.equal(wp.observations[0].timeline, '2026-03-31');
    assert.equal(wp.canRespond, true);
    assert.equal(wp.canSubmit, false);
    assert.equal(wp.mySubmitted, false);
    assert.equal(wp.draftStorage, 'browser');
});

test('waiting for: header MailText wins, computed list is the fallback; re-submit allowed while Send to Auditee', () => {
    const sent = map.toWorkpaper(rawWorkpaper('Send to Auditee', ['a', 'b'], 'Anil Mehta; X Person'), 'audit', ctx);
    assert.deepEqual(sent.waitingFor, ['Anil Mehta', 'X Person']);
    assert.equal(sent.mySubmitted, true);
    assert.equal(sent.canRespond, true);
    const computed = map.toWorkpaper(rawWorkpaper('Send to Auditee', ['a', 'b']), 'audit', ctx);
    assert.deepEqual(computed.waitingFor, ['Anil Mehta', 'Boss', 'X Person']);
    const done = map.toWorkpaper(rawWorkpaper('Management Responded', ['a', 'b'], ''), 'audit', ctx);
    assert.deepEqual(done.waitingFor, []);
    assert.equal(done.canRespond, false);
    assert.equal(map.toWorkpaper(rawWorkpaper('Close', ['a', 'b']), 'audit', ctx).canSubmit, false);
});

test('submit payload: header keys, Action per track, ONLY my rows and my side', () => {
    const body = map.savePayload(rawWorkpaper(), 'mis', new Map([['2|1', 'PR text'], ['1|1', 'Owner text']]), 'RKUMAR', 'Management Responded');
    assert.equal(body.Action, 'M');
    assert.equal(body.Status, 'Management Responded');
    assert.equal(body.UserType, 'A');
    assert.equal(body.BpGud, 'BP1');
    assert.equal(body.RiskDesc, undefined);
    assert.equal(body.__metadata, undefined);
    const [l2, l1] = body.OBSERVATION;
    assert.deepEqual(l2, { ObsrvnGuid: 'G-1', Lineitem: '0002', FinancialYear: '2025', EmailTable: [{ Lineitem: '0002', OwLineitem: '1', PersonResComment: 'PR text' }] });
    assert.deepEqual(l1.EmailTable, [{ Lineitem: '0001', OwLineitem: '1', OwnerComment: 'Owner text' }]);
    assert.equal(l1.FinancialYear, '2025');
});

test('attachments: Action O = mine, double base64 content, delete as POST Action D, keyed path', () => {
    assert.equal(map.toAttachment({ Filename: 'x.pdf', Action: 'O' }, ME).mine, true);
    assert.equal(map.toAttachment({ Filename: 'y.pdf', Annexture: 'X' }, ME).mine, false);
    const bytes = Buffer.from([0, 1, 2, 250, 255]);
    assert.deepEqual(map.decodeContent(map.uploadPayload(rawWorkpaper(), 'x.pdf', 'application/pdf', bytes).Value), bytes);
    assert.deepEqual(map.decodeContent(bytes.toString('base64')), bytes);
    assert.equal(map.deletePayload(rawWorkpaper(), 'x.pdf').Action, 'D');
    assert.match(decodeURIComponent(map.attachmentPath(rawWorkpaper(), "a'b.pdf")), /^ObservationAttachementSet\(Action='',ControlNumber='42',.*Filename='a''b.pdf'\)$/);
});

test('SAP errors become clean messages with proper HTTP codes', () => {
    const e = (text, status = 400) => sap.mapError({ error: { message: { value: text } } }, status);
    assert.equal(e('Your Emami Apps account is not set up as an auditee in the audit tool (no user master entry).').status, 403);
    assert.equal(e('You can only respond to observations assigned to you (observation 2). Nothing was saved.').status, 403);
    assert.equal(e('You can only respond while the workpaper is with the auditee ("Send to Auditee"). Its current status is "Close". Nothing was saved.').status, 409);
    assert.equal(e('This audit is being edited by ASEN. Please try again in a moment.').status, 409);
    assert.equal(e('Please enter your response for every observation assigned to you before submitting: x. Nothing was saved.').status, 400);
    assert.equal(sap.mapError({}, 500).status, 502);
    assert.match(sap.mapError({ error: { innererror: { transactionid: 'ABC' } } }, 500).message, /ABC/);
});

// ---- service against a fake SAP (global fetch stubbed)
function fakeSap(raw, { postStatus } = {}) {
    resetDirectory();
    const calls = [];
    global.fetch = async (url, init = {}) => {
        calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
        const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'x-csrf-token': 'tok' } });
        if (init.method === 'GET' && /SRV\/?(\?|$)/.test(url)) return json({});
        if (init.method === 'GET' && url.includes('ZUSER_MASTERSet')) return json({ d: { results: USERS } });
        if (init.method === 'GET' && url.includes('ZSTR_MSD_PROCESS_AUDITSet')) return json({ d: { results: [raw] } });
        if (init.method === 'GET' && url.includes('ObservationAttachementSet')) return json({ d: { results: [{ Filename: 'mine.pdf', Action: 'O', Value: Buffer.from(Buffer.from('%PDF').toString('base64')).toString('base64'), Mimetype: 'application/pdf' }, { Filename: 'auditor.xlsx', Annexture: 'X' }] } });
        if (init.method === 'POST') return postStatus ? json({ error: { message: { value: 'You can only respond to observations assigned to you (observation 2). Nothing was saved.' } } }, postStatus) : json({ d: {} }, 201);
        return new Response('{}', { status: 404 });
    };
    return calls;
}

test('submit: verified e-mail header and sap-client on every call, refuses missing responses / wrong status', async () => {
    const calls = fakeSap(rawWorkpaper());
    const c = { email: ME };
    await assert.rejects(service.submit(c, 'audit', 'G-1', new Map([['2|1', 'only one']])), /Missing: observation 1/);
    await assert.rejects(service.submit(c, 'audit', 'G-1', new Map([['9|1', 'x']])), (e) => e.status === 403);
    await service.submit(c, 'audit', 'G-1', new Map([['2|1', 'PR text'], ['1|1', 'Owner text']]));
    const post = calls.find((x) => x.method === 'POST');
    assert.equal(post.body.Status, 'Management Responded');
    assert.equal(post.body.Action, 'T');
    assert.equal(post.headers['x-csrf-token'], 'tok');
    assert.ok(calls.every((x) => x.headers['X-Emami-User'] === ME && x.url.includes('sap-client=900')));
    fakeSap(rawWorkpaper('Management Responded', ['a', 'b']));
    await assert.rejects(service.submit(c, 'audit', 'G-1', new Map()), (e) => e.status === 409);
});

test('SAP business errors pass through with their text', async () => {
    fakeSap(rawWorkpaper(), { postStatus: 400 });
    await assert.rejects(service.submit({ email: ME }, 'audit', 'G-1', new Map([['2|1', 'a'], ['1|1', 'b']])), (e) => e.status === 403 && /assigned to you/.test(e.message));
});

test('drafts live in the browser: PUT is refused; unknown workpaper is 404', async () => {
    fakeSap(rawWorkpaper());
    await assert.rejects(service.save({ email: ME }, 'audit', 'G-1', new Map()), (e) => e.status === 409);
    await assert.rejects(service.get({ email: ME }, 'audit', 'OTHER'), (e) => e.status === 404);
});

test('attachments: download decodes, delete only own files, duplicate names refused', async () => {
    fakeSap(rawWorkpaper());
    const c = { email: ME };
    assert.equal((await service.readAttachment(c, 'audit', 'G-1', 'mine.pdf')).bytes.toString(), '%PDF');
    await assert.rejects(service.remove(c, 'audit', 'G-1', 'auditor.xlsx'), (e) => e.status === 403);
    assert.equal((await service.remove(c, 'audit', 'G-1', 'mine.pdf')).length, 2);
    await assert.rejects(service.upload(c, 'audit', 'G-1', 'MINE.pdf', 'application/pdf', Buffer.from('x')), (e) => e.status === 409);
});
