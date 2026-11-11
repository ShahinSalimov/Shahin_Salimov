import { expect, test } from '@playwright/test';

const APP = 'http://127.0.0.1:8788';

test('optional AI provider: consent gate, AI generation through the proxy, exact timing', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  // The server refuses AI requests without the consent header, and never exposes the key.
  const denied = await request.post(`${APP}/api/ai/generate`, { data: { task: 'concepts' } });
  expect(denied.status()).toBe(403);
  const status = await (await request.get(`${APP}/api/ai/status`)).text();
  expect(status).not.toContain('e2e-key');
  expect(JSON.parse(status)).toMatchObject({ enabled: true, provider: 'OpenAI-compatible', model: 'mock-model' });

  await page.goto(`${APP}/app/settings`);
  await expect(page.getByText('AI provider available: OpenAI-compatible')).toBeVisible();
  const turnOn = page.getByRole('button', { name: 'Turn on AI generation' });
  await expect(turnOn).toBeDisabled();
  await page.getByRole('checkbox').check();
  await turnOn.click();
  await expect(page.getByText(/AI generation is on since/)).toBeVisible();

  await page.goto(`${APP}/app/new`);
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Review brief' }).click();
  await page.getByRole('button', { name: 'Generate concepts' }).click();

  await expect(page.getByRole('heading', { name: 'AI concept 1' })).toBeVisible();
  await expect(page.getByText('AI · OpenAI-compatible').first()).toBeVisible();
  await expect(page.getByText('Demo Generation · not AI')).toHaveCount(0);

  await page.getByRole('button', { name: 'Create Full Campaign' }).first().click();
  // The mock returns wrong durations on purpose; the app fits them to exactly 30 s.
  await expect(page.getByText('6 scenes · 30s of 30s')).toBeVisible();
  await page.getByRole('link', { name: 'Social', exact: true }).click();
  await expect(page.getByLabel('Instagram caption')).toHaveValue('AI Instagram caption');

  // PDF export works under the production server's Content-Security-Policy.
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const headers = (await request.get(`${APP}/`)).headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['x-frame-options']).toBe('DENY');

  // Turning AI off returns to Demo Generation without touching saved work.
  await page.goto(`${APP}/app/settings`);
  await page.getByRole('button', { name: 'Turn off AI' }).click();
  await expect(page.getByText('Demo Generation').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('AI proxy rejects invalid, cross-origin and oversized requests', async ({ request }) => {
  const headers = { 'X-AdSpark-Consent': 'granted' };
  expect((await request.post(`${APP}/api/ai/generate`, { headers, data: { task: 'hack' } })).status()).toBe(400);
  expect((await request.post(`${APP}/api/ai/generate`, { headers: { ...headers, Origin: 'https://evil.example' }, data: {} })).status()).toBe(403);
  const big = 'x'.repeat(70 * 1024);
  expect((await request.post(`${APP}/api/ai/generate`, { headers, data: { task: 'concepts', pad: big } })).status()).toBe(413);
  expect((await request.get(`${APP}/api/ai/generate`)).status()).toBe(405);
});
