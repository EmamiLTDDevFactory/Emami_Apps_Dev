/**
 * Browser test of the live Material master screens. Only the hub backend is mocked (page.route), with responses shaped exactly like
 * backend/mmMdm.js sends them (header / data.single / data.multi / data.views / history / allowed / level, field control by SAP view,
 * value helps as {key,text}, posted materials, scope rows, SAP messages {code,message,severity,target}). Nothing else is faked.
 *
 * Run (dev server first):  NEXT_PUBLIC_MDM_PH_LIVE=1 npx next dev -p 3320   then   node e2e/material.e2e.cjs
 * Playwright is taken from the sibling app (PLAYWRIGHT_PATH overrides).
 */
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || path.join(__dirname, '../../bom-cost-explorer/node_modules/playwright'));

const BASE = process.env.BASE || 'http://localhost:3320/apps/mm-mdm';
const API = /\/dev-api\/api\/me\/mm-mdm(-ph)?(\/.*)?$/;

/* ------------------------------ backend mock ------------------------------ */
const state = { calls: [], requests: new Map(), failRequestsList: false, approveFailOnce: true, nextId: 1001 };
const sessionUser = { user: 'SAYON', displayName: 'Sayon Das', department: 'MDM', roles: ['initiator', 'approver'], mode: 'live' };
const NONE = { edit: false, validate: false, saveDraft: false, submit: false, approve: false, sendBack: false, reject: false, forward: false, deleteDraft: false, attach: false, comment: true };
const DRAFT = { ...NONE, edit: true, validate: true, saveDraft: true, submit: true, deleteDraft: true, attach: true };
const REVIEW = { ...NONE, edit: true, validate: true, saveDraft: true, approve: true, sendBack: true, reject: true, forward: true, attach: true };

const header = (o) => ({
  transId: o.transId, appId: o.appId || 'MC', objValue: o.objValue || '', status: o.status || '00', statusText: o.statusText || 'Saved as draft', initiator: 'SAYON',
  startDate: '2026-11-18', endDate: '', workItemId: '', isDuplicate: false, genType: o.genType || '', genField: '', genField2: '', genField3: '',
  materialType: 'FERT', description: o.desc || 'GLOWRA COLD CREAM 100ML',
});
function mkRequest(o) {
  return {
    header: header(o),
    data: {
      single: {
        Material: { MTART: 'FERT', MBRSH: 'F', MATKL: o.noGroup ? '' : '401', SPART: o.noGroup ? '' : '01', PRDHA: '', MEINS: 'PC', BRGEW: 1.5, NTGEW: '1.200', GEWEI: 'KG' },
        Description: { SPRAS: 'EN', MAKTX: o.desc || 'GLOWRA COLD CREAM 100ML' },
        Plant: { WERKS: o.plant ?? '1000', DISMM: 'PD', MINBE: 5 },
        SalesOrg: { VKORG: o.salesOrg ?? '1000', VTWEG: o.dc ?? '10' },
        Valuation: { BKLAS: '7920' },
        StorageLocation: { LGORT: o.sloc ?? '0001' },
      },
      multi: { LongText: [], UnitOfMeasure: [] },
      views: ['MARA_BASIC1', 'MARC_MRP1', 'TEXT'],
    },
    history: [{ serialNo: 1, level: 'L0', typeLevel: 'R', role: 'Initiator', user: 'SAYON', status: 'I', date: '2026-11-18', comment: '' }],
    allowed: o.allowed || DRAFT,
    level: o.level || 'L0',
  };
}
const seed = (o) => state.requests.set(o.transId, mkRequest(o));
seed({ transId: 'MC0000001000', desc: 'DRAFT SAMPLE CREAM', allowed: DRAFT });
seed({ transId: 'MC0000002000', desc: 'APPROVER SAMPLE OIL', status: '01', statusText: 'Requested', level: 'L1', allowed: REVIEW });

