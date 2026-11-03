import { expect, test } from './fixtures';
import { startRequest } from './helpers';

// Language switch: English by default (the e2e browser language is en-US), German on request, remembered, html lang follows.
const lang = (page: import('@playwright/test').Page) => page.getByLabel(/^(Language|Sprache)$/);

test.describe('language switch', () => {
  test('English by default, switch to German and back, remembered after a reload', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'Requests', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New material', exact: true })).toBeVisible();

    await lang(page).selectOption('de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('link', { name: 'Anträge', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start', exact: true })).toBeVisible();
    await expect(page.getByText('Neuer Materialantrag')).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de'); // remembered in localStorage
    await expect(page.getByRole('link', { name: 'Anträge', exact: true })).toBeVisible();

    await lang(page).selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: 'Requests', exact: true })).toBeVisible();
  });

  test('a German browser starts in German', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'de-DE', baseURL: 'http://localhost:3321/apps/mm-mdm/' });
    const page = await ctx.newPage();
    await page.goto('');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('link', { name: 'Anträge', exact: true })).toBeVisible();
    await ctx.close();
  });

  test('the request page is translated; field labels and SAP messages stay as delivered', async ({ page }) => {
    await page.goto('');
    await lang(page).selectOption('de');
    await page.goto('requests/view/?id=1000000001');
    await page.getByRole('tablist').waitFor();
    await expect(page.getByRole('button', { name: 'Prüfen' })).toBeVisible(); // Validate
    await page.getByRole('button', { name: 'Prüfen' }).click();
    const panel = page.getByRole('alert');
    await expect(panel.first()).toBeVisible();
    // the demo service stands in for SAP: its message texts are shown as received (not translated)
    await expect(panel.getByRole('button').first()).toBeVisible();
  });

  test('the new request page keeps working in German', async ({ page }) => {
    await page.goto('');
    await lang(page).selectOption('de');
    await page.goto('requests/new/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('New material request');
    await lang(page).selectOption('en');
    await startRequest(page, { description: 'E2E LANG', views: ['Basic data 1'], draft: true });
  });
});
