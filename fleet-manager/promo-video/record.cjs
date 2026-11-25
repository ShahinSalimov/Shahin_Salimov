// Tətbiqin ekranını CDP screencast ilə çəkir, kursor/işıqlandırma effektləri verir,
// səhnə və kamera hadisələrini timeline.json-a yazır (zoom montajda tətbiq olunur).
const { chromium } = require('playwright');
const fs = require('fs');
const V = process.argv[2];
const BASE = 'http://127.0.0.1:4180/';
const scenes = JSON.parse(fs.readFileSync(V + '/scenes.json'));
const dur = JSON.parse(fs.readFileSync(V + '/audio/durations.json'));
const FR = V + '/frames';
fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR);

const FX = `
(() => {
  if (window.__fx) return;
  window.__fx = true;
  const mk = () => {
    const st = document.createElement('style');
    st.textContent = '#__ring{position:fixed;z-index:2147483600;pointer-events:none;border:3px solid #facc15;border-radius:18px;box-shadow:0 0 0 9999px rgba(15,23,42,.5),0 0 34px rgba(250,204,21,.65);opacity:0;transition:opacity .35s ease}#__cur{position:fixed;z-index:2147483647;pointer-events:none;width:34px;height:34px;left:0;top:0;transition:transform .75s cubic-bezier(.65,0,.35,1),opacity .3s;opacity:0}#__cur:after{content:"";position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;background:rgba(250,204,21,.45);transform:scale(0);transition:transform .25s}#__cur.clk:after{transform:scale(1.4)}::-webkit-scrollbar{display:none}html{scrollbar-width:none}';
    document.head.appendChild(st);
    const r = document.createElement('div'); r.id = '__ring'; document.body.appendChild(r);
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6 4 7.4-3 1.5-4-7.5L4 19z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    // screencast-in fasiləsiz kadr göndərməsi üçün gözəgörünməz "nəbz"
    const hb = document.createElement('div');
    hb.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;z-index:2147483646;pointer-events:none';
    document.body.appendChild(hb);
    let k = 0; const tick = () => { hb.style.background = (k++ % 2) ? 'rgba(0,0,0,.004)' : 'rgba(0,0,0,.008)'; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
  window.FX = {
    ring(r, radius) {
      const e = document.getElementById('__ring'); if (!e) return;
      if (!r) { e.style.opacity = 0; return; }
      const p = 8;
      e.style.transition = 'none'; e.style.opacity = 0; void e.offsetWidth; e.style.transition = 'opacity .35s ease';
      Object.assign(e.style, { left: (r.x - p) + 'px', top: (r.y - p) + 'px', width: (r.width + 2 * p) + 'px', height: (r.height + 2 * p) + 'px', opacity: 1, borderRadius: (radius ?? 18) + 'px' });
    },
    cur(x, y, show = true) {
      const c = document.getElementById('__cur'); if (!c) return;
      c.style.opacity = show ? 1 : 0; c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    },
    clk() { const c = document.getElementById('__cur'); c.classList.add('clk'); setTimeout(() => c.classList.remove('clk'), 260); },
  };
})();`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(FX);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const frames = []; let n = 0; const writes = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const file = `${FR}/${String(n++).padStart(6, '0')}.jpg`;
    frames.push({ t: f.metadata.timestamp, file });
    writes.push(fs.promises.writeFile(file, Buffer.from(f.data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const now = () => Date.now() / 1000;
  const timeline = { scenes: [], cams: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cam = (rect, zoom) => timeline.cams.push({ t: now(), rect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null, zoom: zoom ?? null });
  const box = async (loc) => { await loc.first().waitFor({ state: 'visible', timeout: 8000 }); return loc.first().boundingBox(); };
  const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }; };
  const ring = async (locOrRect, radius) => { const r = locOrRect && (locOrRect.x !== undefined ? locOrRect : await box(locOrRect)); await page.evaluate(([r, rad]) => window.FX && window.FX.ring(r, rad), [r, radius]); return r; };
  let curPos = { x: 800, y: 600 };
  const cursorTo = async (loc, dx = 0.5, dy = 0.5) => {
    const b = await box(loc); const x = b.x + b.width * dx, y = b.y + b.height * dy;
    await page.evaluate(([x, y]) => window.FX.cur(x, y), [x, y]); curPos = { x, y }; await sleep(850); return b;
  };
  const click = async (loc) => { await cursorTo(loc); await page.evaluate(() => window.FX.clk()); await page.mouse.click(curPos.x, curPos.y); await sleep(450); };
  const hideCur = () => page.evaluate(([x, y]) => window.FX && window.FX.cur(x, y, false), [curPos.x, curPos.y]);
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; window.scrollTo(0, 0); }, hash); await sleep(700); };
  const card = (text) => page.locator('.rounded-2xl', { has: page.getByText(text, { exact: true }) }).last();

  let sceneEnd = 0;
  const scene = async (id, fn) => {
    const t0 = now();
    timeline.scenes.push({ id, t: t0 });
    const minEnd = t0 + dur[id] + 0.9;
    await fn();
    const left = minEnd - now();
    if (left > 0) await sleep(left * 1000);
    sceneEnd = now();
    console.log('scene', id, (sceneEnd - t0).toFixed(1) + 's');
  };

  // Tətbiqi əvvəlcədən yüklə (demo data seed olunsun)
  await page.goto(BASE + 'index.html#/'); await page.waitForTimeout(1500);
  await page.goto(BASE + 'intro.html'); await page.waitForTimeout(300);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 3200, maxHeight: 1800, everyNthFrame: 1 });
  await sleep(400);
  timeline.start = now();

  await scene('intro', async () => {
    cam(null);
    await sleep(5200);
    await page.goto(BASE + 'index.html#/'); await page.waitForTimeout(900);
    cam(null);
    await sleep(800);
    cam(await box(page.locator('main')), 1.15);
  });

  await scene('hero', async () => {
    const hero = page.locator('main div.bg-ink').first();
    const b = await box(hero);
    cam(b); await sleep(1100);
    await ring(hero);
    await sleep(2500);
    const bar = page.getByText('Plan icrası').locator('..').locator('..');
    await ring(bar, 12); cam(await box(bar), 2.0);
  });

  await scene('stats', async () => {
    await ring(null);
    const g = page.locator('main .grid.grid-cols-2').first();
    cam(await box(g)); await sleep(900);
    const cards = g.locator(':scope > div');
    for (let i = 0; i < 4; i++) { await ring(cards.nth(i)); await sleep(1500); }
  });

  await scene('chart', async () => {
    const c = card('Bu ayın xülasəsi');
    const ch = page.locator('main .lg\\:col-span-2').first();
    await ring(null);
    cam(await box(ch)); await sleep(3000);
    cam(await box(c)); await ring(page.getByText('Xalis nəticə').locator('..'), 10);
  });

  await scene('alerts', async () => {
    await ring(null); cam(null); await sleep(600);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })); await sleep(1200);
    const a = card('Diqqət tələb edənlər');
    cam(await box(a)); await sleep(1500);
    const items = a.locator('a');
    for (const i of [0, 1, 10]) { if (await items.count() > i) { await ring(items.nth(i), 12); await sleep(1600); } }
  });

  await scene('pay', async () => {
    await ring(null); cam(null);
    await click(page.locator('aside').getByText('Gündəlik ödəniş'));
    await sleep(500);
    const first = page.locator('main .grid.gap-2 > div').first();
    cam(await box(page.locator('main .grid.gap-2'))); await sleep(900);
    cam(await box(first), 1.9); await sleep(800);
    await ring(first.getByRole('button', { name: 'Nağd' }), 12);
    await click(first.getByRole('button', { name: 'Nağd' }));
    await ring(null); await sleep(900);
  });

  await scene('wa', async () => {
    const first = page.locator('main .grid.gap-2 > div').first();
    cam(await box(first), 1.9); await sleep(500);
    const wa = first.locator('a[aria-label="WhatsApp xatırlatma"]');
    await cursorTo(wa); await page.evaluate(() => window.FX.clk());
    await ring(wa, 12); await sleep(1500);
  });

  await scene('cars', async () => {
    await ring(null); cam(null); await hideCur();
    await go('#/cars'); await sleep(300);
    const rows = page.locator('main tbody tr');
    cam(union(await box(page.locator('main h1')), await box(rows.nth(7))));
    await sleep(2500);
    const st = page.locator('main tbody tr').filter({ has: page.locator('text=Sığorta') }).first();
    if (await st.count()) { await ring(st, 10); }
  });

  await scene('car', async () => {
    await ring(null);
    await click(page.locator('main tbody tr').first());
    cam(null); await sleep(600);
    const g = page.locator('main .grid.grid-cols-2').first();
    cam(await box(g)); await sleep(700);
    await ring(g.locator(':scope > div').nth(2)); await sleep(2600);
    const tech = card('Texniki vəziyyət');
    await ring(null); cam(await box(tech), 2.0); await sleep(500); await ring(tech);
  });

  await scene('drivers', async () => {
    await ring(null); cam(null);
    await click(page.locator('aside').getByText('Sürücülər'));
    const rows = page.locator('main tbody tr');
    cam(union(await box(page.locator('main thead')), await box(rows.nth(6)))); await sleep(900);
    const col = union(await box(page.locator('main thead th').nth(2)), await box(rows.nth(6).locator('td').nth(2)));
    await ring(col, 10); await sleep(2200);
    await click(page.getByRole('button', { name: /Riskli/ }));
    await ring(null);
  });

  await scene('driver', async () => {
    await click(page.locator('main tbody tr').first());
    cam(null); await sleep(500);
    const g = page.locator('main .grid.grid-cols-2').first();
    cam(await box(g)); await ring(g.locator(':scope > div').first()); await sleep(2000);
    await ring(null);
    const st = card('Hesab çıxarışı');
    cam(await box(st), 1.6); await ring(st);
  });

  await scene('fines', async () => {
    await ring(null); cam(null);
    await go('#/fines');
    await click(page.getByRole('button', { name: 'Cərimə əlavə et' }));
    const modal = page.locator('.anim-sheet');
    cam(await box(modal), 1.6); await sleep(400);
    const sel = modal.locator('select').first();
    await cursorTo(sel);
    const val = await sel.locator('option').nth(3).getAttribute('value');
    await sel.selectOption(val); await sleep(500);
    await modal.locator('input[type="number"]').first().click(); await page.keyboard.type('60', { delay: 120 });
    const green = modal.locator('.bg-emerald-50');
    await ring(green, 14); await sleep(2600);
  });

  await scene('inventory', async () => {
    await ring(null); await page.keyboard.press('Escape'); cam(null); await hideCur();
    await go('#/inventory');
    const g = page.locator('main .grid.grid-cols-2').first();
    cam(await box(g)); await sleep(900);
    await ring(g.locator(':scope > div').nth(1)); await sleep(2200);
    await ring(null);
    const low = page.locator('main tbody tr').filter({ has: page.locator('.text-amber-600, .text-rose-600') }).first();
    cam(union(await box(page.locator('main thead')), await box(page.locator('main tbody tr').nth(8)))); await sleep(700);
    if (await low.count()) await ring(low, 10);
  });

  await scene('sales', async () => {
    await ring(null); cam(null);
    await click(page.locator('aside').getByText('Satış'));
    await click(page.getByRole('button', { name: 'Yeni satış' }));
    const modal = page.locator('.anim-sheet');
    cam(await box(modal), 1.3);
    const sels = modal.locator('select');
    await cursorTo(sels.nth(0)); await sels.nth(0).selectOption({ index: 2 }); await sleep(300);
    await cursorTo(sels.nth(1)); await sels.nth(1).selectOption({ index: 3 }); await sleep(300);
    const qty = modal.locator('input[type="number"]').first();
    await qty.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('5', { delay: 150 });
    await click(modal.getByRole('button', { name: 'Qismən' }));
    await modal.getByPlaceholder('Ödənilən məbləğ ₼').click(); await page.keyboard.type('2000', { delay: 110 });
    await ring(modal.locator('.bg-slate-50').last(), 14); await sleep(900);
    await ring(null);
    await click(modal.getByRole('button', { name: /Satışı təsdiqlə/ }));
    const inv = page.locator('.anim-sheet');
    cam(await box(inv), 1.3); await sleep(1200);
  });

  await scene('customers', async () => {
    await page.keyboard.press('Escape'); await ring(null); cam(null);
    await click(page.locator('aside').getByText('Müştərilər'));
    await click(page.locator('main tbody tr').first());
    const m = page.locator('.anim-sheet');
    cam(await box(m), 1.4); await sleep(600);
    await ring(m.locator('.grid.grid-cols-3'), 14);
  });

  await scene('cash', async () => {
    await page.keyboard.press('Escape'); await ring(null); cam(null);
    await click(page.locator('aside').getByText('Kassa'));
    const g = page.locator('main .grid.grid-cols-2').first();
    cam(await box(g)); await sleep(800);
    await ring(g); await sleep(2400); await ring(null);
    cam(await box(page.locator('main .rounded-2xl').nth(5)), 1.5);
  });

  await scene('reports', async () => {
    await ring(null); cam(null);
    await click(page.locator('aside').getByText('Hesabatlar'));
    const pl = page.locator('main .rounded-2xl').first();
    cam(await box(pl)); await sleep(800); await ring(pl); await sleep(2800);
    await ring(null); cam(null);
    await page.evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' })); await sleep(1100);
    cam(await box(page.locator('main .rounded-2xl').nth(1)), 1.7);
  });

  await scene('morning', async () => {
    await ring(null); cam(null);
    await click(page.locator('aside').getByText('Səhər hesabatı'));
    const phone = page.locator('main .rounded-\\[2\\.5rem\\]');
    cam(await box(phone), 1.6); await sleep(800);
    await ring(phone.locator('.whitespace-pre-wrap'), 16);
  });

  await scene('newbiz', async () => {
    await ring(null); cam(null);
    await click(page.locator('aside').getByText('Yeni biznes'));
    const m = page.locator('.anim-sheet');
    cam(await box(m), 1.5);
    await m.getByPlaceholder('məs. Avtoyuma, Kafe, Ehtiyat hissələri').click();
    await page.keyboard.type('Avtoyuma', { delay: 110 });
    await click(m.getByRole('button', { name: 'Yadda saxla' }));
    cam(null); await sleep(500);
    await ring(page.locator('aside').getByText('Avtoyuma').locator('..'), 12);
    cam(await box(page.locator('aside nav')), 1.4); await sleep(1600); await ring(null); cam(null);
    await click(page.getByRole('button', { name: 'Gəlir' }).first());
    await page.keyboard.type('150', { delay: 120 });
    await click(page.locator('.anim-sheet').getByRole('button', { name: 'Yadda saxla' }));
    const g = page.locator('main .grid.grid-cols-2').first();
    cam(await box(g)); await ring(g);
  });

  await scene('edit', async () => {
    await ring(null); cam(null);
    await click(page.locator('aside').getByText('Satış'));
    await click(page.locator('main tbody tr').nth(1));
    await click(page.locator('.anim-sheet').getByRole('button', { name: 'Redaktə' }));
    const m = page.locator('.anim-sheet');
    cam(await box(m), 1.3); await sleep(1500);
    await page.keyboard.press('Escape'); await ring(null); cam(null);
    await click(page.locator('aside').getByText('Ayarlar'));
    const a = card('Audit jurnalı');
    cam(await box(a), 1.6); await ring(a);
  });

  await scene('mobile', async () => {
    await ring(null); cam(null); await hideCur();
    await page.goto(BASE + 'phone.html'); await sleep(2600);
    const f = page.frames().find((x) => x.url().includes('index.html'));
    await f.evaluate(() => window.scrollTo({ top: 700, behavior: 'smooth' })); await sleep(1400);
    await f.evaluate(() => { window.scrollTo(0, 0); location.hash = '#/payments'; }); await sleep(1500);
    cam(await box(page.locator('.phone')), 1.25);
  });

  await scene('outro', async () => {
    cam(null);
    await page.goto(BASE + 'outro.html'); await sleep(3500);
  });
  await sleep(1500);
  timeline.end = now();
  await cdp.send('Page.stopScreencast');
  await Promise.all(writes);
  fs.writeFileSync(V + '/timeline.json', JSON.stringify({ ...timeline, frames }, null, 0));
  console.log('frames', frames.length, 'duration', (timeline.end - timeline.start).toFixed(1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
