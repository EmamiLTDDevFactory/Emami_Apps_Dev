import { test } from './fixtures';
import { expectNoSeriousViolations } from './axe';
import { openRequest, startRequest, switchUser } from './helpers';

// Accessibility (axe-core): every page, every tab of a request including grid tabs, messages, the combobox and the dialog.
// Each test starts from a fresh browser context (fresh demo data) and does not depend on another; they run in parallel.
// Fails on serious or critical violations. Tab tests check the tab bar and the panel only; the page chrome is covered by the page tests.
const TAB_REGION = ['[role=tablist]', '#tabpanel'];

test.describe('@a11y pages', () => {
  test('home', async ({ page }) => {
    await page.goto('');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await expectNoSeriousViolations(page, 'home');
  });

  test('requests list', async ({ page }) => {
    await page.goto('requests/');
    await page.getByRole('link', { name: '1000000001' }).waitFor();
    await expectNoSeriousViolations(page, 'requests');
  });

  test('new request, with an open combobox', async ({ page }) => {
    await page.goto('requests/new/');
    await page.getByRole('heading', { name: 'New material request' }).waitFor();
    await expectNoSeriousViolations(page, 'new request');
    await page.locator('#mtart').fill('F');
    await page.locator('#mtart').press('ArrowDown');
    await page.getByRole('listbox').waitFor();
    await expectNoSeriousViolations(page, 'new request with an open combobox');
  });

  test('request view: every tab of a seeded request, then the messages', async ({ page }) => {
    await page.goto('requests/view/?id=1000000001');
    await page.getByRole('tablist').waitFor();
    await expectNoSeriousViolations(page, 'request view');
    for (const tab of await page.getByRole('tab').all()) {
      await tab.click();
      await expectNoSeriousViolations(page, `request tab ${await tab.innerText()}`, TAB_REGION);
    }
    await page.getByRole('button', { name: 'Validate' }).click();
    await page.getByRole('alert', { name: 'Messages' }).waitFor();
    await expectNoSeriousViolations(page, 'request with messages');
  });

  test('grid tabs: rows, cell errors, second grid', async ({ page }) => {
    const id = await startRequest(page, { description: 'E2E GRID', views: ['Sales: tax data', 'Units of measure'], draft: true });
    await openRequest(page, id);
    await page.getByRole('tab', { name: /Sales: tax data/ }).click();
    await page.getByRole('button', { name: 'Add row' }).click();
    await expectNoSeriousViolations(page, 'grid tab with a row', TAB_REGION);
    await page.getByRole('button', { name: 'Validate' }).click();
    await page.getByRole('alert', { name: 'Messages' }).waitFor();
    await expectNoSeriousViolations(page, 'grid tab with cell errors');
    await page.getByRole('tab', { name: /Units of measure/ }).click();
    await expectNoSeriousViolations(page, 'second grid tab', TAB_REGION);
  });

  test('attachments, comments and the approve dialog', async ({ page }) => {
    await page.goto('');
    await switchUser(page, 'reviewer');
    await openRequest(page, '1000000003'); // in progress at level 1: the reviewer's request
    await page.getByRole('tablist').waitFor();
    await expectNoSeriousViolations(page, 'attachments and comments section');
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('dialog').waitFor();
    await expectNoSeriousViolations(page, 'approve dialog');
  });
});
