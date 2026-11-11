import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Runs only when the offline edition has been built (npm run build:standalone).
const FILE = resolve('dist-standalone/index.html');
test.skip(!existsSync(FILE), 'standalone edition not built');

test('offline single-file edition works from file:// without a server', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => !r.url().startsWith('data:') && !r.url().startsWith('blob:') && requests.push(r.url()));

  await page.goto(`file://${FILE}`);
  await expect(page.getByRole('heading', { name: 'Welcome to AdSpark' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pricing' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open a sample campaign' }).click();
  await expect(page.getByText('6 scenes · 30s of 30s')).toBeVisible();
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');

  // Full new-campaign flow
  await page.getByRole('link', { name: 'New Campaign' }).first().click();
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Review brief' }).click();
  await page.getByRole('button', { name: 'Generate concepts' }).click();
  await expect(page.locator('main article')).toHaveCount(5);
  await page.getByRole('button', { name: 'Create Full Campaign' }).first().click();
  await page.getByRole('link', { name: 'Storyboard', exact: true }).click();
  await expect(page.locator('main ol > li[draggable="true"]')).toHaveCount(6);

  // Data persists across reloads from file://
  await page.reload();
  await page.getByRole('link', { name: 'My Campaigns' }).click();
  await expect(page.locator('main article')).toHaveCount(2);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('This is the offline edition')).toBeVisible();

  // Nothing is loaded from anywhere except the file itself.
  expect(requests.filter((u) => !u.startsWith('file://'))).toEqual([]);
  expect(errors).toEqual([]);
});
