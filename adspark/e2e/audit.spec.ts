import { expect, test, type Page } from '@playwright/test';

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function addSample(page: Page) {
  await page.goto('/app/campaigns');
  await page.getByRole('button', { name: 'Add sample campaign' }).click();
  await expect(page.getByText('Sample campaign added.')).toBeVisible();
  const href = await page.locator('main article h3 a').first().getAttribute('href');
  return href!;
}

test('crawl: every internal link resolves to a real page without console errors or warnings', async ({ page }) => {
  const errors = trackConsole(page);
  const campaignHref = await addSample(page);
  const id = campaignHref.split('/')[3];
  const queue = ['/', '/pricing', '/app', '/app/campaigns', `/app/campaigns/${id}`];
  const seen = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Page not found|Campaign not found/ }), `${path} is broken`).toHaveCount(0);
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!.split('#')[0]));
    for (const h of hrefs) if (h && !seen.has(h)) queue.push(h);
  }
  expect(seen.size).toBeGreaterThanOrEqual(12);
  expect(errors).toEqual([]);
});

test('sample campaign and previously untested controls work', async ({ page }) => {
  const errors = trackConsole(page);
  // Dashboard empty state offers the sample
  await page.goto('/app');
  await page.getByRole('button', { name: 'Open a sample campaign' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sample: Bloom Bakery morning launch');
  await expect(page.getByText('6 scenes · 30s of 30s')).toBeVisible();

  // Rename from the editor title
  await page.getByRole('button', { name: 'Rename campaign' }).click();
  await page.getByLabel('Campaign name').fill('Bloom spring campaign');
  await page.getByLabel('Campaign name').press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Bloom spring campaign');

  // Regenerate a single concept
  await page.getByRole('link', { name: 'Concepts', exact: true }).click();
  const titles = page.locator('main article h3');
  const before = await titles.allTextContents();
  await page.getByRole('button', { name: 'Regenerate', exact: true }).nth(4).click();
  await expect.poll(async () => (await titles.allTextContents())[4]).not.toBe(before[4]);
  expect((await titles.allTextContents()).slice(0, 4)).toEqual(before.slice(0, 4));
  expect(new Set(await titles.allTextContents()).size).toBe(5);

  // Storyboard preview plays and pauses
  await page.getByRole('link', { name: 'Storyboard', exact: true }).click();
  await page.getByRole('button', { name: 'Preview storyboard' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '0', { timeout: 4000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Next scene' }).click();
  await expect(page.getByRole('dialog')).toContainText('Scene 2');
  await page.getByRole('button', { name: 'Close' }).click();

  // Print view calls the browser print dialog
  await page.getByRole('link', { name: 'Print view' }).click();
  await page.evaluate(() => {
    (window as unknown as { __printed: boolean }).__printed = false;
    window.print = () => ((window as unknown as { __printed: boolean }).__printed = true);
  });
  await page.getByRole('button', { name: 'Print or save as PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: boolean }).__printed)).toBe(true);
  await page.getByRole('link', { name: 'Back to campaign' }).click();
  await expect(page).toHaveURL(/\/app\/campaigns\/[^/]+$/);

  // Dashboard quick actions, engine link, pricing CTA
  await page.goto('/app');
  await page.getByRole('link', { name: 'Open Storyboard Studio' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Choose a storyboard' })).toBeVisible();
  await page.getByRole('link', { name: /Engine: Demo Generation/ }).click();
  await expect(page.getByRole('heading', { name: 'Generation engine' })).toBeVisible();
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByText(/AI provider not available/)).toBeVisible();
  await page.goto('/pricing');
  await expect(page.getByText('not on sale yet')).toBeVisible();
  await page.getByRole('link', { name: 'Use free while in preview' }).first().click();
  await expect(page).toHaveURL(/\/app\/new$/);
  expect(errors).toEqual([]);
});

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone', width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test(`layout: no horizontal overflow or clipped controls on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const href = await addSample(page);
    const base = href;
    for (const path of ['/', '/pricing', '/app', '/app/new', '/app/campaigns', '/app/brand', '/app/settings', `${base}/concepts`, base, `${base}/storyboard`, `${base}/voiceover`, `${base}/social`, `${base}/print`]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const report = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const clipped = [...document.querySelectorAll('button, a, input, select, textarea')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (r.width === 0 || style.visibility === 'hidden' || el.closest('.sr-only, .skip-link, [aria-hidden="true"]')) return false;
            return r.right > window.innerWidth + 1 || r.left < -1;
          })
          .map((el) => (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40));
        return { overflow, clipped };
      });
      expect(report.overflow, `${path} overflows by ${report.overflow}px`).toBeLessThanOrEqual(0);
      expect(report.clipped, `${path} has controls outside the viewport`).toEqual([]);
    }
  });
}
