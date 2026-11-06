import { expect, test } from './fixtures';

// Tablet width (768 x 1024): the page never scrolls sideways; the side pane is a drawer.
test.use({ viewport: { width: 768, height: 1024 } });
const noPageScroll = async (page: import('@playwright/test').Page, where: string) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `${where}: page scrolls sideways by ${over}px`).toBeLessThanOrEqual(0);
};

test('tablet: list, detail and the drawer menu', async ({ page }) => {
  await page.goto('');
  await page.locator('.wpitem').first().waitFor();
  await noPageScroll(page, 'list');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'MIS observations' }).click();
  await expect(page).toHaveURL(/track=mis/);
  await page.goto('workpaper/?track=audit&guid=DEMO-WP-1001');
  await page.locator('article.obs').first().waitFor();
  await noPageScroll(page, 'detail');
});
