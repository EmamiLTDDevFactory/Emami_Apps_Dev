import { expect, test, type Page } from '@playwright/test';
import jwt from 'jsonwebtoken';

const HUB_SECRET = 'e2e-hub-secret';

/** Simulates arriving from the Emami Apps hub: its session token is in localStorage. */
async function asHubUser(page: Page, email = 'cost.analyst@emamigroup.com') {
  const hubToken = jwt.sign({ email }, HUB_SECRET, { expiresIn: '1h' });
  await page.addInitScript((t) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-init', '1');
    }
    localStorage.setItem('emami_apps_session_token', t);
  }, hubToken);
  await page.goto('/');
  await expect(page.getByText(email)).toBeVisible();
}

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
  await page.getByRole('radio', { name: 'Cheapest option' }).click();
  await expect(page.getByText(/lines re-picked/)).toBeVisible();
  await expect(page.getByText('Simulated INR', { exact: false }).first()).toBeVisible();

  await page.getByRole('tab', { name: /Data quality/ }).click();
  await expect(page.getByRole('group', { name: 'Filter findings' }).or(page.getByText('No data-quality findings'))).toBeVisible();
});

test('plant comparison pivot in INR', async ({ page }) => {
  await asHubUser(page);
  await page.getByRole('radio', { name: /C\s*Plant comparison/ }).click();
  await pick(page, /^Materials/, 'FG2001');
  await pick(page, /BOM plant/, '1000');
  await pick(page, /Comparison plants/, '1000 1100 BD10');
  await page.getByRole('button', { name: 'Run in SAP' }).click();
  const table = page.getByRole('table', { name: 'Plant comparison' });
  await expect(table).toBeVisible();
  await expect(table.getByText('Cheapest')).toBeVisible();
  await expect(table.getByText(/TOTAL/).first()).toBeVisible();
});

test('rates are server-paged; SAP error and cancel are surfaced', async ({ page }) => {
  await asHubUser(page);
  await page.getByRole('radio', { name: /R\s*Rates/ }).click();
  await pick(page, /^Materials/, 'FG1001');
  await pick(page, /^Plants/, '1000 1100');
  await page.getByRole('button', { name: 'Run in SAP' }).click();
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

  // Forbidden plant never reaches SAP (not in this user's plants, so the picker drops it).
  await page.getByRole('radio', { name: /B\s*BOM costing/ }).click();
  const mats = page.getByLabel(/^Materials/).first();
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

test('API rejects unauthenticated calls and unauthorised plants', async ({ request }) => {
  const anon = await request.post('/api/cost', { data: { query: { mode: 'B', materials: ['FG1001'], plants: ['1000'] } } });
  expect(anon.status()).toBe(401);
  const s = await request.post('/api/session', { data: { hubToken: jwt.sign({ email: 'x@emamigroup.com' }, HUB_SECRET) } });
  const { token } = await s.json();
  const bad = await request.post('/api/cost', { headers: { Authorization: `Bearer ${token}` }, data: { query: { mode: 'B', materials: ['FG1001'], plants: ['AE10'] } } });
  expect(bad.status()).toBe(403);
});
