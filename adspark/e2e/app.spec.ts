import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function fillExampleAndSubmit(page: Page) {
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Review brief' }).click();
  await page.getByRole('button', { name: 'Generate concepts' }).click();
}

async function createCampaign(page: Page) {
  await page.goto('/app/new');
  await fillExampleAndSubmit(page);
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

test('new campaign: step validation, inline errors and progress', async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto('/app/new');
  await expect(page.getByText('0% complete')).toBeVisible();
  // Cannot continue with an empty product step
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Product or business name is required')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a category' })).toBeVisible();
  await expect(page.getByLabel('Product or business name')).toBeFocused();
  await expect(page.getByLabel('Product price')).not.toHaveAttribute('aria-invalid', 'true');

  // Inline validation clears as the user types
  await page.getByLabel('Product or business name').fill('Nar Coffee');
  await expect(page.getByText('Product or business name is required')).toHaveCount(0);
  await page.getByLabel('Product description').fill('short');
  await page.getByLabel('Product description').blur();
  await expect(page.getByText('Describe the product in at least 20 characters')).toBeVisible();
  await page.getByLabel('Product description').fill('Specialty coffee roasted in small batches every week.');
  await expect(page.getByText('Describe the product in at least 20 characters')).toHaveCount(0);
  await page.getByLabel('Product category').selectOption('Restaurant');
  await page.getByLabel('Main benefits').fill('Roasted weekly, ethically sourced');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('33% complete')).toBeVisible();

  // Audience step, then back keeps values
  await page.getByLabel('Target audience').fill('remote workers');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Product or business name')).toHaveValue('Nar Coffee');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Customer problem is required')).toBeVisible();
  await page.getByLabel('Customer problem').fill('Bitter office coffee');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Format step: defaults are already valid, CTA is required
  await expect(page.getByLabel('Social media platform')).toHaveValue('Instagram Reels');
  await expect(page.getByLabel('Video duration')).toHaveValue('30');
  await page.getByRole('button', { name: 'Review brief' }).click();
  await expect(page.getByText('Call to action is required')).toBeVisible();
  await page.getByLabel('Video duration').selectOption('15');
  await page.getByLabel('Campaign language').selectOption('Turkish');
  await page.getByLabel('Call to action').fill('Hemen sipariş verin');
  await page.getByRole('button', { name: 'Review brief' }).click();

  // Review shows everything, optional price marked, edit jumps back
  await expect(page.getByText('100% complete')).toBeVisible();
  await expect(page.getByText('Not specified')).toBeVisible();
  await expect(page.getByText('15 seconds')).toBeVisible();
  await page.getByRole('button', { name: 'Edit audience' }).click();
  await expect(page.getByLabel('Target audience')).toHaveValue('remote workers');
  await page.getByRole('button', { name: /Review/ }).first().click();
  await page.getByRole('button', { name: 'Generate concepts' }).click();
  await expect(page).toHaveURL(/\/concepts$/);
  await expect(page.getByText('15s · Cinematic · Friendly · Turkish')).toBeVisible();
  expect(errors).toEqual([]);
});

test('new campaign: drafts persist across reloads and can be discarded', async ({ page }) => {
  await page.goto('/app/new');
  await page.getByLabel('Product or business name').fill('Draft Product');
  await page.getByLabel('Product price').fill('25 AZN');
  await expect(page.getByText('Draft saved')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your unfinished brief was restored')).toBeVisible();
  await expect(page.getByLabel('Product or business name')).toHaveValue('Draft Product');
  await expect(page.getByLabel('Product price')).toHaveValue('25 AZN');
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByLabel('Product or business name')).toHaveValue('');
  await page.reload();
  await expect(page.getByLabel('Product or business name')).toHaveValue('');
  await expect(page.getByText('Your unfinished brief was restored')).toHaveCount(0);
});

test('new campaign: draft is cleared after a successful submit', async ({ page }) => {
  await page.goto('/app/new');
  await fillExampleAndSubmit(page);
  await expect(page).toHaveURL(/\/concepts$/);
  await page.goto('/app/new');
  await expect(page.getByLabel('Product or business name')).toHaveValue('');
});

