import { expect, test, type Page } from '@playwright/test';

/** Every URL the browser requested (to prove where SAP data comes from). */
const seen: string[] = [];

/** Simulates arriving from the Emami Apps hub: its email + session token are in localStorage.
 * The Manage Access role lookup (roles only, no SAP data) is stubbed as Admin. */
async function asHubUser(page: Page, email = 'cost.analyst@emamigroup.com', name = 'Cost Analyst') {
  page.on('request', (r) => seen.push(r.url()));
  await page.route('**/access/me**', (route) => route.fulfill({ json: { success: true, apps: [{ appId: 'bom-cost-explorer', role: 'Admin' }] } }));
  await page.addInitScript((e) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-init', '1');
    }
    localStorage.setItem('emami_apps_user_email', e);
    localStorage.setItem('emami_apps_session_token', 'hub-session-token');
  }, email);
  await page.goto('./');
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

test('SAP is called straight from the browser; environment badge; admin diagnostics', async ({ page }) => {
  seen.length = 0;
  await asHubUser(page);
  await expect(page.getByText('SAP NGD · development')).toBeVisible();
  await pick(page, /^Materials/, 'FG1001');
  await pick(page, /^Plants/, '1000');
  await page.getByRole('button', { name: 'Run in SAP' }).click();
  await expect(page.getByRole('treegrid', { name: 'BOM cost tree' })).toBeVisible();
  const sap = seen.filter((u) => u.includes('/ZMM_BOM_COST_SRV/'));
  expect(sap.length).toBeGreaterThan(0);
  expect(sap.every((u) => u.startsWith('http://localhost:4599/api/NGD/ZMM_BOM_COST_SRV/'))).toBe(true);
  expect(seen.filter((u) => u.includes('audit-capa-api') || u.includes('/dev-api/bom-cost'))).toEqual([]);
  expect(sap.some((u) => /RateOptionSet|\)\/RateOptions/.test(u))).toBe(false);

  await page.getByRole('link', { name: /Connection/ }).click();
  await expect(page.getByRole('heading', { name: 'SAP connection diagnostics' })).toBeVisible();
  await page.getByLabel('Material (d)').fill('FG1001');
  await page.getByLabel('Plant (d)').fill('1000');
  await page.getByRole('button', { name: 'Run checks' }).click();
  await expect(page.getByText('First 10 CostLine properties:')).toBeVisible();
  await expect(page.getByText(/Every entity set, the navigation and every property used by the code exists/)).toBeVisible();
  await expect(page.getByText('Received on at least one response.')).toBeVisible();
});
