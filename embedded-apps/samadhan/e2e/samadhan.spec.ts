import { expect, test, type Page } from '@playwright/test';

/*
   Samadhan end-to-end checks (v7 Phase 1: the rename must change nothing a user can see, and old links must work).
   E2E_DATA (JSON, written by the gate): test-only sessions per persona, a seeded ticket, a CSAT token, the API base.
   Every test fails on a browser console error, a page error, a failed request or a 5xx response; a 4xx fails too
   unless the test lists it as expected.
*/
type Persona = { email: string; token: string };
type Data = { admin: Persona; sup: Persona; agent: Persona; ticketId: number; ticketSubject: string; csatToken: string; api: string };
const data: Data = JSON.parse(process.env.E2E_DATA || 'null');
if (!data) throw new Error('E2E_DATA is not set - run the tests through the gate (backend/samadhan/tests/gate.js).');

const NAV_ALL = ['Dashboard', 'Helpdesk dashboard', 'Tickets', 'Board', 'New ticket', 'Contacts', 'Solutions'];
const NAV_SUP = ['Analytics', 'Daily report'];

function watch(page: Page, allowed: number[] = []) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message.slice(0, 200)}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    const s = r.status();
    if (s >= 500 || (s >= 400 && !allowed.includes(s))) problems.push(`HTTP ${s}: ${r.url()}`);
  });
  return problems;
}

async function signIn(page: Page, who: Persona) {
  await page.addInitScript(([token, email]) => {
    localStorage.setItem('emami_apps_session_token', token);
    localStorage.setItem('emami_apps_user_email', email);
  }, [who.token, who.email]);
}

async function nav(page: Page) {
  const isMobile = (page.viewportSize()?.width ?? 1000) < 1024;
  if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click();
  return page.getByRole('navigation', { name: 'Sections' });
}

async function openScreen(page: Page, label: string) {
  const n = await nav(page);
  await n.getByRole('button', { name: new RegExp(`^${label}`) }).first().click();
  await page.waitForLoadState('networkidle');
}

for (const [persona, visible, hidden] of [
  ['agent', NAV_ALL, [...NAV_SUP, 'Admin']],
  ['sup', [...NAV_ALL, ...NAV_SUP], ['Admin']],
  ['admin', [...NAV_ALL, ...NAV_SUP, 'Admin'], []],
] as const) {
  test(`${persona}: every screen in the menu opens cleanly; menu matches the role`, async ({ page }) => {
    const problems = watch(page);
    await signIn(page, data[persona]);
    await page.goto('/apps/samadhan/');
    await expect(page.getByRole('navigation', { name: 'Sections' }).or(page.getByRole('button', { name: 'Open menu' })).first()).toBeVisible();
    const n = await nav(page);
    for (const label of hidden) await expect(n.getByRole('button', { name: new RegExp(`^${label}\\b`) })).toHaveCount(0);
    if ((page.viewportSize()?.width ?? 1000) < 1024) await page.getByRole('button', { name: 'Close menu' }).click();
    for (const label of visible) await openScreen(page, label);
    await expect(page.locator('body')).not.toContainText(/se[t]u\b/i);
    expect(problems).toEqual([]);
  });
}

