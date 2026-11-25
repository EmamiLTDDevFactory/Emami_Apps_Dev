import { expect, test, type Page } from '@playwright/test';

// Multi-select of periods and companies, and the drill-down of sub-totals with an amount per selected period.
const BASE = '/apps/publicity-expenses/';
const SHOTS = process.env.E2E_SHOTS || '';

async function signIn(page: Page) {
  const token = process.env.E2E_TOKEN || '';
  expect(token, 'E2E_TOKEN (printed by e2e/mock-server.js)').not.toBe('');
  await page.goto(BASE);
  await page.evaluate((t) => { localStorage.setItem('emami_apps_session_token', t); localStorage.setItem('emami_apps_user_email', 'e2e.user@emamigroup.com'); }, token);
}
const kpiTotal = async (page: Page) => {
  const card = page.getByText(/^Total A&P spend/).first().locator('xpath=..');
  return (await card.locator('.num').first().innerText()).trim();
};

test('opens on company 1000 and the current period only; YTD, quarters and companies are one click away', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await page.goto(BASE);
  await expect(page.getByText('Total A&P spend').first()).toBeVisible({ timeout: 60_000 });
  // Defaults written to the URL: one period, company 1000.
  await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toMatch(/^\d{1,2}$/);
  expect(new URL(page.url()).searchParams.get('cc')).toBe('1000');
  await expect(page.getByTestId('selection-line')).toContainText('company 1000');
  const single = await kpiTotal(page);

  // One click to the YTD of the current period.
  await page.getByRole('button', { name: /^Show YTD-/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toMatch(/^1-\d{1,2}$|^1$/);
  await expect(page.getByTestId('period-picker')).toContainText('YTD-');
  await expect.poll(() => kpiTotal(page)).not.toBe(single);

  // Tick P04..P06 = Q2.
  await page.getByTestId('period-picker').click();
  const dialog = page.getByRole('dialog', { name: 'Pick periods' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  expect(box && box.x >= 0 && box.x + box.width <= vw + 1, 'the period panel fits the screen').toBeTruthy();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name === 'mobile-360' ? 'm' : 'd'}-period-picker.png` });
  await dialog.getByRole('button', { name: 'None' }).click();
  for (const p of ['P04', 'P05', 'P06']) await dialog.getByRole('button', { name: new RegExp(`^${p}`) }).click();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('period-picker')).toContainText('Q2 FY');
  expect(new URL(page.url()).searchParams.get('pp')).toBe('4-6');
  await expect(page.getByTestId('selection-line')).toContainText(/Q2 FY'\d\d vs Q2 FY'\d\d/);
  const q2 = await kpiTotal(page);

  // Add company EM01 (phones: open the filters first).
  if (info.project.name === 'mobile-360') await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('button', { name: /^Company/ }).click();
  await page.getByRole('option', { name: 'EM01' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => new URL(page.url()).searchParams.get('cc')).toBe('1000|EM01');
  await expect(page.getByTestId('selection-line')).toContainText('company 1000, EM01');
  await expect.poll(() => kpiTotal(page)).not.toBe(q2);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name === 'mobile-360' ? 'm' : 'd'}-selection.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('a sub-total drills down to posting lines with one column per selected period that add up to it', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.goto(`${BASE}?v=report&fy=2026&pp=4-6,8&cc=1000|EM01`);
  const grid = page.getByTestId('mis-grid');
  await expect(grid).toBeVisible({ timeout: 60_000 });
  // Brands level: every line is a sub-total (a brand over its report rows).
  if (info.project.name === 'mobile-360') await page.getByRole('tab', { name: 'MIS layout' }).click();
  await page.getByRole('tab', { name: 'Brands' }).click();
  const fig = grid.locator('tbody button[data-drill="total"]').first();
  await expect(fig).toBeVisible();
  const shown = (await fig.innerText()).trim();
  await fig.evaluate((el) => { el.scrollIntoView({ block: 'center', inline: 'center' }); (el as HTMLElement).click(); });
  const drawer = page.locator('[role=dialog]');
  await expect(drawer.getByTestId('drill-check')).toBeVisible({ timeout: 60_000 });
  await expect(drawer.getByTestId('drill-total-cy')).toHaveText(shown);
  const head = drawer.getByTestId('drill-table').locator('thead');
  for (const p of ['P04', 'P05', 'P06', 'P08']) await expect(head).toContainText(p);
  await expect(head).toContainText('Co. code');
  await expect(drawer.getByTestId('drill-basis')).toContainText('YTD P06 - YTD P03 + P08');
  // Grouped by G/L: same total.
  await drawer.getByRole('tab', { name: 'By G/L' }).click();
  await expect(drawer.getByTestId('drill-total-cy')).toHaveText(shown);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name === 'mobile-360' ? 'm' : 'd'}-drill-subtotal.png` });
  await page.keyboard.press('Escape');

  // A G/L column figure on a sub-total (the "507933 for OIL under the NR range" case): open the ATL G/L columns.
  if (info.project.name === 'mobile-360') return; // G/L columns: same code path as desktop
  const atl = grid.locator('thead button[aria-expanded]').first();
  await atl.dispatchEvent('click');
  await expect(atl).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
  const glCell = grid.locator('td[data-col="gl"] button[data-drill="total"]').first();
  const v = (await glCell.innerText()).trim();
  await glCell.evaluate((el) => { el.scrollIntoView({ block: 'center', inline: 'center' }); (el as HTMLElement).click(); });
  await expect(drawer.getByTestId('drill-check')).toBeVisible({ timeout: 60_000 });
  await expect(drawer.getByTestId('drill-total-cy')).toHaveText(v);
  await expect(drawer.getByText(/^G\/L \d+$/).first()).toBeVisible();
});
