import { expect, test, type Page } from '@playwright/test';

async function asHubUser(page: Page) {
  await page.route('**/access/me**', (route) => route.fulfill({ json: { success: true, apps: [{ appId: 'bom-cost-explorer', role: 'Admin' }] } }));
  await page.addInitScript(() => {
    localStorage.setItem('emami_apps_user_email', 'cost.analyst@emamigroup.com');
    localStorage.setItem('emami_apps_session_token', 'hub-session-token');
  });
}

test('Freight analysis: purchase organisation selection and the material wise weighted average view', async ({ page }) => {
  await asHubUser(page);
  const sent: string[] = [];
  page.on('request', (r) => { if (/FreightRowSet/.test(r.url())) sent.push(decodeURIComponent(r.url())); });
  await page.goto('./freight-analysis/');
  const plants = page.getByLabel(/^Plants/).first();
  await plants.click(); await plants.fill('1000'); await plants.press('Enter');
  await page.getByLabel('From date').fill('2025-01-01');
  await page.getByLabel('Freight look-back (days)').fill('400');
  await page.getByLabel('Purchase organisation(s)').fill('1000');
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect(page.getByText('Components', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  expect(sent.some((u) => u.includes("Ekorg eq '1000'"))).toBe(true);
  const calls = sent.length;

  await page.getByRole('radio', { name: /Material wise/ }).click();
  await expect(page.getByRole('columnheader', { name: /Weighted avg actual \/ unit/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Net actual amount/ })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.getByRole('radio', { name: /By purchase order/ }).click();
  await expect(page.getByRole('columnheader', { name: /Net std amount/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Purch. org' })).toBeVisible();
  expect(sent.length).toBe(calls); // switching views asks SAP for nothing
});

test('Freight analysis: an invalid purchase organisation is refused before any SAP call', async ({ page }) => {
  await asHubUser(page);
  const sent: string[] = [];
  page.on('request', (r) => { if (/FreightRowSet/.test(r.url())) sent.push(r.url()); });
  await page.goto('./freight-analysis/');
  const plants = page.getByLabel(/^Plants/).first();
  await plants.click(); await plants.fill('1000'); await plants.press('Enter');
  await page.getByLabel('Purchase organisation(s)').fill('TOOLONG');
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /purchase organisation/ }).first()).toBeVisible();
  expect(sent).toHaveLength(0);
});