const item = (field, extra = {}) => ({ field, shown: true, displayOnly: false, required: false, column: '', source: 'view', ...extra });
const fieldControl = {
  MARA_BASIC1: [item('Material.MEINS', { required: true }), item('Material.BRGEW'), item('Material.MATKL'), item('Material.SPART')],
  MARC_MRP1: [item('Plant.DISMM'), item('Plant.MINBE', { required: true })],
  TEXT: [item('LongText.TEXT')],
  '': [{ field: '.MATKL', shown: true, displayOnly: false, required: true, column: '', source: 'general' }],
};
const lists = {
  MTART: [{ key: 'FERT', text: 'Finished Product' }, { key: 'ROH', text: 'Raw Material' }],
  MBRSH: [{ key: 'F', text: 'FMCG Industries' }],
  MATKL: [{ key: '401', text: 'COSMETICS' }, { key: '402', text: 'TOILETRIES' }],
  SPART: [{ key: '01', text: 'Cosmetics' }],
  WERKS: [{ key: '1000', text: 'Kolkata Plant' }, { key: '1200', text: 'Pantnagar Plant' }],
  LGORT: [{ key: '0001', text: 'Raw Material Store' }],
  VKORG: [{ key: '1000', text: 'Domestic Sales' }, { key: '2000', text: 'Export Sales' }],
  VTWEG: [{ key: '10', text: 'General Trade' }, { key: '40', text: 'Export' }],
  DISMM: [{ key: 'PD', text: 'MRP' }, { key: 'VB', text: 'Reorder point' }],
  MEINS: [{ key: 'PC', text: 'pieces' }, { key: 'KG', text: 'Kilogram' }],
  MGRP: [{ key: 'M1', text: 'Main 1' }], SGRP: [], SSGR: [],
};
const posted = [
  { matnr: '100000101', description: 'GLOWRA COLD CREAM 50G', materialType: 'FERT', materialGroup: '401', unit: 'PC', busy: false },
  { matnr: '100000102', description: 'COOL TALC 100G', materialType: 'FERT', materialGroup: '402', unit: 'PC', busy: true },
];
const scopeRows = [
  { kind: 'P', plant: '1000', plantText: 'Kolkata Plant', storageLocation: '0001', storageLocationText: 'Raw Material Store', salesOrg: '', salesOrgText: '', distributionChannel: '', distributionChannelText: '' },
  { kind: 'S', plant: '', plantText: '', storageLocation: '', storageLocationText: '', salesOrg: '1000', salesOrgText: 'Domestic Sales', distributionChannel: '10', distributionChannelText: 'General Trade' },
];

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, slug', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' };
const json = (route, status, body) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

function applyPatch(req, data) {
  for (const [e, row] of Object.entries(data.single || {})) req.data.single[e] = { ...(req.data.single[e] || {}), ...row };
  for (const [e, rows] of Object.entries(data.multi || {})) req.data.multi[e] = rows;
}

