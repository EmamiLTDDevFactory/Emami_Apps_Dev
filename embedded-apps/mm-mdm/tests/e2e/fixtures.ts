import { test as base, expect } from '@playwright/test';

/** Same as Playwright's test, but pictures, fonts and media are not downloaded (nothing in the tests looks at them). */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', (route) => (['image', 'font', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue()));
    await use(page);
  },
});
export { expect };
