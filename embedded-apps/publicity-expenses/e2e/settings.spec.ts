import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

// Settings (admin): exclusion rules picked from the CDS results, budget upload round-trip from the template, mapping.
// Desktop only (the same screens are covered at 360 px for layout by the screen tour below).
const BASE = '/apps/publicity-expenses/';
const SHOTS = process.env.E2E_SHOTS || '';

async function signIn(page: Page, token = process.env.E2E_TOKEN || '', email = 'e2e.user@emamigroup.com') {
  expect(token, 'token printed by e2e/mock-server.js').not.toBe('');
  await page.goto(`${BASE}?fy=2026&p=7`);
  await page.evaluate(([t, e]) => { localStorage.setItem('emami_apps_session_token', t); localStorage.setItem('emami_apps_user_email', e); }, [token, email]);
}
const crore = (s: string) => Number(s.replace(/[^\d.]/g, ''));

test('a viewer has no Settings; an admin has', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-360', 'role check is layout independent');
  await signIn(page, process.env.E2E_VIEWER_TOKEN, 'e2e.viewer@emamigroup.com');
  await page.goto(`${BASE}?v=overview&fy=2026&p=7`);
  await expect(page.getByText('Total A&P spend').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /Settings/ })).toHaveCount(0);
  await signIn(page);
  await page.goto(`${BASE}?v=overview&fy=2026&p=7`);
  await expect(page.getByRole('button', { name: /Settings/ })).toBeVisible({ timeout: 60_000 });
});

test('exclusion rule picked from the data removes its amount everywhere; "show without" brings it back', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-360', 'desktop flow');
  await signIn(page);
  // Baseline = the report without any rule (x=0), so rules left by other runs do not matter.
  await page.goto(`${BASE}?v=overview&fy=2026&p=7&u=crore&x=0`);
  const kpi = page.getByText(/^₹ [\d.,]+ Cr$/).first();
  await expect(kpi).toBeVisible({ timeout: 60_000 });
  const before = crore(await kpi.innerText());
  await page.getByRole('button', { name: 'Apply exclusions' }).click();

  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Add rule' }).click();
  const drawer = page.locator('[role=dialog]');
  await expect(drawer.getByText('New rule')).toBeVisible();
  await drawer.getByLabel('Dimension').selectOption('GL');
  // Pick the two largest G/L accounts from the list built from the CDS results.
  const firstRows = drawer.locator('tbody tr');
  await expect(firstRows.first()).toBeVisible({ timeout: 30_000 });
  await firstRows.nth(0).click();
  await firstRows.nth(1).click();
  await expect(drawer.getByText(/this rule on its own removes/)).toBeVisible({ timeout: 15_000 });
  await drawer.getByLabel('Reason').fill('E2E: corporate campaign, not product A&P');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/d-rule-editor.png` });
  await drawer.getByRole('button', { name: 'Add rule' }).click();
  const added = page.getByText(/Rule #\d+ added/);
  await expect(added).toBeVisible({ timeout: 15_000 });
  const id = Number(/#(\d+)/.exec(await added.innerText())![1]);
  await expect(page.getByText('In force').first()).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/d-exclusions.png`, fullPage: true });

  await page.getByRole('button', { name: /Overview/ }).click();
  await expect(page.getByTestId('exclusion-banner')).toContainText(/\d+ exclusion rules? in force remove/);
  await page.getByTestId('exclusion-banner').getByRole('button', { name: 'Which rules?' }).click();
  await expect(page.getByTestId('exclusion-banner')).toContainText(`#${id}`);
  await expect.poll(async () => crore(await page.getByText(/^₹ [\d.,]+ Cr$/).first().innerText()), { timeout: 30_000 }).toBeLessThan(before - 1);
  await page.getByRole('button', { name: 'Show without' }).click();
  await expect(page.getByText('without').first()).toBeVisible();
  await expect.poll(async () => crore(await page.getByText(/^₹ [\d.,]+ Cr$/).first().innerText()), { timeout: 30_000 }).toBe(before);
  await page.getByRole('button', { name: 'Apply exclusions' }).click();
  await expect(page.getByTestId('exclusion-banner')).toBeVisible({ timeout: 30_000 });

  // Clean up: delete the rule again.
  await page.getByTestId('exclusion-banner').getByRole('button', { name: 'Manage' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: `Delete rule ${id}`, exact: true }).click();
  await expect(page.getByText(`Rule #${id} deleted`)).toBeVisible({ timeout: 15_000 });
});

