import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

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
  await expect(page.getByText(view === 'settings' ? 'Exclusion rules' : 'Mock data').first()).toBeVisible({ timeout: 60_000 });
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
  for (const [view, text] of [['overview', 'Total A&P spend'], ['report', 'MIS layout'], ['brands', 'Spend concentration'], ['media', 'ATL media mix'], ['budget', 'Over-running brands'], ['costcentres', 'G/L = report + excluded'], ['settings', 'Exclusion rules']] as const) {
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
  // Every G/L column at once (~40k cells) paints in ~2 s in the page, but Playwright's own checks on that DOM take minutes
  // on a busy PC, so the test opens the G/L columns of one header group (same code path) and "All" only on desktop.
  test.setTimeout(240_000);
  await signIn(page);
  await open(page, 'report', info.project.name === 'mobile-360', 'report-start');
  if (info.project.name === 'mobile-360') {
    // Phones open on the compact layout at range level: switch to the MIS layout with every row.
    await page.getByRole('tab', { name: 'MIS layout' }).click();
    await page.getByRole('tab', { name: 'All rows' }).click();
  }
  const grid = page.getByTestId('mis-grid');
  const cols = () => grid.locator('thead tr').nth(1).locator('th').count();
  const before = await cols();
  // One group (the first heading with G/L columns, ATL): its G/L x site columns appear and go again.
  const group = grid.locator('thead button[aria-expanded]').first();
  await group.dispatchEvent('click');
  await expect(group).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
  expect(await cols()).toBeGreaterThan(before + 5);
  // A G/L column figure (one G/L x site of a row) drills down to the posting lines of that G/L, adding up to it.
  const glFig = grid.locator('tbody td[data-col="gl"] button[data-drill="row"]').first();
  const glShown = (await glFig.innerText()).trim();
  await glFig.evaluate((el) => { el.scrollIntoView({ block: 'center', inline: 'center' }); (el as HTMLElement).click(); });
  const glDrawer = page.locator('[role=dialog]');
  await expect(glDrawer.getByTestId('drill-total-cy')).toHaveText(glShown, { timeout: 30_000 });
  await expect(glDrawer.getByText(/^G\/L \d+$/).first()).toBeVisible();
  await glDrawer.getByRole('button', { name: 'Close' }).click();
  await expect(glDrawer).toHaveCount(0);
  await group.dispatchEvent('click');
  await expect(group).toHaveAttribute('aria-expanded', 'false', { timeout: 30_000 });
  expect(await cols()).toBe(before);
  if (info.project.name !== 'mobile-360') {
    // CSS / test-id locators only: with every G/L column open role queries crawl. dispatchEvent skips actionability checks.
    const toggle = page.getByTestId('gl-toggle');
    await toggle.dispatchEvent('click');
    await expect(toggle).toHaveText(/Hide G\/L columns/, { timeout: 60_000 });
    expect(await cols()).toBeGreaterThan(before + 40);
    await toggle.dispatchEvent('click');
    await expect(toggle).toHaveText(/All G\/L columns/, { timeout: 60_000 });
  }
  // First reporting-row figure that can be drilled (a button inside a body cell).
  const fig = grid.locator('tbody button[data-drill]').first();
  const shown = (await fig.innerText()).trim();
  await fig.evaluate((el) => { el.scrollIntoView({ block: 'center', inline: 'center' }); (el as HTMLElement).click(); });
  const drawer = page.locator('[role=dialog]');
  await expect(drawer.getByText('Drill-down').first()).toBeVisible();
  await expect(drawer.getByTestId('drill-total-cy')).toHaveText(shown);
  await expect(drawer.getByTestId('drill-check')).toBeVisible();
  // SKUs come with the lines: the ZNET_SALE_MASTER columns at the end, and a line opens to its SKUs.
  await expect(drawer.getByTestId('drill-table').locator('thead')).toContainText('ZSKUGRCODECRS');
  const showSkus = drawer.getByRole('button', { name: 'Show SKUs' }).first();
  await expect(showSkus).toBeVisible();
  await showSkus.click();
  await expect(drawer.getByText(/SKUs? of SKU group/).first()).toBeVisible();
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
  const lrCy = head.length - 6; // GR Total LR: CY, PY, Variance, % Var, RB, Utilised
  expect(head[lrCy]).toMatch(/^CY Total/);
  expect(head[lrCy + 2]).toMatch(/^Variance/);
  expect(head[lrCy + 3]).toMatch(/^% Var/);
  const lrText = (await grand.locator('td').nth(lrCy + 1).innerText()).replace(/,/g, '');
  const pyText = (await grand.locator('td').nth(lrCy + 2).innerText()).replace(/,/g, '');
  const varText = (await grand.locator('td').nth(lrCy + 3).innerText()).replace(/[,+]/g, '');
  expect(Math.abs(Number(lrText) - Number(pyText) - Number(varText))).toBeLessThan(0.05); // Variance = CY - PY
  // % Var: a RAG chip with a direction icon on every line with spend; the legend explains the colours and "New".
  await expect(page.getByTestId('rag-legend')).toContainText('no spend in PY (= +100%)');
  await expect(grid.locator('td[data-col="trend"] [data-trend]').first()).toBeVisible();
  await page.getByRole('button', { name: /Overview/ }).click();
  const kpi = page.getByText(/^₹ [\d.,]+ Cr$/).first();
  await expect(kpi).toBeVisible();
  const ov = Number((await kpi.innerText()).replace(/[^\d.]/g, ''));
  expect(Math.abs(ov - Number(lrText))).toBeLessThan(0.1);
});