test('deep link /apps/samadhan/?ticket=<id> opens the ticket', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto(`/apps/samadhan/?ticket=${data.ticketId}`);
  await expect(page.getByText(data.ticketSubject).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('portal (no sign-in): raise a ticket, then check its status', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/apps/samadhan/portal/');
  await page.getByLabel(/Your name/).fill('E2E Requester');
  await page.getByLabel(/^Email/).fill('e2e.requester@test.samadhan.local');
  await page.getByLabel(/^Subject/).fill('E2E portal ticket');
  await page.getByLabel(/Describe the issue/).fill('Raised by the end-to-end test.');
  await page.getByRole('button', { name: /Submit ticket/ }).click();
  const done = page.getByText(/ticket/i).filter({ hasText: /\d{6}/ }).first();
  await expect(done).toBeVisible();
  const id = (await done.innerText()).match(/\d{6,}/)?.[0];
  expect(id).toBeTruthy();
  await page.getByRole('tab', { name: /Check a ticket/ }).click();
  await page.getByLabel(/Ticket number/).fill(String(id));
  await page.getByLabel(/Email you used/).fill('e2e.requester@test.samadhan.local');
  await page.getByRole('button', { name: /Check|Search|Find/ }).last().click();
  await expect(page.getByText('E2E portal ticket').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('CSAT link from an email shows the survey', async ({ page }) => {
  const problems = watch(page);
  await page.goto(`/apps/samadhan/portal/?csat=${data.csatToken}`);
  await expect(page.getByRole('radiogroup', { name: 'Your rating' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('an Agent cannot use Admin: no menu entry, and the Admin API answers 403', async ({ page, request }) => {
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto('/apps/samadhan/');
  const n = await nav(page);
  await expect(n.getByRole('button', { name: /^Admin\b/ })).toHaveCount(0);
  for (const base of [data.api]) {
    const r = await request.get(`${base}/admin/agents`, { headers: { Authorization: `Bearer ${data.agent.token}` } });
    expect(r.status(), base).toBe(403);
  }
  expect(problems).toEqual([]);
});

test('keyboard: "?" opens the shortcuts list', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) < 1024, 'no keyboard on the phone layout');
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto('/apps/samadhan/');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Shift+Slash');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(problems).toEqual([]);
});

// ---------- v7 Phase 2: screen guard and Authorization cockpit ----------

test('screen guard: an Agent typing ?screen=admin lands on an allowed screen with a notice', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto('/apps/samadhan/?screen=admin');
  await expect(page.getByText("You don't have access to that screen")).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('screen guard: a Supervisor typing ?screen=reports opens the Daily report', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.sup);
  await page.goto('/apps/samadhan/?screen=reports');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText("You don't have access to that screen")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Admin: the Authorization cockpit opens and every tab loads', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.admin);
  await page.goto('/apps/samadhan/?screen=admin');
  await page.getByRole('tab', { name: 'Authorization cockpit' }).click();
  for (const tab of ['Overview', 'Role profiles', 'Permission matrix', 'User access', 'Access review', 'Change log']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.waitForLoadState('networkidle');
  }
  await page.getByRole('tab', { name: 'Role profiles', exact: true }).click();
  await expect(page.getByText('Auditor (read-only)')).toBeVisible();
  await page.getByRole('tab', { name: 'User access', exact: true }).click();
  // exact: on the phone layout the header also has an "Open menu" button.
  await page.getByRole('button', { name: 'Open', exact: true }).first().click();
  await expect(page.getByText('Effective access (saved)')).toBeVisible();
  expect(problems).toEqual([]);
});

// ---------- v7 Phase 2: attachments (the gate runs the backend with the local test file store) ----------

const PNG_BYTES = Buffer.concat([
  Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'),
  Buffer.from('1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex'),
]);

test('attachments: an agent adds a file to a ticket and previews it', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto(`/apps/samadhan/?ticket=${data.ticketId}`);
  const card = page.getByTestId('attachments-card');
  await card.locator('input[type=file]').setInputFiles({ name: `e2e-${test.info().project.name}.png`, mimeType: 'image/png', buffer: PNG_BYTES });
  await card.getByRole('button', { name: /Upload 1 file/ }).click();
  await expect(card.getByText('1 file(s) added.')).toBeVisible();
  await card.getByRole('button', { name: `Preview e2e-${test.info().project.name}.png` }).click();
  await expect(page.getByRole('dialog').locator('img')).toBeVisible();
  expect(problems).toEqual([]);
});

test('attachments: a file goes with a private note and shows a paperclip on it', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto(`/apps/samadhan/?ticket=${data.ticketId}`);
  await page.getByRole('tab', { name: /note/i }).first().click();
  const name = `note-${test.info().project.name}.txt`;
  await page.getByRole('textbox', { name: 'Message' }).fill('see the log');
  await page.getByTestId('composer-files').locator('input[type=file]').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('e2e log line\n') });
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Note added.')).toBeVisible();
  await expect(page.getByLabel('Attached files').getByRole('button', { name })).toBeVisible();
  expect(problems).toEqual([]);
});

test('attachments: the portal accepts a screenshot with a new ticket', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/apps/samadhan/portal/');
  await page.getByLabel(/Your name/).fill('E2E Portal');
  await page.getByLabel(/^Email/).fill(`portal-${test.info().project.name}@test.samadhan.local`);
  await page.getByLabel(/^Subject/).fill('Portal with a screenshot');
  await page.getByLabel(/Describe the issue/).fill('The order screen shows an error, screenshot attached.');
  await page.getByTestId('file-tray').locator('input[type=file]').setInputFiles({ name: 'error.png', mimeType: 'image/png', buffer: PNG_BYTES });
  await expect(page.getByText('error.png')).toBeVisible();
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(page.getByText(/Ticket SS-\d+ raised/)).toBeVisible();
  await expect(page.getByText('These files could not be added')).toHaveCount(0);
  expect(problems).toEqual([]);
});

