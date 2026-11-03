import { expect, test } from './fixtures';
import { openRequest, startRequest, statusChip, switchUser, userSelect } from './helpers';

test.describe('request workflow in demo mode', () => {
  test('create, validate with errors, fix, submit, review, approve, send back, resubmit, reject', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); }); // blocked downloads (pictures, web fonts) are not the app's errors
    page.on('pageerror', (e) => errors.push(e.message));

    // create: key data page, one tab (Basic data 1) so there are required fields to fix
    await page.goto('');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo initiator');
    const id = await startRequest(page, { description: 'E2E LOTION 100 ML', views: ['Basic data 1'] });
    await expect(statusChip(page)).toHaveText('Requested');

    // validate with errors: all messages together, grouped by tab, a red dot on the tab, each message goes to its field
    await page.getByRole('button', { name: 'Validate' }).click();
    const panel = page.getByRole('alert', { name: 'Messages' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 3 })).toContainText('Basic data 1');
    await expect(page.getByRole('tab', { name: /Basic data 1/ })).toContainText('errors');
    const first = panel.getByRole('button').first();
    await first.click();
    await expect(page.locator('[data-field] input:focus, [data-field] select:focus, [data-field] textarea:focus')).toHaveCount(1);

    // fix every message (the demo rules name the required fields), validate again
    const targets = await panel.getByRole('button').allInnerTexts();
    expect(targets.length).toBeGreaterThan(0);
    for (const field of ['Material.PRDHA', 'Material.MAKTX']) {
      const box = page.locator(`[data-field="${field}"]`);
      if (await box.count()) await box.locator('input, textarea').first().fill('X1');
    }
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByText('No errors found.')).toBeVisible();

    // submit: in progress at level 1; the initiator has no approve button (buttons follow SAP's allowed actions)
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(statusChip(page)).toHaveText('In progress');
    await expect(page.locator('.actionbar').getByText(/level L1/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

    // review: reviewer (level 1) approves with a comment, the request moves to level 2
    await switchUser(page, 'reviewer');
    await openRequest(page, id);
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('dialog').getByLabel('Comment').fill('Looks fine');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('.actionbar').getByText(/level L2/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0); // not the reviewer's level any more

    // approver sends it back
    await switchUser(page, 'approver');
    await openRequest(page, id);
    await page.getByRole('button', { name: 'Send back' }).click();
    await page.getByRole('dialog').getByLabel('Comment').fill('Please check the group');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(statusChip(page)).toHaveText('Sent back');

    // initiator resubmits
    await switchUser(page, 'initiator');
    await openRequest(page, id);
    await expect(page.getByText('Please check the group')).toBeVisible();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(statusChip(page)).toHaveText('In progress');

    // review again, then the approver rejects
    await switchUser(page, 'reviewer');
    await openRequest(page, id);
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('.actionbar').getByText(/level L2/)).toBeVisible();
    await switchUser(page, 'approver');
    await openRequest(page, id);
    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('dialog').getByLabel('Comment').fill('Not needed');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(statusChip(page)).toHaveText('Rejected');
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);

    expect(errors, 'no console errors').toEqual([]);
  });

  test('approve at the last level completes the request and gives a material number', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    const id = await startRequest(page, { description: 'E2E SHAMPOO', views: ['General plant data 1'] });
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(statusChip(page)).toHaveText('In progress');
    await switchUser(page, 'reviewer');
    await openRequest(page, id);
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await switchUser(page, 'approver');
    await openRequest(page, id);
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(statusChip(page)).toHaveText('Completed');
    await expect(page.getByText(/material FG\d+/)).toBeVisible();
  });

  test('delete a draft', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    const id = await startRequest(page, { description: 'E2E DRAFT', views: ['Basic data 1'], draft: true });
    await expect(statusChip(page)).toHaveText('Saved as draft');
    await page.getByRole('button', { name: 'Delete draft' }).click();
    await page.waitForURL(/requests\/?$/);
    await expect(page.getByRole('link', { name: id })).toHaveCount(0);
    await page.goto(`requests/view/?id=${id}`);
    await expect(page.getByText(/not found/i)).toBeVisible();
  });

  test('role switch changes who the user is and what they may do', async ({ page }) => {
    await page.goto('');
    await expect(userSelect(page)).toHaveValue('initiator');
    await switchUser(page, 'reviewer');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo reviewer');
    await page.goto('requests/new/');
    await page.locator('#mtart').fill('FERT');
    await page.locator('#mbrsh').fill('F');
    await page.locator('#desc').fill('REVIEWER MAY NOT');
    await page.getByRole('button', { name: 'Start request' }).click();
    await expect(page.getByText('Only an initiator can start a request')).toBeVisible();
    await page.goto('');
    await switchUser(page, 'approver');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo approver');
  });

  test('attachments and comments follow the allowed flags', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    const id = await startRequest(page, { description: 'E2E ATTACH', views: ['Basic data 1'], draft: true });
    await expect(page.getByText('No attachments yet.')).toBeVisible();
    await page.getByLabel('Add attachment').setInputFiles({ name: 'spec.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 demo') });
    await expect(page.getByRole('button', { name: 'Download spec.pdf' })).toBeVisible();
    await page.getByLabel('Add attachment').setInputFiles({ name: 'run.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
    await expect(page.getByRole('alert').filter({ hasText: 'not allowed' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download spec.pdf' }).click();
    expect((await download).suggestedFilename()).toBe('spec.pdf');
    await page.getByLabel('Add comment').fill('First comment');
    await page.getByRole('button', { name: 'Add comment' }).click();
    await expect(page.getByText('First comment')).toBeVisible();
    await page.getByRole('button', { name: 'Delete spec.pdf' }).click();
    await expect(page.getByText('No attachments yet.')).toBeVisible();
    // a reviewer who cannot attach sees the lists but no upload and no comment form
    await page.getByRole('button', { name: 'Submit' }).click().catch(() => undefined);
    await switchUser(page, 'reviewer');
    await openRequest(page, id);
    await expect(page.getByLabel('Add attachment')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add comment' })).toHaveCount(0);
    await expect(page.getByText('First comment')).toBeVisible();
  });
});