test('drill-down: header row stays on top while scrolling, arrow keys scroll, Excel holds only the filtered lines', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-360', 'same drawer as desktop');
  test.setTimeout(180_000);
  await signIn(page);
  await page.goto(`${BASE}?v=report&fy=2026&p=7`);
  const grid = page.getByTestId('mis-grid');
  await expect(grid).toBeVisible({ timeout: 60_000 });
  // The grand total: every posting line of the report, far more than fit on the screen.
  const fig = grid.locator('tbody tr').last().locator('button[data-drill]').first();
  await fig.evaluate((el) => { el.scrollIntoView({ block: 'center', inline: 'center' }); (el as HTMLElement).click(); });
  const drawer = page.locator('[role=dialog]');
  await expect(drawer.getByTestId('drill-total-cy')).toBeVisible({ timeout: 60_000 });
  const box = drawer.getByTestId('drill-scroll');
  await expect(box).toBeFocused();
  const m = () => box.evaluate((el) => {
    const th = el.querySelector('thead th')!.getBoundingClientRect(); const tot = el.querySelector('[data-testid=drill-total-row] td')!.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { top: el.scrollTop, more: el.scrollHeight - el.clientHeight, headGap: Math.abs(th.top - b.top), totalBelow: b.bottom - tot.bottom, inWindow: window.innerHeight - tot.bottom };
  });
  const m0 = await m();
  expect(m0.more).toBeGreaterThan(200);
  expect(m0.inWindow, 'total row on screen without scrolling the drawer').toBeGreaterThanOrEqual(0);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('PageDown');
  const m1 = await m();
  expect(m1.top, 'arrow keys / Page Down scroll the lines').toBeGreaterThan(100);
  expect(m1.headGap, 'header row frozen at the top').toBeLessThan(3);
  expect(m1.totalBelow, 'total row frozen at the bottom').toBeLessThan(3);
  await page.keyboard.press('ArrowUp');
  expect((await m()).top).toBeLessThan(m1.top);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/d-drill-scrolled.png` });
  // Search, then Excel: only the matching lines and their total.
  await drawer.getByLabel('Find in the drill-down').fill('507929'); // one G/L (TV in the mock)
  const note = await drawer.getByText(/ of \d+ lines match/).innerText();
  const [shown, all] = (note.match(/(\d+) of (\d+)/) ?? []).slice(1).map(Number);
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(all);
  await page.evaluate(() => {
    const w = window as unknown as { __file?: { name: string; b64: string } };
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      if (!this.download || !this.href.startsWith('blob:')) return;
      const name = this.download;
      fetch(this.href).then((r) => r.arrayBuffer()).then((buf) => {
        let t = ''; new Uint8Array(buf).forEach((b) => { t += String.fromCharCode(b); });
        w.__file = { name, b64: btoa(t) };
      });
    };
  });
  await drawer.getByRole('button', { name: 'Excel' }).click();
  await page.waitForFunction(() => !!(window as unknown as { __file?: unknown }).__file, null, { timeout: 30_000 });
  const file = await page.evaluate(() => (window as unknown as { __file: { name: string; b64: string } }).__file);
  expect(file.name).toMatch(/-filtered\.xlsx$/);
  const ws = XLSX.read(Buffer.from(file.b64, 'base64'), { type: 'buffer' }).Sheets['Drill-down'];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });
  const h = rows.findIndex((r) => r[0] === 'Company code');
  const t = rows.findIndex((r) => String(r[0] ?? '').startsWith('Total'));
  expect(t - h - 1, 'one Excel row per matching line').toBe(shown);
  expect(String(rows[t][0])).toContain(`${shown} matching lines`);
  expect(rows.slice(h + 1, t).every((r) => String(r[4]) === '507929'), 'only the lines found').toBe(true);
});
