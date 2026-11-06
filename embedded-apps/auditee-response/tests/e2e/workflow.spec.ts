import { expect, test } from './fixtures';

// Demo mode, production export. Each test has a fresh browser context = fresh demo data.
const open = async (page: import('@playwright/test').Page, guid: string, track = 'audit') => {
  await page.goto(`workpaper/?track=${track}&guid=${guid}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.locator('article.obs').first().waitFor();
};

test('My observations: tabs, grouping, counts, FY filter and search', async ({ page }) => {
  await page.goto('');
  await expect(page.getByRole('heading', { name: 'My observations' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Audit observations' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Procure to Pay / Vendor master maintenance' })).toBeVisible();
  await expect(page.locator('.stat').first()).toContainText('2');
  await page.getByLabel('Financial year').selectOption('2024');
  await expect(page.locator('.wpitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Search').fill('credit');
  await expect(page.locator('.wpitem')).toHaveCount(1);
  await page.getByLabel('Search').fill('nothing like this');
  await expect(page.getByText('No workpapers match the filters.')).toBeVisible();
  await page.getByRole('tab', { name: 'MIS observations' }).click();
  await expect(page).toHaveURL(/track=mis/);
  await expect(page.getByRole('region', { name: 'Record to Report / Month-end provisions' })).toBeVisible();
});

test('respond: counter, browser draft survives a reload, submit with confirmation, waiting for others', async ({ page }) => {
  await open(page, 'DEMO-WP-1001');
  const submit = page.getByRole('button', { name: 'Submit to reviewer' });
  await expect(submit).toBeDisabled();
  const first = page.getByLabel('My response').first();
  await first.fill('PAN check will be added by December.');
  await expect(page.locator('.counter').first()).toHaveText('36 / 4000 characters');
  await expect(submit).toBeDisabled(); // observation 2 still empty
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved in this browser')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('My response').first()).toHaveValue('PAN check will be added by December.');
  await page.getByLabel('My response').nth(1).fill('FK08 confirmation will be switched on.');
  await submit.click();
  const dialog = page.getByRole('dialog', { name: 'Submit your response?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Your response was submitted. Waiting for: Anil Mehta.')).toBeVisible();
  await expect(page.locator('h1 .chip')).toHaveText('Awaiting response');
  await expect(page.getByRole('button', { name: 'Submit again' })).toBeEnabled();
});

test('last assignee submits: workpaper moves to Management responded and turns read only', async ({ page }) => {
  await open(page, 'DEMO-WP-1003');
  await page.getByLabel('My response').fill('Differences will be posted after approval this month.');
  await page.getByRole('button', { name: 'Submit to reviewer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/Every assignee has now responded/)).toBeVisible();
  await expect(page.locator('h1 .chip')).toHaveText('Management responded');
  await expect(page.getByText(/It is read only/)).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await page.getByRole('link', { name: 'My observations' }).first().click();
  await expect(page.locator('.wpitem', { hasText: 'Guwahati' }).locator('.chip')).toHaveText('Management responded');
});

test('closed workpaper is read only with a banner; attachments can be downloaded', async ({ page }) => {
  await open(page, 'DEMO-WP-0512');
  await expect(page.getByText('This workpaper is closed. It is read only.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Submit/ })).toHaveCount(0);
  await open(page, 'DEMO-WP-0907');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Role change approval.pdf' }).click();
  expect((await download).suggestedFilename()).toBe('Role change approval.pdf');
  await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
});

test('attachments: upload, duplicate refused, delete own only', async ({ page }) => {
  await open(page, 'DEMO-WP-1001');
  await expect(page.getByRole('button', { name: 'Delete Vendor duplicates list.xlsx' })).toHaveCount(0);
  await page.getByLabel('Add a file').setInputFiles({ name: 'evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await expect(page.locator('.att li', { hasText: 'evidence.pdf' })).toContainText('Uploaded by you');
  await page.getByLabel('Add a file').setInputFiles({ name: 'evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await expect(page.locator('.banner.err')).toContainText('already attached');
  await page.getByRole('button', { name: 'Delete evidence.pdf' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.att li', { hasText: 'evidence.pdf' })).toHaveCount(0);
});

test('unknown workpaper shows an error state', async ({ page }) => {
  await page.goto('workpaper/?track=audit&guid=NOPE');
  await expect(page.locator('.banner.err')).toContainText('not found');
});