test('budget upload: template -> fill -> check -> save as a version -> report uses it', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-360', 'desktop flow');
  await signIn(page);
  await page.goto(`${BASE}?v=settings&fy=2026&p=7`);
  await page.getByRole('tab', { name: /Budget upload/ }).click();
  await expect(page.getByText('Upload a budget')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('tab', { name: /RB · revised/ }).click();
  // Capture the workbook the Template button builds, in the page: a real browser download leaves Playwright + system
  // Edge with a TargetClosedError at teardown (2026-11-23), although the file itself is fine.
  await page.evaluate(() => {
    const w = window as unknown as { __file?: { name: string; b64: string } };
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      if (!this.download || !this.href.startsWith('blob:')) return;
      const name = this.download;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => {
        let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
        w.__file = { name, b64: btoa(s) };
      });
    };
  });
  await page.getByRole('button', { name: /Template \(RB/ }).click();
  await page.waitForFunction(() => !!(window as unknown as { __file?: unknown }).__file, null, { timeout: 30_000 });
  const file = await page.evaluate(() => (window as unknown as { __file: { name: string; b64: string } }).__file);
  expect(file.name).toMatch(/-RB-lakh\.xlsx$/);
  const dir = test.info().outputPath();
  fs.mkdirSync(dir, { recursive: true });

  // Fill 30 lines: annual 12 lakh each, the first one phased by month.
  const wb = XLSX.read(Buffer.from(file.b64, 'base64'), { type: 'buffer' });
  expect(wb.SheetNames).toEqual(['Budget', 'Read me']);
  const ws = wb.Sheets.Budget;
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });
  const head = rows[0] as string[];
  const ai = head.indexOf('Annual'); const apr = head.indexOf('Apr');
  for (let i = 1; i <= 30; i++) rows[i][ai] = 12;
  for (let m = 0; m < 12; m++) rows[1][apr + m] = m === 6 ? 2 : 10 / 11;
  const out = path.join(dir, 'publicity-expenses-budget-FY27-RB-lakh-filled.xlsx');
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(rows), 'Budget');
  fs.writeFileSync(out, XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }));

  await page.getByLabel('Budget file').setInputFiles(out);
  const check = page.getByTestId('budget-check');
  await expect(check).toContainText('30 budget lines', { timeout: 30_000 });
  await expect(check).toContainText('ready to save');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/d-budget-check.png`, fullPage: true });
  await page.getByLabel('Version note').fill('E2E RB');
  await page.getByRole('button', { name: /Save as RB version/ }).click();
  await expect(page.getByText(/RB FY'27 version \d+ saved and active/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Budget: mock')).toHaveCount(0);

  await page.getByRole('button', { name: /Budget vs actual/ }).click();
  await expect(page.getByText('mock figures')).toHaveCount(0);
  await expect(page.getByText(/Utilisation/).first()).toBeVisible();
});

test('mapping: a header group can change spend class', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-360', 'desktop flow');
  await signIn(page);
  await page.goto(`${BASE}?v=settings&fy=2026&p=7`);
  await page.getByRole('tab', { name: /Mappings/ }).click();
  await expect(page.getByText('Report-header groups')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('radiogroup', { name: 'Creative spend class' }).getByRole('radio', { name: 'BTL' }).click();
  await expect(page.getByText('Unsaved changes').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save mapping' }).first().click();
  await expect(page.getByText('Mapping saved')).toBeVisible({ timeout: 15_000 });
  // Put it back.
  await page.getByRole('radiogroup', { name: 'Creative spend class' }).getByRole('radio', { name: 'ATL' }).click();
  await page.getByRole('button', { name: 'Save mapping' }).first().click();
  await expect(page.getByText('Mapping saved')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: /Audit log/ }).click();
  await expect(page.getByText('Mapping saved').first()).toBeVisible({ timeout: 15_000 });
});
