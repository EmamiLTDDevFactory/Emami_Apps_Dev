import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export const userSelect = (page: Page) => page.getByLabel('Demo user');

export async function switchUser(page: Page, user: 'initiator' | 'reviewer' | 'approver'): Promise<void> {
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), userSelect(page).selectOption(user)]);
  await expect(userSelect(page)).toHaveValue(user);
}

export const transIdOf = (page: Page): string => new URL(page.url()).searchParams.get('id') ?? '';

/** Starts a request on the key data page. views = visible titles of the tabs to fill in (all others are cleared). */
export async function startRequest(page: Page, opts: { description: string; views: string[]; draft?: boolean }): Promise<string> {
  await page.goto('requests/new/');
  await page.locator('#mtart').fill('FERT');
  await page.locator('#mbrsh').fill('F');
  await page.locator('#desc').fill(opts.description);
  await page.getByRole('button', { name: 'Select none' }).click();
  for (const v of opts.views) await page.getByLabel(v, { exact: true }).check();
  await page.getByRole('button', { name: opts.draft ? 'Save as draft' : 'Start request' }).click();
  await page.waitForURL(/requests\/view\/?\?id=\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Request');
  return transIdOf(page);
}

export async function openRequest(page: Page, id: string): Promise<void> {
  await page.goto(`requests/view/?id=${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(id);
}

export const statusChip = (page: Page) => page.locator('h1 .chip');
