const test = require('node:test');
const assert = require('node:assert/strict');
const { abapName, toAbapRow } = require('../cascadePricing');
const sap = require('../cascadeSap');

test('OData property names become the ABAP names the app uses', () => {
  const cases = { Matnr: 'MATNR', CascadeDesc: 'CASCADE_DESC', Zbusiness: 'ZBUSINESS', SLand1: 'S_LAND1', DLand1: 'D_LAND1', Name1: 'NAME1', ZiRrpPerPc: 'ZI_RRP_PER_PC',
    ZpttEAp: 'ZPTT_E_AP', ZcifF: 'ZCIF_F', ZcifAfterAp: 'ZCIF_AFTER_AP', ZdamZdax: 'ZDAM_ZDAX', LWaerk: 'L_WAERK', BWaerk: 'B_WAERK', ZrrpPerDz: 'ZRRP_PER_DZ', Validfrom: 'VALIDFROM', Light: 'LIGHT', ZpriceIn: 'ZPRICE_IN', MATNR: 'MATNR' };
  for (const [k, v] of Object.entries(cases)) assert.equal(abapName(k), v, k);
  assert.deepEqual(toAbapRow({ __metadata: { uri: 'x' }, Matnr: '400003658', CascadeDesc: '' }), { MATNR: '400003658', CASCADE_DESC: '' });
});

function withEnv(env, fn) {
  const saved = {}; for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  return fn().finally(() => { for (const k of Object.keys(env)) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
}
const resp = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, statusText: `S${status}`, headers: { get: (h) => headers[h.toLowerCase()] ?? null, getSetCookie: () => headers['set-cookie'] ?? [] }, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });

test('sapGet: sap-client, Basic auth, no-store, d.results; SAP error message on failure', async () => {
  await withEnv({ CASCADE_SAP_ODATA_BASE: 'https://sap.test/sap/opu/odata/sap/ZMM_CASCADE_SRV_SRV/', CASCADE_SAP_CLIENT: '200', CASCADE_SAP_USER: 'u', CASCADE_SAP_PASSWORD: 'p' }, async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push({ url, init }); return resp(200, { d: { results: [{ Matnr: '1' }] } }); };
    assert.deepEqual(await sap.sapGet('CascadeMapSet'), [{ Matnr: '1' }]);
    assert.equal(calls[0].url, 'https://sap.test/sap/opu/odata/sap/ZMM_CASCADE_SRV_SRV/CascadeMapSet?$format=json&sap-client=200');
    assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from('u:p').toString('base64')}`);
    assert.equal(calls[0].init.cache, 'no-store');
    global.fetch = async () => resp(500, { error: { message: { value: 'In the context of Data Services an unknown internal server error occurred' } } });
    await assert.rejects(sap.sapGet('ConditionPendingSet'), /unknown internal server error/);
  });
});

test('sapAction: CSRF token + cookies, retry once on 403, parses d.Result; gateway mode without token', async () => {
  await withEnv({ CASCADE_SAP_ODATA_BASE: 'https://sap.test/svc', CASCADE_SAP_CLIENT: '', CASCADE_SAP_USER: '' }, async () => {
    sap.resetCsrf();
    const calls = [];
    let n = 0;
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      if (init.headers['X-CSRF-Token'] === 'Fetch') return resp(200, {}, { 'x-csrf-token': `T${++n}`, 'set-cookie': ['SAP_SESSIONID=abc; path=/; secure', 'sap-usercontext=x; path=/'] });
      if (init.headers['X-CSRF-Token'] === 'T1') return resp(403, {});
      return resp(201, { d: { Result: JSON.stringify({ PROCESSED: 2, FAILED: 0, MESSAGE: 'ok', DATA: '' }) } });
    };
    const r = await sap.sapAction({ Action: 'APPROVE' });
    assert.deepEqual(r, { PROCESSED: 2, FAILED: 0, MESSAGE: 'ok', DATA: '' });
    const posts = calls.filter((c) => c.init.method === 'POST');
    assert.equal(posts.length, 2);
    assert.equal(posts[1].init.headers['X-CSRF-Token'], 'T2');
    assert.equal(posts[1].init.headers.Cookie, 'SAP_SESSIONID=abc; sap-usercontext=x');
    assert.equal(posts[1].url, 'https://sap.test/svc/ActionRequestSet');
    assert.equal(posts[1].init.headers.Authorization, undefined);
    // gateway: no token on the root -> POST without one
    sap.resetCsrf();
    global.fetch = async (url, init) => (init.method === 'POST' ? (assert.equal(init.headers['X-CSRF-Token'], undefined), resp(201, { d: { Result: '{"PROCESSED":1}' } })) : resp(404, {}));
    assert.deepEqual(await sap.sapAction({ Action: 'COMPARE' }), { PROCESSED: 1 });
  });
});

test('not configured: a clear 503', async () => {
  await withEnv({ CASCADE_SAP_ODATA_BASE: '', SAP_ODATA_BASE: '' }, async () => {
    await assert.rejects(sap.sapGet('CascadeMapSet'), (e) => e.status === 503 && /not configured/.test(e.message));
  });
});

test('ActionRequest body uses the NGD property names; dates as Edm.DateTime, left out when blank', () => {
  const { actionRequest } = require('../cascadePricing');
  const b = actionRequest('APPROVE', '20261101', '', { ROWS: [{ MATNR: '1' }] });
  assert.match(b.Requestid, /^[0-9a-f-]{36}$/);
  assert.equal(b.Action, 'APPROVE');
  assert.equal(b.Validfrom, '2026-11-01T00:00:00');
  assert.equal('Validto' in b, false);
  assert.equal(b.Payload, '{"ROWS":[{"MATNR":"1"}]}');
  assert.equal('RequestId' in b || 'ValidFrom' in b, false);
});
