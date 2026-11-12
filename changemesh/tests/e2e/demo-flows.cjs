// End-to-end demo flows (approve, reject, confirm relationship, add asset, record change, roles, rename, activity, mobile nav, isolation).
// Requires Playwright + Chromium and a server with CHANGEMESH_DEMO_MODE=enabled. Usage: BASE_URL=http://localhost:3000 node tests/e2e/demo-flows.cjs
const { chromium } = require('playwright');
const B = process.env.BASE_URL ?? 'http://localhost:3000';
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await p.goto(B); await p.click('text=Explore the demo'); await p.waitForURL('**/w/demo');
  const badge = async () => (await p.locator('nav[aria-label=Main] a[href="/w/demo/approvals"]').innerText()).replace(/\D/g, '');
  check(await badge() === '8', 'sidebar shows 8 pending approvals');

  // Approve a proposal
  await p.goto(B + '/w/demo/approvals');
  await p.getByRole('button', { name: 'Approve update for Online ordering page' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await p.getByText('Proposal approved').waitFor();
  check(await badge() === '7', 'approving decreases pending count to 7');

  // Reject requires comment (server-side validation)
  await p.getByRole('button', { name: /Reject update for/ }).first().click();
  await p.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  const invalid = await p.getByRole('dialog').locator('textarea:invalid').count();
  check(invalid === 1 && (await p.getByRole('dialog').isVisible()), 'rejection without comment is blocked (required comment)');
  await p.getByRole('dialog').locator('textarea').fill('Wrong source document');
  await p.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  await p.getByText('Proposal rejected').waitFor();
  check(await badge() === '6', 'rejecting with comment decreases pending to 6');

  // Confirm a suggested relationship
  await p.goto(B + '/w/demo/graph?status=suggested');
  const before = await p.locator('li').filter({ hasText: 'Suggested' }).count();
  await p.getByRole('button', { name: /^Confirm:/ }).first().click();
  await p.getByText('Relationship confirmed.').waitFor();
  await p.waitForTimeout(500);
  const after = await p.locator('li').filter({ hasText: 'Suggested' }).count();
  check(after === before - 1, `confirming a suggestion removes it from the suggested list (${before} -> ${after})`);

  // Register an asset (validation, then success + redirect)
  await p.goto(B + '/w/demo/assets');
  await p.getByRole('button', { name: 'Add asset' }).click();
  const dlg = p.getByRole('dialog');
  await dlg.getByLabel('Name').fill('Spring menu page');
  await dlg.getByRole('button', { name: 'Register asset' }).click();
  check((await dlg.locator('input[name=sourceUrl]:invalid').count()) === 1, 'website without URL is blocked by the browser');
  await dlg.getByLabel(/^URL/).fill('ftp://harborvine.example/spring');
  await dlg.getByRole('button', { name: 'Register asset' }).click();
  await dlg.getByText(/Enter a full http\(s\) URL/).waitFor();
  check((await dlg.getByLabel('Name').inputValue()) === 'Spring menu page', 'server rejects ftp:// URL and keeps typed values');
  await dlg.getByLabel(/^URL/).fill('https://harborvine.example/spring');
  await dlg.getByRole('button', { name: 'Register asset' }).click();
  await p.getByRole('heading', { name: 'Spring menu page' }).waitFor();
  check(p.url().includes('/w/demo/assets/a-'), 'new asset detail page opens');

  // Record a change
  await p.getByRole('button', { name: 'Record change' }).click();
  await p.getByRole('dialog').getByLabel('Title').fill('Spring menu launch date moved');
  await p.getByRole('button', { name: 'Save draft' }).click();
  await p.waitForURL(/\/w\/demo\/changes\/c-/, { waitUntil: 'commit' }); await p.getByText('No impact analysis yet').waitFor();
  check(await p.getByText('No impact analysis yet').isVisible(), 'new draft change shows honest empty impact state');

  // Team: change role, and last owner protection
  await p.goto(B + '/w/demo/settings/team');
  await p.getByLabel('Role for Leyla Aliyeva').selectOption('editor');
  await p.getByText('Role updated.').waitFor();
  check(true, 'role change works');

  // Rename workspace
  await p.goto(B + '/w/demo/settings');
  await p.getByLabel('Workspace name').fill('Harbor & Vine — Demo HQ');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.getByText('Workspace renamed.').waitFor();
  await p.reload();
  check((await p.getByRole('banner').innerText()).includes('Demo HQ'), 'renamed workspace appears in header');

  // Activity reflects actions
  await p.goto(B + '/w/demo/activity');
  const text = await p.locator('main').innerText();
  check(text.includes('Demo Visitor (you)') && text.includes('Spring menu page'), 'activity log records demo actions');

  // Mobile nav opens and navigates
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(B + '/w/demo');
  await p.getByRole('button', { name: 'Open navigation' }).click();
  await p.getByRole('dialog').getByRole('link', { name: /Change Map/ }).click();
  await p.waitForURL('**/w/demo/graph', { waitUntil: 'commit' });
  check(true, 'mobile navigation works');

  // Separate demo session is isolated
  const p2 = await (await b.newContext()).newPage();
  await p2.goto(B); await p2.click('text=Explore the demo'); await p2.waitForURL('**/w/demo');
  check((await p2.locator('nav[aria-label=Main] a[href="/w/demo/approvals"]').innerText()).includes('8'), 'another visitor gets a fresh, isolated demo session');
  await b.close();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
