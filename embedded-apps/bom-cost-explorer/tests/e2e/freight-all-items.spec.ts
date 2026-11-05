import { expect, test, type Page } from '@playwright/test';

// Needs the app started with NEXT_PUBLIC_FREIGHT_ALL_ITEMS=true (the flag is off by default and nothing below exists then).
test.skip(process.env.NEXT_PUBLIC_FREIGHT_ALL_ITEMS !== 'true', 'NEXT_PUBLIC_FREIGHT_ALL_ITEMS is off');

async function asHubUser(page: Page) {
  await page.route('**/access/me**', (route) => route.fulfill({ json: { success: true, apps: [{ appId: 'bom-cost-explorer', role: 'Admin' }] } }));
  await page.addInitScript(() => {
    localStorage.setItem('emami_apps_user_email', 'cost.analyst@emamigroup.com');
    localStorage.setItem('emami_apps_session_token', 'hub-session-token');
  });
}

test('Freight analysis with all postings: basis, By posting, PO-line breakup, no extra SAP request', async ({ page }) => {
  await asHubUser(page);
  const sent: string[] = [];
  page.on('request', (r) => { if (/FreightRowSet/.test(r.url())) sent.push(decodeURIComponent(r.url())); });
  await page.goto('./freight-analysis/');
  const plants = page.getByLabel(/^Plants/).first();
  await plants.click(); await plants.fill('1000'); await plants.press('Enter');
  await page.getByLabel('From date').fill('2025-01-01');
  await page.getByLabel('Freight look-back (days)').fill('400');
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect(page.getByText('Components', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  expect(sent.some((u) => u.includes("AllItems eq 'X'") && u.includes("LatestOnly eq ' '"))).toBe(true);
  const calls = sent.length;

  await expect(page.getByRole('radio', { name: 'All line items' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /By posting/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Max date per PO line' }).click();
  await page.getByRole('radio', { name: 'All line items' }).click();
  await page.getByRole('checkbox', { name: 'Latest only' }).check();
  await page.getByRole('radio', { name: /By posting/ }).click();
  await expect(page.getByText('Max date').first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Shkzg' })).toBeVisible();

  await page.getByRole('radio', { name: /By purchase order/ }).click();
  await expect(page.getByRole('columnheader', { name: 'Shkzg' })).toBeVisible();
  await page.getByRole('button', { name: /Show every posting of PO/ }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Actual total')).toBeVisible();
  await expect(drawer.getByText('Standard total')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  expect(sent.length).toBe(calls); // nothing above called SAP again
});