// ---------- v7 Phase 3: workspaces, applications, references, classification ----------

/** Direct API call as a persona (setup and clean-up only; what is checked happens in the browser). */
async function api(who: Persona, method: string, path: string, body?: unknown) {
  const r = await fetch(`${data.api}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who.token}` }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const REF = /^[A-Z0-9]{2,8}-\d+$/;

test('references: the list and the ticket header show APPCODE-id', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto('/apps/samadhan/');
  await openScreen(page, 'Tickets');
  await page.getByRole('tab', { name: 'All' }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('ticket-ref').first()).toHaveText(REF);
  await page.goto(`/apps/samadhan/?ticket=${data.ticketId}`);
  await expect(page.getByTestId('ticket-header-ref')).toHaveText(new RegExp(`^[A-Z0-9]{2,8}-${data.ticketId}$`));
  expect(problems).toEqual([]);
});

test('new ticket: the application comes first and decides the reference', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto('/apps/samadhan/?screen=new');
  const picker = page.getByTestId('application-picker');
  await expect(picker).toBeVisible();
  await picker.getByRole('textbox', { name: 'Search applications' }).fill('msfa');
  await picker.getByRole('radio', { name: /mSFA App/ }).first().click();
  await page.getByLabel(/Requester name/).fill('E2E Caller');
  await page.getByRole('textbox', { name: /^Email/ }).fill('e2e.caller@test.samadhan.local');
  await page.getByLabel(/^Subject/).fill(`Beat not loading (${test.info().project.name})`);
  await page.getByRole('button', { name: 'Create ticket' }).click();
  await expect(page.getByTestId('ticket-header-ref')).toHaveText(/^MSFA-\d+$/);
  expect(problems).toEqual([]);
});

test('classification: an automatically classified ticket is confirmed from its header', async ({ page }) => {
  const problems = watch(page);
  const made = await api(data.agent, 'POST', '/tickets', { subject: `Unclear problem ${test.info().project.name}`, requesterName: 'E2E Requester', requesterEmail: 'e2e.req@test.samadhan.local' });
  expect(made.status).toBeLessThan(300);
  await signIn(page, data.agent);
  await page.goto(`/apps/samadhan/?ticket=${made.body.ticket.id}`);
  const hint = page.getByTestId('classification-hint');
  await expect(hint).toContainText('Auto-classified as Secondary Sales');
  await hint.getByRole('button', { name: 'Confirm' }).click();
  await expect(hint).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('Admin: service desks on shows the desk switcher; the new Admin tabs load', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.admin);
  page.on('dialog', (d) => d.accept());
  try {
    await page.goto('/apps/samadhan/?screen=admin');
    await page.getByRole('tab', { name: 'Applications' }).click();
    await expect(page.getByTestId('admin-applications')).toContainText('RMSFA');
    await page.getByRole('tab', { name: 'Mail classification' }).click();
    await expect(page.getByTestId('admin-mail-classification')).toContainText('Sender rules');
    await page.getByRole('tab', { name: 'Service desks' }).click();
    const desks = page.getByTestId('admin-workspaces');
    await desks.getByRole('checkbox', { name: 'SAP & Primary Sales enabled' }).check();
    await desks.getByRole('checkbox', { name: 'Service desks on' }).check();
    await expect(desks.getByText('Service desks are ON')).toBeVisible();
    if ((page.viewportSize()?.width ?? 1000) < 1024) await page.getByRole('button', { name: 'Open menu' }).click();
    const switcher = page.getByTestId('workspace-switcher');
    await expect(switcher.getByRole('radio', { name: 'SAP & Primary Sales' })).toBeVisible();
    await switcher.getByRole('radio', { name: 'SAP & Primary Sales' }).click();
    await expect(switcher.getByRole('radio', { name: 'SAP & Primary Sales' })).toHaveAttribute('aria-checked', 'true');
  } finally {
    // Back to the default for the other tests: desks off, SAP off, no remembered desk.
    const ws = await api(data.admin, 'GET', '/admin/workspaces');
    const sap = ws.body?.workspaces?.find((w: { key: string }) => w.key === 'SAP');
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: false });
    if (sap) await api(data.admin, 'PUT', `/admin/workspaces/${sap.id}`, { enabled: false });
    await api(data.admin, 'PUT', '/me/preferences', { workspace: null });
  }
  expect(problems).toEqual([]);
});

