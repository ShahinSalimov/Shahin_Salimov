// Responsive sweep: every workspace page at 390 / 820 / 1440 px. Fails on HTTP errors, console errors or horizontal overflow.
// Requires Playwright + Chromium. Usage: BASE_URL=http://localhost:3000 node tests/e2e/responsive-sweep.cjs
const { chromium } = require('playwright');
const PUBLIC = ['/', '/login', '/signup'];
const PAGES = [...PUBLIC, '/w/demo', '/w/demo/assets', '/w/demo/assets/a-price-csv', '/w/demo/assets/a-order', '/w/demo/assets/a-price-csv?tab=information', '/w/demo/assets/a-catering-pdf?tab=scans', '/w/demo/assets/a-loc-downtown', '/w/demo/graph', '/w/demo/graph?view=list', '/w/demo/changes', '/w/demo/changes/c-burger', '/w/demo/changes/c-truffle', '/w/demo/approvals', '/w/demo/proposals', '/w/demo/integrations', '/w/demo/activity', '/w/demo/settings', '/w/demo/settings/team', '/w/demo/settings/billing'];
const VIEWPORTS = { mobile: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } };
(async () => {
  const b = await chromium.launch();
  const problems = [];
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await b.newContext({ viewport: vp, colorScheme: vpName === 'tablet' ? 'dark' : 'light' });
    const p = await ctx.newPage();
    let errors = [];
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(process.env.BASE_URL ?? 'http://localhost:3000')) errors.push(`${r.status()} ${r.url()}`); });
    await p.goto((process.env.BASE_URL ?? 'http://localhost:3000') + '/'); await p.click('text=Explore the demo'); await p.waitForURL('**/w/demo');
    for (const path of PAGES) {
      errors = [];
      const res = await p.goto((process.env.BASE_URL ?? 'http://localhost:3000') + path);
      await p.waitForTimeout(400);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const name = `${vpName}${path.replace(/\//g, '_')}`;
      await p.screenshot({ path: `${process.env.SHOT_DIR ?? '/tmp'}/${name}.png`, fullPage: true });
      if (res.status() !== 200 || overflow > 0 || errors.length) problems.push({ vpName, path, status: res.status(), overflow, errors: errors.slice(0, 3) });
    }
    await ctx.close();
  }
  console.log(JSON.stringify(problems, null, 1));
  console.log('checked', PAGES.length * 3, 'page/viewport combos');
  if (problems.length) process.exitCode = 1;
  await b.close();
})();
