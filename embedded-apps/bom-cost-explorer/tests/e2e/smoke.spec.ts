import { expect, test, type Page } from '@playwright/test';
import jwt from 'jsonwebtoken';

const HUB_SECRET = 'e2e-hub-secret';

/** Simulates arriving from the Emami Apps hub: its session token is in localStorage. */
async function asHubUser(page: Page, email = 'cost.analyst@emamigroup.com', name = 'Cost Analyst') {
  const hubToken = jwt.sign({ email }, HUB_SECRET, { expiresIn: '1h' });
  await page.addInitScript((t) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-init', '1');
    }
    localStorage.setItem('emami_apps_session_token', t);
  }, hubToken);
  await page.goto('/');
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Emami Apps' })).toBeVisible();
}

const mode = (page: Page, label: string) => page.getByRole('navigation').getByRole('button', { name: new RegExp(label) }).click();
const editSelection = (page: Page) => page.getByRole('button', { name: /Edit selection/ }).click();

async function pick(page: Page, label: RegExp, values: string) {
  const input = page.getByLabel(label).first();
  await input.click();
  await input.fill(values);
  await input.press('Enter');
}

test('hub sign-in, BOM costing tree, drawer, dashboard, simulator', async ({ page }) => {
  await asHubUser(page);
  await pick(page, /^Materials/, 'FG1001 FG3001 NOPE');
  await pick(page, /^Plants/, '1000, 1100');
  await page.getByRole('button', { name: 'Run in SAP' }).click();
  await expect(page.getByText('SAP is costing…')).toBeVisible();

  const tree = page.getByRole('treegrid', { name: 'BOM cost tree' });
  await expect(tree).toBeVisible();
  await expect(page.getByText(/Material NOPE skipped/)).toBeVisible(); // sap-message header -> warnings panel
  await expect(page.getByText(/exchange rates taken from TCURR/)).toBeVisible(); // the two mocked sample warnings
  await expect(page.getByText(/rates older than 365 days were ignored/)).toBeVisible();
  await expect(page.getByText(/^Total/).first()).toBeVisible();
  await expect(tree.getByText('FG1001').first()).toBeVisible();

  // Row drawer with rate options side by side.
  await page.getByRole('button', { name: 'Expand all' }).click();
  await tree.getByText('PM0001').first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText(/Rate options \(\d+\)/)).toBeVisible();
  await expect(drawer.getByText('SAP selected')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Dashboard' }).click();
  await expect(page.getByText('Rows without rate')).toBeVisible();
  await expect(page.getByText('Cost by rate source')).toBeVisible();

  await page.getByRole('tab', { name: /Simulator/ }).click();
  // Component-rate simulation: +10% on one component -> impact per 1 PC and the breakup.
  await page.getByLabel('PM0001 in 1000 percent').fill('10');
  await expect(page.getByText(/Impact on cost per 1 PC/)).toBeVisible();
  await expect(page.getByText(/Material cost breakup per 1 PC/)).toBeVisible();
  await expect(page.getByText(/1 changed/)).toBeVisible();
  await page.getByRole('button', { name: /More what-ifs/ }).click();
  await page.getByRole('radio', { name: 'Cheapest option' }).click();
  await expect(page.getByText(/lines re-picked/)).toBeVisible();
  await expect(page.getByText('Simulated INR', { exact: false }).first()).toBeVisible();

  await page.getByRole('tab', { name: /Data quality/ }).click();
  await expect(page.getByRole('group', { name: 'Filter findings' }).or(page.getByText('No data-quality findings'))).toBeVisible();
});

test('plant comparison pivot in INR', async ({ page }) => {
  await asHubUser(page);
  await mode(page, 'Plant comparison');
  await pick(page, /^Materials/, 'FG2001');
  await pick(page, /BOM plant/, '1000');
  await pick(page, /Compare in plants/, '1000 1100 BD10');
  await page.getByRole('button', { name: 'Run in SAP' }).click();
  const table = page.getByRole('table', { name: 'Plant comparison' });
  await expect(table).toBeVisible();
  await expect(table.getByText('Cheapest')).toBeVisible();
  await expect(table.getByText(/TOTAL/).first()).toBeVisible();
});

test('rates are server-paged; SAP error and cancel are surfaced', async ({ page }) => {
  await asHubUser(page);
  await mode(page, 'Rates');
  await pick(page, /^Materials/, 'FG1001');
  await pick(page, /^Plants/, '1000 1100');
  await page.getByRole('button', { name: 'Run in SAP' }).click();
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

  await mode(page, 'BOM costing');
  const mats = page.getByLabel(/^Materials/).first();
  if (!(await mats.isVisible())) await editSelection(page);
  await mats.press('Backspace');
  await pick(page, /^Materials/, 'FAIL01');
  await page.getByRole('button', { name: 'Run in SAP' }).click();
  await expect(page.getByText(/SAP error:/)).toBeVisible();
  await expect(page.getByText(/BOM explosion error/)).toBeVisible();

  await mats.press('Backspace');
  await pick(page, /^Materials/, 'FG9000');
  await page.getByRole('button', { name: 'Run in SAP' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Run cancelled.')).toBeVisible();
});

test('API rejects unauthenticated calls and requires Matnr / Werks', async ({ request }) => {
  const anon = await request.post('/api/cost', { data: { query: { mode: 'B', materials: ['FG1001'], plants: ['1000'] } } });
  expect(anon.status()).toBe(401);
  const s = await request.post('/api/session', { data: { hubToken: jwt.sign({ email: 'x@emamigroup.com' }, HUB_SECRET) } });
  const { token } = await s.json();
  const noPlant = await request.post('/api/cost', { headers: { Authorization: `Bearer ${token}` }, data: { query: { mode: 'R', materials: ['FG1001'], plants: [] } } });
  expect(noPlant.status()).toBe(400);
  const plants = await request.get('/api/plants', { headers: { Authorization: `Bearer ${token}` } });
  expect(plants.headers()['cache-control']).toBe('no-store');
});