test('full workflow: concepts → campaign → storyboard → voiceover → social → exports', async ({ page }) => {
  const errors = trackConsole(page);
  await createCampaign(page);

  // Save a concept, regenerate unsaved, saved one stays
  const firstTitle = await page.getByRole('article').first().getByRole('heading').textContent();
  await page.getByRole('button', { name: 'Save concept' }).first().click();
  await page.getByRole('button', { name: 'Regenerate unsaved' }).click();
  await expect(page.getByRole('article').first().getByRole('heading')).toHaveText(firstTitle!);

  // Demo mode is labelled honestly
  await expect(page.getByText('Demo Generation · not AI')).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'No AI model was used' })).toBeVisible();

  // Edit a concept
  await page.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
  await page.getByRole('dialog').getByLabel('Campaign title').fill('Fresh Every Morning');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Fresh Every Morning' })).toBeVisible();

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
  const first = (await page.locator('main article h3 a').first().textContent())!.trim();
  await page.getByRole('button', { name: `Rename ${first}` }).click();
  await page.getByLabel('Campaign name').fill('Renamed campaign');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Renamed campaign', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate Renamed campaign' }).click();
  await expect(page.locator('main article h3', { hasText: 'Renamed campaign (copy)' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Renamed campaign (copy)' }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('main article h3', { hasText: 'Renamed campaign (copy)' })).toHaveCount(0);
  // List layout shows the same campaigns
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('main a p', { hasText: 'Renamed campaign' })).toHaveCount(1);
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
  // Regression: duplicate SVG gradient ids made the mobile logo render blank.
  const ids = await page.locator('svg [id]').evaluateAll((els) => els.map((e) => e.id));
  expect(new Set(ids).size).toBe(ids.length);
});

