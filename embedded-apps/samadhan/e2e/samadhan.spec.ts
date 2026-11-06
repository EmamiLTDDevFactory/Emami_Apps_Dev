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
    await expect(page.locator('body')).not.toContainText(/setu/i);
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

test('old link /apps/setu/?ticket=<id> forwards to Samadhan and opens the ticket', async ({ page }) => {
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto(`/apps/setu/?ticket=${data.ticketId}`);
  await page.waitForURL(`**/apps/samadhan/?ticket=${data.ticketId}`);
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

test('old portal link /apps/setu/portal/ forwards and the portal opens', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/apps/setu/portal/');
  await page.waitForURL('**/apps/samadhan/portal/');
  await expect(page.getByLabel(/Your name/)).toBeVisible();
  expect(problems).toEqual([]);
});

test('CSAT link from an old email (/apps/setu/portal/?csat=) forwards and shows the survey', async ({ page }) => {
  const problems = watch(page);
  await page.goto(`/apps/setu/portal/?csat=${data.csatToken}`);
  await page.waitForURL(`**/apps/samadhan/portal/?csat=${data.csatToken}`);
  await expect(page.getByRole('radiogroup', { name: 'Your rating' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('an Agent cannot use Admin: no menu entry, and the Admin API answers 403 on both paths', async ({ page, request }) => {
  const problems = watch(page);
  await signIn(page, data.agent);
  await page.goto('/apps/samadhan/');
  const n = await nav(page);
  await expect(n.getByRole('button', { name: /^Admin\b/ })).toHaveCount(0);
  for (const base of [data.api, data.api.replace(/\/samadhan$/, '/setu')]) {
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
  await page.getByRole('button', { name: 'Open' }).first().click();
  await expect(page.getByText('Effective access (saved)')).toBeVisible();
  expect(problems).toEqual([]);
});
