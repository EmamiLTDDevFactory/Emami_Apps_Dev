import { expect, test, type Page } from '@playwright/test';

const BASE = '/apps/publicity-expenses/';
const SHOTS = process.env.E2E_SHOTS || '';

async function signIn(page: Page) {
  const token = process.env.E2E_TOKEN || '';
  expect(token, 'E2E_TOKEN (printed by e2e/mock-server.js)').not.toBe('');
  await page.goto(`${BASE}?fy=2026&p=7`);
  await page.evaluate((t) => { localStorage.setItem('emami_apps_session_token', t); localStorage.setItem('emami_apps_user_email', 'e2e.user@emamigroup.com'); }, token);
}

async function open(page: Page, view: string, isMobile: boolean, name: string) {
  await page.goto(`${BASE}?v=${view}&fy=2026&p=7`);
  await expect(page.getByText('Mock data').first()).toBeVisible({ timeout: 60_000 });
  if (SHOTS && name.endsWith('-start')) await page.screenshot({ path: `${SHOTS}/${isMobile ? 'm' : 'd'}-${name}.png`, fullPage: !isMobile });
}

test('without a hub session the app asks to sign in', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByText('Please sign in to Emami Apps first')).toBeVisible();
});

test('every screen loads without errors and the page never scrolls sideways', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await signIn(page);
  const mobile = info.project.name === 'mobile-360';
  for (const [view, text] of [['overview', 'Total A&P spend'], ['report', 'Details of advertisement expenses'], ['brands', 'Spend concentration'], ['media', 'ATL media mix'], ['budget', 'mock figures'], ['costcentres', 'Report = G/L check']] as const) {
    await open(page, view, mobile, view);
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600); // charts settle (bar widths animate)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${mobile ? 'm' : 'd'}-${view}.png`, fullPage: !mobile });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${view} scrolls sideways`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('MIS report: G/L columns open, a figure drills down and the drill-down adds up to it', async ({ page }, info) => {
  // Measured in the page: all G/L columns ~2 s, drawer ~0.5 s. Playwright's own checks on the ~40k-cell DOM are what is slow.
  test.setTimeout(240_000);
  await signIn(page);
  await open(page, 'report', info.project.name === 'mobile-360', 'report-start');
  if (info.project.name === 'mobile-360') {
    // Phones open on the compact layout at range level: switch to the MIS layout with every row.
    await page.getByRole('tab', { name: 'MIS layout' }).click();
    await page.getByRole('tab', { name: 'All rows' }).click();
  }
  const grid = page.getByTestId('mis-grid');
  const before = await grid.locator('thead tr').nth(1).locator('th').count();
  // CSS / test-id locators only here: with every G/L column open the grid has ~40k cells and role queries crawl.
  const toggle = page.getByTestId('gl-toggle');
  // dispatchEvent: Playwright's actionability checks on a 40k-cell page take ~30 s; in the page the toggle paints in ~2 s.
  await toggle.dispatchEvent('click');
  await expect(toggle).toHaveText(/Hide G\/L columns/, { timeout: 30_000 });
  const after = await grid.locator('thead tr').nth(1).locator('th').count();
  expect(after).toBeGreaterThan(before + 40);
  await toggle.dispatchEvent('click');
  await expect(toggle).toHaveText(/All G\/L columns/, { timeout: 30_000 });
  // First reporting-row figure that can be drilled (a button inside a body cell).
  const fig = grid.locator('tbody button[data-drill]').first();
  const shown = (await fig.innerText()).trim();
  await fig.evaluate((el) => { el.scrollIntoView({ block: 'center', inline: 'center' }); (el as HTMLElement).click(); });
  const drawer = page.locator('[role=dialog]');
  await expect(drawer.getByText('Drill-down')).toBeVisible();
  const totalRow = drawer.locator('tbody tr').last();
  await expect(totalRow).toContainText('Total');
  await expect(totalRow.locator('td').nth(1)).toHaveText(shown);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name === 'mobile-360' ? 'm' : 'd'}-drilldown.png` });
});

test('Overview total equals the GR Total LR of the report', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-360', 'same data as desktop');
  await signIn(page);
  await page.goto(`${BASE}?v=report&fy=2026&p=7&u=crore`);
  const grid = page.getByTestId('mis-grid');
  await expect(grid).toBeVisible({ timeout: 60_000 });
  await page.getByRole('tab', { name: 'Compact' }).click();
  const grand = grid.locator('tbody tr').last();
  const head = await grid.locator('thead tr').nth(1).locator('th').allInnerTexts();
  const lrCy = head.length - 5; // GR Total LR: CY, PY, Growth, RB, Utilised
  expect(head[lrCy]).toMatch(/^CY Total/);
  const lrText = (await grand.locator('td').nth(lrCy + 1).innerText()).replace(/,/g, '');
  await page.getByRole('button', { name: /Overview/ }).click();
  const kpi = page.getByText(/^₹ [\d.,]+ Cr$/).first();
  await expect(kpi).toBeVisible();
  const ov = Number((await kpi.innerText()).replace(/[^\d.]/g, ''));
  expect(Math.abs(ov - Number(lrText))).toBeLessThan(0.1);
});
