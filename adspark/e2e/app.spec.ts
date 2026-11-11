import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function createCampaign(page: Page) {
  await page.goto('/app/new');
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Generate concepts' }).click();
  await expect(page).toHaveURL(/\/concepts$/);
  await expect(page.getByRole('article')).toHaveCount(5);
}

test('landing page renders and links into the app', async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Powerful Ad Campaign');
  await page.getByRole('link', { name: 'Create Campaign' }).first().click();
  await expect(page).toHaveURL(/\/app\/new$/);
  expect(errors).toEqual([]);
});

test('form validation shows errors for required fields', async ({ page }) => {
  await page.goto('/app/new');
  await page.getByRole('button', { name: 'Clear form' }).click();
  await page.getByRole('button', { name: 'Generate concepts' }).click();
  await expect(page.getByText('Product or business name is required')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a category' })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/new$/);
});

test('full workflow: concepts → campaign → storyboard → voiceover → social → exports', async ({ page }) => {
  const errors = trackConsole(page);
  await createCampaign(page);

  // Save a concept, regenerate unsaved, saved one stays
  const firstTitle = await page.getByRole('article').first().getByRole('heading').textContent();
  await page.getByRole('button', { name: 'Save concept' }).first().click();
  await page.getByRole('button', { name: 'Regenerate unsaved' }).click();
  await expect(page.getByRole('article').first().getByRole('heading')).toHaveText(firstTitle!);

  // View concept
  await page.getByRole('button', { name: 'View' }).nth(1).click();
  await expect(page.getByRole('dialog')).toContainText('Emotional trigger');
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Create Full Campaign' }).first().click();
  await expect(page).toHaveURL(/\/app\/campaigns\/cmp_[^/]+$/);
  await expect(page.getByText('6 scenes · 30s of 30s')).toBeVisible();

  // Storyboard: duplicate a scene → timing mismatch → fit
  await page.getByRole('link', { name: 'Storyboard', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate scene 1' }).click();
  await expect(page.getByText(/7 scenes · \d+s of 30s/)).toBeVisible();
  await page.getByRole('button', { name: 'Fit to 30s' }).click();
  await expect(page.getByText('7 scenes · 30s of 30s')).toBeVisible();
  await page.getByRole('button', { name: 'Move scene 2 down' }).click();
  await page.getByRole('button', { name: 'Delete scene 7' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete scene', exact: true }).click();
  await expect(page.getByText(/6 scenes/)).toBeVisible();
  await page.getByRole('tab', { name: 'Sketch' }).click();
  await page.getByRole('button', { name: 'Preview storyboard' }).click();
  await expect(page.getByRole('dialog')).toContainText('not rendered video');
  await page.getByRole('button', { name: 'Close' }).click();

  // Voiceover
  await page.getByRole('link', { name: 'Voiceover', exact: true }).click();
  await expect(page.getByLabel('Voiceover script')).toHaveValue(/\[0:00–/);
  await page.getByLabel('Language').selectOption('Azerbaijani');
  await expect(page.getByLabel('Voiceover script')).toHaveValue(/[əğış]/);

  // Social
  await page.getByRole('link', { name: 'Social', exact: true }).click();
  await expect(page.getByLabel('Instagram caption')).toHaveValue(/Bloom Bakery|Order today/);

  // Exports
  for (const [label, ext] of [['TXT', '.txt'], ['JSON', '.json'], ['PDF', '.pdf']] as const) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label, exact: true }).click()]);
    expect(download.suggestedFilename()).toContain(ext);
    const path = await download.path();
    const content = readFileSync(path!);
    expect(content.length).toBeGreaterThan(200);
    if (ext === '.pdf') expect(content.subarray(0, 5).toString()).toBe('%PDF-');
    if (ext === '.json') expect(JSON.parse(content.toString()).kind).toBe('campaign');
  }

  // Print view
  await page.getByRole('link', { name: 'Print view' }).click();
  await expect(page.getByText('AdSpark campaign report')).toBeVisible();

  // Persistence after reload
  await page.reload();
  await expect(page.getByText('AdSpark campaign report')).toBeVisible();
  expect(errors).toEqual([]);
});

test('my campaigns: rename, duplicate, delete', async ({ page }) => {
  await createCampaign(page);
  await page.goto('/app/campaigns');
  const first = (await page.locator('main a p.font-medium').first().textContent())!.trim();
  await page.getByRole('button', { name: `Rename ${first}` }).click();
  await page.getByLabel('Campaign name').fill('Renamed campaign');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Renamed campaign', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate Renamed campaign' }).click();
  await expect(page.locator('main a p', { hasText: 'Renamed campaign (copy)' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Renamed campaign (copy)' }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('main a p', { hasText: 'Renamed campaign (copy)' })).toHaveCount(0);
});

test('brand kit saves and prefills a campaign', async ({ page }) => {
  await page.goto('/app/brand');
  await page.getByRole('button', { name: 'New brand profile' }).click();
  await page.getByLabel('Brand name').fill('Nar Studio');
  await page.getByLabel('Website').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save brand' }).click();
  await expect(page.getByText('Website must start with http:// or https://')).toBeVisible();
  await page.getByLabel('Website').fill('https://example.com');
  await page.getByLabel('Business description').fill('Handmade ceramics studio in the old city.');
  await page.getByRole('button', { name: 'Save brand' }).click();
  await expect(page.getByText('Brand “Nar Studio” saved.')).toBeVisible();

  await page.goto('/app/new');
  await page.getByRole('button', { name: 'Clear form' }).click();
  await page.getByLabel('Use a Brand Kit profile').selectOption({ label: 'Nar Studio' });
  await expect(page.getByLabel('Product or business name')).toHaveValue('Nar Studio');
});

test('settings: backup download and AI disabled without server', async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto('/app/settings');
  await expect(page.getByText(/AI provider not available/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^adspark-backup-/);
  expect(errors).toEqual([]);
});

test('mobile layout has working navigation @mobile', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Brand Kit' }).click();
  await expect(page.getByRole('heading', { name: 'Your brand profiles' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
