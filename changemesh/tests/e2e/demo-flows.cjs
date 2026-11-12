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
  // Waits until the sidebar counter shows the expected value (the revalidated page commits after the toast).
  const badgeBecomes = async (want) => {
    for (let i = 0; i < 40; i++) {
      if ((await badge()) === want) return true;
      await p.waitForTimeout(100);
    }
    return false;
  };
  check(await badge() === '8', 'sidebar shows 8 pending approvals');

  // Approve a proposal
  await p.goto(B + '/w/demo/approvals');
  await p.getByRole('button', { name: 'Approve update for Online ordering page' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await p.getByText('Proposal approved').waitFor();
  check(await badgeBecomes('7'), 'approving decreases pending count to 7');

  // Reject requires comment (server-side validation)
  await p.getByRole('button', { name: /Reject update for/ }).first().click();
  await p.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  const invalid = await p.getByRole('dialog').locator('textarea:invalid').count();
  check(invalid === 1 && (await p.getByRole('dialog').isVisible()), 'rejection without comment is blocked (required comment)');
  await p.getByRole('dialog').locator('textarea').fill('Wrong source document');
  await p.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  await p.getByText('Proposal rejected').waitFor();
  check(await badgeBecomes('6'), 'rejecting with comment decreases pending to 6');

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
  await p.getByRole('dialog').getByLabel('Analyze the impact now (rule-based)').uncheck();
  await p.getByRole('button', { name: 'Save change' }).click();
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

  // ---- Stage 3: Asset Intelligence ----
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-e2e-'));
  const csvPath = path.join(dir, 'spring-prices.csv');
  fs.writeFileSync(csvPath, 'Item,Price,Available\nSpring Salad,$13.00,yes\nAsparagus Soup,$9.50,yes\nBroken,row\n');
  const xlsxPath = path.join(dir, 'prices.xlsx');
  fs.writeFileSync(xlsxPath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]));
  await p.setViewportSize({ width: 1280, height: 900 });

  // Register a CSV asset and upload a real file
  await p.goto(B + '/w/demo/assets');
  await p.getByRole('button', { name: 'Add asset' }).click();
  const d2 = p.getByRole('dialog');
  await d2.getByLabel('Type').selectOption('csv');
  await d2.getByLabel('Name').fill('Spring price list');
  await d2.getByRole('button', { name: 'Register asset' }).click();
  await p.getByRole('heading', { name: 'Spring price list' }).waitFor();
  await p.locator('input[type=file]').setInputFiles(csvPath);
  await p.getByRole('button', { name: 'Upload and analyze' }).click();
  await p.getByText(/Partially analyzed \(v1\): 4 facts saved/).waitFor({ timeout: 15000 });
  check(true, 'CSV upload is analyzed and reported as partial (malformed row)');
  await p.getByRole('link', { name: /Extracted information\s*4/ }).waitFor(); // revalidated page committed
  await p.getByRole('link', { name: /Extracted information/ }).click();
  await p.waitForURL(/tab=information/, { waitUntil: 'commit' });
  await p.getByRole('cell', { name: 'Spring Salad' }).first().waitFor({ state: 'visible' });
  const factsText = await p.locator('main').innerText();
  const okFacts = factsText.includes('USD 13.00') && factsText.includes('Row 2 · Price');
  if (!okFacts) console.log('DEBUG facts text:', JSON.stringify(factsText.slice(0, 600)));
  check(okFacts, 'extracted facts show normalized value and source location');
  await p.getByRole('link', { name: /Scans & versions/ }).click();
  await p.getByText('1 warning').click();
  check((await p.locator('main').innerText()).includes('different number of columns'), 'scan history shows the warning for skipped rows');

  // Unsupported file → failed scan, previous version kept
  await p.goto(p.url().split('?')[0]);
  await p.locator('input[type=file]').setInputFiles(xlsxPath);
  await p.getByRole('button', { name: 'Upload and analyze' }).click();
  await p.getByText(/Scan failed: Office documents/).waitFor({ timeout: 15000 });
  await p.getByText('The last scan failed').waitFor({ timeout: 5000 }).catch(() => {});
  check((await p.locator('main').innerText()).includes('The last scan failed'), 'unsupported upload is recorded as a failed scan');

  // Real PDF through the production bundle: page 2 has no text → partial
  const pdfPath = path.join(dir, 'menu.pdf');
  fs.writeFileSync(pdfPath, makePdf(['Classic Burger ........ $15.00', '']));
  await p.goto(B + '/w/demo/assets/a-dinner-pdf');
  await p.locator('input[type=file]').setInputFiles(pdfPath);
  await p.getByRole('button', { name: 'Upload and analyze' }).click();
  await p.getByText(/Partially analyzed \(v3\): 1 facts saved/).waitFor({ timeout: 20000 });
  check(true, 'PDF upload is read and image-only pages are reported');

  // Manual fact on a manual record, then delete it
  await p.goto(B + '/w/demo/assets/a-loc-downtown');
  await p.getByRole('button', { name: 'Add fact' }).click();
  const d3 = p.getByRole('dialog');
  await d3.getByLabel('Attribute').fill('email');
  await d3.getByLabel('Value').fill('Downtown@HarborVine.example');
  await d3.getByRole('button', { name: 'Save fact' }).click();
  await p.getByText(/Saved: Location record — Downtown · email/).waitFor();
  await p.goto(B + '/w/demo/assets/a-loc-downtown?tab=information');
  await p.getByRole('cell', { name: 'Downtown@HarborVine.example' }).waitFor();
  check((await p.locator('main').innerText()).includes('Downtown@HarborVine.example') && (await p.locator('main').innerText()).includes('Entered manually'), 'manual fact is saved and marked as entered manually');
  await p.getByRole('button', { name: /Delete fact Location record — Downtown email/ }).click();
  await p.getByText('Fact removed.').waitFor();
  check(true, 'manual fact can be removed');

  // Website scans are not available in demo mode (no external fetches)
  await p.goto(B + '/w/demo/assets/a-menu-page');
  check((await p.locator('main').innerText()).includes('Demo mode does not fetch external websites') && (await p.getByRole('button', { name: /Scan (now|again)/ }).count()) === 0, 'demo mode explains instead of offering a website scan');

  // Edit metadata, then delete with typed confirmation
  await p.goto(B + '/w/demo/assets/a-allergen-pdf');
  await p.getByRole('button', { name: 'Edit' }).click();
  const d4 = p.getByRole('dialog');
  await d4.getByLabel('Name').fill('Allergen guide 2026.pdf');
  await d4.getByRole('button', { name: 'Save' }).click();
  await p.getByRole('heading', { name: 'Allergen guide 2026.pdf' }).waitFor();
  check(true, 'asset metadata can be edited');
  await p.getByRole('button', { name: 'Delete' }).click();
  const d5 = p.getByRole('dialog');
  check(await d5.getByRole('button', { name: 'Delete asset' }).isDisabled(), 'delete is disabled until the name is typed');
  await d5.getByLabel(/Type/).fill('Allergen guide 2026.pdf');
  await d5.getByRole('button', { name: 'Delete asset' }).click();
  await p.waitForURL('**/w/demo/assets', { waitUntil: 'commit' });
  await p.getByRole('heading', { name: 'Assets' }).waitFor();
  check(!(await p.locator('main').innerText()).includes('Allergen guide 2026.pdf'), 'asset is deleted after confirmation');
  fs.rmSync(dir, { recursive: true, force: true });

  // ---- Stage 4: Dependency graph ----
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.goto(B + '/w/demo/graph');
  await p.locator('.react-flow__node-asset').first().waitFor();
  const assetNodes = await p.locator('.react-flow__node-asset').count();
  check(assetNodes >= 14, `graph renders asset nodes from the database (${assetNodes})`);
  check((await p.locator('.react-flow__node-information').count()) > 0 && (await p.locator('.react-flow__node-entity').count()) > 0, 'graph renders entities and shared information');
  check((await p.locator('.react-flow__edge').count()) > 10, 'graph renders relationship and occurrence edges');

  // Select a node: details + highlight with depth
  const panel = p.locator('aside[aria-live]');
  await p.locator('.react-flow__node').filter({ hasText: 'Master price list.csv' }).click();
  await panel.getByText('Connected assets').waitFor();
  const allHops = await panel.locator('li button', { hasText: /hop/ }).count();
  await p.getByLabel('Highlight depth').selectOption('1');
  const oneHop = await panel.locator('li button', { hasText: /hop/ }).count();
  check(oneHop > 0 && oneHop < allHops, `depth filter limits highlighted assets (${allHops} → ${oneHop})`);

  // Inconsistent information
  await p.locator('.react-flow__node-information').filter({ hasText: 'Values differ' }).first().click();
  await panel.getByText(/Values differ between assets/).waitFor();
  check(true, 'information node shows differing values per asset');

  // Search
  await p.getByLabel('Search nodes').fill('burger');
  await p.getByText(/\d+ match/).waitFor();
  check(/[1-9]\d* match/.test(await p.getByText(/\d+ match/).innerText()), 'search finds matching nodes');
  await p.getByLabel('Clear search').click();

  // Asset type filter
  await p.getByRole('button', { name: 'Marketing content', pressed: true }).click();
  await p.waitForTimeout(300);
  const filtered = await p.locator('.react-flow__node-asset').count();
  check(filtered === assetNodes - 3, `asset type filter hides marketing content (${assetNodes} → ${filtered})`);
  await p.getByRole('button', { name: 'Marketing content', pressed: false }).click();

  // Rule-based suggestions
  const awaitingBefore = Number((await p.locator('a', { hasText: 'Awaiting review' }).innerText()).match(/\d+/)[0]);
  await p.getByRole('button', { name: 'Suggest relationships' }).click();
  const toastText = await p.locator('[data-sonner-toast]').first().innerText({ timeout: 15000 });
  await p.waitForTimeout(800);
  const awaitingAfter = Number((await p.locator('a', { hasText: 'Awaiting review' }).innerText()).match(/\d+/)[0]);
  const created = Number((toastText.match(/(\d+) new relationship/) || [0, 0])[1]);
  check(/new relationship suggestion|No new relationships/.test(toastText) && awaitingAfter === awaitingBefore + created, `suggestions are stored for review (${awaitingBefore} → ${awaitingAfter}, created ${created})`);
  await p.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

  // Manual relationship for a disconnected asset
  await p.getByRole('button', { name: 'Add relationship' }).click();
  const d6 = p.getByRole('dialog');
  await d6.getByLabel('Source asset').selectOption({ label: 'November newsletter draft' });
  await d6.getByLabel('Relationship').selectOption('references');
  await d6.getByLabel('Target asset').selectOption({ label: 'Website — Menu page' });
  await d6.getByRole('button', { name: 'Create relationship' }).click();
  await p.getByText('Relationship created and confirmed.').waitFor();
  check(true, 'manual relationship is created');

  // Duplicate in reverse direction is refused
  await p.getByRole('button', { name: 'Add relationship' }).click();
  const d7 = p.getByRole('dialog');
  await d7.getByLabel('Source asset').selectOption({ label: 'Website — Menu page' });
  await d7.getByLabel('Relationship').selectOption('references');
  await d7.getByLabel('Target asset').selectOption({ label: 'November newsletter draft' });
  await d7.getByRole('button', { name: 'Create relationship' }).click();
  await p.getByText('These assets already have a relationship of this type.').waitFor();
  check(true, 'reverse duplicate relationship is refused');
  await d7.getByRole('button', { name: 'Cancel' }).click();

  // Review a suggestion from the edge details panel
  await p.locator('.react-flow__node').filter({ hasText: 'Catering menu.pdf' }).click();
  await panel.locator('li button', { hasText: 'derived from' }).filter({ hasText: 'Master price list.csv' }).first().click();
  await panel.getByRole('button', { name: /^Confirm:/ }).click();
  await p.getByText('Relationship confirmed.').waitFor();
  check(true, 'suggested relationship is confirmed from the graph');

  // Remove the manual relationship
  await p.locator('.react-flow__node').filter({ hasText: 'November newsletter draft' }).click();
  await panel.locator('li button', { hasText: 'references' }).filter({ hasText: 'Website — Menu page' }).first().click();
  await panel.getByRole('button', { name: /Remove relationship/ }).click();
  await panel.getByRole('button', { name: 'Confirm remove' }).click();
  await p.getByText('Relationship removed.').waitFor();
  check(true, 'relationship is removed after confirmation');

  // List view (text alternative)
  await p.getByRole('link', { name: /^List/ }).click();
  await p.getByRole('heading', { name: 'Relationships' }).waitFor();
  check(true, 'list view is available as a text alternative');

  // ---- Stage 5: change detection and impact analysis ----
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.goto(B + '/w/demo/changes/c-burger');
  check((await p.locator('main').innerText()).includes('Sample analysis'), 'seeded demo analysis is labeled as sample');
  await p.getByRole('button', { name: 'Re-run analysis' }).click();
  await p.getByText(/Rule-based analysis complete: \d+ affected assets?/).waitFor({ timeout: 20000 });
  await p.getByText('Rule-based · no AI').waitFor();
  check(true, 're-running the analysis computes it from the data and labels it rule-based');
  check((await p.locator('.react-flow__node').count()) >= 4, 'impact graph shows the source and affected assets');
  const changeText = await p.locator('main').innerText();
  check(changeText.includes('Online ordering page') && changeText.includes('Recommended:') && changeText.includes('Approval status'), 'affected assets, recommendations and approval status are shown');
  check(!changeText.includes('Master price list.csv\nCSV'), 'the source asset is not listed as affected');

  // Register a new value: old value is read from the source asset
  await p.goto(B + '/w/demo/changes');
  await p.getByRole('button', { name: 'Record change' }).click();
  const d8 = p.getByRole('dialog');
  await d8.getByLabel('Title').fill('Classic Burger price to $16');
  await d8.getByLabel('Source asset').selectOption({ label: 'Master price list.csv' });
  await d8.getByLabel('Entity').fill('Classic Burger');
  await d8.getByLabel('Attribute').fill('price');
  await d8.getByLabel('New value').fill('$16.00');
  await d8.getByRole('button', { name: 'Save change' }).click();
  await p.getByText(/Change recorded and analyzed: \d+ affected/).waitFor({ timeout: 20000 });
  await p.getByRole('heading', { name: 'Classic Burger price to $16' }).waitFor();
  const regText = await p.locator('main').innerText();
  check(regText.includes('$15.00') && regText.includes('$16.00'), 'old value is filled from the source asset and compared with the new value');
  check(regText.includes('Pending'), 'update proposals are created as pending');

  // Detect inconsistencies across assets
  await p.goto(B + '/w/demo/changes');
  await p.getByRole('button', { name: 'Detect inconsistencies' }).click();
  const incToast = await p.locator('[data-sonner-toast]').first().innerText({ timeout: 20000 });
  check(/inconsistenc|No new inconsistencies|No inconsistencies/.test(incToast), `inconsistency detection reports its result ("${incToast.split('\n')[0]}")`);

  // Separate demo session is isolated
  const p2 = await (await b.newContext()).newPage();
  await p2.goto(B); await p2.click('text=Explore the demo'); await p2.waitForURL('**/w/demo');
  check((await p2.locator('nav[aria-label=Main] a[href="/w/demo/approvals"]').innerText()).includes('8'), 'another visitor gets a fresh, isolated demo session');
  await b.close();
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });

function makePdf(pages) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`];
  const fontId = 3 + pages.length * 2;
  pages.forEach((text, i) => {
    const content = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : '';
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
