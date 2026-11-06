import { test as base, expect } from '@playwright/test';

/**
 * Same as Playwright's test, with two additions:
 *  - pictures, fonts (and the font service stylesheet) and media are not downloaded (nothing in the tests looks at them);
 *  - every test fails on a console error or an uncaught page error (the app must run without console errors). The errors that
 *    the blocked downloads above cause ("Failed to load resource") are not the app's and are ignored.
 */
export const test = base.extend<{ consoleGuard: void }>({
  page: async ({ page }, use) => {
    await page.route('**/*', (route) => {
      const r = route.request();
      // pictures, fonts and media, and the web-font service of the hub look (the tests run with the system fonts)
      return ['image', 'font', 'media'].includes(r.resourceType()) || /fonts\.(googleapis|gstatic)\.com/.test(r.url()) ? route.abort() : route.continue();
    });
    await use(page);
  },
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(e.message));
      await use();
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