// ---------- v7 Phase 4: SAP & Primary Sales desk ----------
test('SAP desk: SAP details, external case, confidential and the masters tab', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.admin);
  page.on('dialog', (d) => d.accept());
  const ws = await api(data.admin, 'GET', '/admin/workspaces');
  const sapWs = ws.body?.workspaces?.find((w: { key: string }) => w.key === 'SAP');
  const sapApp = ws.body?.applications?.find((a: { code: string }) => a.code === 'SAP');
  try {
    await api(data.admin, 'PUT', `/admin/workspaces/${sapWs.id}`, { enabled: true });
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: true });
    const made = await api(data.admin, 'POST', '/tickets', {
      subject: `VA01 order save fails ${test.info().project.name}`, requesterName: 'E2E Requester', requesterEmail: 'e2e.req@test.samadhan.local', applicationId: sapApp.id,
      sap: { environment: 'Production', sapSystem: 'ECP', sapClient: '500', tcode: 'VA01', errorMessageClass: 'V1', errorMessageNo: '801', errorText: 'Error while saving sales order' },
      externalRef: { system: 'SAP for Me Case', ref: '000777/2026', priority: 'High' },
    });
    expect(made.status).toBe(201);
    await page.goto(`/apps/samadhan/?ticket=${made.body.ticket.id}`);
    await expect(page.getByTestId('sap-card')).toContainText('VA01');
    await expect(page.getByTestId('sap-card')).toContainText('ECP / 500');
    await expect(page.getByTestId('external-refs')).toContainText('000777/2026');
    await page.getByTestId('toggle-confidential').click();
    await expect(page.getByTestId('confidential-pill')).toBeVisible();
    await page.goto('/apps/samadhan/?screen=admin');
    await page.getByRole('tab', { name: 'SAP & Infra masters' }).click();
    await page.getByRole('button', { name: /^T-codes/ }).click();
    await expect(page.getByTestId('ref-masters')).toContainText('VA01');
  } finally {
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: false });
    if (sapWs) await api(data.admin, 'PUT', `/admin/workspaces/${sapWs.id}`, { enabled: false });
    await api(data.admin, 'PUT', '/me/preferences', { workspace: null });
  }
  expect(problems).toEqual([]);
});

// ---------- v7 Phase 5: Digital Apps / Infra & IT, portal application picker ----------
test('IT desks: app details on the ticket, portal application picker', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.admin);
  page.on('dialog', (d) => d.accept());
  const ws = await api(data.admin, 'GET', '/admin/workspaces');
  const dig = ws.body?.workspaces?.find((w: { key: string }) => w.key === 'DIGITAL_APPS');
  const infra = ws.body?.workspaces?.find((w: { key: string }) => w.key === 'INFRA_IT');
  const hub = ws.body?.applications?.find((a: { code: string }) => a.code === 'HUB');
  try {
    await api(data.admin, 'PUT', `/admin/workspaces/${dig.id}`, { enabled: true });
    await api(data.admin, 'PUT', `/admin/workspaces/${infra.id}`, { enabled: true, portalEnabled: true });
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: true });
    const made = await api(data.admin, 'POST', '/tickets', {
      subject: `Orders API 503 ${test.info().project.name}`, requesterName: 'E2E Requester', requesterEmail: 'e2e.req@test.samadhan.local', applicationId: hub.id,
      category: 'API / Backend', it: { layer: 'API', httpStatus: '503', correlationId: 'e2e-corr-42' },
    });
    expect(made.status).toBe(201);
    await page.goto(`/apps/samadhan/?ticket=${made.body.ticket.id}`);
    await expect(page.getByTestId('it-card')).toContainText('503');
    await expect(page.getByTestId('it-card')).toContainText('e2e-corr-42');
    await page.goto('/apps/samadhan/portal/');
    const picker = page.getByTestId('portal-app-picker');
    await expect(picker).toBeVisible();
    await picker.getByLabel('Search applications').fill('network');
    await picker.getByRole('button', { name: /Network/ }).first().click();
    await expect(page.getByLabel('What is it about?')).toContainText('Cyber Security');
    await expect(page.getByLabel('Distributor (DB) code')).toHaveCount(0);
  } finally {
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: false });
    if (dig) await api(data.admin, 'PUT', `/admin/workspaces/${dig.id}`, { enabled: false });
    if (infra) await api(data.admin, 'PUT', `/admin/workspaces/${infra.id}`, { enabled: false, portalEnabled: false });
    await api(data.admin, 'PUT', '/me/preferences', { workspace: null });
  }
  expect(problems).toEqual([]);
});