async function handle(route) {
  const r = route.request();
  if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const url = new URL(r.url());
  const p = url.pathname.replace(/^.*\/me\/mm-mdm(-ph)?/, '') || '/';
  const isPh = /mm-mdm-ph/.test(url.pathname);
  const body = r.postData() ? JSON.parse(r.postData()) : undefined;
  state.calls.push({ method: r.method(), path: p + (url.search || ''), body, ph: isPh });
  const m = r.method();

  if (isPh) {
    if (p === '/crs/verticals') return json(route, 200, [{ code: '01', text: 'DOM-CCD' }]);
    return json(route, 200, []);
  }
  if (m === 'GET' && p === '/session') return json(route, 200, sessionUser);
  if (m === 'GET' && p === '/requests') {
    if (state.failRequestsList) return json(route, 500, { error: 'Unexpected error.', messages: [] });
    const scope = url.searchParams.get('scope');
    const all = [...state.requests.values()].map((q) => q.header);
    const rows = scope === 'inbox' ? all.filter((h) => h.transId === 'MC0000002000' && h.status === '01' && h.transId && state.requests.get(h.transId).allowed.approve)
      : scope === 'mine' ? all.filter((h) => h.initiator === 'SAYON') : all;
    return json(route, 200, rows);
  }
  if (m === 'POST' && p === '/requests') {
    const id = `MC${String(state.nextId++).padStart(10, '0')}`;
    const q = mkRequest({ transId: id, desc: body.description, noGroup: true, plant: body.plant, sloc: body.storageLocation, salesOrg: body.salesOrg, dc: body.distributionChannel });
    state.requests.set(id, q);
    return json(route, 201, q);
  }
  let mm = /^\/requests\/([^/]+)$/.exec(p);
  if (mm) {
    const q = state.requests.get(mm[1]);
    if (!q) return json(route, 404, { error: `Request ${mm[1]} not found`, messages: [] });
    if (m === 'GET') return json(route, 200, q);
    if (m === 'PUT') { applyPatch(q, body.data); return json(route, 200, { request: q, messages: [] }); }
    if (m === 'DELETE') { state.requests.delete(mm[1]); return json(route, 200, { ok: true }); }
  }
  mm = /^\/requests\/([^/]+)\/(attachments|comments)$/.exec(p);
  if (mm && m === 'GET') return json(route, 200, []);
  mm = /^\/requests\/([^/]+)\/(validate|submit|approve|sendback|reject|forward)$/.exec(p);
  if (mm && m === 'POST') {
    const q = state.requests.get(mm[1]);
    if (body.data) applyPatch(q, body.data);
    if (mm[2] === 'validate') return json(route, 200, { messages: [] });
    if (mm[2] === 'approve' && state.approveFailOnce && Number(q.data.single.Plant.MINBE) <= 0) {
      state.approveFailOnce = false;
      return json(route, 400, { error: 'Reorder point must be greater than 0', messages: [{ code: 'MM001', message: 'Reorder point must be greater than 0', severity: 'E', target: 'Plant.MINBE' }] });
    }
    if (mm[2] === 'submit') { q.header.status = '01'; q.header.statusText = 'Requested'; q.level = 'L1'; q.allowed = { ...NONE }; }
    if (mm[2] === 'approve') { q.level = 'L2'; q.allowed = { ...NONE }; }
    return json(route, 200, { request: q, messages: [] });
  }
  if (m === 'GET' && p === '/fieldcontrol') return json(route, 200, fieldControl);
  mm = /^\/valuehelp\/([^/]+)$/.exec(p);
  if (m === 'GET' && mm) return json(route, 200, lists[mm[1]] || []);
  if (m === 'POST' && p === '/duplicates') return json(route, 200, []);
  if (m === 'POST' && p === '/description') return json(route, 200, { text: 'BUILT DESCRIPTION', truncated: false });
  if (m === 'GET' && p === '/posted') return json(route, 200, posted);
  if (m === 'GET' && /^\/posted\/[^/]+\/scope$/.test(p)) return json(route, 200, scopeRows);
  if (m === 'POST' && (p === '/change' || p === '/extension')) {
    const id = `M${p === '/change' ? 'X' : 'E'}${String(state.nextId++).padStart(10, '0')}`;
    const q = mkRequest({ transId: id, appId: p === '/change' ? 'MX' : 'ME', objValue: body.matnr.padStart(18, '0'), desc: 'GLOWRA COLD CREAM 50G', allowed: DRAFT, genType: body.type || '', plant: body.plant, sloc: body.storageLocation, salesOrg: body.salesOrg ?? '', dc: body.distributionChannel ?? '' });
    state.requests.set(id, q);
    return json(route, 201, q);
  }
  return json(route, 404, { error: `mock: no route for ${m} ${p}`, messages: [] });
}

