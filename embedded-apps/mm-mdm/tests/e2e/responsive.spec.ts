import { expect, test } from './fixtures';

// Tablet width (768 x 1024): the page itself never scrolls sideways; wide content (grids, tabs) scrolls inside its own box.
test.use({ viewport: { width: 768, height: 1024 } });

const noPageScroll = async (page: import('@playwright/test').Page, where: string) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `${where}: page scrolls sideways by ${over}px`).toBeLessThanOrEqual(0);
};

test.describe('tablet width', () => {
  test('home', async ({ page }) => {
    await page.goto('');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await noPageScroll(page, 'home');
  });

  test('requests list', async ({ page }) => {
    await page.goto('requests/');
    await page.getByRole('link', { name: '1000000001' }).waitFor();
    await noPageScroll(page, 'requests');
  });

  test('new request', async ({ page }) => {
    await page.goto('requests/new/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await noPageScroll(page, 'new request');
  });

  test('request view, its tabs, and a grid tab', async ({ page }) => {
    await page.goto('requests/view/?id=1000000001');
    await page.getByRole('tablist').waitFor();
    await noPageScroll(page, 'request view');
    for (const tab of await page.getByRole('tab').all()) {
      await tab.click();
      await noPageScroll(page, `request tab ${await tab.innerText()}`);
    }
    // the sticky action bar stays inside the viewport width and on screen after scrolling
    await page.evaluate(() => window.scrollTo(0, 600));
    const box = await page.locator('.actionbar').boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 768 + 1).toBeTruthy();
  });

  test('tabs are keyboard reachable when they scroll', async ({ page }) => {
    await page.goto('requests/view/?id=1000000001');
    const first = page.getByRole('tab').first();
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab').nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab').last()).toBeFocused();
    await expect(page.getByRole('tab').last()).toBeInViewport();
  });
});