// ---------- v7 Phase 6: change and access ----------
test('change & access: transports, approvals, my approvals, calendar, registers, admin catalogue', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.admin);
  page.on('dialog', (d) => d.accept());
  const ws = await api(data.admin, 'GET', '/admin/workspaces');
  const sapWs = ws.body?.workspaces?.find((w: { key: string }) => w.key === 'SAP');
  const sapApp = ws.body?.applications?.find((a: { code: string }) => a.code === 'SAP');
  try {
    await api(data.admin, 'PUT', `/admin/workspaces/${sapWs.id}`, { enabled: true });
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: true });
    const name = test.info().project.name;
    const chg = await api(data.admin, 'POST', '/tickets', { subject: `Pricing change ${name}`, requesterName: 'E2E Requester', requesterEmail: 'e2e.req@test.samadhan.local', applicationId: sapApp.id, recordClass: 'CHANGE', category: 'Basis' });
    expect(chg.status).toBe(201);
    const chains = await api(data.admin, 'GET', `/tickets/${chg.body.ticket.id}/approvals`);
    const normal = chains.body.chains.find((c: { name: string }) => c.name === 'Normal change');
    expect((await api(data.admin, 'POST', `/tickets/${chg.body.ticket.id}/approvals`, { chainId: normal.id })).status).toBe(201);
    await page.goto(`/apps/samadhan/?ticket=${chg.body.ticket.id}`);
    await expect(page.getByTestId('approvals')).toContainText('Module / domain lead');
    const trs = page.getByTestId('transports');
    await page.getByRole('button', { name: 'New transport' }).click();
    await page.getByLabel(/^Transport number/).fill(name === 'desktop' ? 'ECDK900501' : 'ECDK900502');
    await page.getByRole('button', { name: 'Add transport' }).click();
    await expect(trs).toContainText(name === 'desktop' ? 'ECDK900501' : 'ECDK900502');
    await page.goto('/apps/samadhan/?screen=approvals');
    await expect(page.getByTestId('my-approvals')).toContainText(`Pricing change ${name}`);
    await page.goto('/apps/samadhan/?screen=calendar');
    await expect(page.getByTestId('change-calendar')).toBeVisible();
    await page.goto('/apps/samadhan/?screen=registers');
    await expect(page.getByTestId('registers')).toContainText('Change & Transport Register');
    await page.goto('/apps/samadhan/?screen=admin');
    await page.getByRole('tab', { name: 'Service catalog' }).click();
    await expect(page.getByTestId('admin-catalog')).toContainText('Role assignment');
    await api(data.admin, 'DELETE', `/tickets/${chg.body.ticket.id}/approvals`);
  } finally {
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: false });
    if (sapWs) await api(data.admin, 'PUT', `/admin/workspaces/${sapWs.id}`, { enabled: false });
    await api(data.admin, 'PUT', '/me/preferences', { workspace: null });
  }
  expect(problems).toEqual([]);
});