/* --------------------------------- tests ---------------------------------- */
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { results.push(['FAIL', name]); console.log('FAIL', name, '\n', e.stack || e); process.exitCode = 1; }
}
const lastCall = (method, re) => [...state.calls].reverse().find((c) => c.method === method && re.test(c.path));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { try { window.localStorage.setItem('emami_apps_session_token', 'test-token'); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  await page.route(API, handle);

  const consoleErrors = [];
  let expect500 = false;
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await step('home lists my requests and what waits for me, from the backend', async () => {
    await page.goto(`${BASE}/master/material/`);
    await page.getByRole('heading', { name: /Waiting for me/ }).waitFor();
    await page.getByText('APPROVER SAMPLE OIL').first().waitFor();
    await page.getByText('DRAFT SAMPLE CREAM').first().waitFor();
    assert.ok(await page.getByText('Saved as draft').first().isVisible());
    assert.ok(await page.getByText('Requested').first().isVisible());
    assert.ok(await page.getByText(/Connected to SAP/).isVisible());
    assert.equal(await page.getByText('Reset demo data').count(), 0);
    assert.equal(await page.getByText('Acting as').count(), 0);
  });

  await step('new request: live value helps, duplicate check, start + write the rest of the key data + submit', async () => {
    await page.getByRole('link', { name: 'New material request' }).first().click();
    await page.waitForURL(/\/master\/material\/new/);
    const fill = async (id, v) => { await page.locator(`#${id}`).fill(v); await page.locator(`#${id}`).press('Tab'); };
    await fill('k-materialType', 'FERT');
    await fill('k-industrySector', 'F');
    await fill('k-materialGroup', '401');
    await fill('k-division', '01');
    await page.locator('#k-description').fill('E2E NEW CREAM 100ML');
    // an invalid code is refused against the SAP list
    await page.locator('#k-plant').fill('9999');
    await page.locator('#k-plant').press('Tab');
    await page.getByText(/does not exist/).first().waitFor();
    await fill('k-plant', '1000');
    await fill('k-storageLocation', '0001');
    await fill('k-salesOrg', '1000');
    await fill('k-distChannel', '10');
    await page.getByRole('button', { name: /Check duplicates/ }).click();
    await page.getByText('No duplicates found').waitFor();
    await page.getByRole('button', { name: /Submit for approval/ }).click();
    await page.waitForURL(/requests\/view\/?\?id=MC0000001001/);
    const start = lastCall('POST', /^\/requests$/);
    assert.equal(start.body.materialType, 'FERT');
    assert.equal(start.body.plant, '1000');
    assert.equal(start.body.distributionChannel, '10');
    assert.equal(start.body.draft, true);
    assert.ok(start.body.views.includes('MARA_BASIC1'));
    const submit = lastCall('POST', /\/requests\/MC0000001001\/submit/);
    assert.equal(submit.body.data.single.Material.MATKL, '401');   // key data the start call does not carry
    assert.equal(submit.body.data.single.Material.SPART, '01');
    assert.deepEqual(submit.body.data.views.slice(0, 1), ['MARA_BASIC1']);
    await page.getByText('Requested').first().waitFor();
  });

  await step('request page: field control and allowed actions decide; edit, save draft, submit', async () => {
    await page.goto(`${BASE}/master/material/requests/view/?id=MC0000001000`);
    await page.getByRole('heading', { name: 'DRAFT SAMPLE CREAM' }).waitFor();
    await page.locator('.vn-item', { hasText: 'Data - MRP 1' }).click();
    const minbe = page.locator('#f-reorderPoint');
    await minbe.waitFor();
    assert.equal(await minbe.inputValue(), '5');
    assert.equal(await page.locator('#f-mrpType').evaluate((el) => el.tagName), 'SELECT'); // live value help list
    await minbe.fill('9');
    await page.getByText('Unsaved changes').waitFor();
    await page.getByRole('button', { name: /Save draft/ }).click();
    await page.getByText('Unsaved changes').waitFor({ state: 'detached' });
    const put = lastCall('PUT', /\/requests\/MC0000001000$/);
    assert.deepEqual(put.body.data.single.Plant, { MINBE: 9 });          // only the changed field, SAP's number type kept
    assert.equal(put.body.data.single.Material, undefined);
    await page.getByRole('button', { name: /^Submit$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
    await page.getByText('Requested').first().waitFor();
    assert.ok(lastCall('POST', /\/requests\/MC0000001000\/submit/));
    // after the submit SAP allows nothing more for the initiator: no Save / Submit buttons
    await page.getByRole('button', { name: /^Submit$/ }).waitFor({ state: 'detached' });
  });

  await step('approver: SAP message mapped to the field, then approve with the changed data', async () => {
    await page.goto(`${BASE}/master/material/requests/view/?id=MC0000002000`);
    await page.getByRole('heading', { name: 'APPROVER SAMPLE OIL' }).waitFor();
    await page.locator('.vn-item', { hasText: 'Data - MRP 1' }).click();
    await page.locator('#f-reorderPoint').fill('0');
    await page.getByRole('button', { name: /^Approve$/ }).last().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    // SAP refuses: the error text shows under the field it is about
    await page.getByText('Reorder point must be greater than 0').first().waitFor();
    await page.locator('.field-error:has(#f-reorderPoint)').waitFor();   // marked on the field SAP named
    const approve1 = lastCall('POST', /\/requests\/MC0000002000\/approve/);
    assert.equal(approve1.body.data.single.Plant.MINBE, 0);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await page.locator('#f-reorderPoint').fill('10');
    await page.getByRole('button', { name: /^Approve$/ }).last().click();
    await page.getByRole('dialog').locator('textarea').fill('Looks good');
    await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await page.getByText('Level 2').first().waitFor();
    const approve2 = lastCall('POST', /\/requests\/MC0000002000\/approve/);
    assert.equal(approve2.body.comment, 'Looks good');
    assert.equal(approve2.body.data.single.Plant.MINBE, 10);
  });

  await step('posted materials -> change scope -> start change request', async () => {
    await page.goto(`${BASE}/master/material/data/`);
    await page.getByText('GLOWRA COLD CREAM 50G').waitFor();
    // a material with an open change/extension request cannot be started again
    assert.ok(await page.getByRole('button', { name: /Change/ }).first().isDisabled());
    await page.getByRole('link', { name: /Change/ }).first().click();
    await page.waitForURL(/material\/change\/?\?matnr=100000101/);
    await page.locator('#c-plant').selectOption('1000');
    await page.locator('#c-sloc').selectOption('0001');
    await page.locator('#c-area').selectOption('1000/10');
    await page.getByRole('button', { name: /Start change request/ }).click();
    await page.waitForURL(/requests\/view\/?\?id=MX/);
    const c = lastCall('POST', /^\/change$/);
    assert.deepEqual(c.body, { matnr: '100000101', plant: '1000', storageLocation: '0001', salesOrg: '1000', distributionChannel: '10' });
    await page.getByText(/Change of: material 100000101/).waitFor();
  });

  await step('extension: new sales area -> start extension request', async () => {
    await page.goto(`${BASE}/master/material/data/`);
    await page.getByText('GLOWRA COLD CREAM 50G').waitFor();
    await page.getByRole('link', { name: /Extend/ }).first().click();
    await page.waitForURL(/material\/extend\/?\?matnr=100000101/);
    await page.getByText('New sales area').click();
    await page.locator('#e-vkorg').fill('2000');
    await page.locator('#e-vkorg').press('Tab');
    await page.locator('#e-vtweg').fill('40');
    await page.locator('#e-vtweg').press('Tab');
    await page.locator('#e-srcarea').selectOption('1000/10');
    await page.getByRole('button', { name: /Start extension request/ }).click();
    await page.waitForURL(/requests\/view\/?\?id=ME/);
    const e = lastCall('POST', /^\/extension$/);
    assert.deepEqual(e.body, { type: 'S', matnr: '100000101', salesOrg: '2000', distributionChannel: '40', sourceSalesOrg: '1000', sourceDistributionChannel: '10' });
    await page.getByText(/Extension: material 100000101/).waitFor();
    await page.getByText('New sales area').first().waitFor();
  });

  await step('backend 500: a clear error state, no fake data', async () => {
    expect500 = true;
    state.failRequestsList = true;
    await page.goto(`${BASE}/master/material/requests/`);
    await page.getByText('Could not load data from SAP').waitFor();
    await page.getByText('Unexpected error.').first().waitFor();
    assert.equal(await page.getByText('DRAFT SAMPLE CREAM').count(), 0);
    state.failRequestsList = false;
    await page.getByRole('button', { name: /Try again/ }).click();
    await page.getByText('DRAFT SAMPLE CREAM').first().waitFor();
    expect500 = false;
  });

  await step('no browser console errors outside the deliberate 500', async () => {
    // the browser logs every failed fetch: only the deliberate ones (SAP refuses the approval with 400; while the 500 is on, the list,
    // the inbox and React's dev double effect each fail once)
    const failed = consoleErrors.filter((t) => /Failed to load resource/.test(t)).map((t) => /\b(\d{3})\b/.exec(t)[1]);
    assert.equal(failed.filter((c) => c === '400').length, 1);
    assert.ok(failed.filter((c) => c === '500').length >= 1);
    assert.equal(failed.filter((c) => c !== '400' && c !== '500').length, 0);
    assert.deepEqual(consoleErrors.filter((t) => !/Failed to load resource/.test(t)), []);
    assert.ok(expect500 === false);
  });

  await browser.close();
  console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} steps passed`);
  if (process.exitCode) console.log('FAILED');
})();
