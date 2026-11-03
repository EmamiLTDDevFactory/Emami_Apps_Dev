import { expect, test, type Page } from '@playwright/test';

/** Hub sign-in stub (same as smoke.spec.ts): email + session token in localStorage, Manage Access role lookup stubbed as Admin. */
async function asHubUser(page: Page) {
  await page.route('**/access/me**', (route) => route.fulfill({ json: { success: true, apps: [{ appId: 'bom-cost-explorer', role: 'Admin' }] } }));
  await page.addInitScript(() => {
    localStorage.setItem('emami_apps_user_email', 'cost.analyst@emamigroup.com');
    localStorage.setItem('emami_apps_session_token', 'hub-session-token');
  });
}
async function pick(page: Page, label: RegExp, value: string) {
  const input = page.getByLabel(label).first();
  await input.click();
  await input.fill(value);
  await input.press('Enter');
}

test('Freight analysis: nothing picked asks for a plant or a material, then materials alone and a plant alone both run', async ({ page }) => {
  await asHubUser(page);
  await page.goto('./freight-analysis/');
  await expect(page.getByRole('heading', { name: 'Freight analysis' })).toBeVisible();

  // the labels no longer talk about finished goods
  await expect(page.getByText(/Finished goods \(whose BOM components/)).toHaveCount(0);
  await expect(page.getByText('Materials (comma / space separated)')).toBeVisible();
  await expect(page.getByLabel('Freight look-back (days)')).toHaveValue('92');
  await expect(page.getByText('days back from today, sent to SAP as typed')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include freight' })).toBeChecked(); // both dates are filled

  // nothing picked: a clear message, no SAP call
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a plant or at least one material' }).first()).toBeVisible();

  // materials alone (no plant): no "no material" error, the run starts and answers
  await pick(page, /^Materials/, 'PM0001');
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect(page.getByText(/Pick at least one (plant|material)/)).toHaveCount(0);
  await expect(page.getByText(/Reading from SAP|No components|Components/).first()).toBeVisible({ timeout: 60_000 });
});

test('Freight analysis: the look-back is not capped (what is typed is what is sent) and Include freight follows the dates', async ({ page }) => {
  await asHubUser(page);
  const sent: string[] = [];
  page.on('request', (r) => { if (/FreightRowSet/.test(r.url())) sent.push(decodeURIComponent(r.url())); });
  await page.goto('./freight-analysis/');
  const days = page.getByLabel('Freight look-back (days)');
  await days.fill('500');
  await days.blur();
  await expect(days).toHaveValue('500'); // not cut to 92
  await pick(page, /^Plants/, '1000');
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect.poll(() => sent.some((u) => u.includes('FreightDays eq 500')), { timeout: 30_000 }).toBe(true);
  // clearing both dates: Include freight defaults to unchecked again (until the person decides)
  await page.getByLabel('From date').fill('');
  await expect(page.getByRole('checkbox', { name: 'Include freight' })).not.toBeChecked();
});

test('Freight analysis: a plant alone runs without any material picked', async ({ page }) => {
  await asHubUser(page);
  await page.goto('./freight-analysis/');
  await pick(page, /^Plants/, '1000');
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect(page.getByText('Enter a plant or at least one material')).toHaveCount(0);
  // it runs on the plant alone and answers; never the old "no material" refusal
  // the plant's components come back from SAP (mock) and the result block shows
  await expect(page.getByText('Components', { exact: true }).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('alert').filter({ hasText: /Enter at least one material|Enter a plant or at least one material/ })).toHaveCount(0);
});

test('Freight analysis: the purchase order wise view lists the PO lines behind the component figures', async ({ page }) => {
  await asHubUser(page);
  await page.goto('./freight-analysis/');
  await pick(page, /^Plants/, '1000');
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect(page.getByText('Components', { exact: true }).first()).toBeVisible({ timeout: 90_000 });

  // component view first: the PO count of a component is a link into its PO lines
  const poLink = page.getByRole('button', { name: /Show the \d+ purchase order line\(s\) of/ }).first();
  await expect(poLink).toBeVisible();
  const label = (await poLink.getAttribute('aria-label')) ?? '';
  const material = /of (\S+) in plant/.exec(label)?.[1] ?? '';
  expect(material).not.toBe('');
  await poLink.click();

  // PO view, filtered to that component
  const table = page.getByRole('table', { name: /Purchase order wise freight lines/ });
  await expect(table).toBeVisible();
  for (const h of ['Purchase order', 'Line', 'PO date', 'Condition', 'Actual / unit', 'Standard / unit', 'Variance']) await expect(table.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
  await expect(page.getByLabel('Search components')).toHaveValue(material);
  const rows = table.locator('tbody tr');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(table.locator('tbody').getByText(/^\d{10}$/).first()).toBeVisible(); // a purchase order number

  // back to the component summary
  await page.getByRole('radio', { name: /By component/ }).click();
  await expect(page.getByRole('table', { name: /Purchase order wise/ })).toHaveCount(0);
});

test("Freight analysis: Latest only is sent as 'X' when ticked and as a single blank when not", async ({ page }) => {
  await asHubUser(page);
  const sent: string[] = [];
  page.on('request', (r) => { if (/FreightRowSet/.test(r.url())) sent.push(decodeURIComponent(r.url())); });
  await page.goto('./freight-analysis/');
  const box = page.getByRole('checkbox', { name: 'Latest only' });
  await expect(box).not.toBeChecked(); // off by default
  await pick(page, /^Plants/, '1000');
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect.poll(() => sent.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(sent.every((u) => u.includes("LatestOnly eq ' '") && !u.includes("LatestOnly eq 'X'"))).toBe(true); // unticked: a single blank

  sent.length = 0;
  await expect(page.getByRole('button', { name: 'Execute' })).toBeEnabled({ timeout: 60_000 });
  await box.check();
  await page.getByRole('button', { name: 'Execute' }).click();
  await expect.poll(() => sent.some((u) => u.includes("LatestOnly eq 'X'")), { timeout: 30_000 }).toBe(true);
});
