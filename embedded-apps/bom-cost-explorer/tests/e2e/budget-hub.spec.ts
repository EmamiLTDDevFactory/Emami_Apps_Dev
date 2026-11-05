import { expect, test, type Page } from '@playwright/test';

// Needs the app started with NEXT_PUBLIC_BUDGET_ENABLED=true (the module is off by default and nothing below exists then).
test.skip(process.env.NEXT_PUBLIC_BUDGET_ENABLED !== 'true', 'NEXT_PUBLIC_BUDGET_ENABLED is off');

async function asUser(page: Page, role: string) {
  await page.route('**/access/me**', (route) => route.fulfill({ json: { success: true, apps: [{ appId: 'bom-cost-explorer', role }] } }));
  await page.addInitScript(() => {
    localStorage.setItem('emami_apps_user_email', 'budget.user@emamigroup.com');
    localStorage.setItem('emami_apps_session_token', 'hub-session-token');
  });
}
async function pick(page: Page, label: RegExp, value: string) {
  const input = page.getByLabel(label).first();
  await input.click(); await input.fill(value); await input.press('Enter');
}

test('Admin: one Budget item, three tabs kept mounted, selection folds after Run, Approvals load on first open only', async ({ page }) => {
  await asUser(page, 'Admin');
  const sent: string[] = [];
  page.on('request', (r) => { if (/Budget\w*Set/.test(r.url())) sent.push(decodeURIComponent(r.url())); });
  await page.goto('./budget-cost/');

  await expect(page.locator('a[href*="/budget-cost/"]')).toHaveCount(1); // ONE side-pane item
  await expect(page.getByRole('tab')).toHaveText(['Run and summary', 'BOM checklist', 'Approvals']);
  await expect(page.getByRole('tab', { name: 'Run and summary' })).toHaveAttribute('aria-selected', 'true');
  expect(sent).toHaveLength(0); // nothing is requested on page load

  await page.getByLabel(/^Posting date from/).fill('2026-04-01');
  await pick(page, /^Plants/, '1000');
  await pick(page, /^Materials/, 'FG1001');
  await pick(page, /^Materials/, 'FG1002');
  await page.getByRole('switch', { name: /All business lines/ }).check().catch(async () => { await page.getByLabel(/All business lines/).check(); });
  await page.getByRole('button', { name: 'Run in SAP' }).click();
  await expect(page.getByText('Finished goods', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  // the selection card folds into a one-line bar with Edit selection
  await expect(page.getByRole('button', { name: 'Edit selection' })).toBeVisible();
  await expect(page.getByLabel(/^Posting date from/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit selection' }).click();
  await expect(page.getByLabel(/^Posting date from/)).toBeVisible();
  await page.getByRole('button', { name: 'Hide selection' }).click();

  // BOM checklist: the hash follows the tab, it uses the last run's selection
  await page.getByRole('tab', { name: 'BOM checklist' }).click();
  await expect(page).toHaveURL(/#checklist$/);
  await page.getByRole('button', { name: 'Run checklist' }).click();
  await expect(page.getByText(/finished goods have an issue/)).toBeVisible({ timeout: 60_000 });
  expect(sent.some((u) => u.includes('BudgetPendSet'))).toBe(false); // Approvals were never opened

  // Approvals load on first open
  await page.getByRole('tab', { name: 'Approvals' }).click();
  await expect(page).toHaveURL(/#approvals$/);
  await expect(page.getByText('Waiting for your approval')).toBeVisible();
  await expect.poll(() => sent.some((u) => u.includes('BudgetPendSet'))).toBe(true);
  await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Approved/ })).toBeVisible({ timeout: 30_000 });

  // back: the run survived the tab switches
  await page.getByRole('tab', { name: 'Run and summary' }).click();
  await expect(page.getByRole('button', { name: 'Edit selection' })).toBeVisible();
  await expect(page.getByText('Finished goods', { exact: true }).first()).toBeVisible();
});

test('a hash opens its tab; an approver-only person sees Approvals only and lands there', async ({ page }) => {
  await asUser(page, 'budget-approve');
  await page.goto('./budget-cost/#run'); // not a tab of this role: falls back to the role's default
  await expect(page.getByRole('tab')).toHaveText(['Approvals']);
  await expect(page.getByRole('tab', { name: 'Approvals' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Waiting for your approval')).toBeVisible();
});

test('budget-init sees Run and summary + BOM checklist; the old approvals page forwards to #approvals', async ({ page }) => {
  await asUser(page, 'budget-init');
  await page.goto('./budget-cost/');
  await expect(page.getByRole('tab')).toHaveText(['Run and summary', 'BOM checklist']);
  await asUser(page, 'Admin');
  await page.goto('./budget-cost/approvals/');
  await expect(page).toHaveURL(/\/budget-cost\/#approvals$/);
  await expect(page.getByRole('tab', { name: 'Approvals' })).toHaveAttribute('aria-selected', 'true');
});