test('every navigation link reaches a real page', async ({ page }) => {
  const errors = trackConsole(page);
  const sidebar = [
    ['Overview', 'Welcome to AdSpark'],
    ['New Campaign', 'Campaign brief'],
    ['My Campaigns', 'Saved campaigns'],
    ['Storyboard Studio', 'Choose a storyboard'],
    ['Brand Kit', 'Your brand profiles'],
    ['Settings', 'Settings'],
  ] as const;
  await page.goto('/app');
  for (const [link, heading] of sidebar) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page');
  }
  await page.getByRole('link', { name: 'Pricing' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Simple monthly editions' })).toBeVisible();
  await page.getByRole('link', { name: 'AdSpark home' }).click();
  await page.getByRole('link', { name: 'How it works' }).click();
  await expect(page.locator('#how')).toBeInViewport();
  await page.getByRole('link', { name: 'Open app' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to AdSpark' })).toBeVisible();

  // Skip link is the first focusable element and moves focus to the content
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  expect(errors).toEqual([]);
});

test('script regenerates for every duration and storyboard supports drag reordering', async ({ page }) => {
  const errors = trackConsole(page);
  await createCampaign(page);
  await page.getByRole('button', { name: 'Create Full Campaign' }).first().click();
  await expect(page.getByText('6 scenes · 30s of 30s')).toBeVisible();

  for (const [d, n] of [[15, 4], [45, 7], [60, 8], [30, 6]] as const) {
    await page.getByLabel('Video duration').selectOption(String(d));
    await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Regenerate script' }).click();
    await expect(page.getByText(`${n} scenes · ${d}s of ${d}s`)).toBeVisible();
  }
  // Voiceover follows the new timings
  await page.getByRole('link', { name: 'Voiceover', exact: true }).click();
  await expect(page.getByLabel('Voiceover script')).toHaveValue(/–0:30\]/);

  await page.getByRole('link', { name: 'Storyboard', exact: true }).click();
  const cards = page.locator('main ol > li[draggable="true"]');
  await expect(cards).toHaveCount(6);
  const firstBefore = await cards.nth(0).locator('p.line-clamp-3').textContent();
  await cards.nth(0).dragTo(cards.nth(2));
  await expect(cards.nth(0).locator('p.line-clamp-3')).not.toHaveText(firstBefore!);
  await expect(cards.nth(2).locator('p.line-clamp-3')).toHaveText(firstBefore!);
  await expect(page.getByText('6 scenes · 30s of 30s')).toBeVisible();

  // Add and edit a scene, then fit timing
  await page.getByRole('button', { name: 'Add scene' }).click();
  await expect(cards).toHaveCount(7);
  await page.getByRole('button', { name: 'Edit scene 7' }).click();
  await page.getByRole('dialog').getByLabel('On-screen text').fill('Custom end card');
  await page.getByRole('dialog').getByLabel('Duration (seconds)').fill('5');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('7 scenes · 35s of 30s')).toBeVisible();
  await page.getByRole('button', { name: 'Fit to 30s' }).click();
  await expect(page.getByText('7 scenes · 30s of 30s')).toBeVisible();
  expect(errors).toEqual([]);
});

test('voiceover and social: copy, edit, regenerate and hashtags', async ({ page, context }) => {
  const errors = trackConsole(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await createCampaign(page);
  await page.getByRole('button', { name: 'Create Full Campaign' }).first().click();
  await page.getByRole('link', { name: 'Voiceover', exact: true }).click();

  await expect(page.getByText(/spoken words at a comfortable pace for English/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Per-scene fit' })).toBeVisible();
  await expect(page.getByText('It does not generate audio')).toBeVisible();
  await page.getByLabel('Voiceover script').fill('[0:00–0:30] Short custom line.');
  await expect(page.getByText(/~1s/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('[0:00–0:30] Short custom line.');
  await page.getByRole('button', { name: 'Sync from script' }).click();
  await expect(page.getByLabel('Voiceover script')).toHaveValue(/\[0:00–/);
  await page.getByLabel('Tone').selectOption('Calm');
  await expect(page.getByText('Slow, relaxed pace')).toBeVisible();
  await page.getByLabel('Language').selectOption('Russian');
  await expect(page.getByLabel('Voiceover script')).toHaveValue(/[а-яё]/i);

  await page.getByRole('link', { name: 'Social', exact: true }).click();
  await expect(page.getByLabel('YouTube Shorts description')).toHaveValue(/#shorts/);
  await expect(page.getByText('AdSpark does not post to social networks')).toBeVisible();
  await page.getByLabel('New hashtag').fill('fresh bread!');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Hashtags' })).toContainText('#freshbread');
  await page.getByRole('button', { name: 'Remove #freshbread' }).click();
  await expect(page.getByRole('list', { name: 'Hashtags' })).not.toContainText('#freshbread');
  await page.getByLabel('TikTok caption').fill('Edited TikTok caption');
  await page.getByRole('button', { name: 'Regenerate' }).click();
  await expect(page.getByText('Social content regenerated.')).toBeVisible();
  await expect(page.getByLabel('TikTok caption')).not.toHaveValue('Edited TikTok caption');
  expect(errors).toEqual([]);
});

test('backup, delete all data, restore, and reject invalid imports', async ({ page }) => {
  const errors = trackConsole(page);
  await createCampaign(page);
  await page.getByRole('button', { name: 'Create Full Campaign' }).first().click();
  await page.goto('/app/brand');
  await page.getByRole('button', { name: 'New brand profile' }).click();
  await page.getByLabel('Brand name').fill('Backup Brand');
  await page.getByRole('button', { name: 'Save brand' }).click();
  await expect(page.getByText('Brand “Backup Brand” saved.')).toBeVisible();

  await page.goto('/app/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
  const backupPath = (await download.path())!;
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  expect(backup.campaigns.length).toBeGreaterThan(0);
  expect(backup.brands.map((b: { name: string }) => b.name)).toContain('Backup Brand');

  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByText('0 campaign(s) and 0 brand profile(s)')).toBeVisible();

  await page.locator('#restore-file').setInputFiles(backupPath);
  await expect(page.getByText(/Restored \d+ campaign\(s\) and 1 brand profile\(s\)/)).toBeVisible();
  await page.goto('/app/campaigns');
  await expect(page.locator('main article')).toHaveCount(backup.campaigns.length);
  // Reopen a restored campaign: its full content is intact
  await page.locator('main article h3 a').first().click();
  await expect(page.getByText(/scenes · 30s of 30s/)).toBeVisible();

  // Invalid files are rejected with a clear message
  await page.goto('/app/campaigns');
  await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.getByText('The file is not valid JSON.')).toBeVisible();
  await page.locator('#import-file').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByText('This is not an AdSpark backup or project file.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('brand kit rejects unsafe logo files', async ({ page }) => {
  await page.goto('/app/brand');
  await page.getByRole('button', { name: 'New brand profile' }).click();
  await page.locator('#logo-input').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"/>') });
  await expect(page.getByText('Use a PNG, JPEG or WebP image. SVG files are not accepted.')).toBeVisible();
  await page.locator('#logo-input').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  await expect(page.getByText('This file is not a valid PNG, JPEG or WebP image.')).toBeVisible();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#logo-input').setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('img', { name: /logo/ })).toBeVisible();
});