// ---------- v7 Phase 7: major incident, PIR, problem ----------
test('major incident: banner, PIR card, problem card, service health on the dashboard', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.admin);
  page.on('dialog', (d) => d.accept());
  const ws = await api(data.admin, 'GET', '/admin/workspaces');
  const sapWs = ws.body?.workspaces?.find((w: { key: string }) => w.key === 'SAP');
  const sapApp = ws.body?.applications?.find((a: { code: string }) => a.code === 'SAP');
  let id = 0;
  try {
    await api(data.admin, 'PUT', `/admin/workspaces/${sapWs.id}`, { enabled: true });
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: true });
    const made = await api(data.admin, 'POST', '/tickets', {
      subject: `Order creation down ${test.info().project.name}`, requesterName: 'E2E Requester', requesterEmail: 'e2e.req@test.samadhan.local', applicationId: sapApp.id, priority: 4,
      sap: { environment: 'Production', tcode: 'VA01' },
    });
    expect(made.status).toBe(201);
    expect(made.body.ticket.isMajorIncident).toBe(true);
    id = made.body.ticket.id;
    await page.goto(`/apps/samadhan/?ticket=${id}`);
    await expect(page.getByTestId('major-banner')).toContainText('MAJOR INCIDENT');
    await expect(page.getByTestId('pir-card')).toContainText('required before resolving');
    await expect(page.getByTestId('problem-card')).toBeVisible();
    await page.goto('/apps/samadhan/?screen=dashboard');
    await expect(page.getByTestId('service-health')).toContainText('Major incidents in progress');
  } finally {
    if (id) await api(data.admin, 'DELETE', `/tickets/${id}/major`, {});
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: false });
    if (sapWs) await api(data.admin, 'PUT', `/admin/workspaces/${sapWs.id}`, { enabled: false });
    await api(data.admin, 'PUT', '/me/preferences', { workspace: null });
  }
  expect(problems).toEqual([]);
});

// ---------- v7 Phase 8: S/4HANA Programme ----------
test('S/4 programme: defect with programme details and retest, programme screen', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.admin);
  const ws = await api(data.admin, 'GET', '/admin/workspaces');
  const s4 = ws.body?.workspaces?.find((w: { key: string }) => w.key === 'S4_PROGRAM');
  const app = ws.body?.applications?.find((a: { code: string }) => a.code === 'S4P');
  try {
    await api(data.admin, 'PUT', `/admin/workspaces/${s4.id}`, { enabled: true });
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: true });
    const made = await api(data.admin, 'POST', '/tickets', {
      subject: `UAT pricing defect ${test.info().project.name}`, requesterName: 'E2E Requester', requesterEmail: 'e2e.req@test.samadhan.local', applicationId: app.id,
      type: 'Defect – UAT', category: 'Order to Cash (SD)', program: { testCycle: 'UAT', defectSeverity: 'S2 High', testCaseId: 'TC-E2E-1' },
    });
    expect(made.status).toBe(201);
    await page.goto(`/apps/samadhan/?ticket=${made.body.ticket.id}`);
    await expect(page.getByTestId('program-card')).toContainText('TC-E2E-1');
    await page.getByTestId('retest').getByRole('button', { name: 'Passed' }).click();
    await expect(page.getByTestId('retest')).toContainText('Passed');
    await page.goto('/apps/samadhan/?screen=programme');
    await expect(page.getByTestId('programme')).toContainText('Defect burn-down');
  } finally {
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: false });
    if (s4) await api(data.admin, 'PUT', `/admin/workspaces/${s4.id}`, { enabled: false });
    await api(data.admin, 'PUT', '/me/preferences', { workspace: null });
  }
  expect(problems).toEqual([]);
});

// ---------- v7 Phase 9: integrations, desk analytics ----------
test('Admin > Integrations (all off) and the SAP / change / infra analytics', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.admin);
  const ws = await api(data.admin, 'GET', '/admin/workspaces');
  const sapWs = ws.body?.workspaces?.find((w: { key: string }) => w.key === 'SAP');
  try {
    await page.goto('/apps/samadhan/?screen=admin');
    await page.getByRole('tab', { name: 'Integrations' }).click();
    const box = page.getByTestId('admin-integrations');
    await expect(box).toContainText('SAP Cloud ALM');
    await expect(box).toContainText('SolMan ITSM backlog import');
    await expect(box.getByText('Off').first()).toBeVisible();
    await api(data.admin, 'PUT', `/admin/workspaces/${sapWs.id}`, { enabled: true });
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: true });
    await page.goto('/apps/samadhan/?screen=analytics');
    await page.getByRole('tab', { name: 'SAP, change & infra' }).click();
    await expect(page.getByTestId('desk-analytics')).toContainText('SAP module heat-map');
  } finally {
    await api(data.admin, 'PUT', '/admin/workspaces/flag', { enabled: false });
    if (sapWs) await api(data.admin, 'PUT', `/admin/workspaces/${sapWs.id}`, { enabled: false });
    await api(data.admin, 'PUT', '/me/preferences', { workspace: null });
  }
  expect(problems).toEqual([]);
});
