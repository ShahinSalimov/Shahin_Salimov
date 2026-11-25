// Hər səhnə üçün şəffaf subtitr + bölmə adı PNG-si (1920x1080)
const { chromium } = require('playwright'); const fs = require('fs');
const V = process.argv[2]; const scenes = JSON.parse(fs.readFileSync(V + '/scenes.json'));
fs.mkdirSync(V + '/caps', { recursive: true });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const s of scenes) {
    const chip = ['intro', 'mobile', 'outro'].includes(s.id) ? '' : `<div class="chip"><span></span>${s.title}</div>`;
    const sub = s.id === 'outro' ? '' : `<div class="sub">${s.sub}</div>`;
    await p.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet"><style>
      html,body{margin:0;background:transparent;width:1920px;height:1080px;font-family:Inter,sans-serif}
      .chip{position:absolute;left:56px;top:48px;display:flex;align-items:center;gap:14px;background:rgba(15,23,42,.88);color:#fff;font-size:30px;font-weight:700;padding:16px 30px 16px 22px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.25);letter-spacing:-.3px}
      .chip span{width:16px;height:16px;border-radius:50%;background:#facc15;box-shadow:0 0 0 6px rgba(250,204,21,.25)}
      .sub{position:absolute;left:50%;bottom:56px;transform:translateX(-50%);max-width:1500px;width:max-content;text-align:center;background:rgba(15,23,42,.86);color:#fff;font-size:38px;line-height:1.35;font-weight:600;padding:20px 40px;border-radius:22px;box-shadow:0 12px 40px rgba(0,0,0,.3);text-wrap:balance}
    </style></head><body>${chip}${sub}</body></html>`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.screenshot({ path: `${V}/caps/${s.id}.png`, omitBackground: true });
  }
  await b.close(); console.log('captions done');
})();
