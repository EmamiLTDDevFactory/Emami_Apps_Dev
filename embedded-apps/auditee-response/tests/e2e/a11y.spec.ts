import { test } from './fixtures';
import { expectNoSeriousViolations } from './axe';

// axe-core on every screen and state, light and dark; fails on serious or critical violations.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`@a11y ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('my observations (both tabs, empty filter result)', async ({ page }) => {
      await page.goto('');
      await page.locator('.wpitem').first().waitFor();
      await expectNoSeriousViolations(page, `${scheme} list`);
      await page.getByLabel('Search').fill('nothing like this');
      await page.getByText('No workpapers match the filters.').waitFor();
      await expectNoSeriousViolations(page, `${scheme} list empty`);
      await page.goto('?track=mis');
      await page.locator('.wpitem').first().waitFor();
      await expectNoSeriousViolations(page, `${scheme} MIS list`);
    });

    test('workpaper detail: editable, confirm dialog, submitted, read only', async ({ page }) => {
      await page.goto('workpaper/?track=audit&guid=DEMO-WP-1002');
      await page.locator('article.obs').first().waitFor();
      await page.getByText('No files are attached to this workpaper yet.').waitFor();
      await expectNoSeriousViolations(page, `${scheme} detail submitted, waiting`);
      await page.getByRole('button', { name: 'Submit again' }).click();
      await page.getByRole('dialog').waitFor();
      await expectNoSeriousViolations(page, `${scheme} confirm dialog`);
      await page.goto('workpaper/?track=audit&guid=DEMO-WP-1001');
      await page.locator('textarea').first().waitFor();
      await expectNoSeriousViolations(page, `${scheme} detail editable`);
      await page.goto('workpaper/?track=audit&guid=DEMO-WP-0512');
      await page.getByText('This workpaper is closed. It is read only.').waitFor();
      await expectNoSeriousViolations(page, `${scheme} detail closed`);
    });
  });
}
