import { test, expect } from './fixtures';

for (const track of ['audit', 'mis'] as const) {
  test(`count cards filter the list (${track})`, async ({ page }) => {
    await page.goto(`?track=${track}`);
    const cards = page.locator('button.stat');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toBeEnabled();
    const items = page.locator('li.wpitem');
    const total = await items.count();
    for (let i = 0; i < 3; i++) {
      const n = Number(await cards.nth(i).locator('b').innerText());
      await cards.nth(i).click();
      await expect(cards.nth(i)).toHaveAttribute('aria-pressed', 'true');
      if (n > 0) await expect(items).toHaveCount(n); else await expect(page.getByText('No workpapers match the filters.')).toBeVisible();
      await cards.nth(i).click();
      await expect(cards.nth(i)).toHaveAttribute('aria-pressed', 'false');
      await expect(items).toHaveCount(total);
    }
  });
}
